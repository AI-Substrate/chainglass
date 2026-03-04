'use server';

/**
 * Workspace Server Actions - Mutations for workspace and sample operations.
 *
 * Part of Plan 014: Workspaces - Phase 6: Web UI
 *
 * Per DYK-P6-05: Server Actions for all mutations (simpler than API routes).
 * Uses revalidatePath for cache invalidation after successful operations.
 */

import { existsSync, statSync } from 'node:fs';
import { requireAuth } from '@/features/063-login/lib/require-auth';
import { WORKSPACE_DI_TOKENS } from '@chainglass/shared';
import type { ISampleService, IWorkspaceService } from '@chainglass/workflow';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getContainer } from '../../src/lib/bootstrap-singleton';

// ==================== Action State Types ====================

/**
 * Standard action state for form handling with useActionState.
 */
export interface ActionState {
  success: boolean;
  message?: string;
  errors?: {
    name?: string[];
    path?: string[];
    description?: string[];
    _form?: string[];
  };
  /** Preserve submitted field values so form inputs aren't cleared on error */
  fields?: {
    name?: string;
    path?: string;
  };
}

// ==================== Validation Schemas ====================

const AddWorkspaceSchema = z.object({
  name: z
    .string()
    .transform((s) => s.trim())
    .pipe(z.string().min(1, 'Name is required').max(100, 'Name must be 100 characters or less')),
  path: z
    .string()
    .transform((s) => s.trim())
    .pipe(z.string().min(1, 'Path is required').startsWith('/', 'Path must be absolute')),
});

const AddSampleSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name must be 100 characters or less'),
  description: z.string().max(500, 'Description must be 500 characters or less').default(''),
  workspaceSlug: z.string().min(1, 'Workspace slug is required'),
  worktreePath: z.string().optional(),
});

// ==================== Server Actions ====================

/**
 * Add a new workspace.
 *
 * @param _prevState - Previous action state (for useActionState)
 * @param formData - Form data with name and path
 * @returns ActionState with success/error info
 */
export async function addWorkspace(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  await requireAuth();
  const rawName = (formData.get('name') as string) ?? '';
  const rawPath = (formData.get('path') as string) ?? '';

  // Validate input (schema trims whitespace before validation)
  const validatedFields = AddWorkspaceSchema.safeParse({
    name: rawName,
    path: rawPath,
  });

  if (!validatedFields.success) {
    return {
      success: false,
      errors: validatedFields.error.flatten().fieldErrors,
      fields: { name: rawName, path: rawPath },
    };
  }

  const { name, path } = validatedFields.data;

  // Validate path exists and is a directory
  if (!existsSync(path)) {
    return {
      success: false,
      errors: { path: ['Path does not exist'] },
      fields: { name, path },
    };
  }
  try {
    const stats = statSync(path);
    if (!stats.isDirectory()) {
      return {
        success: false,
        errors: { path: ['Path must be a directory'] },
        fields: { name, path },
      };
    }
  } catch {
    return {
      success: false,
      errors: { path: ['Unable to access path'] },
      fields: { name, path },
    };
  }

  try {
    const container = getContainer();
    const workspaceService = container.resolve<IWorkspaceService>(
      WORKSPACE_DI_TOKENS.WORKSPACE_SERVICE
    );

    const result = await workspaceService.add(name, path);

    if (!result.success) {
      return {
        success: false,
        errors: {
          _form: result.errors.map((e) => e.message),
        },
        fields: { name, path },
      };
    }

    // Revalidate workspace pages
    revalidatePath('/workspaces');

    return {
      success: true,
      message: `Workspace "${result.workspace?.name}" added successfully`,
    };
  } catch (error) {
    console.error('[addWorkspace] Error:', error);
    return {
      success: false,
      errors: {
        _form: ['Failed to add workspace. Please try again.'],
      },
    };
  }
}

