/**
 * Plan 076 FX002: Unified Workflow Execution Log — Types
 *
 * Data model for `buildExecutionLog()` results. Designed for three consumers:
 * - REST endpoint (GET /logs) — full JSON
 * - CLI command (cg wf logs) — human-readable + JSON
 * - UI diagnostics panel — timeline rendering
 *
 * @packageDocumentation
 */

// ── Timeline Entry ──────────────────────────────────────

export interface TimelineEntry {
  readonly timestamp: string;
  readonly nodeId: string;
  readonly unitSlug: string;
  readonly event: string;
  readonly source: string;
  readonly message: string;
  readonly detail?: unknown;
}

// ── Per-Node Log ────────────────────────────────────────

export interface NodeLog {
  readonly nodeId: string;
  readonly unitSlug: string;
  readonly unitType: 'agent' | 'code' | 'user-input';
  readonly status: string;
  readonly timing: {
    readonly startedAt: string | null;
    readonly completedAt: string | null;
    readonly durationMs: number | null;
  };
  readonly error: { readonly code: string; readonly message: string } | null;
  readonly agentSessionId: string | null;
  readonly events: TimelineEntry[];
  readonly outputs: Record<string, unknown>;
  readonly blockedBy: string[];
}

// ── Diagnostic ──────────────────────────────────────────

export interface Diagnostic {
  readonly severity: 'error' | 'warning' | 'info';
  readonly nodeId?: string;
  readonly code: string;
  readonly message: string;
  readonly fix?: string;
}

// ── Top-Level Log ───────────────────────────────────────

export interface WorkflowExecutionLog {
  readonly slug: string;
  readonly status: string;
  readonly timing: {
    readonly startedAt: string | null;
    readonly completedAt: string | null;
    readonly durationMs: number | null;
  };
  readonly progress: {
    readonly totalNodes: number;
    readonly completedNodes: number;
    readonly failedNodes: number;
    readonly runningNodes: number;
    readonly pendingNodes: number;
  };
  readonly timeline: TimelineEntry[];
  readonly nodes: Record<string, NodeLog>;
  readonly diagnostics: Diagnostic[];
}
