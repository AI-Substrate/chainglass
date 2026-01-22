/**
 * useSSE Tests - TDD RED Phase
 *
 * Tests for the Server-Sent Events connection hook.
 * Following TDD approach: write tests first, expect them to fail.
 *
 * DYK-01: Uses parameter injection pattern - hook receives EventSource factory
 * as parameter for testability.
 *
 * @vitest-environment jsdom
 */

import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useSSE } from '../../../../apps/web/src/hooks/useSSE';
import { EventSourceReadyState, createFakeEventSourceFactory } from '../../../../test/fakes';

describe('useSSE', () => {
  let factory: ReturnType<typeof createFakeEventSourceFactory>;

  beforeEach(() => {
    factory = createFakeEventSourceFactory();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('connection', () => {
    it('should create EventSource with provided URL', () => {
      /*
      Test Doc:
      - Why: Hook must connect to correct SSE endpoint
      - Contract: useSSE(url, factory) creates EventSource with url
      - Usage Notes: Factory is injected for testability (DYK-01)
      - Quality Contribution: Validates connection initialization
      - Worked Example: useSSE('/api/events', factory) → EventSource created with '/api/events'
      */
      renderHook(() => useSSE('/api/events', factory.create));

      expect(factory.lastInstance).not.toBeNull();
      expect(factory.lastInstance?.url).toBe('/api/events');
    });

    it('should report connecting state initially', () => {
      /*
      Test Doc:
      - Why: UI needs to show loading state during connection
      - Contract: isConnected is false before open event
      - Usage Notes: Check isConnecting for loading UI
      - Quality Contribution: Validates state machine transitions
      - Worked Example: useSSE(...) initially → isConnected: false
      */
      const { result } = renderHook(() => useSSE('/api/events', factory.create));

      expect(result.current.isConnected).toBe(false);
    });

    it('should report connected state after open event', () => {
      /*
      Test Doc:
      - Why: UI needs to show connected status
      - Contract: isConnected becomes true after onopen fires
      - Usage Notes: Use simulateOpen() to trigger
      - Quality Contribution: Validates connection lifecycle
      - Worked Example: simulateOpen() → isConnected: true
      */
      const { result } = renderHook(() => useSSE('/api/events', factory.create));

      act(() => {
        factory.lastInstance?.simulateOpen();
      });

      expect(result.current.isConnected).toBe(true);
    });
  });

  describe('message handling', () => {
    it('should parse JSON messages correctly', () => {
      /*
      Test Doc:
      - Why: SSE messages must be parsed to usable objects
      - Contract: JSON messages appear in messages array as parsed objects
      - Usage Notes: Invalid JSON should not crash
      - Quality Contribution: Validates JSON parsing
      - Worked Example: simulateMessage('{"type":"update"}') → messages[0] === { type: 'update' }
      */
      const { result } = renderHook(() => useSSE('/api/events', factory.create));

      act(() => {
        factory.lastInstance?.simulateOpen();
        factory.lastInstance?.simulateMessage('{"type":"update","data":"test"}');
      });

      expect(result.current.messages).toHaveLength(1);
      expect(result.current.messages[0]).toEqual({ type: 'update', data: 'test' });
    });

    it('should accumulate multiple messages', () => {
      /*
      Test Doc:
      - Why: Multiple SSE messages should be stored
      - Contract: messages array grows with each message
      - Usage Notes: Messages ordered by arrival time
      - Quality Contribution: Validates message accumulation
      - Worked Example: 3 messages → messages.length === 3
      */
      const { result } = renderHook(() => useSSE('/api/events', factory.create));

      act(() => {
        factory.lastInstance?.simulateOpen();
        factory.lastInstance?.simulateMessage('{"id":1}');
        factory.lastInstance?.simulateMessage('{"id":2}');
        factory.lastInstance?.simulateMessage('{"id":3}');
      });

      expect(result.current.messages).toHaveLength(3);
      expect(result.current.messages[2]).toEqual({ id: 3 });
    });

    it('should handle malformed JSON gracefully', () => {
      /*
      Test Doc:
      - Why: Bad server data shouldn't crash the app
      - Contract: Invalid JSON logged but doesn't throw
      - Usage Notes: Messages array unchanged for invalid JSON
      - Quality Contribution: Validates error resilience
      - Worked Example: simulateMessage('not json') → no crash, messages unchanged
      */
      const { result } = renderHook(() => useSSE('/api/events', factory.create));

      act(() => {
        factory.lastInstance?.simulateOpen();
        // This should not throw
        factory.lastInstance?.simulateMessage('not valid json');
      });

      // Should not crash, messages array may contain raw string or be empty
      expect(result.current.error).toBeNull();
    });
  });

  describe('error handling', () => {
    it('should set error state on connection error', () => {
      /*
      Test Doc:
      - Why: UI needs to display error state
      - Contract: error property set when onerror fires
      - Usage Notes: isConnected becomes false on error
      - Quality Contribution: Validates error state management
      - Worked Example: simulateError() → error is set, isConnected: false
      */
      const { result } = renderHook(() => useSSE('/api/events', factory.create));

      act(() => {
        factory.lastInstance?.simulateOpen();
        factory.lastInstance?.simulateError();
      });

      expect(result.current.isConnected).toBe(false);
      expect(result.current.error).not.toBeNull();
    });
  });

  describe('reconnection', () => {
    it('should attempt reconnection after error', async () => {
      /*
      Test Doc:
      - Why: SSE should auto-reconnect on network issues
      - Contract: New EventSource created after error + delay
      - Usage Notes: Uses exponential backoff
      - Quality Contribution: Validates reconnection logic
      - Worked Example: error → wait → new connection attempt
      */
      const { result } = renderHook(() => useSSE('/api/events', factory.create));

      // Initial connection
      const firstInstance = factory.lastInstance;

      act(() => {
        factory.lastInstance?.simulateOpen();
        factory.lastInstance?.simulateError();
      });

      // Advance timers to trigger reconnect
      act(() => {
        vi.advanceTimersByTime(5000); // Default reconnect delay
      });

      // Should have created a new instance
      expect(factory.lastInstance).not.toBe(firstInstance);
    });
  });

  describe('cleanup', () => {
    it('should close connection on unmount', () => {
      /*
      Test Doc:
      - Why: Prevent memory leaks from orphan connections
      - Contract: EventSource.close() called when hook unmounts
      - Usage Notes: React cleanup in useEffect return
      - Quality Contribution: Prevents resource leaks
      - Worked Example: unmount hook → close() called
      */
      const { unmount } = renderHook(() => useSSE('/api/events', factory.create));

      const instance = factory.lastInstance;
      expect(instance?.readyState).not.toBe(EventSourceReadyState.CLOSED);

      unmount();

      expect(instance?.readyState).toBe(EventSourceReadyState.CLOSED);
    });
  });

  describe('manual control', () => {
    it('should allow manual disconnect', () => {
      /*
      Test Doc:
      - Why: Users may need to pause SSE connection
      - Contract: disconnect() closes EventSource
      - Usage Notes: Call connect() to reconnect
      - Quality Contribution: Validates manual control API
      - Worked Example: disconnect() → isConnected: false, close() called
      */
      const { result } = renderHook(() => useSSE('/api/events', factory.create));

      act(() => {
        factory.lastInstance?.simulateOpen();
      });
      expect(result.current.isConnected).toBe(true);

      act(() => {
        result.current.disconnect();
      });

      expect(result.current.isConnected).toBe(false);
      expect(factory.lastInstance?.readyState).toBe(EventSourceReadyState.CLOSED);
    });

    it('should clear messages on clearMessages call', () => {
      /*
      Test Doc:
      - Why: Users may want to clear message history
      - Contract: clearMessages() empties messages array
      - Usage Notes: Does not affect connection state
      - Quality Contribution: Validates message management
      - Worked Example: clearMessages() → messages.length === 0
      */
      const { result } = renderHook(() => useSSE('/api/events', factory.create));

      act(() => {
        factory.lastInstance?.simulateOpen();
        factory.lastInstance?.simulateMessage('{"id":1}');
        factory.lastInstance?.simulateMessage('{"id":2}');
      });
      expect(result.current.messages).toHaveLength(2);

      act(() => {
        result.current.clearMessages();
      });

      expect(result.current.messages).toHaveLength(0);
      expect(result.current.isConnected).toBe(true); // Connection preserved
    });
  });
});
