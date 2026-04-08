/**
 * IWorkflowApiClient — Typed contract for the Workflow REST API SDK.
 *
 * Plan 076 Phase 4: REST API + SDK.
 *
 * Defines the interface between SDK consumers (CG CLI, harness CLI)
 * and the Tier 1 REST API endpoints. Response DTOs mirror the existing
 * SerializableExecutionStatus and CLI --detailed output structures.
 *
 * Importable from both SDK and test code without pulling in fetch or server deps.
 */

// ── Response DTOs ───────────────────────────────────────

/** Result of POST /execution (start) and POST /execution/restart */
export interface WorkflowRunResult {
  readonly ok: boolean;
  readonly key?: string;
  readonly already?: boolean;
  readonly error?: string;
}

/** Result of DELETE /execution (stop) */
export interface WorkflowStopResult {
  readonly ok: boolean;
  readonly stopped?: boolean;
  readonly error?: string;
}

/** Execution-level status from GET /execution — mirrors SerializableExecutionStatus */
export interface WorkflowExecutionStatus {
  readonly key: string;
  readonly worktreePath: string;
  readonly graphSlug: string;
  readonly workspaceSlug: string;
  readonly status:
    | 'idle'
    | 'starting'
    | 'running'
    | 'stopping'
    | 'stopped'
    | 'completed'
    | 'failed';
  readonly iterations: number;
  readonly totalActions: number;
  readonly lastEventType: string;
  readonly lastMessage: string;
  readonly startedAt: string | null;
  readonly stoppedAt: string | null;
}

/** Per-node detail within a line — mirrors CLI --detailed node output */
export interface DetailedNode {
  readonly id: string;
  readonly unitSlug: string;
  readonly type: string;
  readonly status: string;
  readonly startedAt: string | null;
  readonly completedAt: string | null;
  readonly error: string | null;
  readonly sessionId: string | null;
  readonly blockedBy: string[];
}

/** Per-line detail — mirrors CLI --detailed line output */
export interface DetailedLine {
  readonly id: string;
  readonly label: string;
  readonly nodes: DetailedNode[];
}

/** Full detailed status from GET /detailed — mirrors CLI `wf show --detailed` output */
export interface WorkflowDetailedStatus {
  readonly slug: string;
  readonly execution: {
    readonly status: string;
    readonly totalNodes: number;
    readonly completedNodes: number;
    readonly progress: string;
  };
  readonly lines: DetailedLine[];
  readonly questions: unknown[];
  readonly sessions: Record<string, string>;
  readonly errors: unknown[];
}

// ── SDK Error ───────────────────────────────────────────

export class WorkflowApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly body?: unknown
  ) {
    super(message);
    this.name = 'WorkflowApiError';
  }
}

// ── Interface ───────────────────────────────────────────

/** Client contract for workflow execution REST API (Tier 1 — 5 endpoints). */
export interface IWorkflowApiClient {
  /** POST /execution — Start a workflow. */
  run(graphSlug: string): Promise<WorkflowRunResult>;

  /** DELETE /execution — Stop a running workflow. */
  stop(graphSlug: string): Promise<WorkflowStopResult>;

  /** POST /execution/restart — Restart a workflow (stop + reset + start). */
  restart(graphSlug: string): Promise<WorkflowRunResult>;

  /** GET /execution — Poll current execution status. */
  getStatus(graphSlug: string): Promise<WorkflowExecutionStatus | null>;

  /** GET /detailed — Rich per-node diagnostics (timing, sessions, blockers). */
  getDetailed(graphSlug: string): Promise<WorkflowDetailedStatus | null>;

  /** GET /logs — Unified execution log with timeline + diagnostics. */
  getLogs(graphSlug: string): Promise<unknown>;
}

// ── Client Configuration ────────────────────────────────

export interface WorkflowApiClientConfig {
  /** Base URL of the web server (e.g. http://localhost:3000) */
  readonly baseUrl: string;
  /** Workspace slug for URL construction */
  readonly workspaceSlug: string;
  /** Worktree path sent in request bodies/query params */
  readonly worktreePath: string;
  /** Request timeout in milliseconds (default: 30000) */
  readonly timeoutMs?: number;
  /** Local auth token from .chainglass/server.json (DYK #5) */
  readonly localToken?: string;
}
