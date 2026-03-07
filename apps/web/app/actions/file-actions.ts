'use server';

/**
 * File Browser Server Actions — readFile + saveFile
 *
 * Server actions callable from client components.
 * Delegate to service layer for actual file operations.
 * Returns highlighted HTML + markdown preview alongside content (D1, D2, D4).
 *
 * Phase 4: File Browser — Plan 041
 */

import { requireAuth } from '@/features/063-login/lib/require-auth';
import { SHARED_DI_TOKENS, WORKSPACE_DI_TOKENS } from '@chainglass/shared';
import type { IFileSystem, IPathResolver } from '@chainglass/shared';
import type { IWorkspaceService } from '@chainglass/workflow';
import {
  type ReadFileResult,
  type SaveFileResult,
  readFileAction as readFileService,
  saveFileAction as saveFileService,
} from '../../src/features/041-file-browser/services/file-actions';
import { getContainer } from '../../src/lib/bootstrap-singleton';
import { renderMarkdownToHtml } from '../../src/lib/server/markdown-renderer';
import { highlightCode } from '../../src/lib/server/shiki-processor';

export async function readFile(
  slug: string,
  worktreePath: string,
  filePath: string
): Promise<ReadFileResult> {
  await requireAuth();
  const container = getContainer();
  const fileSystem = container.resolve<IFileSystem>(SHARED_DI_TOKENS.FILESYSTEM);
  const pathResolver = container.resolve<IPathResolver>(SHARED_DI_TOKENS.PATH_RESOLVER);

  return readFileService({
    worktreePath,
    filePath,
    fileSystem,
    pathResolver,
    highlightFn: highlightCode,
    renderMarkdownFn: renderMarkdownToHtml,
  });
}

export async function saveFile(
  slug: string,
  worktreePath: string,
  filePath: string,
  content: string,
  expectedMtime?: string,
  force?: boolean
): Promise<SaveFileResult> {
  await requireAuth();
  const container = getContainer();
  const fileSystem = container.resolve<IFileSystem>(SHARED_DI_TOKENS.FILESYSTEM);
  const pathResolver = container.resolve<IPathResolver>(SHARED_DI_TOKENS.PATH_RESOLVER);

  return saveFileService({
    worktreePath,
    filePath,
    content,
    expectedMtime,
    force,
    fileSystem,
    pathResolver,
  });
}

// Wrapper for lazy diff loading (D3) — 'use server' requires async fn exports
export async function fetchGitDiff(filePath: string, cwd?: string) {
  await requireAuth();
  const { getGitDiff } = await import('../../src/lib/server/git-diff-action');
  return getGitDiff(filePath, cwd);
}

// Wrapper for changed-files filter
export async function fetchChangedFiles(worktreePath: string) {
  await requireAuth();
  const { getChangedFiles } = await import(
    '../../src/features/041-file-browser/services/changed-files'
  );
  return getChangedFiles(worktreePath);
}

// Upload file to scratch/paste/ — Plan 044
export type { UploadFileResult } from '../../src/features/041-file-browser/services/upload-file';

export async function uploadFile(formData: FormData) {
  await requireAuth();
  const { uploadFileService } = await import(
    '../../src/features/041-file-browser/services/upload-file'
  );

  const file = formData.get('file') as File | null;
  const worktreePath = formData.get('worktreePath') as string;

  if (!file || file.size === 0) {
    return { ok: false as const, error: 'no-file' as const };
  }

  const container = getContainer();
  const fileSystem = container.resolve<IFileSystem>(SHARED_DI_TOKENS.FILESYSTEM);
  const pathResolver = container.resolve<IPathResolver>(SHARED_DI_TOKENS.PATH_RESOLVER);

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  return uploadFileService({
    worktreePath,
    fileName: file.name,
    mimeType: file.type,
    content: buffer,
    fileSystem,
    pathResolver,
  });
}

// Working changes — git status --porcelain parser (Plan 043 Phase 2)
export async function fetchWorkingChanges(worktreePath: string) {
  await requireAuth();
  const { getWorkingChanges } = await import(
    '../../src/features/041-file-browser/services/working-changes'
  );
  return getWorkingChanges(worktreePath);
}

// Recent files — git log --name-only parser (Plan 043 Phase 2)
export async function fetchRecentFiles(worktreePath: string, limit = 20) {
  await requireAuth();
  const { getRecentFiles } = await import(
    '../../src/features/041-file-browser/services/recent-files'
  );
  return getRecentFiles(worktreePath, limit);
}

// File list — git ls-files + fs.stat for file search cache (Plan 049 Feature 2)
export async function fetchFileList(
  worktreePath: string,
  includeHidden = false
): Promise<import('../../src/features/041-file-browser/services/file-list').FileListResult> {
  await requireAuth();
  const { getFileList } = await import('../../src/features/041-file-browser/services/file-list');
  return getFileList(worktreePath, includeHidden);
}

// Diff stats — git diff HEAD --shortstat parser (Plan 049 Feature 1)
export async function fetchDiffStats(
  worktreePath: string
): Promise<import('../../src/features/041-file-browser/services/diff-stats').DiffStatsResult> {
  await requireAuth();
  const { getDiffStats } = await import('../../src/features/041-file-browser/services/diff-stats');
  return getDiffStats(worktreePath);
}

