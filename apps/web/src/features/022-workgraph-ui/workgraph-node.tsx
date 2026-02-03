/**
 * WorkGraphNode Component - Redesigned with Output Ports
 *
 * Custom React Flow node for WorkGraph visualization.
 * Shows unit title, status area, and output ports with type badges.
 *
 * @module features/022-workgraph-ui/workgraph-node
 */

'use client';

import { cn } from '@/lib/utils';
import { Handle, type NodeProps, Position } from '@xyflow/react';
import { Bot, Code, FileOutput, Loader2, Trash2, UserPen } from 'lucide-react';
import type React from 'react';
import { memo } from 'react';
import { StatusIndicator } from './status-indicator';
import type { NodePortDeclaration, WorkGraphNodeData } from './use-workgraph-flow';
import { useWorkGraphNodeActions } from './workgraph-node-actions-context';
import type { NodeStatus } from './workgraph-ui.types';

/**
 * Props for WorkGraphNode component.
 */
export type WorkGraphNodeProps = NodeProps;

/**
 * Human-readable status labels.
 */
const statusLabels: Record<NodeStatus, string> = {
  pending: 'Pending',
  ready: 'Ready',
  disconnected: 'Disconnected',
  running: 'Running',
  'waiting-question': 'Awaiting Input',
  'blocked-error': 'Error',
  complete: 'Complete',
};

/**
 * Status-specific background tints for the status area.
 */
const statusBgTints: Record<NodeStatus, string> = {
  pending: 'bg-muted/40',
  ready: 'bg-blue-500/8',
  disconnected: 'bg-orange-500/8',
  running: 'bg-yellow-500/8',
  'waiting-question': 'bg-purple-500/8',
  'blocked-error': 'bg-red-500/8',
  complete: 'bg-green-500/8',
};

/**
 * Unit type icon component.
 */
function UnitTypeIcon({ unitType, className }: { unitType?: string; className?: string }) {
  switch (unitType) {
    case 'agent':
      return <Bot className={className} data-testid="agent-icon" />;
    case 'code':
      return <Code className={className} data-testid="code-icon" />;
    case 'user-input':
      return <UserPen className={className} data-testid="user-input-icon" />;
    default:
      return null;
  }
}

/**
 * Unit type badge with icon and label.
 */
function UnitTypeBadge({ unitType }: { unitType?: 'agent' | 'code' | 'user-input' }) {
  if (!unitType) return null;

  const labels: Record<string, string> = {
    agent: 'Agent',
    code: 'Code',
    'user-input': 'User Input',
  };

  const colors: Record<string, string> = {
    agent: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
    code: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    'user-input': 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium',
        colors[unitType]
      )}
    >
      <UnitTypeIcon unitType={unitType} className="h-2.5 w-2.5" />
      {labels[unitType]}
    </span>
  );
}

/**
 * Data type badge for output ports.
 */
function DataTypeBadge({ port }: { port: NodePortDeclaration }) {
  if (port.type === 'file') {
    return (
      <span className="inline-flex items-center gap-0.5 rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
        file
      </span>
    );
  }

  const colorMap: Record<string, string> = {
    text: 'bg-sky-500/10 text-sky-600 dark:text-sky-400',
    json: 'bg-orange-500/10 text-orange-600 dark:text-orange-400',
    number: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400',
    boolean: 'bg-pink-500/10 text-pink-600 dark:text-pink-400',
  };

  const label = port.dataType ?? 'data';
  const color = colorMap[label] ?? 'bg-muted text-muted-foreground';

  return (
    <span
      className={cn(
        'inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium',
        color
      )}
    >
      {label}
    </span>
  );
}

/**
 * Single output row (informational, no handle).
 */
