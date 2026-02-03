/**
 * Plan 027: Central Domain Event Notification System
 *
 * Abstract base class for domain event adapters.
 *
 * Subclasses transform domain-specific events (e.g., WorkGraphChangedEvent)
 * into `notifier.emit()` calls with the correct domain, eventType, and
 * minimal ADR-0007-compliant data payload.
 *
 * Future domain adapters (agents, samples, etc.) subclass this with ~5 lines:
 * constructor + extractData.
 *
 * Per AC-13: Adapters can emit for any reason — not coupled to filesystem watchers.
 */

import type { ICentralEventNotifier } from './central-event-notifier.interface.js';
import type { WorkspaceDomainType } from './workspace-domain.js';

export abstract class DomainEventAdapter<TEvent> {
  constructor(
    protected readonly notifier: ICentralEventNotifier,
    protected readonly domain: WorkspaceDomainType,
    protected readonly eventType: string
  ) {}

  /**
   * Extract the minimal data payload from a domain event.
   *
   * Per ADR-0007: SSE carries only identifiers (e.g., `{ graphSlug }`).
   * Clients fetch full state via REST.
   */
  abstract extractData(event: TEvent): Record<string, unknown>;

  /**
   * Handle an incoming domain event — extract data and emit via the central notifier.
   */
  handleEvent(event: TEvent): void {
    this.notifier.emit(this.domain, this.eventType, this.extractData(event));
  }
}
