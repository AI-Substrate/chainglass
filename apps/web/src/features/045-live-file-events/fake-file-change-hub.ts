/**
 * Plan 045: Live File Events
 *
 * Fake FileChangeHub for testing components that use useFileChanges.
 * Records dispatches and provides test hooks for inspection.
 *
 * Per Constitution Principle 4: Use fakes over mocks for testing.
 * Must pass the same contract tests as the real FileChangeHub.
 */

import type { FileChange, FileChangeCallback } from './file-change.types';

interface Subscription {
  id: string;
  pattern: string;
  callback: FileChangeCallback;
}

export class FakeFileChangeHub {
  private readonly subscriptions = new Map<string, Subscription>();
  private nextId = 0;

  /** All batches dispatched (for test inspection) */
  public readonly dispatchedBatches: FileChange[][] = [];

  subscribe(pattern: string, callback: FileChangeCallback): () => void {
    const id = `sub_${this.nextId++}`;
    this.subscriptions.set(id, { id, pattern, callback });
    return () => {
      this.subscriptions.delete(id);
    };
  }

  /**
   * Dispatch changes to subscribers. Uses same pattern matching as real hub.
   */
  dispatch(changes: FileChange[]): void {
    this.dispatchedBatches.push(changes);
    if (changes.length === 0) return;

    for (const [, sub] of this.subscriptions) {
      const matcher = createMatcher(sub.pattern);
      const matching = changes.filter((c) => matcher(c.path));
      if (matching.length > 0) {
        try {
          sub.callback(matching);
        } catch (err) {
          console.warn('[FakeFileChangeHub] Subscriber threw', err);
        }
      }
    }
  }

  get subscriberCount(): number {
    return this.subscriptions.size;
  }

  /** Get patterns of all active subscriptions (for test inspection). */
  get activePatterns(): string[] {
    return [...this.subscriptions.values()].map((s) => s.pattern);
  }

  /** Clear recorded dispatches. */
  reset(): void {
    this.dispatchedBatches.length = 0;
  }
}

// Same pattern matching logic as real hub
function createMatcher(pattern: string): (path: string) => boolean {
  if (pattern === '*') return () => true;
  if (pattern.endsWith('/**')) {
    const prefix = pattern.slice(0, -3);
    return (path) => path.startsWith(`${prefix}/`) || path === prefix;
  }
  if (pattern.endsWith('/')) {
    return (path) => {
      if (!path.startsWith(pattern)) return false;
      return !path.slice(pattern.length).includes('/');
    };
  }
  return (path) => path === pattern;
}
