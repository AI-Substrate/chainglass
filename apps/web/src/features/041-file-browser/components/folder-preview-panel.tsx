/**
 * FolderPreviewPanel — Main orchestrator for folder content preview gallery.
 *
 * Manages states: loading, empty, large-folder warning (>50 items), and gallery.
 * Fetches directory entries from existing files API. Shows breadcrumb navigation.
 *
 * Plan 077: Folder Content Preview (T013)
 */

'use client';

import { sortGalleryItems } from '@/features/041-file-browser/lib/sort-gallery-items';
import type { FileEntry } from '@/features/041-file-browser/services/directory-listing';
import { cn } from '@/lib/utils';
import { AlertTriangle, FolderOpen, Upload } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { FolderPreviewGrid } from './folder-preview-grid';
import { GallerySkeletonGrid } from './preview-cards/card-skeleton';

const LARGE_FOLDER_THRESHOLD = 50;
const MAX_ITEMS = 100;

export interface FolderPreviewPanelProps {
  dirPath: string;
  slug: string;
  worktreePath: string;
  onFileClick: (path: string) => void;
  onFolderNavigate: (path: string) => void;
  onCopyPath: (path: string) => void;
  onDownload: (path: string) => void;
  onBreadcrumbNavigate: (path: string) => void;
}

type PanelState = 'loading' | 'empty' | 'warning' | 'gallery';

export function FolderPreviewPanel({
  dirPath,
  slug,
  worktreePath,
  onFileClick,
  onFolderNavigate,
  onCopyPath,
  onDownload,
  onBreadcrumbNavigate,
}: FolderPreviewPanelProps) {
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [state, setState] = useState<PanelState>('loading');
  const [showAll, setShowAll] = useState(false);

  const fetchEntries = useCallback(async () => {
    setState('loading');
    setShowAll(false);
    try {
      const url = `/api/workspaces/${encodeURIComponent(slug)}/files?worktree=${encodeURIComponent(worktreePath)}&dir=${encodeURIComponent(dirPath)}`;
      const res = await fetch(url);
      if (!res.ok) {
        setState('empty');
        return;
      }
      const data = await res.json();
      const items = (data.entries ?? []) as FileEntry[];

      if (items.length === 0) {
        setState('empty');
      } else if (items.length > LARGE_FOLDER_THRESHOLD) {
        setEntries(items);
        setState('warning');
      } else {
        setEntries(items);
        setState('gallery');
      }
    } catch {
      setState('empty');
    }
  }, [slug, worktreePath, dirPath]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  const handleShowContents = useCallback(() => {
    setShowAll(true);
    setState('gallery');
  }, []);

  const displayEntries = showAll ? entries.slice(0, MAX_ITEMS) : entries;
  const galleryItems = sortGalleryItems(displayEntries);

  // Build breadcrumb segments
  const segments = dirPath ? dirPath.split('/').filter(Boolean) : [];

  return (
    <div className="h-full flex flex-col">
      {/* Breadcrumb header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border px-4 py-2.5 flex items-center justify-between gap-3">
        <nav className="flex items-center gap-1 text-sm text-muted-foreground flex-wrap min-w-0">
          <button
            type="button"
            className="px-1.5 py-0.5 rounded hover:bg-accent hover:text-foreground transition-colors truncate"
            onClick={() => onBreadcrumbNavigate('')}
          >
            root
          </button>
          {segments.map((seg, i) => {
            const segPath = segments.slice(0, i + 1).join('/');
            const isCurrent = i === segments.length - 1;
            return (
              <span key={segPath} className="contents">
                <span className="text-muted-foreground/50 text-xs">/</span>
                <button
                  type="button"
                  className={cn(
                    'px-1.5 py-0.5 rounded transition-colors truncate max-w-[160px]',
                    isCurrent
                      ? 'text-foreground font-medium cursor-default'
                      : 'hover:bg-accent hover:text-foreground'
                  )}
                  onClick={() => !isCurrent && onBreadcrumbNavigate(segPath)}
                  disabled={isCurrent}
                >
                  {seg}
                </button>
              </span>
            );
          })}
        </nav>
        {state === 'gallery' && (
          <span className="text-xs text-muted-foreground bg-muted px-2.5 py-1 rounded-full tabular-nums shrink-0">
            {displayEntries.length} items
          </span>
        )}
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-y-auto p-4">
        {state === 'loading' && <GallerySkeletonGrid />}

        {state === 'empty' && (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground text-center gap-3">
            <FolderOpen className="h-12 w-12 opacity-30" />
            <span className="text-sm font-semibold">This folder is empty</span>
            <span className="text-xs max-w-[280px]">
              Drop files here or use the upload button to add content.
            </span>
            <button
              type="button"
              className="mt-2 px-4 py-1.5 rounded-md border border-border bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-opacity flex items-center gap-1.5"
            >
              <Upload className="h-3.5 w-3.5" />
              Upload Files
            </button>
          </div>
        )}

        {state === 'warning' && (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground text-center gap-3">
            <AlertTriangle className="h-10 w-10 text-amber-500 opacity-70" />
            <span className="text-sm font-semibold">Large folder — {entries.length} items</span>
            <span className="text-xs max-w-[320px]">
              Loading previews for large folders may take a moment.
            </span>
            <button
              type="button"
              onClick={handleShowContents}
              className="mt-2 px-4 py-1.5 rounded-md border border-border bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-opacity"
            >
              Show contents (up to {MAX_ITEMS})
            </button>
          </div>
        )}

        {state === 'gallery' && (
          <FolderPreviewGrid
            items={galleryItems}
            slug={slug}
            worktreePath={worktreePath}
            onFileClick={onFileClick}
            onFolderNavigate={onFolderNavigate}
            onCopyPath={onCopyPath}
            onDownload={onDownload}
          />
        )}
      </div>
    </div>
  );
}
