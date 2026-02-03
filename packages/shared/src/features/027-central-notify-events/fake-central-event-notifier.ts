/**
 * Plan 027: Central Domain Event Notification System
 *
 * Fake implementation of ICentralEventNotifier for testing.
 *
 * Records all emitted events for test inspection via `emittedEvents`.
 * Direct passthrough — no suppression or filtering.
 */

import type { DomainEvent, ICentralEventNotifier } from './central-event-notifier.interface.js';
import type { WorkspaceDomainType } from './workspace-domain.js';

/**
 * Fake implementation of ICentralEventNotifier for testing.
 *
 * Exposes `emittedEvents: DomainEvent[]` for assertion.
 */
export class FakeCentralEventNotifier implements ICentralEventNotifier {
  /** Recorded domain events for test inspection */
  public readonly emittedEvents: DomainEvent[] = [];

  emit(domain: WorkspaceDomainType, eventType: string, data: Record<string, unknown>): void {
    this.emittedEvents.push({ domain, eventType, data });
  }
}
