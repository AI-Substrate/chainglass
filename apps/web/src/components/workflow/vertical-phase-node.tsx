'use client';

/**
 * VerticalPhaseNode - ReactFlow node for vertical workflow layouts
 *
 * Designed for run execution views with top-to-bottom flow.
 * Uses Position.Top for target handle and Position.Bottom for source handle.
 *
 * Supports all 7 PhaseRunStatus values with appropriate colors and animations.
 *
 * @see Plan 011: UI Mockups
 */

import type { Node, NodeProps } from '@xyflow/react';
import { Handle, Position } from '@xyflow/react';
import { memo } from 'react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/status-badge';
import { cn } from '@/lib/utils';

import type { Facilitator, PhaseRunStatus } from '@/data/fixtures/workflows.fixture';

/**
 * Data shape for vertical phase nodes
 */
export interface VerticalPhaseNodeData {
  label: string;
  description?: string;
  status: PhaseRunStatus;
  facilitator?: Facilitator;
  hasQuestion?: boolean;
  order?: number;
  [key: string]: unknown;
}

type VerticalPhaseNodeType = Node<VerticalPhaseNodeData, 'vertical-phase'>;

/**
 * Status-based background colors for the node card
 */
const statusBgColors: Record<PhaseRunStatus, string> = {
  pending: 'bg-gray-50 dark:bg-gray-900/50',
  ready: 'bg-amber-50 dark:bg-amber-900/20',
  active: 'bg-blue-50 dark:bg-blue-900/20',
  blocked: 'bg-orange-50 dark:bg-orange-900/20',
  accepted: 'bg-lime-50 dark:bg-lime-900/20',
  complete: 'bg-emerald-50 dark:bg-emerald-900/20',
  failed: 'bg-red-50 dark:bg-red-900/20',
};

/**
 * Status-based border colors
 */
const statusBorderColors: Record<PhaseRunStatus, string> = {
  pending: 'border-gray-200 dark:border-gray-700',
  ready: 'border-amber-300 dark:border-amber-700',
  active: 'border-blue-400 dark:border-blue-600',
  blocked: 'border-orange-400 dark:border-orange-600',
  accepted: 'border-lime-400 dark:border-lime-600',
  complete: 'border-emerald-400 dark:border-emerald-600',
  failed: 'border-red-400 dark:border-red-600',
};

/**
 * Facilitator indicator icons
 */
const facilitatorIcons: Record<Facilitator, string> = {
  agent: '🤖',
  orchestrator: '👤',
};

function VerticalPhaseNodeComponent({ data, selected }: NodeProps<VerticalPhaseNodeType>) {
  const status = data.status ?? 'pending';
  const facilitator = data.facilitator ?? 'agent';
  const isActive = status === 'active';
  const isBlocked = status === 'blocked';

  return (
    <>
      {/* Target handle at top for incoming edges */}
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-primary !w-3 !h-3 !border-2 !border-background"
      />

      <Card
        data-node-type="vertical-phase"
        className={cn(
          'min-w-[220px] max-w-[280px] overflow-hidden transition-all duration-200',
          'border-2',
          statusBgColors[status],
          statusBorderColors[status],
          selected && 'ring-2 ring-primary ring-offset-2',
          isActive && 'animate-pulse-subtle shadow-lg shadow-blue-500/20',
          isBlocked && 'shadow-lg shadow-orange-500/20'
        )}
      >
        <CardHeader className="p-3 pb-2">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <span className="text-muted-foreground" title={`${facilitator} phase`}>
                {facilitatorIcons[facilitator]}
              </span>
              {data.label}
            </CardTitle>
            <StatusBadge status={status} size="sm" showIcon />
          </div>
        </CardHeader>

        {(data.description || data.hasQuestion) && (
          <CardContent className="p-3 pt-0 space-y-2">
            {data.description && (
              <p className="text-xs text-muted-foreground line-clamp-2">{data.description}</p>
            )}
            {data.hasQuestion && isBlocked && (
              <div className="flex items-center gap-1 text-xs text-orange-600 dark:text-orange-400 font-medium">
                <span>⚠️</span>
                <span>Waiting for input</span>
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {/* Source handle at bottom for outgoing edges */}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-primary !w-3 !h-3 !border-2 !border-background"
      />
    </>
  );
}

export const VerticalPhaseNode = memo(VerticalPhaseNodeComponent);

/**
 * Node type configuration for ReactFlow
 * Memoize outside component to prevent re-renders per ReactFlow best practices.
 */
export const VERTICAL_NODE_TYPES = {
  'vertical-phase': VerticalPhaseNode,
} as const;
