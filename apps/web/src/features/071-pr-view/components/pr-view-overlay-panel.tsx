'use client';

/**
 * PRViewOverlayPanel — Fixed-position overlay for PR View.
 *
 * Mirrors notes-overlay-panel.tsx pattern:
 * - Anchor measurement via ResizeObserver on [data-terminal-overlay-anchor]
 * - Escape key close
 * - hasOpened lazy guard (no DOM until first open)
 * - z-index 44 (same as terminal/activity-log/notes)
 * - DYK-02: Unmounts children when closed ({isOpen && ...}) to free DiffViewer memory
 *
 * Plan 071: PR View & File Notes — Phase 5, T003
 */

import { GitPullRequest } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { usePRViewData } from '../hooks/use-pr-view-data';
import { usePRViewOverlay } from '../hooks/use-pr-view-overlay';
import { PRViewDiffArea } from './pr-view-diff-area';
import { PRViewFileList } from './pr-view-file-list';
import { PRViewHeader } from './pr-view-header';

export function PRViewOverlayPanel() {
  const { isOpen, worktreePath, closePRView } = usePRViewOverlay();

  const prViewData = usePRViewData(worktreePath);
  const { data, loading, error } = prViewData;
  const refreshRef = useRef(prViewData.refresh);
  refreshRef.current = prViewData.refresh;

  const panelRef = useRef<HTMLDivElement>(null);
  const [anchorRect, setAnchorRect] = useState({ top: 0, left: 0, width: 0, height: 0 });
  const [hasOpened, setHasOpened] = useState(false);

  // Active file in diff area (scroll sync)
  const [activeFile, setActiveFile] = useState<string | null>(null);

  // Ref for scrollToFile from file list
  const scrollToFileRef = useRef<((path: string) => void) | undefined>(undefined);

  useEffect(() => {
    if (isOpen) setHasOpened(true);
  }, [isOpen]);

  // Fetch data on open
  useEffect(() => {
    if (isOpen && worktreePath) {
      refreshRef.current();
    }
  }, [isOpen, worktreePath]);

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

  const handleFileClick = useCallback((filePath: string) => {
    scrollToFileRef.current?.(filePath);
  }, []);

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
      {/* DYK-02: Unmount children when closed to free DiffViewer memory */}
      {isOpen && (
        <>
          <PRViewHeader
            data={data}
            loading={loading}
            mode={prViewData.mode}
            onClose={closePRView}
            onRefresh={prViewData.refresh}
            onExpandAll={prViewData.expandAll}
            onCollapseAll={prViewData.collapseAll}
          />

          {loading && !data ? (
            <div className="flex items-center justify-center flex-1 text-muted-foreground text-sm">
              Loading changes...
            </div>
          ) : error ? (
            <div className="flex items-center justify-center flex-1 text-red-500 text-sm px-4 text-center">
              {error}
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
      )}
    </div>
  );
}
