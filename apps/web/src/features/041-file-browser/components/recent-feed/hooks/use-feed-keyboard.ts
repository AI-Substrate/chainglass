'use client';

/**
 * useFeedKeyboard — roving focus + per-card letter shortcuts.
 *
 * Workshop §3 + AC H2 binding shortcuts:
 *   - ArrowUp / ArrowDown — move focus between cards.
 *   - Enter — invoke `open` on the focused card.
 *   - `c` — copyRelativePath
 *   - `Shift+C` (`C`) — copyAbsolutePath
 *   - `d` — download
 *   - `r` — revealInTree
 *   - `m` — copyMarkdownLink
 *
 * Returns a single `onKeyDown` handler the orchestrator attaches at the
 * feed-root level; the focused card is determined by `document.activeElement`.
 *
 * Plan recent-changes-feed T026.
 */

import { useCallback } from 'react';
import type { FeedItem } from '../types';
import type { FeedActions } from './use-feed-actions';

export interface UseFeedKeyboardOptions {
  visibleItems: FeedItem[];
  actions: FeedActions;
}

/**
 * Resolve the path of the currently focused feed card by walking up from
 * `document.activeElement` until we find an element with `data-feed-card-path`
 * (set on each FeedCard's wrapper). Returns null when focus is outside the feed.
 */
function focusedCardPath(): string | null {
  if (typeof document === 'undefined') return null;
  let el: Element | null = document.activeElement;
  while (el && el !== document.body) {
    const path = (el as HTMLElement).dataset?.feedCardPath;
    if (path) return path;
    el = el.parentElement;
  }
  return null;
}

/**
 * Move focus to the card at index `idx`. Wraps around at boundaries.
 */
function focusCardAtIndex(items: FeedItem[], idx: number): void {
  if (typeof document === 'undefined' || items.length === 0) return;
  const wrapped = ((idx % items.length) + items.length) % items.length;
  const target = items[wrapped];
  if (!target) return;
  const el = document.querySelector<HTMLElement>(
    `[data-feed-card-path="${CSS.escape(target.path)}"]`
  );
  el?.focus();
}

export function useFeedKeyboard({ visibleItems, actions }: UseFeedKeyboardOptions) {
  return useCallback(
    (e: React.KeyboardEvent) => {
      // Don't intercept while the user is typing in an input.
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

      const focusedPath = focusedCardPath();
      const focusedIdx = focusedPath ? visibleItems.findIndex((i) => i.path === focusedPath) : -1;

      switch (e.key) {
        case 'ArrowDown': {
          e.preventDefault();
          focusCardAtIndex(visibleItems, focusedIdx === -1 ? 0 : focusedIdx + 1);
          return;
        }
        case 'ArrowUp': {
          e.preventDefault();
          focusCardAtIndex(visibleItems, focusedIdx === -1 ? 0 : focusedIdx - 1);
          return;
        }
        case 'Enter': {
          if (!focusedPath) return;
          e.preventDefault();
          actions.open(focusedPath);
          return;
        }
        // Letter shortcuts only apply when a card is focused.
      }

      if (!focusedPath) return;

      // Letter shortcuts. Honour Shift for the copy-absolute case.
      if (e.key === 'c' && !e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        actions.copyRelativePath(focusedPath);
        return;
      }
      if (e.key === 'C' && e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        actions.copyAbsolutePath(focusedPath);
        return;
      }
      if (e.key === 'd' && !e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        actions.download(focusedPath);
        return;
      }
      if (e.key === 'r' && !e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        actions.revealInTree(focusedPath);
        return;
      }
      if (e.key === 'm' && !e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        actions.copyMarkdownLink(focusedPath);
        return;
      }
    },
    [visibleItems, actions]
  );
}
