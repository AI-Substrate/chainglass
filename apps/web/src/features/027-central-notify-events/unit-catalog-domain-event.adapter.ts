/**
 * Plan 058 Phase 4: Unit Catalog Domain Event Adapter
 *
 * Transforms WorkUnitCatalogWatcherAdapter events into domain events
 * emitted via CentralEventNotifier → SSE → client.
 *
 * Per ADR-0007: Only identifiers emitted — client fetches full state via REST.
 */

import type { ICentralEventNotifier } from '@chainglass/shared/features/027-central-notify-events/central-event-notifier.interface';
import { DomainEventAdapter } from '@chainglass/shared/features/027-central-notify-events/domain-event-adapter';
import { WorkspaceDomain } from '@chainglass/shared/features/027-central-notify-events/workspace-domain';
import type { UnitCatalogChangedEvent } from '@chainglass/workflow';

export class UnitCatalogDomainEventAdapter extends DomainEventAdapter<UnitCatalogChangedEvent> {
  constructor(notifier: ICentralEventNotifier) {
    super(notifier, WorkspaceDomain.UnitCatalog, 'unit-changed');
  }

  extractData(event: UnitCatalogChangedEvent): Record<string, unknown> {
    return {
      unitSlug: event.unitSlug,
      workspaceSlug: event.workspaceSlug,
      worktreePath: event.worktreePath,
    };
  }
}
