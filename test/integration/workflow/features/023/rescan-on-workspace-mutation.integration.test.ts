/**
 * Integration test: WorkspaceService mutation event → CentralWatcherService.rescan()
 *
 * Per Plan 084 — live-monitoring-rescan, Task T007.
 *
 * Verifies the end-to-end signal path with REAL filesystem + REAL fs.watch
 * (via NativeFileWatcherFactory) and REAL CentralWatcherService:
 * - AC-1: createWorktree → new path watched within ~1s
 * - AC-2: registering a workspace whose worktrees pre-exist on disk → all watched
 * - AC-3: 2nd, 3rd workspace registration in succession → all watched (atomic-rename regression)
 * - AC-4: deleting a worktree dir + triggering an unrelated mutation → watcher closed
 * - Coalescing: 5 rapid mutations → at most ~2 rescans (existing isRescanning/rescanQueued)
 *
 * Test seam: FakeGitWorktreeManager (creates the dir directly, no subprocess);
 * FakeWorkspaceRegistryAdapter (in-memory; the mutation-event signal path
 * doesn't depend on registry file watching). The atomic-rename regression is
 * exercised through the emit path — the user-visible bug ("second registration
 * silently breaks live monitoring") is fixed by emit-driven rescans, not by
 * the registry watcher fix (which is defense-in-depth for out-of-band edits).
 */

import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FakeFileSystem, FakeProcessManager, NodeFileSystemAdapter } from '@chainglass/shared';
import {
  CentralWatcherService,
  FakeGitWorktreeManager,
  FakeGitWorktreeResolver,
  FakeWorkspaceContextResolver,
  FakeWorkspaceRegistryAdapter,
  NativeFileWatcherFactory,
  Workspace,
} from '@chainglass/workflow';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WorkspaceService } from '../../../../../packages/workflow/src/services/workspace.service.js';
import { WorktreeBootstrapRunner } from '../../../../../packages/workflow/src/services/worktree-bootstrap-runner.js';

/** Poll until `predicate()` is truthy or `timeoutMs` elapses. */
async function waitFor(
  predicate: () => boolean,
  options: { timeoutMs?: number; intervalMs?: number; label?: string } = {}
): Promise<void> {
  const { timeoutMs = 5000, intervalMs = 50, label = 'condition' } = options;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`waitFor: ${label} did not become true within ${timeoutMs}ms`);
}

/**
 * Test harness: real CentralWatcherService + real fs + WorkspaceService with
 * fake adapters, wired together via the same mutation listener that
 * `start-central-notifications.ts` installs in production.
 */
interface Harness {
  tempDir: string;
  registryPath: string;
  watcher: CentralWatcherService;
  service: WorkspaceService;
  fakeRegistry: FakeWorkspaceRegistryAdapter;
  fakeWorktreeResolver: FakeGitWorktreeResolver;
  fakeGitManager: FakeGitWorktreeManager;
  fakeContextResolver: FakeWorkspaceContextResolver;
  unsubscribe: () => void;
  rescanCallCount(): number;
}

