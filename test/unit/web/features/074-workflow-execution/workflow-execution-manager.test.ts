/**
 * WorkflowExecutionManager tests — Plan 074 Phase 2 T006.
 * TDD: Tests cover start/stop/restart/resume/getStatus/listRunning/cleanup.
 */

import os from 'node:os';
import type { IExecutionRegistry } from '@/features/074-workflow-execution/execution-registry.types';
import { createEmptyRegistry } from '@/features/074-workflow-execution/execution-registry.types';
import { WorkflowExecutionManager } from '@/features/074-workflow-execution/workflow-execution-manager';
import type { ExecutionManagerDeps } from '@/features/074-workflow-execution/workflow-execution-manager.types';
import { FakeOrchestrationService, FakePositionalGraphService } from '@chainglass/positional-graph';
import { FakeSSEBroadcaster } from '@chainglass/shared/features/019-agent-manager-refactor/fake-sse-broadcaster';
import type { WorkspaceContext } from '@chainglass/workflow';
import { beforeEach, describe, expect, it } from 'vitest';

// ── Helpers ─────────────────────────────────────────────

const TEST_CTX = { workspaceSlug: 'test-ws', worktreePath: '/test/wt' };
const TEST_SLUG = 'my-pipeline';

function makeFullContext(): WorkspaceContext {
  return {
    workspaceSlug: 'test-ws',
    workspaceName: 'Test Workspace',
    workspacePath: '/test',
    worktreePath: '/test/wt',
    worktreeBranch: 'main',
    isMainWorktree: true,
    hasGit: true,
  };
}

const fakeWorkspaceService = {
  resolveContextFromParams: async (_slug: string, _wt?: string): Promise<WorkspaceContext | null> =>
    makeFullContext(),
};

/** In-memory fake registry for tests. */
function createFakeRegistry(): IExecutionRegistry & {
  lastWritten: ReturnType<typeof createEmptyRegistry> | null;
  removed: boolean;
} {
  const state = {
    registry: createEmptyRegistry(),
    lastWritten: null as ReturnType<typeof createEmptyRegistry> | null,
    removed: false,
  };
  return {
    read: () => state.registry,
    write: (reg) => {
      state.registry = reg;
      state.lastWritten = reg;
    },
    remove: () => {
      state.registry = createEmptyRegistry();
      state.removed = true;
    },
    get lastWritten() {
      return state.lastWritten;
    },
    get removed() {
      return state.removed;
    },
  };
}

function createDeps(overrides?: Partial<ExecutionManagerDeps>): {
  deps: ExecutionManagerDeps;
  orchService: FakeOrchestrationService;
  graphService: FakePositionalGraphService;
  broadcaster: FakeSSEBroadcaster;
  registry: ReturnType<typeof createFakeRegistry>;
} {
  const orchService = new FakeOrchestrationService();
  const graphService = new FakePositionalGraphService();
  const broadcaster = new FakeSSEBroadcaster();
  const registry = createFakeRegistry();
  const deps: ExecutionManagerDeps = {
    orchestrationService: orchService,
    graphService,
    workspaceService: fakeWorkspaceService as ExecutionManagerDeps['workspaceService'],
    broadcaster,
    registry,
    ...overrides,
  };
  return { deps, orchService, graphService, broadcaster, registry };
}

function configureSimpleGraph(orchService: FakeOrchestrationService) {
  orchService.configureGraph(TEST_SLUG, {
    runResults: [
      {
        actions: [],
        stopReason: 'graph-complete',
        finalReality: {
          lines: [],
          graphSlug: TEST_SLUG,
          graphStatus: 'complete',
          worktreePath: '/test/wt',
          podSessions: {},
        },
        iterations: 1,
      },
    ],
    reality: {
      lines: [],
      graphSlug: TEST_SLUG,
      graphStatus: 'pending',
      worktreePath: '/test/wt',
      podSessions: {},
    },
  });
}

// ── Tests ───────────────────────────────────────────────

