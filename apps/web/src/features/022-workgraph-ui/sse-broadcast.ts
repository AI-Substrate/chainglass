/**
 * WorkGraph SSE Broadcast Helper - Phase 4
 *
 * Per ADR-0007: Notification-fetch pattern
 * - API routes call this after successful mutations
 * - Broadcasts notification with graphSlug only (no data)
 * - Clients receive notification and fetch latest state via REST
 */

import { sseManager } from '@/lib/sse-manager';

/** SSE channel for workgraph updates */
const WORKGRAPHS_CHANNEL = 'workgraphs';

/** Event type for graph updates */
const GRAPH_UPDATED_EVENT = 'graph-updated';

/**
 * Broadcast SSE notification that a workgraph was updated.
 *
 * Per ADR-0007: This is a notification only - no data payload.
 * Clients should call instance.refresh() to fetch latest state.
 *
 * @deprecated Use {@link WorkgraphDomainEventAdapter} via {@link CentralEventNotifierService}
 * instead. The central domain event system (Plan 027) provides automatic filesystem-driven
 * notifications through domain event adapters. See `docs/how/dev/central-events/3-adapters.md`
 * for the migration path and how to add new domain adapters.
 *
 * @param graphSlug - The slug of the graph that was updated
 */
export function broadcastGraphUpdated(graphSlug: string): void {
  sseManager.broadcast(WORKGRAPHS_CHANNEL, GRAPH_UPDATED_EVENT, { graphSlug });
}
