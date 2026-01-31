/**
 * Tests for conflict toast notification - Phase 4 (T009)
 *
 * Tests that external changes trigger a toast notification via onExternalChange callback.
 */

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { FakeWorkGraphUIInstance } from '@/features/022-workgraph-ui/fake-workgraph-ui-instance';
import { useWorkGraphSSE } from '@/features/022-workgraph-ui/use-workgraph-sse';
import { createFakeEventSourceFactory } from '../../../../fakes/fake-event-source';

describe('conflict toast notification', () => {
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

  test('should call onExternalChange when SSE event triggers refresh', async () => {
    /**
     * Purpose: Verify toast callback is invoked on external change
     * Quality Contribution: User sees notification when graph is updated externally
     * Acceptance Criteria: onExternalChange called after successful refresh
     */
    const onExternalChange = vi.fn();

    renderHook(() =>
      useWorkGraphSSE({
        graphSlug: 'my-graph',
        instance: fakeInstance,
        eventSourceFactory: fakeFactory.create,
        onExternalChange,
      })
    );

    act(() => {
      fakeFactory.lastInstance?.simulateOpen();
    });

    act(() => {
      fakeFactory.lastInstance?.simulateMessage(
        JSON.stringify({ type: 'graph-updated', graphSlug: 'my-graph' })
      );
    });

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(onExternalChange).toHaveBeenCalledTimes(1);
  });

  test('should NOT call onExternalChange for non-matching graphSlug', async () => {
    /**
     * Purpose: Verify toast only shows for the current graph
     * Quality Contribution: No confusing notifications for other graphs
     * Acceptance Criteria: onExternalChange not called for different graphSlug
     */
    const onExternalChange = vi.fn();

    renderHook(() =>
      useWorkGraphSSE({
        graphSlug: 'my-graph',
        instance: fakeInstance,
        eventSourceFactory: fakeFactory.create,
        onExternalChange,
      })
    );

    act(() => {
      fakeFactory.lastInstance?.simulateOpen();
    });

    act(() => {
      fakeFactory.lastInstance?.simulateMessage(
        JSON.stringify({ type: 'graph-updated', graphSlug: 'other-graph' })
      );
    });

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(onExternalChange).not.toHaveBeenCalled();
  });

  test('should call onExternalChange on polling refresh when SSE fails', async () => {
    /**
     * Purpose: Verify toast works with polling fallback
     * Quality Contribution: Consistent UX whether SSE or polling
     * Acceptance Criteria: onExternalChange called when polling detects change
     */
    const onExternalChange = vi.fn();

    renderHook(() =>
      useWorkGraphSSE({
        graphSlug: 'my-graph',
        instance: fakeInstance,
        eventSourceFactory: fakeFactory.create,
        onExternalChange,
        enablePolling: true,
        pollingInterval: 2000,
      })
    );

    // SSE fails
    act(() => {
      fakeFactory.lastInstance?.simulateError();
    });

    // Wait for polling
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500);
    });

    expect(onExternalChange).toHaveBeenCalled();
  });
});
