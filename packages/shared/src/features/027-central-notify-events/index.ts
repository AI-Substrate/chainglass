/**
 * Plan 027: Central Domain Event Notification System - Feature Barrel Export
 *
 * Re-exports all public types, interfaces, and fakes from
 * the central domain event notification feature.
 */

// Domain identity
export { WorkspaceDomain } from './workspace-domain.js';
export type { WorkspaceDomainType } from './workspace-domain.js';

// Interface and types
export type {
  DomainEvent,
  ICentralEventNotifier,
} from './central-event-notifier.interface.js';

// Base classes
export { DomainEventAdapter } from './domain-event-adapter.js';

// Fakes
export { FakeCentralEventNotifier } from './fake-central-event-notifier.js';
