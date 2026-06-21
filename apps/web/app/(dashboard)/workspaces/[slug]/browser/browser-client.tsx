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
import { ContentEmptyState } from '@/features/041-file-browser/components/content-empty-state';
import { FileTree, type FileTreeHandle } from '@/features/041-file-browser/components/file-tree';
import {
  FileViewerPanel,
  type ViewerMode,
} from '@/features/041-file-browser/components/file-viewer-panel';
import { FolderPreviewPanel } from '@/features/041-file-browser/components/folder-preview-panel';
import { SplitTerminalToggleButton } from '@/features/041-file-browser/components/split-terminal-toggle-button';
import { useClipboard } from '@/features/041-file-browser/hooks/use-clipboard';
import { useFileFilter } from '@/features/041-file-browser/hooks/use-file-filter';
import { useFileMutations } from '@/features/041-file-browser/hooks/use-file-mutations';
import { useFileNavigation } from '@/features/041-file-browser/hooks/use-file-navigation';
import { useFlowspaceSearch } from '@/features/041-file-browser/hooks/use-flowspace-search';
import { useGitGrepSearch } from '@/features/041-file-browser/hooks/use-git-grep-search';
import { useLegacyModeCoercion } from '@/features/041-file-browser/hooks/use-legacy-mode-coercion';
import { usePanelState } from '@/features/041-file-browser/hooks/use-panel-state';
import { useTreeDirectoryChanges } from '@/features/041-file-browser/hooks/use-tree-directory-changes';
import { useWorkspaceContext } from '@/features/041-file-browser/hooks/use-workspace-context';
import { fileBrowserParams } from '@/features/041-file-browser/params/file-browser.params';
import { fileBrowserContribution } from '@/features/041-file-browser/sdk/contribution';
import type { FileEntry } from '@/features/041-file-browser/services/directory-listing';
import { createFilePathHandler } from '@/features/041-file-browser/services/file-path-handler';
import { FileChangeProvider, useFileChanges } from '@/features/045-live-file-events';
import { sanitizeSessionName } from '@/features/064-terminal';
import { TerminalSplitPane } from '@/features/064-terminal/components/terminal-split-pane';
import { TerminalView } from '@/features/064-terminal/components/terminal-view';
import { useTerminalOverlay } from '@/features/064-terminal/hooks/use-terminal-overlay';
import { useTerminalSessions } from '@/features/064-terminal/hooks/use-terminal-sessions';
import { resolveSplitSession } from '@/features/064-terminal/lib/resolve-split-session';
import { sessionNameFromWorktreePath } from '@/features/064-terminal/lib/session-name-from-worktree-path';
import { QuestionPopperIndicator } from '@/features/067-question-popper/components/question-popper-indicator';
import { useNotesOverlay } from '@/features/071-file-notes/hooks/use-notes-overlay';
import { remoteViewParams } from '@/features/088-remote-view/params/remote-view.params';
import type { RepoInfo as RepoInfoPayload } from '@/features/_platform/git';
import {
  type BarContext,
  ExplorerPanel,
  type ExplorerPanelHandle,
  LeftPanel,
  MainPanel,
  MobileSearchOverlay,
  PanelShell,
} from '@/features/_platform/panel-layout';
import type { PanelMode } from '@/features/_platform/panel-layout';
import { useSDK, useSDKMru } from '@/lib/sdk/sdk-provider';
import { restartFlowspaceAction } from '@/lib/server/flowspace-search-action';
import { GlobalStateConnector } from '@/lib/state';
import {
  FileDiff,
  FileText,
  FolderOpen,
  GitBranch,
  History,
  Search,
  StickyNote,
  TerminalSquare,
} from 'lucide-react';
import dynamic from 'next/dynamic';
import { useQueryStates } from 'nuqs';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import {
  createFile,
  createFolder,
  deleteItem,
  fetchChangedFiles,
  fetchDiffStats,
  fetchFileList,
  fetchGitDiff,
  fetchRecentFiles,
  fetchWorkingChanges,
  fileExists,
  pathExists,
  readFile,
  renameItem,
  saveFile,
} from '../../../../actions/file-actions';
import { saveEditedImage } from '../../../../actions/image-actions';
import { fetchFilesWithNotes } from '../../../../actions/notes-actions';

// Plan recent-changes-feed T003: lazy-load the feed view so its primitives
// (Shiki excerpts, virtualized list) only ship when the user opens the feed.
const RecentFeedView = dynamic(
  () =>
    import('@/features/041-file-browser/components/recent-feed/recent-feed-view').then(
      (m) => m.RecentFeedView
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
        Recent changes feed — loading…
      </div>
    ),
  }
);

