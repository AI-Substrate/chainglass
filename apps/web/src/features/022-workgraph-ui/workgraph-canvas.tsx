/**
 * WorkGraphCanvas Component - Phase 2 (T008) + Phase 3 (T017)
 *
 * Main React Flow canvas for WorkGraph visualization.
 * Supports both read-only and editing modes.
 *
 * Features:
 * - Renders nodes and edges via useWorkGraphFlow hook
 * - Custom WorkGraphNode type
 * - Background pattern, minimap, and controls
 * - Fit view on mount
 * - Phase 3: Optional editing mode with drag-drop, connections
 *
 * @module features/022-workgraph-ui/workgraph-canvas
 */

'use client';

import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  type NodeChange,
  type NodeTypes,
  type OnConnect,
  type OnEdgesChange,
  type OnNodesChange,
  ReactFlow,
  applyNodeChanges,
} from '@xyflow/react';
import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import '@xyflow/react/dist/style.css';

import { cn } from '@/lib/utils';
import { createDragOverHandler, createDropHandler } from './drop-handler';
import {
  type WorkGraphFlowData,
  type WorkGraphRFNode,
  useWorkGraphFlow,
} from './use-workgraph-flow';
import { WorkGraphNode } from './workgraph-node';
import type { IWorkGraphMutationAPI, IWorkGraphUIInstance, Position } from './workgraph-ui.types';

/**
 * Props for WorkGraphCanvas component.
 */
export interface WorkGraphCanvasProps {
  /** Graph data (nodes and edges) */
  data: WorkGraphFlowData;
  /** Additional CSS classes */
  className?: string;
  /** Enable editing mode (drag nodes, connect edges) */
  editable?: boolean;
  /** Instance for mutations (required when editable=true) - accepts full instance or API hook */
  instance?: IWorkGraphUIInstance | IWorkGraphMutationAPI;
  /** Error callback for user feedback */
  onError?: (message: string) => void;
  /** Node change callback (for position updates) */
  onNodesChange?: OnNodesChange;
  /** Edge change callback */
  onEdgesChange?: OnEdgesChange;
  /** Connection callback (for new edges) */
  onConnect?: OnConnect;
}

/**
 * Custom node types for React Flow.
 * Registered once and memoized.
 * Uses type assertion due to React Flow's complex generic constraints.
 */
const nodeTypes = {
  workGraphNode: WorkGraphNode,
} as NodeTypes;

/**
 * Main React Flow canvas for WorkGraph visualization.
 *
 * Renders a graph with custom WorkGraphNode components,
 * background pattern, minimap, and zoom controls.
 *
 * @example
 * ```tsx
 * // Read-only mode
 * <WorkGraphCanvas
 *   data={{ nodes: [...], edges: [...] }}
 *   className="h-[600px]"
 * />
 *
 * // Editing mode
 * <WorkGraphCanvas
 *   data={{ nodes: [...], edges: [...] }}
 *   editable
 *   instance={workGraphUIInstance}
 *   onError={(msg) => toast.error(msg)}
 * />
 * ```
 */
export function WorkGraphCanvas({
  data,
  className,
  editable = false,
  instance,
  onError,
  onNodesChange: onNodesChangeProp,
  onEdgesChange,
  onConnect,
}: WorkGraphCanvasProps): React.ReactElement {
  // Transform data to React Flow format (source of truth from server)
  const { nodes: serverNodes, edges } = useWorkGraphFlow(data);

  // Local state for node positions (allows dragging without server round-trip)
  const [nodes, setNodes] = useState<WorkGraphRFNode[]>(serverNodes);

  // Track if initial layout has been done
  const [hasInitialLayout, setHasInitialLayout] = useState(false);

  // Merge server changes while preserving local positions
  // Only reset positions for NEW nodes, keep existing positions
  useEffect(() => {
    setNodes((currentNodes) => {
      // Build map of current positions
      const currentPositions = new Map(currentNodes.map((n) => [n.id, n.position]));

      // Merge: use current position if node exists, otherwise use server position
      return serverNodes.map((serverNode) => {
        const existingPosition = currentPositions.get(serverNode.id);
        if (existingPosition) {
          return { ...serverNode, position: existingPosition };
        }
        return serverNode;
      });
    });
  }, [serverNodes]);

  // Handle node changes (position, selection, etc.)
  const handleNodesChange = useCallback(
    (changes: NodeChange<WorkGraphRFNode>[]) => {
      setNodes((nds) => applyNodeChanges(changes, nds));
      // Also call prop handler if provided
      onNodesChangeProp?.(changes);
    },
    [onNodesChangeProp]
  );

  // Ref for drop position calculation
  const reactFlowWrapper = useRef<HTMLDivElement>(null);

  // Memoize default edge options
  const defaultEdgeOptions = useMemo(
    () => ({
      type: 'default',
      animated: false,
    }),
    []
  );

  // Create drop handler for drag-drop from toolbox
  const handleDrop = useCallback(
    async (event: React.DragEvent<HTMLDivElement>) => {
      if (!editable || !instance) return;

      const handler = createDropHandler({
        instance,
        getPosition: (e: DragEvent) => {
          // Get wrapper bounds
          const bounds = reactFlowWrapper.current?.getBoundingClientRect();
          if (!bounds) return { x: 0, y: 0 };

          // Simple position calculation without viewport transform
          const position: Position = {
            x: e.clientX - bounds.left,
            y: e.clientY - bounds.top,
          };
          return position;
        },
        onError: onError ?? (() => {}),
      });

      await handler(event.nativeEvent);
    },
    [editable, instance, onError]
  );

  // Create drag over handler
  const handleDragOver = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      if (!editable) return;
      createDragOverHandler()(event.nativeEvent);
    },
    [editable]
  );

  // Determine read-only based on editable prop
  const isReadOnly = !editable;

  return (
    <div
      ref={reactFlowWrapper}
      data-testid="workgraph-canvas"
      data-readonly={isReadOnly ? 'true' : 'false'}
      className={cn('w-full h-full min-h-[400px]', className)}
      onDrop={editable ? handleDrop : undefined}
      onDragOver={editable ? handleDragOver : undefined}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        // Editing mode settings
        nodesDraggable={editable}
        nodesConnectable={editable}
        elementsSelectable={true}
        // Event handlers - always use our internal handler for node changes
        onNodesChange={handleNodesChange}
        onEdgesChange={editable ? onEdgesChange : undefined}
        onConnect={editable ? onConnect : undefined}
        // View options
        fitView
        fitViewOptions={{
          padding: 0.2,
          minZoom: 0.5,
          maxZoom: 1.5,
        }}
        // Interaction options
        panOnDrag
        zoomOnScroll
        zoomOnPinch
        // Editing controls (only enable delete when editable)
        deleteKeyCode={editable ? 'Delete' : null}
        selectionKeyCode={editable ? 'Shift' : null}
      >
        <Background variant={BackgroundVariant.Dots} gap={16} size={1} className="bg-muted/30" />
        <Controls showZoom showFitView showInteractive={editable} position="bottom-right" />
        <MiniMap
          nodeStrokeWidth={3}
          zoomable
          pannable
          position="bottom-left"
          className="bg-card border rounded-lg shadow-sm"
        />
      </ReactFlow>
    </div>
  );
}
