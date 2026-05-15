/**
 * WorkspaceService mutation emitter unit tests.
 *
 * Per Plan 084 — live-monitoring-rescan, Task T005.
 *
 * Verifies the mutation event channel added in T002:
 * - Successful mutations emit the correct discriminated event variant
 * - Failed/blocked mutations do NOT emit
 * - Listener errors are isolated (caller's promise unaffected)
 * - Unsubscribe is idempotent
 * - Emit is deferred via setImmediate (next tick, not synchronous)
 *
 * Setup mirrors test/unit/workflow/workspace-service.test.ts — uses real fakes
 * from packages/workflow/src/fakes/ (no vi.mock / vi.fn). Each test instantiates
 * a fresh WorkspaceService so the mutation emitter is per-instance and no
 * globalThis state needs cleaning.
 */

import { FakeFileSystem } from '@chainglass/shared';
import { FakeProcessManager } from '@chainglass/shared';
import { Workspace } from '@chainglass/workflow';
import type { WorkspaceMutationEvent } from '@chainglass/workflow';
import { beforeEach, describe, expect, it } from 'vitest';
import { FakeGitWorktreeManager } from '../../../packages/workflow/src/fakes/fake-git-worktree-manager.js';
import { FakeGitWorktreeResolver } from '../../../packages/workflow/src/fakes/fake-git-worktree-resolver.js';
import { FakeWorkspaceContextResolver } from '../../../packages/workflow/src/fakes/fake-workspace-context-resolver.js';
import { FakeWorkspaceRegistryAdapter } from '../../../packages/workflow/src/fakes/fake-workspace-registry-adapter.js';
import { WorkspaceService } from '../../../packages/workflow/src/services/workspace.service.js';
import { WorktreeBootstrapRunner } from '../../../packages/workflow/src/services/worktree-bootstrap-runner.js';

/** Drain pending setImmediate callbacks. Required because the mutation emit is deferred. */
function flushSetImmediate(): Promise<void> {
  return new Promise((resolve) => {
    setImmediate(() => resolve());
  });
}

