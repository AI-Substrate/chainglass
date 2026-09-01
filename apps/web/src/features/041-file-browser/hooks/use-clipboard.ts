'use client';

/**
 * useClipboard — Clipboard copy + download handlers for file browser.
 *
 * Extracted from BrowserClient for separation of concerns (DYK-P3-05).
 * Handles non-HTTPS clipboard fallback via setTimeout + textarea.
 *
 * `copyToClipboard` REPORTS WHETHER THE WRITE LANDED, and every caller gates
 * its toast on that. It used to return void and fire `toast.success`
 * unconditionally — on a non-secure origin the toast rendered a full tick
 * before the `execCommand` fallback had even run, and nothing read the
 * fallback's return value, so "Full path copied" appeared whether or not
 * anything reached the clipboard. A success message for a clipboard that
 * silently refused is worse than no message: the user pastes stale content
 * and blames the paste target. Same rule `pij-rail-view.tsx` states for the
 * seat-id copy — a failure must be VISIBLE.
 *
 * Phase 3: Wire Into BrowserClient — Plan 043
 */

import type { ReadFileResult } from '@/features/041-file-browser/services/file-actions';
import { type TreeEntry, formatTree } from '@/features/041-file-browser/services/format-tree';
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

/**
 * Pre-Clipboard-API fallback for non-secure origins (LAN HTTP, untrusted certs).
 *
 * The `setTimeout(0)` is load-bearing: appending and selecting the textarea
 * inside the originating event handler fights React's own focus handling, so
 * the copy is deferred by a tick. That tick is exactly why the old code could
 * not report a result — the caller had already returned. Resolving from inside
 * the timeout is what makes the outcome observable.
 *
 * `execCommand` returns false rather than throwing when the copy is refused,
 * so both the return value and a throw have to be treated as failure.
 */
function legacyCopy(text: string): Promise<boolean> {
  return new Promise((resolve) => {
    setTimeout(() => {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      let copied = false;
      try {
        copied = document.execCommand('copy');
      } catch {
        copied = false;
      } finally {
        document.body.removeChild(textarea);
      }
      resolve(copied);
    }, 0);
  });
}

export function useClipboard(options: UseClipboardOptions) {
  const { slug, worktreePath, readFile: readFileFn, repoInfo } = options;

  const copyToClipboard = useCallback(async (text: string): Promise<boolean> => {
    if (globalThis.isSecureContext && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch {
        // Secure context is necessary but not sufficient — a denied permission
        // or a document without focus rejects here. Fall through rather than
        // report a failure the legacy path may still be able to service.
      }
    }
    return legacyCopy(text);
  }, []);

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
