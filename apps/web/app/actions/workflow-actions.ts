'use server';

/**
 * Workflow Server Actions — query + mutation actions for workflow-ui domain.
 *
 * Phase 2: load, list, create, listWorkUnits
 * Phase 3: addNode, removeNode, moveNode, addLine, removeLine,
 *          setLineLabel, setLineDescription, updateLineOrchestratorSettings,
 *          saveAsTemplate, instantiateTemplate, listTemplates
 * Phase 5: answerQuestion, restoreSnapshot, updateNodeConfig, setInput
 *
 * Plan 050
 */

import type { IPositionalGraphService } from '@chainglass/positional-graph';
import type { IWorkUnitService } from '@chainglass/positional-graph';
import { POSITIONAL_GRAPH_DI_TOKENS, WORKSPACE_DI_TOKENS } from '@chainglass/shared';
import type { ITemplateService, IWorkspaceService, WorkspaceContext } from '@chainglass/workflow';
import type {
  AddNodeMutationResult,
  CreateWorkflowResult,
  InstantiateTemplateResult,
  ListTemplatesResult,
  ListWorkUnitsResult,
  ListWorkflowsResult,
  LoadWorkflowResult,
  MutationResult,
  WorkflowSnapshot,
  WorkflowSummary,
} from '../../src/features/050-workflow-page/types';
import { getContainer } from '../../src/lib/bootstrap-singleton';

// ─── Helpers ─────────────────────────────────────────────────────────

async function resolveWorkspaceContext(
  slug: string,
  worktreePath?: string
): Promise<WorkspaceContext | null> {
  const container = getContainer();
  const workspaceService = container.resolve<IWorkspaceService>(
    WORKSPACE_DI_TOKENS.WORKSPACE_SERVICE
  );
  const info = await workspaceService.getInfo(slug);
  if (!info) return null;

  // Resolve worktree from known workspace worktrees only (trusted root)
  const resolvedWorktreePath = worktreePath
    ? (info.worktrees.find((w) => w.path === worktreePath)?.path ?? info.path)
    : info.path;
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

function resolveTemplateService(): ITemplateService {
  const container = getContainer();
  return container.resolve<ITemplateService>(POSITIONAL_GRAPH_DI_TOKENS.TEMPLATE_SERVICE);
}

const NOT_FOUND_ERROR = { code: 'E000', message: 'Workspace not found', action: '' } as const;

// ─── Actions ─────────────────────────────────────────────────────────

export async function listWorkflows(
  workspaceSlug: string,
  worktreePath?: string
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
    try {
      const status = await service.getStatus(ctx, slug);
      workflows.push({
        slug,
        description: status.description,
        lineCount: status.lines.length,
        nodeCount: status.totalNodes,
        status: status.status,
      });
    } catch {
      // Skip graphs that fail to load status (e.g., corrupt state)
      workflows.push({
        slug,
        lineCount: 0,
        nodeCount: 0,
        status: 'pending',
      });
    }
  }

  return { workflows, errors: [] };
}

export async function loadWorkflow(
  workspaceSlug: string,
  graphSlug: string,
  worktreePath?: string
): Promise<LoadWorkflowResult> {
  const ctx = await resolveWorkspaceContext(workspaceSlug, worktreePath);
  if (!ctx) return { errors: [{ code: 'E000', message: 'Workspace not found', action: '' }] };

  const service = resolveGraphService();

  const loadResult = await service.load(ctx, graphSlug);
  if (loadResult.errors.length > 0) {
    return { errors: loadResult.errors };
  }

  const graphStatus = await service.getStatus(ctx, graphSlug);

  return {
    definition: loadResult.definition,
    graphStatus,
    errors: [],
  };
}

export async function createWorkflow(
  workspaceSlug: string,
  graphSlug: string,
  worktreePath?: string
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
  worktreePath?: string
): Promise<ListWorkUnitsResult> {
  const ctx = await resolveWorkspaceContext(workspaceSlug, worktreePath);
  if (!ctx)
    return { units: [], errors: [{ code: 'E000', message: 'Workspace not found', action: '' }] };

  const service = resolveWorkUnitService();
  const result = await service.list(ctx);

  return { units: result.units, errors: result.errors };
}

// ─── Phase 3: Mutation Actions ───────────────────────────────────────

