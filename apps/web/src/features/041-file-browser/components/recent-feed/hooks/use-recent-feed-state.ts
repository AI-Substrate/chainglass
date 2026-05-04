'use client';

/**
 * useRecentFeedState — live-merge state machine for the Recent Changes Feed.
 *
 * Plan recent-changes-feed T015. Implements:
 *  - addDir / unlinkDir filtering at intake (Finding 10).
 *  - Build-artifact path filtering at intake (Finding 06 — node_modules/**,
 *    .next/**, dist/**, build/**, .cache/**, .turbo/**, coverage/**).
 *  - Promote-to-top vs insert-new vs mark-deleted merge semantics.
 *  - Pause-buffer drain in arrival order.
 *  - Hard ceiling on `items.length` (oldest evicted).
 *  - Burst coalescing via per-frame batched dispatch (≤ 3 renders for 50
 *    events per AC G3).
 *
 * Rename-pair coalescence (Finding 11) is left as a future-friendly seam:
 * the `pushEvent` entry point is the single dispatch site, so a v2 PR can
 * insert a 200ms debounce that pairs `unlink` + `add` for the same basename
 * without rewiring callers.
 */

import { useCallback, useEffect, useReducer, useRef } from 'react';
import { detectFeedItemKind } from '../../../lib/feed-item-kind';
import type { FeedEventType, FeedItem, FeedState } from '../types';

export type RawFileChangeEventKind =
  | 'add'
  | 'change'
  | 'unlink'
  | 'addDir'
  | 'unlinkDir';

export interface RawFileChangeEvent {
  kind: RawFileChangeEventKind;
  /** Workspace-relative path. */
  path: string;
  /** Absolute filesystem path (set by the caller — feed orchestrator computes from worktreePath). */
  absolutePath: string;
  /** Optional size in bytes; omitted for unlink. Default 0. */
  size?: number;
  /** Optional mtime in ms epoch. Default Date.now(). */
  mtimeMs?: number;
}

export type FeedAction =
  | { type: 'INIT'; items: FeedItem[] }
  | { type: 'EVENT_BATCH'; events: RawFileChangeEvent[] }
  | { type: 'PAUSE' }
  | { type: 'RESUME' }
  | { type: 'CLEAR_DELETED'; path: string }
  | { type: 'SET_CEILING'; ceiling: number }
  | { type: 'SET_DISCONNECTED'; disconnected: boolean }
  | { type: 'DISMISS'; path: string };

export const DEFAULT_FEED_CEILING = 200;

/**
 * Build-artifact non-dot folders the feed never wants to surface. Dot-files
 * and dot-folders (anything starting with `.`) are filtered separately by
 * `isFilteredPath` — that catches `.next`, `.turbo`, `.cache`, `.git`,
 * `.fs2`, `.chainglass`, `.env*`, etc. without needing an exhaustive list.
 *
 * Keep this list narrow — gitignore-aware filtering (real `.gitignore`
 * parsing) is a future enhancement.
 */
const BUILD_ARTIFACT_PREFIXES: readonly string[] = [
  'node_modules/',
  'dist/',
  'build/',
  'coverage/',
];

/** Generated artifacts identified by extension only. Useful for cache files. */
const FILTERED_EXTENSIONS: ReadonlySet<string> = new Set([
  'pickle',
  'pkl',
  'pyc',
  'pyo',
]);

/**
 * Returns true when the path should be ignored entirely.
 *
 * Filters:
 *   1. Any segment beginning with `.` — covers `.git`, `.next`, `.turbo`,
 *      `.cache`, `.fs2`, `.chainglass`, `.env`, `.DS_Store`, etc.
 *   2. Build-artifact prefixes (node_modules / dist / build / coverage)
 *      whether at root or nested (`apps/web/node_modules/foo`).
 *   3. Generated cache extensions (.pickle / .pkl / .pyc / .pyo) since the
 *      feed is for human-readable change review, not bytecode noise.
 */
