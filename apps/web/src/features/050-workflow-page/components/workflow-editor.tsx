'use client';

/**
 * WorkflowEditor — Client component composing the workflow editor UI.
 *
 * Wraps everything in DndContext for drag-and-drop.
 * Manages local GraphStatusResult state with optimistic mutations.
 *
 * Phase 2+3: Canvas Core + Layout, Drag-and-Drop + Persistence — Plan 050
 */

import type { GraphStatusResult, PGLoadResult } from '@chainglass/positional-graph';
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
import { useWorkflowMutations } from '../hooks/use-workflow-mutations';
import { computeContextBadge } from '../lib/context-badge';
import { computeRelatedNodes } from '../lib/related-nodes';
import type { WorkflowDragData } from '../types';
import { NodePropertiesPanel } from './node-properties-panel';
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
  units,
  worktreePath,
  templateSource,
}: WorkflowEditorProps) {
  const dndId = useId();
  const [graphStatus, setGraphStatus] = useState(initialStatus);
  const [isDragging, setIsDragging] = useState(false);
  const [activeDragData, setActiveDragData] = useState<WorkflowDragData | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const mutations = useWorkflowMutations({
    workspaceSlug,
    graphSlug,
    worktreePath,
    graphStatus,
    onStatusUpdate: setGraphStatus,
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

      if (dragData.type === 'toolbox-unit' && overData.type === 'drop-zone' && overData.lineId) {
        await mutations.addNode(overData.lineId, dragData.unitSlug, overData.position);
      } else if (dragData.type === 'canvas-node' && overData.type === 'drop-zone') {
        await mutations.moveNode(dragData.nodeId, overData.position, overData.lineId);
      }
    },
    [mutations]
  );

  const handleDeleteNode = useCallback(
    async (nodeId: string) => {
      await mutations.removeNode(nodeId);
      if (selectedNodeId === nodeId) setSelectedNodeId(null);
    },
    [mutations, selectedNodeId]
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
          topBar={<WorkflowTempBar graphSlug={graphSlug} templateSource={templateSource} />}
          main={
            <WorkflowCanvas
              graphStatus={graphStatus}
              isDragging={isDragging}
              selectedNodeId={selectedNodeId}
              relatedNodeIds={relatedNodes?.relatedNodeIds}
              onSelectNode={setSelectedNodeId}
              onDeleteNode={handleDeleteNode}
              onAddLine={mutations.addLine}
              onSetLineLabel={mutations.setLineLabel}
              onRemoveLine={mutations.removeLine}
            />
          }
          right={
            selectedNode ? (
              <NodePropertiesPanel
                node={selectedNode}
                contextColor={computeContextBadge(selectedNode, selectedNodeLineIndex)}
                related={relatedNodes?.related ?? []}
                onBack={() => setSelectedNodeId(null)}
              />
            ) : (
              <WorkUnitToolbox units={units} isDragging={isDragging} />
            )
          }
        />
      </div>
      <DragOverlay dropAnimation={null}>
        {activeDragData?.type === 'toolbox-unit' && (
          <div className="px-3 py-2 rounded border bg-card shadow-lg text-xs font-medium opacity-90">
            {activeDragData.unitSlug}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