/**
 * Remove a workspace.
 *
 * @param _prevState - Previous action state (for useActionState)
 * @param formData - Form data with slug
 * @returns ActionState with success/error info
 */
export async function removeWorkspace(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  await requireAuth();
  const slug = formData.get('slug');

  if (!slug || typeof slug !== 'string') {
    return {
      success: false,
      errors: {
        _form: ['Workspace slug is required'],
      },
    };
  }

  try {
    const container = getContainer();
    const workspaceService = container.resolve<IWorkspaceService>(
      WORKSPACE_DI_TOKENS.WORKSPACE_SERVICE
    );

    const result = await workspaceService.remove(slug);

    if (!result.success) {
      return {
        success: false,
        errors: {
          _form: result.errors.map((e) => e.message),
        },
      };
    }

    // Revalidate workspace pages
    revalidatePath('/workspaces');

    return {
      success: true,
      message: 'Workspace removed successfully',
    };
  } catch (error) {
    console.error('[removeWorkspace] Error:', error);
    return {
      success: false,
      errors: {
        _form: ['Failed to remove workspace. Please try again.'],
      },
    };
  }
}

/**
 * Add a new sample to a workspace.
 *
 * @param _prevState - Previous action state (for useActionState)
 * @param formData - Form data with name, description, workspaceSlug, worktreePath
 * @returns ActionState with success/error info
 */
export async function addSample(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  await requireAuth();
  // Validate input
  const validatedFields = AddSampleSchema.safeParse({
    name: formData.get('name'),
    description: formData.get('description') ?? '',
    workspaceSlug: formData.get('workspaceSlug'),
    worktreePath: formData.get('worktreePath') || undefined,
  });

  if (!validatedFields.success) {
    return {
      success: false,
      errors: validatedFields.error.flatten().fieldErrors as ActionState['errors'],
    };
  }

  const { name, description, workspaceSlug, worktreePath } = validatedFields.data;

  try {
    const container = getContainer();
    const workspaceService = container.resolve<IWorkspaceService>(
      WORKSPACE_DI_TOKENS.WORKSPACE_SERVICE
    );
    const sampleService = container.resolve<ISampleService>(WORKSPACE_DI_TOKENS.SAMPLE_SERVICE);

    // Resolve context from params
    const context = await workspaceService.resolveContextFromParams(workspaceSlug, worktreePath);

    if (!context) {
      return {
        success: false,
        errors: {
          _form: ['Workspace not found'],
        },
      };
    }

    const result = await sampleService.add(context, name, description);

    if (!result.success) {
      return {
        success: false,
        errors: {
          _form: result.errors.map((e) => e.message),
        },
      };
    }

    // Revalidate samples page
    revalidatePath(`/workspaces/${workspaceSlug}/samples`);

    return {
      success: true,
      message: `Sample "${result.sample?.name}" added successfully`,
    };
  } catch (error) {
    console.error('[addSample] Error:', error);
    return {
      success: false,
      errors: {
        _form: ['Failed to add sample. Please try again.'],
      },
    };
  }
}

/**
 * Delete a sample from a workspace.
 *
 * @param _prevState - Previous action state (for useActionState)
 * @param formData - Form data with sampleSlug, workspaceSlug, worktreePath
 * @returns ActionState with success/error info
 */
