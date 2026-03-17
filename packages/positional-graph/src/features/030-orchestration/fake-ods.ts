/**
 * FakeODS — Test double for IODS with configurable results and call tracking.
 *
 * Per ADR-0011: Fakes over mocks. Implements IODS interface and adds
 * test helpers for configuring responses and inspecting call history.
 *
 * @see Workshop #12 Part 6 (FakeODS design)
 * @packageDocumentation
 */

import type { WorkspaceContext } from '@chainglass/workflow';
import type { IODS } from './ods.types.js';
import type { OrchestrationRequest } from './orchestration-request.schema.js';
import type { OrchestrationExecuteResult } from './orchestration-request.types.js';
import type { PositionalGraphReality } from './reality.types.js';

// ── Call record ─────────────────────────────────────

export interface FakeODSCallRecord {
  readonly request: OrchestrationRequest;
  readonly ctx: WorkspaceContext;
  readonly reality: PositionalGraphReality;
}

// ── FakeODS ─────────────────────────────────────────

export class FakeODS implements IODS {
  private results: OrchestrationExecuteResult[] = [];
  private callIndex = 0;
  private readonly callHistory: FakeODSCallRecord[] = [];
  private readonly pendingErrors = new Map<string, { code: string; message: string }>();

  /** Inject a simulated pod error for testing drain logic. */
  simulatePodError(nodeId: string, code: string, message: string): void {
    this.pendingErrors.set(nodeId, { code, message });
  }

  drainErrors(): Map<string, { code: string; message: string }> {
    const errors = new Map(this.pendingErrors);
    this.pendingErrors.clear();
    return errors;
  }

  /** Set a single canned result for every call. */
  setNextResult(result: OrchestrationExecuteResult): void {
    this.results = [result];
    this.callIndex = 0;
  }

  /** Set a queue of results — each call consumes the next. Last repeats. */
  setResults(results: OrchestrationExecuteResult[]): void {
    this.results = [...results];
    this.callIndex = 0;
  }

  /** Get call history (each call record with request, ctx, reality). */
  getHistory(): readonly FakeODSCallRecord[] {
    return [...this.callHistory];
  }

  /** Reset all state. */
  reset(): void {
    this.results = [];
    this.callIndex = 0;
    this.callHistory.length = 0;
  }

  async execute(
    request: OrchestrationRequest,
    ctx: WorkspaceContext,
    reality: PositionalGraphReality
  ): Promise<OrchestrationExecuteResult> {
    this.callHistory.push({ request, ctx, reality });

    if (this.results.length === 0) {
      return { ok: true, request };
    }

    const index = Math.min(this.callIndex, this.results.length - 1);
    this.callIndex++;
    return this.results[index];
  }
}
