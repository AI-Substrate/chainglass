'use client';

/**
 * useFileNavigation — File selection, expand, read, save, edit, diff.
 *
 * Extracted from BrowserClient for separation of concerns (DYK-P3-05).
 * Owns: childEntries, fileData, editContent, diffCache, diffLoading, pendingDraft.
 *
 * Phase 3: Wire Into BrowserClient — Plan 043
 *
 * ONE LOAD PATH. Every route into "show me this file" — tree click, mount with a `?file=`
 * param, URL param change, post-save refresh, manual refresh — goes through `loadFile`.
 * Before plan 087 there were four near-copies of `readFile → setFileData → setEditContent`
 * and they had already drifted (only one announced `onFileRefreshed`). Adding the draft
 * read to four call sites is how the AC-4/AC-10 regression gets built, so the copies were
 * collapsed first and the draft read added in the one place.
 */

import type { FileEntry } from '@/features/041-file-browser/services/directory-listing';
import type { AutosaveDraft } from '@/features/041-file-browser/services/draft-file-actions';
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
  onFileRefreshed?: (path: string) => void;
  /** Autosave draft store (plan 087). Omit both to disable draft handling entirely. */
  readDraft?: (
    slug: string,
    worktreePath: string,
    filePath: string
  ) => Promise<{ ok: true; draft: AutosaveDraft | null } | { ok: false; error: string }>;
  deleteDraft?: (slug: string, worktreePath: string, filePath: string) => Promise<unknown>;
}

/** A draft that differs from disk and is waiting on the user's Restore / Discard call. */
export interface PendingDraft {
  draft: AutosaveDraft;
  /** Live disk mtime at load. The baseline a Restore hands to the next explicit save. */
  diskMtime: string;
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
    onFileRefreshed,
    readDraft: readDraftFn,
    deleteDraft: deleteDraftFn,
  } = options;

  const [childEntries, setChildEntries] = useState<Record<string, FileEntry[]>>({});
  const [fileData, setFileData] = useState<ReadFileResult | null>(null);
  const [editContent, setEditContent] = useState<string>('');
  const [diffCache, setDiffCache] = useState<Record<string, DiffResult>>({});
  const [diffLoading, setDiffLoading] = useState(false);

  const [pendingDraft, setPendingDraft] = useState<PendingDraft | null>(null);

  /**
   * Monotonic load counter. A file switch during an in-flight read must not let the
   * older response land — otherwise file A's content, or worse its restore prompt,
   * appears over file B (the 086 F005/F008 state-leak class, AC-10).
   */
  const loadSeqRef = useRef(0);
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

  /**
   * The one path that turns a file path into on-screen content.
   *
   * Order matters. The draft is resolved AFTER the disk read (we need the disk content to
   * decide whether the draft is redundant) but the prompt is raised as state rather than
   * applied, so the caller can gate the edit surface until the user answers (AC-4/RK-07).
   * Restoring is never automatic.
   */
  const loadFile = useCallback(
    async (filePath: string, opts?: { announceRefresh?: boolean }) => {
      const seq = ++loadSeqRef.current;
      const isStale = () => seq !== loadSeqRef.current;

      let result: ReadFileResult;
      try {
        result = await readFileFn(slug, worktreePath, filePath);
      } catch (error) {
        console.error('Failed to read file:', error);
        return;
      }
      if (isStale()) return;

      setFileData(result);
      // A prompt belongs to the file that raised it and to no other (AC-10).
      setPendingDraft(null);

      if (!result.ok || result.isBinary) return;
      setEditContent(result.content);
      if (opts?.announceRefresh) onFileRefreshed?.(filePath);

      // AC-9: binary and unreadable files never reach here, so they never get a draft.
      if (!readDraftFn) return;
      const draftResult = await readDraftFn(slug, worktreePath, filePath);
      if (isStale() || !draftResult.ok || draftResult.draft === null) return;

      // AC-5: a draft that matches disk is stale-but-harmless. Drop it silently — a
      // prompt offering to restore what is already on screen is pure noise.
      if (draftResult.draft.content === result.content) {
        void deleteDraftFn?.(slug, worktreePath, filePath);
        return;
      }

      setPendingDraft({ draft: draftResult.draft, diskMtime: result.mtime });
    },
    [slug, worktreePath, readFileFn, readDraftFn, deleteDraftFn, onFileRefreshed]
  );

  /**
   * Load the draft's content into the EDITOR only — the target is never written here.
   * The next explicit save runs the existing mtime guard against the live disk mtime, so
   * a restore can never silently clobber an external edit (AC-6).
   */
  const restoreDraft = useCallback(() => {
    setPendingDraft((pending) => {
      if (pending) setEditContent(pending.draft.content);
      return null;
    });
  }, []);

  /** Drop the draft and keep what is on disk. */
  const discardDraft = useCallback(() => {
    setPendingDraft((pending) => {
      if (pending) void deleteDraftFn?.(slug, worktreePath, pending.draft.filePath);
      return null;
    });
  }, [slug, worktreePath, deleteDraftFn]);

  const handleSelect = useCallback(
    async (filePath: string) => {
      setUrlFile(filePath);
      await loadFile(filePath);
    },
    [loadFile, setUrlFile]
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
        // Load content only — don't call handleSelect, which rewrites the URL and would
        // clear the ?line= param.
        void loadFile(initialFile);
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
      void loadFile(initialFile);
    }
  }, [initialFile, loadFile]);

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
      if (!initialFile || !fileData?.ok) return false;
      const toastId = toast.loading('Saving...');
      try {
        const result = await saveFileFn(slug, worktreePath, initialFile, content, fileData.mtime);
        if (!result.ok) {
          if (result.error === 'conflict') {
            toast.error('Save conflict', {
              id: toastId,
              description: 'File was modified externally. Refresh to see changes.',
            });
            return false;
          }
          toast.error('Save failed', { id: toastId });
          return false;
        }
        // Draft cleanup precedes the refresh read, deliberately. The refresh runs
        // `loadFile`, which reads the draft; clearing first means it finds nothing rather
        // than relying on the redundant-draft check to swallow a draft we know is spent.
        //
        // This is also the ONLY draft-delete on the save path, and it covers both explicit
        // saves and the navigate-away save (which reaches here through the same callback).
        // A `conflict` return above never gets here — the user's autosaved work survives
        // the conflict dialog, which is the store's key invariant.
        await deleteDraftFn?.(slug, worktreePath, initialFile);

        await loadFile(initialFile);
        setDiffCache((prev) => {
          const next = { ...prev };
          delete next[initialFile];
          return next;
        });
        toast.success('File saved', { id: toastId });
        return true;
      } catch {
        toast.error('Save failed', { id: toastId });
        return false;
      }
    },
    [slug, worktreePath, initialFile, fileData, saveFileFn, deleteDraftFn, loadFile]
  );

  const handleRefreshFile = useCallback(async () => {
    if (!initialFile) return;
    await loadFile(initialFile, { announceRefresh: true });
    setDiffCache((prev) => {
      const next = { ...prev };
      delete next[initialFile];
      return next;
    });
  }, [initialFile, loadFile]);

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
    pendingDraft,
    restoreDraft,
    discardDraft,
    /** FT-001: Flag to skip re-read on next URL file param change (for rename) */
    skipNextFileRead: () => {
      skipNextReadRef.current = true;
    },
  };
}
