/**
 * WorkflowEventObserverRegistry — In-memory, per-graph observer registry.
 *
 * Stored on globalThis for HMR survival (Finding 06).
 * Per-handler error isolation (consistent with FakeWorkflowEventsService).
 */

type ObserverHandler = (event: unknown) => void;

const GLOBAL_KEY = '__workflowEventObservers' as const;

function getGlobalRegistry(): Map<string, Set<ObserverHandler>> {
  const g = globalThis as Record<string, unknown>;
  if (!g[GLOBAL_KEY]) {
    g[GLOBAL_KEY] = new Map<string, Set<ObserverHandler>>();
  }
  return g[GLOBAL_KEY] as Map<string, Set<ObserverHandler>>;
}

export class WorkflowEventObserverRegistry {
  private get observers(): Map<string, Set<ObserverHandler>> {
    return getGlobalRegistry();
  }

  /**
   * Subscribe to events for a specific graph and event kind.
   * Returns an unsubscribe function (AC-09).
   */
  subscribe(graphSlug: string, kind: string, handler: ObserverHandler): () => void {
    const key = `${graphSlug}:${kind}`;
    const set = this.observers.get(key);
    if (set) {
      set.add(handler);
    } else {
      this.observers.set(key, new Set([handler]));
    }
    return () => {
      const s = this.observers.get(key);
      if (s) {
        s.delete(handler);
        if (s.size === 0) this.observers.delete(key);
      }
    };
  }

  /**
   * Notify all observers for a specific graph and event kind.
   * Per-handler error isolation — one failing handler doesn't block others.
   */
  notify(graphSlug: string, kind: string, event: unknown): void {
    const key = `${graphSlug}:${kind}`;
    const handlers = this.observers.get(key);
    if (!handlers) return;
    for (const handler of handlers) {
      try {
        handler(event);
      } catch {
        // Per-handler error isolation (consistent with Fake, ServerEventRoute F003)
      }
    }
  }

  /** Get total observer count across all keys */
  getObserverCount(): number {
    let count = 0;
    for (const set of this.observers.values()) {
      count += set.size;
    }
    return count;
  }

  /** Get observer count for a specific graph and kind */
  getObserverCountFor(graphSlug: string, kind: string): number {
    return this.observers.get(`${graphSlug}:${kind}`)?.size ?? 0;
  }

  /** Clear all observers (useful for testing) */
  clear(): void {
    this.observers.clear();
  }
}
