'use client';

/**
 * WorkflowNodeCard — Visual representation of a node in a workflow line.
 *
 * Renders type icon, unit name, description, status indicator, context badge,
 * noContext lock, gate chips, and supports dimming for select-to-reveal.
 *
 * Phase 2+4 — Plan 050
 */

import type { NodeStatusResult } from '@chainglass/positional-graph';
import { computeContextBadge } from '../lib/context-badge';
import { GateChip } from './gate-chip';

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
  pending: {
    color: '#9CA3AF',
    bgColor: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
    label: 'Pending',
    icon: '○',
  },
  ready: {
    color: '#3B82F6',
    bgColor: 'bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400',
    label: 'Ready',
    icon: '●',
  },
  starting: {
    color: '#3B82F6',
    bgColor: 'bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400',
    label: 'Starting...',
    icon: '◉',
    pulse: true,
  },
  'agent-accepted': {
    color: '#3B82F6',
    bgColor: 'bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400',
    label: 'Running',
    icon: '⟳',
    animate: true,
  },
  'waiting-question': {
    color: '#8B5CF6',
    bgColor: 'bg-violet-50 text-violet-600 dark:bg-violet-950 dark:text-violet-400',
    label: 'Question',
    icon: '?',
  },
  'blocked-error': {
    color: '#EF4444',
    bgColor: 'bg-red-50 text-red-600 dark:bg-red-950 dark:text-red-400',
    label: 'Error',
    icon: '✕',
  },
  'restart-pending': {
    color: '#F59E0B',
    bgColor: 'bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-400',
    label: 'Restarting',
    icon: '↻',
  },
  complete: {
    color: '#22C55E',
    bgColor: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400',
    label: 'Complete',
    icon: '✓',
  },
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
  noContext?: boolean;
  /** Full node status for gate chip rendering */
  nodeStatus?: NodeStatusResult;
  isSelected?: boolean;
  isEditable?: boolean;
  isDimmed?: boolean;
  onSelect?: () => void;
  onDelete?: () => void;
  onQuestionClick?: () => void;
}

// ─── Component ───────────────────────────────────────────────────────

const CONTEXT_COLORS: Record<string, string> = {
  green: 'bg-green-500',
  blue: 'bg-blue-500',
  purple: 'bg-violet-500',
  gray: 'bg-gray-400',
};

const CONTEXT_BOTTOM_BORDERS: Record<string, string> = {
  green: 'border-b-emerald-400',
  blue: 'border-b-blue-400',
  purple: 'border-b-violet-400',
  gray: 'border-b-gray-300 dark:border-b-gray-600',
};

export function WorkflowNodeCard({
  nodeId,
  unitSlug,
  unitType,
  status,
  description,
  contextColor = 'gray',
  noContext = false,
  nodeStatus,
  isSelected = false,
  isEditable = true,
  isDimmed = false,
  onSelect,
  onDelete,
  onQuestionClick,
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
      className={`group relative min-w-[180px] rounded-xl border border-gray-200 dark:border-gray-700 border-b-[3px] ${CONTEXT_BOTTOM_BORDERS[contextColor]} bg-white dark:bg-gray-900 p-4 transition-all duration-200 cursor-pointer shadow-[0_2px_8px_-2px_rgba(0,0,0,0.1),0_1px_3px_-1px_rgba(0,0,0,0.06)] ${
        isSelected
          ? 'ring-2 ring-blue-400 border-blue-400 shadow-[0_4px_16px_-4px_rgba(59,130,246,0.3)]'
          : 'hover:shadow-[0_4px_16px_-4px_rgba(0,0,0,0.12)] hover:-translate-y-[1px]'
      } ${isDimmed ? 'opacity-35 pointer-events-none' : ''}`}
      tabIndex={0}
      // biome-ignore lint/a11y/useSemanticElements: div used for layout + drag handle compatibility
      role="button"
    >
      {/* Header: type icon + lock + name + delete */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-base shrink-0" aria-label={unitType}>
          {typeIcon}
        </span>
        {noContext && (
          <span className="text-sm" title="Isolated — no context" data-testid={`lock-${nodeId}`}>
            🔒
          </span>
        )}
        <span className="text-sm font-semibold truncate tracking-tight">{unitSlug}</span>
        {isEditable && onDelete && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="ml-auto text-sm text-muted-foreground/0 group-hover:text-muted-foreground hover:!text-destructive transition-colors"
            title="Delete node"
            data-testid={`node-delete-${nodeId}`}
          >
            ✕
          </button>
        )}
      </div>

      {/* Description */}
      {description && (
        <p className="text-sm text-muted-foreground/70 line-clamp-2 mb-3">{description}</p>
      )}

      {/* Status row — bottom indicator style */}
      <div className="flex items-center justify-between mt-2">
        <div
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${statusConfig.bgColor} ${
            status === 'waiting-question' && onQuestionClick
              ? 'cursor-pointer hover:ring-2 hover:ring-violet-300 transition-all'
              : ''
          }`}
          onClick={(e) => {
            if (status === 'waiting-question' && onQuestionClick) {
              e.stopPropagation();
              onQuestionClick();
            }
          }}
          onKeyDown={(e) => {
            if (status === 'waiting-question' && onQuestionClick && e.key === 'Enter') {
              e.stopPropagation();
              onQuestionClick();
            }
          }}
          role={status === 'waiting-question' && onQuestionClick ? 'button' : undefined}
          tabIndex={status === 'waiting-question' && onQuestionClick ? 0 : undefined}
          title={status === 'waiting-question' ? 'Click to answer question' : undefined}
          data-testid={status === 'waiting-question' ? `qa-badge-${nodeId}` : undefined}
        >
          <span
            className={`inline-block w-2 h-2 rounded-full bg-current ${statusConfig.pulse ? 'animate-pulse' : ''} ${statusConfig.animate ? 'animate-spin' : ''}`}
            data-testid={`status-dot-${nodeId}`}
          />
          {statusConfig.label}
        </div>

        {/* Context badge */}
        <div
          className={`w-3 h-3 rounded-full ${CONTEXT_COLORS[contextColor]} opacity-60`}
          data-testid={`context-badge-${nodeId}`}
          title={`Context: ${contextColor}`}
        />
      </div>

      {/* Gate chip for blocked nodes */}
      {nodeStatus && <GateChip node={nodeStatus} />}
    </div>
  );
}

// ─── Helper: convert NodeStatusResult to card props ──────────────────

export function nodeStatusToCardProps(
  node: NodeStatusResult,
  lineIndex: number
): WorkflowNodeCardProps {
  return {
    nodeId: node.nodeId,
    unitSlug: node.unitSlug,
    unitType: node.unitType,
    status: node.status as NodeStatus,
    contextColor: computeContextBadge(node, lineIndex),
    noContext: node.noContext,
    nodeStatus: node,
  };
}
