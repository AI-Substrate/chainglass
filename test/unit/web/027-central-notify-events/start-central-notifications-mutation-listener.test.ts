/**
 * Plan 084 — live-monitoring-rescan, Task T006.
 *
 * Verifies that `startCentralNotificationSystem()` wires
 * `IWorkspaceService.onMutation` → `ICentralWatcherService.rescan()`,
 * AND that the wire-up is HMR-safe (detach-then-resubscribe pattern that
 * runs unconditionally on every call, regardless of the
 * `__centralNotificationsStarted` flag).
 *
 * Pattern: vi.mock the bootstrap-singleton's `getContainer` so DI returns
 * fake services with a real `EventEmitter`-backed `onMutation`. No mocking
 * of fs.watch or the central watcher itself — the fake records `rescan()`
 * calls and that's all this unit cares about.
 */

import { EventEmitter } from 'node:events';
import type { WorkspaceMutationEvent } from '@chainglass/workflow';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mutable holders for the fakes — populated in `beforeEach` per test. Hoisted
// because the vi.mock factory below references them, and vi.mock factories
// are hoisted above imports.
const refs = vi.hoisted(() => ({
  workspaceService: { current: null as unknown },
  watcher: { current: null as unknown },
  resolveCalls: [] as string[],
}));

vi.mock('../../../../apps/web/src/lib/bootstrap-singleton', () => ({
  getContainer: () => ({
    resolve(token: string) {
      refs.resolveCalls.push(token);
      if (token === 'IWorkspaceService') return refs.workspaceService.current;
      if (token === 'ICentralWatcherService') return refs.watcher.current;
      // Minimal stub for the notifier / adapter wiring path; the mutation
      // listener test doesn't exercise this branch in detail.
      return {
        notify: () => {},
      };
    },
  }),
}));

// Import AFTER vi.mock so the mock is in effect when the module loads.
import { startCentralNotificationSystem } from '../../../../apps/web/src/features/027-central-notify-events/start-central-notifications';

interface WorkspaceServiceFake {
  emitter: EventEmitter;
  readonly listenerCount: number;
  onMutation(listener: (e: WorkspaceMutationEvent) => void): () => void;
  fireMutation(e: WorkspaceMutationEvent): void;
}

function makeWorkspaceServiceFake(): WorkspaceServiceFake {
  const emitter = new EventEmitter();
  return {
    emitter,
    get listenerCount() {
      return emitter.listenerCount('mutation');
    },
    onMutation(listener) {
      emitter.on('mutation', listener);
      let detached = false;
      return () => {
        if (detached) return;
        detached = true;
        emitter.off('mutation', listener);
      };
    },
    fireMutation(e) {
      emitter.emit('mutation', e);
    },
  };
}

interface WatcherFake {
  rescanCalls: number;
  rescan: () => Promise<void>;
  registerAdapter: () => void;
  start: () => Promise<void>;
  isWatching: () => boolean;
}

function makeWatcherFake(): WatcherFake {
  const fake: WatcherFake = {
    rescanCalls: 0,
    rescan: async () => {
      fake.rescanCalls += 1;
    },
    registerAdapter: () => {},
    start: async () => {},
    isWatching: () => false,
  };
  return fake;
}

function flushSetImmediate(): Promise<void> {
  return new Promise((resolve) => setImmediate(() => resolve()));
}

function getWorkspaceFake(): WorkspaceServiceFake {
  return refs.workspaceService.current as WorkspaceServiceFake;
}
function getWatcherFake(): WatcherFake {
  return refs.watcher.current as WatcherFake;
}

describe('startCentralNotificationSystem — mutation listener wire-up (Plan 084)', () => {
  beforeEach(() => {
    globalThis.__centralNotificationsStarted = undefined;
    globalThis.__watcherMutationUnsubscribe__?.();
    globalThis.__watcherMutationUnsubscribe__ = undefined;

    refs.workspaceService.current = makeWorkspaceServiceFake();
    refs.watcher.current = makeWatcherFake();
    refs.resolveCalls.length = 0;
  });

  afterEach(() => {
    globalThis.__watcherMutationUnsubscribe__?.();
    globalThis.__watcherMutationUnsubscribe__ = undefined;
    globalThis.__centralNotificationsStarted = undefined;
  });

  it('attaches exactly one mutation listener after first call', async () => {
    expect(getWorkspaceFake().listenerCount).toBe(0);

    await startCentralNotificationSystem();

    expect(getWorkspaceFake().listenerCount).toBe(1);
    expect(typeof globalThis.__watcherMutationUnsubscribe__).toBe('function');
  });

  it('firing a mutation triggers watcher.rescan() exactly once', async () => {
    await startCentralNotificationSystem();

    expect(getWatcherFake().rescanCalls).toBe(0);

    getWorkspaceFake().fireMutation({
      kind: 'workspace:added',
      slug: 'foo',
      path: '/foo',
    });

    // rescan() is async; .catch() handles rejections. Drain the microtask queue.
    await flushSetImmediate();
    await Promise.resolve();

    expect(getWatcherFake().rescanCalls).toBe(1);
  });

  it('HMR regression: a second call detaches the prior listener (does NOT leak)', async () => {
    await startCentralNotificationSystem();
    expect(getWorkspaceFake().listenerCount).toBe(1);
    const firstUnsubscribe = globalThis.__watcherMutationUnsubscribe__;

    // Simulate HMR by calling again WITHOUT resetting the
    // __centralNotificationsStarted flag. The function early-returns from the
    // wire-up, but `attachMutationListener()` runs unconditionally beforehand.
    await startCentralNotificationSystem();

    // Listener count remains 1 — old detached, new attached.
    expect(getWorkspaceFake().listenerCount).toBe(1);
    expect(typeof globalThis.__watcherMutationUnsubscribe__).toBe('function');
    expect(globalThis.__watcherMutationUnsubscribe__).not.toBe(firstUnsubscribe);
  });

  it('HMR regression: 5 successive calls keep listener count at 1', async () => {
    for (let i = 0; i < 5; i++) {
      await startCentralNotificationSystem();
    }
    expect(getWorkspaceFake().listenerCount).toBe(1);
  });

  it('rescan() rejection is caught (does not crash the listener path)', async () => {
    // Replace rescan with a rejecting one
    getWatcherFake().rescan = async () => {
      throw new Error('rescan boom');
    };

    await startCentralNotificationSystem();

    expect(() => {
      getWorkspaceFake().fireMutation({
        kind: 'worktree:created',
        workspaceSlug: 'foo',
        worktreePath: '/foo/wt',
      });
    }).not.toThrow();

    // Allow the rejected promise + .catch() to settle without unhandled rejection.
    await flushSetImmediate();
    await Promise.resolve();
    await Promise.resolve();
  });

  it('the unsubscribe stored on globalThis works (calling it detaches the listener)', async () => {
    await startCentralNotificationSystem();
    expect(getWorkspaceFake().listenerCount).toBe(1);

    globalThis.__watcherMutationUnsubscribe__?.();
    expect(getWorkspaceFake().listenerCount).toBe(0);
  });
});
