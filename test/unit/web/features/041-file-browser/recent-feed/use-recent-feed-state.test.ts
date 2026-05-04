/**
 * Plan recent-changes-feed T015 — TDD live-merge reducer.
 *
 * Coverage:
 *  - INIT seeds items + drops dismissed + drops filtered paths.
 *  - EVENT_BATCH single change → promote existing item to top.
 *  - EVENT_BATCH new add → insert at top.
 *  - EVENT_BATCH unlink → mark deleted (eventType='deleted', deletedAt set).
 *  - addDir / unlinkDir filtered at intake (Finding 10).
 *  - Build-artifact paths (node_modules/**, .next/**, dist/**, build/**,
 *    .cache/**, .turbo/**, coverage/**) filtered at intake (Finding 06).
 *  - Burst of 50 events → exactly 1 reducer dispatch (covers AC G3 on the
 *    state-machine side; rAF batching is tested via the hook in a separate
 *    suite).
 *  - PAUSE buffers events; RESUME drains in arrival order.
 *  - Ceiling enforcement: items.length capped, oldest evicted.
 *  - CLEAR_DELETED removes only deleted entries with the matching path.
 *  - DISMISS adds path to dismissed set, removes from items + buffer, and
 *    blocks subsequent events for that path.
 */

import { describe, expect, it } from 'vitest';
import {
  isFilteredPath,
  isIntakeFiltered,
  initialFeedState,
  recentFeedReducer,
  type FeedAction,
  type RawFileChangeEvent,
} from '../../../../../../apps/web/src/features/041-file-browser/components/recent-feed/hooks/use-recent-feed-state';
import type { FeedItem } from '../../../../../../apps/web/src/features/041-file-browser/components/recent-feed/types';

function mkItem(path: string, overrides: Partial<FeedItem> = {}): FeedItem {
  const segs = path.split('/');
  return {
    path,
    absolutePath: `/repo/${path}`,
    name: segs[segs.length - 1] ?? path,
    changedAt: 1000,
    size: 100,
    kind: 'code',
    eventType: 'changed',
    ...overrides,
  };
}

function mkEvent(
  kind: RawFileChangeEvent['kind'],
  path: string,
  overrides: Partial<RawFileChangeEvent> = {}
): RawFileChangeEvent {
  return {
    kind,
    path,
    absolutePath: `/repo/${path}`,
    size: 200,
    mtimeMs: 2000,
    ...overrides,
  };
}

describe('isFilteredPath', () => {
  it.each([
    ['node_modules/foo/index.js', true],
    ['node_modules/.bin/eslint', true],
    ['.next/static/chunks/main.js', true],
    ['.turbo/cache/abc.json', true],
    ['.cache/something', true],
    ['dist/index.js', true],
    ['build/app.bundle.js', true],
    ['coverage/lcov-report/index.html', true],
    // Nested forms — common in monorepos.
    ['apps/web/node_modules/foo', true],
    ['packages/shared/.next/build.json', true],
    ['apps/web/dist/index.js', true],
    // Dot-prefixed paths/folders are now ALWAYS filtered (any segment that
    // starts with a `.` — covers .git, .next, .turbo, .cache, .fs2,
    // .chainglass, .env, .eslintrc.json, .DS_Store, etc.).
    ['.eslintrc.json', true],
    ['.fs2/cache.bin', true],
    ['.chainglass/workspaces.json', true],
    ['apps/web/.eslintrc.json', true],
    // Generated cache extensions filtered.
    ['models/graph.pickle', true],
    ['cache/state.pkl', true],
    ['__pycache__/foo.pyc', true],
    // .tmp.* and trailing .tmp filtered.
    ['state.tmp.json', true],
    ['cache/data.tmp.yaml', true],
    ['draft.tmp', true],
    // …but '.tmp' as a segment substring elsewhere is fine.
    ['attempt-1/file.txt', false],
    // Paths that must NOT be filtered.
    ['src/components/foo.tsx', false],
    ['docs/recent-changes-feed.md', false],
    ['notes-distinct/file.txt', false], // 'dist' as substring, not segment
    ['build-tools/script.sh', false], // 'build' as substring, not segment
  ])('isFilteredPath(%s) === %s', (path, expected) => {
    expect(isFilteredPath(path)).toBe(expected);
  });
});

describe('isIntakeFiltered', () => {
  it('drops addDir and unlinkDir kinds outright', () => {
    expect(isIntakeFiltered(mkEvent('addDir', 'src/new-folder'))).toBe(true);
    expect(isIntakeFiltered(mkEvent('unlinkDir', 'src/old-folder'))).toBe(true);
  });
  it('drops events whose path is filtered', () => {
    expect(isIntakeFiltered(mkEvent('add', 'node_modules/foo.js'))).toBe(true);
  });
  it('passes ordinary file events', () => {
    expect(isIntakeFiltered(mkEvent('change', 'src/foo.ts'))).toBe(false);
  });
});

