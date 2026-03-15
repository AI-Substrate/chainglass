/**
 * WorkflowExecutionManager: Central host for all running workflows.
 *
 * Owns the lifecycle of workflow executions across all worktrees.
 * Wraps drive() with AbortController for cooperative cancellation.
 * Plan 074: Workflow Execution from Web UI — Phases 2+3+5.
 *
 * Phase 3: SSE broadcasting via injected broadcast function.
 * Phase 5: Registry persistence for server restart recovery.
 * DYK #5: 6 broadcast call sites — start(starting), start(running),
 * handleEvent, .then(completed/stopped/failed), .catch(failed), stop(stopping).
 */

import fs from 'node:fs';
import type { DriveEvent, DriveResult } from '@chainglass/positional-graph';
import { toRegistryEntry } from './execution-registry.types';
import type {
  ExecutionHandle,
  ExecutionManagerDeps,
  IWorkflowExecutionManager,
  ManagerExecutionStatus,
  SerializableExecutionStatus,
  StartResult,
  StopResult,
} from './workflow-execution-manager.types';
import { makeExecutionKey } from './workflow-execution-manager.types';

const SSE_CHANNEL = 'workflow-execution';

/** Debounce thresholds for iteration-level registry persistence. */
const PERSIST_EVERY_N_ITERATIONS = 10;
const PERSIST_EVERY_MS = 30_000;

export class WorkflowExecutionManager implements IWorkflowExecutionManager {
  private readonly executions = new Map<string, ExecutionHandle>();
  private readonly deps: ExecutionManagerDeps;
  /** Track last persist point per execution for debouncing. */
  private readonly lastPersist = new Map<string, { iteration: number; time: number }>();

  constructor(deps: ExecutionManagerDeps) {
    this.deps = deps;
  }

  async start(
    ctx: { workspaceSlug: string; worktreePath: string },
    graphSlug: string
  ): Promise<StartResult> {
    const key = makeExecutionKey(ctx.worktreePath, graphSlug);
    const existing = this.executions.get(key);

    // Idempotent: already running or starting → return early
    if (existing && (existing.status === 'running' || existing.status === 'starting')) {
      return { started: false, already: true, key };
    }

    // Resume path: if stopped, reset interrupted nodes → ready
    if (existing && existing.status === 'stopped') {
      const state = await this.deps.graphService.loadGraphState(
        { worktreePath: ctx.worktreePath } as Parameters<
          typeof this.deps.graphService.loadGraphState
        >[0],
        graphSlug
      );
      const interruptedNodeIds = Object.entries(state.nodes ?? {})
        .filter(([, entry]) => entry.status === 'interrupted')
        .map(([id]) => id);
      if (interruptedNodeIds.length > 0) {
        await this.deps.graphService.markNodesInterrupted(
          { worktreePath: ctx.worktreePath } as Parameters<
            typeof this.deps.graphService.markNodesInterrupted
          >[0],
          graphSlug,
          []
        );
        // Actually reset them to ready — load, clear interrupted, persist
        const freshState = await this.deps.graphService.loadGraphState(
          { worktreePath: ctx.worktreePath } as Parameters<
            typeof this.deps.graphService.loadGraphState
          >[0],
          graphSlug
        );
        for (const nodeId of interruptedNodeIds) {
          const entry = freshState.nodes?.[nodeId];
          if (entry && entry.status === 'interrupted' && freshState.nodes) {
            delete freshState.nodes[nodeId]; // Remove entry — node becomes implicitly pending
          }
        }
        await this.deps.graphService.persistGraphState(
          { worktreePath: ctx.worktreePath } as Parameters<
            typeof this.deps.graphService.persistGraphState
          >[0],
          graphSlug,
          freshState
        );
      }
    }

    const controller = new AbortController();

    const handle: ExecutionHandle = {
      key,
      worktreePath: ctx.worktreePath,
      graphSlug,
      workspaceSlug: ctx.workspaceSlug,
      status: 'starting',
      controller,
      drivePromise: null,
      orchestrationHandle: null,
      iterations: 0,
      totalActions: 0,
      lastEventType: '',
      lastMessage: '',
      startedAt: new Date().toISOString(),
      stoppedAt: null,
    };

    this.executions.set(key, handle);
    this.broadcastStatus(handle); // DYK #5 call site (1): 'starting'
    this.persistRegistry(); // Phase 5: persist on start

    // Resolve the orchestration handle
    const workspaceCtx = await this.deps.workspaceService.resolveContextFromParams(
      ctx.workspaceSlug,
      ctx.worktreePath
    );
    if (!workspaceCtx) {
      handle.status = 'failed';
      handle.lastMessage = 'Failed to resolve workspace context';
      this.broadcastStatus(handle); // broadcast failure
      return { started: false, already: false, key };
    }

    const orchestrationHandle = await this.deps.orchestrationService.get(workspaceCtx, graphSlug);
    handle.orchestrationHandle = orchestrationHandle;
    handle.status = 'running';
    this.broadcastStatus(handle); // DYK #5 call site (2): 'running'
    this.persistRegistry(); // Phase 5: persist on running transition

    // Start drive() in background — NOT awaited
    handle.drivePromise = orchestrationHandle.drive({
      signal: controller.signal,
      onEvent: (event: DriveEvent) => {
        this.handleEvent(key, event);
      },
    });

    // Handle completion/failure (DYK #3: MUST have .catch)
    handle.drivePromise
      .then((result: DriveResult) => {
        handle.status =
          result.exitReason === 'complete'
            ? 'completed'
            : result.exitReason === 'stopped'
              ? 'stopped'
              : 'failed';
        handle.iterations = result.iterations;
        handle.totalActions = result.totalActions;
        handle.controller = null;
        handle.drivePromise = null;
        handle.stoppedAt = new Date().toISOString();
        this.broadcastStatus(handle); // DYK #5 call site (4): terminal status
        this.persistRegistry(); // Phase 5: persist on completion
      })
      .catch((error: unknown) => {
        handle.status = 'failed';
        handle.lastMessage = error instanceof Error ? error.message : String(error);
        handle.controller = null;
        handle.drivePromise = null;
        handle.stoppedAt = new Date().toISOString();
        this.broadcastStatus(handle); // DYK #5 call site (5): error
        this.persistRegistry(); // Phase 5: persist on failure
      });

    return { started: true, already: false, key };
  }

