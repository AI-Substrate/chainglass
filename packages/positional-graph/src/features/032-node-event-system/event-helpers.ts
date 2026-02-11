import type { NodeExecutionStatus } from '../../schemas/state.schema.js';

/**
 * Returns true if the node is in-flight (actively being worked on or reserved).
 * Statuses: 'starting', 'agent-accepted'.
 */
export function isNodeActive(status: NodeExecutionStatus): boolean {
  return status === 'starting' || status === 'agent-accepted';
}

/**
 * Returns true if the agent can perform work on the node (save output, ask questions, complete).
 * Only 'agent-accepted' nodes can do work — 'starting' nodes must accept first.
 */
export function canNodeDoWork(status: NodeExecutionStatus): boolean {
  return status === 'agent-accepted';
}
