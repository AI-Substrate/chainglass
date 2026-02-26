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
        className="flex items-center justify-center w-6 shrink-0 self-center text-muted-foreground/30"
        title="Isolated — no context"
        data-testid="flow-isolated"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
      </span>
    );
  }

  // Explicit contextFrom (not from left neighbor)
  if (rightNode.contextFrom) {
    return (
      <span
        className="flex items-center justify-center w-6 shrink-0 self-center text-violet-400"
        title={`Context from: ${rightNode.contextFrom}`}
        data-testid="flow-explicit"
      >
        <svg width="20" height="12" viewBox="0 0 20 12" fill="none"><path d="M2 6h14M12 2l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
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
      className="flex items-center justify-center w-6 shrink-0 self-center text-blue-400/70"
      title="Context inherited from left"
      data-testid="flow-inherited"
    >
      <svg width="20" height="12" viewBox="0 0 20 12" fill="none"><path d="M2 6h14M12 2l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
    </span>
  );
}

function Dot({ label }: { label: string }) {
  return (
    <span
      className="flex items-center justify-center w-6 shrink-0 self-center text-muted-foreground/20"
      title={label}
      data-testid="flow-none"
    >
      <svg width="16" height="4" viewBox="0 0 16 4" fill="none"><circle cx="2" cy="2" r="1.5" fill="currentColor"/><circle cx="8" cy="2" r="1.5" fill="currentColor"/><circle cx="14" cy="2" r="1.5" fill="currentColor"/></svg>
    </span>
  );
}