  async stop(worktreePath: string, graphSlug: string): Promise<StopResult> {
    const key = makeExecutionKey(worktreePath, graphSlug);
    const handle = this.executions.get(key);

    if (!handle || handle.status !== 'running') {
      return { stopped: false };
    }

    handle.status = 'stopping';
    this.broadcastStatus(handle); // DYK #5 call site (6): 'stopping'
    this.persistRegistry(); // Phase 5: persist on stopping
    handle.controller?.abort();

    // Wait for drive() to exit
    if (handle.drivePromise) {
      await handle.drivePromise.catch(() => {});
    }

    // Destroy all pods
    if (handle.orchestrationHandle) {
      await handle.orchestrationHandle.cleanup();
    }

    // Mark active nodes as interrupted
    const state = await this.deps.graphService.loadGraphState(
      { worktreePath } as Parameters<typeof this.deps.graphService.loadGraphState>[0],
      graphSlug
    );
    const activeNodeIds = Object.entries(state.nodes ?? {})
      .filter(([, entry]) => entry.status === 'starting' || entry.status === 'agent-accepted')
      .map(([id]) => id);
    if (activeNodeIds.length > 0) {
      await this.deps.graphService.markNodesInterrupted(
        { worktreePath } as Parameters<typeof this.deps.graphService.markNodesInterrupted>[0],
        graphSlug,
        activeNodeIds
      );
    }

    // Status is set by the .then() handler from drivePromise
    handle.stoppedAt = new Date().toISOString();
    return { stopped: true };
  }

  async restart(
    ctx: { workspaceSlug: string; worktreePath: string },
    graphSlug: string
  ): Promise<StartResult> {
    // 1. Stop if running
    await this.stop(ctx.worktreePath, graphSlug);

    // 2. Cleanup handle pods
    const key = makeExecutionKey(ctx.worktreePath, graphSlug);
    const existing = this.executions.get(key);
    if (existing?.orchestrationHandle) {
      await existing.orchestrationHandle.cleanup();
    }

    // 3. Evict cached orchestration handle (DYK #1: get fresh handle)
    this.deps.orchestrationService.evict(ctx.worktreePath, graphSlug);

    // 4. Reset graph state
    await this.deps.graphService.resetGraphState(
      { worktreePath: ctx.worktreePath } as Parameters<
        typeof this.deps.graphService.resetGraphState
      >[0],
      graphSlug
    );

    // 5. Delete execution handle (DYK #2: broadcast removal first)
    this.broadcastRemoval(key);
    this.executions.delete(key);

    // 6. Start fresh
    return this.start(ctx, graphSlug);
  }

  getStatus(worktreePath: string, graphSlug: string): ManagerExecutionStatus {
    const key = makeExecutionKey(worktreePath, graphSlug);
    return this.executions.get(key)?.status ?? 'idle';
  }

  getHandle(worktreePath: string, graphSlug: string): ExecutionHandle | undefined {
    const key = makeExecutionKey(worktreePath, graphSlug);
    return this.executions.get(key);
  }

  getSerializableStatus(
    worktreePath: string,
    graphSlug: string
  ): SerializableExecutionStatus | undefined {
    const handle = this.getHandle(worktreePath, graphSlug);
    if (!handle) return undefined;
    return {
      key: handle.key,
      worktreePath: handle.worktreePath,
      graphSlug: handle.graphSlug,
      workspaceSlug: handle.workspaceSlug,
      status: handle.status,
      iterations: handle.iterations,
      totalActions: handle.totalActions,
      lastEventType: handle.lastEventType,
      lastMessage: handle.lastMessage,
      startedAt: handle.startedAt,
      stoppedAt: handle.stoppedAt,
    };
  }

