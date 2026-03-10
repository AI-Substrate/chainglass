'use client';

/**
 * PRViewHeader — Branch name, stats, progress, mode toggle, expand/collapse.
 *
 * Per workshop section 3.2. Mode toggle renders but only 'working' is active
 * (Branch mode wired in Phase 6).
 *
 * Plan 071: PR View & File Notes — Phase 5, T004
 */

import { ChevronsDownUp, ChevronsUpDown, GitPullRequest, RefreshCw, X } from 'lucide-react';

import type { ComparisonMode, PRViewData } from '../types';

interface PRViewHeaderProps {
  data: PRViewData | null;
  refreshing: boolean;
  mode: ComparisonMode;
  onClose: () => void;
  onRefresh: () => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
  onSwitchMode: (mode: ComparisonMode) => void;
}

export function PRViewHeader({
  data,
  refreshing,
  mode,
  onClose,
  onRefresh,
  onExpandAll,
  onCollapseAll,
  onSwitchMode,
}: PRViewHeaderProps) {
  const branch = data?.branch ?? '...';
  const stats = data?.stats;
  const fileCount = stats?.fileCount ?? 0;
  const totalInsertions = stats?.totalInsertions ?? 0;
  const totalDeletions = stats?.totalDeletions ?? 0;
  const reviewedCount = stats?.reviewedCount ?? 0;

  return (
    <div className="flex flex-col border-b shrink-0">
      {/* Top row: title + actions */}
      <div className="flex items-center justify-between px-3 py-2">
        <div className="flex items-center gap-2 min-w-0">
          <GitPullRequest className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="text-sm font-medium truncate">PR View: {branch}</span>
          {/* Working/Branch mode toggle (Phase 6) */}
          <div className="inline-flex rounded border text-[10px] overflow-hidden shrink-0">
            <button
              type="button"
              onClick={() => onSwitchMode('working')}
              className={`px-2 py-0.5 ${mode === 'working' ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/50'}`}
            >
              Working
            </button>
            <button
              type="button"
              onClick={() => onSwitchMode('branch')}
              className={`px-2 py-0.5 ${mode === 'branch' ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/50'}`}
            >
              Branch
            </button>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={onRefresh}
            className="rounded-sm p-1 text-muted-foreground hover:text-foreground hover:bg-accent"
            title="Refresh"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
          <button
            type="button"
            onClick={onExpandAll}
            className="rounded-sm p-1 text-muted-foreground hover:text-foreground hover:bg-accent"
            title="Expand all files"
          >
            <ChevronsDownUp className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onCollapseAll}
            className="rounded-sm p-1 text-muted-foreground hover:text-foreground hover:bg-accent"
            title="Collapse all files"
          >
            <ChevronsUpDown className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-sm p-1 hover:bg-accent"
            aria-label="Close PR view"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Bottom row: stats + progress */}
      {data && (
        <div className="flex items-center gap-2 px-3 pb-2 text-xs text-muted-foreground">
          <span>
            {fileCount} file{fileCount !== 1 ? 's' : ''} changed
          </span>
          <span>&middot;</span>
          {totalInsertions > 0 && <span className="text-green-500">+{totalInsertions}</span>}
          {totalDeletions > 0 && <span className="text-red-500">&minus;{totalDeletions}</span>}
          {(totalInsertions > 0 || totalDeletions > 0) && <span>&middot;</span>}
          <span>
            {reviewedCount} of {fileCount} viewed
          </span>
          {/* Mini progress blocks */}
          <div className="flex gap-px ml-1">
            {data.files.map((f) => (
              <div
                key={f.path}
                className={`w-2 h-2 rounded-sm ${
                  f.reviewed ? 'bg-green-500' : 'bg-muted-foreground/30'
                }`}
                title={f.name}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
