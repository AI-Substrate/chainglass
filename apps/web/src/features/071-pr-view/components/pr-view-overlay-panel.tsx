'use client';

/**
 * PRViewOverlayPanel — Fixed-position overlay for PR View.
 *
 * Mirrors notes-overlay-panel.tsx pattern:
 * - Anchor measurement via ResizeObserver on [data-terminal-overlay-anchor]
 * - Escape key close
 * - hasOpened lazy guard (no DOM until first open)
 * - z-index 44 (same as terminal/activity-log/notes)
 * - DYK-02 (Phase 5): Unmounts children when closed to free DiffViewer memory
 * - Phase 6: FileChangeProvider + useFileChanges for SSE-driven auto-refresh
 * - Phase 6: Split loading (initialLoading vs refreshing)
 *
 * Plan 071: PR View & File Notes — Phase 5 T003, Phase 6 T003/T004
 */

import { GitBranch, GitPullRequest, Info } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchFilesWithNotes } from '../../../../app/actions/notes-actions';

import { useFileChanges } from '@/features/045-live-file-events';
import { usePRViewData } from '../hooks/use-pr-view-data';
import { usePRViewOverlay } from '../hooks/use-pr-view-overlay';
import { PRViewDiffArea } from './pr-view-diff-area';
import { PRViewFileList } from './pr-view-file-list';
import { PRViewHeader } from './pr-view-header';

/**
 * Inner content that lives inside FileChangeProvider scope.
 * Separated so useFileChanges can access the provider context.
 */
function PRViewPanelContent({
  worktreePath,
  closePRView,
}: {
  worktreePath: string;
  closePRView: () => void;
}) {
  const prViewData = usePRViewData(worktreePath);
  const { data, initialLoading, refreshing, error } = prViewData;
  const refreshRef = useRef(prViewData.refresh);
  refreshRef.current = prViewData.refresh;

  // Active file in diff area (scroll sync)
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const scrollToFileRef = useRef<((path: string) => void) | undefined>(undefined);

  // Phase 7 T005: Cross-domain noteFilePaths for indicator dots (DYK-04)
  const [noteFilePaths, setNoteFilePaths] = useState<Set<string>>(new Set());
  const fetchNoteFilesRef = useRef<(() => Promise<void>) | undefined>(undefined);
  fetchNoteFilesRef.current = useCallback(async () => {
    const result = await fetchFilesWithNotes(worktreePath);
    if (result.ok) {
      setNoteFilePaths(new Set(result.data));
    }
  }, [worktreePath]);

  // Fetch data on mount
  useEffect(() => {
    refreshRef.current();
    fetchNoteFilesRef.current?.();
  }, []);

  // Phase 6 T004: SSE-driven auto-refresh
  const { hasChanges, clearChanges } = useFileChanges('*', { debounce: 300 });
  useEffect(() => {
    if (hasChanges) {
      refreshRef.current();
      clearChanges();
    }
  }, [hasChanges, clearChanges]);

  // Phase 7 DYK-02: Refresh note indicators when notes change
  useEffect(() => {
    const handler = () => {
      fetchNoteFilesRef.current?.();
    };
    window.addEventListener('notes:changed', handler);
    return () => window.removeEventListener('notes:changed', handler);
  }, []);

  const handleFileClick = useCallback((filePath: string) => {
    scrollToFileRef.current?.(filePath);
  }, []);

  // DYK-03 (Phase 6): Detect "on default branch" for info message
  const isOnDefaultBranch =
    data && data.mode === 'branch' && data.files.length === 0 && !error && !initialLoading;

  return (
    <>
      <PRViewHeader
        data={data}
        refreshing={refreshing}
        mode={prViewData.mode}
        onClose={closePRView}
        onRefresh={prViewData.refresh}
        onExpandAll={prViewData.expandAll}
        onCollapseAll={prViewData.collapseAll}
        onSwitchMode={prViewData.switchMode}
      />

      {initialLoading ? (
        <div className="flex items-center justify-center flex-1 text-muted-foreground text-sm">
          Loading changes...
        </div>
      ) : error ? (
        <div className="flex items-center justify-center flex-1 text-red-500 text-sm px-4 text-center">
          {error}
        </div>
      ) : isOnDefaultBranch ? (
        <div className="flex flex-col items-center justify-center flex-1 text-muted-foreground text-sm gap-2 px-8 text-center">
          <Info className="h-8 w-8 opacity-30" />
          <span>You're on the default branch</span>
          <span className="text-xs">
            Branch mode shows changes between your feature branch and main. Switch to a feature
            branch or use Working mode to see uncommitted changes.
          </span>
        </div>
      ) : !data || data.files.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 text-muted-foreground text-sm gap-2">
          <GitPullRequest className="h-8 w-8 opacity-30" />
          <span>No changes detected</span>
        </div>
      ) : (
        <div className="flex flex-1 overflow-hidden min-h-0">
          <PRViewFileList
            files={data.files}
            activeFile={activeFile}
            noteFilePaths={noteFilePaths}
            onFileClick={handleFileClick}
            onToggleReviewed={prViewData.toggleReviewed}
          />
          <PRViewDiffArea
            files={data.files}
            collapsedFiles={prViewData.collapsedFiles}
            onToggleCollapsed={prViewData.toggleCollapsed}
            onToggleReviewed={prViewData.toggleReviewed}
            onActiveFileChange={setActiveFile}
            scrollToFileRef={scrollToFileRef}
          />
        </div>
      )}
    </>
  );
}

