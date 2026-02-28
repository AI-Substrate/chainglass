/**
 * Plan 056: StateChangeLog — Ring Buffer for State Changes
 *
 * Accumulates StateChange entries from app boot in a capped circular buffer.
 * Provides its own subscribe/version pattern for useSyncExternalStore (DYK-32).
 * Lives in _platform/state domain — it's a state observability primitive (DYK-31).
 */

import type { StateChange } from '@chainglass/shared/state';
import { createStateMatcher } from '@chainglass/shared/state';

type ChangeLogListener = () => void;

export class StateChangeLog {
  private entries: StateChange[] = [];
  private _version = 0;
  private listeners = new Set<ChangeLogListener>();

  constructor(private readonly cap: number = 500) {}

  /** Append a state change. FIFO evicts oldest when at cap. */
  append(change: StateChange): void {
    if (this.entries.length >= this.cap) {
      this.entries.shift();
    }
    this.entries.push(change);
    this._version++;
    this.notify();
  }

  /** Get entries, optionally filtered by pattern and limited. */
  getEntries(pattern?: string, limit?: number): StateChange[] {
    let result = this.entries;

    if (pattern) {
      const matcher = createStateMatcher(pattern);
      result = result.filter((e) => matcher(e.path));
    }

    if (limit !== undefined && limit < result.length) {
      result = result.slice(-limit);
    }

    return result;
  }

  /** Clear all entries. */
  clear(): void {
    this.entries = [];
    this._version++;
    this.notify();
  }

  /** Number of entries in the buffer. */
  get size(): number {
    return this.entries.length;
  }

  /** Monotonic version counter — increments on append and clear. */
  get version(): number {
    return this._version;
  }

  /** Maximum capacity. */
  get capacity(): number {
    return this.cap;
  }

  /** Subscribe to changes. Returns unsubscribe function. */
  subscribe(listener: ChangeLogListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}
