/**
 * FakeController - Test double for ReadableStreamDefaultController
 *
 * Mimics the enqueue/close behavior of a ReadableStreamDefaultController
 * for testing SSEManager without real streams.
 *
 * DYK-02: Next.js SSE uses ReadableStreamDefaultController with enqueue(),
 * not WritableStream with write().
 */
export class FakeController {
  /** Captured chunks that were enqueued */
  chunks: Uint8Array[] = [];

  /** Whether close() was called */
  closed = false;

  /** Error passed to error() if called */
  errorValue: unknown = null;

  /**
   * Enqueue a chunk to the stream
   * @param chunk - Data to enqueue (typically Uint8Array from TextEncoder)
   */
  enqueue(chunk: Uint8Array): void {
    if (this.closed) {
      throw new Error('Cannot enqueue to closed controller');
    }
    this.chunks.push(chunk);
  }

  /**
   * Close the stream
   */
  close(): void {
    this.closed = true;
  }

  /**
   * Signal an error
   */
  error(e: unknown): void {
    this.errorValue = e;
    this.closed = true;
  }

  /**
   * Get all chunks as decoded strings (convenience for testing)
   */
  getDecodedChunks(): string[] {
    const decoder = new TextDecoder();
    return this.chunks.map((chunk) => decoder.decode(chunk));
  }

  /**
   * Get all chunks concatenated as a single string
   */
  getAllContent(): string {
    return this.getDecodedChunks().join('');
  }

  /**
   * Reset the fake for reuse
   */
  reset(): void {
    this.chunks = [];
    this.closed = false;
    this.errorValue = null;
  }
}

/**
 * Factory function for creating FakeController instances
 */
export function createFakeController(): FakeController {
  return new FakeController();
}
