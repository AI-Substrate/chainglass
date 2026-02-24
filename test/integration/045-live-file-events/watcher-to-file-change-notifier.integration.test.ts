/**
 * Integration test: Watcher → FileChangeWatcherAdapter → FileChangeDomainEventAdapter → Notifier
 *
 * Per Plan 045: Live File Events - Phase 1 (T010)
 * Verifies the full server-side pipeline from simulated file change to notifier.emit().
 */

import { FakeCentralEventNotifier } from '@chainglass/shared/features/027-central-notify-events/fake-central-event-notifier';
import { WorkspaceDomain } from '@chainglass/shared/features/027-central-notify-events/workspace-domain';
import { FileChangeWatcherAdapter } from '@chainglass/workflow';
import type { WatcherEvent } from '@chainglass/workflow';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FileChangeDomainEventAdapter } from '../../../apps/web/src/features/027-central-notify-events/file-change-domain-event-adapter';

describe('Watcher → FileChange → Notifier Integration', () => {
  let notifier: FakeCentralEventNotifier;
  let watcherAdapter: FileChangeWatcherAdapter;
  let domainAdapter: FileChangeDomainEventAdapter;

  beforeEach(() => {
    vi.useFakeTimers();
    notifier = new FakeCentralEventNotifier();
    watcherAdapter = new FileChangeWatcherAdapter(300);
    domainAdapter = new FileChangeDomainEventAdapter(notifier);

    // Wire: watcherAdapter → domainAdapter (same as bootstrap)
    watcherAdapter.onFilesChanged((changes) => domainAdapter.handleEvent({ changes }));
  });

  afterEach(() => {
    watcherAdapter.destroy();
    vi.useRealTimers();
  });

  it('should emit file-changed event on file modification', () => {
    const event: WatcherEvent = {
      path: '/repo/src/app.tsx',
      eventType: 'change',
      worktreePath: '/repo',
      workspaceSlug: 'ws-1',
    };

    watcherAdapter.handleEvent(event);
    vi.advanceTimersByTime(300);

    expect(notifier.emittedEvents).toHaveLength(1);
    expect(notifier.emittedEvents[0].domain).toBe(WorkspaceDomain.FileChanges);
    expect(notifier.emittedEvents[0].eventType).toBe('file-changed');

    const data = notifier.emittedEvents[0].data as {
      changes: Array<{ path: string; eventType: string }>;
    };
    expect(data.changes).toHaveLength(1);
    expect(data.changes[0].path).toBe('src/app.tsx');
    expect(data.changes[0].eventType).toBe('change');
  });

  it('should emit file-changed event on file creation (add)', () => {
    const event: WatcherEvent = {
      path: '/repo/src/new-file.ts',
      eventType: 'add',
      worktreePath: '/repo',
      workspaceSlug: 'ws-1',
    };

    watcherAdapter.handleEvent(event);
    vi.advanceTimersByTime(300);

    const data = notifier.emittedEvents[0].data as {
      changes: Array<{ path: string; eventType: string }>;
    };
    expect(data.changes[0].eventType).toBe('add');
  });

  it('should emit file-changed event on file deletion (unlink)', () => {
    const event: WatcherEvent = {
      path: '/repo/src/deleted.ts',
      eventType: 'unlink',
      worktreePath: '/repo',
      workspaceSlug: 'ws-1',
    };

    watcherAdapter.handleEvent(event);
    vi.advanceTimersByTime(300);

    const data = notifier.emittedEvents[0].data as {
      changes: Array<{ path: string; eventType: string }>;
    };
    expect(data.changes[0].eventType).toBe('unlink');
  });

  it('should filter .chainglass paths — no notifier emit', () => {
    const event: WatcherEvent = {
      path: '/repo/.chainglass/data/work-graphs/demo/state.json',
      eventType: 'change',
      worktreePath: '/repo',
      workspaceSlug: 'ws-1',
    };

    watcherAdapter.handleEvent(event);
    vi.advanceTimersByTime(300);

    expect(notifier.emittedEvents).toHaveLength(0);
  });

  it('should batch and deduplicate rapid changes', () => {
    watcherAdapter.handleEvent({
      path: '/repo/src/app.tsx',
      eventType: 'add',
      worktreePath: '/repo',
      workspaceSlug: 'ws-1',
    });
    watcherAdapter.handleEvent({
      path: '/repo/src/app.tsx',
      eventType: 'change',
      worktreePath: '/repo',
      workspaceSlug: 'ws-1',
    });
    watcherAdapter.handleEvent({
      path: '/repo/src/index.ts',
      eventType: 'add',
      worktreePath: '/repo',
      workspaceSlug: 'ws-1',
    });

    vi.advanceTimersByTime(300);

    // Should have 1 emit with 2 changes (app.tsx deduped: last-event-wins = change)
    expect(notifier.emittedEvents).toHaveLength(1);
    const data = notifier.emittedEvents[0].data as {
      changes: Array<{ path: string; eventType: string }>;
    };
    expect(data.changes).toHaveLength(2);

    const appChange = data.changes.find((c: { path: string }) => c.path === 'src/app.tsx');
    expect(appChange?.eventType).toBe('change'); // last-event-wins
  });
});
