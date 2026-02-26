/**
 * Tests for CentralWatcherService.
 *
 * Per Plan 023: Central Watcher Notifications - Phase 2
 * Per Constitution Principle 4: Use fakes over mocks for testing
 *
 * TDD RED phase: These tests define the CentralWatcherService contract
 * before any implementation exists. All tests should FAIL initially.
 */

import { FakeFileSystem, FakeLogger, LogLevel } from '@chainglass/shared';
import {
  CentralWatcherService,
  FakeFileWatcherFactory,
  FakeGitWorktreeResolver,
  FakeWatcherAdapter,
  FakeWorkspaceRegistryAdapter,
  Workspace,
} from '@chainglass/workflow';
import type { FakeFileWatcher, WatcherEvent } from '@chainglass/workflow';
import { beforeEach, describe, expect, it } from 'vitest';

// ═══════════════════════════════════════════════════════════════
// Test Helpers
// ═══════════════════════════════════════════════════════════════

/** Drain pending microtasks so fire-and-forget async chains complete (no timers). */
async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 20; i++) {
    await Promise.resolve();
  }
}

// ═══════════════════════════════════════════════════════════════
// Test Fixtures
// ═══════════════════════════════════════════════════════════════

const REGISTRY_PATH = '/test/.config/chainglass/workspaces.json';

function createTestWorkspace(slug: string, path: string): ReturnType<typeof Workspace.create> {
  return Workspace.create({ name: slug, path, slug });
}

function setupSingleWorktree(
  registry: FakeWorkspaceRegistryAdapter,
  resolver: FakeGitWorktreeResolver,
  fs: FakeFileSystem
) {
  const ws = createTestWorkspace('ws-1', '/repo');
  registry.addWorkspace(ws);
  resolver.setWorktrees('/repo', [
    {
      path: '/repo',
      head: 'abc123',
      branch: 'main',
      isDetached: false,
      isBare: false,
      isPrunable: false,
    },
  ]);
  fs.setDir('/repo/.chainglass/data');
  return ws;
}

function setupTwoWorktrees(
  registry: FakeWorkspaceRegistryAdapter,
  resolver: FakeGitWorktreeResolver,
  fs: FakeFileSystem
) {
  const ws = createTestWorkspace('ws-1', '/repo');
  registry.addWorkspace(ws);
  resolver.setWorktrees('/repo', [
    {
      path: '/repo',
      head: 'abc123',
      branch: 'main',
      isDetached: false,
      isBare: false,
      isPrunable: false,
    },
    {
      path: '/repo-wt',
      head: 'def456',
      branch: 'feature',
      isDetached: false,
      isBare: false,
      isPrunable: false,
    },
  ]);
  fs.setDir('/repo/.chainglass/data');
  fs.setDir('/repo-wt/.chainglass/data');
  return ws;
}

// ═══════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════