export function PRViewOverlayPanel() {
  const { isOpen, worktreePath, closePRView } = usePRViewOverlay();

  const panelRef = useRef<HTMLDivElement>(null);
  const [anchorRect, setAnchorRect] = useState({ top: 0, left: 0, width: 0, height: 0 });
  const [hasOpened, setHasOpened] = useState(false);

  useEffect(() => {
    if (isOpen) setHasOpened(true);
  }, [isOpen]);

  // Measure anchor element
  const measureRef = useRef<(() => void) | undefined>(undefined);
  useEffect(() => {
    const measure = () => {
      const anchor = document.querySelector('[data-terminal-overlay-anchor]');
      if (anchor) {
        const rect = anchor.getBoundingClientRect();
        setAnchorRect({ top: rect.top, left: rect.left, width: rect.width, height: rect.height });
      }
    };
    measureRef.current = measure;
    measure();
    window.addEventListener('resize', measure);
    const observer = new ResizeObserver(measure);
    const anchor = document.querySelector('[data-terminal-overlay-anchor]');
    if (anchor) observer.observe(anchor);
    const timer = setTimeout(measure, 200);
    return () => {
      window.removeEventListener('resize', measure);
      observer.disconnect();
      clearTimeout(timer);
    };
  }, []);

  // Re-measure when overlay opens
  useEffect(() => {
    if (isOpen) measureRef.current?.();
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closePRView();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, closePRView]);

  if (!hasOpened) return null;

  return (
    <div
      ref={panelRef}
      className="fixed flex flex-col border-l bg-background shadow-2xl"
      style={{
        zIndex: 44,
        top: `${anchorRect.top}px`,
        left: `${anchorRect.left}px`,
        width: `${anchorRect.width}px`,
        height: `${anchorRect.height}px`,
        display: isOpen ? 'flex' : 'none',
      }}
      data-testid="pr-view-overlay-panel"
    >
      {/* DYK-02: Unmount children when closed to free DiffViewer memory.
          FileChangeProvider is in PRViewOverlayWrapper (shared with browser). */}
      {isOpen && worktreePath && (
        <PRViewPanelContent worktreePath={worktreePath} closePRView={closePRView} />
      )}
    </div>
  );
}
