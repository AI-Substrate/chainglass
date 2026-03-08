'use client';

/**
 * useFileNavigation — File selection, expand, read, save, edit, diff.
 *
 * Extracted from BrowserClient for separation of concerns (DYK-P3-05).
 * Owns: childEntries, fileData, editContent, diffCache, diffLoading.
 *
 * Phase 3: Wire Into BrowserClient — Plan 043
 */

import type { FileEntry } from '@/features/041-file-browser/services/directory-listing';
import type { ReadFileResult } from '@/features/041-file-browser/services/file-actions';
import type { DiffResult } from '@chainglass/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { ViewerMode } from '../components/file-viewer-panel';

interface UseFileNavigationOptions {
  slug: string;
  worktreePath: string;
  isGit: boolean;
  initialFile?: string;
  readFile: (slug: string, worktreePath: string, filePath: string) => Promise<ReadFileResult>;
  saveFile: (
    slug: string,
    worktreePath: string,
    filePath: string,
    content: string,
    mtime?: string
  ) => Promise<{ ok: true; newMtime: string } | { ok: false; error: string }>;
  fetchGitDiff: (filePath: string, cwd: string) => Promise<DiffResult>;
  setUrlFile: (file: string) => void;
  setUrlMode: (mode: string) => void;
}

export function useFileNavigation(options: UseFileNavigationOptions) {
  const {
    slug,
    worktreePath,
    initialFile,
    readFile: readFileFn,
    saveFile: saveFileFn,
    fetchGitDiff: fetchGitDiffFn,
    setUrlFile,
    setUrlMode,
  } = options;

  const [childEntries, setChildEntries] = useState<Record<string, FileEntry[]>>({});
  const [fileData, setFileData] = useState<ReadFileResult | null>(null);
  const [editContent, setEditContent] = useState<string>('');
  const [diffCache, setDiffCache] = useState<Record<string, DiffResult>>({});
  const [diffLoading, setDiffLoading] = useState(false);

  // DYK-P3-01: Ref for cache-aware handleExpand (avoids stale closure in mount effect)
  const childEntriesRef = useRef<Record<string, FileEntry[]>>({});
  useEffect(() => {
    childEntriesRef.current = childEntries;
  }, [childEntries]);

  const handleExpand = useCallback(
    async (dirPath: string) => {
      // DYK-P3-01: Skip if already cached (ref avoids stale closure)
      if (childEntriesRef.current[dirPath]) return;
      try {
        const url = `/api/workspaces/${slug}/files?worktree=${encodeURIComponent(worktreePath)}&dir=${encodeURIComponent(dirPath)}`;
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          setChildEntries((prev) => ({ ...prev, [dirPath]: data.entries }));
        }
      } catch (error) {
        console.error('Failed to expand directory:', error);
      }
    },
    [slug, worktreePath]
  );

  /** Re-fetch a directory's contents even if cached (for live file events). */
  const handleRefreshDir = useCallback(
    async (dirPath: string) => {
      try {
        const url = `/api/workspaces/${slug}/files?worktree=${encodeURIComponent(worktreePath)}&dir=${encodeURIComponent(dirPath)}`;
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          setChildEntries((prev) => ({ ...prev, [dirPath]: data.entries }));
        }
      } catch (error) {
        console.error('Failed to refresh directory:', error);
      }
    },
    [slug, worktreePath]
  );

  const handleSelect = useCallback(
    async (filePath: string) => {
      setUrlFile(filePath);
      try {
        const result = await readFileFn(slug, worktreePath, filePath);
        setFileData(result);
        if (result.ok && !result.isBinary) {
          setEditContent(result.content);
        }
      } catch (error) {
        console.error('Failed to read file:', error);
      }
    },
    [slug, worktreePath, readFileFn, setUrlFile]
  );

  // Auto-expand tree to show selected file on mount
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional mount-only effect
  useEffect(() => {
    if (initialFile) {
      const parts = initialFile.split('/');
      let current = '';
      for (let i = 0; i < parts.length - 1; i++) {
        current = current ? `${current}/${parts[i]}` : parts[i];
        handleExpand(current);
      }
      if (!fileData) {
        // Load content only — don't call handleSelect which rewrites URL and clears line param
        readFileFn(slug, worktreePath, initialFile)
          .then((result) => {
            setFileData(result);
            if (result.ok && !result.isBinary) {
              setEditContent(result.content);
            }
          })
          .catch((error) => console.error('Failed to read file:', error));
      }
    }
  }, []);

  // Load file when initialFile changes via URL params (e.g. code search navigation)
  // FT-001: Skip re-read when the change is from a rename (dirty buffer preserved)
  const prevFileRef = useRef(initialFile);
  const skipNextReadRef = useRef(false);
  useEffect(() => {
    if (initialFile && initialFile !== prevFileRef.current) {
      prevFileRef.current = initialFile;
      if (skipNextReadRef.current) {
        skipNextReadRef.current = false;
        return;
      }
      readFileFn(slug, worktreePath, initialFile)
        .then((result) => {
          setFileData(result);
          if (result.ok && !result.isBinary) {
            setEditContent(result.content);
          }
        })
        .catch((error) => console.error('Failed to read file:', error));
    }
  }, [initialFile, slug, worktreePath, readFileFn]);

  const handleModeChange = useCallback(
    async (newMode: ViewerMode) => {
      setUrlMode(newMode);
      if (newMode === 'diff' && initialFile && !diffCache[initialFile]) {
        setDiffLoading(true);
        try {
          const result = await fetchGitDiffFn(initialFile, worktreePath);
          setDiffCache((prev) => ({ ...prev, [initialFile]: result }));
        } catch (error) {
          console.error('Failed to fetch diff:', error);
        } finally {
          setDiffLoading(false);
        }
      }
    },
    [initialFile, diffCache, worktreePath, fetchGitDiffFn, setUrlMode]
  );

  const handleRefresh = useCallback(() => {
    setChildEntries({});
    window.location.reload();
  }, []);

  const handleSave = useCallback(
    async (content: string) => {
      if (!initialFile || !fileData?.ok) return;
      const toastId = toast.loading('Saving...');
      try {
        const result = await saveFileFn(slug, worktreePath, initialFile, content, fileData.mtime);
        if (!result.ok) {
          if (result.error === 'conflict') {
            toast.error('Save conflict', {
              id: toastId,
              description: 'File was modified externally. Refresh to see changes.',
            });
            return;
          }
          toast.error('Save failed', { id: toastId });
          return;
        }
        const refreshed = await readFileFn(slug, worktreePath, initialFile);
        setFileData(refreshed);
        if (refreshed.ok && !refreshed.isBinary) setEditContent(refreshed.content);
        setDiffCache((prev) => {
          const next = { ...prev };
          delete next[initialFile];
          return next;
        });
        toast.success('File saved', { id: toastId });
      } catch {
        toast.error('Save failed', { id: toastId });
      }
    },
    [slug, worktreePath, initialFile, fileData, readFileFn, saveFileFn]
  );

  const handleRefreshFile = useCallback(async () => {
    if (!initialFile) return;
    const result = await readFileFn(slug, worktreePath, initialFile);
    setFileData(result);
    if (result.ok && !result.isBinary) {
      setEditContent(result.content);
      toast.info('File refreshed');
    }
    setDiffCache((prev) => {
      const next = { ...prev };
      delete next[initialFile];
      return next;
    });
  }, [slug, worktreePath, initialFile, readFileFn]);

  return {
    childEntries,
    fileData,
    editContent,
    setEditContent,
    diffCache,
    diffLoading,
    handleExpand,
    handleRefreshDir,
    handleSelect,
    handleModeChange,
    handleRefresh,
    handleSave,
    handleRefreshFile,
    /** FT-001: Flag to skip re-read on next URL file param change (for rename) */
    skipNextFileRead: () => {
      skipNextReadRef.current = true;
    },
  };
}
