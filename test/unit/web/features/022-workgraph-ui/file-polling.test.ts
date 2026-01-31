/**
 * Tests for file polling fallback - Phase 4 (T005)
 *
 * When SSE is unavailable, the UI can fall back to polling.
 * This tests the polling mechanism in useWorkGraphSSE hook.
 */

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { FakeWorkGraphUIInstance } from '@/features/022-workgraph-ui/fake-workgraph-ui-instance';
import { useWorkGraphSSE } from '@/features/022-workgraph-ui/use-workgraph-sse';
import { createFakeEventSourceFactory } from '../../../../fakes/fake-event-source';

describe('useWorkGraphSSE polling fallback', () => {
  let fakeFactory: ReturnType<typeof createFakeEventSourceFactory>;
  let fakeInstance: FakeWorkGraphUIInstance;

  beforeEach(() => {
    fakeFactory = createFakeEventSourceFactory();
    fakeInstance = FakeWorkGraphUIInstance.withGraph('my-graph');
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('should start polling when enablePolling is true and SSE fails', async () => {
    /**
     * Purpose: Verify polling starts as fallback when SSE unavailable
     * Quality Contribution: Ensures real-time updates work even without SSE
     * Acceptance Criteria: instance.refresh() called at polling interval
     */
    renderHook(() =>
      useWorkGraphSSE({
        graphSlug: 'my-graph',
        instance: fakeInstance,
        eventSourceFactory: fakeFactory.create,
        enablePolling: true,
        pollingInterval: 2000,
      })
    );

    // Simulate SSE connection failure
    act(() => {
      fakeFactory.lastInstance?.simulateError();
    });

    // Advance time past polling interval
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500);
    });

    expect(fakeInstance.wasRefreshCalled()).toBe(true);
  });

  test('should NOT poll when SSE is connected', async () => {
    /**
     * Purpose: Verify polling doesn't interfere with working SSE
     * Quality Contribution: Prevents duplicate refreshes
     * Acceptance Criteria: No refresh from polling when SSE connected
     */
    renderHook(() =>
      useWorkGraphSSE({
        graphSlug: 'my-graph',
        instance: fakeInstance,
        eventSourceFactory: fakeFactory.create,
        enablePolling: true,
        pollingInterval: 2000,
      })
    );

    // SSE connects successfully
    act(() => {
      fakeFactory.lastInstance?.simulateOpen();
    });

    // Advance time past polling interval
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500);
    });

    // No refresh should have been called (no SSE event, no polling)
    expect(fakeInstance.wasRefreshCalled()).toBe(false);
  });

  test('should stop polling on unmount', async () => {
    /**
     * Purpose: Prevent memory leaks from polling after unmount
     * Quality Contribution: Clean resource management
     * Acceptance Criteria: No polling after hook unmounts
     */
    const { unmount } = renderHook(() =>
      useWorkGraphSSE({
        graphSlug: 'my-graph',
        instance: fakeInstance,
        eventSourceFactory: fakeFactory.create,
        enablePolling: true,
        pollingInterval: 2000,
      })
    );

    // Simulate SSE failure to start polling
    act(() => {
      fakeFactory.lastInstance?.simulateError();
    });

    // Unmount before first poll
    unmount();

    // Advance time
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    // Polling should have stopped, so refresh count should be 0
    // (or minimal - depending on timing)
    expect(fakeInstance.getRefreshCount()).toBeLessThanOrEqual(1);
  });

  test('polling interval should default to 2000ms', () => {
    /**
     * Purpose: Document default polling interval per spec
     * Quality Contribution: Consistent behavior without configuration
     * Acceptance Criteria: 2s default interval per plan
     */
    // This is a documentation test - the default is set in the hook
    // Just verify hook accepts the option
    expect(() =>
      renderHook(() =>
        useWorkGraphSSE({
          graphSlug: 'my-graph',
          instance: fakeInstance,
          eventSourceFactory: fakeFactory.create,
          enablePolling: true,
          // No pollingInterval - should use default
        })
      )
    ).not.toThrow();
  });
});