function OutputRow({ port }: { port: NodePortDeclaration }) {
  const isFile = port.type === 'file';

  return (
    <div className="flex items-center gap-2 py-1">
      {/* Port icon */}
      {isFile ? (
        <FileOutput className="h-3 w-3 flex-shrink-0 text-amber-500" />
      ) : (
        <div className="h-2 w-2 flex-shrink-0 rounded-full bg-sky-400" />
      )}

      {/* Port name */}
      <span className="flex-1 truncate text-[11px] text-muted-foreground">{port.name}</span>

      {/* Type badge */}
      <DataTypeBadge port={port} />
    </div>
  );
}

/**
 * Custom React Flow node for WorkGraph visualization.
 *
 * Redesigned layout:
 * - Header: unit title + type badge + delete button
 * - Status area: centered status indicator with label
 * - Outputs section: per-output rows with type badges and handles
 */
export const WorkGraphNode = memo(function WorkGraphNode({
  data: rawData,
  selected,
}: WorkGraphNodeProps): React.ReactElement {
  const data = rawData as WorkGraphNodeData;
  const { removeNode, loadingNodes } = useWorkGraphNodeActions();
  const isStart = data.type === 'start';
  const isLoading = loadingNodes.has(data.id);
  const outputs = data.outputs ?? [];
  const hasOutputs = outputs.length > 0;

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    removeNode(data.id);
  };

  // Display title: unit slug formatted nicely, or "Start"
  const title = isStart ? 'Start' : (data.unit ?? 'Unknown');

  return (
    <div
      data-testid="workgraph-node"
      className={cn(
        'group relative rounded-xl border bg-card text-card-foreground shadow-md',
        'min-w-[240px] max-w-[280px]',
        'transition-shadow hover:shadow-lg',
        // Selected state
        selected && 'ring-2 ring-primary ring-offset-2 ring-offset-background',
        // Status-specific border accents
        data.status === 'blocked-error' && 'border-red-500/50',
        data.status === 'waiting-question' && 'border-purple-500/50',
        data.status === 'running' && 'border-yellow-500/50',
        data.status === 'complete' && 'border-green-500/50'
      )}
    >
      {/* Target handle (top) */}
      {!isStart && (
        <Handle
          type="target"
          position={Position.Top}
          className="!w-3 !h-3 !bg-muted-foreground !border-2 !border-background"
        />
      )}

      {/* Delete button */}
      {!isStart && (
        <button
          type="button"
          onClick={handleDelete}
          disabled={isLoading}
          className={cn(
            'absolute -top-2 -right-2 z-10 w-5 h-5 rounded-full',
            'bg-destructive text-destructive-foreground',
            'flex items-center justify-center',
            'opacity-0 group-hover:opacity-100 transition-opacity',
            'hover:bg-destructive/90 disabled:opacity-50',
            selected && 'opacity-100'
          )}
          title="Delete node"
        >
          {isLoading ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <Trash2 className="w-3 h-3" />
          )}
        </button>
      )}

      {/* ── Header ── */}
      <div className="px-4 pt-3 pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold leading-tight" title={title}>
              {title}
            </div>
            {!isStart && (
              <div className="mt-1">
                <UnitTypeBadge unitType={data.unitType} />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Status Area ── */}
      <div
        className={cn(
          'mx-2 rounded-lg px-3 py-2 flex items-center justify-center gap-2',
          statusBgTints[data.status]
        )}
      >
        <StatusIndicator status={data.status} size="sm" />
        <span className="text-xs font-medium">{statusLabels[data.status]}</span>
      </div>

      {/* ── Outputs Section ── */}
      {hasOutputs && (
        <div className="mt-2 border-t border-border/50">
          <div className="px-4 pt-2 pb-1">
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
              Outputs
            </span>
          </div>
          <div className="px-3 pb-3">
            {outputs.map((port) => (
              <OutputRow key={port.name} port={port} />
            ))}
          </div>
        </div>
      )}

      {/* Single source handle (bottom) */}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-3 !h-3 !bg-muted-foreground !border-2 !border-background"
      />
    </div>
  );
});

WorkGraphNode.displayName = 'WorkGraphNode';
