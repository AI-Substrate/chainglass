/**
 * Tests for useWorkGraphSSE hook - Phase 4 (T001)
 *
 * Per Constitution Principle 4: Use FakeEventSource, not vi.mock()
 * Per ADR-0007: Notification-fetch pattern - SSE carries {type, graphSlug} only
 */

import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { FakeWorkGraphUIInstance } from '@/features/022-workgraph-ui/fake-workgraph-ui-instance';
import { useWorkGraphSSE } from '@/features/022-workgraph-ui/use-workgraph-sse';
import { createFakeEventSourceFactory } from '../../../../fakes/fake-event-source';

describe('useWorkGraphSSE', () => {
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

  test('should subscribe to workgraphs SSE channel on mount', () => {
    /**
     * Purpose: Verifies hook creates EventSource connection to correct channel
     * Quality Contribution: Ensures SSE subscription happens automatically
     * Acceptance Criteria: EventSource created with /api/events/workgraphs URL
     */
    renderHook(() =>
      useWorkGraphSSE({
        graphSlug: 'my-graph',
        instance: fakeInstance,
        eventSourceFactory: fakeFactory.create,
      })
    );

    expect(fakeFactory.lastInstance).not.toBeNull();
    expect(fakeFactory.lastInstance?.url).toBe('/api/events/workgraphs');
  });

  test('should call instance.refresh() when SSE event matches graphSlug', async () => {
    /**
     * Purpose: Proves SSE notification triggers instance refresh
     * Quality Contribution: External changes detected via SSE → refresh flow
     * Acceptance Criteria: instance.refresh() called on matching event
     */
    renderHook(() =>
      useWorkGraphSSE({
        graphSlug: 'my-graph',
        instance: fakeInstance,
        eventSourceFactory: fakeFactory.create,
      })
    );

    // Simulate SSE connection open
    act(() => {
      fakeFactory.lastInstance?.simulateOpen();
    });

    // Simulate SSE event with matching graphSlug (per ADR-0007 notification-fetch pattern)
    act(() => {
      fakeFactory.lastInstance?.simulateMessage(
        JSON.stringify({ type: 'graph-updated', graphSlug: 'my-graph' })
      );
    });

    // Allow async refresh to complete
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(fakeInstance.wasRefreshCalled()).toBe(true);
  });

  test('should ignore SSE events for other graphs', async () => {
    /**
     * Purpose: Proves event filtering by graphSlug works correctly
     * Quality Contribution: Only relevant graphs refresh (per ADR-0007 single-channel routing)
     * Acceptance Criteria: No refresh for non-matching slug
     */
    renderHook(() =>
      useWorkGraphSSE({
        graphSlug: 'my-graph',
        instance: fakeInstance,
        eventSourceFactory: fakeFactory.create,
      })
    );

    act(() => {
      fakeFactory.lastInstance?.simulateOpen();
    });

    // Simulate SSE event for DIFFERENT graph
    act(() => {
      fakeFactory.lastInstance?.simulateMessage(
        JSON.stringify({ type: 'graph-updated', graphSlug: 'other-graph' })
      );
    });

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(fakeInstance.wasRefreshCalled()).toBe(false);
  });

  test('should ignore SSE events with different event types', async () => {
    /**
     * Purpose: Ensures only 'graph-updated' events trigger refresh
     * Quality Contribution: Prevents spurious refreshes from other event types
     * Acceptance Criteria: No refresh for non-graph-updated events
     */
    renderHook(() =>
      useWorkGraphSSE({
        graphSlug: 'my-graph',
        instance: fakeInstance,
        eventSourceFactory: fakeFactory.create,
      })
    );

    act(() => {
      fakeFactory.lastInstance?.simulateOpen();
    });

    // Simulate SSE event with different type
    act(() => {
      fakeFactory.lastInstance?.simulateMessage(
        JSON.stringify({ type: 'heartbeat', graphSlug: 'my-graph' })
      );
    });

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(fakeInstance.wasRefreshCalled()).toBe(false);
  });

  test('should return isConnected status', () => {
    /**
     * Purpose: Exposes SSE connection status for UI feedback
     * Quality Contribution: UI can show connection indicator
     * Acceptance Criteria: isConnected reflects EventSource state
     */
    const { result } = renderHook(() =>
      useWorkGraphSSE({
        graphSlug: 'my-graph',
        instance: fakeInstance,
        eventSourceFactory: fakeFactory.create,
      })
    );

    // Initially not connected (connecting state)
    expect(result.current.isConnected).toBe(false);

    act(() => {
      fakeFactory.lastInstance?.simulateOpen();
    });

    expect(result.current.isConnected).toBe(true);
  });

  test('should provide onExternalChange callback when refresh triggered', async () => {
    /**
     * Purpose: Allows parent component to react to external changes (e.g., show toast)
     * Quality Contribution: Enables conflict notification UI
     * Acceptance Criteria: onExternalChange called after successful refresh from SSE
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

  test('should cleanup EventSource on unmount', () => {
    /**
     * Purpose: Prevents memory leaks and orphaned connections
     * Quality Contribution: Proper resource cleanup
     * Acceptance Criteria: EventSource closed when hook unmounts
     */
    const { unmount } = renderHook(() =>
      useWorkGraphSSE({
        graphSlug: 'my-graph',
        instance: fakeInstance,
        eventSourceFactory: fakeFactory.create,
      })
    );

    const eventSource = fakeFactory.lastInstance;
    expect(eventSource).not.toBeNull();

    unmount();

    // FakeEventSource sets readyState to CLOSED on close()
    expect(eventSource?.readyState).toBe(2); // CLOSED
  });
});
