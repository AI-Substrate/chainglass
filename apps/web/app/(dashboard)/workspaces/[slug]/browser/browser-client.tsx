'use client';

/**
 * BrowserClient — Client-side file browser shell.
 *
 * Manages URL state (file, dir, mode, changed), fetches subdirectories
 * on expand, reads files on selection, and renders FileTree + FileViewerPanel.
 *
 * Phase 4: File Browser — Plan 041
 */

import { FileTree } from '@/features/041-file-browser/components/file-tree';
import {
  FileViewerPanel,
  type ViewerMode,
} from '@/features/041-file-browser/components/file-viewer-panel';
import { fileBrowserParams } from '@/features/041-file-browser/params/file-browser.params';
import type { FileEntry } from '@/features/041-file-browser/services/directory-listing';
import type { ReadFileResult } from '@/features/041-file-browser/services/file-actions';
import { useQueryStates } from 'nuqs';
import { useCallback, useEffect, useState } from 'react';
import { readFile, saveFile } from '../../../../actions/file-actions';

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

  const mode = (params.mode as ViewerMode) || 'preview';
  const selectedFile = params.file || undefined;

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
      setParams({ file: filePath });
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
    [setParams, slug, worktreePath]
  );

  // Auto-expand tree to show selected file on mount
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional mount-only effect
  useEffect(() => {
    if (params.file) {
      // Expand all parent directories of the selected file
      const parts = params.file.split('/');
      let current = '';
      for (let i = 0; i < parts.length - 1; i++) {
        current = current ? `${current}/${parts[i]}` : parts[i];
        handleExpand(current);
      }
      // Load the file content
      if (!fileData) {
        handleSelect(params.file);
      }
    }
  }, []);

  // Change viewer mode
  const handleModeChange = useCallback(
    (newMode: ViewerMode) => {
      setParams({ mode: newMode });
    },
    [setParams]
  );

  // Refresh file tree
  const handleRefresh = useCallback(() => {
    setChildEntries({});
    window.location.reload();
  }, []);

  // Save file
  const handleSave = useCallback(
    async (content: string) => {
      if (!selectedFile || !fileData?.ok) return;
      try {
        const result = await saveFile(slug, worktreePath, selectedFile, content, fileData.mtime);
        if (result.ok) {
          // Re-read to get new mtime
          const refreshed = await readFile(slug, worktreePath, selectedFile);
          setFileData(refreshed);
          if (refreshed.ok) setEditContent(refreshed.content);
        } else {
          setFileData({ ...fileData }); // trigger re-render
          // Conflict handled by FileViewerPanel via conflictError prop
        }
      } catch (error) {
        console.error('Failed to save file:', error);
      }
    },
    [slug, worktreePath, selectedFile, fileData]
  );

  // Refresh current file
  const handleRefreshFile = useCallback(async () => {
    if (!selectedFile) return;
    const result = await readFile(slug, worktreePath, selectedFile);
    setFileData(result);
    if (result.ok) setEditContent(result.content);
  }, [slug, worktreePath, selectedFile]);

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