export async function deleteSample(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  await requireAuth();
  const sampleSlug = formData.get('sampleSlug');
  const workspaceSlug = formData.get('workspaceSlug');
  const worktreePath = formData.get('worktreePath') || undefined;

  if (!sampleSlug || typeof sampleSlug !== 'string') {
    return {
      success: false,
      errors: {
        _form: ['Sample slug is required'],
      },
    };
  }

  if (!workspaceSlug || typeof workspaceSlug !== 'string') {
    return {
      success: false,
      errors: {
        _form: ['Workspace slug is required'],
      },
    };
  }

  try {
    const container = getContainer();
    const workspaceService = container.resolve<IWorkspaceService>(
      WORKSPACE_DI_TOKENS.WORKSPACE_SERVICE
    );
    const sampleService = container.resolve<ISampleService>(WORKSPACE_DI_TOKENS.SAMPLE_SERVICE);

    // Resolve context from params
    const context = await workspaceService.resolveContextFromParams(
      workspaceSlug,
      typeof worktreePath === 'string' ? worktreePath : undefined
    );

    if (!context) {
      return {
        success: false,
        errors: {
          _form: ['Workspace not found'],
        },
      };
    }

    const result = await sampleService.delete(context, sampleSlug);

    if (!result.success) {
      return {
        success: false,
        errors: {
          _form: result.errors.map((e) => e.message),
        },
      };
    }

    // Revalidate samples page
    revalidatePath(`/workspaces/${workspaceSlug}/samples`);

    return {
      success: true,
      message: 'Sample deleted successfully',
    };
  } catch (error) {
    console.error('[deleteSample] Error:', error);
    return {
      success: false,
      errors: {
        _form: ['Failed to delete sample. Please try again.'],
      },
    };
  }
}

// ==================== Update Workspace Preferences ====================

const updatePreferencesSchema = z.object({
  slug: z.string().min(1, 'Workspace slug is required'),
  emoji: z.string().optional(),
  color: z.string().optional(),
  starred: z.enum(['true', 'false']).optional(),
  sortOrder: z
    .string()
    .optional()
    .refine((val) => val === undefined || (!Number.isNaN(Number(val)) && Number(val) >= 0), {
      message: 'sortOrder must be a non-negative number',
    }),
});

/**
 * Update workspace preferences (emoji, color, starred, sortOrder).
 *
 * Per Plan 041: File Browser & Workspace-Centric UI — Phase 1.
 */
export async function updateWorkspacePreferences(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  await requireAuth();
  // 1. Validate form data
  const parsed = updatePreferencesSchema.safeParse({
    slug: formData.get('slug'),
    emoji: formData.get('emoji') ?? undefined,
    color: formData.get('color') ?? undefined,
    starred: formData.get('starred') ?? undefined,
    sortOrder: formData.get('sortOrder') ?? undefined,
  });

  if (!parsed.success) {
    const fieldErrors = parsed.error.flatten().fieldErrors;
    return {
      success: false,
      errors: {
        _form: fieldErrors.slug ?? ['Invalid input'],
      },
    };
  }

  // 2. Build preferences object (only include provided fields)
  const prefs: Record<string, string | boolean | number> = {};
  if (parsed.data.emoji !== undefined) prefs.emoji = parsed.data.emoji;
  if (parsed.data.color !== undefined) prefs.color = parsed.data.color;
  if (parsed.data.starred !== undefined) prefs.starred = parsed.data.starred === 'true';
  if (parsed.data.sortOrder !== undefined)
    prefs.sortOrder = Number.parseInt(parsed.data.sortOrder, 10);

  // 3. Call service
  try {
    const container = getContainer();
    const workspaceService = container.resolve<IWorkspaceService>(
      WORKSPACE_DI_TOKENS.WORKSPACE_SERVICE
    );
    const result = await workspaceService.updatePreferences(parsed.data.slug, prefs);

    if (!result.success) {
      return {
        success: false,
        errors: {
          _form: result.errors.map((e) => e.message),
        },
      };
    }

    // 4. Invalidate cache (scoped to affected workspace)
    revalidatePath(`/workspaces/${parsed.data.slug}`);

    return { success: true, message: 'Preferences updated' };
  } catch (error) {
    console.error('[updateWorkspacePreferences] Error:', error);
    return {
      success: false,
      errors: {
        _form: ['Failed to update preferences. Please try again.'],
      },
    };
  }
}

// ==================== Toggle Star (form action compatible) ====================

/**
 * Toggle workspace starred status. Single-arg form action for <form action>.
 *
 * Per Plan 041 Phase 3: WorkspaceCard uses <form action> (not useActionState).
 */
