/**
 * ContextFlowIndicator — Small inline indicator between adjacent nodes.
 *
 * Shows context flow direction:
 * - Blue arrow (→): context flows left to right (serial, inherited)
 * - Gray X (✕): right node has noContext (isolated)
 * - Gray dots (···): parallel nodes (no context inheritance)
 * - Purple arrow (→): explicit contextFrom
 *
 * Phase 4: Context Indicators — Plan 050
 */

import type { NodeStatusResult } from '@chainglass/positional-graph';

export interface ContextFlowIndicatorProps {
  rightNode: NodeStatusResult;
}

export function ContextFlowIndicator({ rightNode }: ContextFlowIndicatorProps) {
  // Non-agent nodes don't participate in context flow
  if (rightNode.unitType !== 'agent') {
    return <Dot label="no context" />;
  }

  // Isolated node
  if (rightNode.noContext) {
    return (
      <span
        className="text-lg text-muted-foreground/50 px-1 shrink-0 self-center"
        title="Isolated — no context"
        data-testid="flow-isolated"
      >
        ✕
      </span>
    );
  }

  // Explicit contextFrom (not from left neighbor)
  if (rightNode.contextFrom) {
    return (
      <span
        className="text-lg text-violet-400 px-1 shrink-0 self-center"
        title={`Context from: ${rightNode.contextFrom}`}
        data-testid="flow-explicit"
      >
        →
      </span>
    );
  }

  // Parallel execution — no context inheritance
  if (rightNode.execution === 'parallel') {
    return <Dot label="parallel" />;
  }

  // Default: serial, context inherited from left
  return (
    <span
      className="text-lg text-blue-400 px-1 shrink-0 self-center"
      title="Context inherited from left"
      data-testid="flow-inherited"
    >
      →
    </span>
  );
}

function Dot({ label }: { label: string }) {
  return (
    <span
      className="text-lg text-muted-foreground/30 px-1 shrink-0 self-center"
      title={label}
      data-testid="flow-none"
    >
      ···
    </span>
  );
}
