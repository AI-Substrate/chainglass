'use client';

/**
 * WorkflowNode - Custom ReactFlow node for workflow steps
 *
 * Base node component for workflow visualization with status indicator
 * and consistent styling using shadcn Card.
 *
 * Uses React.memo for performance optimization as recommended by ReactFlow.
 */

import type { Node, NodeProps } from '@xyflow/react';
import { Handle, Position } from '@xyflow/react';
import { memo } from 'react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

import type { WorkflowNodeData } from '@/data/fixtures/flow.fixture';

type WorkflowNodeType = Node<WorkflowNodeData, 'workflow'>;

const statusColors: Record<string, string> = {
  pending: 'border-l-muted-foreground',
  running: 'border-l-blue-500',
  completed: 'border-l-green-500',
  failed: 'border-l-red-500',
};

function WorkflowNodeComponent({ data, selected }: NodeProps<WorkflowNodeType>) {
  const statusColor = statusColors[data.status ?? 'pending'];

  return (
    <>
      <Handle type="target" position={Position.Left} className="!bg-primary" />
      <Card
        data-node-type="workflow"
        className={cn(
          'min-w-[150px] border-l-4 transition-shadow',
          statusColor,
          selected && 'ring-2 ring-primary'
        )}
      >
        <CardHeader className="p-3 pb-1">
          <CardTitle className="text-sm font-medium">{data.label}</CardTitle>
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

export const WorkflowNode = memo(WorkflowNodeComponent);
