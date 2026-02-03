/**
 * Plan 027: Central Domain Event Notification System
 *
 * Concrete domain event adapter for workgraph state changes.
 *
 * Extends DomainEventAdapter<WorkGraphChangedEvent> — transforms watcher events
 * into `notifier.emit('workgraphs', 'graph-updated', { graphSlug })` calls.
 *
 * Per ADR-0007: Only `graphSlug` is emitted — client fetches full state via REST.
 * Per AC-05: Bridges WorkGraphWatcherAdapter events to the central notifier.
 * Per AC-13: Not coupled to filesystem — callable from any source.
 */

import type { ICentralEventNotifier } from '@chainglass/shared/features/027-central-notify-events/central-event-notifier.interface';
import { DomainEventAdapter } from '@chainglass/shared/features/027-central-notify-events/domain-event-adapter';
import { WorkspaceDomain } from '@chainglass/shared/features/027-central-notify-events/workspace-domain';
import type { WorkGraphChangedEvent } from '@chainglass/workflow';

export class WorkgraphDomainEventAdapter extends DomainEventAdapter<WorkGraphChangedEvent> {
  constructor(notifier: ICentralEventNotifier) {
    super(notifier, WorkspaceDomain.Workgraphs, 'graph-updated');
  }

  extractData(event: WorkGraphChangedEvent): Record<string, unknown> {
    return { graphSlug: event.graphSlug };
  }
}