describe('WorkspaceService — mutation emitter (Plan 084)', () => {
  let registryAdapter: FakeWorkspaceRegistryAdapter;
  let contextResolver: FakeWorkspaceContextResolver;
  let gitResolver: FakeGitWorktreeResolver;
  let gitManager: FakeGitWorktreeManager;
  let bootstrapRunner: WorktreeBootstrapRunner;
  let service: WorkspaceService;
  let events: WorkspaceMutationEvent[];

  beforeEach(() => {
    registryAdapter = new FakeWorkspaceRegistryAdapter();
    contextResolver = new FakeWorkspaceContextResolver();
    gitResolver = new FakeGitWorktreeResolver();
    gitManager = new FakeGitWorktreeManager();
    const fakeFs = new FakeFileSystem();
    const fakePm = new FakeProcessManager();
    bootstrapRunner = new WorktreeBootstrapRunner(fakePm, fakeFs);
    service = new WorkspaceService(
      registryAdapter,
      contextResolver,
      gitResolver,
      gitManager,
      bootstrapRunner
    );
    events = [];
    service.onMutation((event) => events.push(event));
  });

  // ==================== add() ====================

  describe('add()', () => {
    it('emits workspace:added on success with slug + path', async () => {
      const result = await service.add('My Project', '/home/user/project');
      await flushSetImmediate();

      expect(result.success).toBe(true);
      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({
        kind: 'workspace:added',
        slug: 'my-project',
        path: '/home/user/project',
      });
    });

    it('does NOT emit on duplicate-slug failure', async () => {
      const existing = Workspace.create({ name: 'My Project', path: '/home/user/existing' });
      registryAdapter.addWorkspace(existing);

      const result = await service.add('My Project', '/home/user/another');
      await flushSetImmediate();

      expect(result.success).toBe(false);
      expect(events).toHaveLength(0);
    });

    it('does NOT emit on validation failure (relative path)', async () => {
      const result = await service.add('My Project', './relative/path');
      await flushSetImmediate();

      expect(result.success).toBe(false);
      expect(events).toHaveLength(0);
    });
  });

  // ==================== remove() ====================

  describe('remove()', () => {
    it('emits workspace:removed on success with slug + path', async () => {
      const ws = Workspace.create({ name: 'Test', path: '/home/user/test' });
      registryAdapter.addWorkspace(ws);

      const result = await service.remove(ws.slug);
      await flushSetImmediate();

      expect(result.success).toBe(true);
      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({
        kind: 'workspace:removed',
        slug: 'test',
        path: '/home/user/test',
      });
    });

    it('does NOT emit when workspace does not exist', async () => {
      const result = await service.remove('nonexistent');
      await flushSetImmediate();

      expect(result.success).toBe(false);
      expect(events).toHaveLength(0);
    });
  });

  // ==================== updatePreferences() ====================

  describe('updatePreferences()', () => {
    it('emits workspace:updated on success', async () => {
      const ws = Workspace.create({ name: 'Test', path: '/home/user/test' });
      registryAdapter.addWorkspace(ws);

      const result = await service.updatePreferences(ws.slug, { starred: true });
      await flushSetImmediate();

      expect(result.success).toBe(true);
      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({
        kind: 'workspace:updated',
        slug: 'test',
        path: '/home/user/test',
      });
    });

    it('does NOT emit on validation failure (invalid color)', async () => {
      const ws = Workspace.create({ name: 'Test', path: '/home/user/test' });
      registryAdapter.addWorkspace(ws);

      const result = await service.updatePreferences(ws.slug, { color: 'not-a-real-color' });
      await flushSetImmediate();

      expect(result.success).toBe(false);
      expect(events).toHaveLength(0);
    });

    it('does NOT emit when workspace does not exist', async () => {
      const result = await service.updatePreferences('nonexistent', { starred: true });
      await flushSetImmediate();

      expect(result.success).toBe(false);
      expect(events).toHaveLength(0);
    });
  });

  // ==================== createWorktree() ====================

  describe('createWorktree()', () => {
    function setupHappyWorktree(): Workspace {
      const ws = Workspace.create({ name: 'Test', path: '/home/user/project' });
      registryAdapter.addWorkspace(ws);
      contextResolver.setWorkspaceInfo(ws.slug, {
        slug: ws.slug,
        name: ws.name,
        path: ws.path,
        createdAt: ws.createdAt,
        hasGit: true,
        worktrees: [],
      });
      gitManager.setMainStatus('clean');
      gitManager.setSyncResult('already-up-to-date');
      gitManager.setBranches(['main'], ['origin/main']);
      gitManager.setCreateResult('created', {
        worktreePath: '/home/user/069-my-feature',
        branchName: '069-my-feature',
      });
      return ws;
    }

    it('emits worktree:created on success with workspaceSlug + worktreePath', async () => {
      const ws = setupHappyWorktree();

      const result = await service.createWorktree({
        workspaceSlug: ws.slug,
        requestedName: 'my-feature',
      });
      await flushSetImmediate();

      expect(result.status).toBe('created');
      expect(events).toHaveLength(1);
      expect(events[0].kind).toBe('worktree:created');
      if (events[0].kind === 'worktree:created' && result.status === 'created') {
        expect(events[0].workspaceSlug).toBe(ws.slug);
        // The service allocates the ordinal itself (here: 001 — no existing
        // branches/plan folders in the fake). The exact path depends on the
        // ordinal-allocation logic; assert it matches the result returned by
        // the service rather than hard-coding the ordinal.
        expect(events[0].worktreePath).toBe(result.worktreePath);
        expect(events[0].worktreePath).toMatch(/\/home\/user\/\d{3}-my-feature$/);
      }
    });

    it('does NOT emit on blocked (dirty main)', async () => {
      const ws = Workspace.create({ name: 'Test', path: '/home/user/project' });
      registryAdapter.addWorkspace(ws);
      contextResolver.setWorkspaceInfo(ws.slug, {
        slug: ws.slug,
        name: ws.name,
        path: ws.path,
        createdAt: ws.createdAt,
        hasGit: true,
        worktrees: [],
      });
      gitManager.setMainStatus('dirty', { detail: 'Uncommitted changes' });

      const result = await service.createWorktree({
        workspaceSlug: ws.slug,
        requestedName: 'my-feature',
      });
      await flushSetImmediate();

      expect(result.status).toBe('blocked');
      expect(events).toHaveLength(0);
    });

    it('does NOT emit on blocked (workspace not found)', async () => {
      const result = await service.createWorktree({
        workspaceSlug: 'nonexistent',
        requestedName: 'my-feature',
      });
      await flushSetImmediate();

      expect(result.status).toBe('blocked');
      expect(events).toHaveLength(0);
    });
  });

  // ==================== Listener-error isolation (AC-7) ====================

  describe('listener error isolation', () => {
    it('a throwing listener does NOT cause the mutation method to reject', async () => {
      // Replace the default listener with a throwing one
      events = []; // we don't care about events here
      service.onMutation(() => {
        throw new Error('listener boom');
      });

      // The mutation must succeed despite the listener throwing
      const result = await service.add('Crash Test', '/home/user/crash-test');
      await flushSetImmediate();

      expect(result.success).toBe(true);
      // No assertion on events — the throwing listener is what we're testing
    });

    it('a synchronous listener throw does NOT prevent the test from completing', async () => {
      // Sanity: the mutation method's promise must resolve cleanly
      // even when the deferred listener throws asynchronously.
      service.onMutation(() => {
        throw new Error('listener boom 2');
      });

      await expect(service.add('Crash Test 2', '/home/user/crash-test-2')).resolves.toMatchObject({
        success: true,
      });
      // Drain the deferred emit so any uncaught error surfaces in this tick
      await flushSetImmediate();
    });
  });

  // ==================== Unsubscribe ====================

  describe('onMutation unsubscribe', () => {
    it('returns a working unsubscribe function', async () => {
      const fresh: WorkspaceMutationEvent[] = [];
      const unsubscribe = service.onMutation((e) => fresh.push(e));

      await service.add('First', '/home/user/first');
      await flushSetImmediate();

      unsubscribe();

      await service.add('Second', '/home/user/second');
      await flushSetImmediate();

      // First event reached our listener; second did not
      expect(fresh).toHaveLength(1);
      expect(fresh[0].kind).toBe('workspace:added');
    });

    it('unsubscribe is idempotent (calling twice does not throw)', () => {
      const unsubscribe = service.onMutation(() => {});

      expect(() => unsubscribe()).not.toThrow();
      expect(() => unsubscribe()).not.toThrow();
      expect(() => unsubscribe()).not.toThrow();
    });

    it('multiple subscribers all receive events', async () => {
      const a: WorkspaceMutationEvent[] = [];
      const b: WorkspaceMutationEvent[] = [];
      service.onMutation((e) => a.push(e));
      service.onMutation((e) => b.push(e));

      await service.add('Multi', '/home/user/multi');
      await flushSetImmediate();

      // Plus the default listener from beforeEach → 3 listeners total
      expect(a).toHaveLength(1);
      expect(b).toHaveLength(1);
      expect(events).toHaveLength(1);
    });
  });

  // ==================== setImmediate ordering ====================

  describe('setImmediate ordering (caller-contract decoupling)', () => {
    it('the mutation method resolves BEFORE the listener fires', async () => {
      const fresh: string[] = [];
      service.onMutation(() => fresh.push('listener-fired'));

      // Synchronously after await: the listener has NOT yet fired.
      const result = await service.add('Order', '/home/user/order');
      expect(result.success).toBe(true);
      expect(fresh).toHaveLength(0); // listener deferred — proves setImmediate decoupling

      // After draining setImmediate, the listener has fired.
      await flushSetImmediate();
      expect(fresh).toEqual(['listener-fired']);
    });
  });
});
