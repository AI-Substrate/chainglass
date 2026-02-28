/**
 * Context badge computation — pure function from NodeStatusResult + lineIndex.
 *
 * Rules (from W002):
 * - Gray: non-agent node (code, user-input)
 * - Green: noContext=true, or position 0 on line 0 (global/new), or parallel execution
 * - Purple: explicit contextFrom set
 * - Blue: default serial agent (inherited from left neighbor)
 *
 * Phase 4: Context Indicators — Plan 050
 */

import type { NodeStatusResult } from '@chainglass/positional-graph';

export type ContextBadgeColor = 'green' | 'blue' | 'purple' | 'gray';

export function computeContextBadge(node: NodeStatusResult, lineIndex: number): ContextBadgeColor {
  // Non-agent nodes don't have context
  if (node.unitType !== 'agent') return 'gray';

  // Isolated nodes get fresh context
  if (node.noContext) return 'green';

  // Explicit contextFrom override
  if (node.contextFrom) return 'purple';

  // First agent on first line = global/new context
  if (lineIndex === 0 && node.position === 0) return 'green';

  // Parallel execution = independent context
  if (node.execution === 'parallel') return 'green';

  // Default: serial agent inherits from left
  return 'blue';
}