export function isFilteredPath(path: string): boolean {
  // Rule 1 — any dot-prefixed segment.
  if (path.split('/').some((seg) => seg.startsWith('.'))) return true;

  // Rule 2 — build-artifact non-dot folders.
  for (const prefix of BUILD_ARTIFACT_PREFIXES) {
    if (path === prefix.slice(0, -1)) return true;
    if (path.startsWith(prefix)) return true;
    if (path.includes(`/${prefix}`)) return true;
  }

  // Rule 3 — generated extensions.
  const dotIdx = path.lastIndexOf('.');
  if (dotIdx > -1) {
    const ext = path.slice(dotIdx + 1).toLowerCase();
    if (FILTERED_EXTENSIONS.has(ext)) return true;
  }

  return false;
}

/** True if the event kind should be dropped at intake (Finding 10). */
export function isIntakeFiltered(event: RawFileChangeEvent): boolean {
  if (event.kind === 'addDir' || event.kind === 'unlinkDir') return true;
  if (isFilteredPath(event.path)) return true;
  return false;
}

function eventToFeedItem(event: RawFileChangeEvent): FeedItem {
  const segs = event.path.split('/');
  const name = segs[segs.length - 1] ?? event.path;
  let eventType: FeedEventType;
  switch (event.kind) {
    case 'add':
      eventType = 'added';
      break;
    case 'unlink':
      eventType = 'deleted';
      break;
    default:
      eventType = 'changed';
      break;
  }
  return {
    path: event.path,
    absolutePath: event.absolutePath,
    name,
    changedAt: event.mtimeMs ?? Date.now(),
    size: event.size ?? 0,
    kind: detectFeedItemKind(name),
    eventType,
    deletedAt: eventType === 'deleted' ? Date.now() : undefined,
  };
}

export const initialFeedState: FeedState = {
  items: [],
  paused: false,
  buffer: [],
  ceiling: DEFAULT_FEED_CEILING,
  isLoading: true,
  isError: false,
  errorMessage: undefined,
  isDisconnected: false,
  dismissed: new Set<string>(),
};

