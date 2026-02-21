/**
 * getContextSource() — Pure function determining context inheritance for agent nodes.
 *
 * Global Session + Left Neighbor model (6 rules, first match wins):
 *   R0: non-agent             → not-applicable
 *   R1: noContext              → new
 *   R2: contextFrom set       → inherit from specified node (runtime guard)
 *   R3: I am the global agent → new
 *   R4: parallel AND pos > 0  → new
 *   R5: serial left walk + global fallback → inherit
 *
 * AgentContextService is a thin wrapper for interface injection.
 *
 * @packageDocumentation
 */

import type { ContextSourceResult } from './agent-context.schema.js';
import type { IAgentContextService } from './agent-context.types.js';
import type { NodeReality, PositionalGraphReality } from './reality.types.js';
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
    return { source: 'not-applicable', reason: `Node '${nodeId}' not found in reality` };
  }

  // R0: non-agent
  if (node.unitType !== 'agent') {
    return {
      source: 'not-applicable',
      reason: `Node '${nodeId}' is type '${node.unitType}', not an agent`,
    };
  }

  // R1: noContext
  if (node.noContext === true) {
    return { source: 'new', reason: 'Isolated — noContext flag set' };
  }

  // R2: contextFrom override (runtime guard for safety — readiness gate is belt-and-suspenders)
  if (node.contextFrom) {
    const targetNode = view.getNode(node.contextFrom);
    if (!targetNode || targetNode.unitType !== 'agent') {
      return {
        source: 'new',
        reason: `contextFrom '${node.contextFrom}' invalid (not found or not agent) — runtime guard`,
      };
    }
    return {
      source: 'inherit',
      fromNodeId: node.contextFrom,
      reason: 'Explicit contextFrom override',
    };
  }

  // R3: am I the global agent?
  const globalAgentId = findGlobalAgent(reality);
  if (!globalAgentId || globalAgentId === nodeId) {
    return { source: 'new', reason: 'Global agent — no prior context' };
  }

  // R4: parallel at pos > 0 → always new (independent workers)
  if (node.execution === 'parallel' && node.positionInLine > 0) {
    return { source: 'new', reason: 'Parallel at pos > 0 — independent worker' };
  }

  // R5: serial left walk + global fallback
  const line = view.getLineByIndex(node.lineIndex);
  if (line && node.positionInLine > 0) {
    for (let pos = node.positionInLine - 1; pos >= 0; pos--) {
      const leftId = line.nodeIds[pos];
      const leftNode = view.getNode(leftId);
      if (!leftNode) continue;
      if (leftNode.unitType !== 'agent') continue; // skip code, user-input
      // Left-hand rule: absolute — includes parallel and noContext nodes
      return {
        source: 'inherit',
        fromNodeId: leftNode.nodeId,
        reason: `Left neighbor '${leftNode.nodeId}' at position ${pos}`,
      };
    }
  }

  // pos 0 or no agent to the left → global
  return {
    source: 'inherit',
    fromNodeId: globalAgentId,
    reason: `No left neighbor — inheriting from global agent '${globalAgentId}'`,
  };
}

// ── Helpers ──────────────────────────────────────────

function findGlobalAgent(reality: PositionalGraphReality): string | undefined {
  for (const line of reality.lines) {
    for (const nodeId of line.nodeIds) {
      const node = reality.nodes.get(nodeId);
      if (node && node.unitType === 'agent' && node.noContext !== true) {
        return node.nodeId;
      }
    }
  }
  return undefined;
}

/**
 * Thin class wrapper for interface injection.
 * Delegates to the bare getContextSource() function.
 */
export class AgentContextService implements IAgentContextService {
  getContextSource(reality: PositionalGraphReality, nodeId: string): ContextSourceResult {
    return getContextSource(reality, nodeId);
  }
}
