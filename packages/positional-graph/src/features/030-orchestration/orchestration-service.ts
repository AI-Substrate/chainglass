/**
 * OrchestrationService — Singleton factory for per-graph orchestration handles.
 *
 * Resolves from DI via ORCHESTRATION_DI_TOKENS.ORCHESTRATION_SERVICE.
 * get() creates or returns a cached GraphOrchestration handle.
 * Uses compound key (worktreePath|graphSlug) for multi-worktree isolation.
 * Each handle gets its own PodManager + ODS for concurrent safety.
 *
 * Per Plan 030 Phase 7, DYK Critical Insights (2026-02-09).
 * Per Plan 074 Phase 1 T007/T008: compound key + per-handle isolation.
 *
 * @packageDocumentation
 */

import type { WorkspaceContext } from '@chainglass/workflow';
import type { IPositionalGraphService } from '../../interfaces/positional-graph-service.interface.js';
import type { IEventHandlerService } from '../032-node-event-system/event-handler-service.interface.js';
import { GraphOrchestration } from './graph-orchestration.js';
import type { IODS } from './ods.types.js';
import type { IONBAS } from './onbas.types.js';
import type { IGraphOrchestration, IOrchestrationService } from './orchestration-service.types.js';
import type { IPodManager } from './pod-manager.types.js';

// ── Per-handle dependencies ─────────────────────────────

/** Created fresh for each graph handle — ensures concurrent isolation. */
export interface PerHandleDeps {
  readonly podManager: IPodManager;
  readonly ods: IODS;
}

// ── Constructor dependencies ────────────────────────────

export interface OrchestrationServiceDeps {
  readonly graphService: IPositionalGraphService;
  readonly onbas: IONBAS;
  readonly eventHandlerService: IEventHandlerService;
  /** Factory that creates a fresh PodManager + ODS pair per handle. */
  readonly createPerHandleDeps: () => PerHandleDeps;
}

// ── OrchestrationService ────────────────────────────────

export class OrchestrationService implements IOrchestrationService {
  private readonly deps: OrchestrationServiceDeps;
  private readonly handles = new Map<string, IGraphOrchestration>();

  constructor(deps: OrchestrationServiceDeps) {
    this.deps = deps;
  }

  /**
   * Get or create a per-graph orchestration handle.
   * Uses compound key (worktreePath|graphSlug) for multi-worktree isolation.
   * Each new handle gets its own PodManager + ODS (concurrent safety).
   */
  async get(ctx: WorkspaceContext, graphSlug: string): Promise<IGraphOrchestration> {
    const key = `${ctx.worktreePath}|${graphSlug}`;
    let handle = this.handles.get(key);
    if (!handle) {
      const { podManager, ods } = this.deps.createPerHandleDeps();
      handle = new GraphOrchestration({
        graphSlug,
        ctx,
        graphService: this.deps.graphService,
        onbas: this.deps.onbas,
        ods,
        eventHandlerService: this.deps.eventHandlerService,
        podManager,
      });
      this.handles.set(key, handle);
    }
    return handle;
  }

  evict(worktreePath: string, graphSlug: string): void {
    const key = `${worktreePath}|${graphSlug}`;
    this.handles.delete(key);
  }
}
