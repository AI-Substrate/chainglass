'use client';

/**
 * useClipboard — Clipboard copy + download handlers for file browser.
 *
 * Extracted from BrowserClient for separation of concerns (DYK-P3-05).
 * Handles non-HTTPS clipboard fallback via setTimeout + textarea.
 *
 * The write itself is `_platform/clipboard`'s `copyText`, which resolves
 * whether the text actually landed. Every handler here gates its toast on
 * that result — a success message for a clipboard that silently refused is
 * worse than no message, because the user pastes stale content and blames
 * the paste target.
 *
 * Phase 3: Wire Into BrowserClient — Plan 043
 */

import type { ReadFileResult } from '@/features/041-file-browser/services/file-actions';
import { type TreeEntry, formatTree } from '@/features/041-file-browser/services/format-tree';
import { copyText } from '@/features/_platform/clipboard';
import { type RepoInfo, buildFileUrl } from '@/features/_platform/git';
import { useCallback } from 'react';
import { toast } from 'sonner';

interface UseClipboardOptions {
  slug: string;
  worktreePath: string;
  readFile: (slug: string, worktreePath: string, filePath: string) => Promise<ReadFileResult>;
  /**
   * Plan 084 FX007 — repo-info payload from `/api/workspaces/[slug]/repo-info`.
   * Optional: when null/undefined or `host === 'unknown'`, the two
   * `handleCopyRepoUrl*` handlers no-op silently. (Render-time visibility
   * gating lives in file-tree / changes-view per T007.)
   */
  repoInfo?: RepoInfo | null;
}

export function useClipboard(options: UseClipboardOptions) {
  const { slug, worktreePath, readFile: readFileFn, repoInfo } = options;

  /** Re-exported so existing call sites keep a stable name; the logic is `_platform/clipboard`. */
  const copyToClipboard = useCallback((text: string): Promise<boolean> => copyText(text), []);

  const handleCopyFullPath = useCallback(
    async (relativePath: string) => {
      const copied = await copyToClipboard(`${worktreePath}/${relativePath}`);
      if (copied) toast.success('Full path copied');
      else toast.error('Could not copy full path');
    },
    [worktreePath, copyToClipboard]
  );

  const handleCopyRelativePath = useCallback(
    async (relativePath: string) => {
      const copied = await copyToClipboard(relativePath);
      if (copied) toast.success('Relative path copied');
      else toast.error('Could not copy relative path');
    },
    [copyToClipboard]
  );

  const handleCopyContent = useCallback(
    async (filePath: string) => {
      try {
        const result = await readFileFn(slug, worktreePath, filePath);
        if (result.ok && !result.isBinary) {
          const copied = await copyToClipboard(result.content);
          if (copied) toast.success('Content copied');
          else toast.error('Could not copy content');
        } else {
          toast.error('Could not copy content');
        }
      } catch {
        toast.error('Could not copy content');
      }
    },
    [slug, worktreePath, copyToClipboard, readFileFn]
  );

  const handleCopyTree = useCallback(
    async (dirPath: string) => {
      try {
        const url = `/api/workspaces/${slug}/files?worktree=${encodeURIComponent(worktreePath)}&dir=${encodeURIComponent(dirPath)}&tree=true`;
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          const treeText = formatTree(data.tree as TreeEntry[], dirPath);
          const copied = await copyToClipboard(treeText);
          if (copied) toast.success('Tree copied');
          else toast.error('Could not copy tree');
        } else {
          toast.error('Could not copy tree');
        }
      } catch {
        toast.error('Could not copy tree');
      }
    },
    [slug, worktreePath, copyToClipboard]
  );

  const handleDownload = useCallback(
    async (filePath: string) => {
      try {
        const result = await readFileFn(slug, worktreePath, filePath);
        if (result.ok && !result.isBinary) {
          const blob = new Blob([result.content], { type: 'text/plain' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = filePath.split('/').pop() ?? 'file';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        } else if (result.ok && result.isBinary) {
          // Binary files: download via raw file API with ?download=true
          const rawUrl = `/api/workspaces/${encodeURIComponent(slug)}/files/raw?worktree=${encodeURIComponent(worktreePath)}&file=${encodeURIComponent(filePath)}&download=true`;
          const a = document.createElement('a');
          a.href = rawUrl;
          a.download = filePath.split('/').pop() ?? 'file';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        } else {
          toast.error('Could not download file');
        }
      } catch {
        toast.error('Could not download file');
      }
    },
    [slug, worktreePath, readFileFn]
  );

  /**
   * Plan 084 FX007 — copy a host-aware web URL pinned to whatever ref the
   * worktree currently has checked out.
   *  - Branch: builds `/blob/<branch>/...` (GitHub) or `?path=...&version=GB<branch>` (ADO).
   *  - Detached HEAD with non-null SHA: builds the commit-pinned variant.
   *  - Detached HEAD with null SHA (zero-commit worktree): no-op (finding 14).
   *  - Missing/unknown repoInfo: no-op (visibility gate lives in T007).
   */
  const handleCopyRepoUrlCurrentRef = useCallback(
    async (relativePath: string) => {
      if (!repoInfo || repoInfo.host === 'unknown') return;
      const ref = repoInfo.isDetached ? repoInfo.currentSha : repoInfo.currentBranch;
      if (!ref) return; // detached + null SHA → silent no-op
      const refType = repoInfo.isDetached ? ('commit' as const) : ('branch' as const);
      const url = buildFileUrl(
        {
          host: repoInfo.host,
          org: repoInfo.org,
          project: repoInfo.project,
          repo: repoInfo.repo,
        },
        { ref, refType, relativePath }
      );
      const copied = await copyToClipboard(url);
      if (copied) toast.success('URL copied');
      else toast.error('Could not copy URL');
    },
    [repoInfo, copyToClipboard]
  );

  /**
   * Plan 084 FX007 — copy a URL pinned to the workspace's default branch
   * (e.g. `main` / `master`). Always uses the actual ref name returned by
   * `getDefaultBaseBranch` server-side (per AC7).
   */
  const handleCopyRepoUrlDefaultBranch = useCallback(
    async (relativePath: string) => {
      if (!repoInfo || repoInfo.host === 'unknown') return;
      const url = buildFileUrl(
        {
          host: repoInfo.host,
          org: repoInfo.org,
          project: repoInfo.project,
          repo: repoInfo.repo,
        },
        { ref: repoInfo.defaultBranch, refType: 'branch', relativePath }
      );
      const copied = await copyToClipboard(url);
      if (copied) toast.success('URL copied');
      else toast.error('Could not copy URL');
    },
    [repoInfo, copyToClipboard]
  );

  return {
    copyToClipboard,
    handleCopyFullPath,
    handleCopyRelativePath,
    handleCopyContent,
    handleCopyTree,
    handleDownload,
    handleCopyRepoUrlCurrentRef,
    handleCopyRepoUrlDefaultBranch,
  };
}
