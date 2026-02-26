/**
 * CentralWatcherService + WorkGraphWatcherAdapter integration tests.
 *
 * Per Plan 023: Central Watcher Notifications - Phase 4
 * Tests the full event pipeline with real chokidar file watchers
 * and real filesystem operations in temp directories.
 *
 * Uses REAL chokidar + REAL filesystem (NodeFileSystemAdapter).
 * Uses FAKE registry + worktree resolver for controlled test state.
 */

import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NodeFileSystemAdapter } from '@chainglass/shared';
import {
  CentralWatcherService,
  ChokidarFileWatcherFactory,
  FakeGitWorktreeResolver,
  FakeWatcherAdapter,
  FakeWorkspaceRegistryAdapter,
  type WorkGraphChangedEvent,
  WorkGraphWatcherAdapter,
  Workspace,
} from '@chainglass/workflow';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

/** Helper to sleep for a given number of milliseconds. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('CentralWatcherService + WorkGraphWatcherAdapter integration', () => {
  let tempDir: string;
  let registryPath: string;
  let workspacePath: string;
  let service: CentralWatcherService;

  // Real implementations
  let realFilesystem: NodeFileSystemAdapter;
  let realWatcherFactory: ChokidarFileWatcherFactory;

  // Controlled fakes
  let fakeRegistry: FakeWorkspaceRegistryAdapter;
  let fakeWorktreeResolver: FakeGitWorktreeResolver;

  beforeEach(async () => {
    // Create unique temp directory for this test
    tempDir = join(
      tmpdir(),
      `cws-integration-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    registryPath = join(tempDir, 'config', 'workspaces.json');
    workspacePath = join(tempDir, 'workspace1');

    // Create directory structure
    await mkdir(join(tempDir, 'config'), { recursive: true });
    await mkdir(join(workspacePath, '.chainglass', 'data', 'work-graphs', 'demo-graph'), {
      recursive: true,
    });

    // Write initial state.json (chokidar ignoreInitial=true, so 'change' requires existing file)
    await writeFile(
      join(workspacePath, '.chainglass', 'data', 'work-graphs', 'demo-graph', 'state.json'),
      JSON.stringify({ nodes: [] })
    );

    // Real infrastructure
    realFilesystem = new NodeFileSystemAdapter();
    realWatcherFactory = new ChokidarFileWatcherFactory();

    // Controlled fakes
    fakeRegistry = new FakeWorkspaceRegistryAdapter();
    fakeWorktreeResolver = new FakeGitWorktreeResolver();

    // Configure fakes
    const workspace = Workspace.create({
      slug: 'ws1',
      name: 'Test Workspace',
      path: workspacePath,
    });
    fakeRegistry.addWorkspace(workspace);

    fakeWorktreeResolver.setWorktrees(workspacePath, [
      {
        path: workspacePath,
        head: 'abc123def456abc123def456abc123def456abc1',
        branch: 'main',
        isDetached: false,
        isBare: false,
        isPrunable: false,
      },
    ]);

    // Create service with real filesystem + watcher, fake registry + resolver
    service = new CentralWatcherService(
      fakeRegistry,
      fakeWorktreeResolver,
      realFilesystem,
      realWatcherFactory,
      registryPath
    );
  });

  afterEach(async () => {
    if (service?.isWatching()) {
      await service.stop();
    }
    try {
      await rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('CentralWatcherService integration', () => {
    it('should detect file creation via real chokidar', async () => {
      /*
      Test Doc:
      - Why: Proves real chokidar watcher detects file events and service dispatches them to adapters
      - Contract: File write → chokidar → CentralWatcherService → FakeWatcherAdapter.calls[] with correct WatcherEvent
      - Usage Notes: Uses poll-based capture (sleep then check calls[]). Assert on `path` not `filePath` — WatcherEvent uses `path`.
      - Quality Contribution: Catches chokidar config, path resolution, or event dispatch integration issues
      - Worked Example: writeFile(state.json) → sleep(1000) → calls[0].path ends with state.json, eventType='change'
      */
      const fakeAdapter = new FakeWatcherAdapter('test-adapter');
      service.registerAdapter(fakeAdapter);
      await service.start();
      await sleep(200); // chokidar init

      const stateFile = join(
        workspacePath,
        '.chainglass',
        'data',
        'work-graphs',
        'demo-graph',
        'state.json'
      );
      await writeFile(stateFile, JSON.stringify({ nodes: [{ id: 'new' }] }));

      // Poll-based: wait for chokidar + awaitWriteFinish (~300ms) + margin
      await sleep(1000);

      expect(fakeAdapter.calls.length).toBeGreaterThanOrEqual(1);
      expect(fakeAdapter.calls[0].path).toBe(stateFile);
      expect(fakeAdapter.calls[0].eventType).toBe('change');
      expect(fakeAdapter.calls[0].worktreePath).toBe(workspacePath);
      expect(fakeAdapter.calls[0].workspaceSlug).toBe('ws1');
    });

    it('should not receive events after stop()', async () => {
      /*
      Test Doc:
      - Why: Proves stop() closes chokidar watchers and no events leak through
      - Contract: start() → stop() → writeFile → no events dispatched to adapter
      - Usage Notes: 500ms "no event" wait is safe — stopped service should NEVER dispatch events
      - Quality Contribution: Catches watcher leak bugs where stop() fails to close chokidar instances
      - Worked Example: start() → stop() → writeFile(state.json) → sleep(500) → calls.length === 0
      */
      const fakeAdapter = new FakeWatcherAdapter('test-adapter');
      service.registerAdapter(fakeAdapter);
      await service.start();
      await sleep(200); // chokidar init

      await service.stop();

      const stateFile = join(
        workspacePath,
        '.chainglass',
        'data',
        'work-graphs',
        'demo-graph',
        'state.json'
      );
      await writeFile(stateFile, JSON.stringify({ nodes: [{ id: 'after-stop' }] }));

      await sleep(500);

      expect(fakeAdapter.calls).toHaveLength(0);
    });
  });

  describe('WorkGraphWatcherAdapter end-to-end', () => {
    it('should detect state.json write via workgraph adapter end-to-end', async () => {
      /*
      Test Doc:
      - Why: Proves the full pipeline from file write to domain event callback
      - Contract: writeFile(state.json) → chokidar → CentralWatcherService → WorkGraphWatcherAdapter → onGraphChanged callback with all 5 WorkGraphChangedEvent fields correct (CF-09)
      - Usage Notes: Uses promise-resolve-from-callback bridge (adapter has no promise API). 5s Promise.race timeout.
      - Quality Contribution: Catches event field mapping, regex extraction, or dispatch chain integration issues
      - Worked Example: writeFile(state.json) → callback fires with { graphSlug: 'demo-graph', workspaceSlug: 'ws1', filePath: stateFile, timestamp: Date }
      */
      let resolveEvent: (event: WorkGraphChangedEvent) => void;
      const eventPromise = new Promise<WorkGraphChangedEvent>((resolve) => {
        resolveEvent = resolve;
      });

      const adapter = new WorkGraphWatcherAdapter();
      adapter.onGraphChanged((event) => {
        resolveEvent(event);
      });

      service.registerAdapter(adapter);
      await service.start();
      await sleep(200); // chokidar init

      const stateFile = join(
        workspacePath,
        '.chainglass',
        'data',
        'work-graphs',
        'demo-graph',
        'state.json'
      );
      await writeFile(stateFile, JSON.stringify({ nodes: [{ id: 'pipeline' }] }));

      const event = await Promise.race([
        eventPromise,
        sleep(5000).then(() => {
          throw new Error('Timeout: No WorkGraphChangedEvent received within 5 seconds');
        }),
      ]);

      expect(event.graphSlug).toBe('demo-graph');
      expect(event.workspaceSlug).toBe('ws1');
      expect(event.worktreePath).toBe(workspacePath);
      expect(event.filePath).toBe(stateFile);
      expect(event.timestamp).toBeInstanceOf(Date);
    });

    it.skip('should not emit WorkGraphChangedEvent for non-matching files', async () => {
      /*
      Test Doc:
      - Why: Proves the adapter's self-filtering works end-to-end with real chokidar events
      - Contract: writeFile(layout.json) → chokidar → service → adapter filters it out → zero WorkGraphChangedEvent
      - Usage Notes: 500ms "no event" wait is safe — layout.json should NEVER match the state.json regex
      - Quality Contribution: Catches regex filter bugs that unit tests with synthetic events might miss
      - Worked Example: writeFile(layout.json) → sleep(500) → events.length === 0
      */
      const events: WorkGraphChangedEvent[] = [];
      const adapter = new WorkGraphWatcherAdapter();
      adapter.onGraphChanged((event) => events.push(event));

      service.registerAdapter(adapter);
      await service.start();
      await sleep(200); // chokidar init

      const layoutFile = join(
        workspacePath,
        '.chainglass',
        'data',
        'work-graphs',
        'demo-graph',
        'layout.json'
      );
      await writeFile(layoutFile, JSON.stringify({ layout: {} }));

      await sleep(500);

      expect(events).toHaveLength(0);
    });
  });
});
