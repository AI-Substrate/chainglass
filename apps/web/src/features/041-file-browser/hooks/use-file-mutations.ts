'use client';

/**
 * useFileMutations — CRUD operation handlers with toast feedback.
 *
 * Calls server actions for create/rename/delete, shows toast notifications,
 * and refreshes the tree directory after success. Returns results so
 * BrowserClient can handle edge cases (rename open file, delete selection, etc.).
 *
 * Plan 068 Phase 3
 */

import type {
  CreateResult,
  DeleteResult,
  RenameResult,
} from '@/features/041-file-browser/services/file-mutation-actions';
import { useCallback } from 'react';
import { toast } from 'sonner';

interface UseFileMutationsOptions {
  slug: string;
  worktreePath: string;
  /** Refresh a subdirectory's entries in the tree */
  refreshDir: (dirPath: string) => Promise<void>;
  /** Refresh root entries (DYK-P3-01: initialEntries is a server prop) */
  refreshRoot: () => Promise<void>;
  /** Server action dependencies — injected from BrowserClient */
  actions: {
    createFile: (
      slug: string,
      worktreePath: string,
      dirPath: string,
      fileName: string
    ) => Promise<CreateResult>;
    createFolder: (
      slug: string,
      worktreePath: string,
      dirPath: string,
      folderName: string
    ) => Promise<CreateResult>;
    deleteItem: (slug: string, worktreePath: string, itemPath: string) => Promise<DeleteResult>;
    renameItem: (
      slug: string,
      worktreePath: string,
      oldPath: string,
      newName: string
    ) => Promise<RenameResult>;
  };
}

/** Extract parent directory from a path (empty string for root-level items) */
function parentDir(path: string): string {
  const idx = path.lastIndexOf('/');
  return idx === -1 ? '' : path.substring(0, idx);
}

export function useFileMutations({
  slug,
  worktreePath,
  refreshDir,
  refreshRoot,
  actions,
}: UseFileMutationsOptions) {
  const refresh = useCallback(
    async (dirPath: string) => {
      if (dirPath === '') {
        await refreshRoot();
      } else {
        await refreshDir(dirPath);
      }
    },
    [refreshDir, refreshRoot]
  );

  const handleCreateFile = useCallback(
    async (dir: string, name: string) => {
      const toastId = toast.loading(`Creating ${name}...`);
      try {
        const result = await actions.createFile(slug, worktreePath, dir, name);
        if (result.ok) {
          toast.success(`Created ${name}`, { id: toastId });
          await refresh(dir);
          return result;
        }
        toast.error(`Failed to create ${name}`, { id: toastId, description: result.message });
        return result;
      } catch {
        toast.error(`Failed to create ${name}`, { id: toastId });
        return null;
      }
    },
    [slug, worktreePath, refresh, actions]
  );

  const handleCreateFolder = useCallback(
    async (dir: string, name: string) => {
      const toastId = toast.loading(`Creating ${name}/...`);
      try {
        const result = await actions.createFolder(slug, worktreePath, dir, name);
        if (result.ok) {
          toast.success(`Created ${name}/`, { id: toastId });
          await refresh(dir);
          return result;
        }
        toast.error(`Failed to create ${name}/`, { id: toastId, description: result.message });
        return result;
      } catch {
        toast.error(`Failed to create ${name}/`, { id: toastId });
        return null;
      }
    },
    [slug, worktreePath, refresh, actions]
  );

  const handleRename = useCallback(
    async (oldPath: string, newName: string) => {
      const oldName = oldPath.split('/').pop() ?? oldPath;
      const toastId = toast.loading(`Renaming ${oldName}...`);
      try {
        const result = await actions.renameItem(slug, worktreePath, oldPath, newName);
        if (result.ok) {
          toast.success(`Renamed to ${newName}`, { id: toastId });
          await refresh(parentDir(oldPath));
          return result;
        }
        toast.error(`Failed to rename ${oldName}`, { id: toastId, description: result.message });
        return result;
      } catch {
        toast.error(`Failed to rename ${oldName}`, { id: toastId });
        return null;
      }
    },
    [slug, worktreePath, refresh, actions]
  );

  const handleDelete = useCallback(
    async (path: string) => {
      const name = path.split('/').pop() ?? path;
      const toastId = toast.loading(`Deleting ${name}...`);
      try {
        const result = await actions.deleteItem(slug, worktreePath, path);
        if (result.ok) {
          toast.success(`Deleted ${name}`, { id: toastId });
          await refresh(parentDir(path));
          return result;
        }
        toast.error(`Failed to delete ${name}`, { id: toastId, description: result.message });
        return result;
      } catch {
        toast.error(`Failed to delete ${name}`, { id: toastId });
        return null;
      }
    },
    [slug, worktreePath, refresh, actions]
  );

  return {
    handleCreateFile,
    handleCreateFolder,
    handleRename,
    handleDelete,
  };
}
