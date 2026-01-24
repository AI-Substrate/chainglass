'use client';

/**
 * AgentNode - Custom ReactFlow node for AI agents
 *
 * Distinct visual style for AI agents in the workflow with
 * a robot icon and agent-specific coloring.
 *
 * Uses React.memo for performance optimization as recommended by ReactFlow.
 */

import type { Node, NodeProps } from '@xyflow/react';
import { Handle, Position } from '@xyflow/react';
import { memo } from 'react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

import type { WorkflowNodeData } from '@/data/fixtures/flow.fixture';

type AgentNodeType = Node<WorkflowNodeData, 'agent'>;

const statusColors: Record<string, string> = {
  pending: 'border-amber-300',
  running: 'border-amber-500 animate-pulse',
  completed: 'border-green-500',
  failed: 'border-red-500',
};

function AgentNodeComponent({ data, selected }: NodeProps<AgentNodeType>) {
  const statusColor = statusColors[data.status ?? 'pending'];

  return (
    <>
      <Handle type="target" position={Position.Left} className="!bg-primary" />
      <Card
        data-node-type="agent"
        className={cn(
          'min-w-[160px] border-2 rounded-xl transition-shadow',
          statusColor,
          selected && 'ring-2 ring-primary'
        )}
      >
        <CardHeader className="p-3 pb-1">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <span className="text-amber-500">🤖</span>
            {data.label}
          </CardTitle>
        </CardHeader>
        {data.description && (
          <CardContent className="p-3 pt-0">
            <p className="text-xs text-muted-foreground">{data.description}</p>
          </CardContent>
        )}
      </Card>
      <Handle type="source" position={Position.Right} className="!bg-primary" />
    </>
  );
}

export const AgentNode = memo(AgentNodeComponent);
