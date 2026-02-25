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
import { FileTree, type FileTreeHandle } from '@/features/041-file-browser/components/file-tree';
import {
  FileViewerPanel,
  type ViewerMode,
} from '@/features/041-file-browser/components/file-viewer-panel';
import { useClipboard } from '@/features/041-file-browser/hooks/use-clipboard';
import { useFileNavigation } from '@/features/041-file-browser/hooks/use-file-navigation';
import { usePanelState } from '@/features/041-file-browser/hooks/use-panel-state';
import { useTreeDirectoryChanges } from '@/features/041-file-browser/hooks/use-tree-directory-changes';
import { useWorkspaceContext } from '@/features/041-file-browser/hooks/use-workspace-context';
import { fileBrowserParams } from '@/features/041-file-browser/params/file-browser.params';
import type { FileEntry } from '@/features/041-file-browser/services/directory-listing';
import { createFilePathHandler } from '@/features/041-file-browser/services/file-path-handler';
import { FileChangeProvider, useFileChanges } from '@/features/045-live-file-events';
import {
  type BarContext,
  ExplorerPanel,
  type ExplorerPanelHandle,
  LeftPanel,
  MainPanel,
  PanelShell,
  createSymbolSearchStub,
} from '@/features/_platform/panel-layout';
import type { PanelMode } from '@/features/_platform/panel-layout';
import { useSDK, useSDKMru } from '@/lib/sdk/sdk-provider';
import { FileDiff, GitBranch } from 'lucide-react';
import { useQueryStates } from 'nuqs';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
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
  worktreeBranch?: string;
  isGit: boolean;
  initialEntries: FileEntry[];
}

export function BrowserClient({
  slug,
  worktreePath,
  worktreeBranch,
  isGit,
  initialEntries,
}: BrowserClientProps) {
  return (
    <FileChangeProvider worktreePath={worktreePath}>
      <BrowserClientInner
        slug={slug}
        worktreePath={worktreePath}
        worktreeBranch={worktreeBranch}
        isGit={isGit}
        initialEntries={initialEntries}
      />
    </FileChangeProvider>
  );
}

