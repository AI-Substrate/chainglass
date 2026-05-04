'use client';

/**
 * RecentFeedView — top-level orchestrator for the Recent Changes Feed.
 *
 * T012 wired the seed (git log + fs.stat → FeedItem[]).
 * T015 added the live-merge reducer (`useRecentFeedState`).
 * T016 (this commit) wires the reducer to the existing
 * `_platform/events` `file-changes` SSE channel via `useFileChanges('*')`
 * — Finding 01 binds: NO new SSE channel, broadcaster, or watcher pipeline.
 *
 * Markdown / code excerpt cards land at T021/T022 — until then those kinds
 * fall through to the binary preview.
 */

import { useFileChanges, useSSEConnectionState } from '@/features/045-live-file-events';
import { cn } from '@/lib/utils';
import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchRecentFeedItems } from '../../../../../app/actions/file-actions';

/**
 * Tiny browser-safe absolute-path joiner. The Node `path.resolve` isn't
 * usable in client bundles; for our needs we just need `<worktree>/<rel>`
 * with no intermediate `..` resolution (server already gave us a normalised
 * relative path). This is good enough for the clipboard / display use case.
 */
function joinPath(worktreePath: string, relPath: string): string {
  const trimmed = worktreePath.replace(/\/+$/, '');
  const cleaned = relPath.replace(/^\/+/, '');
  return `${trimmed}/${cleaned}`;
}
import { CardActions } from '../preview-cards/card-actions';
import { FeedCard } from './feed-card';
import { FeedEmptyState } from './feed-empty-state';
import { FeedErrorState } from './feed-error-state';
import { FeedSkeleton } from './feed-skeleton';
import { useRecentFeedState } from './hooks/use-recent-feed-state';
import {
  type FilterCategory,
  RecentFeedFilters,
} from './recent-feed-filters';
import { RecentFeedHeader } from './recent-feed-header';
import { RecentFeedList } from './recent-feed-list';
import { AudioPreview } from './previews/audio-preview';
import { BinaryPreview } from './previews/binary-preview';
import { ImagePreview } from './previews/image-preview';
import { VideoPreview } from './previews/video-preview';
import type { FeedItem } from './types';

const ALL_CATEGORIES: ReadonlySet<FilterCategory> = new Set<FilterCategory>([
  'all',
  'image',
  'video',
  'audio',
  'markdown',
  'code',
  'other',
]);

/** Map a FeedItemKind to a filter category. T024 will own the canonical predicate. */
function itemCategory(item: FeedItem): FilterCategory {
  switch (item.kind) {
    case 'image':
      return 'image';
    case 'video':
      return 'video';
    case 'audio':
      return 'audio';
    case 'markdown':
      return 'markdown';
    case 'code':
      return 'code';
    default:
      return 'other';
  }
}

export interface RecentFeedViewProps {
  slug: string;
  worktreePath: string;
  isGit: boolean;
  onClose: () => void;
}

