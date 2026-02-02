/**
 * Plan 027: Central Domain Event Notification System
 *
 * Shared pure function for extracting suppression keys from event data.
 *
 * Per DYK Insight #1: Both FakeCentralEventNotifier and CentralEventNotifierService
 * import this function to eliminate divergence risk in key extraction logic.
 *
 * Convention: Checks `graphSlug`, `agentId`, `key` fields in priority order.
 * Returns undefined if no key field found (event won't be suppression-checked).
 */

/**
 * Extract a suppression key from event data.
 *
 * Checks common key fields in priority order: `graphSlug`, `agentId`, `key`.
 * Returns `undefined` if no key field is found — the event will bypass
 * suppression checks entirely (always emitted).
 *
 * @param data - Event data payload (Record<string, unknown>)
 * @returns The suppression key string, or undefined if no key field found
 */
export function extractSuppressionKey(data: Record<string, unknown>): string | undefined {
  if (typeof data.graphSlug === 'string') return data.graphSlug;
  if (typeof data.agentId === 'string') return data.agentId;
  if (typeof data.key === 'string') return data.key;
  return undefined;
}