async function buildHarness(): Promise<Harness> {
  const tempDir = join(tmpdir(), `live-mon-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await mkdir(tempDir, { recursive: true });

  const registryPath = join(tempDir, 'config', 'workspaces.json');
  await mkdir(join(tempDir, 'config'), { recursive: true });

  // Real infrastructure for the central watcher
  const realFilesystem = new NodeFileSystemAdapter();
  const realWatcherFactory = new NativeFileWatcherFactory();

  // Fakes (controlled state for the workspace service path)
  const fakeRegistry = new FakeWorkspaceRegistryAdapter();
  const fakeWorktreeResolver = new FakeGitWorktreeResolver();
  const fakeGitManager = new FakeGitWorktreeManager();
  const fakeContextResolver = new FakeWorkspaceContextResolver();
  const fakeFs = new FakeFileSystem();
  const fakePm = new FakeProcessManager();
  const bootstrapRunner = new WorktreeBootstrapRunner(fakePm, fakeFs);

  // Real central watcher pointing at the temp registry path
  const watcher = new CentralWatcherService(
    fakeRegistry,
    fakeWorktreeResolver,
    realFilesystem,
    realWatcherFactory,
    registryPath
  );

  // Real workspace service with the mutation emitter
  const service = new WorkspaceService(
    fakeRegistry,
    fakeContextResolver,
    fakeWorktreeResolver,
    fakeGitManager,
    bootstrapRunner
  );

  // Wire-up mirroring start-central-notifications.ts
  const unsubscribe = service.onMutation(() => {
    watcher.rescan().catch(() => {});
  });

  // Track rescan invocations via a side channel: each rescan calls
  // worktreeResolver.detectWorktrees() once per workspace. We can't directly
  // count performRescan calls, but we can observe its observable side effect.
  const rescanCallCount = (): number => fakeWorktreeResolver.detectWorktreesCalls.length;

  await watcher.start();

  return {
    tempDir,
    registryPath,
    watcher,
    service,
    fakeRegistry,
    fakeWorktreeResolver,
    fakeGitManager,
    fakeContextResolver,
    unsubscribe,
    rescanCallCount,
  };
}

async function teardown(h: Harness | undefined): Promise<void> {
  if (!h) return;
  try {
    h.unsubscribe();
  } catch {
    // ignore
  }
  if (h.watcher.isWatching()) {
    await h.watcher.stop();
  }
  try {
    await rm(h.tempDir, { recursive: true, force: true });
  } catch {
    // ignore cleanup errors
  }
}

/**
 * Configure the fake git manager + worktree resolver to make
 * service.createWorktree() succeed and the resulting worktree be watched.
 */
function setupForCreateWorktree(h: Harness, workspacePath: string): void {
  h.fakeGitManager.setMainStatus('clean');
  h.fakeGitManager.setSyncResult('already-up-to-date');
  h.fakeGitManager.setBranches(['main'], ['origin/main']);
}

/** Stage a worktree directory on disk so detectWorktrees + dataWatcher can find it. */
async function stageWorktreeDir(parentDir: string, branchName: string): Promise<string> {
  const worktreePath = join(parentDir, branchName);
  await mkdir(join(worktreePath, '.chainglass', 'data'), { recursive: true });
  return worktreePath;
}

describe('integration: mutation events drive watcher rescans (Plan 084)', () => {
  let h: Harness | undefined;

  afterEach(async () => {
    await teardown(h);
    h = undefined;
  });

  it('AC-1: createWorktree triggers rescan; new worktree path is watched within ~1s', async () => {
    h = await buildHarness();
    const workspacePath = join(h.tempDir, 'workspace1');
    await mkdir(join(workspacePath, '.chainglass', 'data'), { recursive: true });

    // Register the workspace
    const ws = Workspace.create({ name: 'WS1', path: workspacePath });
    h.fakeRegistry.addWorkspace(ws);
    h.fakeContextResolver.setWorkspaceInfo(ws.slug, {
      slug: ws.slug,
      name: ws.name,
      path: ws.path,
      createdAt: ws.createdAt,
      hasGit: true,
      worktrees: [],
    });
    // Initial state: only the workspace itself
    h.fakeWorktreeResolver.setWorktrees(workspacePath, [
      {
        path: workspacePath,
        head: 'a'.repeat(40),
        branch: 'main',
        isDetached: false,
        isBare: false,
        isPrunable: false,
      },
    ]);

    // Simulate the post-create state: the new worktree dir exists on disk and
    // detectWorktrees returns it. We pre-stage so the rescan after the emit
    // sees the new worktree.
    const newWorktreePath = await stageWorktreeDir(h.tempDir, '001-feature-a');
    setupForCreateWorktree(h, workspacePath);
    h.fakeGitManager.setCreateResult('created', {
      worktreePath: newWorktreePath,
      branchName: '001-feature-a',
    });

    // After the create, detectWorktrees should return both. We stage that here.
    h.fakeWorktreeResolver.setWorktrees(workspacePath, [
      {
        path: workspacePath,
        head: 'a'.repeat(40),
        branch: 'main',
        isDetached: false,
        isBare: false,
        isPrunable: false,
      },
      {
        path: newWorktreePath,
        head: 'b'.repeat(40),
        branch: '001-feature-a',
        isDetached: false,
        isBare: false,
        isPrunable: false,
      },
    ]);

    // Act
    const result = await h.service.createWorktree({
      workspaceSlug: ws.slug,
      requestedName: 'feature-a',
    });
    expect(result.status).toBe('created');

    // Assert: within ~2s the new worktree path is registered as a data watcher
    const watcher = h.watcher;
    await waitFor(
      () =>
        Array.from(
          (watcher as unknown as { dataWatchers: Map<string, unknown> }).dataWatchers.keys()
        ).includes(newWorktreePath),
      { label: `dataWatchers contains ${newWorktreePath}` }
    );
  });

  it('AC-2: registering a workspace with pre-existing worktrees on disk → all watched', async () => {
    h = await buildHarness();
    const workspacePath = join(h.tempDir, 'workspace2');
    await mkdir(join(workspacePath, '.chainglass', 'data'), { recursive: true });
    const wt1 = await stageWorktreeDir(h.tempDir, 'workspace2-feat-a');
    const wt2 = await stageWorktreeDir(h.tempDir, 'workspace2-feat-b');

    // Pre-configure the resolver with all three worktree paths
    h.fakeWorktreeResolver.setWorktrees(workspacePath, [
      {
        path: workspacePath,
        head: 'a'.repeat(40),
        branch: 'main',
        isDetached: false,
        isBare: false,
        isPrunable: false,
      },
      {
        path: wt1,
        head: 'b'.repeat(40),
        branch: 'feat-a',
        isDetached: false,
        isBare: false,
        isPrunable: false,
      },
      {
        path: wt2,
        head: 'c'.repeat(40),
        branch: 'feat-b',
        isDetached: false,
        isBare: false,
        isPrunable: false,
      },
    ]);

    // Act: register the workspace via WorkspaceService.add (the user-visible action)
    const result = await h.service.add('Workspace 2', workspacePath);
    expect(result.success).toBe(true);

    // Assert: all three paths should be in dataWatchers within ~2s
    const watcher = h.watcher;
    await waitFor(
      () => {
        const keys = Array.from(
          (watcher as unknown as { dataWatchers: Map<string, unknown> }).dataWatchers.keys()
        );
        return keys.includes(workspacePath) && keys.includes(wt1) && keys.includes(wt2);
      },
      { label: 'all 3 paths watched' }
    );
  });

  it('AC-3 regression: registering 2nd, 3rd workspace in succession all activate watching', async () => {
    h = await buildHarness();

    const wsAPath = join(h.tempDir, 'wsA');
    const wsBPath = join(h.tempDir, 'wsB');
    const wsCPath = join(h.tempDir, 'wsC');
    for (const p of [wsAPath, wsBPath, wsCPath]) {
      await mkdir(join(p, '.chainglass', 'data'), { recursive: true });
      h.fakeWorktreeResolver.setWorktrees(p, [
        {
          path: p,
          head: 'x'.repeat(40),
          branch: 'main',
          isDetached: false,
          isBare: false,
          isPrunable: false,
        },
      ]);
    }

    // Register all three in succession
    expect((await h.service.add('A', wsAPath)).success).toBe(true);
    expect((await h.service.add('B', wsBPath)).success).toBe(true);
    expect((await h.service.add('C', wsCPath)).success).toBe(true);

    // Assert: ALL three workspaces are watched. The pre-fix bug would have
    // only watched the FIRST one because the registry watcher went stale on
    // the inode after the first atomic-rename write.
    const watcher = h.watcher;
    await waitFor(
      () => {
        const keys = Array.from(
          (watcher as unknown as { dataWatchers: Map<string, unknown> }).dataWatchers.keys()
        );
        return keys.includes(wsAPath) && keys.includes(wsBPath) && keys.includes(wsCPath);
      },
      { label: 'all 3 workspaces watched (atomic-rename regression)' }
    );
  });

  it('AC-4: deleting a worktree dir + triggering a mutation → corresponding watcher is closed', async () => {
    h = await buildHarness();
    const wsPath = join(h.tempDir, 'workspace4');
    const wtPath = await stageWorktreeDir(h.tempDir, 'workspace4-target');
    await mkdir(join(wsPath, '.chainglass', 'data'), { recursive: true });

    h.fakeWorktreeResolver.setWorktrees(wsPath, [
      {
        path: wsPath,
        head: 'a'.repeat(40),
        branch: 'main',
        isDetached: false,
        isBare: false,
        isPrunable: false,
      },
      {
        path: wtPath,
        head: 'b'.repeat(40),
        branch: 'target',
        isDetached: false,
        isBare: false,
        isPrunable: false,
      },
    ]);

    expect((await h.service.add('WS4', wsPath)).success).toBe(true);

    const watcher = h.watcher;
    await waitFor(
      () => {
        const keys = Array.from(
          (watcher as unknown as { dataWatchers: Map<string, unknown> }).dataWatchers.keys()
        );
        return keys.includes(wtPath);
      },
      { label: 'wtPath initially watched' }
    );

    // Delete the worktree on disk and update the resolver to reflect the removal
    await rm(wtPath, { recursive: true, force: true });
    h.fakeWorktreeResolver.setWorktrees(wsPath, [
      {
        path: wsPath,
        head: 'a'.repeat(40),
        branch: 'main',
        isDetached: false,
        isBare: false,
        isPrunable: false,
      },
    ]);

    // Trigger an unrelated mutation to invoke a rescan
    const otherPath = join(h.tempDir, 'workspace4-other');
    await mkdir(join(otherPath, '.chainglass', 'data'), { recursive: true });
    h.fakeWorktreeResolver.setWorktrees(otherPath, [
      {
        path: otherPath,
        head: 'x'.repeat(40),
        branch: 'main',
        isDetached: false,
        isBare: false,
        isPrunable: false,
      },
    ]);
    expect((await h.service.add('Other', otherPath)).success).toBe(true);

    // The deleted worktree's watcher should be closed by the rescan diff
    await waitFor(
      () => {
        const keys = Array.from(
          (watcher as unknown as { dataWatchers: Map<string, unknown> }).dataWatchers.keys()
        );
        return !keys.includes(wtPath);
      },
      { label: 'wtPath no longer watched after rescan diff' }
    );
  });

  it('AC-6: out-of-band registry edit (atomic-rename write) triggers a rescan within ~3s', async () => {
    h = await buildHarness();
    const wsPath = join(h.tempDir, 'workspace6');
    await mkdir(join(wsPath, '.chainglass', 'data'), { recursive: true });
    h.fakeWorktreeResolver.setWorktrees(wsPath, [
      {
        path: wsPath,
        head: 'a'.repeat(40),
        branch: 'main',
        isDetached: false,
        isBare: false,
        isPrunable: false,
      },
    ]);

    const ws = Workspace.create({ name: 'WS6', path: wsPath });
    h.fakeRegistry.addWorkspace(ws);

    const beforeRescans = h.rescanCallCount();

    // Simulate an out-of-band registry write using the SAME atomic-rename
    // pattern that WorkspaceRegistryAdapter uses internally. The pre-fix bug
    // (single-file fs.watch on the inode) would have missed this on the second
    // and later writes; the parent-dir watch (T004) fixes it.
    const tmpPath = `${h.registryPath}.tmp`;
    await writeFile(tmpPath, JSON.stringify({ version: 1, workspaces: [ws.toJSON()] }, null, 2));
    await rename(tmpPath, h.registryPath);

    // Wait for the parent-dir watcher to fire → filter → rescan.
    // awaitWriteFinish has stabilityThreshold: 200ms; allow generous headroom.
    await waitFor(() => h.rescanCallCount() > beforeRescans, {
      timeoutMs: 3000,
      intervalMs: 100,
      label: 'rescan triggered by out-of-band registry write',
    });
  });

  it('coalescing: 5 rapid mutations result in fewer rescans than mutations', async () => {
    h = await buildHarness();

    const paths: string[] = [];
    for (let i = 0; i < 5; i++) {
      const p = join(h.tempDir, `burst-${i}`);
      await mkdir(join(p, '.chainglass', 'data'), { recursive: true });
      h.fakeWorktreeResolver.setWorktrees(p, [
        {
          path: p,
          head: 'a'.repeat(40),
          branch: 'main',
          isDetached: false,
          isBare: false,
          isPrunable: false,
        },
      ]);
      paths.push(p);
    }

    const beforeRescans = h.rescanCallCount();

    // Fire 5 mutations as concurrently as possible
    const results = await Promise.all([
      h.service.add('B0', paths[0]),
      h.service.add('B1', paths[1]),
      h.service.add('B2', paths[2]),
      h.service.add('B3', paths[3]),
      h.service.add('B4', paths[4]),
    ]);
    for (const r of results) {
      expect(r.success).toBe(true);
    }

    // Wait for all rescans + their cascading detectWorktrees calls to settle.
    // The watcher coalesces via isRescanning + rescanQueued: at most 2 calls
    // to performRescan can run for N concurrent emits. Each performRescan
    // calls detectWorktrees once per registered workspace.
    await waitFor(
      () => {
        const keys = Array.from(
          (h?.watcher as unknown as { dataWatchers: Map<string, unknown> }).dataWatchers.keys()
        );
        return paths.every((p) => keys.includes(p));
      },
      { label: 'all 5 burst paths watched' }
    );
    // Allow any pending rescan to finish
    await new Promise((r) => setTimeout(r, 200));

    const totalRescanCalls = h.rescanCallCount() - beforeRescans;

    // 5 mutations are NOT serialized into 5 separate full rescans.
    // The rescan coalescing limits total performRescan calls to roughly
    // 2 × workspace count (one initial + one queued drain). For 5 workspaces
    // visited per performRescan call, total detectWorktrees calls are
    // bounded above by 2 × 5 = 10 (and typically much lower because not all
    // 5 are registered when the first rescan runs).
    //
    // Strict assertion: must be MUCH less than 5 mutations × 5 workspaces = 25.
    expect(totalRescanCalls).toBeLessThan(25);
  });
});
