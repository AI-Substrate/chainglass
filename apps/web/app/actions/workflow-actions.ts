'use server';

/**
 * Workflow Server Actions — load, list, create workflows + list work units
 *
 * Server actions callable from client components.
 * Resolve services from DI container and delegate to IPositionalGraphService.
 *
 * Phase 2: Canvas Core + Layout — Plan 050
 */

import type { IPositionalGraphService } from '@chainglass/positional-graph';
import type { IWorkUnitService } from '@chainglass/positional-graph';
import { POSITIONAL_GRAPH_DI_TOKENS, WORKSPACE_DI_TOKENS } from '@chainglass/shared';
import type { IWorkspaceService, WorkspaceContext } from '@chainglass/workflow';
import type {
  CreateWorkflowResult,
  ListWorkUnitsResult,
  ListWorkflowsResult,
  LoadWorkflowResult,
  WorkflowSummary,
} from '../../src/features/050-workflow-page/types';
import { getContainer } from '../../src/lib/bootstrap-singleton';

// ─── Helpers ─────────────────────────────────────────────────────────

async function resolveWorkspaceContext(
  slug: string,
  worktreePath?: string,
): Promise<WorkspaceContext | null> {
  const container = getContainer();
  const workspaceService = container.resolve<IWorkspaceService>(
    WORKSPACE_DI_TOKENS.WORKSPACE_SERVICE
  );
  const info = await workspaceService.getInfo(slug);
  if (!info) return null;

  const resolvedWorktreePath = worktreePath ?? info.path;
  const wt = info.worktrees.find((w) => w.path === resolvedWorktreePath);

  return {
    workspaceSlug: slug,
    workspaceName: info.name,
    workspacePath: info.path,
    worktreePath: resolvedWorktreePath,
    worktreeBranch: wt?.branch ?? null,
    isMainWorktree: resolvedWorktreePath === info.path,
    hasGit: info.hasGit,
  };
}

function resolveGraphService(): IPositionalGraphService {
  const container = getContainer();
  return container.resolve<IPositionalGraphService>(
    POSITIONAL_GRAPH_DI_TOKENS.POSITIONAL_GRAPH_SERVICE
  );
}

function resolveWorkUnitService(): IWorkUnitService {
  const container = getContainer();
  return container.resolve<IWorkUnitService>(POSITIONAL_GRAPH_DI_TOKENS.WORKUNIT_SERVICE);
}

// ─── Actions ─────────────────────────────────────────────────────────

export async function listWorkflows(
  workspaceSlug: string,
  worktreePath?: string,
): Promise<ListWorkflowsResult> {
  const ctx = await resolveWorkspaceContext(workspaceSlug, worktreePath);
  if (!ctx)
    return {
      workflows: [],
      errors: [{ code: 'E000', message: 'Workspace not found', action: '' }],
    };

  const service = resolveGraphService();
  const listResult = await service.list(ctx);
  if (listResult.errors.length > 0) {
    return { workflows: [], errors: listResult.errors };
  }

  const workflows: WorkflowSummary[] = [];
  for (const slug of listResult.slugs) {
    const status = await service.getStatus(ctx, slug);
    workflows.push({
      slug,
      description: status.description,
      lineCount: status.lines.length,
      nodeCount: status.totalNodes,
      status: status.status,
    });
  }

  return { workflows, errors: [] };
}

export async function loadWorkflow(
  workspaceSlug: string,
  graphSlug: string,
  worktreePath?: string,
): Promise<LoadWorkflowResult> {
  const ctx = await resolveWorkspaceContext(workspaceSlug, worktreePath);
  if (!ctx) return { errors: [{ code: 'E000', message: 'Workspace not found', action: '' }] };

  const service = resolveGraphService();

  const [loadResult, graphStatus] = await Promise.all([
    service.load(ctx, graphSlug),
    service.getStatus(ctx, graphSlug),
  ]);

  if (loadResult.errors.length > 0) {
    return { errors: loadResult.errors };
  }

  return {
    definition: loadResult.definition,
    graphStatus,
    errors: [],
  };
}

export async function createWorkflow(
  workspaceSlug: string,
  graphSlug: string,
  worktreePath?: string,
): Promise<CreateWorkflowResult> {
  const ctx = await resolveWorkspaceContext(workspaceSlug, worktreePath);
  if (!ctx) return { errors: [{ code: 'E000', message: 'Workspace not found', action: '' }] };

  const service = resolveGraphService();
  const result = await service.create(ctx, graphSlug);

  if (result.errors.length > 0) {
    return { errors: result.errors };
  }

  return { graphSlug: result.graphSlug, errors: [] };
}

export async function listWorkUnits(
  workspaceSlug: string,
  worktreePath?: string,
): Promise<ListWorkUnitsResult> {
  const ctx = await resolveWorkspaceContext(workspaceSlug, worktreePath);
  if (!ctx)
    return { units: [], errors: [{ code: 'E000', message: 'Workspace not found', action: '' }] };

  const service = resolveWorkUnitService();
  const result = await service.list(ctx);

  return { units: result.units, errors: result.errors };
}
