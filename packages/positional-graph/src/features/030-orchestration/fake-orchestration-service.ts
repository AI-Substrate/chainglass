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
  DriveEvent,
  DriveOptions,
  DriveResult,
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
  private readonly driveResults: DriveResult[] = [];
  private driveCallIndex = 0;
  private readonly driveHistory: (DriveOptions | undefined)[] = [];
  private driveEvents: DriveEvent[] = [];

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

  async drive(options?: DriveOptions): Promise<DriveResult> {
    this.driveHistory.push(options);
    if (this.driveResults.length === 0) {
      throw new Error(`FakeGraphOrchestration(${this.graphSlug}): no driveResults configured`);
    }
    // Emit configured events via onEvent callback
    for (const event of this.driveEvents) {
      await options?.onEvent?.(event);
    }
    const index = Math.min(this.driveCallIndex, this.driveResults.length - 1);
    this.driveCallIndex++;
    return this.driveResults[index];
  }

  async getReality(): Promise<PositionalGraphReality> {
    return this.config.reality;
  }

  async cleanup(): Promise<void> {
    this._cleanupCalls++;
  }

  private _cleanupCalls = 0;
  get cleanupCalls(): number {
    return this._cleanupCalls;
  }

  // ── Test helpers ────────────────────────────────────────

  /** Queue a DriveResult for drive() — FIFO, last repeats. */
  setDriveResult(result: DriveResult): void {
    this.driveResults.push(result);
  }

  /** Configure events that drive() will emit via onEvent before returning. */
  setDriveEvents(events: DriveEvent[]): void {
    this.driveEvents = events;
  }

  /** Get all drive() call options. */
  getDriveHistory(): readonly (DriveOptions | undefined)[] {
    return [...this.driveHistory];
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

  evict(worktreePath: string, graphSlug: string): void {
    this.handles.delete(graphSlug);
    this._evictCalls++;
  }

  private _evictCalls = 0;
  get evictCalls(): number {
    return this._evictCalls;
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
