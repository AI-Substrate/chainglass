/**
 * Plan 027: Central Domain Event Notification System
 *
 * Core interface for the central event notifier and the DomainEvent type.
 */

import type { WorkspaceDomainType } from './workspace-domain.js';

/**
 * Shape of a recorded domain event, used by fakes for test inspection
 * and by integration tests for assertion.
 *
 * Per DYK-04: This is NOT a domain transfer object to construct and pass around.
 * `emit()` takes three separate arguments (matching `ISSEBroadcaster.broadcast()`).
 * This type names the shape of `FakeCentralEventNotifier.emittedEvents` entries
 * for readability and test assertions.
 *
 * Per ADR-0007: `data` is `Record<string, unknown>` — SSE carries only domain
 * identifiers (e.g., `{ graphSlug }`), clients fetch full state via REST.
 */
export interface DomainEvent {
  readonly domain: WorkspaceDomainType;
  readonly eventType: string;
  readonly data: Record<string, unknown>;
}

/**
 * Central event notifier — single entry point for all domain event notifications.
 *
 * Implementations:
 * - `FakeCentralEventNotifier` (packages/shared) — test double with inspectable state
 * - `CentralEventNotifierService` (apps/web, Phase 2) — real service wrapping ISSEBroadcaster
 *
 * Per ADR-0004: Resolved via DI token `WORKSPACE_DI_TOKENS.CENTRAL_EVENT_NOTIFIER`.
 */
export interface ICentralEventNotifier {
  /**
   * Emit a domain event. Direct passthrough to the underlying broadcaster.
   *
   * @param domain - The workspace domain (e.g., `WorkspaceDomain.Workgraphs`)
   * @param eventType - The event type string (e.g., `'graph-updated'`)
   * @param data - Minimal payload per ADR-0007 (e.g., `{ graphSlug: 'my-graph' }`)
   */
  emit(domain: WorkspaceDomainType, eventType: string, data: Record<string, unknown>): void;
}
