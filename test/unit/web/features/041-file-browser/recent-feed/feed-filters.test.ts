/**
 * Plan recent-changes-feed T024 — filter predicate + multi-select toggle.
 *
 * Locks workshop §5 chip semantics + the F001 HIGH fix from companion run-2:
 *   - 'All' chip toggle → snap back to every category.
 *   - Non-All chip from all-state → fresh single-chip selection
 *     (NOT delete-from-all — the F001 bug).
 *   - Subset toggle → standard add/remove.
 *   - Empty subset auto-snaps back to all.
 *   - Predicate maps FeedItemKind → category visibility correctly,
 *     including the binary/generic → 'other' bucket.
 */

import { describe, expect, it } from 'vitest';
import {
  ALL_FILTER_CATEGORIES,
  feedItemCategory,
  itemMatchesFilter,
  toggleFilterCategory,
} from '../../../../../../apps/web/src/features/041-file-browser/lib/feed-filter';
import type { FilterCategory } from '../../../../../../apps/web/src/features/041-file-browser/components/recent-feed/recent-feed-filters';
import type { FeedItem } from '../../../../../../apps/web/src/features/041-file-browser/components/recent-feed/types';

function mkItem(kind: FeedItem['kind'], path = `f.${kind}`): FeedItem {
  return {
    path,
    absolutePath: `/r/${path}`,
    name: path,
    changedAt: 1000,
    size: 100,
    kind,
    eventType: 'changed',
  };
}

describe('feedItemCategory', () => {
  it.each([
    ['image', 'image'],
    ['video', 'video'],
    ['audio', 'audio'],
    ['markdown', 'markdown'],
    ['code', 'code'],
    ['binary', 'other'],
    ['generic', 'other'],
  ])('maps kind=%s → category=%s', (kind, category) => {
    expect(feedItemCategory(mkItem(kind as FeedItem['kind']))).toBe(category);
  });
});

describe('itemMatchesFilter', () => {
  it('passes any item when active set contains "all"', () => {
    const all: ReadonlySet<FilterCategory> = ALL_FILTER_CATEGORIES;
    expect(itemMatchesFilter(mkItem('image'), all)).toBe(true);
    expect(itemMatchesFilter(mkItem('binary'), all)).toBe(true);
  });

  it('only passes items whose category is in the subset', () => {
    const onlyImages: ReadonlySet<FilterCategory> = new Set(['image']);
    expect(itemMatchesFilter(mkItem('image'), onlyImages)).toBe(true);
    expect(itemMatchesFilter(mkItem('video'), onlyImages)).toBe(false);
    expect(itemMatchesFilter(mkItem('binary'), onlyImages)).toBe(false);
  });

  it('respects the "other" bucket for binary + generic', () => {
    const onlyOther: ReadonlySet<FilterCategory> = new Set(['other']);
    expect(itemMatchesFilter(mkItem('binary'), onlyOther)).toBe(true);
    expect(itemMatchesFilter(mkItem('generic'), onlyOther)).toBe(true);
    expect(itemMatchesFilter(mkItem('image'), onlyOther)).toBe(false);
  });
});

describe('toggleFilterCategory — workshop §5 + F001 fix', () => {
  it('"All" click from any state snaps back to ALL_FILTER_CATEGORIES', () => {
    const subset: ReadonlySet<FilterCategory> = new Set(['image', 'video']);
    expect(toggleFilterCategory(subset, 'all')).toBe(ALL_FILTER_CATEGORIES);
    expect(toggleFilterCategory(ALL_FILTER_CATEGORIES, 'all')).toBe(
      ALL_FILTER_CATEGORIES
    );
  });

  it('F001 fix: clicking a non-All chip from the all-inclusive state yields a fresh single-chip subset', () => {
    const next = toggleFilterCategory(ALL_FILTER_CATEGORIES, 'image');
    expect(next.size).toBe(1);
    expect(next.has('image')).toBe(true);
    expect(next.has('all')).toBe(false);
    // Critically: NOT 'every category except image' (the broken behavior).
    expect(next.has('video')).toBe(false);
    expect(next.has('code')).toBe(false);
  });

  it('subset → adds a chip not currently active', () => {
    const subset: ReadonlySet<FilterCategory> = new Set(['image']);
    const next = toggleFilterCategory(subset, 'video');
    expect(Array.from(next).sort()).toEqual(['image', 'video']);
  });

  it('subset → removes a chip already active', () => {
    const subset: ReadonlySet<FilterCategory> = new Set(['image', 'video']);
    const next = toggleFilterCategory(subset, 'video');
    expect(Array.from(next)).toEqual(['image']);
  });

  it('subset → emptying the set auto-snaps back to all', () => {
    const subset: ReadonlySet<FilterCategory> = new Set(['image']);
    const next = toggleFilterCategory(subset, 'image');
    expect(next).toBe(ALL_FILTER_CATEGORIES);
  });

  it('does not mutate the input set', () => {
    const original: ReadonlySet<FilterCategory> = new Set(['image']);
    const beforeSize = original.size;
    toggleFilterCategory(original, 'video');
    expect(original.size).toBe(beforeSize);
  });

  it('All → Image → Video sequence (multi-step) lands on a {image, video} subset', () => {
    const step1 = toggleFilterCategory(ALL_FILTER_CATEGORIES, 'image');
    const step2 = toggleFilterCategory(step1, 'video');
    expect(Array.from(step2).sort()).toEqual(['image', 'video']);
  });

  it('Image → empty → All sequence snaps back to all (auto-snap)', () => {
    const step1 = toggleFilterCategory(ALL_FILTER_CATEGORIES, 'image'); // {image}
    const step2 = toggleFilterCategory(step1, 'image'); // empty → ALL
    expect(step2).toBe(ALL_FILTER_CATEGORIES);
  });
});
