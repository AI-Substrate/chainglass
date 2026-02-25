/**
 * Plan 045: Live File Events
 *
 * Client-side event hub that receives file change events from SSE
 * and dispatches them to subscribers based on path patterns.
 *
 * Per Workshop 01: Single hub per worktree, client-side fan-out.
 * Per PL-03: Callback-set pattern (subscribe → unsubscribe fn), not EventEmitter.
 *
 * Pattern types:
 * - Exact: 'src/App.tsx' → matches only that path
 * - Directory: 'src/components/' → direct children only (non-recursive)
 * - Recursive: 'src/**' → all descendants
 * - Wildcard: '*' → matches everything
 */

import type { FileChange, FileChangeCallback, IFileChangeHub } from './file-change.types';
import { createMatcher } from './path-matcher';

interface Subscription {
  id: string;
  matcher: (path: string) => boolean;
  callback: FileChangeCallback;
}

export class FileChangeHub implements IFileChangeHub {
  private readonly subscriptions = new Map<string, Subscription>();
  private nextId = 0;

  /**
   * Subscribe to file changes matching a pattern.
   *
   * @param pattern - Path pattern to match:
   *   - `'src/App.tsx'` → exact file match
   *   - `'src/components/'` → direct children only (trailing slash)
   *   - `'src/**'` → all descendants recursively
   *   - `'*'` → all changes
   * @param callback - Called with matching changes (filtered subset)
   * @returns Unsubscribe function
   */
  subscribe(pattern: string, callback: FileChangeCallback): () => void {
    const id = `sub_${this.nextId++}`;
    const matcher = createMatcher(pattern);
    this.subscriptions.set(id, { id, matcher, callback });
    return () => {
      this.subscriptions.delete(id);
    };
  }

  /**
   * Dispatch file change events to matching subscribers.
   * Each subscriber receives only the subset of changes that match its pattern.
   */
  dispatch(changes: FileChange[]): void {
    if (changes.length === 0) return;

    for (const [, sub] of this.subscriptions) {
      const matching = changes.filter((c) => sub.matcher(c.path));
      if (matching.length > 0) {
        try {
          sub.callback(matching);
        } catch (err) {
          console.warn('[FileChangeHub] Subscriber threw', err);
        }
      }
    }
  }

  /** Number of active subscriptions (for diagnostics). */
  get subscriberCount(): number {
    return this.subscriptions.size;
  }
}
