/**
 * File Browser Page — /workspaces/[slug]/browser
 *
 * Two-panel layout: file tree (left) + file viewer (right).
 * URL-driven state via fileBrowserPageParamsCache.
 * Server Component fetches initial root entries via DI.
 *
 * Phase 4: File Browser — Plan 041
 * DYK-P4-01: Hybrid — server props for initial tree, API for expansion
 * AC-20: Two-panel layout
 */

import { SHARED_DI_TOKENS, WORKSPACE_DI_TOKENS } from '@chainglass/shared';
import type { IFileSystem } from '@chainglass/shared';
import type { IWorkspaceService } from '@chainglass/workflow';
import { Suspense } from 'react';
import { fileBrowserPageParamsCache } from '../../../../../src/features/041-file-browser/params/file-browser.params';
import { listDirectory } from '../../../../../src/features/041-file-browser/services/directory-listing';
import { getContainer } from '../../../../../src/lib/bootstrap-singleton';
import { BrowserClient } from './browser-client';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function BrowserPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const searchParamsResolved = await searchParams;

  const container = getContainer();
  const workspaceService = container.resolve<IWorkspaceService>(
    WORKSPACE_DI_TOKENS.WORKSPACE_SERVICE
  );
  const fileSystem = container.resolve<IFileSystem>(SHARED_DI_TOKENS.FILESYSTEM);

  const info = await workspaceService.getInfo(slug);
  if (!info) {
    return (
      <div className="flex items-center justify-center p-8 text-muted-foreground">
        Workspace not found
      </div>
    );
  }

  // Get worktree from URL params (or default to main workspace path)
  const worktreePath =
    typeof searchParamsResolved.worktree === 'string' ? searchParamsResolved.worktree : info.path;

  // Fetch root directory entries server-side
  const rootEntries = await listDirectory({
    worktreePath,
    dirPath: '',
    isGit: info.hasGit,
    fileSystem,
  });

  return (
    <Suspense fallback={<div className="p-4">Loading browser...</div>}>
      <BrowserClient
        slug={slug}
        worktreePath={worktreePath}
        isGit={info.hasGit}
        initialEntries={rootEntries.entries}
      />
    </Suspense>
  );
}