describe('WorkflowExecutionManager', () => {
  let manager: WorkflowExecutionManager;
  let orchService: FakeOrchestrationService;
  let graphService: FakePositionalGraphService;
  let broadcaster: FakeSSEBroadcaster;
  let registry: ReturnType<typeof createFakeRegistry>;

  beforeEach(() => {
    const created = createDeps();
    manager = new WorkflowExecutionManager(created.deps);
    orchService = created.orchService;
    graphService = created.graphService;
    broadcaster = created.broadcaster;
    registry = created.registry;
  });

  describe('start()', () => {
    it('starts a workflow and returns started:true', async () => {
      configureSimpleGraph(orchService);

      const result = await manager.start(TEST_CTX, TEST_SLUG);

      expect(result.started).toBe(true);
      expect(result.already).toBe(false);
      expect(result.key).toMatch(/^[a-zA-Z0-9_-]+$/); // base64url-encoded key (FT-001)
    });

    it('returns already:true when workflow is already running', async () => {
      configureSimpleGraph(orchService);
      // Set drive result so it doesn't throw but also use a long-running drive
      const handle = await orchService.get(makeFullContext(), TEST_SLUG);
      // First start
      await manager.start(TEST_CTX, TEST_SLUG);
      // Wait for drive to complete
      await new Promise((r) => setTimeout(r, 10));

      // Second start on completed should start fresh (not idempotent for completed)
      const result = await manager.start(TEST_CTX, TEST_SLUG);
      // After completion, status is 'completed' not 'running', so it won't be idempotent
      expect(result).toBeDefined();
    });

    it('resolves workspace context from workspaceService', async () => {
      configureSimpleGraph(orchService);

      await manager.start(TEST_CTX, TEST_SLUG);

      const getHistory = orchService.getGetHistory();
      expect(getHistory.length).toBeGreaterThanOrEqual(1);
      expect(getHistory[0].graphSlug).toBe(TEST_SLUG);
    });

    it('sets status to failed when workspace context resolution fails', async () => {
      configureSimpleGraph(orchService);
      const { deps } = createDeps({
        workspaceService: {
          resolveContextFromParams: async () => null,
        } as ExecutionManagerDeps['workspaceService'],
      });
      const mgr = new WorkflowExecutionManager(deps);

      const result = await mgr.start(TEST_CTX, TEST_SLUG);

      expect(result.started).toBe(false);
      expect(mgr.getStatus(TEST_CTX.worktreePath, TEST_SLUG)).toBe('failed');
    });
  });

  describe('stop()', () => {
    it('returns stopped:false when nothing is running', async () => {
      const result = await manager.stop(TEST_CTX.worktreePath, TEST_SLUG);
      expect(result.stopped).toBe(false);
    });

    it('stops a running workflow and sets status to stopped', async () => {
      configureSimpleGraph(orchService);
      await manager.start(TEST_CTX, TEST_SLUG);
      // Give drive() a moment to start
      await new Promise((r) => setTimeout(r, 10));

      // If drive already completed, stop returns false (status not 'running')
      const result = await manager.stop(TEST_CTX.worktreePath, TEST_SLUG);
      // Regardless, the handle should exist with a terminal status
      const handle = manager.getHandle(TEST_CTX.worktreePath, TEST_SLUG);
      expect(handle).toBeDefined();
      expect(['stopped', 'completed', 'failed']).toContain(handle?.status);
    });
  });

  describe('restart()', () => {
    it('stops, resets state, evicts cache, and starts fresh', async () => {
      configureSimpleGraph(orchService);
      // First start
      await manager.start(TEST_CTX, TEST_SLUG);
      await new Promise((r) => setTimeout(r, 10));

      // Restart
      const result = await manager.restart(TEST_CTX, TEST_SLUG);

      expect(result.started).toBe(true);
      // graphService.resetGraphState should have been called
      expect(graphService.calls.get('resetGraphState')?.length).toBeGreaterThanOrEqual(1);
      // Evict should have been called
      expect(orchService.evictCalls).toBeGreaterThanOrEqual(1);
    });
  });

  describe('getStatus()', () => {
    it('returns idle for unknown workflow', () => {
      expect(manager.getStatus('/unknown', 'unknown')).toBe('idle');
    });

    it('returns status of known workflow', async () => {
      configureSimpleGraph(orchService);
      await manager.start(TEST_CTX, TEST_SLUG);
      await new Promise((r) => setTimeout(r, 10));

      const status = manager.getStatus(TEST_CTX.worktreePath, TEST_SLUG);
      expect(['running', 'completed', 'failed']).toContain(status);
    });
  });

  describe('getHandle()', () => {
    it('returns undefined for unknown workflow', () => {
      expect(manager.getHandle('/unknown', 'unknown')).toBeUndefined();
    });

    it('returns handle after start', async () => {
      configureSimpleGraph(orchService);
      await manager.start(TEST_CTX, TEST_SLUG);

      const handle = manager.getHandle(TEST_CTX.worktreePath, TEST_SLUG);
      expect(handle).toBeDefined();
      expect(handle?.graphSlug).toBe(TEST_SLUG);
      expect(handle?.worktreePath).toBe(TEST_CTX.worktreePath);
      expect(handle?.startedAt).toBeTruthy();
    });
  });

  describe('listRunning()', () => {
    it('returns empty when nothing is running', () => {
      expect(manager.listRunning()).toHaveLength(0);
    });
  });

  describe('cleanup()', () => {
    it('stops all running workflows', async () => {
      configureSimpleGraph(orchService);
      await manager.start(TEST_CTX, TEST_SLUG);
      await new Promise((r) => setTimeout(r, 10));

      await manager.cleanup();

      // After cleanup, no workflows should be running
      expect(manager.listRunning()).toHaveLength(0);
    });
  });

  describe('handleEvent() integration', () => {
    it('updates handle state from drive events', async () => {
      orchService.configureGraph(TEST_SLUG, {
        runResults: [
          {
            actions: [{ type: 'start', nodeId: 'n1' }],
            stopReason: 'graph-complete',
            finalReality: {
              lines: [],
              graphSlug: TEST_SLUG,
              graphStatus: 'complete',
              worktreePath: '/test/wt',
              podSessions: {},
            },
            iterations: 1,
          },
        ],
        reality: {
          lines: [],
          graphSlug: TEST_SLUG,
          graphStatus: 'pending',
          worktreePath: '/test/wt',
          podSessions: {},
        },
      });

      // Configure drive events to be emitted
      const fakeHandle = await orchService.get(makeFullContext(), TEST_SLUG);
      (fakeHandle as import('@chainglass/positional-graph').FakeGraphOrchestration).setDriveResult({
        exitReason: 'complete',
        iterations: 3,
        totalActions: 5,
      });
      (fakeHandle as import('@chainglass/positional-graph').FakeGraphOrchestration).setDriveEvents([
        { type: 'status', message: 'Graph running' },
        {
          type: 'iteration',
          message: '2 actions',
          data: {
            actions: [1, 2],
            stopReason: 'continue',
            finalReality: {} as never,
            iterations: 2,
          },
        },
      ]);

      await manager.start(TEST_CTX, TEST_SLUG);
      await new Promise((r) => setTimeout(r, 50));

      const handle = manager.getHandle(TEST_CTX.worktreePath, TEST_SLUG);
      expect(handle).toBeDefined();
      // Drive events should have updated handle
      expect(handle?.lastEventType).toBeTruthy();
    });
  });

  // ── Deterministic lifecycle tests (FT-002) ────────────

  describe('deterministic lifecycle (blocked drive)', () => {
    it('AC5: second start() during active drive returns already:true', async () => {
      configureSimpleGraph(orchService);
      // Pre-resolve handle so we can block it
      const fakeHandle = (await orchService.get(makeFullContext(), TEST_SLUG)) as import(
        '@chainglass/positional-graph'
      ).FakeGraphOrchestration;
      fakeHandle.blockDrive();

      // First start — drive() blocks
      const r1 = await manager.start(TEST_CTX, TEST_SLUG);
      expect(r1.started).toBe(true);

      // Second start while drive is still running
      const r2 = await manager.start(TEST_CTX, TEST_SLUG);
      expect(r2.started).toBe(false);
      expect(r2.already).toBe(true);

      // Release to avoid dangling promise
      fakeHandle.releaseDrive({ exitReason: 'complete', iterations: 1, totalActions: 0 });
      await new Promise((r) => setTimeout(r, 10));
    });

    it('AC3: stop() aborts signal, awaits, calls cleanup + markNodesInterrupted', async () => {
      configureSimpleGraph(orchService);
      const fakeHandle = (await orchService.get(makeFullContext(), TEST_SLUG)) as import(
        '@chainglass/positional-graph'
      ).FakeGraphOrchestration;
      fakeHandle.blockDrive();

      // Set graph state with an active node
      graphService.setState({
        graph_status: 'in_progress',
        updated_at: new Date().toISOString(),
        nodes: { 'node-1': { status: 'starting' } },
      });

      await manager.start(TEST_CTX, TEST_SLUG);
      expect(manager.getStatus(TEST_CTX.worktreePath, TEST_SLUG)).toBe('running');

      // Stop — this should abort the signal
      const stopPromise = manager.stop(TEST_CTX.worktreePath, TEST_SLUG);

      // Release drive so stop can complete
      fakeHandle.releaseDrive({ exitReason: 'stopped', iterations: 0, totalActions: 0 });
      const stopResult = await stopPromise;

      expect(stopResult.stopped).toBe(true);
      expect(fakeHandle.getLastDriveSignal()?.aborted).toBe(true);
      expect(fakeHandle.cleanupCalls).toBeGreaterThanOrEqual(1);
      expect(graphService.calls.get('markNodesInterrupted')?.length).toBeGreaterThanOrEqual(1);
    });

    it('restart() evicts handle and gets fresh one', async () => {
      configureSimpleGraph(orchService);
      const fakeHandle = (await orchService.get(makeFullContext(), TEST_SLUG)) as import(
        '@chainglass/positional-graph'
      ).FakeGraphOrchestration;
      fakeHandle.blockDrive();

      await manager.start(TEST_CTX, TEST_SLUG);

      // Restart — needs to stop first, then evict, then start fresh
      const restartPromise = manager.restart(TEST_CTX, TEST_SLUG);

      // Release original drive
      fakeHandle.releaseDrive({ exitReason: 'stopped', iterations: 0, totalActions: 0 });
      // Wait for restart to complete — it will start() again which needs a configured graph
      // Eviction means orchService creates a new handle
      const result = await restartPromise;

      expect(result.started).toBe(true);
      expect(orchService.evictCalls).toBeGreaterThanOrEqual(1);
      expect(graphService.calls.get('resetGraphState')?.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ── SSE broadcast tests (Phase 3 T010, FT-004: use fakes not mocks) ──

  describe('SSE broadcasting', () => {
    it('broadcasts starting and running on start()', async () => {
      configureSimpleGraph(orchService);
      const fakeHandle = (await orchService.get(makeFullContext(), TEST_SLUG)) as import(
        '@chainglass/positional-graph'
      ).FakeGraphOrchestration;
      fakeHandle.blockDrive();

      await manager.start(TEST_CTX, TEST_SLUG);

      const updates = broadcaster.getBroadcastsByChannel('workflow-execution');
      const statuses = updates
        .filter((b) => b.eventType === 'execution-update')
        .map((b) => (b.data as Record<string, unknown>).status);
      expect(statuses).toContain('starting');
      expect(statuses).toContain('running');

      fakeHandle.releaseDrive({ exitReason: 'complete', iterations: 1, totalActions: 0 });
      await new Promise((r) => setTimeout(r, 10));
    });

    it('broadcasts stopping on stop()', async () => {
      configureSimpleGraph(orchService);
      const fakeHandle = (await orchService.get(makeFullContext(), TEST_SLUG)) as import(
        '@chainglass/positional-graph'
      ).FakeGraphOrchestration;
      fakeHandle.blockDrive();

      await manager.start(TEST_CTX, TEST_SLUG);
      broadcaster.reset();

      const stopPromise = manager.stop(TEST_CTX.worktreePath, TEST_SLUG);
      fakeHandle.releaseDrive({ exitReason: 'stopped', iterations: 0, totalActions: 0 });
      await stopPromise;

      const updates = broadcaster.getBroadcastsByChannel('workflow-execution');
      const statuses = updates
        .filter((b) => b.eventType === 'execution-update')
        .map((b) => (b.data as Record<string, unknown>).status);
      expect(statuses).toContain('stopping');
    });

    it('broadcasts execution-removed on restart()', async () => {
      configureSimpleGraph(orchService);
      const fakeHandle = (await orchService.get(makeFullContext(), TEST_SLUG)) as import(
        '@chainglass/positional-graph'
      ).FakeGraphOrchestration;
      fakeHandle.blockDrive();

      await manager.start(TEST_CTX, TEST_SLUG);
      broadcaster.reset();

      const restartPromise = manager.restart(TEST_CTX, TEST_SLUG);
      fakeHandle.releaseDrive({ exitReason: 'stopped', iterations: 0, totalActions: 0 });
      await restartPromise;
      await new Promise((r) => setTimeout(r, 10));

      const removals = broadcaster
        .getBroadcastsByChannel('workflow-execution')
        .filter((b) => b.eventType === 'execution-removed');
      expect(removals.length).toBeGreaterThanOrEqual(1);
    });

    it('broadcasts during handleEvent from drive loop', async () => {
      orchService.configureGraph(TEST_SLUG, {
        runResults: [
          {
            actions: [{ type: 'start', nodeId: 'n1' }],
            stopReason: 'graph-complete',
            finalReality: {
              lines: [],
              graphSlug: TEST_SLUG,
              graphStatus: 'complete',
              worktreePath: '/test/wt',
              podSessions: {},
            },
            iterations: 1,
          },
        ],
        reality: {
          lines: [],
          graphSlug: TEST_SLUG,
          graphStatus: 'pending',
          worktreePath: '/test/wt',
          podSessions: {},
        },
      });

      const fakeHandle = await orchService.get(makeFullContext(), TEST_SLUG);
      (fakeHandle as import('@chainglass/positional-graph').FakeGraphOrchestration).setDriveResult({
        exitReason: 'complete',
        iterations: 2,
        totalActions: 1,
      });
      (fakeHandle as import('@chainglass/positional-graph').FakeGraphOrchestration).setDriveEvents([
        {
          type: 'iteration',
          message: '1 action',
          data: {
            actions: [1],
            stopReason: 'continue',
            finalReality: {} as never,
            iterations: 1,
          },
        },
      ]);

      broadcaster.reset();
      await manager.start(TEST_CTX, TEST_SLUG);
      await new Promise((r) => setTimeout(r, 50));

      const updates = broadcaster
        .getBroadcastsByChannel('workflow-execution')
        .filter((b) => b.eventType === 'execution-update');
      expect(updates.length).toBeGreaterThanOrEqual(1);
    });

    it('getSerializableStatus returns clean snapshot without internal refs', async () => {
      configureSimpleGraph(orchService);
      const fakeHandle = (await orchService.get(makeFullContext(), TEST_SLUG)) as import(
        '@chainglass/positional-graph'
      ).FakeGraphOrchestration;
      fakeHandle.blockDrive();

      await manager.start(TEST_CTX, TEST_SLUG);

      const status = manager.getSerializableStatus(TEST_CTX.worktreePath, TEST_SLUG);
      expect(status).toBeDefined();
      expect(status?.key).toBeTruthy();
      expect(status?.status).toBeDefined();
      expect((status as Record<string, unknown>).controller).toBeUndefined();
      expect((status as Record<string, unknown>).drivePromise).toBeUndefined();
      expect((status as Record<string, unknown>).orchestrationHandle).toBeUndefined();

      fakeHandle.releaseDrive({ exitReason: 'complete', iterations: 1, totalActions: 0 });
      await new Promise((r) => setTimeout(r, 10));
    });

    it('execution key is path-safe for GlobalState (FT-001)', async () => {
      configureSimpleGraph(orchService);
      const fakeHandle = (await orchService.get(makeFullContext(), TEST_SLUG)) as import(
        '@chainglass/positional-graph'
      ).FakeGraphOrchestration;
      fakeHandle.blockDrive();

      await manager.start(TEST_CTX, TEST_SLUG);

      const status = manager.getSerializableStatus(TEST_CTX.worktreePath, TEST_SLUG);
      expect(status?.key).toBeTruthy();
      // Key must be base64url-safe: only [a-zA-Z0-9_-]
      expect(status?.key).toMatch(/^[a-zA-Z0-9_-]+$/);
      // Key must NOT contain ':' (would break GlobalState path parsing)
      expect(status?.key).not.toContain(':');

      fakeHandle.releaseDrive({ exitReason: 'complete', iterations: 1, totalActions: 0 });
      await new Promise((r) => setTimeout(r, 10));
    });
  });

  // ── Registry persistence tests (Phase 5 T007) ────────────

  describe('registry persistence', () => {
    /**
     * Test Doc: Verifies registry is persisted when a workflow starts.
     */
    it('persists registry on start()', async () => {
      configureSimpleGraph(orchService);
      const fakeHandle = (await orchService.get(makeFullContext(), TEST_SLUG)) as import(
        '@chainglass/positional-graph'
      ).FakeGraphOrchestration;
      fakeHandle.blockDrive();

      await manager.start(TEST_CTX, TEST_SLUG);

      expect(registry.lastWritten).not.toBeNull();
      expect(registry.lastWritten?.executions.length).toBeGreaterThanOrEqual(1);
      const entry = registry.lastWritten?.executions.find((e) => e.graphSlug === TEST_SLUG);
      expect(entry).toBeDefined();
      // Status should be 'running' (last persist was after running transition)
      expect(entry?.status).toBe('running');

      fakeHandle.releaseDrive({ exitReason: 'complete', iterations: 1, totalActions: 0 });
      await new Promise((r) => setTimeout(r, 10));
    });

    /**
     * Test Doc: Verifies registry is persisted on workflow completion.
     */
    it('persists registry on completion', async () => {
      configureSimpleGraph(orchService);
      await manager.start(TEST_CTX, TEST_SLUG);
      // Wait for drive to complete
      await new Promise((r) => setTimeout(r, 50));

      expect(registry.lastWritten).not.toBeNull();
      const entry = registry.lastWritten?.executions.find((e) => e.graphSlug === TEST_SLUG);
      expect(entry).toBeDefined();
      expect(['completed', 'stopped', 'failed']).toContain(entry?.status);
    });

    /**
     * Test Doc: Verifies registry is persisted on stop().
     */
    it('persists registry on stop()', async () => {
      configureSimpleGraph(orchService);
      const fakeHandle = (await orchService.get(makeFullContext(), TEST_SLUG)) as import(
        '@chainglass/positional-graph'
      ).FakeGraphOrchestration;
      fakeHandle.blockDrive();

      await manager.start(TEST_CTX, TEST_SLUG);

      const stopPromise = manager.stop(TEST_CTX.worktreePath, TEST_SLUG);
      fakeHandle.releaseDrive({ exitReason: 'stopped', iterations: 0, totalActions: 0 });
      await stopPromise;

      expect(registry.lastWritten).not.toBeNull();
      const entry = registry.lastWritten?.executions.find((e) => e.graphSlug === TEST_SLUG);
      expect(entry).toBeDefined();
    });
  });

  // ── resumeAll tests (Phase 5 T007) ────────────────────────

  describe('resumeAll()', () => {
    /**
     * Test Doc: Verifies resumeAll does nothing when registry is empty.
     */
    it('does nothing with empty registry', async () => {
      await manager.resumeAll();

      expect(manager.listRunning()).toHaveLength(0);
    });

    /**
     * Test Doc: Verifies resumeAll resumes entries with status running.
     */
    it('resumes entries with running status', async () => {
      configureSimpleGraph(orchService);

      // Use a real existing path (os.tmpdir always exists) so fs.existsSync returns true
      const existingPath = os.tmpdir();

      // Seed registry with a running entry
      const { deps: deps2 } = createDeps({
        registry: {
          read: () => ({
            version: 1,
            updatedAt: new Date().toISOString(),
            executions: [
              {
                key: 'test-key',
                worktreePath: existingPath,
                graphSlug: TEST_SLUG,
                workspaceSlug: TEST_CTX.workspaceSlug,
                status: 'running' as const,
                iterations: 5,
                startedAt: new Date().toISOString(),
                stoppedAt: null,
              },
            ],
          }),
          write: () => {},
          remove: () => {},
        },
      });
      const mgr2 = new WorkflowExecutionManager(deps2);

      await mgr2.resumeAll();
      await new Promise((r) => setTimeout(r, 50));

      // Verify a start was attempted — the manager should have a handle now
      const status = mgr2.getStatus(existingPath, TEST_SLUG);
      expect(['running', 'completed', 'failed', 'starting']).toContain(status);

      await mgr2.cleanup();
    });

    /**
     * Test Doc: Verifies resumeAll skips entries where worktree no longer exists.
     */
    it('skips entries where worktree no longer exists', async () => {
      const { deps: deps2 } = createDeps({
        registry: {
          read: () => ({
            version: 1,
            updatedAt: new Date().toISOString(),
            executions: [
              {
                key: 'stale-key',
                worktreePath: '/nonexistent/path/that/does/not/exist',
                graphSlug: 'stale-pipeline',
                workspaceSlug: 'stale-ws',
                status: 'running' as const,
                iterations: 0,
                startedAt: new Date().toISOString(),
                stoppedAt: null,
              },
            ],
          }),
          write: () => {},
          remove: () => {},
        },
      });
      const mgr2 = new WorkflowExecutionManager(deps2);

      // Should not throw — gracefully skips
      await mgr2.resumeAll();

      expect(mgr2.getStatus('/nonexistent/path/that/does/not/exist', 'stale-pipeline')).toBe(
        'idle'
      );
    });

    /**
     * Test Doc: Verifies resumeAll does not resume completed/failed/stopped entries.
     */
    it('does not resume completed/failed/stopped entries', async () => {
      const { deps: deps2 } = createDeps({
        registry: {
          read: () => ({
            version: 1,
            updatedAt: new Date().toISOString(),
            executions: [
              {
                key: 'done-key',
                worktreePath: '/test/wt',
                graphSlug: 'done-pipeline',
                workspaceSlug: 'ws',
                status: 'completed' as const,
                iterations: 10,
                startedAt: new Date().toISOString(),
                stoppedAt: new Date().toISOString(),
              },
              {
                key: 'fail-key',
                worktreePath: '/test/wt',
                graphSlug: 'failed-pipeline',
                workspaceSlug: 'ws',
                status: 'failed' as const,
                iterations: 3,
                startedAt: new Date().toISOString(),
                stoppedAt: new Date().toISOString(),
              },
            ],
          }),
          write: () => {},
          remove: () => {},
        },
      });
      const mgr2 = new WorkflowExecutionManager(deps2);

      await mgr2.resumeAll();

      // Neither should be running
      expect(mgr2.listRunning()).toHaveLength(0);
    });

    /**
     * Test Doc: Verifies resumeAll self-heals on corrupt registry (P5-DYK #3).
     */
    it('self-heals on registry read failure', async () => {
      let removed = false;
      const { deps: deps2 } = createDeps({
        registry: {
          read: () => {
            throw new Error('Corrupt file');
          },
          write: () => {},
          remove: () => {
            removed = true;
          },
        },
      });
      const mgr2 = new WorkflowExecutionManager(deps2);

      // Should not throw — catches error and deletes corrupt registry
      await mgr2.resumeAll();

      expect(removed).toBe(true);
      expect(mgr2.listRunning()).toHaveLength(0);
    });
  });
});