async function reloadStatus(ctx: WorkspaceContext, graphSlug: string): Promise<MutationResult> {
  try {
    const graphStatus = await resolveGraphService().getStatus(ctx, graphSlug);
    return { graphStatus, errors: [] };
  } catch {
    return { errors: [{ code: 'E001', message: 'Failed to reload graph status', action: '' }] };
  }
}

export async function addNode(
  workspaceSlug: string,
  graphSlug: string,
  lineId: string,
  unitSlug: string,
  atPosition?: number,
  worktreePath?: string
): Promise<AddNodeMutationResult> {
  const ctx = await resolveWorkspaceContext(workspaceSlug, worktreePath);
  if (!ctx) return { errors: [NOT_FOUND_ERROR] };

  const result = await resolveGraphService().addNode(ctx, graphSlug, lineId, unitSlug, {
    atPosition,
  });
  if (result.errors.length > 0) return { errors: result.errors };

  const status = await reloadStatus(ctx, graphSlug);
  return { nodeId: result.nodeId, ...status };
}

export async function removeNode(
  workspaceSlug: string,
  graphSlug: string,
  nodeId: string,
  worktreePath?: string
): Promise<MutationResult> {
  const ctx = await resolveWorkspaceContext(workspaceSlug, worktreePath);
  if (!ctx) return { errors: [NOT_FOUND_ERROR] };

  const result = await resolveGraphService().removeNode(ctx, graphSlug, nodeId);
  if (result.errors.length > 0) return { errors: result.errors };

  return reloadStatus(ctx, graphSlug);
}

export async function moveNode(
  workspaceSlug: string,
  graphSlug: string,
  nodeId: string,
  toPosition?: number,
  toLineId?: string,
  worktreePath?: string
): Promise<MutationResult> {
  const ctx = await resolveWorkspaceContext(workspaceSlug, worktreePath);
  if (!ctx) return { errors: [NOT_FOUND_ERROR] };

  const result = await resolveGraphService().moveNode(ctx, graphSlug, nodeId, {
    toPosition,
    toLineId,
  });
  if (result.errors.length > 0) return { errors: result.errors };

  return reloadStatus(ctx, graphSlug);
}

export async function addLine(
  workspaceSlug: string,
  graphSlug: string,
  label?: string,
  worktreePath?: string
): Promise<MutationResult> {
  const ctx = await resolveWorkspaceContext(workspaceSlug, worktreePath);
  if (!ctx) return { errors: [NOT_FOUND_ERROR] };

  const result = await resolveGraphService().addLine(ctx, graphSlug, { label });
  if (result.errors.length > 0) return { errors: result.errors };

  return reloadStatus(ctx, graphSlug);
}

export async function removeLine(
  workspaceSlug: string,
  graphSlug: string,
  lineId: string,
  worktreePath?: string
): Promise<MutationResult> {
  const ctx = await resolveWorkspaceContext(workspaceSlug, worktreePath);
  if (!ctx) return { errors: [NOT_FOUND_ERROR] };

  const result = await resolveGraphService().removeLine(ctx, graphSlug, lineId);
  if (result.errors.length > 0) return { errors: result.errors };

  return reloadStatus(ctx, graphSlug);
}

export async function setLineLabel(
  workspaceSlug: string,
  graphSlug: string,
  lineId: string,
  label: string,
  worktreePath?: string
): Promise<MutationResult> {
  const ctx = await resolveWorkspaceContext(workspaceSlug, worktreePath);
  if (!ctx) return { errors: [NOT_FOUND_ERROR] };

  const result = await resolveGraphService().setLineLabel(ctx, graphSlug, lineId, label);
  if (result.errors.length > 0) return { errors: result.errors };

  return reloadStatus(ctx, graphSlug);
}

export async function setLineDescription(
  workspaceSlug: string,
  graphSlug: string,
  lineId: string,
  description: string,
  worktreePath?: string
): Promise<MutationResult> {
  const ctx = await resolveWorkspaceContext(workspaceSlug, worktreePath);
  if (!ctx) return { errors: [NOT_FOUND_ERROR] };

  const result = await resolveGraphService().setLineDescription(
    ctx,
    graphSlug,
    lineId,
    description
  );
  if (result.errors.length > 0) return { errors: result.errors };

  return reloadStatus(ctx, graphSlug);
}