export function RecentFeedView({
  slug,
  worktreePath,
  isGit,
  onClose,
}: RecentFeedViewProps) {
  const { state, dispatch, pushEvent } = useRecentFeedState({
    isLoading: true,
  });
  const [seedError, setSeedError] = useState<{ message: string; detail?: string } | null>(
    null
  );
  const [activeFilters, setActiveFilters] = useState<ReadonlySet<FilterCategory>>(
    ALL_CATEGORIES
  );

  const loadSeed = useCallback(async () => {
    setSeedError(null);
    try {
      const result = await fetchRecentFeedItems(worktreePath, 50);
      if (result.ok) {
        dispatch({ type: 'INIT', items: result.items });
      } else {
        setSeedError({
          message: 'Cannot seed from git history',
          detail: 'This workspace is not a git repository — no historical change order is available.',
        });
        dispatch({ type: 'INIT', items: [] });
      }
    } catch (err) {
      setSeedError({
        message: 'Failed to load recent changes',
        detail: err instanceof Error ? err.message : undefined,
      });
      dispatch({ type: 'INIT', items: [] });
    }
  }, [worktreePath, dispatch]);

  useEffect(() => {
    void loadSeed();
  }, [loadSeed]);

  // T016: subscribe to the EXISTING `file-changes` SSE channel via
  // useFileChanges('*'). Finding 01 binds: NO new SSE channel, broadcaster,
  // or watcher pipeline. We pipe each FileChange into the reducer's
  // pushEvent (which batches via rAF for AC G3 burst coalescing).
  const { changes, clearChanges } = useFileChanges('*', { debounce: 50 });

  // T019: SSE connection state — drives the disconnect banner. Existing items
  // are preserved (the reducer never blanks on disconnect); only new events
  // arriving after reconnection are merged. Covers AC C5.
  const sseConnectionState = useSSEConnectionState();
  useEffect(() => {
    dispatch({
      type: 'SET_DISCONNECTED',
      disconnected: sseConnectionState !== 'connected',
    });
  }, [sseConnectionState, dispatch]);
  // Track changes we've already forwarded to avoid double-counting on
  // re-render. The hook in 'replace' mode emits the most recent batch each
  // time, so we only forward changes whose timestamp is newer than the last
  // seen one.
  const lastSeenTsRef = useRef<number>(0);
  useEffect(() => {
    if (changes.length === 0) return;
    let maxTs = lastSeenTsRef.current;
    for (const change of changes) {
      if (change.timestamp <= lastSeenTsRef.current) continue;
      if (change.timestamp > maxTs) maxTs = change.timestamp;
      // Map FileChange → RawFileChangeEvent. Size + mtimeMs unknown on the
      // client; mtimeMs falls back to the SSE timestamp; size = 0 (the next
      // seed refresh will repopulate).
      pushEvent({
        kind: change.eventType,
        path: change.path,
        absolutePath: joinPath(worktreePath, change.path),
        mtimeMs: change.timestamp,
        size: 0,
      });
    }
    lastSeenTsRef.current = maxTs;
    clearChanges();
  }, [changes, pushEvent, worktreePath, clearChanges]);

  const handleToggleFilter = useCallback((cat: FilterCategory) => {
    setActiveFilters((prev) => {
      if (cat === 'all') return ALL_CATEGORIES;
      // F001 fix: transition from All → subset is a fresh single-category
      // selection, not a delete from the all-set.
      if (prev.has('all')) return new Set<FilterCategory>([cat]);
      const next = new Set<FilterCategory>(prev);
      if (next.has(cat)) {
        next.delete(cat);
      } else {
        next.add(cat);
      }
      if (next.size === 0) return ALL_CATEGORIES;
      return next;
    });
  }, []);

  const showAll = activeFilters.has('all');
  const visibleItems = showAll
    ? state.items
    : state.items.filter((item) => activeFilters.has(itemCategory(item)));

  const rawFileUrlFor = (path: string) =>
    `/api/workspaces/${slug}/files/raw?worktree=${encodeURIComponent(worktreePath)}&file=${encodeURIComponent(path)}`;

  const handleCopyRel = useCallback((path: string) => {
    void navigator.clipboard?.writeText(path);
  }, []);
  const handleCopyAbs = useCallback(
    (path: string) => {
      const item = state.items.find((i) => i.path === path);
      if (item) void navigator.clipboard?.writeText(item.absolutePath);
    },
    [state.items]
  );
  const handleDownload = useCallback(
    (path: string) => {
      window.open(`${rawFileUrlFor(path)}&download=true`, '_blank', 'noopener,noreferrer');
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [slug, worktreePath]
  );
  const handleOpenItem = useCallback((path: string) => {
    window.dispatchEvent(
      new CustomEvent('recent-feed:open-file', { detail: { path } })
    );
  }, []);

  return (
    <div role="feed" aria-busy={state.isLoading} className="flex flex-col h-full overflow-hidden">
      <RecentFeedHeader
        itemCount={visibleItems.length}
        isLive={isGit && !state.isDisconnected}
        isPaused={state.paused}
        bufferedChanges={state.buffer.length}
        onTogglePause={() =>
          dispatch({ type: state.paused ? 'RESUME' : 'PAUSE' })
        }
        onRefresh={loadSeed}
        onOpenSettings={() => {
          window.dispatchEvent(new CustomEvent('recent-feed:open-settings'));
        }}
      />
      <RecentFeedFilters active={activeFilters} onToggle={handleToggleFilter} />
      <button
        type="button"
        onClick={onClose}
        className={cn(
          'absolute top-2 right-2 text-xs text-muted-foreground hover:text-foreground',
          'rounded-md border border-border bg-background/80 backdrop-blur-sm px-2 py-1',
          'opacity-0 hover:opacity-100 focus-visible:opacity-100 transition-opacity'
        )}
        aria-label="Close recent changes feed"
      >
        Close
      </button>

      {state.isDisconnected && (
        <div
          role="status"
          aria-live="polite"
          className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 dark:bg-amber-950/40 border-b border-amber-300/50 text-[11px] text-amber-800 dark:text-amber-300"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" aria-hidden="true" />
          Live updates disconnected — existing items preserved; reconnecting…
        </div>
      )}
      {state.paused && state.buffer.length > 0 && (
        <button
          type="button"
          onClick={() => dispatch({ type: 'RESUME' })}
          className="sticky top-0 z-20 mx-auto block rounded-full bg-primary px-3 py-1 text-[11px] font-medium text-primary-foreground shadow-md hover:bg-primary/90 transition-colors my-2"
        >
          {state.buffer.length} new {state.buffer.length === 1 ? 'change' : 'changes'} — click to show
        </button>
      )}

      <div className="flex-1 overflow-y-auto">
        {state.isLoading && <FeedSkeleton count={5} />}
        {!state.isLoading && seedError && (
          <FeedErrorState
            message={seedError.message}
            detail={seedError.detail}
            onRetry={loadSeed}
          />
        )}
        {!state.isLoading && !seedError && visibleItems.length === 0 && (
          <FeedEmptyState filtered={!showAll && activeFilters.size > 0} />
        )}
        {!state.isLoading && !seedError && visibleItems.length > 0 && (
          <RecentFeedList
            items={visibleItems}
            renderItem={(item) => {
              const url = rawFileUrlFor(item.path);
              const preview = (() => {
                switch (item.kind) {
                  case 'image':
                    return <ImagePreview item={item} rawFileUrl={url} />;
                  case 'video':
                    return <VideoPreview item={item} rawFileUrl={url} />;
                  case 'audio':
                    return <AudioPreview item={item} rawFileUrl={url} />;
                  case 'markdown':
                  case 'code':
                    return <BinaryPreview item={item} />;
                  default:
                    return <BinaryPreview item={item} />;
                }
              })();
              return (
                <FeedCard
                  item={item}
                  onActivate={() => handleOpenItem(item.path)}
                  actions={
                    <CardActions
                      filePath={item.path}
                      onCopyPath={handleCopyRel}
                      onCopyAbsolutePath={handleCopyAbs}
                      onDownload={handleDownload}
                      onOpen={handleOpenItem}
                    />
                  }
                >
                  {preview}
                </FeedCard>
              );
            }}
          />
        )}
      </div>
    </div>
  );
}

export default RecentFeedView;
