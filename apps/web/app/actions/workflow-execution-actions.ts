'use server';

/**
 * Workflow Execution Server Actions — run/stop/restart/status for workflow pipelines.
 *
 * Plan 074 Phase 3: SSE + GlobalState Plumbing.
 *
 * These actions invoke the WorkflowExecutionManager singleton (globalThis).
 * DYK #3: SSE broadcasts race ahead of these responses — Phase 4 must gate
 * button enablement on action response, not SSE status.
 * DYK #4: Phase 4 must call getWorkflowExecutionStatus on mount to hydrate
 * initial state before SSE events arrive.
 */

import { requireAuth } from '@/features/063-login/lib/require-auth';
import { getWorkflowExecutionManager } from '../../src/features/074-workflow-execution/get-manager';
import type { SerializableExecutionStatus } from '../../src/features/074-workflow-execution/workflow-execution-manager.types';

// ─── Types ───────────────────────────────────────────────────────────

interface ActionResult {
  ok: boolean;
  error?: string;
}

interface RunResult extends ActionResult {
  key?: string;
  already?: boolean;
}

// ─── Actions ─────────────────────────────────────────────────────────

export async function runWorkflow(
  slug: string,
  worktreePath: string,
  graphSlug: string
): Promise<RunResult> {
  await requireAuth();
  try {
    const manager = getWorkflowExecutionManager();
    const result = await manager.start({ workspaceSlug: slug, worktreePath }, graphSlug);
    return { ok: result.started, key: result.key, already: result.already };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function stopWorkflow(worktreePath: string, graphSlug: string): Promise<ActionResult> {
  await requireAuth();
  try {
    const manager = getWorkflowExecutionManager();
    const result = await manager.stop(worktreePath, graphSlug);
    return { ok: result.stopped };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function restartWorkflow(
  slug: string,
  worktreePath: string,
  graphSlug: string
): Promise<RunResult> {
  await requireAuth();
  try {
    const manager = getWorkflowExecutionManager();
    const result = await manager.restart({ workspaceSlug: slug, worktreePath }, graphSlug);
    return { ok: result.started, key: result.key };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * DYK #1: Returns SerializableExecutionStatus (no AbortController/Promise/IGraphOrchestration).
 * DYK #4: Phase 4 must call this on mount to hydrate initial state.
 */
export async function getWorkflowExecutionStatus(
  worktreePath: string,
  graphSlug: string
): Promise<SerializableExecutionStatus | null> {
  await requireAuth();
  try {
    const manager = getWorkflowExecutionManager();
    return manager.getSerializableStatus(worktreePath, graphSlug) ?? null;
  } catch {
    return null;
  }
}