export async function updateLineSettings(
  workspaceSlug: string,
  graphSlug: string,
  lineId: string,
  settings: { transition?: 'auto' | 'manual'; autoStartLine?: boolean },
  worktreePath?: string
): Promise<MutationResult> {
  const ctx = await resolveWorkspaceContext(workspaceSlug, worktreePath);
  if (!ctx) return { errors: [NOT_FOUND_ERROR] };

  const result = await resolveGraphService().updateLineOrchestratorSettings(
    ctx,
    graphSlug,
    lineId,
    settings
  );
  if (result.errors.length > 0) return { errors: result.errors };

  return reloadStatus(ctx, graphSlug);
}

export async function saveAsTemplate(
  workspaceSlug: string,
  graphSlug: string,
  templateSlug: string,
  worktreePath?: string
): Promise<MutationResult> {
  const ctx = await resolveWorkspaceContext(workspaceSlug, worktreePath);
  if (!ctx) return { errors: [NOT_FOUND_ERROR] };

  const result = await resolveTemplateService().saveFrom(ctx, graphSlug, templateSlug);
  if (result.errors.length > 0) return { errors: result.errors };

  return { errors: [] };
}

export async function instantiateTemplate(
  workspaceSlug: string,
  templateSlug: string,
  instanceId: string,
  worktreePath?: string
): Promise<InstantiateTemplateResult> {
  const ctx = await resolveWorkspaceContext(workspaceSlug, worktreePath);
  if (!ctx) return { errors: [NOT_FOUND_ERROR] };

  const result = await resolveTemplateService().instantiate(ctx, templateSlug, instanceId);
  if (result.errors.length > 0) return { errors: result.errors };

  return {
    instanceId: result.data?.slug,
    graphSlug: result.data?.slug,
    errors: [],
  };
}

export async function listTemplates(
  workspaceSlug: string,
  worktreePath?: string
): Promise<ListTemplatesResult> {
  const ctx = await resolveWorkspaceContext(workspaceSlug, worktreePath);
  if (!ctx) return { templates: [], errors: [NOT_FOUND_ERROR] };

  const result = await resolveTemplateService().listWorkflows(ctx);
  if (result.errors.length > 0) return { templates: [], errors: result.errors };

  return {
    templates: result.data.map((t) => ({ slug: t.slug, description: t.description })),
    errors: [],
  };
}

// ─── Phase 5: Q&A + Node Properties + Undo/Redo ─────────────────────

export async function loadSnapshotData(
  workspaceSlug: string,
  graphSlug: string,
  worktreePath?: string
): Promise<{ snapshot?: WorkflowSnapshot; errors: import('@chainglass/shared').ResultError[] }> {
  const ctx = await resolveWorkspaceContext(workspaceSlug, worktreePath);
  if (!ctx) return { errors: [NOT_FOUND_ERROR] };

  const svc = resolveGraphService();
  const loadResult = await svc.load(ctx, graphSlug);
  if (loadResult.errors.length > 0 || !loadResult.definition) {
    return { errors: loadResult.errors };
  }

  const configsResult = await svc.loadAllNodeConfigs(ctx, graphSlug);
  if (configsResult.errors.length > 0) {
    return { errors: configsResult.errors };
  }

  return {
    snapshot: {
      definition: loadResult.definition,
      nodeConfigs: configsResult.nodeConfigs,
    },
    errors: [],
  };
}

export async function answerQuestion(
  workspaceSlug: string,
  graphSlug: string,
  nodeId: string,
  questionId: string,
  answer: unknown,
  worktreePath?: string
): Promise<MutationResult> {
  const ctx = await resolveWorkspaceContext(workspaceSlug, worktreePath);
  if (!ctx) return { errors: [NOT_FOUND_ERROR] };

  const svc = resolveGraphService();

  // Step 1: Record the answer (node stays waiting-question)
  const answerResult = await svc.answerQuestion(ctx, graphSlug, nodeId, questionId, answer);
  if (answerResult.errors.length > 0) return { errors: answerResult.errors };

  // Step 2: Raise node:restart to resume execution
  const restartResult = await svc.raiseNodeEvent(
    ctx,
    graphSlug,
    nodeId,
    'node:restart',
    { reason: 'question-answered' },
    'human'
  );
  if (restartResult.errors.length > 0) return { errors: restartResult.errors };

  return reloadStatus(ctx, graphSlug);
}

