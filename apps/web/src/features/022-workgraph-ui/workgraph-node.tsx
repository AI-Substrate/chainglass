/**
 * WorkGraphNode Component - Phase 2 (T004)
 *
 * Custom React Flow node for WorkGraph visualization.
 * Per CD-02: User-input nodes have distinct visual treatment.
 *
 * Features:
 * - Displays node ID and unit type
 * - Shows status via StatusIndicator
 * - Special handling for start nodes and user-input nodes
 * - Selected state visualization
 * - Connection handles for graph edges
 *
 * @module features/022-workgraph-ui/workgraph-node
 */

'use client';

import { cn } from '@/lib/utils';
import { Handle, type NodeProps, Position } from '@xyflow/react';
import { Loader2, Trash2 } from 'lucide-react';
import type React from 'react';
import { memo } from 'react';
import { StatusIndicator } from './status-indicator';
import type { WorkGraphNodeData } from './use-workgraph-flow';
import { useWorkGraphNodeActions } from './workgraph-node-actions-context';

/**
 * Props for WorkGraphNode component.
 * Uses NodeProps with Node type, accessing data.
 */
export type WorkGraphNodeProps = NodeProps;

/**
 * User input icon for user-input nodes.
 * Per CD-02: Distinct visual treatment for user-input nodes.
 */
function UserInputIcon({ className }: { className?: string }) {
  return (
    <svg
      data-testid="user-input-icon"
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
      />
    </svg>
  );
}

/**
 * Detect if a node is a user-input type.
 * Per CD-02: User-input nodes skip running state and need distinct treatment.
 */
function isUserInputNode(unit?: string): boolean {
  return unit?.includes('user-input') ?? false;
}

/**
 * Get the display label for a node.
 */
function getNodeLabel(data: WorkGraphNodeData): string {
  if (data.type === 'start') {
    return 'Start';
  }
  return data.unit ?? 'Unknown';
}

/**
 * Custom React Flow node for WorkGraph visualization.
 *
 * Renders a styled card with:
 * - Node ID as title
 * - Unit type or "Start" label
 * - Status indicator
 * - User-input icon for user-input nodes
 * - Selection ring when selected
 *
 * @example
 * ```tsx
 * const nodeTypes = { workGraphNode: WorkGraphNode };
 * <ReactFlow nodeTypes={nodeTypes} ... />
 * ```
 */
export const WorkGraphNode = memo(function WorkGraphNode({
  data: rawData,
  selected,
}: WorkGraphNodeProps): React.ReactElement {
  const data = rawData as WorkGraphNodeData;
  const { removeNode, loadingNodes } = useWorkGraphNodeActions();
  const isUserInput = isUserInputNode(data.unit);
  const label = getNodeLabel(data);
  const isLoading = loadingNodes.has(data.id);

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent node selection
    removeNode(data.id);
  };

  return (
    <div
      data-testid="workgraph-node"
      className={cn(
        'group relative px-4 py-3 rounded-lg border bg-card text-card-foreground shadow-sm',
        'min-w-[160px] max-w-[200px]',
        // Selected state
        selected && 'ring-2 ring-primary ring-offset-2',
        // Status-specific borders
        data.status === 'blocked-error' && 'border-red-500',
        data.status === 'waiting-question' && 'border-purple-500',
        data.status === 'running' && 'border-yellow-500',
        data.status === 'complete' && 'border-green-500'
      )}
    >
      {/* Target handle (top) */}
      <Handle type="target" position={Position.Top} className="!w-3 !h-3 !bg-muted-foreground" />

      {/* Delete button - visible on hover or when selected */}
      <button
        type="button"
        onClick={handleDelete}
        disabled={isLoading}
        className={cn(
          'absolute -top-2 -right-2 w-5 h-5 rounded-full',
          'bg-destructive text-destructive-foreground',
          'flex items-center justify-center',
          'opacity-0 group-hover:opacity-100 transition-opacity',
          'hover:bg-destructive/90 disabled:opacity-50',
          selected && 'opacity-100'
        )}
        title="Delete node"
      >
        {isLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
      </button>

      {/* Header with status and optional user-input icon */}
      <div className="flex items-center justify-between mb-2">
        <StatusIndicator status={data.status} size="sm" />
        {isUserInput && <UserInputIcon className="w-4 h-4 text-muted-foreground" />}
      </div>

      {/* Node ID */}
      <div className="font-medium text-sm truncate" title={data.id}>
        {data.id}
      </div>

      {/* Unit type / label */}
      <div className="text-xs text-muted-foreground truncate" title={label}>
        {label}
      </div>

      {/* Source handle (bottom) */}
      <Handle type="source" position={Position.Bottom} className="!w-3 !h-3 !bg-muted-foreground" />
    </div>
  );
});

// Display name for React DevTools
WorkGraphNode.displayName = 'WorkGraphNode';
