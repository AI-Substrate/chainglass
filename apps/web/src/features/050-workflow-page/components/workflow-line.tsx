'use client';

/**
 * WorkflowLine — A single line in the workflow canvas.
 *
 * Renders as a horizontal row with numbered header, label, and node cards.
 *
 * Phase 2: Canvas Core + Layout — Plan 050
 */

import type { LineStatusResult, NodeStatusResult } from '@chainglass/positional-graph';
import { EmptyLinePlaceholder } from './empty-states';
import { WorkflowNodeCard, nodeStatusToCardProps } from './workflow-node-card';

export interface WorkflowLineProps {
  line: LineStatusResult;
  lineIndex: number;
}

function lineStateBorder(line: LineStatusResult): string {
  if (line.complete) return 'border-l-green-500';
  if (line.runningNodes.length > 0) return 'border-l-blue-500';
  if (line.blockedNodes.length > 0) return 'border-l-red-500';
  return 'border-l-muted-foreground/20';
}

export function WorkflowLine({ line, lineIndex }: WorkflowLineProps) {
  const borderClass = lineStateBorder(line);

  return (
    <div
      data-testid={`workflow-line-${line.lineId}`}
      className={`rounded-lg border border-l-4 ${borderClass} bg-card p-3`}
    >
      {/* Line header */}
      <div className="flex items-center gap-2 mb-2" data-testid={`line-header-${line.lineId}`}>
        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-muted text-xs font-bold">
          {lineIndex + 1}
        </span>
        <span className="text-sm font-medium">{line.label ?? `Line ${lineIndex + 1}`}</span>
        <span className="text-xs text-muted-foreground ml-auto">
          {line.transition === 'auto' ? '↓ auto' : '🔒 manual'}
        </span>
      </div>

      {/* Nodes */}
      {line.nodes.length === 0 ? (
        <EmptyLinePlaceholder />
      ) : (
        <div className="flex gap-2 overflow-x-auto py-1" data-testid={`line-nodes-${line.lineId}`}>
          {line.nodes.map((node) => (
            <WorkflowNodeCard key={node.nodeId} {...nodeStatusToCardProps(node)} />
          ))}
        </div>
      )}
    </div>
  );
}