export async function restoreSnapshot(
  workspaceSlug: string,
  graphSlug: string,
  definition: import('@chainglass/positional-graph').PositionalGraphDefinition,
  nodeConfigs: Record<string, import('@chainglass/positional-graph').NodeConfig>,
  worktreePath?: string
): Promise<MutationResult> {
  const ctx = await resolveWorkspaceContext(workspaceSlug, worktreePath);
  if (!ctx) return { errors: [NOT_FOUND_ERROR] };

  const svc = resolveGraphService();

  // Guard: block undo while any line is running/active
  const currentStatus = await svc.getStatus(ctx, graphSlug);
  const hasRunningLines = currentStatus.lines.some((line) =>
    line.nodes.some((n) => ['starting', 'agent-accepted', 'waiting-question'].includes(n.status))
  );
  if (hasRunningLines) {
    return {
      errors: [
        {
          code: 'E998',
          message: 'Cannot undo while workflow is running',
          action: 'Wait for all nodes to finish or stop them first',
        },
      ],
    };
  }

  const result = await svc.restoreSnapshot(ctx, graphSlug, definition, nodeConfigs);
  if (result.errors.length > 0) return { errors: result.errors };

  return reloadStatus(ctx, graphSlug);
}

export async function updateNodeConfig(
  workspaceSlug: string,
  graphSlug: string,
  nodeId: string,
  updates: {
    description?: string;
    orchestratorSettings?: Partial<{
      execution: 'serial' | 'parallel';
      waitForPrevious: boolean;
      noContext: boolean;
      contextFrom: string | undefined;
    }>;
  },
  worktreePath?: string
): Promise<MutationResult> {
  const ctx = await resolveWorkspaceContext(workspaceSlug, worktreePath);
  if (!ctx) return { errors: [NOT_FOUND_ERROR] };

  const svc = resolveGraphService();

  if (updates.description !== undefined) {
    const descResult = await svc.setNodeDescription(ctx, graphSlug, nodeId, updates.description);
    if (descResult.errors.length > 0) return { errors: descResult.errors };
  }

  if (updates.orchestratorSettings) {
    const settingsResult = await svc.updateNodeOrchestratorSettings(
      ctx,
      graphSlug,
      nodeId,
      updates.orchestratorSettings
    );
    if (settingsResult.errors.length > 0) return { errors: settingsResult.errors };
  }

  return reloadStatus(ctx, graphSlug);
}

export async function setNodeInput(
  workspaceSlug: string,
  graphSlug: string,
  nodeId: string,
  inputName: string,
  source: import('@chainglass/positional-graph').InputResolution,
  worktreePath?: string
): Promise<MutationResult> {
  const ctx = await resolveWorkspaceContext(workspaceSlug, worktreePath);
  if (!ctx) return { errors: [NOT_FOUND_ERROR] };

  const result = await resolveGraphService().setInput(ctx, graphSlug, nodeId, inputName, source);
  if (result.errors.length > 0) return { errors: result.errors };

  return reloadStatus(ctx, graphSlug);
}

// ─── Plan 054: Human Input Actions ───────────────────────────────────

export async function submitUserInput(
  workspaceSlug: string,
  graphSlug: string,
  nodeId: string,
  outputName: string,
  value: unknown,
  freeformNotes?: string,
  worktreePath?: string
): Promise<MutationResult> {
  const ctx = await resolveWorkspaceContext(workspaceSlug, worktreePath);
  if (!ctx) return { errors: [NOT_FOUND_ERROR] };

  const svc = resolveGraphService();

  // Step 1: Start the node (pending → starting)
  const startResult = await svc.startNode(ctx, graphSlug, nodeId);
  if (startResult.errors.length > 0) return { errors: startResult.errors };

  // Step 2: Accept (starting → agent-accepted, so saveOutputData guard passes)
  const acceptResult = await svc.raiseNodeEvent(
    ctx,
    graphSlug,
    nodeId,
    'node:accepted',
    {},
    'executor'
  );
  if (acceptResult.errors.length > 0) return { errors: acceptResult.errors };

  // Step 3: Save the output data (Format A: { outputs: { name: value } })
  const outputValue = freeformNotes ? { value, freeform_notes: freeformNotes } : value;
  const saveResult = await svc.saveOutputData(ctx, graphSlug, nodeId, outputName, outputValue);
  if (saveResult.errors.length > 0) return { errors: saveResult.errors };

  // Step 4: Complete the node (agent-accepted → complete, canEnd validates output)
  const endResult = await svc.endNode(ctx, graphSlug, nodeId);
  if (endResult.errors.length > 0) return { errors: endResult.errors };

  return reloadStatus(ctx, graphSlug);
}
