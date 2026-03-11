'use client';

/**
 * PRViewDiffSection — Collapsible per-file diff section.
 *
 * Per workshop section 3.4. Wraps DiffViewer with sticky header,
 * status/stats/viewed controls, and "Previously viewed" banner.
 *
 * DYK-01: Owns error display — does NOT pass diffError to DiffViewer.
 * If file.diffError exists, we render our own amber error bar.
 *
 * Plan 071: PR View & File Notes — Phase 5, T006
 */

import { ChevronDown, ChevronRight } from 'lucide-react';
import { Suspense, lazy, useEffect, useRef, useState } from 'react';

import type { PRViewFile } from '../types';

const DiffViewer = lazy(() =>
  import('@/components/viewers').then((m) => ({ default: m.DiffViewer }))
);

interface PRViewDiffSectionProps {
  file: PRViewFile;
  collapsed: boolean;
  onToggleCollapsed: (filePath: string) => void;
  onToggleReviewed: (filePath: string) => void;
}

export function PRViewDiffSection({
  file,
  collapsed,
  onToggleCollapsed,
  onToggleReviewed,
}: PRViewDiffSectionProps) {
  const sectionRef = useRef<HTMLDivElement>(null);
  // Lazy-mount: only render DiffViewer when expanded AND in viewport
  const [inViewport, setInViewport] = useState(false);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInViewport(true);
          observer.disconnect();
        }
      },
      { threshold: 0.01 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const showDiff = !collapsed && inViewport;
  const maxBlocks = 5;
  const insBlocks = Math.min(file.insertions, maxBlocks);
  const delBlocks = Math.min(file.deletions, maxBlocks);

  return (
    <div ref={sectionRef} data-file-path={file.path} className="border-b">
      {/* File header — always visible, clickable to collapse */}
      <button
        type="button"
        onClick={() => onToggleCollapsed(file.path)}
        className="flex items-center w-full gap-2 px-3 py-1.5 text-sm
                   hover:bg-accent/30 sticky top-0 bg-background z-10 border-b"
      >
        {/* Collapse toggle */}
        {collapsed ? (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        )}

        {/* File path */}
        <span className="truncate flex-1 text-left font-mono text-xs">{file.path}</span>

        {/* Change stats + colored blocks */}
        <span className="shrink-0 flex items-center gap-1 text-xs">
          {file.insertions > 0 && <span className="text-green-500">+{file.insertions}</span>}
          {file.deletions > 0 && <span className="text-red-500">&minus;{file.deletions}</span>}
          <span className="flex gap-px ml-1">
            {Array.from({ length: insBlocks }).map((_, i) => (
              <span key={`ins-${file.path}-${i}`} className="w-1.5 h-1.5 bg-green-500 rounded-sm" />
            ))}
            {Array.from({ length: delBlocks }).map((_, i) => (
              <span key={`del-${file.path}-${i}`} className="w-1.5 h-1.5 bg-red-500 rounded-sm" />
            ))}
          </span>
        </span>

        {/* Viewed checkbox */}
        <input
          type="checkbox"
          checked={file.reviewed}
          onChange={(e) => {
            e.stopPropagation();
            onToggleReviewed(file.path);
          }}
          onClick={(e) => e.stopPropagation()}
          className="shrink-0 h-3.5 w-3.5 rounded border-muted-foreground/50 cursor-pointer"
          title="Mark as viewed"
        />
      </button>

      {/* "Previously viewed" indicator */}
      {file.previouslyReviewed && !file.reviewed && (
        <div className="px-3 py-1 text-xs text-amber-500 bg-amber-500/5 border-b">
          Previously viewed — file has changed since last review
        </div>
      )}

      {/* DYK-01: Own error display */}
      {!collapsed && file.diffError && (
        <div className="px-3 py-2 text-xs text-amber-600 bg-amber-50 dark:bg-amber-500/5 border-b">
          Error loading diff: {file.diffError}
        </div>
      )}

      {/* Diff content — lazy mounted */}
      {showDiff && !file.diffError && file.diff && (
        <div className="overflow-hidden">
          <Suspense
            fallback={
              <div className="px-3 py-4 text-xs text-muted-foreground">Loading diff...</div>
            }
          >
            <DiffViewer
              file={{ path: file.path, filename: file.name, content: '' }}
              diffData={file.diff}
              error={null}
            />
          </Suspense>
        </div>
      )}

      {/* Collapsed indicator */}
      {collapsed && (
        <div className="px-3 py-2 text-xs text-muted-foreground bg-muted/30">
          File collapsed — click header to expand
        </div>
      )}

      {/* No diff available (deleted or empty) */}
      {!collapsed && !file.diffError && !file.diff && (
        <div className="px-3 py-2 text-xs text-muted-foreground bg-muted/30">
          {file.status === 'deleted' ? 'File deleted' : 'No diff available'}
        </div>
      )}
    </div>
  );
}
