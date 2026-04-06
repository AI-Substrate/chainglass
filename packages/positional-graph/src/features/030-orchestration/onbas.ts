/**
 * ONBAS — OrchestrationNextBestActionService.
 *
 * Pure, synchronous, stateless rules engine.
 * Walks the graph snapshot and returns the next best action.
 *
 * Per Workshop #5: walkForNextAction + visitNode + diagnoseStuckLine.
 *
 * @packageDocumentation
 */

import type { IONBAS } from './onbas.types.js';
import type { NoActionReason, OrchestrationRequest } from './orchestration-request.schema.js';
import type { LineReality, NodeReality, PositionalGraphReality } from './reality.types.js';

// ── walkForNextAction ───────────────────────────────

/**
 * Walk the graph reality node-by-node and determine the next action.
 * Pure function: no side effects, no async, no I/O.
 */
export function walkForNextAction(reality: PositionalGraphReality): OrchestrationRequest {
  const { graphSlug } = reality;

  // Short circuit: graph-level states
  if (reality.isComplete) {
    return { type: 'no-action', graphSlug, reason: 'graph-complete' };
  }

  if (reality.isFailed) {
    return { type: 'no-action', graphSlug, reason: 'graph-failed' };
  }

  // Walk each line in positional order
  for (const line of reality.lines) {
    // Gate: can we enter this line?
    if (!line.transitionOpen) {
      return {
        type: 'no-action',
        graphSlug,
        reason: 'transition-blocked',
        lineId: line.lineId,
      };
    }

    // Visit each node on this line in position order
    for (const nodeId of line.nodeIds) {
      const node = reality.nodes.get(nodeId);
      if (!node) continue;

      const action = visitNode(reality, node);
      if (action) {
        return action;
      }
    }

    // Can we proceed to the next line?
    if (!line.isComplete) {
      return {
        type: 'no-action',
        graphSlug,
        reason: diagnoseStuckLine(reality, line),
      };
    }
  }

  // All lines walked and complete — nothing else to do (defensive fallthrough)
  return { type: 'no-action', graphSlug, reason: 'graph-complete' };
}

// Stuck-starting threshold: 60 seconds without agent accepting
const STUCK_STARTING_THRESHOLD_MS = 60_000;

// ── visitNode ───────────────────────────────────────

function visitNode(
  reality: PositionalGraphReality,
  node: NodeReality
): OrchestrationRequest | null {
  const { graphSlug } = reality;

  switch (node.status) {
    case 'complete':
      return null;

    case 'starting': {
      // Check for stuck: starting for too long with no accept
      if (node.startedAt) {
        const elapsed = Date.now() - new Date(node.startedAt).getTime();
        if (elapsed > STUCK_STARTING_THRESHOLD_MS) {
          return {
            type: 'error-node' as OrchestrationRequest['type'],
            graphSlug,
            nodeId: node.nodeId,
            inputs: node.inputPack,
            error: {
              code: 'STUCK_STARTING',
              message: `Node started ${Math.round(elapsed / 1000)}s ago with no accept — agent may have failed silently`,
            },
          } as OrchestrationRequest;
        }
      }
      return null;
    }

    case 'agent-accepted':
      return null;

    case 'waiting-question':
      return null;

    case 'blocked-error':
      return null;

    case 'interrupted':
      return null;

    case 'ready':
      // User-input nodes are a UI concern — orchestration does not start them
      if (node.unitType === 'user-input') {
        return null;
      }
      return {
        type: 'start-node',
        graphSlug,
        nodeId: node.nodeId,
        inputs: node.inputPack,
      };

    case 'pending':
      return null;

    default:
      return null;
  }
}

// ── diagnoseStuckLine ───────────────────────────────

function diagnoseStuckLine(reality: PositionalGraphReality, line: LineReality): NoActionReason {
  let hasRunning = false;
  let hasWaiting = false;
  let hasBlocked = false;

  for (const nodeId of line.nodeIds) {
    const node = reality.nodes.get(nodeId);
    if (!node) continue;

    switch (node.status) {
      case 'starting': {
        // Stuck-starting nodes should not count as "running" — they're about to be errored
        const isStuck =
          node.startedAt &&
          Date.now() - new Date(node.startedAt).getTime() > STUCK_STARTING_THRESHOLD_MS;
        if (!isStuck) hasRunning = true;
        else hasBlocked = true;
        break;
      }
      case 'agent-accepted':
      case 'interrupted':
        hasRunning = true;
        break;
      case 'waiting-question':
        hasWaiting = true;
        break;
      case 'blocked-error':
        hasBlocked = true;
        break;
    }
  }

  // Priority: running or waiting → all-waiting
  if (hasRunning || hasWaiting) {
    return 'all-waiting';
  }

  // All non-complete are blocked → graph-failed
  if (hasBlocked) {
    return 'graph-failed';
  }

  // Fallback: nodes are pending but gates not satisfied
  return 'all-waiting';
}

// ── ONBAS class wrapper ─────────────────────────────

/**
 * Thin class wrapper over walkForNextAction for interface/DI use.
 */
export class ONBAS implements IONBAS {
  getNextAction(reality: PositionalGraphReality): OrchestrationRequest {
    return walkForNextAction(reality);
  }
}
