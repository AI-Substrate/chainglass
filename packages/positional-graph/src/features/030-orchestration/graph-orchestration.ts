/**
 * GraphOrchestration — Per-graph orchestration handle.
 *
 * Implements the Settle → Decide → Act loop:
 * 1. EHS.processGraph() — settle pending events into state changes
 * 2. buildPositionalGraphReality() — snapshot the graph
 * 3. ONBAS.getNextAction() — decide what to do
 * 4. Exit check — if no-action, stop
 * 5. ODS.execute() — act on the decision
 * 6. Record action — timestamp and store
 * 7. Repeat
 *
 * Per Plan 030 Phase 7, DYK Critical Insights (2026-02-09).
 *
 * @packageDocumentation
 */

import type { WorkspaceContext } from '@chainglass/workflow';
import type { IPositionalGraphService } from '../../interfaces/positional-graph-service.interface.js';
import type { IEventHandlerService } from '../032-node-event-system/event-handler-service.interface.js';
import type { IODS } from './ods.types.js';
import type { IONBAS } from './onbas.types.js';
import type {
  IGraphOrchestration,
  OrchestrationAction,
  OrchestrationRunResult,
  OrchestrationStopReason,
} from './orchestration-service.types.js';
import { buildPositionalGraphReality } from './reality.builder.js';
import type { PositionalGraphReality } from './reality.types.js';

// ── Constructor options ─────────────────────────────────

export interface GraphOrchestrationOptions {
  readonly graphSlug: string;
  readonly ctx: WorkspaceContext;
  readonly graphService: IPositionalGraphService;
  readonly onbas: IONBAS;
  readonly ods: IODS;
  readonly eventHandlerService: IEventHandlerService;
  readonly maxIterations?: number;
}

// ── Default max iterations ──────────────────────────────

const DEFAULT_MAX_ITERATIONS = 100;

// ── GraphOrchestration ──────────────────────────────────

export class GraphOrchestration implements IGraphOrchestration {
  readonly graphSlug: string;
  private readonly ctx: WorkspaceContext;
  private readonly graphService: IPositionalGraphService;
  private readonly onbas: IONBAS;
  private readonly ods: IODS;
  private readonly eventHandlerService: IEventHandlerService;
  private readonly maxIterations: number;

  constructor(options: GraphOrchestrationOptions) {
    this.graphSlug = options.graphSlug;
    this.ctx = options.ctx;
    this.graphService = options.graphService;
    this.onbas = options.onbas;
    this.ods = options.ods;
    this.eventHandlerService = options.eventHandlerService;
    this.maxIterations = options.maxIterations ?? DEFAULT_MAX_ITERATIONS;
  }

  async run(): Promise<OrchestrationRunResult> {
    const actions: OrchestrationAction[] = [];
    let reality: PositionalGraphReality | undefined;
    let iterations = 0;

    for (let i = 0; i < this.maxIterations; i++) {
      iterations++;

      // 1. Settle: process pending events
      const state = await this.graphService.loadGraphState(this.ctx, this.graphSlug);
      this.eventHandlerService.processGraph(state, 'orchestrator', 'cli');

      // 2. Build reality snapshot
      reality = await this.buildReality();

      // 3. Decide: ask ONBAS what to do
      const request = this.onbas.getNextAction(reality);

      // 4. Exit check: no-action means loop is done
      if (request.type === 'no-action') {
        return {
          errors: [],
          actions,
          stopReason: this.mapStopReason(request.reason),
          finalReality: reality,
          iterations,
        };
      }

      // 5. Act: execute the decision
      const result = await this.ods.execute(request, this.ctx, reality);

      // 6. Record
      actions.push({
        request,
        result,
        timestamp: new Date().toISOString(),
      });
    }

    // Max iterations reached — safety exit
    return {
      errors: [
        {
          code: 'MAX_ITERATIONS',
          message: `Orchestration loop reached max iterations (${this.maxIterations})`,
        },
      ],
      actions,
      stopReason: 'no-action',
      finalReality: reality ?? (await this.buildReality()),
      iterations,
    };
  }

  async getReality(): Promise<PositionalGraphReality> {
    return this.buildReality();
  }

  private async buildReality(): Promise<PositionalGraphReality> {
    const [statusResult, state] = await Promise.all([
      this.graphService.getStatus(this.ctx, this.graphSlug),
      this.graphService.loadGraphState(this.ctx, this.graphSlug),
    ]);
    return buildPositionalGraphReality({ statusResult, state });
  }

  private mapStopReason(reason: string | undefined): OrchestrationStopReason {
    switch (reason) {
      case 'graph-complete':
        return 'graph-complete';
      case 'graph-failed':
        return 'graph-failed';
      default:
        return 'no-action';
    }
  }
}
