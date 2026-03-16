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
import type { ISSEBroadcaster } from '@chainglass/shared/features/019-agent-manager-refactor/sse-broadcaster.interface';
import type { IWorkspaceService } from '@chainglass/workflow';
import type { IExecutionRegistry } from './execution-registry.types';

// ── Execution Key ───────────────────────────────────────
// FT-001: Key must be safe for GlobalState paths (domain:instanceId:property).
// parsePath() splits on ':' and instanceId must match [a-zA-Z0-9_-]+.
// Base64url encoding satisfies this and is reversible.

export type ExecutionKey = string;

export function makeExecutionKey(worktreePath: string, graphSlug: string): ExecutionKey {
  return Buffer.from(`${worktreePath}:${graphSlug}`).toString('base64url');
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
  resumeAll(): Promise<void>;
}

// ── Manager Dependencies ────────────────────────────────

export interface ExecutionManagerDeps {
  readonly orchestrationService: IOrchestrationService;
  readonly graphService: IPositionalGraphService;
  readonly workspaceService: IWorkspaceService;
  /** SSE broadcaster for execution events (FT-003: use contract, not internal). */
  readonly broadcaster: ISSEBroadcaster;
  /** Persistent execution registry for server restart recovery. Phase 5. */
  readonly registry: IExecutionRegistry;
  /** FT-006: Injected worktree existence check for resume validation. */
  readonly worktreeExists: (path: string) => boolean;
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
