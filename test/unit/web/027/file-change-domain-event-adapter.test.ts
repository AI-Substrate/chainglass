/**
 * Tests for FileChangeDomainEventAdapter.
 *
 * Per Plan 045: Live File Events - Phase 1 (T005)
 * Verifies extractData payload shape matches SSE contract (ADR-0007).
 */

import { FakeCentralEventNotifier } from '@chainglass/shared/features/027-central-notify-events/fake-central-event-notifier';
import { WorkspaceDomain } from '@chainglass/shared/features/027-central-notify-events/workspace-domain';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  type FileChangeBatchEvent,
  FileChangeDomainEventAdapter,
} from '../../../../apps/web/src/features/027-central-notify-events/file-change-domain-event-adapter';

describe('FileChangeDomainEventAdapter', () => {
  let notifier: FakeCentralEventNotifier;
  let adapter: FileChangeDomainEventAdapter;

  beforeEach(() => {
    notifier = new FakeCentralEventNotifier();
    adapter = new FileChangeDomainEventAdapter(notifier);
  });

  it('should emit to file-changes domain with file-changed event type', () => {
    const event: FileChangeBatchEvent = {
      changes: [
        { path: 'src/app.tsx', eventType: 'change', worktreePath: '/repo', timestamp: 1000 },
      ],
    };

    adapter.handleEvent(event);

    expect(notifier.emittedEvents).toHaveLength(1);
    expect(notifier.emittedEvents[0].domain).toBe(WorkspaceDomain.FileChanges);
    expect(notifier.emittedEvents[0].eventType).toBe('file-changed');
  });

  it('should extract changes array with path, eventType, worktreePath, timestamp', () => {
    const event: FileChangeBatchEvent = {
      changes: [
        { path: 'src/app.tsx', eventType: 'change', worktreePath: '/repo', timestamp: 1000 },
        { path: 'src/index.ts', eventType: 'add', worktreePath: '/repo', timestamp: 1001 },
      ],
    };

    adapter.handleEvent(event);

    const data = notifier.emittedEvents[0].data as { changes: unknown[] };
    expect(data.changes).toHaveLength(2);
    expect(data.changes[0]).toEqual({
      path: 'src/app.tsx',
      eventType: 'change',
      worktreePath: '/repo',
      timestamp: 1000,
    });
    expect(data.changes[1]).toEqual({
      path: 'src/index.ts',
      eventType: 'add',
      worktreePath: '/repo',
      timestamp: 1001,
    });
  });

  it('should handle empty changes array', () => {
    const event: FileChangeBatchEvent = { changes: [] };

    adapter.handleEvent(event);

    expect(notifier.emittedEvents).toHaveLength(1);
    const data = notifier.emittedEvents[0].data as { changes: unknown[] };
    expect(data.changes).toHaveLength(0);
  });
});
