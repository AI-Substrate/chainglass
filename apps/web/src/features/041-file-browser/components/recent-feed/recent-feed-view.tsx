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
import {
  ALL_FILTER_CATEGORIES,
  itemMatchesFilter,
  toggleFilterCategory,
} from '../../lib/feed-filter';

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
import { useFeedActions } from './hooks/use-feed-actions';
import { useFeedKeyboard } from './hooks/use-feed-keyboard';
import { useRecentFeedState } from './hooks/use-recent-feed-state';
import { AudioPreview } from './previews/audio-preview';
import { BinaryPreview } from './previews/binary-preview';
import { CodeExcerptCard } from './previews/code-excerpt-card';
import { DeletedPreview } from './previews/deleted-preview';
import { ImagePreview } from './previews/image-preview';
import { MarkdownExcerptCard } from './previews/markdown-excerpt-card';
import { VideoPreview } from './previews/video-preview';
import { type FilterCategory, RecentFeedFilters } from './recent-feed-filters';
import { RecentFeedHeader } from './recent-feed-header';
import { RecentFeedList } from './recent-feed-list';
import type { FeedItem } from './types';

export interface RecentFeedViewProps {
  slug: string;
  worktreePath: string;
  isGit: boolean;
  onClose: () => void;
  /** T025 — caller-supplied: opens a file in FileViewerPanel (clears `view`). */
  onOpenFile?: (path: string) => void;
  /** T025 — caller-supplied: reveals path's parent directory in the file tree (sets `dir` + `file`, clears `view`). */
  onRevealInTree?: (path: string) => void;
}

