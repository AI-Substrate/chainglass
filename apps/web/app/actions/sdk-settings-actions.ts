'use server';

/**
 * SDK Settings Server Actions.
 *
 * Persists SDK settings to the workspace's sdkSettings field in workspaces.json.
 * Uses IWorkspaceService.updatePreferences() directly — separate from the
 * existing updateWorkspacePreferences action which only handles emoji/color/star.
 *
 * DYK-P2-04: Theoretical race with concurrent preference writes. Both this action
 * and updateWorkspacePreferences call updatePreferences() with read-modify-write.
 * They write disjoint fields (sdkSettings vs emoji/color) so practical impact is
 * near-zero. If needed, add file-level locking in IWorkspaceRegistryAdapter.
 *
 * Per Plan 047 Phase 2, Task T007. Per Workshop 003 §5.3.
 */

import { revalidatePath } from 'next/cache';

import { WORKSPACE_DI_TOKENS } from '@chainglass/shared';
import type { IWorkspaceService } from '@chainglass/workflow';

import { getContainer } from '../../src/lib/bootstrap-singleton';

export async function updateSDKSettings(
  slug: string,
  sdkSettings: Record<string, unknown>
): Promise<{ success: boolean; error?: string }> {
  try {
    const container = getContainer();
    const workspaceService = container.resolve<IWorkspaceService>(
      WORKSPACE_DI_TOKENS.WORKSPACE_SERVICE
    );

    const result = await workspaceService.updatePreferences(slug, { sdkSettings });

    if (!result.success) {
      return { success: false, error: result.errors[0]?.message ?? 'Unknown error' };
    }

    revalidatePath(`/workspaces/${slug}`);
    return { success: true };
  } catch (error) {
    console.error('[updateSDKSettings] Error:', error);
    return { success: false, error: 'Failed to save settings' };
  }
}

export async function updateSDKMru(
  slug: string,
  sdkMru: string[]
): Promise<{ success: boolean; error?: string }> {
  try {
    const container = getContainer();
    const workspaceService = container.resolve<IWorkspaceService>(
      WORKSPACE_DI_TOKENS.WORKSPACE_SERVICE
    );

    const result = await workspaceService.updatePreferences(slug, { sdkMru });

    if (!result.success) {
      return { success: false, error: result.errors[0]?.message ?? 'Unknown error' };
    }

    return { success: true };
  } catch (error) {
    console.error('[updateSDKMru] Error:', error);
    return { success: false, error: 'Failed to save MRU' };
  }
}
