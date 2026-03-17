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
import { generateEventId } from '../032-node-event-system/event-id.js';
import { abortableSleep } from './abortable-sleep.js';
import type { IODS } from './ods.types.js';
import type { IONBAS } from './onbas.types.js';
import type {
  DriveEvent,
  DriveOptions,
  DriveResult,
  IGraphOrchestration,
  OrchestrationAction,
  OrchestrationRunResult,
  OrchestrationStopReason,
} from './orchestration-service.types.js';
import type { IPodManager } from './pod-manager.types.js';
import { buildPositionalGraphReality } from './reality.builder.js';
import { formatGraphStatus } from './reality.format.js';
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
  /** Optional — required only if drive() is used. Throws at runtime if missing. */
  readonly podManager?: IPodManager;
}

// ── Default max iterations ──────────────────────────────

const DEFAULT_MAX_ITERATIONS = 100;
const DEFAULT_DRIVE_MAX_ITERATIONS = 200;
const DEFAULT_ACTION_DELAY_MS = 100;
const DEFAULT_IDLE_DELAY_MS = 10_000;

// ── GraphOrchestration ──────────────────────────────────

export class GraphOrchestration implements IGraphOrchestration {
  readonly graphSlug: string;
  private readonly ctx: WorkspaceContext;
  private readonly graphService: IPositionalGraphService;
  private readonly onbas: IONBAS;
  private readonly ods: IODS;
  private readonly eventHandlerService: IEventHandlerService;
  private readonly maxIterations: number;
  private readonly podManager?: IPodManager;

  constructor(options: GraphOrchestrationOptions) {
    this.graphSlug = options.graphSlug;
    this.ctx = options.ctx;
    this.graphService = options.graphService;
    this.onbas = options.onbas;
    this.ods = options.ods;
    this.eventHandlerService = options.eventHandlerService;
    this.maxIterations = options.maxIterations ?? DEFAULT_MAX_ITERATIONS;
    this.podManager = options.podManager;
  }

  async run(): Promise<OrchestrationRunResult> {
    const actions: OrchestrationAction[] = [];
    let reality: PositionalGraphReality | undefined;
    let iterations = 0;

    for (let i = 0; i < this.maxIterations; i++) {
      iterations++;

      // 1. Settle: process pending events and persist mutations
      const state = await this.graphService.loadGraphState(this.ctx, this.graphSlug);

      // 1a. Drain ODS pod errors into state as node:error events (P1-DYK #1)
      // Injected into in-memory state BEFORE processGraph() so handlers pick them up
      // in the same settle cycle. No concurrent file access — drive loop owns state.
      const podErrors = this.ods.drainErrors();
      for (const [nodeId, error] of podErrors) {
        if (!state.nodes) state.nodes = {};
        const entry = state.nodes[nodeId];
        if (entry) {
          const events = entry.events ?? [];
          entry.events = [
            ...events,
            {
              event_id: generateEventId(),
              event_type: 'node:error',
              source: 'orchestrator',
              payload: { code: error.code, message: error.message },
              status: 'new',
              stops_execution: true,
              created_at: new Date().toISOString(),
            },
          ];
        }
      }

      this.eventHandlerService.processGraph(state, 'orchestrator', 'cli');
      await this.graphService.persistGraphState(this.ctx, this.graphSlug, state);

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

  async cleanup(): Promise<void> {
    if (this.podManager) {
      await this.podManager.destroyAllPods();
      await this.podManager.persistSessions(this.ctx, this.graphSlug);
    }
  }

  async drive(options?: DriveOptions): Promise<DriveResult> {
    const maxIterations = options?.maxIterations ?? DEFAULT_DRIVE_MAX_ITERATIONS;
    const actionDelayMs = options?.actionDelayMs ?? DEFAULT_ACTION_DELAY_MS;
    const idleDelayMs = options?.idleDelayMs ?? DEFAULT_IDLE_DELAY_MS;
    const signal = options?.signal;
    const emit = async (event: DriveEvent) => {
      await options?.onEvent?.(event);
    };

    // Check for already-aborted signal before starting
    if (signal?.aborted) {
      await emit({ type: 'status', message: 'Drive stopped — signal already aborted' });
      return { exitReason: 'stopped', iterations: 0, totalActions: 0 };
    }

    await this.podManager?.loadSessions(this.ctx, this.graphSlug);

    let iterations = 0;
    let totalActions = 0;

    for (let i = 0; i < maxIterations; i++) {
      // Check abort signal at iteration boundary
      if (signal?.aborted) {
        await emit({ type: 'status', message: 'Drive stopped — aborted between iterations' });
        await this.podManager?.persistSessions(this.ctx, this.graphSlug);
        return { exitReason: 'stopped', iterations, totalActions };
      }

      let result: OrchestrationRunResult;
      try {
        result = await this.run();
      } catch (err) {
        await emit({
          type: 'error',
          message: err instanceof Error ? err.message : String(err),
          error: err,
        });
        return { exitReason: 'failed', iterations, totalActions };
      }

      iterations++;
      totalActions += result.actions.length;

      // Emit status view after every iteration (including terminal)
      await emit({ type: 'status', message: formatGraphStatus(result.finalReality) });

      // Persist sessions every iteration (fire-and-forget .then() may have settled)
      await this.podManager?.persistSessions(this.ctx, this.graphSlug);

      // Check for terminal state
      if (result.stopReason === 'graph-complete') {
        await emit({ type: 'iteration', message: 'Graph complete', data: result });
        return { exitReason: 'complete', iterations, totalActions };
      }
      if (result.stopReason === 'graph-failed') {
        await emit({ type: 'iteration', message: 'Graph failed', data: result });
        return { exitReason: 'failed', iterations, totalActions };
      }

      // Non-terminal: emit iteration or idle event, delay with abort support
      const hadActions = result.actions.length > 0;
      if (hadActions) {
        await emit({
          type: 'iteration',
          message: `${result.actions.length} action(s)`,
          data: result,
        });
      } else {
        await emit({ type: 'idle', message: 'No actions — polling' });
      }

      // Sleep with abort support — catches AbortError to exit cleanly
      try {
        await abortableSleep(hadActions ? actionDelayMs : idleDelayMs, signal);
      } catch {
        // AbortError — signal fired during sleep
        await emit({ type: 'status', message: 'Drive stopped — aborted during sleep' });
        await this.podManager?.persistSessions(this.ctx, this.graphSlug);
        return { exitReason: 'stopped', iterations, totalActions };
      }
    }

    return { exitReason: 'max-iterations', iterations, totalActions };
  }

  private async buildReality(): Promise<PositionalGraphReality> {
    const [statusResult, state, loadResult] = await Promise.all([
      this.graphService.getStatus(this.ctx, this.graphSlug),
      this.graphService.loadGraphState(this.ctx, this.graphSlug),
      this.graphService.load(this.ctx, this.graphSlug),
    ]);
    return buildPositionalGraphReality({
      statusResult,
      state,
      settings: loadResult.definition?.orchestratorSettings,
    });
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
