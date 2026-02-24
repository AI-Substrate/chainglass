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
  const { getGitDiff } = await import('../../src/lib/server/git-diff-action');
  return getGitDiff(filePath, cwd);
}

// Wrapper for changed-files filter
export async function fetchChangedFiles(worktreePath: string) {
  const { getChangedFiles } = await import(
    '../../src/features/041-file-browser/services/changed-files'
  );
  return getChangedFiles(worktreePath);
}
