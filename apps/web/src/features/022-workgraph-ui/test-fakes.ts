/**
 * Test Fakes - Phase 3 Review Fixes
 *
 * Fake implementations for testing, following Constitution Principle 4:
 * No mocking frameworks - use Fake classes instead of vi.fn().
 *
 * @module features/022-workgraph-ui/test-fakes
 */

// ============================================
// FakeDragEvent
// ============================================

/**
 * Fake DragEvent for testing drag-drop functionality.
 * Tracks drag data and preventDefault calls.
 */
export class FakeDragEvent {
  private dragData: Map<string, string> = new Map();
  public defaultPrevented = false;

  setData(type: string, data: string): void {
    this.dragData.set(type, data);
  }

  getData(type: string): string {
    return this.dragData.get(type) ?? '';
  }

  preventDefault(): void {
    this.defaultPrevented = true;
  }

  get dataTransfer() {
    return {
      getData: (type: string) => this.getData(type),
      setData: (type: string, data: string) => this.setData(type, data),
    };
  }

  // Cast to DragEvent for test usage
  asDragEvent(): DragEvent {
    return this as unknown as DragEvent;
  }
}

// ============================================
// FakeErrorCallback
// ============================================

/**
 * Fake error callback for testing error handling.
 * Tracks all error messages passed to it.
 */
export class FakeErrorCallback {
  public calls: string[] = [];

  handler = (message: string): void => {
    this.calls.push(message);
  };

  wasCalledWith(message: string): boolean {
    return this.calls.includes(message);
  }

  wasCalled(): boolean {
    return this.calls.length > 0;
  }

  get callCount(): number {
    return this.calls.length;
  }

  reset(): void {
    this.calls = [];
  }
}

// ============================================
// FakeSaveFunction
// ============================================

/**
 * Fake save function for testing auto-save debounce.
 * Tracks save calls and allows configuring results.
 */
export class FakeSaveFunction {
  public calls: Array<{ timestamp: number }> = [];
  private result: { errors: Array<{ code: string; message: string }> } = { errors: [] };

  setResult(result: { errors: Array<{ code: string; message: string }> }): void {
    this.result = result;
  }

  save = async (): Promise<{ errors: Array<{ code: string; message: string }> }> => {
    this.calls.push({ timestamp: Date.now() });
    return this.result;
  };

  get callCount(): number {
    return this.calls.length;
  }

  reset(): void {
    this.calls = [];
  }
}

// ============================================
// FakeFetch
// ============================================

/**
 * Fake fetch response for testing API calls.
 */
export class FakeFetchResponse {
  constructor(
    private data: unknown,
    private _status = 200
  ) {}

  json(): Promise<unknown> {
    return Promise.resolve(this.data);
  }

  get ok(): boolean {
    return this._status >= 200 && this._status < 300;
  }

  get status(): number {
    return this._status;
  }
}

/**
 * Fake fetch function for testing components that call fetch.
 * Allows configuring responses by URL.
 */
export class FakeFetch {
  public calls: Array<{ url: string; init?: RequestInit }> = [];
  private responses: Map<string, FakeFetchResponse> = new Map();
  private defaultResponse: FakeFetchResponse = new FakeFetchResponse({ error: 'Not found' }, 404);

  setResponse(url: string, data: unknown, status = 200): void {
    this.responses.set(url, new FakeFetchResponse(data, status));
  }

  setDefaultResponse(data: unknown, status = 200): void {
    this.defaultResponse = new FakeFetchResponse(data, status);
  }

  fetch = async (url: string | URL | Request, init?: RequestInit): Promise<FakeFetchResponse> => {
    const urlString = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;
    this.calls.push({ url: urlString, init });

    // Check for exact match first
    const exactMatch = this.responses.get(urlString);
    if (exactMatch) {
      return exactMatch;
    }

    // Check for partial matches (useful for URLs with query params)
    for (const [pattern, response] of this.responses.entries()) {
      if (urlString.includes(pattern)) {
        return response;
      }
    }

    return this.defaultResponse;
  };

  get callCount(): number {
    return this.calls.length;
  }

  wasCalledWithUrl(urlPattern: string): boolean {
    return this.calls.some((c) => c.url.includes(urlPattern));
  }

  reset(): void {
    this.calls = [];
    this.responses.clear();
  }
}

// ============================================
// FakeSubscriber
// ============================================

/**
 * Fake event subscriber for testing event emission.
 * Generic type T allows type-safe event tracking.
 */
export class FakeSubscriber<T = unknown> {
  public calls: T[] = [];

  handler = (event: T): void => {
    this.calls.push(event);
  };

  wasCalledWith(event: Partial<T>): boolean {
    return this.calls.some((c) => {
      for (const key of Object.keys(event) as Array<keyof T>) {
        if (c[key] !== event[key]) {
          return false;
        }
      }
      return true;
    });
  }

  wasCalled(): boolean {
    return this.calls.length > 0;
  }

  get callCount(): number {
    return this.calls.length;
  }

  get lastCall(): T | undefined {
    return this.calls[this.calls.length - 1];
  }

  reset(): void {
    this.calls = [];
  }
}

// ============================================
// FakeDataTransfer (for DragEvent.dataTransfer)
// ============================================

/**
 * Fake DataTransfer for testing drag-drop with setData tracking.
 */
export class FakeDataTransfer {
  private data: Map<string, string> = new Map();
  public setDataCalls: Array<{ type: string; data: string }> = [];
  public effectAllowed = 'none';

  setData(type: string, data: string): void {
    this.data.set(type, data);
    this.setDataCalls.push({ type, data });
  }

  getData(type: string): string {
    return this.data.get(type) ?? '';
  }

  wasSetDataCalledWith(type: string, data: string): boolean {
    return this.setDataCalls.some((c) => c.type === type && c.data === data);
  }
}