export function RecentFeedView({
  slug,
  worktreePath,
  isGit,
  onClose,
  onOpenFile,
  onRevealInTree,
}: RecentFeedViewProps) {
  const { state, dispatch, pushEvent } = useRecentFeedState({
    isLoading: true,
  });
  const [seedError, setSeedError] = useState<{ message: string; detail?: string } | null>(null);
  const [activeFilters, setActiveFilters] =
    useState<ReadonlySet<FilterCategory>>(ALL_FILTER_CATEGORIES);

  const loadSeed = useCallback(async () => {
    setSeedError(null);
    try {
      // Seed with the full ceiling, not the visible feedSize. The reducer
      // already caps at ceiling=200; the chip filter ('All' / 'Video' /
      // 'Image' / …) needs a generous underlying pool so users on
      // doc-heavy repos can still find media buried a few hundred commits
      // back. With a 50-item seed, repos like higgs-jordo (where the most
      // recent ~200 unique paths are 100 % docs/code) showed empty
      // Video/Image filters even though committed media existed.
      //
      // When the filter is narrowed to specific categories, hint the
      // server so it guarantees a per-category quota (default 20). That
      // way "Video" surfaces real videos buried deeper in history rather
      // than just whatever videos happened to fall in the newest 200
      // paths.
      const seedCategories:
        | ReadonlyArray<'image' | 'video' | 'audio' | 'markdown' | 'code' | 'other'>
        | undefined = activeFilters.has('all')
        ? undefined
        : (Array.from(activeFilters).filter((c) => c !== 'all') as ReadonlyArray<
            'image' | 'video' | 'audio' | 'markdown' | 'code' | 'other'
          >);
      // Default seed size is small (20) for fast first paint. When a
      // category filter is active we ask for a generous per-category
      // quota (handled server-side via the `seedCategories` hint), so
      // narrowing to "Videos" still returns up to 20 videos even if the
      // unfiltered seed would only have surfaced a handful.
      const seedLimit = seedCategories ? 200 : 20;
      const result = await fetchRecentFeedItems(worktreePath, seedLimit, seedCategories);
      if (result.ok) {
        dispatch({ type: 'INIT', items: result.items });
      } else {
        setSeedError({
          message: 'Cannot seed from git history',
          detail:
            'This workspace is not a git repository — no historical change order is available.',
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
  }, [worktreePath, dispatch, activeFilters]);

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
    setActiveFilters((prev) => toggleFilterCategory(prev, cat));
  }, []);

  const showAll = activeFilters.has('all');
  const visibleItems = state.items.filter((item) => itemMatchesFilter(item, activeFilters));

  // Cache-bust on mtime so an in-place file replacement (same path, new
  // bytes) actually forces the browser to refetch image/video/audio
  // payloads. Without `&v=`, the URL is identical and the browser serves
  // the stale cached response — the user has to hard-refresh to see the
  // update.
  const rawFileUrlFor = (item: FeedItem) =>
    `/api/workspaces/${slug}/files/raw?worktree=${encodeURIComponent(worktreePath)}&file=${encodeURIComponent(item.path)}&v=${item.changedAt}`;

  // T025: useFeedActions hook lifts the 9 catalog actions out of the orchestrator.
  // Bridge events used pre-T025 for navigation are replaced with caller-supplied
  // handlers (browser-client.tsx wires them with setParams).
  const actions = useFeedActions({
    slug,
    worktreePath,
    items: state.items,
    dispatch,
    onOpenFile:
      onOpenFile ??
      ((path) =>
        window.dispatchEvent(new CustomEvent('recent-feed:open-file', { detail: { path } }))),
    onRevealInTree:
      onRevealInTree ??
      ((path) =>
        window.dispatchEvent(new CustomEvent('recent-feed:reveal-in-tree', { detail: { path } }))),
  });

  // T026: feed-root keyboard handler. Roving focus + per-card letter shortcuts.
  const handleKeyDown = useFeedKeyboard({ visibleItems, actions });

  return (
    <div
      role="feed"
      aria-busy={state.isLoading}
      aria-label="Recent changes"
      className="flex flex-col h-full overflow-hidden"
      onKeyDown={handleKeyDown}
    >
      {/* T027 — polite live region announcing new items as they arrive.
          Visually hidden but exposed to screen readers. */}
      {/* biome-ignore lint/a11y/useSemanticElements: <output> is for form-output values; this is a live-region announcing arbitrary state changes. role="status" on a generic <div> is the canonical ARIA pattern. */}
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="false">
        {state.items.length > 0 && state.items[0]?.eventType === 'added'
          ? `New file added: ${state.items[0].name}`
          : ''}
      </div>
      <RecentFeedHeader
        itemCount={visibleItems.length}
        isLive={isGit && !state.isDisconnected}
        isPaused={state.paused}
        bufferedChanges={state.buffer.length}
        onTogglePause={() => dispatch({ type: state.paused ? 'RESUME' : 'PAUSE' })}
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
          // `opacity-0` alone does NOT disable pointer events, so the
          // invisible Close button was eating clicks on the Refresh /
          // Settings icons in the header (same top-right area).
          // Pair the opacity transition with pointer-events so the button
          // only intercepts clicks once it's visible.
          'opacity-0 pointer-events-none transition-opacity',
          'hover:opacity-100 hover:pointer-events-auto',
          'focus-visible:opacity-100 focus-visible:pointer-events-auto'
        )}
        aria-label="Close recent changes feed"
      >
        Close
      </button>

      {state.isDisconnected && (
        // biome-ignore lint/a11y/useSemanticElements: <output> is for form-output values; this is a connection-status banner. role="status" on <div> is the canonical ARIA pattern for status banners.
        <div
          role="status"
          aria-live="polite"
          className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 dark:bg-amber-950/40 border-b border-amber-300/50 text-[11px] text-amber-800 dark:text-amber-300"
        >
          <span
            className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse"
            aria-hidden="true"
          />
          Live updates disconnected — existing items preserved; reconnecting…
        </div>
      )}
      {state.paused && state.buffer.length > 0 && (
        <button
          type="button"
          onClick={() => dispatch({ type: 'RESUME' })}
          className="sticky top-0 z-20 mx-auto block rounded-full bg-primary px-3 py-1 text-[11px] font-medium text-primary-foreground shadow-md hover:bg-primary/90 transition-colors my-2"
        >
          {state.buffer.length} new {state.buffer.length === 1 ? 'change' : 'changes'} — click to
          show
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
              const url = rawFileUrlFor(item);
              const preview = (() => {
                if (item.eventType === 'deleted') {
                  return (
                    <DeletedPreview
                      item={item}
                      onClearDeleted={(path) => dispatch({ type: 'CLEAR_DELETED', path })}
                    />
                  );
                }
                switch (item.kind) {
                  case 'image':
                    return <ImagePreview item={item} rawFileUrl={url} />;
                  case 'video':
                    return <VideoPreview item={item} rawFileUrl={url} />;
                  case 'audio':
                    return <AudioPreview item={item} rawFileUrl={url} />;
                  case 'markdown':
                    return <MarkdownExcerptCard item={item} worktreePath={worktreePath} />;
                  case 'code':
                    return <CodeExcerptCard item={item} worktreePath={worktreePath} />;
                  default:
                    return <BinaryPreview item={item} />;
                }
              })();
              return (
                <FeedCard
                  item={item}
                  onActivate={() => actions.open(item.path)}
                  actions={
                    <CardActions
                      filePath={item.path}
                      onCopyPath={actions.copyRelativePath}
                      onCopyAbsolutePath={actions.copyAbsolutePath}
                      onDownload={actions.download}
                      onOpen={actions.open}
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
// Re-export so the orchestrator's neighbouring code can also reach the hook.
export { useFeedActions } from './hooks/use-feed-actions';
export { useFeedKeyboard } from './hooks/use-feed-keyboard';
