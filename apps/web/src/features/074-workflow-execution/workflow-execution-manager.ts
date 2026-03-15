/**
 * WorkflowExecutionManager: Central host for all running workflows.
 *
 * Owns the lifecycle of workflow executions across all worktrees.
 * Wraps drive() with AbortController for cooperative cancellation.
 * Plan 074: Workflow Execution from Web UI — Phase 2.
 *
 * SSE/GlobalState broadcasting is stubbed here (Phase 3 wires it).
 */

import type { DriveEvent, DriveResult } from '@chainglass/positional-graph';
import type {
  ExecutionHandle,
  ExecutionManagerDeps,
  IWorkflowExecutionManager,
  ManagerExecutionStatus,
  StartResult,
  StopResult,
} from './workflow-execution-manager.types.js';
import { makeExecutionKey } from './workflow-execution-manager.types.js';

export class WorkflowExecutionManager implements IWorkflowExecutionManager {
  private readonly executions = new Map<string, ExecutionHandle>();
  private readonly deps: ExecutionManagerDeps;

  constructor(deps: ExecutionManagerDeps) {
    this.deps = deps;
  }

  async start(
    ctx: { workspaceSlug: string; worktreePath: string },
    graphSlug: string
  ): Promise<StartResult> {
    const key = makeExecutionKey(ctx.worktreePath, graphSlug);
    const existing = this.executions.get(key);

    // Idempotent: already running → return early
    if (existing && existing.status === 'running') {
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

    // Resolve the orchestration handle
    const workspaceCtx = await this.deps.workspaceService.resolveContextFromParams(
      ctx.workspaceSlug,
      ctx.worktreePath
    );
    if (!workspaceCtx) {
      handle.status = 'failed';
      handle.lastMessage = 'Failed to resolve workspace context';
      return { started: false, already: false, key };
    }

    const orchestrationHandle = await this.deps.orchestrationService.get(workspaceCtx, graphSlug);
    handle.orchestrationHandle = orchestrationHandle;
    handle.status = 'running';

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
      })
      .catch((error: unknown) => {
        handle.status = 'failed';
        handle.lastMessage = error instanceof Error ? error.message : String(error);
        handle.controller = null;
        handle.drivePromise = null;
        handle.stoppedAt = new Date().toISOString();
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

    // 5. Delete execution handle
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

  // Phase 3 will wire this to SSE + GlobalState
  private handleEvent(key: string, event: DriveEvent): void {
    const handle = this.executions.get(key);
    if (!handle) return;

    if (event.type === 'iteration' && event.data) {
      handle.iterations = event.data.iterations ?? handle.iterations + 1;
      handle.totalActions += event.data.actions?.length ?? 0;
    }
    handle.lastEventType = event.type;
    handle.lastMessage = event.message;
  }
}
