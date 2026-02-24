'use client';

/**
 * BrowserClient — Client-side file browser shell.
 *
 * Manages URL state (file, dir, mode, changed), fetches subdirectories
 * on expand, reads files on selection, and renders FileTree + FileViewerPanel.
 *
 * Phase 4: File Browser — Plan 041
 * Fix FX001-8: Lazy diff loading, wired highlightedHtml/markdownHtml (D3).
 * Fix FX001-10: Changed-files filter wired.
 */

import { FileTree } from '@/features/041-file-browser/components/file-tree';
import {
  FileViewerPanel,
  type ViewerMode,
} from '@/features/041-file-browser/components/file-viewer-panel';
import { fileBrowserParams } from '@/features/041-file-browser/params/file-browser.params';
import type { FileEntry } from '@/features/041-file-browser/services/directory-listing';
import type { ReadFileResult } from '@/features/041-file-browser/services/file-actions';
import { type TreeEntry, formatTree } from '@/features/041-file-browser/services/format-tree';
import type { DiffResult } from '@chainglass/shared';
import { useQueryStates } from 'nuqs';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  fetchChangedFiles,
  fetchGitDiff,
  readFile,
  saveFile,
} from '../../../../actions/file-actions';

export interface BrowserClientProps {
  slug: string;
  worktreePath: string;
  isGit: boolean;
  initialEntries: FileEntry[];
}

