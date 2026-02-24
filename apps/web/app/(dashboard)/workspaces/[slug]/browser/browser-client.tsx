'use client';

/**
 * BrowserClient — Client-side file browser shell.
 *
 * Thin render layer composing PanelShell with extracted hooks.
 * DYK-P3-05: Custom hooks for related state + effects.
 *
 * Phase 3: Wire Into BrowserClient — Plan 043
 */

import { ChangesView } from '@/features/041-file-browser/components/changes-view';
import { FileTree } from '@/features/041-file-browser/components/file-tree';
import {
  FileViewerPanel,
  type ViewerMode,
} from '@/features/041-file-browser/components/file-viewer-panel';
import { useClipboard } from '@/features/041-file-browser/hooks/use-clipboard';
import { useFileNavigation } from '@/features/041-file-browser/hooks/use-file-navigation';
import { usePanelState } from '@/features/041-file-browser/hooks/use-panel-state';
import { fileBrowserParams } from '@/features/041-file-browser/params/file-browser.params';
import type { FileEntry } from '@/features/041-file-browser/services/directory-listing';
import { createFilePathHandler } from '@/features/041-file-browser/services/file-path-handler';
import {
  type BarContext,
  ExplorerPanel,
  type ExplorerPanelHandle,
  LeftPanel,
  MainPanel,
  PanelShell,
} from '@/features/_platform/panel-layout';
import type { PanelMode } from '@/features/_platform/panel-layout';
import { FileDiff, GitBranch } from 'lucide-react';
import { useQueryStates } from 'nuqs';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  fetchChangedFiles,
  fetchGitDiff,
  fetchRecentFiles,
  fetchWorkingChanges,
  fileExists,
  pathExists,
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
  const explorerRef = useRef<ExplorerPanelHandle>(null);
  const [expandPaths, setExpandPaths] = useState<string[]>([]);

  const mode = (params.mode as ViewerMode) || 'preview';
  const selectedFile = params.file || undefined;
  const panelMode = (params.panel as PanelMode) || 'tree';

  // --- Hooks ---

  const fileNav = useFileNavigation({
    slug,
    worktreePath,
    isGit,
    initialFile: selectedFile,
    readFile,
    saveFile,
    fetchGitDiff,
    setUrlFile: (file) => setParams({ file }),
    setUrlMode: (m) => setParams({ mode: m as 'edit' | 'preview' | 'diff' }),
  });

  const panelState = usePanelState({
    isGit,
    worktreePath,
    panel: panelMode,
    setUrlPanel: (p) => setParams({ panel: p }),
    fetchWorkingChanges,
    fetchRecentFiles,
    fetchChangedFiles,
  });

  const clipboard = useClipboard({ slug, worktreePath, readFile });

  // --- ExplorerPanel handler chain ---

  const filePathHandler = useMemo(() => createFilePathHandler(), []);

  const barContext: BarContext = useMemo(
    () => ({
      slug,
      worktreePath,
      fileExists: (relativePath: string) => fileExists(slug, worktreePath, relativePath),
      pathExists: (relativePath: string) => pathExists(slug, worktreePath, relativePath),
      navigateToFile: (relativePath: string) => fileNav.handleSelect(relativePath),
      navigateToDirectory: (relativePath: string) => {
        // Expand all ancestors + the directory itself
        const parts = relativePath.split('/');
        const paths: string[] = [];
        let current = '';
        for (let i = 0; i < parts.length; i++) {
          current = current ? `${current}/${parts[i]}` : parts[i];
          paths.push(current);
          fileNav.handleExpand(current);
        }
        // Tell FileTree to visually expand these paths
        setExpandPaths(paths);
        // Switch to tree mode if in changes mode
        if (panelMode !== 'tree') {
          panelState.handlePanelModeChange('tree');
        }
      },
      showError: (message: string) => {
        toast.error(message);
      },
    }),
    [
      slug,
      worktreePath,
      fileNav.handleSelect,
      fileNav.handleExpand,
      panelMode,
      panelState.handlePanelModeChange,
    ]
  );

  // --- Ctrl+P / Cmd+P keyboard shortcut (DYK-P3-04) ---

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isMac = navigator.platform.includes('Mac');
      const modifier = isMac ? e.metaKey : e.ctrlKey;
      if (modifier && e.key === 'p') {
        // Don't capture when CodeMirror has focus
        const active = document.activeElement;
        if (active?.closest('.cm-editor')) return;
        e.preventDefault();
        explorerRef.current?.focusInput();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  // --- Panel refresh handler ---

  const handlePanelRefresh = useCallback(() => {
    if (panelMode === 'tree') {
      fileNav.handleRefresh();
    } else {
      panelState.handleRefreshChanges();
    }
  }, [panelMode, fileNav.handleRefresh, panelState.handleRefreshChanges]);

  // --- Current diff ---

  const currentDiff = selectedFile ? fileNav.diffCache[selectedFile] : undefined;

  // --- Left panel mode icons ---

  const panelModes = panelState.panelModes.map((m) => ({
    ...m,
    icon:
      m.key === 'tree' ? (
        <GitBranch className="h-3.5 w-3.5" />
      ) : (
        <FileDiff className="h-3.5 w-3.5" />
      ),
  }));

  // --- Render ---

  return (
    <div className="h-[calc(100vh-4rem)] overflow-hidden">
      <PanelShell
        explorer={
          <ExplorerPanel
            ref={explorerRef}
            filePath={selectedFile ?? ''}
            handlers={[filePathHandler]}
            context={barContext}
            onCopy={() => clipboard.copyToClipboard(selectedFile ?? '')}
            placeholder="Type or paste a file path... (Ctrl+P)"
          />
        }
        left={
          <LeftPanel
            mode={panelMode}
            onModeChange={panelState.handlePanelModeChange}
            modes={panelModes}
            onRefresh={handlePanelRefresh}
          >
            {{
              tree: (
                <FileTree
                  entries={initialEntries}
                  selectedFile={selectedFile}
                  changedFiles={panelState.changedFiles}
                  onSelect={fileNav.handleSelect}
                  onExpand={fileNav.handleExpand}
                  childEntries={fileNav.childEntries}
                  expandPaths={expandPaths}
                  onCopyFullPath={clipboard.handleCopyFullPath}
                  onCopyRelativePath={clipboard.handleCopyRelativePath}
                  onCopyContent={clipboard.handleCopyContent}
                  onCopyTree={clipboard.handleCopyTree}
                  onDownload={clipboard.handleDownload}
                />
              ),
              changes: (
                <ChangesView
                  workingChanges={panelState.workingChanges}
                  recentFiles={panelState.recentFiles}
                  selectedFile={selectedFile}
                  onSelect={fileNav.handleSelect}
                  onCopyFullPath={clipboard.handleCopyFullPath}
                  onCopyRelativePath={clipboard.handleCopyRelativePath}
                  onCopyContent={clipboard.handleCopyContent}
                  onDownload={clipboard.handleDownload}
                />
              ),
            }}
          </LeftPanel>
        }
        main={
          <MainPanel>
            {selectedFile ? (
              <FileViewerPanel
                filePath={selectedFile}
                content={fileNav.fileData?.ok ? fileNav.fileData.content : null}
                language={fileNav.fileData?.ok ? fileNav.fileData.language : 'text'}
                mtime={fileNav.fileData?.ok ? fileNav.fileData.mtime : ''}
                mode={mode}
                onModeChange={fileNav.handleModeChange}
                onSave={fileNav.handleSave}
                onRefresh={fileNav.handleRefreshFile}
                editContent={fileNav.editContent}
                onEditChange={fileNav.setEditContent}
                highlightedHtml={
                  fileNav.fileData?.ok ? fileNav.fileData.highlightedHtml : undefined
                }
                markdownHtml={fileNav.fileData?.ok ? fileNav.fileData.markdownHtml : undefined}
                diffData={currentDiff?.diff}
                diffError={currentDiff?.error}
                diffLoading={fileNav.diffLoading}
                errorType={
                  fileNav.fileData && !fileNav.fileData.ok
                    ? (fileNav.fileData.error as 'file-too-large' | 'binary-file')
                    : undefined
                }
              />
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                Select a file to view
              </div>
            )}
          </MainPanel>
        }
      />
    </div>
  );
}
