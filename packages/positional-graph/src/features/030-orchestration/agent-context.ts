/**
 * getContextSource() — Pure function determining context inheritance for agent nodes.
 *
 * 5 rules applied in order:
 * - Rule 0: Non-agent → not-applicable
 * - Rule 1: First agent on line 0 → new
 * - Rule 2: First on line N>0 → walk ALL previous lines for agent (DYK-I10) → inherit or new
 * - Rule 3: Parallel → new
 * - Rule 4: Serial not-first → walk left past non-agents (DYK-I13) → inherit or new
 *
 * AgentContextService is a thin wrapper for interface injection (DYK-I9).
 *
 * @packageDocumentation
 */

import type { ContextSourceResult } from './agent-context.schema.js';
import type { IAgentContextService } from './agent-context.types.js';
import type { PositionalGraphReality } from './reality.types.js';
import { PositionalGraphRealityView } from './reality.view.js';

/**
 * Determine the context source for a node in the graph.
 *
 * Pure function: same input always produces the same output.
 * No side effects, no I/O.
 */
export function getContextSource(
  reality: PositionalGraphReality,
  nodeId: string
): ContextSourceResult {
  const view = new PositionalGraphRealityView(reality);
  const node = view.getNode(nodeId);

  // Guard: node not found
  if (!node) {
    return {
      source: 'not-applicable',
      reason: `Node '${nodeId}' not found in reality`,
    };
  }

  // Rule 0: non-agent → not-applicable
  if (node.unitType !== 'agent') {
    return {
      source: 'not-applicable',
      reason: `Node '${nodeId}' is type '${node.unitType}', not an agent`,
    };
  }

  // noContext override: if set, return new immediately (Workshop #3 Q2)
  // Field doesn't exist on NodeReality yet — forward-compatible guard
  if ('noContext' in node && (node as { noContext: unknown }).noContext === true) {
    return {
      source: 'new',
      reason: 'noContext flag set',
    };
  }

  // Rule 1: first agent on line 0 → new
  if (node.lineIndex === 0 && node.positionInLine === 0) {
    return {
      source: 'new',
      reason: 'First agent on line 0 — no prior context available',
    };
  }

  // Rule 2: first on line N>0 → walk ALL previous lines (DYK-I10)
  if (node.positionInLine === 0 && node.lineIndex > 0) {
    for (let i = node.lineIndex - 1; i >= 0; i--) {
      const line = view.getLineByIndex(i);
      if (!line) continue;
      for (const nid of line.nodeIds) {
        const n = view.getNode(nid);
        if (n && n.unitType === 'agent') {
          return {
            source: 'inherit',
            fromNodeId: n.nodeId,
            reason: `First on line ${node.lineIndex} — inherits from agent '${n.nodeId}' on line ${i}`,
          };
        }
      }
    }
    return {
      source: 'new',
      reason: `First on line ${node.lineIndex} — no agent found on any previous line`,
    };
  }

  // Rule 3: parallel → new
  if (node.execution === 'parallel') {
    return {
      source: 'new',
      reason: 'Parallel execution — starts with fresh context',
    };
  }

  // Rule 4: serial not-first → walk left past non-agents (DYK-I13)
  const line = view.getLineByIndex(node.lineIndex);
  if (line) {
    for (let pos = node.positionInLine - 1; pos >= 0; pos--) {
      const leftId = line.nodeIds[pos];
      const leftNode = view.getNode(leftId);
      if (leftNode && leftNode.unitType === 'agent') {
        return {
          source: 'inherit',
          fromNodeId: leftNode.nodeId,
          reason: `Serial — inherits from agent '${leftNode.nodeId}' at position ${pos}`,
        };
      }
      // Skip non-agent nodes (code, user-input) — do NOT stop at parallel agents (DYK-I13 updated)
    }
  }

  return {
    source: 'new',
    reason: `Serial on line ${node.lineIndex} — no agent found to the left`,
  };
}

/**
 * Thin class wrapper for interface injection (DYK-I9).
 * Delegates to the bare getContextSource() function.
 */
export class AgentContextService implements IAgentContextService {
  getContextSource(reality: PositionalGraphReality, nodeId: string): ContextSourceResult {
    return getContextSource(reality, nodeId);
  }
}
