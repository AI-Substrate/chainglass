/**
 * @vitest-environment node
 */
/**
 * SSE Route Handler Integration Tests - TDD RED Phase
 *
 * Tests for the /api/events/[channel] SSE endpoint.
 * DYK-03: Reduced to 3 tests (skip heartbeat timing - covered by unit tests).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// This import will fail in RED phase - route doesn't exist yet
import { GET } from '../../../../apps/web/app/api/events/[channel]/route';
import { sseManager } from '../../../../apps/web/src/lib/sse-manager';

describe('SSE Route Handler /api/events/[channel]', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should return 200 with text/event-stream content-type', async () => {
    /*
    Test Doc:
    - Why: Verify SSE handshake
    - Contract: GET /api/events/[channel] returns 200, headers set correctly
    - Usage Notes: Create Request, call route handler, assert response status and headers
    - Quality Contribution: HTTP protocol correctness
    - Worked Example: GET /api/events/test → 200 OK, Content-Type: text/event-stream
    */
    const request = new Request('http://localhost:3000/api/events/test-channel', {
      method: 'GET',
    });

    const response = await GET(request, { params: Promise.resolve({ channel: 'test-channel' }) });

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('text/event-stream');
    expect(response.headers.get('Cache-Control')).toBe('no-cache');
    expect(response.headers.get('Connection')).toBe('keep-alive');
  });

  it('should return valid SSE format in first chunk', async () => {
    /*
    Test Doc:
    - Why: Verify stream produces correct SSE format
    - Contract: First chunk from reader is valid SSE (contains data: or : comment)
    - Usage Notes: Use reader.read() to get first chunk, decode with TextDecoder
    - Quality Contribution: SSE protocol compliance
    - Worked Example: reader.read() → chunk contains valid SSE format
    */
    const request = new Request('http://localhost:3000/api/events/test-channel', {
      method: 'GET',
    });

    const response = await GET(request, { params: Promise.resolve({ channel: 'test-channel' }) });
    const body = response.body;
    expect(body).not.toBeNull();
    if (!body) throw new Error('Response body is null');
    const reader = body.getReader();
    const decoder = new TextDecoder();

    // Read first chunk
    const { value, done } = await reader.read();
    expect(done).toBe(false);
    expect(value).toBeDefined();

    const text = decoder.decode(value);
    // First chunk should be a heartbeat comment (: heartbeat\n\n)
    expect(text).toContain(':');
    expect(text).toContain('\n\n');

    // Cancel to cleanup
    await reader.cancel();
  });

  it('should cleanup connection on AbortSignal', async () => {
    /*
    Test Doc:
    - Why: Memory leak prevention
    - Contract: Aborting request triggers cleanup, removes connection from SSEManager
    - Usage Notes: Create AbortController, pass signal to request, call abort(), verify cleanup
    - Quality Contribution: Resource management
    - Worked Example: Request aborted → SSEManager.removeConnection called
    */
    const abortController = new AbortController();
    const request = new Request('http://localhost:3000/api/events/test-channel', {
      method: 'GET',
      signal: abortController.signal,
    });

    // Get initial connection count
    const initialCount = sseManager.getConnectionCount('test-channel');

    const response = await GET(request, { params: Promise.resolve({ channel: 'test-channel' }) });

    // Wait a tick for connection to be added
    await vi.advanceTimersByTimeAsync(10);

    // Verify connection was added
    expect(sseManager.getConnectionCount('test-channel')).toBe(initialCount + 1);

    // Abort the connection
    abortController.abort();

    // Wait for cleanup
    await vi.advanceTimersByTimeAsync(10);

    // Verify connection was removed
    expect(sseManager.getConnectionCount('test-channel')).toBe(initialCount);
  });

  it('should reject invalid channel names', async () => {
    /*
    Test Doc:
    - Why: Prevent path traversal and injection via channel parameter
    - Contract: Invalid channel names return 400 Bad Request
    - Usage Notes: Test with special characters, path traversal attempts
    - Quality Contribution: Security boundary validation
    - Worked Example: channel '../admin' → 400 Bad Request
    */
    const request = new Request('http://localhost:3000/api/events/../admin');
    const response = await GET(request, { params: Promise.resolve({ channel: '../admin' }) });
    expect(response.status).toBe(400);
  });
});
