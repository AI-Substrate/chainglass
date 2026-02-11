/**
 * FakeOrchestrationService + FakeGraphOrchestration — Test doubles for downstream consumers.
 *
 * Per Plan 030 Phase 7, Workshop #7 fake design.
 * Follows the codebase pattern: FakeXxx implements interface + adds test helpers.
 *
 * @packageDocumentation
 */

import type { WorkspaceContext } from '@chainglass/workflow';
import type {
  FakeGraphConfig,
  IGraphOrchestration,
  IOrchestrationService,
  OrchestrationRunResult,
} from './orchestration-service.types.js';
import type { PositionalGraphReality } from './reality.types.js';

// ── Call record ─────────────────────────────────────────

export interface FakeGetCallRecord {
  readonly ctx: WorkspaceContext;
  readonly graphSlug: string;
}

// ── FakeGraphOrchestration ──────────────────────────────

export class FakeGraphOrchestration implements IGraphOrchestration {
  readonly graphSlug: string;
  private readonly config: FakeGraphConfig;
  private callIndex = 0;

  constructor(graphSlug: string, config: FakeGraphConfig) {
    this.graphSlug = graphSlug;
    this.config = config;
  }

  async run(): Promise<OrchestrationRunResult> {
    const { runResults } = this.config;
    if (runResults.length === 0) {
      throw new Error(`FakeGraphOrchestration(${this.graphSlug}): no runResults configured`);
    }
    const index = Math.min(this.callIndex, runResults.length - 1);
    this.callIndex++;
    return runResults[index];
  }

  async getReality(): Promise<PositionalGraphReality> {
    return this.config.reality;
  }
}

// ── FakeOrchestrationService ────────────────────────────

export class FakeOrchestrationService implements IOrchestrationService {
  private readonly configs = new Map<string, FakeGraphConfig>();
  private readonly handles = new Map<string, FakeGraphOrchestration>();
  private readonly getHistory: FakeGetCallRecord[] = [];

  /** Configure a graph slug with its fake behavior. Must be called before get(). */
  configureGraph(graphSlug: string, config: FakeGraphConfig): void {
    this.configs.set(graphSlug, config);
  }

  async get(ctx: WorkspaceContext, graphSlug: string): Promise<IGraphOrchestration> {
    this.getHistory.push({ ctx, graphSlug });

    const config = this.configs.get(graphSlug);
    if (!config) {
      throw new Error(
        `FakeOrchestrationService: no config for graph '${graphSlug}'. Call configureGraph() first.`
      );
    }

    let handle = this.handles.get(graphSlug);
    if (!handle) {
      handle = new FakeGraphOrchestration(graphSlug, config);
      this.handles.set(graphSlug, handle);
    }
    return handle;
  }

  /** Get all get() calls. */
  getGetHistory(): readonly FakeGetCallRecord[] {
    return [...this.getHistory];
  }

  /** Clear all state. */
  reset(): void {
    this.configs.clear();
    this.handles.clear();
    this.getHistory.length = 0;
  }
}
