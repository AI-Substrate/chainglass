'use client';

/**
 * WorkflowEditor — Client component composing the workflow editor UI.
 *
 * Wraps everything in DndContext for drag-and-drop.
 * Manages local GraphStatusResult state with optimistic mutations.
 * Integrates Q&A modal, node edit modal, and undo/redo.
 *
 * Phase 2+3+5: Canvas Core + Layout, Drag-and-Drop, Q&A/Edit/Undo — Plan 050
 */

import type {
  GraphStatusResult,
  InputResolution,
  PGLoadResult,
} from '@chainglass/positional-graph';
import type { WorkUnitSummary } from '@chainglass/positional-graph';
import {
  type CollisionDetection,
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  pointerWithin,
  rectIntersection,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { useCallback, useId, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  answerQuestion as answerQuestionAction,
  loadSnapshotData as loadSnapshotDataAction,
  loadWorkflow as loadWorkflowAction,
  restoreSnapshot as restoreSnapshotAction,
  setNodeInput as setNodeInputAction,
  updateNodeConfig as updateNodeConfigAction,
} from '../../../../app/actions/workflow-actions';
import { useUndoRedo } from '../hooks/use-undo-redo';
import { useWorkflowMutations } from '../hooks/use-workflow-mutations';
import { useWorkflowSSE } from '../hooks/use-workflow-sse';
import { computeContextBadge } from '../lib/context-badge';
import { computeRelatedNodes } from '../lib/related-nodes';
import type { WorkflowDragData } from '../types';
import { NodeEditModal } from './node-edit-modal';
import { NodePropertiesPanel } from './node-properties-panel';
import { QAModal } from './qa-modal';
import { WorkUnitToolbox } from './work-unit-toolbox';
import { WorkflowCanvas } from './workflow-canvas';
import { WorkflowEditorLayout } from './workflow-editor-layout';
import { WorkflowTempBar } from './workflow-temp-bar';

export interface WorkflowEditorProps {
  workspaceSlug: string;
  graphSlug: string;
  graphStatus: GraphStatusResult;
  definition: NonNullable<PGLoadResult['definition']>;
  units: WorkUnitSummary[];
  worktreePath?: string;
  templateSource?: string;
}

export function WorkflowEditor({
  workspaceSlug,
  graphSlug,
  graphStatus: initialStatus,
  definition,
  units,
  worktreePath,
  templateSource,
}: WorkflowEditorProps) {
  const dndId = useId();
  const [graphStatus, setGraphStatus] = useState(initialStatus);
  const [isDragging, setIsDragging] = useState(false);
  const [activeDragData, setActiveDragData] = useState<WorkflowDragData | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [qaModalNodeId, setQaModalNodeId] = useState<string | null>(null);
  const [editModalNodeId, setEditModalNodeId] = useState<string | null>(null);

  const mutations = useWorkflowMutations({
    workspaceSlug,
    graphSlug,
    worktreePath,
    graphStatus,
    onStatusUpdate: setGraphStatus,
  });

  // Undo/redo
  const undoRedo = useUndoRedo({
    onRestore: async (snapshot) => {
      const result = await restoreSnapshotAction(
        workspaceSlug,
        graphSlug,
        snapshot.definition,
        snapshot.nodeConfigs,
        worktreePath
      );
      if (result.errors.length > 0) {
        throw new Error(result.errors[0]?.message ?? 'Restore failed');
      }
      if (result.graphStatus) setGraphStatus(result.graphStatus);
    },
  });

  // Helper: load current state as a snapshot for undo/redo
  const loadCurrentSnapshot = useCallback(async () => {
    const result = await loadSnapshotDataAction(workspaceSlug, graphSlug, worktreePath);
    return result.snapshot ?? { definition, nodeConfigs: {} };
  }, [workspaceSlug, graphSlug, worktreePath, definition]);

  // Wrap a mutation to capture snapshot before executing
  const withSnapshot = useCallback(
    <T,>(fn: () => Promise<T>) => {
      return async () => {
        const snap = await loadCurrentSnapshot();
        undoRedo.snapshot(snap);
        return fn();
      };
    },
    [loadCurrentSnapshot, undoRedo]
  );

  // SSE: re-fetch graph status on external changes
  const refreshFromDisk = useCallback(async () => {
    const result = await loadWorkflowAction(workspaceSlug, graphSlug, worktreePath);
    if (result.graphStatus) setGraphStatus(result.graphStatus);
  }, [workspaceSlug, graphSlug, worktreePath]);

  const { startMutation, endMutation } = useWorkflowSSE({
    graphSlug,
    onStructureChange: useCallback(() => {
      undoRedo.invalidate();
      toast.info('Workflow changed externally');
      refreshFromDisk();
    }, [undoRedo, refreshFromDisk]),
    onStatusChange: useCallback(() => {
      refreshFromDisk();
    }, [refreshFromDisk]),
  });

  // Compute related nodes for select-to-reveal dimming
  const relatedNodes = useMemo(
    () => (selectedNodeId ? computeRelatedNodes(selectedNodeId, graphStatus.lines) : null),
    [selectedNodeId, graphStatus.lines]
  );

  // Find selected node for properties panel
  const selectedNode = useMemo(
    () =>
      selectedNodeId
        ? graphStatus.lines.flatMap((l) => l.nodes).find((n) => n.nodeId === selectedNodeId)
        : null,
    [selectedNodeId, graphStatus.lines]
  );

  const selectedNodeLineIndex = useMemo(() => {
    if (!selectedNodeId) return 0;
    return graphStatus.lines.findIndex((l) => l.nodes.some((n) => n.nodeId === selectedNodeId));
  }, [selectedNodeId, graphStatus.lines]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor)
  );

  // Custom collision: prefer pointer-within for precision, fall back to closestCenter
  const collisionDetection: CollisionDetection = useCallback((args) => {
    const pointerHits = pointerWithin(args);
    if (pointerHits.length > 0) return pointerHits;
    const rectHits = rectIntersection(args);
    if (rectHits.length > 0) return rectHits;
    return closestCenter(args);
  }, []);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setIsDragging(true);
    setActiveDragData((event.active.data.current as WorkflowDragData) ?? null);
  }, []);

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      setIsDragging(false);
      setActiveDragData(null);
      const { active, over } = event;
      if (!over) return;

      const dragData = active.data.current as WorkflowDragData | undefined;
      if (!dragData) return;

      const overData = over.data.current as
        | { type: string; lineId?: string; position?: number }
        | undefined;
      if (!overData) return;

      // Capture snapshot before mutation + suppress self-events
      const snap = await loadCurrentSnapshot();
      undoRedo.snapshot(snap);
      startMutation();
      try {
        if (dragData.type === 'toolbox-unit' && overData.type === 'drop-zone' && overData.lineId) {
          await mutations.addNode(overData.lineId, dragData.unitSlug, overData.position);
        } else if (dragData.type === 'canvas-node' && overData.type === 'drop-zone') {
          await mutations.moveNode(dragData.nodeId, overData.position, overData.lineId);
        }
      } finally {
        endMutation();
      }
    },
    [mutations, loadCurrentSnapshot, undoRedo, startMutation, endMutation]
  );

  const handleDeleteNode = useCallback(
    async (nodeId: string) => {
      const snap = await loadCurrentSnapshot();
      undoRedo.snapshot(snap);
      startMutation();
      try {
        await mutations.removeNode(nodeId);
      } finally {
        endMutation();
      }
      if (selectedNodeId === nodeId) setSelectedNodeId(null);
    },
    [mutations, selectedNodeId, loadCurrentSnapshot, undoRedo, startMutation, endMutation]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Backspace' && selectedNodeId) {
        e.preventDefault();
        handleDeleteNode(selectedNodeId);
      }
    },
    [selectedNodeId, handleDeleteNode]
  );

  return (
    <DndContext
      id={dndId}
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      {/* biome-ignore lint/a11y/noNoninteractiveTabindex: keyboard delete needs focus */}
      <div onKeyDown={handleKeyDown} tabIndex={0} className="h-full outline-none">
        <WorkflowEditorLayout
          topBar={
            <WorkflowTempBar
              graphSlug={graphSlug}
              templateSource={templateSource}
              undoDepth={undoRedo.undoDepth}
              redoDepth={undoRedo.redoDepth}
              canUndo={undoRedo.canUndo}
              canRedo={undoRedo.canRedo}
              onUndo={async () => {
                const current = await loadCurrentSnapshot();
                await undoRedo.undo(current);
              }}
              onRedo={async () => {
                const current = await loadCurrentSnapshot();
                await undoRedo.redo(current);
              }}
            />
          }
          main={
            <WorkflowCanvas
              graphStatus={graphStatus}
              isDragging={isDragging}
              selectedNodeId={selectedNodeId}
              relatedNodeIds={relatedNodes?.relatedNodeIds}
              onSelectNode={setSelectedNodeId}
              onDeleteNode={handleDeleteNode}
              onAddLine={async (label?: string) => {
                const snap = await loadCurrentSnapshot();
                undoRedo.snapshot(snap);
                startMutation();
                try {
                  await mutations.addLine(label);
                } finally {
                  endMutation();
                }
              }}
              onSetLineLabel={mutations.setLineLabel}
              onRemoveLine={async (lineId: string) => {
                const snap = await loadCurrentSnapshot();
                undoRedo.snapshot(snap);
                startMutation();
                try {
                  await mutations.removeLine(lineId);
                } finally {
                  endMutation();
                }
              }}
              onQuestionClick={(nodeId) => setQaModalNodeId(nodeId)}
            />
          }
          right={
            selectedNode ? (
              <NodePropertiesPanel
                node={selectedNode}
                contextColor={computeContextBadge(selectedNode, selectedNodeLineIndex)}
                related={relatedNodes?.related ?? []}
                onBack={() => setSelectedNodeId(null)}
                onEditProperties={() => setEditModalNodeId(selectedNodeId)}
              />
            ) : (
              <WorkUnitToolbox units={units} isDragging={isDragging} />
            )
          }
        />
      </div>
      <DragOverlay dropAnimation={null}>
        {activeDragData?.type === 'toolbox-unit' && (
          <div className="px-3.5 py-2.5 rounded-xl border border-primary/20 bg-card shadow-[0_8px_30px_-8px_rgba(0,0,0,0.15)] text-xs font-semibold tracking-tight">
            {activeDragData.unitSlug}
          </div>
        )}
      </DragOverlay>

      {/* Q&A Modal */}
      {qaModalNodeId &&
        (() => {
          const node = graphStatus.lines
            .flatMap((l) => l.nodes)
            .find((n) => n.nodeId === qaModalNodeId);
          if (!node?.pendingQuestion) return null;
          return (
            <QAModal
              question={node.pendingQuestion}
              nodeId={qaModalNodeId}
              onAnswer={async ({ structured, freeform }) => {
                const answer = freeform ? { value: structured, notes: freeform } : structured;
                const result = await answerQuestionAction(
                  workspaceSlug,
                  graphSlug,
                  qaModalNodeId,
                  node.pendingQuestion?.questionId ?? '',
                  answer,
                  worktreePath
                );
                if (result.graphStatus) setGraphStatus(result.graphStatus);
                setQaModalNodeId(null);
              }}
              onClose={() => setQaModalNodeId(null)}
            />
          );
        })()}

      {/* Node Edit Modal */}
      {editModalNodeId &&
        (() => {
          const node = graphStatus.lines
            .flatMap((l) => l.nodes)
            .find((n) => n.nodeId === editModalNodeId);
          if (!node) return null;
          return (
            <NodeEditModal
              node={node}
              graphStatus={graphStatus}
              onSave={async (updates) => {
                if (updates.description !== undefined || updates.orchestratorSettings) {
                  const configResult = await updateNodeConfigAction(
                    workspaceSlug,
                    graphSlug,
                    editModalNodeId,
                    {
                      description: updates.description,
                      orchestratorSettings: updates.orchestratorSettings,
                    },
                    worktreePath
                  );
                  if (configResult.graphStatus) setGraphStatus(configResult.graphStatus);
                }
                if (updates.inputs) {
                  for (const [inputName, source] of Object.entries(updates.inputs)) {
                    const inputResult = await setNodeInputAction(
                      workspaceSlug,
                      graphSlug,
                      editModalNodeId,
                      inputName,
                      source,
                      worktreePath
                    );
                    if (inputResult.graphStatus) setGraphStatus(inputResult.graphStatus);
                  }
                }
                setEditModalNodeId(null);
              }}
              onClose={() => setEditModalNodeId(null)}
            />
          );
        })()}
    </DndContext>
  );
}