/** Pure reducer — easily testable, no side effects. */
export function recentFeedReducer(
  state: FeedState,
  action: FeedAction
): FeedState {
  switch (action.type) {
    case 'INIT': {
      // Drop dismissed + filtered entries from the seed too.
      const items = action.items.filter(
        (it) => !state.dismissed.has(it.path) && !isFilteredPath(it.path)
      );
      return {
        ...state,
        items: items.slice(0, state.ceiling),
        isLoading: false,
        isError: false,
        errorMessage: undefined,
      };
    }

    case 'EVENT_BATCH': {
      const filtered = action.events.filter((e) => !isIntakeFiltered(e));
      if (filtered.length === 0) return state;

      // When paused, push event-derived items to the buffer (newest at
      // front). Items in the buffer never see the live `items` array
      // until RESUME fires. Within the buffer we still coalesce
      // per-path — a path that flips add → change → unlink during a
      // pause should land as a single deleted entry.
      if (state.paused) {
        let buf = [...state.buffer];
        for (const ev of filtered) {
          // If a prior buffered event for this path exists, drop it
          // first (newer event wins).
          buf = buf.filter((bi) => bi.path !== ev.path);
          buf.unshift(eventToFeedItem(ev));
        }
        return { ...state, buffer: buf };
      }

      // Live merge: process each event in order against `items`.
      let next = state.items;
      for (const ev of filtered) {
        if (state.dismissed.has(ev.path)) continue;
        const idx = next.findIndex((it) => it.path === ev.path);
        const newItem = eventToFeedItem(ev);
        if (idx === -1) {
          next = [newItem, ...next];
        } else {
          // Mutate-in-place AND promote: drop the old position, prepend the new.
          // Carry the new item's metadata.
          next = [newItem, ...next.slice(0, idx), ...next.slice(idx + 1)];
        }
      }
      // Enforce ceiling — oldest evicted (tail).
      if (next.length > state.ceiling) next = next.slice(0, state.ceiling);
      return { ...state, items: next };
    }

    case 'PAUSE':
      if (state.paused) return state;
      return { ...state, paused: true };

    case 'RESUME': {
      if (!state.paused) return state;
      // Drain buffer in order from newest (front) to oldest (back). For each
      // buffered item, apply the same merge rules: promote if exists, insert
      // otherwise. We process from the BACK of the buffer so the buffer's
      // chronological order (oldest-first when reversed) is preserved on
      // promotion. The newest buffered event ends up at index 0.
      let next = state.items;
      for (let i = state.buffer.length - 1; i >= 0; i--) {
        const item = state.buffer[i];
        if (!item) continue;
        if (state.dismissed.has(item.path)) continue;
        const idx = next.findIndex((it) => it.path === item.path);
        if (idx === -1) {
          next = [item, ...next];
        } else {
          next = [item, ...next.slice(0, idx), ...next.slice(idx + 1)];
        }
      }
      if (next.length > state.ceiling) next = next.slice(0, state.ceiling);
      return { ...state, items: next, paused: false, buffer: [] };
    }

    case 'CLEAR_DELETED': {
      const next = state.items.filter(
        (it) => !(it.path === action.path && it.eventType === 'deleted')
      );
      if (next.length === state.items.length) return state;
      return { ...state, items: next };
    }

    case 'SET_CEILING': {
      const ceiling = Math.max(1, Math.floor(action.ceiling));
      const items =
        state.items.length > ceiling ? state.items.slice(0, ceiling) : state.items;
      return { ...state, ceiling, items };
    }

    case 'SET_DISCONNECTED':
      if (state.isDisconnected === action.disconnected) return state;
      return { ...state, isDisconnected: action.disconnected };

    case 'DISMISS': {
      const dismissed = new Set(state.dismissed);
      dismissed.add(action.path);
      const items = state.items.filter((it) => it.path !== action.path);
      const buffer = state.buffer.filter((it) => it.path !== action.path);
      return { ...state, dismissed, items, buffer };
    }

    default:
      return state;
  }
}

/**
 * useRecentFeedState — React hook providing reducer state + a `pushEvent`
 * entry point that batches incoming events on the next animation frame.
 * 50 raw events arriving in a tight burst result in a single reducer call
 * (≤ 3 React renders per AC G3 — accounting for INIT + the batched event
 * dispatch + any filter/setting state changes).
 */
export function useRecentFeedState(initialOverrides: Partial<FeedState> = {}) {
  const [state, dispatch] = useReducer(recentFeedReducer, {
    ...initialFeedState,
    ...initialOverrides,
  });

  const pendingRef = useRef<RawFileChangeEvent[]>([]);
  const frameRef = useRef<number | null>(null);

  const flush = useCallback(() => {
    frameRef.current = null;
    if (pendingRef.current.length === 0) return;
    const events = pendingRef.current;
    pendingRef.current = [];
    dispatch({ type: 'EVENT_BATCH', events });
  }, []);

  const pushEvent = useCallback(
    (event: RawFileChangeEvent) => {
      pendingRef.current.push(event);
      if (frameRef.current != null) return;
      // Prefer rAF when available (browser); fall back to microtask in jsdom
      // tests / SSR harness so flushing still happens within the tick.
      if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
        frameRef.current = window.requestAnimationFrame(() => flush());
      } else {
        frameRef.current = 1;
        queueMicrotask(() => flush());
      }
    },
    [flush]
  );

  // Cancel any pending frame on unmount so we don't dispatch after teardown.
  useEffect(() => {
    return () => {
      if (
        frameRef.current != null &&
        typeof window !== 'undefined' &&
        typeof window.cancelAnimationFrame === 'function'
      ) {
        window.cancelAnimationFrame(frameRef.current);
      }
      frameRef.current = null;
      pendingRef.current = [];
    };
  }, []);

  return { state, dispatch, pushEvent, flush };
}
