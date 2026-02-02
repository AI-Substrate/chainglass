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
   * Emit a domain event. If the `(domain, key)` pair is currently suppressed,
   * the event is silently dropped.
   *
   * Per DYK-01: `emit()` owns suppression enforcement internally. Callers
   * (adapters) never need to call `isSuppressed()` before `emit()`. The
   * notifier is the single enforcement point.
   *
   * @param domain - The workspace domain (e.g., `WorkspaceDomain.Workgraphs`)
   * @param eventType - The event type string (e.g., `'graph-updated'`)
   * @param data - Minimal payload per ADR-0007 (e.g., `{ graphSlug: 'my-graph' }`)
   */
  emit(domain: WorkspaceDomainType, eventType: string, data: Record<string, unknown>): void;

  /**
   * Suppress events for a `(domain, key)` pair for `durationMs` milliseconds.
   *
   * Called by API routes after mutations to prevent duplicate events from the
   * filesystem watcher (which will fire shortly after the file is written).
   *
   * @param domain - The workspace domain to suppress
   * @param key - The suppression key (e.g., graphSlug)
   * @param durationMs - Suppression window in milliseconds (typically ~500ms)
   */
  suppressDomain(domain: WorkspaceDomainType, key: string, durationMs: number): void;

  /**
   * Check whether events for a `(domain, key)` pair are currently suppressed.
   *
   * Per DYK-01: This method is public for observability and debugging, but
   * callers do NOT need to check it before calling `emit()` — `emit()` checks
   * internally.
   *
   * @param domain - The workspace domain
   * @param key - The suppression key
   * @returns `true` if within the suppression window, `false` otherwise
   */
  isSuppressed(domain: WorkspaceDomainType, key: string): boolean;
}