  listRunning(): ExecutionHandle[] {
    return [...this.executions.values()].filter((h) => h.status === 'running');
  }

  async cleanup(): Promise<void> {
    const runningHandles = [...this.executions.values()].filter(
      (h) => h.status === 'running' || h.status === 'starting'
    );
    await Promise.all(
      runningHandles.map((h) => this.stop(h.worktreePath, h.graphSlug).catch(() => {}))
    );
  }

  // ── SSE Broadcast (Phase 3) ──────────────────────────────

  /** Broadcast current handle state to SSE channel. DYK #5: called at all 6 transition points. */
  private broadcastStatus(handle: ExecutionHandle): void {
    this.deps.broadcaster.broadcast(SSE_CHANNEL, 'execution-update', {
      key: handle.key,
      status: handle.status,
      iterations: handle.iterations,
      totalActions: handle.totalActions,
      lastEventType: handle.lastEventType,
      lastMessage: handle.lastMessage,
    });
  }

  /** Broadcast handle removal so client can clean up GlobalState. DYK #2. */
  private broadcastRemoval(key: string): void {
    this.deps.broadcaster.broadcast(SSE_CHANNEL, 'execution-removed', { key });
  }

  /** DYK #5 call site (3): broadcasts on every DriveEvent during drive() loop.
   * Phase 5 T004: Debounced iteration persistence (every 10 iterations or 30s). */
  private handleEvent(key: string, event: DriveEvent): void {
    const handle = this.executions.get(key);
    if (!handle) return;

    if (event.type === 'iteration' && event.data) {
      handle.iterations = event.data.iterations ?? handle.iterations + 1;
      handle.totalActions += event.data.actions?.length ?? 0;
    }
    handle.lastEventType = event.type;
    handle.lastMessage = event.message;

    this.broadcastStatus(handle);

    // Debounced registry persist for iteration events
    if (event.type === 'iteration') {
      const last = this.lastPersist.get(key) ?? { iteration: 0, time: 0 };
      const now = Date.now();
      const iterDelta = handle.iterations - last.iteration;
      const timeDelta = now - last.time;
      if (iterDelta >= PERSIST_EVERY_N_ITERATIONS || timeDelta >= PERSIST_EVERY_MS) {
        this.lastPersist.set(key, { iteration: handle.iterations, time: now });
        this.persistRegistry();
      }
    }
  }

  // ── Registry Persistence (Phase 5) ────────────────────────

  /** Persist current execution state to registry file.
   * Called at all lifecycle transition points.
   * P5-DYK #2: Synchronous writes prevent interleaving. */
  persistRegistry(): void {
    try {
      const entries = [...this.executions.values()].map((h) => toRegistryEntry(h));
      this.deps.registry.write({
        version: 1,
        updatedAt: new Date().toISOString(),
        executions: entries,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.warn(`[workflow-execution] Failed to persist registry: ${msg}`);
    }
  }

  /**
   * Resume workflows that were running when the server last stopped.
   * Called from instrumentation.ts after bootstrap.
   * P5-DYK #3: Never throws — on error, deletes corrupt registry and continues.
   */
  async resumeAll(): Promise<void> {
    let registry: import('./execution-registry.types').ExecutionRegistry;
    try {
      registry = this.deps.registry.read();
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.warn(`[workflow-execution] Failed to read registry for resume, deleting: ${msg}`);
      this.deps.registry.remove();
      return;
    }

    if (registry.executions.length === 0) return;

    const toResume = registry.executions.filter(
      (e) => e.status === 'running' || e.status === 'starting'
    );
    const toKeep = registry.executions.filter(
      (e) => e.status !== 'running' && e.status !== 'starting'
    );

    let resumed = 0;
    for (const entry of toResume) {
      try {
        // Verify worktree still exists
        if (!fs.existsSync(entry.worktreePath)) {
          console.warn(
            `[workflow-execution] Skipping resume for ${entry.graphSlug}: worktree ${entry.worktreePath} no longer exists`
          );
          continue;
        }

        console.log(`[workflow-execution] Resuming ${entry.graphSlug} in ${entry.worktreePath}`);
        await this.start(
          {
            workspaceSlug: entry.workspaceSlug,
            worktreePath: entry.worktreePath,
          },
          entry.graphSlug
        );
        resumed++;
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.warn(`[workflow-execution] Failed to resume ${entry.graphSlug}: ${msg}`);
      }
    }

    // Clean stale entries and persist updated registry
    if (toKeep.length !== registry.executions.length || resumed > 0) {
      this.persistRegistry();
    }

    if (resumed > 0) {
      console.log(`[workflow-execution] Resumed ${resumed}/${toResume.length} workflows`);
    }
  }
}
