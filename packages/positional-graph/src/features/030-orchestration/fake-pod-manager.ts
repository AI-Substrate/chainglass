/**
 * FakePodManager + FakePod: test doubles for deterministic pod testing.
 *
 * FakePodManager implements IPodManager with configurable behaviors,
 * session seeding, and call history tracking.
 *
 * FakePod implements IWorkUnitPod with configurable execute results
 * and boolean tracking for wasExecuted/wasResumed/wasTerminated.
 *
 * @see Workshop #4 (04-work-unit-pods.md)
 */

import type { IPodManager, PodCreateParams } from './pod-manager.types.js';
import type { IWorkUnitPod, PodExecuteOptions, PodExecuteResult } from './pod.types.js';

// ── FakePod Configuration ────────────────────────────────────

export interface FakePodConfig {
  readonly executeResult?: PodExecuteResult;
  readonly resumeResult?: PodExecuteResult;
}

// ── FakePod ──────────────────────────────────────────────────

export class FakePod implements IWorkUnitPod {
  readonly unitType: 'agent' | 'code';
  readonly sessionId: string | undefined = undefined;

  wasExecuted = false;
  wasResumed = false;
  wasTerminated = false;

  constructor(
    readonly nodeId: string,
    unitType: 'agent' | 'code',
    private readonly config: FakePodConfig = {}
  ) {
    this.unitType = unitType;
  }

  async execute(_options: PodExecuteOptions): Promise<PodExecuteResult> {
    this.wasExecuted = true;
    return this.config.executeResult ?? { outcome: 'completed' };
  }

  async resumeWithAnswer(
    _questionId: string,
    _answer: unknown,
    _options: PodExecuteOptions
  ): Promise<PodExecuteResult> {
    this.wasResumed = true;
    return this.config.resumeResult ?? { outcome: 'completed' };
  }

  async terminate(): Promise<void> {
    this.wasTerminated = true;
  }
}

// ── Create History Entry ─────────────────────────────────────

export interface CreateHistoryEntry {
  readonly nodeId: string;
  readonly unitType: 'agent' | 'code';
  readonly unitSlug: string;
}

// ── FakePodManager ───────────────────────────────────────────

export class FakePodManager implements IPodManager {
  private readonly pods = new Map<string, FakePod>();
  private readonly sessions = new Map<string, string>();
  private readonly podConfigs = new Map<string, FakePodConfig>();
  private readonly createHistory: CreateHistoryEntry[] = [];

  // ── Test Helpers ──────────────────────────────────────────

  configurePod(nodeId: string, config: FakePodConfig): void {
    this.podConfigs.set(nodeId, config);
  }

  seedSession(nodeId: string, sessionId: string): void {
    this.sessions.set(nodeId, sessionId);
  }

  getCreateHistory(): readonly CreateHistoryEntry[] {
    return this.createHistory;
  }

  reset(): void {
    this.pods.clear();
    this.sessions.clear();
    this.podConfigs.clear();
    this.createHistory.length = 0;
  }

  // ── IPodManager Implementation ───────────────────────────

  createPod(nodeId: string, params: PodCreateParams): IWorkUnitPod {
    const existing = this.pods.get(nodeId);
    if (existing) return existing;

    this.createHistory.push({
      nodeId,
      unitType: params.unitType,
      unitSlug: params.unitSlug,
    });

    const config = this.podConfigs.get(nodeId) ?? {};
    const pod = new FakePod(nodeId, params.unitType, config);
    this.pods.set(nodeId, pod);
    return pod;
  }

  getPod(nodeId: string): IWorkUnitPod | undefined {
    return this.pods.get(nodeId);
  }

  getSessionId(nodeId: string): string | undefined {
    return this.sessions.get(nodeId);
  }

  setSessionId(nodeId: string, sessionId: string): void {
    this.sessions.set(nodeId, sessionId);
  }

  destroyPod(nodeId: string): void {
    this.pods.delete(nodeId);
  }

  getSessions(): ReadonlyMap<string, string> {
    return this.sessions;
  }

  async loadSessions(_ctx: { readonly worktreePath: string }, _graphSlug: string): Promise<void> {
    // No-op for fake
  }

  async persistSessions(
    _ctx: { readonly worktreePath: string },
    _graphSlug: string
  ): Promise<void> {
    // No-op for fake
  }
}