export async function toggleWorkspaceStar(formData: FormData): Promise<void> {
  await requireAuth();
  const slug = formData.get('slug');
  const starred = formData.get('starred');

  if (!slug || typeof slug !== 'string') return;

  try {
    const container = getContainer();
    const workspaceService = container.resolve<IWorkspaceService>(
      WORKSPACE_DI_TOKENS.WORKSPACE_SERVICE
    );
    await workspaceService.updatePreferences(slug, {
      starred: starred === 'true',
    });
    revalidatePath('/');
  } catch (error) {
    console.error('[toggleWorkspaceStar] Error:', error);
  }
}

// ==================== Toggle Worktree Star (form action compatible) ====================

/**
 * Toggle a worktree's starred status within a workspace.
 * Adds or removes the worktree path from workspace preferences.starredWorktrees.
 */
export async function toggleWorktreeStar(formData: FormData): Promise<void> {
  await requireAuth();
  const slug = formData.get('slug');
  const worktreePath = formData.get('worktreePath');
  const action = formData.get('action'); // 'star' or 'unstar'

  if (!slug || typeof slug !== 'string') return;
  if (!worktreePath || typeof worktreePath !== 'string') return;

  try {
    const container = getContainer();
    const workspaceService = container.resolve<IWorkspaceService>(
      WORKSPACE_DI_TOKENS.WORKSPACE_SERVICE
    );

    const workspaces = await workspaceService.list();
    const ws = workspaces.find((w) => w.slug === slug);
    if (!ws) return;

    const current = ws.toJSON().preferences.starredWorktrees ?? [];
    const updated =
      action === 'unstar'
        ? current.filter((p: string) => p !== worktreePath)
        : current.includes(worktreePath)
          ? current
          : [...current, worktreePath];

    await workspaceService.updatePreferences(slug, { starredWorktrees: updated });
    revalidatePath(`/workspaces/${slug}`);
  } catch (error) {
    console.error('[toggleWorktreeStar] Error:', error);
  }
}

// ==================== Update Worktree Visual Preferences ====================

/**
 * Update emoji + color for a specific worktree within a workspace.
 *
 * Read-modify-write: loads existing worktreePreferences map, merges the
 * single entry, writes the complete map back (DYK-ST-01).
 */
export async function updateWorktreePreferences(
  slug: string,
  worktreePath: string,
  prefs: { emoji?: string; color?: string }
): Promise<ActionState> {
  await requireAuth();
  if (!slug || !worktreePath) {
    return { success: false, errors: { _form: ['Workspace slug and worktree path are required'] } };
  }

  try {
    const container = getContainer();
    const workspaceService = container.resolve<IWorkspaceService>(
      WORKSPACE_DI_TOKENS.WORKSPACE_SERVICE
    );

    const workspaces = await workspaceService.list();
    const ws = workspaces.find((w) => w.slug === slug);
    if (!ws) {
      return { success: false, errors: { _form: ['Workspace not found'] } };
    }

    const current = ws.toJSON().preferences.worktreePreferences ?? {};
    const existing = current[worktreePath] ?? { emoji: '', color: '' };
    const merged = {
      ...existing,
      ...(prefs.emoji !== undefined ? { emoji: prefs.emoji } : {}),
      ...(prefs.color !== undefined ? { color: prefs.color } : {}),
    };

    const result = await workspaceService.updatePreferences(slug, {
      worktreePreferences: { ...current, [worktreePath]: merged },
    });

    if (!result.success) {
      return { success: false, errors: { _form: result.errors.map((e) => e.message) } };
    }

    revalidatePath(`/workspaces/${slug}`);
    return { success: true, message: 'Worktree preferences updated' };
  } catch (error) {
    console.error('[updateWorktreePreferences] Error:', error);
    return { success: false, errors: { _form: ['Failed to update worktree preferences'] } };
  }
}
