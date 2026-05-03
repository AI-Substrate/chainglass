/**
 * RecentFeedFilters — multi-select category chip row. Workshop §5.
 *
 * "All" snaps the filter back to show every category; toggling individual
 * chips creates a subset. The actual set-management semantics (auto-snap
 * back to "all" when last chip is removed, etc.) live in T015's reducer
 * + T024's predicate test — this component is a dumb chip strip.
 *
 * Plan recent-changes-feed T010.
 */

'use client';

import { cn } from '@/lib/utils';

export type FilterCategory = 'all' | 'image' | 'video' | 'audio' | 'markdown' | 'code' | 'other';

export const FILTER_CATEGORIES: ReadonlyArray<{ id: FilterCategory; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'image', label: 'Images' },
  { id: 'video', label: 'Videos' },
  { id: 'audio', label: 'Audio' },
  { id: 'markdown', label: 'Markdown' },
  { id: 'code', label: 'Code' },
  { id: 'other', label: 'Other' },
];

export interface RecentFeedFiltersProps {
  active: ReadonlySet<FilterCategory>;
  onToggle: (category: FilterCategory) => void;
  className?: string;
}

export function RecentFeedFilters({ active, onToggle, className }: RecentFeedFiltersProps) {
  return (
    <div
      role="group"
      aria-label="Filter recent changes by type"
      className={cn(
        'flex items-center gap-1.5 px-3 py-2 overflow-x-auto border-b border-border bg-background',
        className
      )}
    >
      {FILTER_CATEGORIES.map(({ id, label }) => {
        const isActive = active.has(id);
        return (
          <button
            key={id}
            type="button"
            onClick={() => onToggle(id)}
            aria-pressed={isActive}
            className={cn(
              'shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-medium border transition-colors',
              'focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2',
              isActive
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-background text-muted-foreground border-border hover:bg-accent hover:text-foreground'
            )}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
