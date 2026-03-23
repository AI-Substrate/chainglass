/**
 * FakeWorkflowApiClient — In-memory mock for SDK contract testing.
 *
 * Plan 076 Phase 4 Subtask 001: REST API + SDK.
 *
 * Implements IWorkflowApiClient with a state machine:
 *   idle → running → stopped/completed
 *   any state → idle (via restart)
 *
 * ST-DYK #4: Uses a real state machine, not just canned responses.
 * This ensures contract tests verify actual state transitions.
 */

import type {
  IWorkflowApiClient,
  WorkflowDetailedStatus,
  WorkflowExecutionStatus,
  WorkflowRunResult,
  WorkflowStopResult,
} from '@chainglass/shared/sdk/workflow';
import { WorkflowApiError } from '@chainglass/shared/sdk/workflow';

type FakeState = 'idle' | 'running' | 'stopped' | 'completed' | 'failed';

interface FakeExecution {
  graphSlug: string;
  state: FakeState;
  iterations: number;
  totalActions: number;
  startedAt: string | null;
  stoppedAt: string | null;
}

export class FakeWorkflowApiClient implements IWorkflowApiClient {
  private readonly workspaceSlug: string;
  private readonly worktreePath: string;
  private readonly executions = new Map<string, FakeExecution>();

  /** Exposed for test assertions — inspect internal state. */
  get _executions(): ReadonlyMap<string, FakeExecution> {
    return this.executions;
  }

  constructor(config: { workspaceSlug: string; worktreePath: string }) {
    this.workspaceSlug = config.workspaceSlug;
    this.worktreePath = config.worktreePath;
  }

  async run(graphSlug: string): Promise<WorkflowRunResult> {
    const existing = this.executions.get(graphSlug);

    if (existing && existing.state === 'running') {
      return { ok: true, key: this.makeKey(graphSlug), already: true };
    }

    this.executions.set(graphSlug, {
      graphSlug,
      state: 'running',
      iterations: 0,
      totalActions: 0,
      startedAt: new Date().toISOString(),
      stoppedAt: null,
    });

    return { ok: true, key: this.makeKey(graphSlug), already: false };
  }

  async stop(graphSlug: string): Promise<WorkflowStopResult> {
    const execution = this.executions.get(graphSlug);

    if (!execution || execution.state !== 'running') {
      return { ok: true, stopped: false };
    }

    execution.state = 'stopped';
    execution.stoppedAt = new Date().toISOString();
    return { ok: true, stopped: true };
  }

  async restart(graphSlug: string): Promise<WorkflowRunResult> {
    // Restart: stop + reset + start
    this.executions.delete(graphSlug);

    this.executions.set(graphSlug, {
      graphSlug,
      state: 'running',
      iterations: 0,
      totalActions: 0,
      startedAt: new Date().toISOString(),
      stoppedAt: null,
    });

    return { ok: true, key: this.makeKey(graphSlug) };
  }

  async getStatus(graphSlug: string): Promise<WorkflowExecutionStatus | null> {
    const execution = this.executions.get(graphSlug);
    if (!execution) return null;

    return {
      key: this.makeKey(graphSlug),
      worktreePath: this.worktreePath,
      graphSlug,
      workspaceSlug: this.workspaceSlug,
      status: execution.state === 'idle' ? 'idle' : execution.state,
      iterations: execution.iterations,
      totalActions: execution.totalActions,
      lastEventType: execution.state === 'running' ? 'iteration' : '',
      lastMessage: '',
      startedAt: execution.startedAt,
      stoppedAt: execution.stoppedAt,
    };
  }

  async getDetailed(graphSlug: string): Promise<WorkflowDetailedStatus | null> {
    const execution = this.executions.get(graphSlug);
    if (!execution) {
      // Return a minimal detailed status even without running execution
      return {
        slug: graphSlug,
        execution: {
          status: 'pending',
          totalNodes: 2,
          completedNodes: 0,
          progress: '0%',
        },
        lines: [
          {
            id: 'fake-line-1',
            label: 'Test Line',
            nodes: [
              {
                id: 'fake-node-1',
                unitSlug: 'test-unit',
                type: 'agent',
                status: 'pending',
                startedAt: null,
                completedAt: null,
                error: null,
                sessionId: null,
                blockedBy: [],
              },
              {
                id: 'fake-node-2',
                unitSlug: 'test-unit-2',
                type: 'code',
                status: 'pending',
                startedAt: null,
                completedAt: null,
                error: null,
                sessionId: null,
                blockedBy: [],
              },
            ],
          },
        ],
        questions: [],
        sessions: {},
        errors: [],
      };
    }

    return {
      slug: graphSlug,
      execution: {
        status: execution.state === 'running' ? 'in_progress' : execution.state,
        totalNodes: 2,
        completedNodes: execution.state === 'completed' ? 2 : 0,
        progress: execution.state === 'completed' ? '100%' : '0%',
      },
      lines: [
        {
          id: 'fake-line-1',
          label: 'Test Line',
          nodes: [
            {
              id: 'fake-node-1',
              unitSlug: 'test-unit',
              type: 'agent',
              status: execution.state === 'completed' ? 'complete' : 'pending',
              startedAt: execution.startedAt,
              completedAt: execution.state === 'completed' ? execution.stoppedAt : null,
              error: null,
              sessionId: null,
              blockedBy: [],
            },
            {
              id: 'fake-node-2',
              unitSlug: 'test-unit-2',
              type: 'code',
              status: execution.state === 'completed' ? 'complete' : 'pending',
              startedAt: null,
              completedAt: null,
              error: null,
              sessionId: null,
              blockedBy: [],
            },
          ],
        },
      ],
      questions: [],
      sessions: {},
      errors: [],
    };
  }

  // ── Test Helpers ──────────────────────────────────────

  /** Simulate iterations progressing (for poll testing). */
  simulateProgress(graphSlug: string, iterations: number, actions: number): void {
    const execution = this.executions.get(graphSlug);
    if (execution) {
      execution.iterations = iterations;
      execution.totalActions = actions;
    }
  }

  /** Simulate workflow completion. */
  simulateComplete(graphSlug: string): void {
    const execution = this.executions.get(graphSlug);
    if (execution) {
      execution.state = 'completed';
      execution.stoppedAt = new Date().toISOString();
    }
  }

  /** Reset all state. */
  reset(): void {
    this.executions.clear();
  }

  private makeKey(graphSlug: string): string {
    return Buffer.from(`${this.worktreePath}:${graphSlug}`).toString('base64url');
  }
}
