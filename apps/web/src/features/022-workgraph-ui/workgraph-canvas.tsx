/**
 * WorkGraphCanvas Component - Phase 2 (T008)
 *
 * Main React Flow canvas for WorkGraph visualization.
 * Phase 2 is read-only (no drag-drop editing).
 *
 * Features:
 * - Renders nodes and edges via useWorkGraphFlow hook
 * - Custom WorkGraphNode type
 * - Background pattern, minimap, and controls
 * - Fit view on mount
 * - Read-only mode (nodesDraggable=false)
 *
 * @module features/022-workgraph-ui/workgraph-canvas
 */

'use client';

import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  type NodeTypes,
  ReactFlow,
} from '@xyflow/react';
import type React from 'react';
import { useMemo } from 'react';
import '@xyflow/react/dist/style.css';

import { cn } from '@/lib/utils';
import { type WorkGraphFlowData, useWorkGraphFlow } from './use-workgraph-flow';
import { WorkGraphNode } from './workgraph-node';

/**
 * Props for WorkGraphCanvas component.
 */
export interface WorkGraphCanvasProps {
  /** Graph data (nodes and edges) */
  data: WorkGraphFlowData;
  /** Additional CSS classes */
  className?: string;
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
 * Phase 2 is read-only - nodes cannot be dragged or edited.
 * Editing features will be added in Phase 3.
 *
 * @example
 * ```tsx
 * <WorkGraphCanvas
 *   data={{ nodes: [...], edges: [...] }}
 *   className="h-[600px]"
 * />
 * ```
 */
export function WorkGraphCanvas({ data, className }: WorkGraphCanvasProps): React.ReactElement {
  // Transform data to React Flow format
  const { nodes, edges } = useWorkGraphFlow(data);

  // Memoize default edge options
  const defaultEdgeOptions = useMemo(
    () => ({
      type: 'default',
      animated: false,
    }),
    []
  );

  return (
    <div
      data-testid="workgraph-canvas"
      data-readonly="true"
      className={cn('w-full h-full min-h-[400px]', className)}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        // Phase 2: Read-only mode
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={true}
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
        // Prevent editing
        deleteKeyCode={null}
        selectionKeyCode={null}
      >
        <Background variant={BackgroundVariant.Dots} gap={16} size={1} className="bg-muted/30" />
        <Controls showZoom showFitView showInteractive={false} position="bottom-right" />
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
