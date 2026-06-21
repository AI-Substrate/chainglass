/**
 * Polling file-watcher integration tests (Plan 085).
 *
 * Two layers, both driven through the env-selecting FileWatcherFactory with
 * CHAINGLASS_WATCH_POLLING forced on — real filesystem, no mocks:
 *
 * 1. End-to-end lifecycle: env → FileWatcherFactory → PollingFileWatcherAdapter
 *    emits add/change/unlink/addDir within the interval; ignored dirs (node_modules)
 *    are never walked (no events surface from inside them).
 * 2. Consumer ripple: the real CentralWatcherService, given the selecting factory
 *    forced to polling, still delivers the same notifications to its adapters.
 *    (Re-running the feature-023 suite with the env set proves nothing — that test
 *    hardcodes `new NativeFileWatcherFactory()` and bypasses the env/selecting
 *    factory — so we wire the consumer to the polling factory directly here.)
 */

import { mkdir, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NodeFileSystemAdapter } from '@chainglass/shared';
import {
  CentralWatcherService,
  FakeGitWorktreeResolver,
  FakeWatcherAdapter,
  FakeWorkspaceRegistryAdapter,
  FileWatcherFactory,
  type IFileWatcher,
  PollingFileWatcherAdapter,
  Workspace,
} from '@chainglass/workflow';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Env that forces polling with a fast interval for tests. */
const POLLING_ENV: NodeJS.ProcessEnv = {
  ...process.env,
  CHAINGLASS_WATCH_POLLING: 'true',
  CHAINGLASS_WATCH_POLL_INTERVAL: '120',
};

const SETTLE = 420; // a few poll intervals + margin

interface Captured {
  event: string;
  path: string;
}

describe('Plan 085: env-forced polling via FileWatcherFactory', () => {
  let tempDir: string;
  let watcher: IFileWatcher | undefined;

  beforeEach(async () => {
    tempDir = join(tmpdir(), `polling-int-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    if (watcher) {
      await watcher.close();
      watcher = undefined;
    }
    try {
      await rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  function startForcedPolling(options: Record<string, unknown> = {}): Captured[] {
    const factory = new FileWatcherFactory(POLLING_ENV);
    watcher = factory.create({ ignoreInitial: true, ...options });
    // The whole point: the env selects the polling adapter.
    expect(watcher).toBeInstanceOf(PollingFileWatcherAdapter);
    const captured: Captured[] = [];
    for (const event of ['add', 'change', 'unlink', 'addDir'] as const) {
      watcher.on(event, (p) => captured.push({ event, path: p as string }));
    }
    watcher.add(tempDir);
    return captured;
  }

  it('AC2/AC3: detects add, change, and unlink within the interval', async () => {
    const events = startForcedPolling();
    await sleep(SETTLE); // seed baseline (ignoreInitial → silent)

    const file = join(tempDir, 'live.txt');
    await writeFile(file, 'one');
    await sleep(SETTLE);
    expect(events.some((e) => e.event === 'add' && e.path === file)).toBe(true);

    await writeFile(file, 'one + two (longer)');
    await sleep(SETTLE);
    expect(events.some((e) => e.event === 'change' && e.path === file)).toBe(true);

    await unlink(file);
    await sleep(SETTLE);
    expect(events.some((e) => e.event === 'unlink' && e.path === file)).toBe(true);
  });

  it('AC3: detects a new directory as addDir', async () => {
    const events = startForcedPolling();
    await sleep(SETTLE);

    const dir = join(tempDir, 'fresh-dir');
    await mkdir(dir);
    await sleep(SETTLE);
    expect(events.some((e) => e.event === 'addDir' && e.path === dir)).toBe(true);
  });

  it('AC4: never walks or emits events from an ignored dir (node_modules)', async () => {
    const events = startForcedPolling({
      ignored: [(p: string) => p.split('/').includes('node_modules')],
    });
    await sleep(SETTLE);

    // A whole subtree under an ignored dir — none of it should surface.
    await mkdir(join(tempDir, 'node_modules', 'pkg', 'deep'), { recursive: true });
    await writeFile(join(tempDir, 'node_modules', 'pkg', 'deep', 'index.js'), 'ignored');
    // A sibling that IS visible, to prove the watcher is otherwise live.
    await writeFile(join(tempDir, 'visible.txt'), 'seen');
    await sleep(SETTLE);

    expect(events.some((e) => e.path.includes('node_modules'))).toBe(false);
    expect(events.some((e) => e.event === 'add' && e.path.endsWith('visible.txt'))).toBe(true);
  });
});

describe('Plan 085: consumer ripple — CentralWatcherService under polling', () => {
  let tempDir: string;
  let registryPath: string;
  let workspacePath: string;
  let service: CentralWatcherService;

  let realFilesystem: NodeFileSystemAdapter;
  let pollingFactory: FileWatcherFactory;
  let fakeRegistry: FakeWorkspaceRegistryAdapter;
  let fakeWorktreeResolver: FakeGitWorktreeResolver;

  beforeEach(async () => {
    tempDir = join(tmpdir(), `cws-polling-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    registryPath = join(tempDir, 'config', 'workspaces.json');
    workspacePath = join(tempDir, 'workspace1');

    await mkdir(join(tempDir, 'config'), { recursive: true });
    await mkdir(join(workspacePath, '.chainglass', 'data', 'work-graphs', 'demo-graph'), {
      recursive: true,
    });
    await writeFile(
      join(workspacePath, '.chainglass', 'data', 'work-graphs', 'demo-graph', 'state.json'),
      JSON.stringify({ nodes: [] })
    );

    realFilesystem = new NodeFileSystemAdapter();
    // The only difference vs the feature-023 native test: the selecting factory,
    // env-forced to polling. Everything downstream is identical.
    pollingFactory = new FileWatcherFactory(POLLING_ENV);

    fakeRegistry = new FakeWorkspaceRegistryAdapter();
    fakeWorktreeResolver = new FakeGitWorktreeResolver();

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

    service = new CentralWatcherService(
      fakeRegistry,
      fakeWorktreeResolver,
      realFilesystem,
      pollingFactory,
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

  it('delivers a file change to registered adapters when driven by the polling watcher', async () => {
    const fakeAdapter = new FakeWatcherAdapter('test-adapter');
    service.registerAdapter(fakeAdapter);
    await service.start();
    await sleep(300); // let the polling baseline seed

    const stateFile = join(
      workspacePath,
      '.chainglass',
      'data',
      'work-graphs',
      'demo-graph',
      'state.json'
    );
    await writeFile(stateFile, JSON.stringify({ nodes: [{ id: 'new' }] }));

    // poll interval (120) + awaitWriteFinish stabilization + margin
    await sleep(1000);

    expect(fakeAdapter.calls.length).toBeGreaterThanOrEqual(1);
    expect(fakeAdapter.calls[0].path).toBe(stateFile);
    expect(['add', 'change']).toContain(fakeAdapter.calls[0].eventType);
    expect(fakeAdapter.calls[0].worktreePath).toBe(workspacePath);
    expect(fakeAdapter.calls[0].workspaceSlug).toBe('ws1');
  });

  it('stops delivering events after stop()', async () => {
    const fakeAdapter = new FakeWatcherAdapter('test-adapter');
    service.registerAdapter(fakeAdapter);
    await service.start();
    await sleep(300);

    await service.stop();
    await sleep(200); // let any in-flight scan drain
    fakeAdapter.calls.length = 0;

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
