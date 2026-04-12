'use client';

/**
 * Title Manager — SDK service for composable browser tab titles.
 *
 * Multiple features can contribute to the title without fighting.
 * Title is composed as: {prefixes} {base}
 *
 * Features register prefix slots (e.g. "attention", "notification")
 * and a single base title. The manager composes them in priority order.
 *
 * Usage:
 *   const title = useTitleManager();
 *   title.setBase('🔧 Browser');              // sets the base title
 *   title.setPrefix('notification', '❓');     // adds ❓ prefix
 *   title.clearPrefix('notification');          // removes it
 *
 * All updates go through one place — no MutationObserver fights.
 */

import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';

// ── Singleton Store ──

interface TitleState {
  base: string;
  prefixes: Map<string, string>;
}

const state: TitleState = {
  base: '',
  prefixes: new Map(),
};

const listeners = new Set<() => void>();

function notify() {
  // Compose and apply title
  const prefixStr = Array.from(state.prefixes.values()).join(' ');
  const title = prefixStr ? `${prefixStr} ${state.base}` : state.base;
  if (title && typeof document !== 'undefined') {
    document.title = title;
  }
  for (const fn of listeners) fn();
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function getSnapshot(): string {
  const prefixStr = Array.from(state.prefixes.values()).join(' ');
  return prefixStr ? `${prefixStr} ${state.base}` : state.base;
}

// ── Public API ──

export function setTitleBase(base: string): void {
  if (state.base !== base) {
    state.base = base;
    notify();
  }
}

export function setTitlePrefix(slot: string, prefix: string): void {
  if (state.prefixes.get(slot) !== prefix) {
    state.prefixes.set(slot, prefix);
    notify();
  }
}

export function clearTitlePrefix(slot: string): void {
  if (state.prefixes.has(slot)) {
    state.prefixes.delete(slot);
    notify();
  }
}

/** Reset all state. For testing only. */
export function resetTitleManager(): void {
  state.base = '';
  state.prefixes.clear();
}

// ── Hook ──

export interface TitleManagerActions {
  /** Set the base title (e.g. "🔧 Browser") */
  setBase: (base: string) => void;
  /** Set a named prefix slot (e.g. "notification", "❓") */
  setPrefix: (slot: string, prefix: string) => void;
  /** Clear a named prefix slot */
  clearPrefix: (slot: string) => void;
  /** Current composed title */
  title: string;
}

/**
 * Hook for reading/writing the composed browser title.
 * Multiple callers can set prefixes and base without conflicts.
 */
export function useTitleManager(): TitleManagerActions {
  const title = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  return {
    title,
    setBase: setTitleBase,
    setPrefix: setTitlePrefix,
    clearPrefix: clearTitlePrefix,
  };
}

/**
 * Hook that sets the base title and optional attention prefix.
 * Drop-in replacement for useAttentionTitle that goes through the title manager.
 */
export function useManagedTitle(options: {
  emoji: string;
  pageName: string;
  workspaceName?: string;
  needsAttention?: boolean;
}) {
  const { emoji, pageName, workspaceName, needsAttention } = options;

  useEffect(() => {
    const prefix = emoji || (workspaceName ? workspaceName.substring(0, 2).toUpperCase() : '');
    const base = `${prefix} ${pageName}`.trim();
    if (base) setTitleBase(base);

    if (needsAttention) {
      setTitlePrefix('attention', '❗');
    } else {
      clearTitlePrefix('attention');
    }

    return () => clearTitlePrefix('attention');
  }, [emoji, pageName, workspaceName, needsAttention]);
}