// File existence check — lightweight stat for ExplorerPanel (Plan 043 Phase 2)
// Security: resolves trusted root from slug via IWorkspaceService, not client worktreePath.
export async function fileExists(
  slug: string,
  worktreePath: string,
  filePath: string
): Promise<boolean> {
  await requireAuth();
  const nodePath = await import('node:path');
  const container = getContainer();
  const workspaceService = container.resolve<IWorkspaceService>(
    WORKSPACE_DI_TOKENS.WORKSPACE_SERVICE
  );
  const fileSystem = container.resolve<IFileSystem>(SHARED_DI_TOKENS.FILESYSTEM);
  const pathResolver = container.resolve<IPathResolver>(SHARED_DI_TOKENS.PATH_RESOLVER);

  // Resolve trusted root from slug
  const info = await workspaceService.getInfo(slug);
  if (!info) return false;
  // Verify worktreePath is a known worktree for this workspace
  const trustedRoot = info.worktrees.find((w) => w.path === worktreePath)?.path ?? info.path;

  try {
    const absolutePath = pathResolver.resolvePath(trustedRoot, filePath);
    const realPath = await fileSystem.realpath(absolutePath);
    if (!realPath.startsWith(trustedRoot + nodePath.default.sep) && realPath !== trustedRoot) {
      return false;
    }
    const stat = await fileSystem.stat(realPath);
    return !stat.isDirectory;
  } catch {
    return false;
  }
}

// Path type check — returns 'file', 'directory', or false (Plan 043)
export async function pathExists(
  slug: string,
  worktreePath: string,
  filePath: string
): Promise<'file' | 'directory' | false> {
  await requireAuth();
  const nodePath = await import('node:path');
  const container = getContainer();
  const workspaceService = container.resolve<IWorkspaceService>(
    WORKSPACE_DI_TOKENS.WORKSPACE_SERVICE
  );
  const fileSystem = container.resolve<IFileSystem>(SHARED_DI_TOKENS.FILESYSTEM);
  const pathResolver = container.resolve<IPathResolver>(SHARED_DI_TOKENS.PATH_RESOLVER);

  const info = await workspaceService.getInfo(slug);
  if (!info) return false;
  const trustedRoot = info.worktrees.find((w) => w.path === worktreePath)?.path ?? info.path;

  try {
    const absolutePath = pathResolver.resolvePath(trustedRoot, filePath);
    const realPath = await fileSystem.realpath(absolutePath);
    if (!realPath.startsWith(trustedRoot + nodePath.default.sep) && realPath !== trustedRoot) {
      return false;
    }
    const stat = await fileSystem.stat(realPath);
    return stat.isDirectory ? 'directory' : 'file';
  } catch {
    return false;
  }
}

// ==================== File Mutation Actions — Plan 068 ====================

export type {
  CreateResult,
  DeleteResult,
  RenameResult,
} from '../../src/features/041-file-browser/services/file-mutation-actions';

export async function createFile(
  slug: string,
  worktreePath: string,
  dirPath: string,
  fileName: string
): Promise<
  import('../../src/features/041-file-browser/services/file-mutation-actions').CreateResult
> {
  await requireAuth();
  const container = getContainer();
  const fileSystem = container.resolve<IFileSystem>(SHARED_DI_TOKENS.FILESYSTEM);
  const pathResolver = container.resolve<IPathResolver>(SHARED_DI_TOKENS.PATH_RESOLVER);
  const { createFileService } = await import(
    '../../src/features/041-file-browser/services/file-mutation-actions'
  );
  return createFileService({ worktreePath, dirPath, fileName, fileSystem, pathResolver });
}

export async function createFolder(
  slug: string,
  worktreePath: string,
  dirPath: string,
  folderName: string
): Promise<
  import('../../src/features/041-file-browser/services/file-mutation-actions').CreateResult
> {
  await requireAuth();
  const container = getContainer();
  const fileSystem = container.resolve<IFileSystem>(SHARED_DI_TOKENS.FILESYSTEM);
  const pathResolver = container.resolve<IPathResolver>(SHARED_DI_TOKENS.PATH_RESOLVER);
  const { createFolderService } = await import(
    '../../src/features/041-file-browser/services/file-mutation-actions'
  );
  return createFolderService({ worktreePath, dirPath, folderName, fileSystem, pathResolver });
}

export async function deleteItem(
  slug: string,
  worktreePath: string,
  itemPath: string
): Promise<
  import('../../src/features/041-file-browser/services/file-mutation-actions').DeleteResult
> {
  await requireAuth();
  const container = getContainer();
  const fileSystem = container.resolve<IFileSystem>(SHARED_DI_TOKENS.FILESYSTEM);
  const pathResolver = container.resolve<IPathResolver>(SHARED_DI_TOKENS.PATH_RESOLVER);
  const { deleteItemService } = await import(
    '../../src/features/041-file-browser/services/file-mutation-actions'
  );
  return deleteItemService({ worktreePath, itemPath, fileSystem, pathResolver });
}

export async function renameItem(
  slug: string,
  worktreePath: string,
  oldPath: string,
  newName: string
): Promise<
  import('../../src/features/041-file-browser/services/file-mutation-actions').RenameResult
> {
  await requireAuth();
  const container = getContainer();
  const fileSystem = container.resolve<IFileSystem>(SHARED_DI_TOKENS.FILESYSTEM);
  const pathResolver = container.resolve<IPathResolver>(SHARED_DI_TOKENS.PATH_RESOLVER);
  const { renameItemService } = await import(
    '../../src/features/041-file-browser/services/file-mutation-actions'
  );
  return renameItemService({ worktreePath, oldPath, newName, fileSystem, pathResolver });
}
