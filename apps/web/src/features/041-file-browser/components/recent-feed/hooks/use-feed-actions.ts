'use client';

/**
 * useFeedActions — the 9 catalog actions exposed by every feed card.
 *
 * Workshop §3 binding catalog (all 9 items must be present):
 *   1. open                — navigate to file in FileViewerPanel (clears `view`)
 *   2. copyRelativePath    — workspace-relative path to clipboard
 *   3. copyAbsolutePath    — full filesystem path to clipboard
 *   4. download            — raw-file API with `?download=true`
 *   5. copyFilename        — basename only
 *   6. copyMarkdownLink    — `![name](url)` for media; `[name](url)` for others
 *   7. revealInTree        — sets `?dir={parent}&file={path}`, clears `view`
 *   8. copyFileContents    — fetches FULL content via fetchFileExcerpt('full'), copies it
 *   9. dismiss             — adds path to dismissed set in the reducer (session-only, no persistence)
 *
 * Plan recent-changes-feed T025 — covers AC E1-E6.
 */

import { useCallback } from 'react';
import { toast } from 'sonner';
import { fetchFileExcerpt } from '../../../../../../app/actions/file-actions';
import type { FeedAction } from './use-recent-feed-state';
import type { FeedItem } from '../types';

export interface UseFeedActionsOptions {
  slug: string;
  worktreePath: string;
  /** All currently visible feed items (for absolute-path lookup on a path-only call). */
  items: FeedItem[];
  /** Reducer dispatch for `dismiss`. */
  dispatch: (action: FeedAction) => void;
  /** Caller-supplied navigation handler — opens a file (clears `view`). */
  onOpenFile: (path: string) => void;
  /** Caller-supplied navigation handler — reveals the path's parent dir in the tree. */
  onRevealInTree: (path: string) => void;
}

export interface FeedActions {
  open: (path: string) => void;
  copyRelativePath: (path: string) => void;
  copyAbsolutePath: (path: string) => void;
  download: (path: string) => void;
  copyFilename: (path: string) => void;
  copyMarkdownLink: (path: string) => void;
  revealInTree: (path: string) => void;
  /** Async — fetches the full file via fetchFileExcerpt('full'). */
  copyFileContents: (path: string) => Promise<void>;
  dismiss: (path: string) => void;
}

function basenameOf(path: string): string {
  const segs = path.split('/');
  return segs[segs.length - 1] ?? path;
}

function rawFileUrl(slug: string, worktreePath: string, path: string): string {
  return `/api/workspaces/${slug}/files/raw?worktree=${encodeURIComponent(worktreePath)}&file=${encodeURIComponent(path)}`;
}

async function copyToClipboard(text: string): Promise<boolean> {
  // Modern path — only works in secure contexts (HTTPS / localhost).
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // fall through to the legacy fallback — chainglass is often
      // accessed over a LAN IP (e.g. http://192.168.1.x:3000) which is
      // a non-secure context where navigator.clipboard rejects.
    }
  }

  // Legacy fallback — works without a secure context. Builds a hidden
  // off-screen textarea, selects its content, runs `document.execCommand
  // ('copy')`, and removes it. Deprecated on the spec but still
  // implemented in every shipping browser.
  if (typeof document === 'undefined') return false;
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.top = '0';
  ta.style.left = '0';
  ta.style.width = '1px';
  ta.style.height = '1px';
  ta.style.opacity = '0';
  ta.style.pointerEvents = 'none';
  document.body.appendChild(ta);
  let succeeded = false;
  try {
    ta.focus();
    ta.select();
    succeeded = document.execCommand('copy');
  } catch {
    succeeded = false;
  } finally {
    document.body.removeChild(ta);
  }
  return succeeded;
}

export function useFeedActions({
  slug,
  worktreePath,
  items,
  dispatch,
  onOpenFile,
  onRevealInTree,
}: UseFeedActionsOptions): FeedActions {
  const findItem = useCallback(
    (path: string): FeedItem | undefined => items.find((i) => i.path === path),
    [items]
  );

  const open = useCallback(
    (path: string) => {
      onOpenFile(path);
    },
    [onOpenFile]
  );

  const copyRelativePath = useCallback(async (path: string) => {
    const ok = await copyToClipboard(path);
    if (ok) toast.success('Relative path copied');
    else toast.error('Failed to copy path');
  }, []);

  const copyAbsolutePath = useCallback(
    async (path: string) => {
      const item = findItem(path);
      if (!item) return;
      const ok = await copyToClipboard(item.absolutePath);
      if (ok) toast.success('Absolute path copied');
      else toast.error('Failed to copy path');
    },
    [findItem]
  );

  const download = useCallback(
    (path: string) => {
      const url = `${rawFileUrl(slug, worktreePath, path)}&download=true`;
      window.open(url, '_blank', 'noopener,noreferrer');
    },
    [slug, worktreePath]
  );

  const copyFilename = useCallback(async (path: string) => {
    const ok = await copyToClipboard(basenameOf(path));
    if (ok) toast.success('Filename copied');
    else toast.error('Failed to copy filename');
  }, []);

  const copyMarkdownLink = useCallback(
    async (path: string) => {
      const item = findItem(path);
      const name = basenameOf(path);
      const url = rawFileUrl(slug, worktreePath, path);
      const isMedia =
        item?.kind === 'image' || item?.kind === 'video' || item?.kind === 'audio';
      const md = isMedia ? `![${name}](${url})` : `[${name}](${url})`;
      const ok = await copyToClipboard(md);
      if (ok) toast.success('Markdown link copied');
      else toast.error('Failed to copy markdown link');
    },
    [findItem, slug, worktreePath]
  );

  const revealInTree = useCallback(
    (path: string) => {
      onRevealInTree(path);
    },
    [onRevealInTree]
  );

  const copyFileContents = useCallback(
    async (path: string) => {
      try {
        const result = await fetchFileExcerpt(worktreePath, path, 'full');
        if (!result.ok) {
          toast.error(`Cannot copy contents: ${result.error}`);
          return;
        }
        const ok = await copyToClipboard(result.content);
        if (ok) toast.success('File contents copied');
        else toast.error('Failed to copy file contents');
      } catch (err) {
        toast.error(
          err instanceof Error ? `Cannot copy contents: ${err.message}` : 'Cannot copy contents'
        );
      }
    },
    [worktreePath]
  );

  const dismiss = useCallback(
    (path: string) => {
      dispatch({ type: 'DISMISS', path });
    },
    [dispatch]
  );

  return {
    open,
    copyRelativePath,
    copyAbsolutePath,
    download,
    copyFilename,
    copyMarkdownLink,
    revealInTree,
    copyFileContents,
    dismiss,
  };
}
