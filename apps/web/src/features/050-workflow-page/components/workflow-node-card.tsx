'use client';

/**
 * WorkflowNodeCard — Visual representation of a node in a workflow line.
 *
 * Renders type icon, unit name, description, status indicator, and context badge.
 * All 8 status states supported with correct colors per W001.
 *
 * Phase 2: Canvas Core + Layout — Plan 050
 */

import type { NodeStatusResult } from '@chainglass/positional-graph';

// ─── Status Definitions ──────────────────────────────────────────────

export type NodeStatus =
  | 'pending'
  | 'ready'
  | 'starting'
  | 'agent-accepted'
  | 'waiting-question'
  | 'blocked-error'
  | 'restart-pending'
  | 'complete';

interface StatusConfig {
  color: string;
  bgColor: string;
  label: string;
  icon: string;
  pulse?: boolean;
  animate?: boolean;
}

const STATUS_MAP: Record<NodeStatus, StatusConfig> = {
  pending: { color: '#9CA3AF', bgColor: 'bg-gray-400', label: 'Pending', icon: '○' },
  ready: { color: '#3B82F6', bgColor: 'bg-blue-500', label: 'Ready', icon: '●' },
  starting: {
    color: '#3B82F6',
    bgColor: 'bg-blue-500',
    label: 'Starting...',
    icon: '◉',
    pulse: true,
  },
  'agent-accepted': {
    color: '#3B82F6',
    bgColor: 'bg-blue-500',
    label: 'Running',
    icon: '⟳',
    animate: true,
  },
  'waiting-question': { color: '#8B5CF6', bgColor: 'bg-violet-500', label: 'Question', icon: '?' },
  'blocked-error': { color: '#EF4444', bgColor: 'bg-red-500', label: 'Error', icon: '✕' },
  'restart-pending': { color: '#F59E0B', bgColor: 'bg-amber-500', label: 'Restarting', icon: '↻' },
  complete: { color: '#22C55E', bgColor: 'bg-green-500', label: 'Complete', icon: '✓' },
};

const TYPE_ICONS: Record<string, string> = {
  agent: '🤖',
  code: '⚙️',
  'user-input': '👤',
};

// ─── Props ───────────────────────────────────────────────────────────

export interface WorkflowNodeCardProps {
  nodeId: string;
  unitSlug: string;
  unitType: 'agent' | 'code' | 'user-input';
  status: NodeStatus;
  description?: string;
  contextColor?: 'green' | 'blue' | 'purple' | 'gray';
  isSelected?: boolean;
  isEditable?: boolean;
  onSelect?: () => void;
  onDelete?: () => void;
}

// ─── Component ───────────────────────────────────────────────────────

const CONTEXT_COLORS: Record<string, string> = {
  green: 'bg-green-500',
  blue: 'bg-blue-500',
  purple: 'bg-violet-500',
  gray: 'bg-gray-400',
};

export function WorkflowNodeCard({
  nodeId,
  unitSlug,
  unitType,
  status,
  description,
  contextColor = 'gray',
  isSelected = false,
  isEditable = true,
  onSelect,
  onDelete,
}: WorkflowNodeCardProps) {
  const statusConfig = STATUS_MAP[status] ?? STATUS_MAP.pending;
  const typeIcon = TYPE_ICONS[unitType] ?? '📦';

  return (
    <div
      data-testid={`node-card-${nodeId}`}
      data-status={status}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Backspace' && isEditable && onDelete) {
          e.stopPropagation();
          onDelete();
        }
      }}
      className={`relative min-w-[120px] min-h-[100px] rounded-lg border bg-card p-3 shadow-sm hover:shadow-md transition-shadow cursor-pointer ${
        isSelected ? 'ring-2 ring-primary border-primary' : ''
      }`}
      tabIndex={0}
      // biome-ignore lint/a11y/useSemanticElements: div used for layout + drag handle compatibility
      role="button"
    >
      {/* Header: type icon + name + delete */}
      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-sm" aria-label={unitType}>
          {typeIcon}
        </span>
        <span className="text-sm font-medium truncate">{unitSlug}</span>
        {isEditable && onDelete && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="ml-auto text-xs text-muted-foreground hover:text-destructive"
            title="Delete node"
            data-testid={`node-delete-${nodeId}`}
          >
            ✕
          </button>
        )}
      </div>

      {/* Description */}
      {description && (
        <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{description}</p>
      )}

      {/* Status row */}
      <div className="flex items-center justify-between mt-auto">
        <div className="flex items-center gap-1.5">
          <span
            className={`inline-block w-2 h-2 rounded-full ${statusConfig.bgColor} ${statusConfig.pulse ? 'animate-pulse' : ''} ${statusConfig.animate ? 'animate-spin' : ''}`}
            data-testid={`status-dot-${nodeId}`}
          />
          <span className="text-xs text-muted-foreground">{statusConfig.label}</span>
        </div>

        {/* Context badge */}
        <div
          className={`w-3 h-3 rounded-sm ${CONTEXT_COLORS[contextColor]}`}
          data-testid={`context-badge-${nodeId}`}
          title={`Context: ${contextColor}`}
        />
      </div>
    </div>
  );
}

// ─── Helper: convert NodeStatusResult to card props ──────────────────

export function nodeStatusToCardProps(node: NodeStatusResult): WorkflowNodeCardProps {
  return {
    nodeId: node.nodeId,
    unitSlug: node.unitSlug,
    unitType: node.unitType,
    status: node.status as NodeStatus,
    contextColor: node.noContext ? 'gray' : 'green',
  };
}
