/**
 * Recent Changes Feed — filter predicate + multi-select toggle.
 *
 * Workshop §5 chip semantics (locked by tests in T024):
 *   - "All" chip toggle → snap back to every category (all-inclusive set).
 *   - Any non-All chip toggle FROM the all-inclusive state → fresh
 *     single-category selection (NOT a delete-from-all).  This is the
 *     F001 fix: the previous logic dropped 'all' then deleted the clicked
 *     category, leaving every category EXCEPT the clicked one active.
 *   - Any non-All chip toggle WHILE in subset mode → standard add/remove.
 *   - Subset that drops to empty → auto-snap back to all (so the user
 *     always sees content).
 *
 * Plan recent-changes-feed T024.
 */

import type { FilterCategory } from '../components/recent-feed/recent-feed-filters';
import type { FeedItem } from '../components/recent-feed/types';

export const ALL_FILTER_CATEGORIES: ReadonlySet<FilterCategory> = new Set<FilterCategory>([
  'all',
  'image',
  'video',
  'audio',
  'markdown',
  'code',
  'other',
]);

/** Map a FeedItem's kind to its filter category. */
export function feedItemCategory(item: FeedItem): FilterCategory {
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
      // 'binary' and 'generic' both bucket under 'other'.
      return 'other';
  }
}

/**
 * Predicate: should this item be visible given the active filter set?
 * If 'all' is in the active set the item passes regardless. Otherwise
 * the item's category must be present.
 */
export function itemMatchesFilter(item: FeedItem, active: ReadonlySet<FilterCategory>): boolean {
  if (active.has('all')) return true;
  return active.has(feedItemCategory(item));
}

/**
 * Toggle a chip click against a previous filter state. Pure — no side
 * effects, no rendering. Returns the next active set.
 */
export function toggleFilterCategory(
  prev: ReadonlySet<FilterCategory>,
  cat: FilterCategory
): ReadonlySet<FilterCategory> {
  // 'All' chip: snap back to every category.
  if (cat === 'all') return ALL_FILTER_CATEGORIES;

  // F001 fix: transition from all-inclusive state to a single-chip subset.
  if (prev.has('all')) return new Set<FilterCategory>([cat]);

  // Subset mode: standard toggle.
  const next = new Set<FilterCategory>(prev);
  if (next.has(cat)) {
    next.delete(cat);
  } else {
    next.add(cat);
  }
  // Empty set auto-snaps back to all so users always see content.
  if (next.size === 0) return ALL_FILTER_CATEGORIES;
  return next;
}