describe('CentralWatcherService', () => {
  let registry: FakeWorkspaceRegistryAdapter;
  let resolver: FakeGitWorktreeResolver;
  let fs: FakeFileSystem;
  let factory: FakeFileWatcherFactory;
  let logger: FakeLogger;
  let service: InstanceType<typeof CentralWatcherService>;

  beforeEach(() => {
    registry = new FakeWorkspaceRegistryAdapter();
    resolver = new FakeGitWorktreeResolver();
    fs = new FakeFileSystem();
    factory = new FakeFileWatcherFactory();
    logger = new FakeLogger();
    service = new CentralWatcherService(registry, resolver, fs, factory, REGISTRY_PATH, logger);
  });

  // ═════════════════════════════════════════════════════════════
  // T001: Lifecycle Tests (RED)
  // ═════════════════════════════════════════════════════════════

  describe('start/stop lifecycle', () => {
    it('should create one watcher per worktree plus registry watcher', async () => {
      /*
      Test Doc:
      - Why: AC1 + CF-07 require one IFileWatcher per worktree plus one registry watcher
      - Contract: start() creates N data watchers + N source watchers + 1 registry watcher
      - Usage Notes: 2 worktrees → 5 total watchers (2 data + 2 source + 1 registry)
      - Quality Contribution: Ensures proper watcher fan-out per worktree
      - Worked Example: 1 workspace with 2 worktrees → factory.getWatcherCount() === 5
      */
      setupTwoWorktrees(registry, resolver, fs);

      await service.start();

      // 2 data watchers + 2 source watchers + 1 registry watcher = 5
      expect(factory.getWatcherCount()).toBe(5);
    });

    it('should watch <worktree>/.chainglass/data/ for each worktree', async () => {
      /*
      Test Doc:
      - Why: AC1 specifies watching .chainglass/data/ recursively per worktree
      - Contract: Each data watcher watches the correct .chainglass/data/ path
      - Usage Notes: Check FakeFileWatcher.getWatchedPaths() for each worktree
      - Quality Contribution: Verifies correct watch paths prevent missed events
      - Worked Example: worktree /repo → watcher watches /repo/.chainglass/data/
      */
      setupTwoWorktrees(registry, resolver, fs);

      await service.start();

      // First two watchers are data watchers (order: creation order)
      const watcher0 = factory.getWatcher(0) as FakeFileWatcher;
      const watcher1 = factory.getWatcher(1) as FakeFileWatcher;

      expect(watcher0.getWatchedPaths()).toContain('/repo/.chainglass/data');
      expect(watcher1.getWatchedPaths()).toContain('/repo-wt/.chainglass/data');
    });

    it('should create registry watcher for workspaces.json', async () => {
      /*
      Test Doc:
      - Why: AC7 requires watching workspaces.json for workspace add/remove detection
      - Contract: start() creates a watcher that watches registryPath
      - Usage Notes: Registry watcher is the last created watcher
      - Quality Contribution: Ensures dynamic workspace discovery works
      - Worked Example: registryPath '/test/.../workspaces.json' → last watcher watches that path
      */
      setupSingleWorktree(registry, resolver, fs);

      await service.start();

      // Registry watcher is the last one created
      const registryWatcher = factory.getWatcher(factory.getWatcherCount() - 1) as FakeFileWatcher;
      expect(registryWatcher.getWatchedPaths()).toContain(REGISTRY_PATH);
    });

    it('should set isWatching() to true after start', async () => {
      /*
      Test Doc:
      - Why: Lifecycle state must be accurate for consumers to check service status
      - Contract: isWatching() returns true after successful start()
      - Usage Notes: Check isWatching() before dispatching manual events
      - Quality Contribution: Prevents operations on stopped service
      - Worked Example: new service → false → start() → true
      */
      setupSingleWorktree(registry, resolver, fs);

      expect(service.isWatching()).toBe(false);
      await service.start();
      expect(service.isWatching()).toBe(true);
    });

    it('should set isWatching() to false after stop', async () => {
      /*
      Test Doc:
      - Why: Lifecycle state must accurately reflect stopped state
      - Contract: isWatching() returns false after stop()
      - Usage Notes: Stop is safe to call, transitions state back to false
      - Quality Contribution: Prevents stale state when service is stopped
      - Worked Example: start() → true → stop() → false
      */
      setupSingleWorktree(registry, resolver, fs);

      await service.start();
      expect(service.isWatching()).toBe(true);

      await service.stop();
      expect(service.isWatching()).toBe(false);
    });

    it('should close all watchers on stop', async () => {
      /*
      Test Doc:
      - Why: AC8 requires stop() to close all watchers and release resources
      - Contract: All IFileWatcher instances closed after stop()
      - Usage Notes: Check isClosed() on every FakeFileWatcher
      - Quality Contribution: Prevents resource leaks from unclosed watchers
      - Worked Example: 2 data + 1 registry → all 3 isClosed() === true after stop()
      */
      setupTwoWorktrees(registry, resolver, fs);

      await service.start();
      await service.stop();

      for (let i = 0; i < factory.getWatcherCount(); i++) {
        expect((factory.getWatcher(i) as FakeFileWatcher).isClosed()).toBe(true);
      }
    });

    it('should preserve adapters after stop (CF-08)', async () => {
      /*
      Test Doc:
      - Why: CF-08 mandates stop() does NOT clear registered adapters
      - Contract: Adapter registered before stop is still active after start/stop/start cycle
      - Usage Notes: This matches production behavior where stop only closes watchers
      - Quality Contribution: Prevents regression where stop clears adapter set
      - Worked Example: registerAdapter → start → stop → start → simulateEvent → adapter receives event
      */
      setupSingleWorktree(registry, resolver, fs);

      const adapter = new FakeWatcherAdapter('persistent');
      service.registerAdapter(adapter);

      await service.start();
      await service.stop();
      await service.start();

      // Simulate event on the new data watcher (watcher index resets after restart)
      const dataWatcher = factory.getWatcher(factory.getWatcherCount() - 2) as FakeFileWatcher;
      dataWatcher.simulateChange('/repo/.chainglass/data/work-graphs/g1/state.json');

      expect(adapter.calls).toHaveLength(1);
    });

    it('should throw "Already watching" on double start', async () => {
      /*
      Test Doc:
      - Why: Interface contract @throws Error if already watching (double-start prevention)
      - Contract: start() rejects when already watching
      - Usage Notes: Validates state machine — prevents resource duplication
      - Quality Contribution: Catches double-start bugs in consumers
      - Worked Example: start() → start() → throws 'Already watching'
      */
      setupSingleWorktree(registry, resolver, fs);

      await service.start();
      await expect(service.start()).rejects.toThrow('Already watching');
    });

    it('should be safe to call stop when not watching', async () => {
      /*
      Test Doc:
      - Why: Robustness — stop() should be safe to call in any state
      - Contract: stop() is a no-op when not watching, no throw
      - Usage Notes: Enables defensive cleanup in consumer code
      - Quality Contribution: Prevents crashes from defensive stop() calls
      - Worked Example: new service → stop() → no throw, isWatching() still false
      */
      await service.stop();
      expect(service.isWatching()).toBe(false);
    });

    it('should start with only registry watcher when no workspaces', async () => {
      /*
      Test Doc:
      - Why: Edge case — empty registry should still watch for new workspace additions
      - Contract: start() with no workspaces creates 1 watcher (registry only)
      - Usage Notes: Service is useful even before workspaces exist
      - Quality Contribution: Ensures service works from fresh install
      - Worked Example: empty registry → start() → factory.getWatcherCount() === 1
      */
      // No workspaces set up

      await service.start();

      expect(factory.getWatcherCount()).toBe(1);
      const registryWatcher = factory.getWatcher(0) as FakeFileWatcher;
      expect(registryWatcher.getWatchedPaths()).toContain(REGISTRY_PATH);
    });

    it('should skip data watchers for worktrees without .chainglass/data/ but still create source watchers', async () => {
      /*
      Test Doc:
      - Why: Robustness — worktree may not have been initialized with chainglass
      - Contract: Only data watchers gate on .chainglass/data/; source watchers created for all worktrees
      - Usage Notes: fs.exists() check prevents data-watching non-existent directories
      - Quality Contribution: Ensures file browser live events work for uninitialized workspaces (FX001)
      - Worked Example: 2 worktrees, 1 has data dir → 1 data + 2 source + 1 registry = 4
      */
      const ws = createTestWorkspace('ws-1', '/repo');
      registry.addWorkspace(ws);
      resolver.setWorktrees('/repo', [
        {
          path: '/repo',
          head: 'abc123',
          branch: 'main',
          isDetached: false,
          isBare: false,
          isPrunable: false,
        },
        {
          path: '/repo-wt',
          head: 'def456',
          branch: 'feature',
          isDetached: false,
          isBare: false,
          isPrunable: false,
        },
      ]);
      // Only set data dir for /repo, NOT /repo-wt
      fs.setDir('/repo/.chainglass/data');

      await service.start();

      // 1 data watcher + 2 source watchers + 1 registry watcher = 4
      expect(factory.getWatcherCount()).toBe(4);

      // Data watcher only for /repo (has .chainglass/data)
      const dataWatcher = factory.findWatcherByPath('/repo/.chainglass/data');
      expect(dataWatcher).toBeDefined();

      // Source watchers for BOTH worktrees (FX001: no data dir gate)
      const sourceWatcher1 = factory.findWatcherByPath('/repo');
      const sourceWatcher2 = factory.findWatcherByPath('/repo-wt');
      expect(sourceWatcher1).toBeDefined();
      expect(sourceWatcher2).toBeDefined();
    });
  });

  // ═════════════════════════════════════════════════════════════
  // T002: Adapter Registration & Event Dispatch Tests (RED)
  // ═════════════════════════════════════════════════════════════

  describe('adapter registration and event dispatch', () => {
    it('should forward file change events to all adapters', async () => {
      /*
      Test Doc:
      - Why: AC3 requires ALL events forwarded to ALL adapters
      - Contract: File 'change' event dispatched to every registered adapter as WatcherEvent
      - Usage Notes: Adapters self-filter; service broadcasts everything
      - Quality Contribution: Core broadcast contract — adapters depend on this
      - Worked Example: 2 adapters, simulateChange → both receive WatcherEvent with eventType: 'change'
      */
      setupSingleWorktree(registry, resolver, fs);

      const adapter1 = new FakeWatcherAdapter('adapter-1');
      const adapter2 = new FakeWatcherAdapter('adapter-2');
      service.registerAdapter(adapter1);
      service.registerAdapter(adapter2);

      await service.start();

      const dataWatcher = factory.getWatcher(0) as FakeFileWatcher;
      dataWatcher.simulateChange('/repo/.chainglass/data/work-graphs/g1/state.json');

      expect(adapter1.calls).toHaveLength(1);
      expect(adapter1.calls[0].eventType).toBe('change');
      expect(adapter2.calls).toHaveLength(1);
      expect(adapter2.calls[0].eventType).toBe('change');
    });

    it('should forward file add events to all adapters', async () => {
      /*
      Test Doc:
      - Why: AC3 requires forwarding add events (new files created)
      - Contract: File 'add' event dispatched as WatcherEvent with eventType: 'add'
      - Usage Notes: New files in data dir trigger 'add' events
      - Quality Contribution: Ensures new file detection works
      - Worked Example: simulateAdd → adapter receives eventType: 'add'
      */
      setupSingleWorktree(registry, resolver, fs);

      const adapter = new FakeWatcherAdapter('test');
      service.registerAdapter(adapter);

      await service.start();

      const dataWatcher = factory.getWatcher(0) as FakeFileWatcher;
      dataWatcher.simulateAdd('/repo/.chainglass/data/new-file.json');

      expect(adapter.calls).toHaveLength(1);
      expect(adapter.calls[0].eventType).toBe('add');
    });

    it('should forward file unlink events to all adapters', async () => {
      /*
      Test Doc:
      - Why: AC3 requires forwarding unlink events (file deletions)
      - Contract: File 'unlink' event dispatched as WatcherEvent with eventType: 'unlink'
      - Usage Notes: Deleted files in data dir trigger 'unlink' events
      - Quality Contribution: Ensures file deletion detection works
      - Worked Example: simulateUnlink → adapter receives eventType: 'unlink'
      */
      setupSingleWorktree(registry, resolver, fs);

      const adapter = new FakeWatcherAdapter('test');
      service.registerAdapter(adapter);

      await service.start();

      const dataWatcher = factory.getWatcher(0) as FakeFileWatcher;
      dataWatcher.simulateUnlink('/repo/.chainglass/data/removed.json');

      expect(adapter.calls).toHaveLength(1);
      expect(adapter.calls[0].eventType).toBe('unlink');
    });

    it('should include correct worktreePath and workspaceSlug', async () => {
      /*
      Test Doc:
      - Why: CF-06 requires WatcherEvent to include worktreePath and workspaceSlug
      - Contract: WatcherEvent fields match the workspace/worktree that owns the watcher
      - Usage Notes: Path metadata resolved from watcher → worktree → workspace mapping
      - Quality Contribution: Adapters depend on correct metadata for domain filtering
      - Worked Example: /repo worktree, ws-1 workspace → WatcherEvent { worktreePath: '/repo', workspaceSlug: 'ws-1' }
      */
      setupSingleWorktree(registry, resolver, fs);

      const adapter = new FakeWatcherAdapter('test');
      service.registerAdapter(adapter);

      await service.start();

      const dataWatcher = factory.getWatcher(0) as FakeFileWatcher;
      dataWatcher.simulateChange('/repo/.chainglass/data/work-graphs/g1/state.json');

      const event = adapter.calls[0];
      expect(event.path).toBe('/repo/.chainglass/data/work-graphs/g1/state.json');
      expect(event.worktreePath).toBe('/repo');
      expect(event.workspaceSlug).toBe('ws-1');
    });

    it('should dispatch to adapter registered after start', async () => {
      /*
      Test Doc:
      - Why: AC2 requires registerAdapter() to work after start()
      - Contract: Late-registered adapter immediately receives events from existing watchers
      - Usage Notes: Watcher event handlers reference live adapter set, not a snapshot
      - Quality Contribution: Enables dynamic adapter registration in production
      - Worked Example: start() → registerAdapter(late) → simulateChange → late adapter receives event
      */
      setupSingleWorktree(registry, resolver, fs);

      await service.start();

      // Register AFTER start
      const adapter = new FakeWatcherAdapter('late');
      service.registerAdapter(adapter);

      const dataWatcher = factory.getWatcher(0) as FakeFileWatcher;
      dataWatcher.simulateChange('/repo/.chainglass/data/file.json');

      expect(adapter.calls).toHaveLength(1);
    });

    it('should dispatch from multiple worktree watchers', async () => {
      /*
      Test Doc:
      - Why: AC1 + AC3 — events from different worktrees must both reach adapters
      - Contract: Events from each worktree's watcher dispatched to all adapters
      - Usage Notes: Each data watcher independently dispatches events
      - Quality Contribution: Ensures multi-worktree setups work correctly
      - Worked Example: 2 worktrees, event from each → adapter receives 2 events with correct metadata
      */
      setupTwoWorktrees(registry, resolver, fs);

      const adapter = new FakeWatcherAdapter('test');
      service.registerAdapter(adapter);

      await service.start();

      const watcher0 = factory.getWatcher(0) as FakeFileWatcher;
      const watcher1 = factory.getWatcher(1) as FakeFileWatcher;

      watcher0.simulateChange('/repo/.chainglass/data/file.json');
      watcher1.simulateChange('/repo-wt/.chainglass/data/file.json');

      expect(adapter.calls).toHaveLength(2);
      expect(adapter.calls[0].worktreePath).toBe('/repo');
      expect(adapter.calls[1].worktreePath).toBe('/repo-wt');
    });
  });

  // ═════════════════════════════════════════════════════════════
  // T003: Registry Watcher Tests (RED)
  // ═════════════════════════════════════════════════════════════

  describe('workspace add/remove via registry watcher', () => {
    it('should create watcher for newly added workspace on rescan', async () => {
      /*
      Test Doc:
      - Why: AC6 requires new workspace → new watcher
      - Contract: rescan() creates watchers for newly discovered worktrees
      - Usage Notes: Call rescan() after adding workspace to registry
      - Quality Contribution: Enables live workspace addition without restart
      - Worked Example: start with 1 workspace → add 2nd → rescan → watcher count increases
      */
      setupSingleWorktree(registry, resolver, fs);

      await service.start();
      const initialCount = factory.getWatcherCount();

      // Add a new workspace
      const ws2 = createTestWorkspace('ws-2', '/repo2');
      registry.addWorkspace(ws2);
      resolver.setWorktrees('/repo2', [
        {
          path: '/repo2',
          head: 'ghi789',
          branch: 'main',
          isDetached: false,
          isBare: false,
          isPrunable: false,
        },
      ]);
      fs.setDir('/repo2/.chainglass/data');

      await service.rescan();

      // Should have created 1 additional data watcher + 1 source watcher
      expect(factory.getWatcherCount()).toBe(initialCount + 2);
    });

    it('should close watcher for removed workspace on rescan', async () => {
      /*
      Test Doc:
      - Why: AC6 requires removed workspace → watcher closed
      - Contract: rescan() closes watchers for worktrees no longer in registry
      - Usage Notes: Remove workspace from registry, then rescan
      - Quality Contribution: Prevents resource leaks from stale watchers
      - Worked Example: start with 1 workspace → remove → rescan → data watcher closed
      */
      setupSingleWorktree(registry, resolver, fs);

      await service.start();

      const dataWatcher = factory.getWatcher(0) as FakeFileWatcher;

      // Remove the workspace
      await registry.remove('ws-1');

      await service.rescan();

      expect(dataWatcher.isClosed()).toBe(true);
    });

    it('should trigger rescan when registry watcher fires change', async () => {
      /*
      Test Doc:
      - Why: AC7 requires registry watcher to trigger rescan on change
      - Contract: Registry file change → rescan → new watcher for new workspace
      - Usage Notes: Simulate change on registry watcher, verify new data watcher created
      - Quality Contribution: Ensures automatic workspace discovery without polling
      - Worked Example: start → add workspace → registry watcher fires change → new data watcher
      */
      setupSingleWorktree(registry, resolver, fs);

      await service.start();
      const initialCount = factory.getWatcherCount();

      // Add a new workspace (simulating registry file edit)
      const ws2 = createTestWorkspace('ws-2', '/repo2');
      registry.addWorkspace(ws2);
      resolver.setWorktrees('/repo2', [
        {
          path: '/repo2',
          head: 'ghi789',
          branch: 'main',
          isDetached: false,
          isBare: false,
          isPrunable: false,
        },
      ]);
      fs.setDir('/repo2/.chainglass/data');

      // Simulate registry file change
      const registryWatcher = factory.getWatcher(factory.getWatcherCount() - 1) as FakeFileWatcher;
      registryWatcher.simulateChange(REGISTRY_PATH);

      // Drain microtask queue so fire-and-forget rescan() completes
      await flushMicrotasks();

      expect(factory.getWatcherCount()).toBeGreaterThan(initialCount);
    });

    it('should not create duplicate watchers on rapid registry changes', async () => {
      /*
      Test Doc:
      - Why: Robustness — rapid registry changes must serialize, not create duplicates
      - Contract: Multiple rapid change events produce same result as one change
      - Usage Notes: isRescanning guard serializes rescan operations
      - Quality Contribution: Prevents resource leak from duplicate watchers
      - Worked Example: start → rapid 3x registry change → only 1 additional watcher created
      */
      setupSingleWorktree(registry, resolver, fs);

      await service.start();

      // Add a new workspace
      const ws2 = createTestWorkspace('ws-2', '/repo2');
      registry.addWorkspace(ws2);
      resolver.setWorktrees('/repo2', [
        {
          path: '/repo2',
          head: 'ghi789',
          branch: 'main',
          isDetached: false,
          isBare: false,
          isPrunable: false,
        },
      ]);
      fs.setDir('/repo2/.chainglass/data');

      // Fire multiple rapid registry changes
      const registryWatcher = factory.getWatcher(factory.getWatcherCount() - 1) as FakeFileWatcher;
      registryWatcher.simulateChange(REGISTRY_PATH);
      registryWatcher.simulateChange(REGISTRY_PATH);
      registryWatcher.simulateChange(REGISTRY_PATH);

      await flushMicrotasks();

      // Count data watchers (excluding registry watchers)
      // Should have: original 1 data + 1 new data + 1 registry = expected watcher count
      // The key assertion: no duplicate watchers for /repo2
      const allWatchers = Array.from(
        { length: factory.getWatcherCount() },
        (_, i) => factory.getWatcher(i) as FakeFileWatcher
      );
      const watchersForRepo2 = allWatchers.filter(
        (w) => !w.isClosed() && w.getWatchedPaths().includes('/repo2/.chainglass/data')
      );
      expect(watchersForRepo2).toHaveLength(1);
    });

    it('should not recreate watchers when queued rescan fires after stop', async () => {
      /*
      Test Doc:
      - Why: V5 — queued rescan running after stop() can recreate watchers, causing inconsistent state
      - Contract: stop() clears queued rescan; rescan() is no-op when not watching
      - Usage Notes: Prevents service from holding open watchers while reporting isWatching()=false
      - Quality Contribution: Ensures stop() is a hard boundary — no zombie watchers
      - Worked Example: start → stop → rescan() → no new watchers created
      */
      setupSingleWorktree(registry, resolver, fs);

      await service.start();
      const countAfterStart = factory.getWatcherCount();

      await service.stop();

      // Add a new workspace that would be discovered on rescan
      const ws2 = createTestWorkspace('ws-2', '/repo2');
      registry.addWorkspace(ws2);
      resolver.setWorktrees('/repo2', [
        {
          path: '/repo2',
          head: 'ghi789',
          branch: 'main',
          isDetached: false,
          isBare: false,
          isPrunable: false,
        },
      ]);
      fs.setDir('/repo2/.chainglass/data');

      // rescan after stop should be a no-op
      await service.rescan();

      // No new watchers should have been created
      expect(factory.getWatcherCount()).toBe(countAfterStart);
    });
  });

  // ═════════════════════════════════════════════════════════════
  // T004: Error Handling Tests (RED)
  // ═════════════════════════════════════════════════════════════

  describe('error handling', () => {
    it('should log and continue when watcher creation fails for one worktree', async () => {
      /*
      Test Doc:
      - Why: Robustness — one failing worktree must not prevent others from being watched
      - Contract: Watcher creation error logged, other worktrees still get watchers
      - Usage Notes: fs.exists() or watcher setup may fail for individual worktrees
      - Quality Contribution: Ensures partial failures are gracefully handled
      - Worked Example: 2 worktrees, 1st fails → 2nd still gets watcher, error logged
      */
      const ws = createTestWorkspace('ws-1', '/repo');
      registry.addWorkspace(ws);
      resolver.setWorktrees('/repo', [
        {
          path: '/repo',
          head: 'abc123',
          branch: 'main',
          isDetached: false,
          isBare: false,
          isPrunable: false,
        },
        {
          path: '/repo-wt',
          head: 'def456',
          branch: 'feature',
          isDetached: false,
          isBare: false,
          isPrunable: false,
        },
      ]);

      // Simulate error checking first worktree's data dir
      fs.simulateError('/repo/.chainglass/data', new Error('Permission denied'));
      fs.setDir('/repo-wt/.chainglass/data');

      await service.start();

      // Should still have at least registry watcher + 1 data watcher for /repo-wt
      // The /repo watcher should have been skipped
      const errorEntries = logger.getEntriesByLevel(LogLevel.ERROR);
      expect(errorEntries.length).toBeGreaterThanOrEqual(1);

      // At least registry watcher + /repo-wt watcher
      expect(factory.getWatcherCount()).toBeGreaterThanOrEqual(2);
    });

    it('should isolate adapter handleEvent exceptions', async () => {
      /*
      Test Doc:
      - Why: Error isolation — one adapter throwing must not crash service or block others
      - Contract: Adapter exception caught, other adapters still receive event, error logged
      - Usage Notes: try/catch per adapter in dispatch loop
      - Quality Contribution: Critical for multi-adapter reliability
      - Worked Example: adapter1 throws, adapter2 still receives event
      */
      setupSingleWorktree(registry, resolver, fs);

      const throwingAdapter: FakeWatcherAdapter & { handleEvent: (event: WatcherEvent) => void } =
        new FakeWatcherAdapter('thrower');
      const originalHandle = throwingAdapter.handleEvent.bind(throwingAdapter);
      // Override handleEvent to throw after recording
      throwingAdapter.handleEvent = (event: WatcherEvent) => {
        originalHandle(event);
        throw new Error('Adapter exploded');
      };

      const healthyAdapter = new FakeWatcherAdapter('healthy');

      service.registerAdapter(throwingAdapter);
      service.registerAdapter(healthyAdapter);

      await service.start();

      const dataWatcher = factory.getWatcher(0) as FakeFileWatcher;
      dataWatcher.simulateChange('/repo/.chainglass/data/file.json');

      // Healthy adapter should still receive the event
      expect(healthyAdapter.calls).toHaveLength(1);

      // Error should be logged
      const errorEntries = logger.getEntriesByLevel(LogLevel.ERROR);
      expect(errorEntries.length).toBeGreaterThanOrEqual(1);
    });

    it('should log and continue when registry read fails during rescan', async () => {
      /*
      Test Doc:
      - Why: Robustness — registry read failure during rescan must not crash service
      - Contract: Registry read error logged, service continues watching existing watchers
      - Usage Notes: Inject list error on registry adapter after start
      - Quality Contribution: Ensures service stability during transient registry failures
      - Worked Example: start → inject list error → rescan → error logged, existing watchers preserved
      */
      setupSingleWorktree(registry, resolver, fs);

      await service.start();

      const dataWatcher = factory.getWatcher(0) as FakeFileWatcher;

      // Override registry.list to throw (fake doesn't support error injection on list)
      registry.list = async () => {
        throw new Error('Registry corrupted');
      };

      await service.rescan();

      // Service should still be watching
      expect(service.isWatching()).toBe(true);

      // Existing data watcher must NOT be closed (V4: preserve watchers on error)
      expect(dataWatcher.isClosed()).toBe(false);

      // Error should be logged
      const errorEntries = logger.getEntriesByLevel(LogLevel.ERROR);
      expect(errorEntries.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ═════════════════════════════════════════════════════════════
  // T009: Source Watcher Tests (Plan 045)
  // ═════════════════════════════════════════════════════════════

  describe('source watchers (Plan 045)', () => {
    it('should create source watcher per worktree watching worktree root', async () => {
      setupSingleWorktree(registry, resolver, fs);

      await service.start();

      // Find the source watcher (watches /repo root, not /repo/.chainglass/data)
      const sourceWatcher = factory.findWatcherByPath('/repo');
      expect(sourceWatcher).toBeDefined();
      expect(sourceWatcher?.getWatchedPaths()).toContain('/repo');
    });

    it('should create source watchers for multiple worktrees', async () => {
      setupTwoWorktrees(registry, resolver, fs);

      await service.start();

      const sourceWatcher1 = factory.findWatcherByPath('/repo');
      const sourceWatcher2 = factory.findWatcherByPath('/repo-wt');
      expect(sourceWatcher1).toBeDefined();
      expect(sourceWatcher2).toBeDefined();
    });

    it('should configure source watchers with ignored patterns', async () => {
      setupSingleWorktree(registry, resolver, fs);

      await service.start();

      const sourceWatcher = factory.findWatcherByPath('/repo');
      expect(sourceWatcher).toBeDefined();
      expect(sourceWatcher?.options.ignored).toBeDefined();
      expect(sourceWatcher?.options.ignored?.length).toBeGreaterThan(0);
    });

    it('should dispatch source watcher events to adapters', async () => {
      setupSingleWorktree(registry, resolver, fs);
      const adapter = new FakeWatcherAdapter('test-adapter');
      service.registerAdapter(adapter);

      await service.start();

      const sourceWatcher = factory.findWatcherByPath('/repo');
      sourceWatcher?.simulateChange('/repo/src/app.tsx');

      expect(adapter.calls).toHaveLength(1);
      expect(adapter.calls[0].path).toBe('/repo/src/app.tsx');
      expect(adapter.calls[0].eventType).toBe('change');
      expect(adapter.calls[0].worktreePath).toBe('/repo');
    });

    it('should close source watchers on stop', async () => {
      setupSingleWorktree(registry, resolver, fs);

      await service.start();

      const sourceWatcher = factory.findWatcherByPath('/repo');

      await service.stop();

      expect(sourceWatcher?.isClosed()).toBe(true);
    });

    it('should not block data watchers if source watcher creation fails', async () => {
      const ws = createTestWorkspace('ws-1', '/repo');
      registry.addWorkspace(ws);
      resolver.setWorktrees('/repo', [
        {
          path: '/repo',
          head: 'abc123',
          branch: 'main',
          isDetached: false,
          isBare: false,
          isPrunable: false,
        },
      ]);
      fs.setDir('/repo/.chainglass/data');

      // Make factory throw on the 2nd call (source watcher)
      // Data watcher = call 1, source watcher = call 2, registry watcher = call 3
      let createCount = 0;
      const originalCreate = factory.create.bind(factory);
      factory.create = (options) => {
        createCount++;
        if (createCount === 2) {
          throw new Error('Source watcher creation failed');
        }
        return originalCreate(options);
      };

      await service.start();

      // Service should still be watching (data watchers succeeded)
      expect(service.isWatching()).toBe(true);

      // Data watcher should exist
      const dataWatcher = factory.findWatcherByPath('/repo/.chainglass/data');
      expect(dataWatcher).toBeDefined();

      // Error should be logged
      const errorEntries = logger.getEntriesByLevel(LogLevel.ERROR);
      expect(errorEntries.length).toBeGreaterThanOrEqual(1);
    });

    it('should close source watchers for removed worktrees on rescan', async () => {
      setupSingleWorktree(registry, resolver, fs);

      await service.start();

      const sourceWatcher = factory.findWatcherByPath('/repo');

      // Remove the workspace
      await registry.remove('ws-1');

      await service.rescan();

      expect(sourceWatcher?.isClosed()).toBe(true);
    });

    it('should create source watchers for workspaces without .chainglass/data/ (FX001)', async () => {
      /*
      Test Doc:
      - Why: FX001 bug — workspaces without .chainglass/data/ got no source watchers
      - Contract: Source watchers are created for ALL registered worktrees regardless of data dir
      - Usage Notes: Directly tests the bug scenario — workspace added but never initialized
      - Quality Contribution: Prevents regression of cross-workspace file watching
      - Worked Example: 1 workspace, no data dir → 0 data + 1 source + 1 registry = 2
      */
      const ws = createTestWorkspace('ws-1', '/repo');
      registry.addWorkspace(ws);
      resolver.setWorktrees('/repo', [
        {
          path: '/repo',
          head: 'abc123',
          branch: 'main',
          isDetached: false,
          isBare: false,
          isPrunable: false,
        },
      ]);
      // Deliberately do NOT set fs.setDir('/repo/.chainglass/data')

      await service.start();

      // 0 data watchers + 1 source watcher + 1 registry watcher = 2
      expect(factory.getWatcherCount()).toBe(2);

      // Source watcher exists and watches worktree root
      const sourceWatcher = factory.findWatcherByPath('/repo');
      expect(sourceWatcher).toBeDefined();
      expect(sourceWatcher?.getWatchedPaths()).toContain('/repo');

      // No data watcher (no .chainglass/data/)
      const dataWatcher = factory.findWatcherByPath('/repo/.chainglass/data');
      expect(dataWatcher).toBeUndefined();
    });

    it('should dispatch events from source watchers on workspaces without data dir (FX001)', async () => {
      /*
      Test Doc:
      - Why: FX001 — verify the full pipeline works for uninitialized workspaces
      - Contract: Source watcher events dispatch to adapters even without .chainglass/data/
      */
      const ws = createTestWorkspace('ws-1', '/repo');
      registry.addWorkspace(ws);
      resolver.setWorktrees('/repo', [
        {
          path: '/repo',
          head: 'abc123',
          branch: 'main',
          isDetached: false,
          isBare: false,
          isPrunable: false,
        },
      ]);
      // No .chainglass/data/ directory

      const adapter = new FakeWatcherAdapter('test-adapter');
      service.registerAdapter(adapter);

      await service.start();

      const sourceWatcher = factory.findWatcherByPath('/repo');
      sourceWatcher?.simulateChange('/repo/src/app.tsx');

      expect(adapter.calls).toHaveLength(1);
      expect(adapter.calls[0].path).toBe('/repo/src/app.tsx');
      expect(adapter.calls[0].eventType).toBe('change');
      expect(adapter.calls[0].worktreePath).toBe('/repo');
      expect(adapter.calls[0].workspaceSlug).toBe('ws-1');
    });

    it('should create source watchers for new workspaces without data dir on rescan (FX001)', async () => {
      /*
      Test Doc:
      - Why: FX001 — rescan path must also create source watchers for uninitialized workspaces
      - Contract: rescan() discovers new workspaces and creates source watchers regardless of data dir
      - Worked Example: start with ws-1 (has data), add ws-2 (no data) → rescan → source watcher for ws-2
      */
      setupSingleWorktree(registry, resolver, fs);

      await service.start();
      const initialCount = factory.getWatcherCount();

      // Add a new workspace WITHOUT .chainglass/data/
      const ws2 = createTestWorkspace('ws-2', '/repo2');
      registry.addWorkspace(ws2);
      resolver.setWorktrees('/repo2', [
        {
          path: '/repo2',
          head: 'ghi789',
          branch: 'main',
          isDetached: false,
          isBare: false,
          isPrunable: false,
        },
      ]);
      // Deliberately do NOT set fs.setDir('/repo2/.chainglass/data')

      await service.rescan();

      // Should have created 1 source watcher (no data watcher — no data dir)
      expect(factory.getWatcherCount()).toBe(initialCount + 1);

      // Source watcher exists for the new workspace
      const sourceWatcher = factory.findWatcherByPath('/repo2');
      expect(sourceWatcher).toBeDefined();
    });
  });
});