describe('recentFeedReducer — INIT', () => {
  it('seeds items, clears isLoading, drops filtered + dismissed paths', () => {
    const startState = {
      ...initialFeedState,
      dismissed: new Set<string>(['src/dismissed.ts']),
    };
    const next = recentFeedReducer(startState, {
      type: 'INIT',
      items: [
        mkItem('src/keep.ts'),
        mkItem('node_modules/foo.js'),
        mkItem('src/dismissed.ts'),
        mkItem('docs/notes.md'),
      ],
    });
    expect(next.items.map((i) => i.path)).toEqual(['src/keep.ts', 'docs/notes.md']);
    expect(next.isLoading).toBe(false);
    expect(next.isError).toBe(false);
  });
  it('caps initial seed at the ceiling', () => {
    const items = Array.from({ length: 250 }, (_, i) => mkItem(`src/f${i}.ts`));
    const next = recentFeedReducer(initialFeedState, { type: 'INIT', items });
    expect(next.items.length).toBe(initialFeedState.ceiling);
  });
});

describe('recentFeedReducer — EVENT_BATCH live merge', () => {
  const seeded = recentFeedReducer(initialFeedState, {
    type: 'INIT',
    items: [mkItem('src/old.ts'), mkItem('docs/notes.md'), mkItem('src/keep.ts')],
  });

  it('promotes existing item to the top on `change`', () => {
    const next = recentFeedReducer(seeded, {
      type: 'EVENT_BATCH',
      events: [mkEvent('change', 'src/keep.ts', { mtimeMs: 9999 })],
    });
    expect(next.items[0]?.path).toBe('src/keep.ts');
    expect(next.items[0]?.changedAt).toBe(9999);
    expect(next.items[0]?.eventType).toBe('changed');
    // No duplicates.
    expect(next.items.filter((i) => i.path === 'src/keep.ts').length).toBe(1);
    expect(next.items.length).toBe(3);
  });

  it('inserts a brand-new path at the top on `add`', () => {
    const next = recentFeedReducer(seeded, {
      type: 'EVENT_BATCH',
      events: [mkEvent('add', 'src/new.ts')],
    });
    expect(next.items[0]?.path).toBe('src/new.ts');
    expect(next.items[0]?.eventType).toBe('added');
    expect(next.items.length).toBe(4);
  });

  it('marks an existing path as deleted on `unlink` and sets deletedAt', () => {
    const before = Date.now();
    const next = recentFeedReducer(seeded, {
      type: 'EVENT_BATCH',
      events: [mkEvent('unlink', 'docs/notes.md')],
    });
    const item = next.items.find((i) => i.path === 'docs/notes.md');
    expect(item?.eventType).toBe('deleted');
    expect(item?.deletedAt).toBeGreaterThanOrEqual(before);
  });

  it('drops addDir / unlinkDir events at intake (Finding 10)', () => {
    const next = recentFeedReducer(seeded, {
      type: 'EVENT_BATCH',
      events: [
        mkEvent('addDir', 'src/new-folder'),
        mkEvent('unlinkDir', 'src/old-folder'),
      ],
    });
    // No items added or removed — state unchanged.
    expect(next).toBe(seeded);
  });

  it('drops build-artifact paths at intake (Finding 06)', () => {
    const next = recentFeedReducer(seeded, {
      type: 'EVENT_BATCH',
      events: [
        mkEvent('change', 'node_modules/foo/index.js'),
        mkEvent('add', '.next/static/chunks/main.js'),
        mkEvent('change', 'apps/web/dist/index.js'),
        // One real event mixed in — should still land.
        mkEvent('add', 'src/real.ts'),
      ],
    });
    expect(next.items[0]?.path).toBe('src/real.ts');
    expect(next.items.find((i) => i.path.startsWith('node_modules'))).toBeUndefined();
    expect(next.items.find((i) => i.path.startsWith('.next'))).toBeUndefined();
    expect(next.items.find((i) => i.path.includes('dist/'))).toBeUndefined();
  });

  it('processes a burst of 50 events in a single reducer call (AC G3)', () => {
    const events = Array.from({ length: 50 }, (_, i) =>
      mkEvent('add', `src/burst-${i}.ts`)
    );
    // The whole burst is one EVENT_BATCH dispatch — that's the contract.
    const next = recentFeedReducer(seeded, { type: 'EVENT_BATCH', events });
    // 3 seeded + 50 new = 53.
    expect(next.items.length).toBe(53);
    // Newest from the burst = burst-49 (last in `events` array, processed last,
    // ends up at the top via [newItem, ...]).
    expect(next.items[0]?.path).toBe('src/burst-49.ts');
  });

  it('respects the ceiling and evicts oldest entries', () => {
    let state = recentFeedReducer(
      { ...initialFeedState, ceiling: 5 },
      {
        type: 'INIT',
        items: Array.from({ length: 5 }, (_, i) => mkItem(`f${i}.ts`)),
      }
    );
    // Burst of 10 new files — only the newest 5 survive.
    state = recentFeedReducer(state, {
      type: 'EVENT_BATCH',
      events: Array.from({ length: 10 }, (_, i) =>
        mkEvent('add', `new${i}.ts`)
      ),
    });
    expect(state.items.length).toBe(5);
    expect(state.items[0]?.path).toBe('new9.ts');
    expect(state.items[4]?.path).toBe('new5.ts');
  });

  it('skips events for already-dismissed paths', () => {
    const dismissed = recentFeedReducer(seeded, {
      type: 'DISMISS',
      path: 'src/keep.ts',
    });
    const next = recentFeedReducer(dismissed, {
      type: 'EVENT_BATCH',
      events: [mkEvent('change', 'src/keep.ts')],
    });
    expect(next.items.find((i) => i.path === 'src/keep.ts')).toBeUndefined();
  });
});

