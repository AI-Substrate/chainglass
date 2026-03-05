/**
 * Plan 059 Phase 3: Agent UI Constants
 *
 * Z-index hierarchy, localStorage storage keys, and safe storage helpers.
 *
 * Z-index contract (DYK-P3-05):
 * - shadcn/Radix Dialog uses z-50 for both backdrop and content
 * - Agent overlay sits at z-45 (below dialogs, above content)
 * - Top bar at z-40 (sticky, above page content)
 * - Verified: overlay + dialog open/close cycle works correctly
 */

// ── Z-Index Hierarchy ──

export const Z_INDEX = {
  /** Page content (default) */
  CONTENT: 0,
  /** Toast notifications */
  TOAST: 10,
  /** Top bar (sticky above content) */
  TOP_BAR: 40,
  /** Agent overlay panel (fixed, below modals) */
  OVERLAY: 45,
  /** Modal dialogs — matches shadcn Dialog z-50 */
  MODAL: 50,
  /** Tooltips */
  TOOLTIP: 60,
  /** Screen border flash effect (CSS animation, no z-index needed) */
  FLASH: 'box-shadow',
} as const;

// ── Storage Keys (version-namespaced) ──

export const STORAGE_KEYS = {
  /** Dismissed agent IDs per worktree */
  dismissed: (worktreeSlug: string) => `chainglass:agents:dismissed:v1:${worktreeSlug}`,
  /** Top bar expanded/collapsed state (reuses v1 key for backward compat — DYK-FX005-03) */
  chipBarExpanded: 'chainglass:agents:chip-bar-expanded:v1',
} as const;

// ── Safe localStorage Helpers ──

/**
 * Read JSON from localStorage. Returns fallback on any error.
 */
export function readStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/**
 * Write JSON to localStorage. Silently fails on QuotaExceededError
 * or any other storage error.
 */
export function writeStorage<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // QuotaExceededError or SecurityError — best-effort persistence
  }
}

/**
 * Remove a key from localStorage. Silently fails on error.
 */
export function removeStorage(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // SecurityError in some contexts — ignore
  }
}