function BrowserClientInner({
  slug,
  worktreePath,
  worktreeBranch,
  isGit,
  initialEntries,
}: BrowserClientProps) {
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
    setUrlFile: (file) => setParams({ file }, { history: 'push' }),
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

  // --- Workspace attention context (Phase 5) ---
  const wsCtx = useWorkspaceContext();

  // Set worktree identity for tab title (Subtask 001)
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional — only re-run on worktree change, not context ref
  useEffect(() => {
    if (worktreeBranch) {
      wsCtx?.setWorktreeIdentity({
        worktreePath,
        branch: worktreeBranch,
        pageTitle: 'Browser',
      });
    }
    return () => wsCtx?.setWorktreeIdentity(null);
  }, [worktreePath, worktreeBranch]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- Live file events (Plan 045) ---

  const treeRef = useRef<FileTreeHandle>(null);
  const [trackedExpandedDirs, setTrackedExpandedDirs] = useState<string[]>([]);

  // T004: Watch current open file for external changes
  const fileChanges = useFileChanges(selectedFile ?? '', { debounce: 100 });

  // T001: Watch expanded directories for tree updates
  const treeChanges = useTreeDirectoryChanges(trackedExpandedDirs);

  // T005: Watch all files for ChangesView auto-refresh (500ms debounce)
  const allChanges = useFileChanges('*', { debounce: 500 });

  // T006: Double-event suppression — 2s window after save
  const suppressedTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const isSuppressed = selectedFile ? suppressedTimersRef.current.has(selectedFile) : false;
  const isDirty = fileNav.editContent != null;

  // Determine if we should show banner vs auto-refresh (DYK #3)
  const externallyChanged = selectedFile ? fileChanges.hasChanges && !isSuppressed : false;

  // Auto-refresh in preview mode or clean edit mode
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional — only trigger on change detection, not every handler reference
  useEffect(() => {
    if (!externallyChanged || !selectedFile) return;
    if (mode === 'preview' || (mode === 'edit' && !isDirty)) {
      fileNav.handleRefreshFile();
      fileChanges.clearChanges();
    }
  }, [externallyChanged, selectedFile, mode, isDirty]);

  // T005: Auto-refresh working changes when any file changes
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional — only trigger on hasChanges flip
  useEffect(() => {
    if (!allChanges.hasChanges) return;
    panelState.handleRefreshChanges();
    allChanges.clearChanges();
  }, [allChanges.hasChanges]);

  // T001: Re-fetch directories that changed in tree
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional — only trigger on hasChanges flip
  useEffect(() => {
    if (!treeChanges.hasChanges) return;
    for (const dir of treeChanges.changedDirs) {
      fileNav.handleRefreshDir(dir);
    }
    treeChanges.clearAll();
  }, [treeChanges.hasChanges]);

  // Phase 5: Sync working changes into WorkspaceContext for tab title attention
  useEffect(() => {
    wsCtx?.setHasChanges(panelState.workingChanges.length > 0);
  }, [panelState.workingChanges.length, wsCtx]);

  // T006: Wrap save to track recently-saved paths for suppression
  const handleSaveWithSuppression = useCallback(
    (content: string) => {
      if (selectedFile) {
        // Clear previous timer for this path if exists (rapid save overlap fix)
        const prev = suppressedTimersRef.current.get(selectedFile);
        if (prev) clearTimeout(prev);
        const timer = setTimeout(() => {
          suppressedTimersRef.current.delete(selectedFile);
        }, 2000);
        suppressedTimersRef.current.set(selectedFile, timer);
      }
      fileNav.handleSave(content);
    },
    [selectedFile, fileNav.handleSave]
  );

  // --- ExplorerPanel handler chain ---

  const filePathHandler = useMemo(() => createFilePathHandler(), []);
  const symbolStub = useMemo(() => createSymbolSearchStub(), []);

  // --- SDK + MRU for command palette ---
  const sdk = useSDK();
  const { mru, recordExecution } = useSDKMru();

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
        // Scroll the target directory into view after React renders expansion
        setTimeout(() => {
          const el = document.querySelector(`[data-tree-path="${CSS.escape(relativePath)}"]`);
          if (el) {
            el.scrollIntoView({ block: 'center', behavior: 'smooth' });
            el.classList.remove('tree-entry-navigated');
            // Force reflow so re-adding the class restarts the animation
            void (el as HTMLElement).offsetWidth;
            el.classList.add('tree-entry-navigated');
          }
        }, 100);
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

  // --- Auto-expand tree to selected file ---
  useEffect(() => {
    if (!selectedFile) return;
    const parts = selectedFile.split('/');
    if (parts.length <= 1) return;
    const ancestors: string[] = [];
    let current = '';
    for (let i = 0; i < parts.length - 1; i++) {
      current = current ? `${current}/${parts[i]}` : parts[i];
      ancestors.push(current);
      fileNav.handleExpand(current);
    }
    setExpandPaths(ancestors);
  }, [selectedFile, fileNav.handleExpand]);

  // --- DYK-P3-05: Register SDK commands via useEffect ---
  // Handlers are closures over explorerRef — must live where the ref lives.

  useEffect(() => {
    const paletteReg = sdk.commands.register({
      id: 'sdk.openCommandPalette',
      title: 'Open Command Palette',
      domain: 'sdk',
      params: z.object({}),
      handler: async () => {
        explorerRef.current?.openPalette();
      },
      icon: 'search',
    });

    // DYK-P4-03: CodeMirror guard is inline in handler, not via context key
    const goToFileReg = sdk.commands.register({
      id: 'file-browser.goToFile',
      title: 'Go to File',
      domain: 'file-browser',
      params: z.object({}),
      handler: async () => {
        const active = document.activeElement;
        if (active?.closest('.cm-editor')) return;
        explorerRef.current?.focusInput();
      },
      icon: 'search',
    });

    return () => {
      paletteReg.dispose();
      goToFileReg.dispose();
    };
  }, [sdk]);

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
            handlers={[symbolStub, filePathHandler]}
            context={barContext}
            onCopy={() => clipboard.copyToClipboard(selectedFile ?? '')}
            placeholder="Type a path or > for commands... (Ctrl+P)"
            sdk={sdk}
            mru={mru}
            onCommandExecute={recordExecution}
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
                  ref={treeRef}
                  entries={initialEntries}
                  selectedFile={selectedFile}
                  changedFiles={panelState.changedFiles}
                  newlyAddedPaths={treeChanges.newPaths}
                  onSelect={fileNav.handleSelect}
                  onExpand={fileNav.handleExpand}
                  childEntries={fileNav.childEntries}
                  expandPaths={expandPaths}
                  onExpandedDirsChange={setTrackedExpandedDirs}
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
                content={
                  fileNav.fileData?.ok && !fileNav.fileData.isBinary
                    ? fileNav.fileData.content
                    : null
                }
                language={
                  fileNav.fileData?.ok && !fileNav.fileData.isBinary
                    ? fileNav.fileData.language
                    : 'text'
                }
                mtime={fileNav.fileData?.ok ? fileNav.fileData.mtime : ''}
                mode={mode}
                onModeChange={fileNav.handleModeChange}
                onSave={handleSaveWithSuppression}
                onRefresh={fileNav.handleRefreshFile}
                editContent={fileNav.editContent}
                onEditChange={fileNav.setEditContent}
                externallyChanged={externallyChanged && (isDirty || mode === 'diff')}
                highlightedHtml={
                  fileNav.fileData?.ok && !fileNav.fileData.isBinary
                    ? fileNav.fileData.highlightedHtml
                    : undefined
                }
                markdownHtml={
                  fileNav.fileData?.ok && !fileNav.fileData.isBinary
                    ? fileNav.fileData.markdownHtml
                    : undefined
                }
                diffData={currentDiff?.diff}
                diffError={currentDiff?.error}
                diffLoading={fileNav.diffLoading}
                isBinary={fileNav.fileData?.ok ? fileNav.fileData.isBinary : false}
                binaryContentType={
                  fileNav.fileData?.ok && fileNav.fileData.isBinary
                    ? fileNav.fileData.contentType
                    : undefined
                }
                binarySize={
                  fileNav.fileData?.ok && fileNav.fileData.isBinary
                    ? fileNav.fileData.size
                    : undefined
                }
                rawFileUrl={
                  selectedFile
                    ? `/api/workspaces/${slug}/files/raw?worktree=${encodeURIComponent(worktreePath)}&file=${encodeURIComponent(selectedFile)}`
                    : undefined
                }
                popOutUrl={
                  selectedFile
                    ? `/workspaces/${slug}/browser?worktree=${encodeURIComponent(worktreePath)}&file=${encodeURIComponent(selectedFile)}&mode=${mode}`
                    : undefined
                }
                errorType={
                  fileNav.fileData && !fileNav.fileData.ok
                    ? (fileNav.fileData.error as 'file-too-large')
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
