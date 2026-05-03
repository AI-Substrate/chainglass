'use client';

/**
 * RecentFeedView — top-level orchestrator for the Recent Changes Feed.
 *
 * T012 wiring: seeds via `fetchRecentFeedItems` (git log + fs.stat) on mount;
 * renders the static UI primitives (header, filters, list, empty/error/skeleton)
 * and dispatches per-card preview based on `FeedItem.kind`.
 *
 * Live merge (SSE-driven promotions) lands at T015/T016. Markdown / code
 * excerpt cards land at T021/T022 — until then those kinds fall through to
 * the binary preview.
 */

import { fetchRecentFeedItems } from '../../../../../app/actions/file-actions';
import { cn } from '@/lib/utils';
import { useCallback, useEffect, useState } from 'react';
import { CardActions } from '../preview-cards/card-actions';
import { FeedCard } from './feed-card';
import { FeedEmptyState } from './feed-empty-state';
import { FeedErrorState } from './feed-error-state';
import { FeedSkeleton } from './feed-skeleton';
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
  const [items, setItems] = useState<FeedItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [seedError, setSeedError] = useState<{ message: string; detail?: string } | null>(
    null
  );
  const [isPaused, setIsPaused] = useState(false);
  const [activeFilters, setActiveFilters] = useState<ReadonlySet<FilterCategory>>(
    ALL_CATEGORIES
  );

  const loadSeed = useCallback(async () => {
    setIsLoading(true);
    setSeedError(null);
    try {
      const result = await fetchRecentFeedItems(worktreePath, 50);
      if (result.ok) {
        setItems(result.items);
      } else {
        setSeedError({
          message: 'Cannot seed from git history',
          detail: 'This workspace is not a git repository — no historical change order is available.',
        });
        setItems([]);
      }
    } catch (err) {
      setSeedError({
        message: 'Failed to load recent changes',
        detail: err instanceof Error ? err.message : undefined,
      });
      setItems([]);
    } finally {
      setIsLoading(false);
    }
  }, [worktreePath]);

  useEffect(() => {
    void loadSeed();
  }, [loadSeed]);

  const handleToggleFilter = useCallback((cat: FilterCategory) => {
    setActiveFilters((prev) => {
      // 'all' chip: snap back to every category (workshop §5).
      if (cat === 'all') return ALL_CATEGORIES;
      const next = new Set<FilterCategory>(
        // Toggling a non-all chip drops 'all' from the active set so the
        // chip strip visually reflects the subset selection.
        Array.from(prev).filter((c) => c !== 'all')
      );
      if (next.has(cat)) {
        next.delete(cat);
      } else {
        next.add(cat);
      }
      // Empty subset auto-snaps back to 'all' so the user always sees content.
      if (next.size === 0) return ALL_CATEGORIES;
      return next;
    });
  }, []);

  const showAll = activeFilters.has('all');
  const visibleItems = showAll
    ? items
    : items.filter((item) => activeFilters.has(itemCategory(item)));

  const rawFileUrlFor = (path: string) =>
    `/api/workspaces/${slug}/files/raw?worktree=${encodeURIComponent(worktreePath)}&file=${encodeURIComponent(path)}`;

  const handleCopyRel = useCallback((path: string) => {
    void navigator.clipboard?.writeText(path);
  }, []);
  const handleCopyAbs = useCallback((path: string) => {
    const item = items.find((i) => i.path === path);
    if (item) void navigator.clipboard?.writeText(item.absolutePath);
  }, [items]);
  const handleDownload = useCallback(
    (path: string) => {
      window.open(`${rawFileUrlFor(path)}&download=true`, '_blank', 'noopener,noreferrer');
    },
    // rawFileUrlFor is stable per (slug, worktreePath); both are props
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [slug, worktreePath]
  );
  const handleOpenItem = useCallback(
    (path: string) => {
      // Opening from the feed: defer to the URL params handler. The
      // browser-client view branch closes the feed when `view` clears.
      // T025 will wire this through useFeedActions; for T012 we emit
      // a bridge event the orchestrator's parent can listen for.
      window.dispatchEvent(
        new CustomEvent('recent-feed:open-file', { detail: { path } })
      );
    },
    []
  );

  return (
    <div role="feed" aria-busy={isLoading} className="flex flex-col h-full overflow-hidden">
      <RecentFeedHeader
        itemCount={visibleItems.length}
        isLive={isGit}
        isPaused={isPaused}
        onTogglePause={() => setIsPaused((p) => !p)}
        onRefresh={loadSeed}
        onOpenSettings={() => {
          // T028 wires the settings sheet/dialog open. For T012 we just
          // dispatch a bridge event so the entrypoint logic can land later.
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

      <div className="flex-1 overflow-y-auto">
        {isLoading && <FeedSkeleton count={5} />}
        {!isLoading && seedError && (
          <FeedErrorState
            message={seedError.message}
            detail={seedError.detail}
            onRetry={loadSeed}
          />
        )}
        {!isLoading && !seedError && visibleItems.length === 0 && (
          <FeedEmptyState filtered={!showAll && activeFilters.size > 0} />
        )}
        {!isLoading && !seedError && visibleItems.length > 0 && (
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
                    // T021/T022 will replace these with the real excerpt cards.
                    // For T012 we render the binary placeholder so cards still appear.
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
