/**
 * OrchestrationService — Singleton factory for per-graph orchestration handles.
 *
 * Resolves from DI via ORCHESTRATION_DI_TOKENS.ORCHESTRATION_SERVICE.
 * get() creates or returns a cached GraphOrchestration handle.
 *
 * Per Plan 030 Phase 7, DYK Critical Insights (2026-02-09).
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

// ── Constructor dependencies ────────────────────────────

export interface OrchestrationServiceDeps {
  readonly graphService: IPositionalGraphService;
  readonly onbas: IONBAS;
  readonly ods: IODS;
  readonly eventHandlerService: IEventHandlerService;
}

// ── OrchestrationService ────────────────────────────────

export class OrchestrationService implements IOrchestrationService {
  private readonly deps: OrchestrationServiceDeps;
  private readonly handles = new Map<string, IGraphOrchestration>();

  constructor(deps: OrchestrationServiceDeps) {
    this.deps = deps;
  }

  async get(ctx: WorkspaceContext, graphSlug: string): Promise<IGraphOrchestration> {
    let handle = this.handles.get(graphSlug);
    if (!handle) {
      handle = new GraphOrchestration({
        graphSlug,
        ctx,
        graphService: this.deps.graphService,
        onbas: this.deps.onbas,
        ods: this.deps.ods,
        eventHandlerService: this.deps.eventHandlerService,
      });
      this.handles.set(graphSlug, handle);
    }
    return handle;
  }
}
