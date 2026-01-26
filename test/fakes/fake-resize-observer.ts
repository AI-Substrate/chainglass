/**
 * FakeResizeObserver - Test double for browser ResizeObserver API
 *
 * Provides an in-memory implementation of the ResizeObserver interface
 * for testing container query utilities without browser dependencies.
 *
 * Follows the FakeEventSource exemplar pattern from Phase 2.
 *
 * @example
 * const fake = new FakeResizeObserver((entries) => {
 *   console.log('Resized:', entries[0].contentRect);
 * });
 * fake.observe(element);
 * fake.simulateResize(element, { width: 400, height: 300 });
 */

export interface FakeResizeObserverEntry {
  target: Element;
  contentRect: DOMRectReadOnly;
  borderBoxSize: ReadonlyArray<ResizeObserverSize>;
  contentBoxSize: ReadonlyArray<ResizeObserverSize>;
  devicePixelContentBoxSize: ReadonlyArray<ResizeObserverSize>;
}

export class FakeResizeObserver implements ResizeObserver {
  private callback: ResizeObserverCallback;
  private observedElements: Set<Element> = new Set();

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }

  /**
   * Start observing an element for resize changes.
   */
  observe(target: Element, _options?: ResizeObserverOptions): void {
    this.observedElements.add(target);
  }

  /**
   * Stop observing an element.
   */
  unobserve(target: Element): void {
    this.observedElements.delete(target);
  }

  /**
   * Stop observing all elements and disconnect the observer.
   */
  disconnect(): void {
    this.observedElements.clear();
  }

  // ============ Test Helpers ============

  /**
   * Simulate a resize event for a specific element.
   * Only fires if the element is being observed.
   */
  simulateResize(element: Element, dimensions: { width: number; height: number }): void {
    if (!this.observedElements.has(element)) {
      return; // Element not being observed
    }

    const { width, height } = dimensions;

    const contentRect = {
      x: 0,
      y: 0,
      width,
      height,
      top: 0,
      right: width,
      bottom: height,
      left: 0,
      toJSON: () => ({
        x: 0,
        y: 0,
        width,
        height,
        top: 0,
        right: width,
        bottom: height,
        left: 0,
      }),
    } as DOMRectReadOnly;

    const size: ResizeObserverSize = {
      blockSize: height,
      inlineSize: width,
    };

    const entry: FakeResizeObserverEntry = {
      target: element,
      contentRect,
      borderBoxSize: [size],
      contentBoxSize: [size],
      devicePixelContentBoxSize: [size],
    };

    this.callback([entry as ResizeObserverEntry], this);
  }

  /**
   * Check if an element is being observed.
   */
  isObserving(element: Element): boolean {
    return this.observedElements.has(element);
  }

  /**
   * Get the count of observed elements (useful for cleanup tests).
   */
  getObservedCount(): number {
    return this.observedElements.size;
  }
}

/**
 * Creates a mock Element for testing purposes.
 * Use this when you need a simple Element target for FakeResizeObserver tests.
 */
export function createMockElement(id = 'test-element'): Element {
  return {
    id,
    tagName: 'DIV',
    nodeType: 1,
    nodeName: 'DIV',
  } as unknown as Element;
}
