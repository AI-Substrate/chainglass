'use server';

/**
 * Workspace Server Actions - Mutations for workspace and sample operations.
 *
 * Part of Plan 014: Workspaces - Phase 6: Web UI
 *
 * Per DYK-P6-05: Server Actions for all mutations (simpler than API routes).
 * Uses revalidatePath for cache invalidation after successful operations.
 */

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
}

// ==================== Validation Schemas ====================

const AddWorkspaceSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name must be 100 characters or less'),
  path: z.string().min(1, 'Path is required').startsWith('/', 'Path must be absolute'),
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
  // Validate input
  const validatedFields = AddWorkspaceSchema.safeParse({
    name: formData.get('name'),
    path: formData.get('path'),
  });

  if (!validatedFields.success) {
    return {
      success: false,
      errors: validatedFields.error.flatten().fieldErrors,
    };
  }

  const { name, path } = validatedFields.data;

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