export function BrowserClient({ slug, worktreePath, isGit, initialEntries }: BrowserClientProps) {
  const [params, setParams] = useQueryStates(fileBrowserParams);
  const [childEntries, setChildEntries] = useState<Record<string, FileEntry[]>>({});
  const [fileData, setFileData] = useState<ReadFileResult | null>(null);
  const [changedFiles, setChangedFiles] = useState<string[]>([]);
  const [editContent, setEditContent] = useState<string>('');
  // Lazy diff: cached per file path (D3)
  const [diffCache, setDiffCache] = useState<Record<string, DiffResult>>({});
  const [diffLoading, setDiffLoading] = useState(false);

  const mode = (params.mode as ViewerMode) || 'preview';
  const selectedFile = params.file || undefined;

  // Current diff result for the selected file
  const currentDiff = selectedFile ? diffCache[selectedFile] : undefined;

  // Fetch subdirectory on expand
  const handleExpand = useCallback(
    async (dirPath: string) => {
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

  // Select a file — load its content
  const handleSelect = useCallback(
    async (filePath: string) => {
      // Only update URL if file actually changed (avoids resetting mode on mount)
      if (filePath !== params.file) {
        setParams({ file: filePath });
      }
      try {
        const result = await readFile(slug, worktreePath, filePath);
        setFileData(result);
        if (result.ok) {
          setEditContent(result.content);
        }
      } catch (error) {
        console.error('Failed to read file:', error);
      }
    },
    [setParams, slug, worktreePath, params.file]
  );

  // Auto-expand tree to show selected file on mount
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional mount-only effect
  useEffect(() => {
    if (params.file) {
      const parts = params.file.split('/');
      let current = '';
      for (let i = 0; i < parts.length - 1; i++) {
        current = current ? `${current}/${parts[i]}` : parts[i];
        handleExpand(current);
      }
      if (!fileData) {
        handleSelect(params.file);
      }
    }
  }, []);

  // Fetch changed files on mount if git repo
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional mount-only effect
  useEffect(() => {
    if (isGit) {
      fetchChangedFiles(worktreePath).then((result) => {
        if (result.ok) {
          setChangedFiles(result.files);
        }
      });
    }
  }, []);

  // Change viewer mode — lazy-load diff on first switch (D3)
  const handleModeChange = useCallback(
    async (newMode: ViewerMode) => {
      setParams({ mode: newMode });

      if (newMode === 'diff' && selectedFile && !diffCache[selectedFile]) {
        setDiffLoading(true);
        try {
          const result = await fetchGitDiff(selectedFile, worktreePath);
          setDiffCache((prev) => ({ ...prev, [selectedFile]: result }));
        } catch (error) {
          console.error('Failed to fetch diff:', error);
        } finally {
          setDiffLoading(false);
        }
      }
    },
    [setParams, selectedFile, diffCache, worktreePath]
  );

  // Refresh file tree
  const handleRefresh = useCallback(() => {
    setChildEntries({});
    window.location.reload();
  }, []);

  // Save file — DYK-042-01: toast.promise for loading, explicit toast for conflict (AC-09)
  const handleSave = useCallback(
    async (content: string) => {
      if (!selectedFile || !fileData?.ok) return;

      const toastId = toast.loading('Saving...');

      try {
        const result = await saveFile(slug, worktreePath, selectedFile, content, fileData.mtime);
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
        // Re-read to get new mtime + highlighted content
        const refreshed = await readFile(slug, worktreePath, selectedFile);
        setFileData(refreshed);
        if (refreshed.ok) setEditContent(refreshed.content);
        // Invalidate diff cache since content changed
        setDiffCache((prev) => {
          const next = { ...prev };
          delete next[selectedFile];
          return next;
        });
        toast.success('File saved', { id: toastId });
      } catch {
        toast.error('Save failed', { id: toastId });
      }
    },
    [slug, worktreePath, selectedFile, fileData]
  );

  // Refresh current file
  const handleRefreshFile = useCallback(async () => {
    if (!selectedFile) return;
    const result = await readFile(slug, worktreePath, selectedFile);
    setFileData(result);
    if (result.ok) {
      setEditContent(result.content);
      toast.info('File refreshed');
    }
    // Invalidate diff cache too
    setDiffCache((prev) => {
      const next = { ...prev };
      delete next[selectedFile];
      return next;
    });
  }, [slug, worktreePath, selectedFile]);

  // Clipboard handlers for context menu
  const handleCopyFullPath = useCallback(
    async (relativePath: string) => {
      await navigator.clipboard.writeText(`${worktreePath}/${relativePath}`);
      toast.success('Full path copied');
    },
    [worktreePath]
  );

  const handleCopyRelativePath = useCallback(async (relativePath: string) => {
    await navigator.clipboard.writeText(relativePath);
    toast.success('Relative path copied');
  }, []);

  const handleCopyContent = useCallback(
    async (filePath: string) => {
      try {
        const result = await readFile(slug, worktreePath, filePath);
        if (result.ok) {
          await navigator.clipboard.writeText(result.content);
          toast.success('Content copied');
        } else {
          toast.error('Could not copy content');
        }
      } catch {
        toast.error('Could not copy content');
      }
    },
    [slug, worktreePath]
  );

  const handleCopyTree = useCallback(
    async (dirPath: string) => {
      try {
        const url = `/api/workspaces/${slug}/files?worktree=${encodeURIComponent(worktreePath)}&dir=${encodeURIComponent(dirPath)}&tree=true`;
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          const treeText = formatTree(data.tree as TreeEntry[], dirPath);
          await navigator.clipboard.writeText(treeText);
          toast.success('Tree copied');
        } else {
          toast.error('Could not copy tree');
        }
      } catch {
        toast.error('Could not copy tree');
      }
    },
    [slug, worktreePath]
  );

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden">
      {/* Left panel: File tree */}
      <div className="w-64 shrink-0 border-r overflow-y-auto lg:w-72">
        <FileTree
          entries={initialEntries}
          selectedFile={selectedFile}
          changedFiles={changedFiles}
          showChangedOnly={params.changed || false}
          onSelect={handleSelect}
          onExpand={handleExpand}
          onRefresh={handleRefresh}
          childEntries={childEntries}
          onCopyFullPath={handleCopyFullPath}
          onCopyRelativePath={handleCopyRelativePath}
          onCopyContent={handleCopyContent}
          onCopyTree={handleCopyTree}
        />
      </div>

      {/* Right panel: File viewer */}
      <div className="flex-1 overflow-hidden">
        {selectedFile ? (
          <FileViewerPanel
            filePath={selectedFile}
            content={fileData?.ok ? fileData.content : null}
            language={fileData?.ok ? fileData.language : 'text'}
            mtime={fileData?.ok ? fileData.mtime : ''}
            mode={mode}
            onModeChange={handleModeChange}
            onSave={handleSave}
            onRefresh={handleRefreshFile}
            editContent={editContent}
            onEditChange={setEditContent}
            highlightedHtml={fileData?.ok ? fileData.highlightedHtml : undefined}
            markdownHtml={fileData?.ok ? fileData.markdownHtml : undefined}
            diffData={currentDiff?.diff}
            diffError={currentDiff?.error}
            diffLoading={diffLoading}
            errorType={
              fileData && !fileData.ok
                ? (fileData.error as 'file-too-large' | 'binary-file')
                : undefined
            }
          />
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            Select a file to view
          </div>
        )}
      </div>
    </div>
  );
}
