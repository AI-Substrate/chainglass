/**
 * Plan 045: Live File Events
 *
 * Domain event adapter for file changes. Transforms FileChangeBatchItem arrays
 * from FileChangeWatcherAdapter into SSE-compatible domain events via the
 * central notifier.
 *
 * Per ADR-0007: SSE carries only identifiers — path + eventType per change.
 * Per ADR-0010: Three-layer notification pipeline — adapter → notifier → SSE.
 * Follows WorkgraphDomainEventAdapter pattern.
 */

import type { ICentralEventNotifier } from '@chainglass/shared/features/027-central-notify-events/central-event-notifier.interface';
import { DomainEventAdapter } from '@chainglass/shared/features/027-central-notify-events/domain-event-adapter';
import { WorkspaceDomain } from '@chainglass/shared/features/027-central-notify-events/workspace-domain';
import type { FileChangeBatchItem } from '@chainglass/workflow';

/** Event shape passed to handleEvent — a batch of file changes */
export interface FileChangeBatchEvent {
  changes: FileChangeBatchItem[];
}

export class FileChangeDomainEventAdapter extends DomainEventAdapter<FileChangeBatchEvent> {
  constructor(notifier: ICentralEventNotifier) {
    super(notifier, WorkspaceDomain.FileChanges, 'file-changed');
  }

  extractData(event: FileChangeBatchEvent): Record<string, unknown> {
    return {
      changes: event.changes.map((c) => ({
        path: c.path,
        eventType: c.eventType,
        worktreePath: c.worktreePath,
        timestamp: c.timestamp,
      })),
    };
  }
}
