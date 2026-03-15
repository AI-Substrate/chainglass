/**
 * Type definitions for WorkflowExecutionManager.
 * Plan 074: Workflow Execution from Web UI — Phase 2.
 */

import type {
  DriveResult,
  IGraphOrchestration,
  IOrchestrationService,
  IPositionalGraphService,
} from '@chainglass/positional-graph';
import type { IWorkspaceService } from '@chainglass/workflow';

// ── Execution Key ───────────────────────────────────────

export type ExecutionKey = `${string}:${string}`;

export function makeExecutionKey(worktreePath: string, graphSlug: string): ExecutionKey {
  return `${worktreePath}:${graphSlug}` as ExecutionKey;
}

// ── Execution Status (manager-level, not node-level) ────

export type ManagerExecutionStatus =
  | 'idle'
  | 'starting'
  | 'running'
  | 'stopping'
  | 'stopped'
  | 'completed'
  | 'failed';

// ── Execution Handle ────────────────────────────────────

export interface ExecutionHandle {
  readonly key: ExecutionKey;
  readonly worktreePath: string;
  readonly graphSlug: string;
  readonly workspaceSlug: string;
  status: ManagerExecutionStatus;
  controller: AbortController | null;
  drivePromise: Promise<DriveResult> | null;
  orchestrationHandle: IGraphOrchestration | null;
  iterations: number;
  totalActions: number;
  lastEventType: string;
  lastMessage: string;
  startedAt: string | null;
  stoppedAt: string | null;
}

// ── Manager API ─────────────────────────────────────────

export interface StartResult {
  readonly started: boolean;
  readonly already: boolean;
  readonly key: ExecutionKey;
}

export interface StopResult {
  readonly stopped: boolean;
}

export interface IWorkflowExecutionManager {
  start(
    ctx: { workspaceSlug: string; worktreePath: string },
    graphSlug: string
  ): Promise<StartResult>;
  stop(worktreePath: string, graphSlug: string): Promise<StopResult>;
  restart(
    ctx: { workspaceSlug: string; worktreePath: string },
    graphSlug: string
  ): Promise<StartResult>;
  getStatus(worktreePath: string, graphSlug: string): ManagerExecutionStatus;
  getHandle(worktreePath: string, graphSlug: string): ExecutionHandle | undefined;
  getSerializableStatus(
    worktreePath: string,
    graphSlug: string
  ): SerializableExecutionStatus | undefined;
  listRunning(): ExecutionHandle[];
  cleanup(): Promise<void>;
}

// ── Manager Dependencies ────────────────────────────────

export interface ExecutionManagerDeps {
  readonly orchestrationService: IOrchestrationService;
  readonly graphService: IPositionalGraphService;
  readonly workspaceService: IWorkspaceService;
  /** SSE broadcast function — injected for testability. Signature matches SSEManager.broadcast(). */
  readonly broadcast: (channelId: string, eventType: string, data: unknown) => void;
}

// ── Serializable Status (DYK #1: ExecutionHandle has non-serializable fields) ──

/** Safe-to-serialize snapshot of an execution handle for server action responses. */
export interface SerializableExecutionStatus {
  readonly key: ExecutionKey;
  readonly worktreePath: string;
  readonly graphSlug: string;
  readonly workspaceSlug: string;
  readonly status: ManagerExecutionStatus;
  readonly iterations: number;
  readonly totalActions: number;
  readonly lastEventType: string;
  readonly lastMessage: string;
  readonly startedAt: string | null;
  readonly stoppedAt: string | null;
}
