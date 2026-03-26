'use server';

/**
 * Workflow Execution Server Actions — run/stop/restart/status for workflow pipelines.
 *
 * Plan 074 Phase 3: SSE + GlobalState Plumbing.
 *
 * These actions invoke the WorkflowExecutionManager singleton (globalThis).
 * FT-002: All actions validate worktreePath against known workspace worktrees.
 * DYK #3: SSE broadcasts race ahead of these responses — Phase 4 must gate
 * button enablement on action response, not SSE status.
 * DYK #4: Phase 4 must call getWorkflowExecutionStatus on mount to hydrate
 * initial state before SSE events arrive.
 */

import { WORKSPACE_DI_TOKENS } from '@chainglass/shared';
import type { IWorkspaceService } from '@chainglass/workflow';

import { requireAuth } from '@/features/063-login/lib/require-auth';

import { getWorkflowExecutionManager } from '../../src/features/074-workflow-execution/get-manager';
import type { SerializableExecutionStatus } from '../../src/features/074-workflow-execution/workflow-execution-manager.types';
import { getContainer } from '../../src/lib/bootstrap-singleton';

// ─── Helpers ─────────────────────────────────────────────────────────

/** Validate worktreePath against known workspace worktrees (FT-002). */
async function resolveValidatedWorktreePath(
  workspaceSlug: string,
  worktreePath: string
): Promise<string | null> {
  const container = getContainer();
  const workspaceService = container.resolve<IWorkspaceService>(
    WORKSPACE_DI_TOKENS.WORKSPACE_SERVICE
  );
  const info = await workspaceService.getInfo(workspaceSlug);
  if (!info) return null;
  const match = info.worktrees.find((w) => w.path === worktreePath);
  return match ? match.path : null;
}

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
    const validatedPath = await resolveValidatedWorktreePath(slug, worktreePath);
    if (!validatedPath) return { ok: false, error: 'Invalid workspace or worktree' };
    const manager = getWorkflowExecutionManager();
    const result = await manager.start(
      { workspaceSlug: slug, worktreePath: validatedPath },
      graphSlug
    );
    if (result.already) {
      return { ok: true, key: result.key, already: true };
    }
    return { ok: result.started, key: result.key, already: false };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function stopWorkflow(
  slug: string,
  worktreePath: string,
  graphSlug: string
): Promise<ActionResult> {
  await requireAuth();
  try {
    const validatedPath = await resolveValidatedWorktreePath(slug, worktreePath);
    if (!validatedPath) return { ok: false, error: 'Invalid workspace or worktree' };
    const manager = getWorkflowExecutionManager();
    const result = await manager.stop(validatedPath, graphSlug);
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
    const validatedPath = await resolveValidatedWorktreePath(slug, worktreePath);
    if (!validatedPath) return { ok: false, error: 'Invalid workspace or worktree' };
    const manager = getWorkflowExecutionManager();
    const result = await manager.restart(
      { workspaceSlug: slug, worktreePath: validatedPath },
      graphSlug
    );
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
  slug: string,
  worktreePath: string,
  graphSlug: string
): Promise<SerializableExecutionStatus | null> {
  await requireAuth();
  try {
    const validatedPath = await resolveValidatedWorktreePath(slug, worktreePath);
    if (!validatedPath) return null;
    const manager = getWorkflowExecutionManager();
    return manager.getSerializableStatus(validatedPath, graphSlug) ?? null;
  } catch {
    return null;
  }
}
