/**
 * Plan 050 Phase 6: Real-Time SSE Updates
 *
 * Concrete domain event adapter for workflow changes (positional graph).
 *
 * Extends DomainEventAdapter<WorkflowChangedEvent> — transforms watcher events
 * into `notifier.emit('workflows', 'workflow-updated', { graphSlug, changeType })` calls.
 *
 * Per ADR-0007: Only identifiers emitted — client fetches full state via REST.
 */

import type { ICentralEventNotifier } from '@chainglass/shared/features/027-central-notify-events/central-event-notifier.interface';
import { DomainEventAdapter } from '@chainglass/shared/features/027-central-notify-events/domain-event-adapter';
import { WorkspaceDomain } from '@chainglass/shared/features/027-central-notify-events/workspace-domain';
import type { WorkflowChangedEvent } from '@chainglass/workflow';

export class WorkflowDomainEventAdapter extends DomainEventAdapter<WorkflowChangedEvent> {
  constructor(notifier: ICentralEventNotifier) {
    super(notifier, WorkspaceDomain.Workflows, 'workflow-updated');
  }

  extractData(event: WorkflowChangedEvent): Record<string, unknown> {
    return { graphSlug: event.graphSlug, changeType: event.changeType };
  }
}
