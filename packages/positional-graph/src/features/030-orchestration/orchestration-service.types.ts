/**
 * Orchestration service types — the public entry point for orchestration.
 *
 * Two-level pattern:
 * - IOrchestrationService (singleton, DI-registered) → factory for per-graph handles
 * - IGraphOrchestration (per-graph handle) → run() the orchestration loop, getReality()
 *
 * Per Plan 030 Phase 7, Workshop #7, DYK Critical Insights (2026-02-09).
 *
 * @packageDocumentation
 */

import type { BaseResult } from '@chainglass/shared';
import type { WorkspaceContext } from '@chainglass/workflow';
import type { OrchestrationRequest } from './orchestration-request.schema.js';
import type { OrchestrationExecuteResult } from './orchestration-request.types.js';
import type { PositionalGraphReality } from './reality.types.js';

// ── OrchestrationStopReason ────────────────────────────

/**
 * Why the orchestration loop stopped.
 *
 * 3-value union per DYK Insight #3 (question-pending removed — dead code):
 * - 'no-action': ONBAS found nothing actionable (all-running, all-waiting, empty, transition-blocked)
 * - 'graph-complete': all nodes complete
 * - 'graph-failed': unrecoverable failure
 */
export type OrchestrationStopReason = 'no-action' | 'graph-complete' | 'graph-failed';

// ── OrchestrationAction ────────────────────────────────

/**
 * One action taken during a run() call.
 * Records the ONBAS request, ODS result, and when it happened.
 */
export interface OrchestrationAction {
  readonly request: OrchestrationRequest;
  readonly result: OrchestrationExecuteResult;
  readonly timestamp: string;
}

// ── OrchestrationRunResult ─────────────────────────────

/**
 * Result of a single run() call on a graph handle.
 * Extends BaseResult for error consistency with the rest of the codebase.
 */
export interface OrchestrationRunResult extends BaseResult {
  /** Actions taken during this run (may be empty if no-action on first iteration). */
  readonly actions: readonly OrchestrationAction[];
  /** Why the loop stopped. */
  readonly stopReason: OrchestrationStopReason;
  /** The final reality snapshot after all actions. */
  readonly finalReality: PositionalGraphReality;
  /** How many loop iterations were executed. */
  readonly iterations: number;
}

// ── IGraphOrchestration ────────────────────────────────

/**
 * Per-graph orchestration handle.
 *
 * One handle per graph slug. Carries identity (graphSlug) and provides
 * run() to advance orchestration and getReality() for read-only state.
 * Captured ctx at .get() time — one handle = one graph = one ctx.
 */
export interface IGraphOrchestration {
  /** The graph this handle is bound to. */
  readonly graphSlug: string;

  /**
   * Run the orchestration loop: settle events → build reality → ONBAS →
   * exit check → ODS → record → repeat. Returns when loop exits.
   */
  run(): Promise<OrchestrationRunResult>;

  /** Build and return a fresh reality snapshot (read-only). */
  getReality(): Promise<PositionalGraphReality>;
}

// ── IOrchestrationService ──────────────────────────────

/**
 * Singleton orchestration service — resolves from DI container.
 *
 * get() creates or returns a cached IGraphOrchestration handle for a graph.
 * Handle caching: same graphSlug → same handle within process lifetime.
 */
export interface IOrchestrationService {
  /**
   * Get a per-graph orchestration handle. Creates on first call, caches thereafter.
   * @param ctx - Workspace context (captured for the handle's lifetime)
   * @param graphSlug - Which graph to orchestrate
   */
  get(ctx: WorkspaceContext, graphSlug: string): Promise<IGraphOrchestration>;
}

// ── FakeGraphConfig ────────────────────────────────────

/**
 * Configuration for a FakeGraphOrchestration instance.
 * Used by FakeOrchestrationService to set up per-graph test doubles.
 */
export interface FakeGraphConfig {
  /** Queued results for run() — returned in FIFO order. Last repeats. */
  readonly runResults: OrchestrationRunResult[];
  /** Reality to return from getReality(). */
  readonly reality: PositionalGraphReality;
}