describe('recentFeedReducer — PAUSE / RESUME', () => {
  const seeded = recentFeedReducer(initialFeedState, {
    type: 'INIT',
    items: [mkItem('src/a.ts'), mkItem('src/b.ts')],
  });

  it('PAUSE freezes items, RESUME drains the buffer in arrival order', () => {
    let state = recentFeedReducer(seeded, { type: 'PAUSE' });
    expect(state.paused).toBe(true);

    // Three events arrive while paused.
    state = recentFeedReducer(state, {
      type: 'EVENT_BATCH',
      events: [
        mkEvent('add', 'src/c.ts'),
        mkEvent('change', 'src/a.ts'),
        mkEvent('add', 'src/d.ts'),
      ],
    });
    // Items are unchanged; buffer holds the 3 events.
    expect(state.items.map((i) => i.path)).toEqual(['src/a.ts', 'src/b.ts']);
    expect(state.buffer.map((i) => i.path)).toEqual([
      'src/d.ts',
      'src/a.ts',
      'src/c.ts',
    ]);

    // RESUME drains in chronological arrival order: c, then a (promoted),
    // then d ends up on top.
    state = recentFeedReducer(state, { type: 'RESUME' });
    expect(state.paused).toBe(false);
    expect(state.buffer).toEqual([]);
    expect(state.items[0]?.path).toBe('src/d.ts'); // newest from buffer
    expect(state.items[1]?.path).toBe('src/a.ts'); // promoted
    expect(state.items[2]?.path).toBe('src/c.ts'); // first buffered event
    expect(state.items[3]?.path).toBe('src/b.ts'); // untouched seed
  });

  it('coalesces multiple buffered events for the same path (newest wins)', () => {
    let state = recentFeedReducer(seeded, { type: 'PAUSE' });
    state = recentFeedReducer(state, {
      type: 'EVENT_BATCH',
      events: [
        mkEvent('add', 'src/x.ts', { mtimeMs: 100 }),
        mkEvent('change', 'src/x.ts', { mtimeMs: 200 }),
        mkEvent('unlink', 'src/x.ts'),
      ],
    });
    expect(state.buffer.length).toBe(1);
    expect(state.buffer[0]?.path).toBe('src/x.ts');
    // Latest event was unlink → buffered as deleted.
    expect(state.buffer[0]?.eventType).toBe('deleted');
  });
});

describe('recentFeedReducer — CLEAR_DELETED + SET_CEILING + DISMISS', () => {
  it('CLEAR_DELETED only removes deleted entries with the matching path', () => {
    const state: typeof initialFeedState = {
      ...initialFeedState,
      items: [
        mkItem('src/deleted.ts', { eventType: 'deleted', deletedAt: 100 }),
        mkItem('src/changed.ts', { eventType: 'changed' }),
      ],
    };
    const next = recentFeedReducer(state, {
      type: 'CLEAR_DELETED',
      path: 'src/deleted.ts',
    });
    expect(next.items.map((i) => i.path)).toEqual(['src/changed.ts']);

    // CLEAR_DELETED on a non-deleted path is a no-op.
    const noop = recentFeedReducer(next, {
      type: 'CLEAR_DELETED',
      path: 'src/changed.ts',
    });
    expect(noop).toBe(next);
  });

  it('SET_CEILING trims items if necessary', () => {
    const state = {
      ...initialFeedState,
      items: Array.from({ length: 10 }, (_, i) => mkItem(`f${i}.ts`)),
    };
    const next = recentFeedReducer(state, { type: 'SET_CEILING', ceiling: 4 });
    expect(next.ceiling).toBe(4);
    expect(next.items.length).toBe(4);
  });

  it('DISMISS removes path from items + buffer and adds to dismissed set', () => {
    const state: typeof initialFeedState = {
      ...initialFeedState,
      items: [mkItem('src/foo.ts')],
      buffer: [mkItem('src/foo.ts'), mkItem('src/bar.ts')],
    };
    const next = recentFeedReducer(state, { type: 'DISMISS', path: 'src/foo.ts' });
    expect(next.dismissed.has('src/foo.ts')).toBe(true);
    expect(next.items.find((i) => i.path === 'src/foo.ts')).toBeUndefined();
    expect(next.buffer.find((i) => i.path === 'src/foo.ts')).toBeUndefined();
    // bar.ts in buffer untouched.
    expect(next.buffer.length).toBe(1);
  });
});
