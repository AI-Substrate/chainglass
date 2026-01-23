'use client';

/**
 * PhaseNode - Custom ReactFlow node for workflow phases
 *
 * Distinct visual style for phases in the workflow with
 * a header accent and phase-specific coloring.
 *
 * Uses React.memo for performance optimization as recommended by ReactFlow.
 */

import type { Node, NodeProps } from '@xyflow/react';
import { Handle, Position } from '@xyflow/react';
import { memo } from 'react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

import type { WorkflowNodeData } from '@/data/fixtures/flow.fixture';

type PhaseNodeType = Node<WorkflowNodeData, 'phase'>;

const statusColors: Record<string, string> = {
  pending: 'bg-muted',
  running: 'bg-blue-500/10',
  completed: 'bg-green-500/10',
  failed: 'bg-red-500/10',
};

function PhaseNodeComponent({ data, selected }: NodeProps<PhaseNodeType>) {
  const statusColor = statusColors[data.status ?? 'pending'];

  return (
    <>
      <Handle type="target" position={Position.Left} className="!bg-primary" />
      <Card
        data-node-type="phase"
        className={cn(
          'min-w-[180px] overflow-hidden transition-shadow',
          selected && 'ring-2 ring-primary'
        )}
      >
        <CardHeader className={cn('p-3 pb-1', statusColor)}>
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <span className="text-purple-600 dark:text-purple-400">◆</span>
            {data.label}
          </CardTitle>
        </CardHeader>
        {data.description && (
          <CardContent className="p-3 pt-2">
            <p className="text-xs text-muted-foreground">{data.description}</p>
          </CardContent>
        )}
      </Card>
      <Handle type="source" position={Position.Right} className="!bg-primary" />
    </>
  );
}

export const PhaseNode = memo(PhaseNodeComponent);
