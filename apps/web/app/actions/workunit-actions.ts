'use server';

/**
 * Work Unit Server Actions — CRUD operations for the workunit-editor feature.
 *
 * Unified save path: saveUnitContent routes internally based on unit type.
 * Agent → setPrompt(), Code → setScript(), User-input → update(type_config).
 *
 * Plan 058: Work Unit Creator & Editor — Phase 2
 */

import type {
  AgenticWorkUnitInstance,
  CodeUnitInstance,
  CreateUnitResult,
  CreateUnitSpec,
  DeleteUnitResult,
  IWorkUnitService,
  ListUnitsResult,
  LoadUnitResult,
  RenameUnitResult,
  UpdateUnitPatch,
  UpdateUnitResult,
  UserInputUnitInstance,
} from '@chainglass/positional-graph';
import {
  POSITIONAL_GRAPH_DI_TOKENS,
  type ResultError,
  WORKSPACE_DI_TOKENS,
} from '@chainglass/shared';
import type { IWorkspaceService, WorkspaceContext } from '@chainglass/workflow';

import { resolveWorktreeContext } from '../../src/features/058-workunit-editor/lib/resolve-worktree-context';
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

  return resolveWorktreeContext(info, worktreePath);
}

function resolveWorkUnitService(): IWorkUnitService {
  const container = getContainer();
  return container.resolve<IWorkUnitService>(POSITIONAL_GRAPH_DI_TOKENS.WORKUNIT_SERVICE);
}

const NOT_FOUND_ERROR: ResultError = { code: 'E000', message: 'Workspace not found', action: '' };

// ─── Read Actions ────────────────────────────────────────────────────

export async function listUnits(
  workspaceSlug: string,
  worktreePath?: string
): Promise<ListUnitsResult> {
  const ctx = await resolveWorkspaceContext(workspaceSlug, worktreePath);
  if (!ctx) return { units: [], errors: [NOT_FOUND_ERROR] };

  const service = resolveWorkUnitService();
  return service.list(ctx);
}

export async function loadUnit(
  workspaceSlug: string,
  unitSlug: string,
  worktreePath?: string
): Promise<LoadUnitResult> {
  const ctx = await resolveWorkspaceContext(workspaceSlug, worktreePath);
  if (!ctx) return { errors: [NOT_FOUND_ERROR] };

  const service = resolveWorkUnitService();
  return service.load(ctx, unitSlug);
}

/** Unified content loader — returns content string regardless of unit type. */
export async function loadUnitContent(
  workspaceSlug: string,
  unitSlug: string,
  worktreePath?: string
): Promise<{ content: string; errors: ResultError[] }> {
  const ctx = await resolveWorkspaceContext(workspaceSlug, worktreePath);
  if (!ctx) return { content: '', errors: [NOT_FOUND_ERROR] };

  const service = resolveWorkUnitService();
  const result = await service.load(ctx, unitSlug);
  if (result.errors.length > 0 || !result.unit) {
    return { content: '', errors: result.errors };
  }

  const unit = result.unit;
  try {
    if (unit.type === 'agent') {
      const content = await (unit as AgenticWorkUnitInstance).getPrompt(ctx);
      return { content, errors: [] };
    }
    if (unit.type === 'code') {
      const content = await (unit as CodeUnitInstance).getScript(ctx);
      return { content, errors: [] };
    }
    if (unit.type === 'user-input') {
      // User-input config is stored in unit.yaml, return as JSON
      const uiUnit = unit as UserInputUnitInstance;
      return { content: JSON.stringify(uiUnit.user_input, null, 2), errors: [] };
    }
    // Exhaustive check — all types handled above
    const _exhaustive: never = unit;
    return {
      content: '',
      errors: [
        {
          code: 'E999',
          message: `Unknown unit type: ${(_exhaustive as { type: string }).type}`,
          action: '',
        },
      ],
    };
  } catch (err) {
    return { content: '', errors: [{ code: 'E999', message: String(err), action: '' }] };
  }
}

// ─── Write Actions ───────────────────────────────────────────────────

export async function createUnit(
  workspaceSlug: string,
  spec: CreateUnitSpec,
  worktreePath?: string
): Promise<CreateUnitResult> {
  const ctx = await resolveWorkspaceContext(workspaceSlug, worktreePath);
  if (!ctx) return { slug: '', type: spec.type, errors: [NOT_FOUND_ERROR] };

  const service = resolveWorkUnitService();
  return service.create(ctx, spec);
}

export async function updateUnit(
  workspaceSlug: string,
  unitSlug: string,
  patch: UpdateUnitPatch,
  worktreePath?: string
): Promise<UpdateUnitResult> {
  const ctx = await resolveWorkspaceContext(workspaceSlug, worktreePath);
  if (!ctx) return { slug: unitSlug, errors: [NOT_FOUND_ERROR] };

  const service = resolveWorkUnitService();
  return service.update(ctx, unitSlug, patch);
}

export async function deleteUnit(
  workspaceSlug: string,
  unitSlug: string,
  worktreePath?: string
): Promise<DeleteUnitResult> {
  const ctx = await resolveWorkspaceContext(workspaceSlug, worktreePath);
  if (!ctx) return { deleted: false, errors: [NOT_FOUND_ERROR] };

  const service = resolveWorkUnitService();
  return service.delete(ctx, unitSlug);
}

export async function renameUnit(
  workspaceSlug: string,
  oldSlug: string,
  newSlug: string,
  worktreePath?: string
): Promise<RenameUnitResult> {
  const ctx = await resolveWorkspaceContext(workspaceSlug, worktreePath);
  if (!ctx) return { newSlug: '', updatedFiles: [], errors: [NOT_FOUND_ERROR] };

  const service = resolveWorkUnitService();
  return service.rename(ctx, oldSlug, newSlug);
}

/**
 * Unified content saver — routes to the correct write method based on unit type.
 * Agent → setPrompt, Code → setScript, User-input → update(type_config).
 */
export async function saveUnitContent(
  workspaceSlug: string,
  unitSlug: string,
  unitType: 'agent' | 'code' | 'user-input',
  content: string,
  worktreePath?: string
): Promise<{ errors: ResultError[] }> {
  const ctx = await resolveWorkspaceContext(workspaceSlug, worktreePath);
  if (!ctx) return { errors: [NOT_FOUND_ERROR] };

  const service = resolveWorkUnitService();

  try {
    if (unitType === 'agent') {
      const result = await service.load(ctx, unitSlug);
      if (result.errors.length > 0 || !result.unit) return { errors: result.errors };
      await (result.unit as AgenticWorkUnitInstance).setPrompt(ctx, content);
      return { errors: [] };
    }

    if (unitType === 'code') {
      const result = await service.load(ctx, unitSlug);
      if (result.errors.length > 0 || !result.unit) return { errors: result.errors };
      await (result.unit as CodeUnitInstance).setScript(ctx, content);
      return { errors: [] };
    }

    if (unitType === 'user-input') {
      // Parse the JSON content back to user_input config
      const config = JSON.parse(content);
      return service.update(ctx, unitSlug, { user_input: config });
    }

    const _exhaustive: never = unitType;
    return {
      errors: [
        { code: 'E999', message: `Unknown unit type: ${_exhaustive as string}`, action: '' },
      ],
    };
  } catch (err) {
    return { errors: [{ code: 'E999', message: String(err), action: '' }] };
  }
}
