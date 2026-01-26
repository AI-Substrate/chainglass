/**
 * FakeMatchMedia - Test double for browser window.matchMedia API
 *
 * Provides an in-memory implementation of the matchMedia interface
 * for testing responsive hooks without browser dependencies.
 *
 * Follows the FakeEventSource exemplar pattern from Phase 2.
 *
 * Key features:
 * - Maintains independent state per query string
 * - Supports both modern (addEventListener) and deprecated (addListener) APIs
 * - Evaluates min-width, max-width, and range queries
 * - Fires change events only when conditions transition
 *
 * @example
 * const fake = new FakeMatchMedia(1024);
 * const mql = fake.matchMedia('(max-width: 767px)');
 * expect(mql.matches).toBe(false);
 *
 * fake.setViewportWidth(400);
 * // Listener fires with { matches: true }
 */

export class FakeMatchMedia {
  private mediaQueryStates: Record<string, boolean> = {};
  private listeners: Record<string, Set<(e: MediaQueryListEvent) => void>> = {};
  private currentWidth: number;

  constructor(initialWidth = 1024) {
    this.currentWidth = initialWidth;
  }

  /**
   * Creates a MediaQueryList object for the given query.
   * Mimics window.matchMedia() behavior.
   */
  matchMedia(query: string): MediaQueryList {
    if (!(query in this.mediaQueryStates)) {
      this.mediaQueryStates[query] = this.evaluateQuery(query);
      this.listeners[query] = new Set();
    }

    const self = this;

    return {
      media: query,
      get matches() {
        return self.mediaQueryStates[query];
      },
      onchange: null,

      addEventListener: (type: string, listener: (e: MediaQueryListEvent) => void) => {
        if (type === 'change') {
          this.listeners[query].add(listener);
        }
      },

      removeEventListener: (type: string, listener: (e: MediaQueryListEvent) => void) => {
        if (type === 'change') {
          this.listeners[query].delete(listener);
        }
      },

      // Deprecated but needed for compatibility with older code
      addListener: (listener: (e: MediaQueryListEvent) => void) => {
        this.listeners[query].add(listener);
      },

      removeListener: (listener: (e: MediaQueryListEvent) => void) => {
        this.listeners[query].delete(listener);
      },

      dispatchEvent: () => true,
    } as unknown as MediaQueryList;
  }

  // ============ Test Helpers ============

  /**
   * Simulate a viewport width change.
   * Re-evaluates all registered queries and fires change events
   * only for queries whose match state actually changed.
   */
  setViewportWidth(width: number): void {
    this.currentWidth = width;
    const oldStates = { ...this.mediaQueryStates };

    // Re-evaluate all registered queries
    for (const query of Object.keys(this.mediaQueryStates)) {
      this.mediaQueryStates[query] = this.evaluateQuery(query);

      // Fire change event only if state changed (mimics browser behavior)
      if (oldStates[query] !== this.mediaQueryStates[query]) {
        const event = {
          matches: this.mediaQueryStates[query],
          media: query,
        } as MediaQueryListEvent;

        const listeners = Array.from(this.listeners[query]);
        for (const listener of listeners) {
          listener(event);
        }
      }
    }
  }

  /**
   * Get the current viewport width.
   */
  getViewportWidth(): number {
    return this.currentWidth;
  }

  /**
   * Get listener count for a specific query (useful for cleanup tests).
   */
  getListenerCount(query: string): number {
    return this.listeners[query]?.size ?? 0;
  }

  /**
   * Clear all listeners (useful for test cleanup).
   */
  clearAllListeners(): void {
    for (const query of Object.keys(this.listeners)) {
      this.listeners[query].clear();
    }
  }

  /**
   * Evaluate a media query string against the current width.
   * Supports:
   * - (max-width: Xpx)
   * - (min-width: Xpx)
   * - (min-width: Xpx) and (max-width: Ypx)
   */
  private evaluateQuery(query: string): boolean {
    // Extract max-width and min-width values
    const maxMatch = query.match(/\(max-width:\s*(\d+)px\)/);
    const minMatch = query.match(/\(min-width:\s*(\d+)px\)/);

    if (maxMatch && minMatch) {
      // Range query: (min-width: X) and (max-width: Y)
      const minWidth = Number.parseInt(minMatch[1], 10);
      const maxWidth = Number.parseInt(maxMatch[1], 10);
      return this.currentWidth >= minWidth && this.currentWidth <= maxWidth;
    }

    if (maxMatch) {
      // Max-width only: width <= max
      const maxWidth = Number.parseInt(maxMatch[1], 10);
      return this.currentWidth <= maxWidth;
    }

    if (minMatch) {
      // Min-width only: width >= min
      const minWidth = Number.parseInt(minMatch[1], 10);
      return this.currentWidth >= minWidth;
    }

    // Unknown query format - default to true
    return true;
  }
}

/**
 * Factory function for creating FakeMatchMedia instances.
 * Useful for injecting into hooks during testing.
 *
 * @example
 * const factory = createFakeMatchMediaFactory(1024);
 * const { result } = renderHook(() => useResponsive());
 * // Access the fake to simulate viewport changes
 * factory.instance.setViewportWidth(400);
 */
export function createFakeMatchMediaFactory(initialWidth = 1024) {
  const instance = new FakeMatchMedia(initialWidth);

  return {
    /**
     * The matchMedia function to inject as window.matchMedia replacement.
     */
    matchMedia: (query: string) => instance.matchMedia(query),

    /**
     * Direct access to the FakeMatchMedia instance for test helpers.
     */
    instance,
  };
}