// Plan 088 Phase 3: lazy-load the remote-view panel so the WebCodecs/canvas
// primitives only ship when the user opens `view=remote` (AC-13 bundle guard).
const RemoteViewPanel = dynamic(
  () =>
    import('@/features/088-remote-view/components/remote-view-panel').then(
      (m) => m.RemoteViewPanel
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
        Remote view — loading…
      </div>
    ),
  }
);

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
      <GlobalStateConnector slug={slug} worktreeBranch={worktreeBranch} />
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
  const [params, setParams] = useQueryStates({ ...fileBrowserParams, ...remoteViewParams });
  const explorerRef = useRef<ExplorerPanelHandle>(null);
  const [expandPaths, setExpandPaths] = useState<string[]>([]);
  const lastFileSelectionRef = useRef<{ filePath: string; at: number } | null>(null);

  // FX002: Mobile view index from URL param (for terminal redirect landing)
  // FX004: Auto-switch to Content (1) when file param present and mobileView absent
  const [mobileActiveIndex, setMobileActiveIndex] = useState(() => {
    if (typeof window === 'undefined') return 0;
    const search = new URLSearchParams(window.location.search);
    const raw = search.get('mobileView');
    if (raw != null) {
      const parsed = Number.parseInt(raw, 10);
      return Number.isNaN(parsed) ? 0 : Math.max(0, Math.min(parsed, 2));
    }
    // FX004: If a file is selected via URL but no explicit mobileView,
    // auto-switch to Content tab so the viewer is visible.
    const fileParam = search.get('file');
    if (fileParam) return 1;
    return 0;
  });

  // Phase 3 T005: Explorer Sheet state (controlled open/close)
  const [explorerSheetOpen, setExplorerSheetOpen] = useState(false);
  // Plan 084 split-terminal-view T006 / FX012: session-only toggle for the
  // inline terminal split. Reset on reload (C-07). No SDK setting, no URL
  // mirror. FX012 renames the boolean to `splitOn` and threads the floating
  // overlay's open/close API through the toggle handler so transitions
  // between Mode A (today: float + viewer share the main slot) and Mode B
  // (inline split: viewer ⅔ + terminal ⅓) are coherent. Backtick in Mode B
  // exits to Mode A with the float open — see the capture-phase listener
  // below.
  const [splitOn, setSplitOn] = useState(false);
  const overlay = useTerminalOverlay();

  // DYK-P3-01: Wrap server prop in state for client-side root refresh
  const [rootEntries, setRootEntries] = useState(initialEntries);

  // T006: Local new paths for immediate green animation before SSE fires
  const [localNewPaths, setLocalNewPaths] = useState<Set<string>>(new Set());

  // Plan 084 FX007 — repo-info for "Copy URL" right-click menu items.
  // null = either still loading or no remote / unknown host (item hides).
  // Refetched on every [slug, worktreePath] change (worktree-switch refetch
  // per finding 13 / AC20). Companion review F002: clear synchronously at
  // effect start so menu items hide during the switch — otherwise a fast
  // right-click after switching worktrees would copy URLs built from the
  // *previous* worktree's branch/SHA.
  const [repoInfo, setRepoInfo] = useState<RepoInfoPayload | null>(null);
  useEffect(() => {
    let cancelled = false;
    setRepoInfo(null);
    const url = `/api/workspaces/${encodeURIComponent(slug)}/repo-info?worktree=${encodeURIComponent(worktreePath)}`;
    fetch(url)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: RepoInfoPayload | null) => {
        if (!cancelled) setRepoInfo(data ?? null);
      })
      .catch(() => {
        if (!cancelled) setRepoInfo(null);
      });
    return () => {
      cancelled = true;
    };
  }, [slug, worktreePath]);

  // FT-003: Re-sync root state when worktree changes (e.g. ?worktree= switch)
  useEffect(() => {
    setRootEntries(initialEntries);
    setLocalNewPaths(new Set());
    setExpandPaths([]);
  }, [initialEntries]);

  const mode = (params.mode as ViewerMode) || 'preview';
  const selectedFile = params.file || undefined;
  const currentDir = params.dir || '';
  const panelMode = (params.panel as PanelMode) || 'tree';
  const scrollToLine = params.line ?? null;
  // Plan recent-changes-feed T003: main-panel view selector (Finding 07 — branch BEFORE
  // selectedFile/currentDir so closing the feed restores the user's prior state).
  const view = params.view; // 'recent-feed' | null

  // Mobile tab index ↔ view sync. The History tab (index 3) is bound to
  // `view=recent-feed` so deep-links and entrypoints (Cmd-palette command,
  // explorer-bar History button, openOnLaunch setting) flip the active
  // tab on mobile. Conversely, swiping/tapping into the History tab
  // sets the URL param so the desktop main pane mirrors the choice.
  useEffect(() => {
    if (view === 'recent-feed' && mobileActiveIndex !== 3) {
      setMobileActiveIndex(3);
    }
  }, [view, mobileActiveIndex]);

  const handleMobileViewChange = useCallback(
    (idx: number) => {
      setMobileActiveIndex(idx);
      // Activating History tab → publish `view=recent-feed` to the URL.
      // Leaving History → clear the param (unless we're still on the
      // recent-feed view via desktop URL, which only happens if the
      // user explicitly typed it — in which case the next click clears).
      if (idx === 3 && view !== 'recent-feed') {
        setParams({ view: 'recent-feed' }, { history: 'replace' });
      } else if (idx !== 3 && view === 'recent-feed') {
        setParams({ view: null }, { history: 'replace' });
      }
    },
    [view, setParams]
  );
  const handleCloseRecentFeed = useCallback(() => {
    setParams({ view: null }, { history: 'push' });
  }, [setParams]);

  // Plan 083 Phase 5 T002: legacy mode alias coercion. Runs BEFORE the scrollToLine effect so
  // `?mode=edit&line=42` first normalizes to `?mode=source`, then scrollToLine sees `source`
  // and no-ops (no thrash). Remove after 1 release.
  useLegacyModeCoercion(params.mode, setParams);

  // FT-005: Auto-switch to source mode when line param is present (preview can't scroll).
  // Guard widened to `!source && !rich` so Rich-mode users aren't flipped back to Source by
  // a late `line` param (plan 083 Phase 5 C1 race guard).
  useEffect(() => {
    if (scrollToLine != null && scrollToLine > 0 && mode !== 'source' && mode !== 'rich') {
      setParams({ mode: 'source' }, { history: 'replace' });
    }
  }, [scrollToLine, mode, setParams]);

  // --- Hooks ---

  const fileNav = useFileNavigation({
    slug,
    worktreePath,
    isGit,
    initialFile: selectedFile,
    readFile,
    saveFile,
    fetchGitDiff,
    setUrlFile: (file) => setParams({ file, line: null }, { history: 'push' }),
    setUrlMode: (m) => setParams({ mode: m as 'source' | 'rich' | 'preview' | 'diff' }),
  });

  const panelState = usePanelState({
    isGit,
    worktreePath,
    panel: panelMode,
    setUrlPanel: (p) => setParams({ panel: p as 'tree' | 'changes' }),
    fetchWorkingChanges,
    fetchRecentFiles,
    fetchChangedFiles,
    fetchDiffStats,
  });

  const clipboard = useClipboard({ slug, worktreePath, readFile, repoInfo });

  // Phase 7 T003: Note file paths for tree indicators (DYK-01, DYK-02)
  const { openModal } = useNotesOverlay();
  const [noteFilePaths, setNoteFilePaths] = useState<Set<string>>(new Set());
  const refreshNoteFilesRef = useRef<(() => Promise<void>) | undefined>(undefined);
  refreshNoteFilesRef.current = useCallback(async () => {
    const result = await fetchFilesWithNotes(worktreePath);
    if (result.ok) {
      setNoteFilePaths(new Set(result.data));
    }
  }, [worktreePath]);

  // Fetch note file paths on mount
  useEffect(() => {
    refreshNoteFilesRef.current?.();
  }, []);

  // DYK-02: Listen for notes:changed to refresh immediately after CRUD
  useEffect(() => {
    const handler = () => {
      refreshNoteFilesRef.current?.();
    };
    window.addEventListener('notes:changed', handler);
    return () => window.removeEventListener('notes:changed', handler);
  }, []);

  // "Add Note" from tree context menu (DYK-01: direct hook call)
  const handleAddNote = useCallback(
    (filePath: string) => {
      openModal({ target: filePath });
    },
    [openModal]
  );

  // Phase 7 T004: "Has notes" filter toggle (DYK-03: ancestor directory preservation)
  const [showOnlyWithNotes, setShowOnlyWithNotes] = useState(false);

  // FT-002: Auto-reset filter when all notes are cleared
  useEffect(() => {
    if (showOnlyWithNotes && noteFilePaths.size === 0) {
      setShowOnlyWithNotes(false);
    }
  }, [showOnlyWithNotes, noteFilePaths.size]);

  // Build ancestor directory paths from noteFilePaths for tree filtering
  const noteAncestorPaths = useMemo(() => {
    if (!showOnlyWithNotes || noteFilePaths.size === 0) return new Set<string>();
    const ancestors = new Set<string>();
    for (const filePath of noteFilePaths) {
      const parts = filePath.split('/');
      let current = '';
      for (let i = 0; i < parts.length - 1; i++) {
        current = current ? `${current}/${parts[i]}` : parts[i];
        ancestors.add(current);
      }
    }
    return ancestors;
  }, [showOnlyWithNotes, noteFilePaths]);

  // Filter entries for tree display when notes filter is active
  const filteredRootEntries = useMemo(() => {
    if (!showOnlyWithNotes) return rootEntries;
    return rootEntries.filter((entry) =>
      entry.type === 'directory' ? noteAncestorPaths.has(entry.path) : noteFilePaths.has(entry.path)
    );
  }, [showOnlyWithNotes, rootEntries, noteAncestorPaths, noteFilePaths]);

  // Filter child entries when notes filter is active
  const filteredChildEntries = useMemo(() => {
    if (!showOnlyWithNotes) return fileNav.childEntries;
    const filtered: Record<string, FileEntry[]> = {};
    for (const [dir, children] of Object.entries(fileNav.childEntries)) {
      filtered[dir] = children.filter((entry) =>
        entry.type === 'directory'
          ? noteAncestorPaths.has(entry.path)
          : noteFilePaths.has(entry.path)
      );
    }
    return filtered;
  }, [showOnlyWithNotes, fileNav.childEntries, noteAncestorPaths, noteFilePaths]);

  // --- File CRUD mutations (Plan 068 Phase 3) ---

  // DYK-P3-01: Refresh root entries from API (initialEntries is a server prop)
  const handleRefreshRoot = useCallback(async () => {
    try {
      const url = `/api/workspaces/${slug}/files?worktree=${encodeURIComponent(worktreePath)}&dir=`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setRootEntries(data.entries);
      }
    } catch {
      // Silent failure — SSE will eventually catch up
    }
  }, [slug, worktreePath]);

  const mutations = useFileMutations({
    slug,
    worktreePath,
    refreshDir: fileNav.handleRefreshDir,
    refreshRoot: handleRefreshRoot,
    actions: { createFile, createFolder, deleteItem, renameItem },
  });

  // T006: Add path to local new paths with auto-cleanup (1.5s matches CSS animation)
  const addNewlyCreatedPath = useCallback((path: string) => {
    setLocalNewPaths((prev) => {
      const next = new Set(prev);
      next.add(path);
      return next;
    });
    setTimeout(() => {
      setLocalNewPaths((prev) => {
        const next = new Set(prev);
        next.delete(path);
        return next;
      });
    }, 1500);
  }, []);

  // T002+T007: Create file → toast + refresh + auto-select in viewer
  const handleTreeCreateFile = useCallback(
    async (parentDir: string, name: string) => {
      const result = await mutations.handleCreateFile(parentDir, name);
      if (result?.ok) {
        const newPath = result.path;
        addNewlyCreatedPath(newPath);
        fileNav.handleSelect(newPath);
      }
    },
    [mutations.handleCreateFile, addNewlyCreatedPath, fileNav.handleSelect]
  );

  // T002+T007: Create folder → toast + refresh + auto-expand
  const handleTreeCreateFolder = useCallback(
    async (parentDir: string, name: string) => {
      const result = await mutations.handleCreateFolder(parentDir, name);
      if (result?.ok) {
        const newPath = result.path;
        addNewlyCreatedPath(newPath);
        setExpandPaths([newPath]);
      }
    },
    [mutations.handleCreateFolder, addNewlyCreatedPath]
  );

  // T002+T003: Rename → toast + refresh + URL sync for open file (DYK-P3-02)
  // FT-001: skipNextFileRead prevents URL-change effect from overwriting dirty buffer
  // FT-002: Only auto-select for files; for folders, just update expansion state
  const handleTreeRename = useCallback(
    async (oldPath: string, newName: string, type: 'file' | 'directory') => {
      const result = await mutations.handleRename(oldPath, newName);
      if (result?.ok) {
        if (type === 'file' && selectedFile === oldPath) {
          fileNav.skipNextFileRead();
          setParams({ file: result.newPath, line: null }, { history: 'replace' });
        } else if (type === 'file') {
          fileNav.handleSelect(result.newPath);
        } else {
          // Folder rename: update expansion state, don't touch file viewer
          setExpandPaths((prev) => prev.map((p) => (p === oldPath ? result.newPath : p)));
        }
      }
    },
    [
      mutations.handleRename,
      selectedFile,
      setParams,
      fileNav.handleSelect,
      fileNav.skipNextFileRead,
    ]
  );

  // T002+T004: Delete → toast + refresh + clear selection if needed (DYK-P3-03)
  const handleTreeDelete = useCallback(
    async (path: string) => {
      const result = await mutations.handleDelete(path);
      if (result?.ok && selectedFile) {
        // DYK-P3-03: Trailing slash prevents false prefix matches
        if (selectedFile === path || selectedFile.startsWith(`${path}/`)) {
          setParams({ file: '', line: null }, { history: 'replace' });
        }
      }
    },
    [mutations.handleDelete, selectedFile, setParams]
  );

  // --- File search filter (Plan 049 Feature 2) ---
  const fileFilter = useFileFilter({ worktreePath, fetchFileList });

  // --- FlowSpace semantic search (Plan 051) ---
  const flowspace = useFlowspaceSearch(worktreePath);

  // --- Git grep content search (Plan 052) ---
  const gitGrep = useGitGrepSearch(worktreePath);

  // Track which code search engine is active: # → grep, $ → semantic
  const [activeCodeSearchMode, setActiveCodeSearchMode] = useState<'grep' | 'semantic'>('grep');

  // --- Workspace attention context (Phase 5) ---
  const wsCtx = useWorkspaceContext();
  const terminalTheme = wsCtx?.worktreeIdentity?.terminalTheme || 'dark';

  // FX002: Terminal sessions for 3rd mobile view
  // FX006: pass worktreePath so the auto-pick prefers the worktree-folder
  // session (e.g. higgs-jordo) over the branch-name fallback (e.g. main).
  const {
    sessions: termSessions,
    loading: termLoading,
    selectedSession: termSelectedSession,
  } = useTerminalSessions({
    currentBranch: sanitizeSessionName(worktreeBranch ?? ''),
    worktreePath,
  });

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
  }, [worktreePath, worktreeBranch]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- Live file events (Plan 045) ---

  const treeRef = useRef<FileTreeHandle>(null);
  const [trackedExpandedDirs, setTrackedExpandedDirs] = useState<string[]>([]);
  const trackedExpandedDirsRef = useRef<string[]>([]);
  // Plan 077: Guard against programmatic expansion updating dir param
  const isProgrammaticExpansionRef = useRef(false);
  // Set synchronously when starting a "New File/Folder" auto-expands a collapsed
  // folder. The matching onExpandedDirsChange then skips publishing ?dir= so the
  // create doesn't hijack the main panel into folder-preview / close the open file.
  // Race-free: consumed by path match, not by timing.
  const pendingCreateExpandRef = useRef<string | null>(null);
  const handleTreeCreateAutoExpand = useCallback((parentDir: string) => {
    pendingCreateExpandRef.current = parentDir;
  }, []);

  // Plan 077: track last-expanded folder to show gallery in viewer panel.
  // A user-initiated folder click publishes `?dir=` AND clears `?file=` so the
  // main panel's precedence (selectedFile → FileViewer, else currentDir →
  // FolderPreview) falls through to FolderPreviewPanel. Without clearing the
  // file param a leftover `?file=` would keep the previous file viewer
  // mounted and the folder gallery would never appear.
  //
  // We must NOT fire `?dir=<ancestor>&file=''` when the newly-expanded dir
  // is just an ancestor of the currently-selected file (e.g., the
  // auto-expand effect at use-file-navigation.ts ran because a recent-feed
  // card click navigated into a deep directory). Two stacked guards:
  //   1. `isProgrammaticExpansionRef` (instant, but the rAF reset can lose
  //      the flag before the tree's onExpandedDirsChange callback fires).
  //   2. Ancestor check against `selectedFile` — robust against the timing
  //      race; if the dir is on the file's ancestor path, the expansion
  //      came from the auto-expand effect and isn't a user gesture.
  //
  // Single handler used by both desktop and mobile trees. Prior to this fix
  // the desktop variant omitted `file: ''`, which (per Plan 077 e5f945cf)
  // broke folder-view rendering whenever a file was already selected.
  const handleExpandedDirsChange = useCallback(
    (dirs: string[]) => {
      const oldSet = new Set(trackedExpandedDirsRef.current);
      const newlyExpanded = dirs.find((d) => !oldSet.has(d));
      trackedExpandedDirsRef.current = dirs;
      setTrackedExpandedDirs(dirs);

      if (!newlyExpanded) return;
      // Create-driven auto-expand: keep the current view, don't open the folder
      // gallery or wipe the open file. Consume the marker so a later genuine
      // click on the same folder still publishes ?dir=.
      if (pendingCreateExpandRef.current === newlyExpanded) {
        pendingCreateExpandRef.current = null;
        return;
      }
      if (isProgrammaticExpansionRef.current) return;
      if (selectedFile) {
        const ancestorPrefix = `${newlyExpanded}/`;
        if (selectedFile === newlyExpanded || selectedFile.startsWith(ancestorPrefix)) {
          // Auto-expand for selected file — don't republish dir or wipe file.
          return;
        }
      }
      setParams({ dir: newlyExpanded, file: '' }, { history: 'push' });
    },
    [setParams, selectedFile]
  );

  // T004: Watch current open file for external changes
  const fileChanges = useFileChanges(selectedFile ?? '', { debounce: 100 });

  // T001: Watch expanded directories for tree updates
  const treeChanges = useTreeDirectoryChanges(trackedExpandedDirs);

  // T006: Merge local + SSE-driven new paths for green animation
  const combinedNewPaths = useMemo(() => {
    if (localNewPaths.size === 0) return treeChanges.glowPaths;
    const combined = new Set(treeChanges.glowPaths);
    for (const p of localNewPaths) combined.add(p);
    return combined;
  }, [treeChanges.glowPaths, localNewPaths]);

  // T005: Watch all files for ChangesView auto-refresh (500ms debounce)
  const allChanges = useFileChanges('*', { debounce: 500 });

  // T006: Double-event suppression — 2s window after save
  const suppressedTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const isSuppressed = selectedFile ? suppressedTimersRef.current.has(selectedFile) : false;
  const isDirty =
    fileNav.editContent != null &&
    fileNav.fileData?.ok === true &&
    !fileNav.fileData.isBinary &&
    fileNav.editContent !== fileNav.fileData.content;

  // Determine if we should show banner vs auto-refresh (DYK #3)
  const externallyChanged = selectedFile ? fileChanges.hasChanges && !isSuppressed : false;

  // Auto-refresh in preview mode or clean edit mode
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional — only trigger on change detection, not every handler reference
  useEffect(() => {
    if (!externallyChanged || !selectedFile) return;
    if (mode === 'preview' || ((mode === 'source' || mode === 'rich') && !isDirty)) {
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
    async (content: string) => {
      if (selectedFile) {
        // Clear previous timer for this path if exists (rapid save overlap fix)
        const prev = suppressedTimersRef.current.get(selectedFile);
        if (prev) clearTimeout(prev);
        const timer = setTimeout(() => {
          suppressedTimersRef.current.delete(selectedFile);
        }, 2000);
        suppressedTimersRef.current.set(selectedFile, timer);
      }
      return fileNav.handleSave(content);
    },
    [selectedFile, fileNav.handleSave]
  );

  const handleFileDoubleSelect = useCallback(
    async (filePath: string, wasSelected: boolean) => {
      if (mode === 'source' || mode === 'rich') {
        // Double-click fires after click selection. Only toggle back to preview when the
        // interaction started on the already-open file, so save-before-preview is reliable.
        if (!wasSelected || selectedFile !== filePath) {
          return;
        }

        const hasUnsavedChanges =
          fileNav.fileData?.ok &&
          !fileNav.fileData.isBinary &&
          fileNav.editContent !== fileNav.fileData.content;

        if (hasUnsavedChanges) {
          const saved = await handleSaveWithSuppression(fileNav.editContent);
          if (!saved) {
            return;
          }
        }

        await fileNav.handleModeChange('preview');
        return;
      }

      await fileNav.handleModeChange('source');
    },
    [
      mode,
      selectedFile,
      fileNav.fileData,
      fileNav.editContent,
      fileNav.handleModeChange,
      handleSaveWithSuppression,
    ]
  );

  // Wrap file selection to collapse overlays and interpret rapid repeated
  // selection of the same file as a double click. This is more reliable than
  // depending on nested row-level dblclick handlers through wrapper components.
  const handleFileSelect = useCallback(
    async (filePath: string) => {
      // Mobile: always switch to Content view on file tap, even if same file re-selected
      setMobileActiveIndex(1);

      window.dispatchEvent(new CustomEvent('overlay:close-all'));

      // Picking a file from the tree means "show me this file's content";
      // if the recent-changes feed (`view=recent-feed`) is the active main
      // pane, swap it out for the file viewer. Same intent as the
      // overlay:close-all dispatch above (terminal), just for the
      // history view. Also clear `rv` so leaving remote-view mode by picking a file
      // doesn't strand a session param (AC-5 switch-back restores file state).
      setParams({ view: null, rv: null }, { history: 'replace' });

      const wasSelected = selectedFile === filePath;
      const now = Date.now();
      const isDoubleSelect =
        lastFileSelectionRef.current?.filePath === filePath &&
        now - lastFileSelectionRef.current.at < 350;

      lastFileSelectionRef.current = { filePath, at: now };

      if (isDoubleSelect) {
        if (!wasSelected) {
          await fileNav.handleSelect(filePath);
        }
        await handleFileDoubleSelect(filePath, wasSelected);
        return;
      }

      if (wasSelected) {
        return;
      }

      await fileNav.handleSelect(filePath);
    },
    [selectedFile, fileNav.handleSelect, handleFileDoubleSelect, setParams]
  );

  // --- ExplorerPanel handler chain ---

  const filePathHandler = useMemo(
    () =>
      createFilePathHandler((line) => {
        setParams({ line }, { history: 'replace' });
      }),
    [setParams]
  );
  // Plan 051: # stub removed, handled by FlowSpace search in dropdown

  // --- SDK + MRU for command palette ---
  const sdk = useSDK();
  const { mru, recordExecution } = useSDKMru();

  const barContext: BarContext = useMemo(
    () => ({
      slug,
      worktreePath,
      fileExists: (relativePath: string) => fileExists(slug, worktreePath, relativePath),
      pathExists: (relativePath: string) => pathExists(slug, worktreePath, relativePath),
      navigateToFile: (relativePath: string) => handleFileSelect(relativePath),
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
      handleFileSelect,
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
    isProgrammaticExpansionRef.current = true;
    const ancestors: string[] = [];
    let current = '';
    for (let i = 0; i < parts.length - 1; i++) {
      current = current ? `${current}/${parts[i]}` : parts[i];
      ancestors.push(current);
      fileNav.handleExpand(current);
    }
    setExpandPaths(ancestors);
    // Reset flag after FileTree processes the expansion
    requestAnimationFrame(() => {
      isProgrammaticExpansionRef.current = false;
    });
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

    // T001: openFileAtLine — navigates to file and sets line param
    const openFileAtLineCmd = fileBrowserContribution.commands.find(
      (c) => c.id === 'file-browser.openFileAtLine'
    );
    const openFileAtLineReg = openFileAtLineCmd
      ? sdk.commands.register({
          ...openFileAtLineCmd,
          handler: async (params: unknown) => {
            const { path, line } = params as { path: string; line?: number };
            setParams({ file: path, line: line ?? null }, { history: 'push' });
          },
        })
      : null;

    // Plan recent-changes-feed T030: openRecentFeed handler — sets ?view=recent-feed
    // via the live setParams closure. Default keybinding registered in the
    // file-browser contribution: $mod+Shift+KeyU. Also closes the terminal
    // overlay if it's currently popped (the feed and the terminal both want
    // the main panel; closing prevents a stacking order surprise).
    const openRecentFeedCmd = fileBrowserContribution.commands.find(
      (c) => c.id === 'file-browser.openRecentFeed'
    );
    const openRecentFeedReg = openRecentFeedCmd
      ? sdk.commands.register({
          ...openRecentFeedCmd,
          handler: async () => {
            window.dispatchEvent(new CustomEvent('terminal:close'));
            setParams({ view: 'recent-feed' }, { history: 'push' });
          },
        })
      : null;

    // FX001-3: Restart FlowSpace — handler closes over the live worktreePath
    // prop instead of URL-sniffing for `?worktree=`, which dashboard URLs
    // don't carry. Registered here for the same reason as openFileAtLine.
    const restartFlowspaceCmd = fileBrowserContribution.commands.find(
      (c) => c.id === 'file-browser.restartFlowspace'
    );
    const restartFlowspaceReg = restartFlowspaceCmd
      ? sdk.commands.register({
          ...restartFlowspaceCmd,
          handler: async () => {
            try {
              await restartFlowspaceAction(worktreePath);
              sdk.toast.success('FlowSpace restarted — next search will reload the graph');
            } catch (err) {
              sdk.toast.error(`Failed to restart FlowSpace: ${(err as Error).message}`);
            }
          },
        })
      : null;

    return () => {
      paletteReg.dispose();
      goToFileReg.dispose();
      openFileAtLineReg?.dispose();
      openRecentFeedReg?.dispose();
      restartFlowspaceReg?.dispose();
    };
  }, [sdk, setParams, worktreePath]);

  // Plan recent-changes-feed T031: open-on-launch — when the user lands on a
  // workspace browser without a specific file or directory and the
  // `fileBrowser.recentFeed.openOnLaunch` setting is true, show the feed.
  // Uses sdk.settings.get to read the persisted value once on mount; not
  // reactive (the user already opted in — toggling the setting only takes
  // effect on the next workspace load).
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional first-mount-only effect keyed on (slug, worktreePath); params/setParams/sdk are checked imperatively at effect time, not declaratively as deps. See block comment above.
  useEffect(() => {
    if (params.view) return; // already on a view
    if (params.file || params.dir) return; // user already navigated somewhere
    const openOnLaunch = sdk.settings.get('fileBrowser.recentFeed.openOnLaunch') as
      | boolean
      | undefined;
    if (openOnLaunch) {
      setParams({ view: 'recent-feed' }, { history: 'replace' });
    }
  }, [slug, worktreePath]);

  // --- Panel refresh handler ---

  const handlePanelRefresh = useCallback(() => {
    if (panelMode === 'tree') {
      fileNav.handleRefresh();
    } else {
      panelState.handleRefreshChanges();
    }
  }, [panelMode, fileNav.handleRefresh, panelState.handleRefreshChanges]);

  // Persist edited image bytes (Plan 086). Delegates to the saveEditedImage
  // server action; on success refreshes the file so its metadata (incl. mtime)
  // updates. The editor owns the conflict dialog — we just relay the typed
  // outcome (incl. 'conflict') back to it.
  const handleSaveImage = useCallback(
    async (payloadBase64: string, mode: 'overwrite' | 'edited-copy', expectedMtime?: string) => {
      if (!selectedFile) return { ok: false as const, error: 'not-found' };
      const result = await saveEditedImage(
        slug,
        worktreePath,
        selectedFile,
        payloadBase64,
        mode,
        expectedMtime
      );
      if (result.ok) {
        if (mode === 'edited-copy' && result.savedPath && result.savedPath !== selectedFile) {
          // Save as new → navigate to the freshly-created file using the same
          // explorer navigation the file tree uses, so the user lands on it.
          void handleFileSelect(result.savedPath);
        } else {
          // Save over → same path; refresh the file data (the displayed image is
          // cache-busted in BinaryFileView since the URL is otherwise identical).
          fileNav.handleRefreshFile();
        }
        return { ok: true as const };
      }
      return { ok: false as const, error: result.error };
    },
    [slug, worktreePath, selectedFile, fileNav.handleRefreshFile, handleFileSelect]
  );

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

  // Compute diff stats subtitle for FILES header (Plan 049 Feature 1)
  const diffStatsSubtitle = useMemo(() => {
    const stats = panelState.diffStats;
    if (!stats || stats.files === 0) return undefined;
    return (
      <span className="text-xs flex items-center gap-1.5">
        <span className="text-muted-foreground">·</span>
        <span className="text-muted-foreground">{stats.files} changed</span>
        {stats.insertions > 0 && <span className="text-green-500">+{stats.insertions}</span>}
        {stats.deletions > 0 && <span className="text-red-500">−{stats.deletions}</span>}
      </span>
    );
  }, [panelState.diffStats]);

  // FX001: Shared panel content — used by both mobileViews and desktop left/main slots
  const filesContent = (
    <LeftPanel
      mode={panelMode}
      onModeChange={panelState.handlePanelModeChange}
      modes={panelModes}
      onRefresh={handlePanelRefresh}
      subtitle={diffStatsSubtitle}
    >
      {{
        tree: (
          <>
            {/* Phase 7 T004: Notes filter toggle (FT-002: keep visible while active) */}
            {(showOnlyWithNotes || noteFilePaths.size > 0) && (
              <div className="flex items-center justify-end px-2 py-0.5 border-b">
                <button
                  type="button"
                  onClick={() => setShowOnlyWithNotes((v) => !v)}
                  className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] ${
                    showOnlyWithNotes
                      ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                  }`}
                  title={
                    showOnlyWithNotes
                      ? 'Show all files'
                      : `Show only files with notes (${noteFilePaths.size})`
                  }
                >
                  <StickyNote className="h-3 w-3" />
                  <span>{noteFilePaths.size}</span>
                </button>
              </div>
            )}
            <FileTree
              ref={treeRef}
              entries={filteredRootEntries}
              selectedFile={selectedFile}
              changedFiles={panelState.changedFiles}
              filesWithNotes={noteFilePaths}
              newlyAddedPaths={combinedNewPaths}
              onSelect={handleFileSelect}
              onExpand={fileNav.handleExpand}
              childEntries={filteredChildEntries}
              expandPaths={expandPaths}
              onExpandedDirsChange={handleExpandedDirsChange}
              onCreateAutoExpand={handleTreeCreateAutoExpand}
              onCopyFullPath={clipboard.handleCopyFullPath}
              onCopyRelativePath={clipboard.handleCopyRelativePath}
              onCopyRepoUrlCurrentRef={clipboard.handleCopyRepoUrlCurrentRef}
              onCopyRepoUrlDefaultBranch={clipboard.handleCopyRepoUrlDefaultBranch}
              repoInfo={repoInfo}
              onCopyContent={clipboard.handleCopyContent}
              onCopyTree={clipboard.handleCopyTree}
              onDownload={clipboard.handleDownload}
              onAddNote={handleAddNote}
              onCreateFile={handleTreeCreateFile}
              onCreateFolder={handleTreeCreateFolder}
              onRename={handleTreeRename}
              onDelete={handleTreeDelete}
            />
          </>
        ),
        changes: (
          <ChangesView
            workingChanges={panelState.workingChanges}
            recentFiles={panelState.recentFiles}
            selectedFile={selectedFile}
            onSelect={handleFileSelect}
            onCopyFullPath={clipboard.handleCopyFullPath}
            onCopyRelativePath={clipboard.handleCopyRelativePath}
            onCopyRepoUrlCurrentRef={clipboard.handleCopyRepoUrlCurrentRef}
            onCopyRepoUrlDefaultBranch={clipboard.handleCopyRepoUrlDefaultBranch}
            repoInfo={repoInfo}
            onCopyContent={clipboard.handleCopyContent}
            onDownload={clipboard.handleDownload}
          />
        ),
      }}
    </LeftPanel>
  );

  const contentView = (
    <MainPanel>
      {selectedFile ? (
        <FileViewerPanel
          filePath={selectedFile}
          content={
            fileNav.fileData?.ok && !fileNav.fileData.isBinary ? fileNav.fileData.content : null
          }
          language={
            fileNav.fileData?.ok && !fileNav.fileData.isBinary ? fileNav.fileData.language : 'text'
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
            fileNav.fileData?.ok && fileNav.fileData.isBinary ? fileNav.fileData.size : undefined
          }
          rawFileUrl={
            selectedFile
              ? `/api/workspaces/${slug}/files/raw?worktree=${encodeURIComponent(worktreePath)}&file=${encodeURIComponent(selectedFile)}`
              : undefined
          }
          rawFileBaseUrl={`/api/workspaces/${slug}/files/raw?worktree=${encodeURIComponent(worktreePath)}`}
          onSaveImage={handleSaveImage}
          popOutUrl={
            selectedFile
              ? `/workspaces/${slug}/browser?worktree=${encodeURIComponent(worktreePath)}&file=${encodeURIComponent(selectedFile)}&mode=${mode}`
              : undefined
          }
          errorType={fileNav.fileData && !fileNav.fileData.ok ? fileNav.fileData.error : undefined}
          scrollToLine={scrollToLine}
          onNavigateToFile={handleFileSelect}
        />
      ) : currentDir ? (
        <FolderPreviewPanel
          dirPath={currentDir}
          slug={slug}
          worktreePath={worktreePath}
          onFileClick={(path) => {
            setParams({ file: path, line: null }, { history: 'push' });
            setMobileActiveIndex(1);
          }}
          onFolderNavigate={(path) => {
            setParams({ dir: path, file: '' }, { history: 'push' });
            fileNav.handleExpand(path);
          }}
          onCopyPath={clipboard.handleCopyFullPath}
          onDownload={clipboard.handleDownload}
          onBreadcrumbNavigate={(path) => {
            setParams({ dir: path, file: '' }, { history: 'push' });
          }}
        />
      ) : (
        <ContentEmptyState onBrowseFiles={() => setMobileActiveIndex(0)} />
      )}
    </MainPanel>
  );

  // FX002: Terminal as 3rd mobile view (lazy — mounts on first swipe only)
  const terminalContent = (
    <div className="h-full w-full">
      {termSelectedSession ? (
        <TerminalView
          sessionName={termSelectedSession}
          cwd={worktreePath}
          themeOverride={terminalTheme}
          isActive={mobileActiveIndex === 2}
        />
      ) : (
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          {termLoading ? 'Loading sessions…' : 'No terminal sessions'}
        </div>
      )}
    </div>
  );

  // History as 4th mobile view (Recent Changes Feed). Lazy — only mounts
  // when the user activates the History tab, mirroring the Terminal slot.
  const historyView = (
    <RecentFeedView
      slug={slug}
      worktreePath={worktreePath}
      isGit={isGit}
      onClose={handleCloseRecentFeed}
      onOpenFile={(path) => {
        setParams({ view: null, line: null }, { history: 'replace' });
        void handleFileSelect(path);
      }}
      onRevealInTree={(path) => {
        const idx = path.lastIndexOf('/');
        const dir = idx === -1 ? '' : path.slice(0, idx);
        setParams({ dir, view: null }, { history: 'push' });
        void handleFileSelect(path);
      }}
    />
  );

  // Plan 084 split-terminal-view T006: inline split content. Reuses the same
  // session-name resolution as the mobile path (termSelectedSession) with a
  // canonical worktree-folder-basename fallback so the inline pane always has
  // a name to attach with — the sidecar runs `tmux new-session -A -s <name>`
  // on first connect, creating the session if it doesn't already exist (same
  // contract as /terminal and the right-edge overlay). Same `cwd={worktreePath}`.
  // Shared session = shell history follows user across overlay / /terminal / inline.
  const inlineSessionName = termSelectedSession ?? sessionNameFromWorktreePath(worktreePath);

  // FX012 state-machine transitions for the split-toggle button (Mode A↔B).
  // - A → B: close any open float, sync the singleton's session context to
  //   the inline worktree, then enter B. setSessionContext is required because
  //   the singleton reads sessionName/cwd from the overlay state; without it
  //   the inline pane would attach to the workspace-default session (often
  //   the main repo) instead of the current worktree.
  // - B → A: leave B, open the float so the terminal stays visible.
  //
  // FX015: split must attach to the session the singleton is currently showing
  // — whether the float is open OR was opened on this worktree and since
  // closed (overlay state + the parked xterm persist). The earlier code fell
  // back to `termSelectedSession` when the float was closed, which auto-picks
  // the FIRST session, so split reconnected to the wrong one. resolveSplitSession
  // preserves the live worktree session and otherwise uses this worktree's
  // canonical name — never an auto-picked first / cross-worktree default.
  const handleSplitToggleChange = useCallback(
    (next: boolean) => {
      if (next) {
        const { sessionName, cwd } = resolveSplitSession(overlay, worktreePath);
        overlay.closeTerminal();
        if (sessionName) {
          overlay.setSessionContext(sessionName, cwd);
        }
        setSplitOn(true);
      } else {
        setSplitOn(false);
        // FX013: reopen the float on the session the split pane was showing
        // (held in overlay state since enter), not a re-derived fallback —
        // otherwise exiting split could jump to a different session.
        const exitName = overlay.sessionName ?? inlineSessionName;
        if (exitName) {
          overlay.openTerminal(exitName, overlay.cwd ?? worktreePath);
        }
      }
    },
    [overlay, inlineSessionName, worktreePath]
  );

  // FX012 capture-phase backtick interceptor (Mode B only). When `splitOn` is
  // true and any caller dispatches `terminal:toggle` (SDK command via
  // backtick, sidebar button, explorer panel), we preempt the
  // TerminalOverlayProvider's bubble-phase listener and exit to Mode A with
  // the float open. When `splitOn` is false we don't register the listener at
  // all, so backtick in Mode A behaves exactly as today (AC-04).
  useEffect(() => {
    if (!splitOn) return;
    const handler = (e: Event) => {
      e.stopImmediatePropagation();
      setSplitOn(false);
      // FX013: reopen on the split pane's live session (see B→A above).
      const exitName = overlay.sessionName ?? inlineSessionName;
      if (exitName) {
        overlay.openTerminal(exitName, overlay.cwd ?? worktreePath);
      }
    };
    window.addEventListener('terminal:toggle', handler, { capture: true });
    return () => {
      window.removeEventListener('terminal:toggle', handler, { capture: true });
    };
  }, [splitOn, overlay, inlineSessionName, worktreePath]);

  // FX012: inline pane now drives the singleton via a viewport. When `splitOn`
  // is true, the singleton's xterm DOM moves into this slot — same instance
  // as the floating overlay and the /terminal page.
  // FX014: render TerminalSplitPane (header + viewport) so split mode keeps the
  // theme picker + copy-buffer control, matching the floating overlay. Display
  // the live carried session (FX013) so the header label tracks the pane.
  const inlineTerminalPane =
    splitOn && inlineSessionName ? (
      <TerminalSplitPane sessionName={overlay.sessionName ?? inlineSessionName} />
    ) : null;

  return (
    <div className="h-full overflow-hidden">
      <PanelShell
        rightPane={inlineTerminalPane ?? undefined}
        mobileViews={[
          { label: 'Files', icon: <FolderOpen className="h-4 w-4" />, content: filesContent },
          { label: 'Content', icon: <FileText className="h-4 w-4" />, content: contentView },
          {
            label: 'Terminal',
            icon: <TerminalSquare className="h-4 w-4" />,
            content: terminalContent,
            isTerminal: true,
            lazy: true,
          },
          {
            label: 'History',
            icon: <History className="h-4 w-4" />,
            content: historyView,
            lazy: true,
          },
        ]}
        initialMobileActiveIndex={mobileActiveIndex}
        mobileActiveIndex={mobileActiveIndex}
        onMobileViewChange={handleMobileViewChange}
        mobileRightAction={
          <button
            type="button"
            onClick={() => setExplorerSheetOpen(true)}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            aria-label="Search"
          >
            <Search className="h-4 w-4" />
          </button>
        }
        explorer={
          <ExplorerPanel
            ref={explorerRef}
            filePath={selectedFile ?? ''}
            handlers={[filePathHandler]}
            context={barContext}
            onCopy={() => clipboard.copyToClipboard(selectedFile ?? '')}
            placeholder="Type a path or > for commands... (Ctrl+P)"
            sdk={sdk}
            mru={mru}
            onCommandExecute={recordExecution}
            fileSearchResults={fileFilter.results}
            fileSearchLoading={fileFilter.loading}
            fileSearchError={fileFilter.error}
            sortMode={fileFilter.sortMode}
            onSortModeChange={fileFilter.cycleSortMode}
            includeHidden={fileFilter.includeHidden}
            onIncludeHiddenChange={fileFilter.toggleIncludeHidden}
            onFileSelect={handleFileSelect}
            onCopyFullPath={clipboard.handleCopyFullPath}
            onCopyRelativePath={clipboard.handleCopyRelativePath}
            onCopyContent={clipboard.handleCopyContent}
            onDownload={clipboard.handleDownload}
            workingChanges={panelState.workingChanges}
            onSearchQueryChange={fileFilter.setQuery}
            codeSearchResults={
              activeCodeSearchMode === 'grep' ? gitGrep.results : flowspace.results
            }
            codeSearchLoading={
              activeCodeSearchMode === 'grep' ? gitGrep.loading : flowspace.loading
            }
            codeSearchSpawning={activeCodeSearchMode === 'semantic' && flowspace.spawning}
            codeSearchError={activeCodeSearchMode === 'grep' ? gitGrep.error : flowspace.error}
            codeSearchAvailability={flowspace.availability}
            codeSearchGraphAge={flowspace.graphAge}
            codeSearchFolders={flowspace.folders}
            onCodeSearchSelect={(filePath, startLine) => {
              setParams({ file: filePath, line: startLine, mode: 'source' }, { history: 'push' });
            }}
            onFlowspaceQueryChange={(query, mode) => {
              setActiveCodeSearchMode(mode);
              if (mode === 'grep') {
                gitGrep.setQuery(query);
              } else {
                flowspace.setQuery(query, mode);
              }
            }}
            rightActions={
              <>
                {/* Plan recent-changes-feed T029 — entrypoint button via the
                    existing rightActions slot (no ExplorerPanel modification).
                    Closes the terminal overlay if popped — same panel. */}
                <button
                  type="button"
                  onClick={() => {
                    window.dispatchEvent(new CustomEvent('terminal:close'));
                    setParams({ view: 'recent-feed' }, { history: 'push' });
                  }}
                  className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                  title="Recent Changes Feed (Cmd/Ctrl+Shift+U)"
                  aria-label="Open Recent Changes Feed"
                >
                  <History className="h-4 w-4" />
                </button>
                {/* Plan 084 split-terminal-view T006: inline terminal toggle.
                    Lives in ExplorerPanel.rightActions, which is mobile-skipped
                    by the parent PanelShell branch — no extra gate needed. */}
                <SplitTerminalToggleButton value={splitOn} onChange={handleSplitToggleChange} />
                <QuestionPopperIndicator />
              </>
            }
          />
        }
        left={
          <LeftPanel
            mode={panelMode}
            onModeChange={panelState.handlePanelModeChange}
            modes={panelModes}
            onRefresh={handlePanelRefresh}
            subtitle={diffStatsSubtitle}
          >
            {{
              tree: (
                <>
                  {/* Phase 7 T004: Notes filter toggle (FT-002: keep visible while active) */}
                  {(showOnlyWithNotes || noteFilePaths.size > 0) && (
                    <div className="flex items-center justify-end px-2 py-0.5 border-b">
                      <button
                        type="button"
                        onClick={() => setShowOnlyWithNotes((v) => !v)}
                        className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] ${
                          showOnlyWithNotes
                            ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                            : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                        }`}
                        title={
                          showOnlyWithNotes
                            ? 'Show all files'
                            : `Show only files with notes (${noteFilePaths.size})`
                        }
                      >
                        <StickyNote className="h-3 w-3" />
                        <span>{noteFilePaths.size}</span>
                      </button>
                    </div>
                  )}
                  <FileTree
                    ref={treeRef}
                    entries={filteredRootEntries}
                    selectedFile={selectedFile}
                    changedFiles={panelState.changedFiles}
                    filesWithNotes={noteFilePaths}
                    newlyAddedPaths={combinedNewPaths}
                    onSelect={handleFileSelect}
                    onExpand={fileNav.handleExpand}
                    childEntries={filteredChildEntries}
                    expandPaths={expandPaths}
                    onExpandedDirsChange={handleExpandedDirsChange}
                    onCreateAutoExpand={handleTreeCreateAutoExpand}
                    onCopyFullPath={clipboard.handleCopyFullPath}
                    onCopyRelativePath={clipboard.handleCopyRelativePath}
                    onCopyRepoUrlCurrentRef={clipboard.handleCopyRepoUrlCurrentRef}
                    onCopyRepoUrlDefaultBranch={clipboard.handleCopyRepoUrlDefaultBranch}
                    repoInfo={repoInfo}
                    onCopyContent={clipboard.handleCopyContent}
                    onCopyTree={clipboard.handleCopyTree}
                    onDownload={clipboard.handleDownload}
                    onAddNote={handleAddNote}
                    onCreateFile={handleTreeCreateFile}
                    onCreateFolder={handleTreeCreateFolder}
                    onRename={handleTreeRename}
                    onDelete={handleTreeDelete}
                  />
                </>
              ),
              changes: (
                <ChangesView
                  workingChanges={panelState.workingChanges}
                  recentFiles={panelState.recentFiles}
                  selectedFile={selectedFile}
                  onSelect={handleFileSelect}
                  onCopyFullPath={clipboard.handleCopyFullPath}
                  onCopyRelativePath={clipboard.handleCopyRelativePath}
                  onCopyRepoUrlCurrentRef={clipboard.handleCopyRepoUrlCurrentRef}
                  onCopyRepoUrlDefaultBranch={clipboard.handleCopyRepoUrlDefaultBranch}
                  repoInfo={repoInfo}
                  onCopyContent={clipboard.handleCopyContent}
                  onDownload={clipboard.handleDownload}
                />
              ),
            }}
          </LeftPanel>
        }
        main={
          <MainPanel>
            {view === 'remote' ? (
              <RemoteViewPanel
                slug={slug}
                worktreePath={worktreePath}
                rv={params.rv}
                onPickWindow={(sessionId) => setParams({ rv: sessionId }, { history: 'push' })}
                onReturnToPicker={() => setParams({ rv: null }, { history: 'push' })}
                onClose={() => setParams({ view: null, rv: null }, { history: 'replace' })}
              />
            ) : view === 'recent-feed' ? (
              <RecentFeedView
                slug={slug}
                worktreePath={worktreePath}
                isGit={isGit}
                onClose={handleCloseRecentFeed}
                onOpenFile={(path) => {
                  setParams({ view: null, line: null }, { history: 'replace' });
                  void handleFileSelect(path);
                }}
                onRevealInTree={(path) => {
                  const idx = path.lastIndexOf('/');
                  const dir = idx === -1 ? '' : path.slice(0, idx);
                  setParams({ dir, view: null }, { history: 'push' });
                  void handleFileSelect(path);
                }}
              />
            ) : selectedFile ? (
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
                rawFileBaseUrl={`/api/workspaces/${slug}/files/raw?worktree=${encodeURIComponent(worktreePath)}`}
                onSaveImage={handleSaveImage}
                popOutUrl={
                  selectedFile
                    ? `/workspaces/${slug}/browser?worktree=${encodeURIComponent(worktreePath)}&file=${encodeURIComponent(selectedFile)}&mode=${mode}`
                    : undefined
                }
                errorType={
                  fileNav.fileData && !fileNav.fileData.ok ? fileNav.fileData.error : undefined
                }
                scrollToLine={scrollToLine}
                onNavigateToFile={handleFileSelect}
              />
            ) : currentDir ? (
              <FolderPreviewPanel
                dirPath={currentDir}
                slug={slug}
                worktreePath={worktreePath}
                onFileClick={(path) => setParams({ file: path, line: null }, { history: 'push' })}
                onFolderNavigate={(path) => {
                  setParams({ dir: path, file: '' }, { history: 'push' });
                  fileNav.handleExpand(path);
                }}
                onCopyPath={clipboard.handleCopyFullPath}
                onDownload={clipboard.handleDownload}
                onBreadcrumbNavigate={(path) => {
                  setParams({ dir: path, file: '' }, { history: 'push' });
                }}
              />
            ) : (
              <ContentEmptyState />
            )}
          </MainPanel>
        }
      />
      <MobileSearchOverlay
        open={explorerSheetOpen}
        onClose={() => setExplorerSheetOpen(false)}
        onFileSelect={(path) => {
          handleFileSelect(path);
        }}
        onCodeSearchSelect={(filePath, startLine) => {
          setParams({ file: filePath, line: startLine, mode: 'source' }, { history: 'push' });
          setMobileActiveIndex(1);
        }}
        onCommandExecute={recordExecution}
        fileSearchResults={fileFilter.results}
        fileSearchLoading={fileFilter.loading}
        fileSearchError={fileFilter.error}
        sortMode={fileFilter.sortMode}
        onSortModeChange={fileFilter.cycleSortMode}
        includeHidden={fileFilter.includeHidden}
        onIncludeHiddenChange={fileFilter.toggleIncludeHidden}
        onSearchQueryChange={fileFilter.setQuery}
        codeSearchResults={activeCodeSearchMode === 'grep' ? gitGrep.results : flowspace.results}
        codeSearchLoading={activeCodeSearchMode === 'grep' ? gitGrep.loading : flowspace.loading}
        codeSearchSpawning={activeCodeSearchMode === 'semantic' && flowspace.spawning}
        codeSearchError={activeCodeSearchMode === 'grep' ? gitGrep.error : flowspace.error}
        codeSearchAvailability={flowspace.availability}
        codeSearchGraphAge={flowspace.graphAge}
        codeSearchFolders={flowspace.folders}
        onFlowspaceQueryChange={(query, mode) => {
          setActiveCodeSearchMode(mode);
          if (mode === 'grep') {
            gitGrep.setQuery(query);
          } else {
            flowspace.setQuery(query, mode);
          }
        }}
        workingChanges={panelState.workingChanges}
        sdk={sdk}
        mru={mru}
      />
    </div>
  );
}
