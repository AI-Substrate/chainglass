'use client';

/**
 * useClipboard — Clipboard copy + download handlers for file browser.
 *
 * Extracted from BrowserClient for separation of concerns (DYK-P3-05).
 * Handles non-HTTPS clipboard fallback via setTimeout + textarea.
 *
 * Phase 3: Wire Into BrowserClient — Plan 043
 */

import type { ReadFileResult } from '@/features/041-file-browser/services/file-actions';
import { type TreeEntry, formatTree } from '@/features/041-file-browser/services/format-tree';
import { useCallback } from 'react';
import { toast } from 'sonner';

interface UseClipboardOptions {
  slug: string;
  worktreePath: string;
  readFile: (slug: string, worktreePath: string, filePath: string) => Promise<ReadFileResult>;
}

export function useClipboard(options: UseClipboardOptions) {
  const { slug, worktreePath, readFile: readFileFn } = options;

  const copyToClipboard = useCallback((text: string): void => {
    if (globalThis.isSecureContext && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text);
      return;
    }
    setTimeout(() => {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      try {
        document.execCommand('copy');
      } finally {
        document.body.removeChild(textarea);
      }
    }, 0);
  }, []);

  const handleCopyFullPath = useCallback(
    (relativePath: string) => {
      copyToClipboard(`${worktreePath}/${relativePath}`);
      toast.success('Full path copied');
    },
    [worktreePath, copyToClipboard]
  );

  const handleCopyRelativePath = useCallback(
    (relativePath: string) => {
      copyToClipboard(relativePath);
      toast.success('Relative path copied');
    },
    [copyToClipboard]
  );

  const handleCopyContent = useCallback(
    async (filePath: string) => {
      try {
        const result = await readFileFn(slug, worktreePath, filePath);
        if (result.ok) {
          await copyToClipboard(result.content);
          toast.success('Content copied');
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
          await copyToClipboard(treeText);
          toast.success('Tree copied');
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
        if (result.ok) {
          const blob = new Blob([result.content], { type: 'text/plain' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = filePath.split('/').pop() ?? 'file';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        } else {
          toast.error('Could not download file');
        }
      } catch {
        toast.error('Could not download file');
      }
    },
    [slug, worktreePath, readFileFn]
  );

  return {
    copyToClipboard,
    handleCopyFullPath,
    handleCopyRelativePath,
    handleCopyContent,
    handleCopyTree,
    handleDownload,
  };
}
