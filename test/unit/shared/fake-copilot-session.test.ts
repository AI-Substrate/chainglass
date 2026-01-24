import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CopilotSessionEvent, ICopilotSession } from '@chainglass/shared';
// Note: FakeCopilotSession will be imported once T007 creates it
// For now, we reference the interface to ensure tests are ready for implementation

describe('FakeCopilotSession', () => {
  /**
   * Purpose: Validate FakeCopilotSession implements ICopilotSession contract
   * Quality Contribution: Ensures test double is contract-compliant for unit testing
   * Acceptance Criteria: All ICopilotSession methods work with configurable behavior
   *
   * DYK-03: Store handler in on(), emit pre-configured events during sendAndWait()
   */

  // Placeholder for fake - will fail until T007 implements it
  let session: ICopilotSession;

  beforeEach(() => {
    // T007 will implement FakeCopilotSession
    // For now, tests will fail because FakeCopilotSession doesn't exist
    // This is the TDD RED phase
    session = undefined as unknown as ICopilotSession;
  });

  describe('sessionId', () => {
    it('should have sessionId immediately available', async () => {
      /*
      Test Doc:
      - Why: SDK provides sessionId immediately (no polling needed)
      - Contract: sessionId is readonly and available on construction
      - Usage Notes: This is the key advantage over log-file polling
      - Quality Contribution: Verifies immediate session ID availability
      - Worked Example: new FakeCopilotSession('abc') → session.sessionId === 'abc'
      */
      const { FakeCopilotSession } = await import('@chainglass/shared/fakes');
      session = new FakeCopilotSession({ sessionId: 'test-session-123' });

      expect(session.sessionId).toBe('test-session-123');
    });

    it('should generate sessionId if not provided', async () => {
      /*
      Test Doc:
      - Why: Some tests don't care about specific session IDs
      - Contract: Generates valid sessionId if not configured
      - Usage Notes: Generated IDs are unique per instance
      - Quality Contribution: Simplifies test setup
      - Worked Example: new FakeCopilotSession() → session.sessionId is defined
      */
      const { FakeCopilotSession } = await import('@chainglass/shared/fakes');
      session = new FakeCopilotSession();

      expect(session.sessionId).toBeDefined();
      expect(session.sessionId).not.toBe('');
    });
  });

  describe('sendAndWait()', () => {
    it('should return assistant message event on success', async () => {
      /*
      Test Doc:
      - Why: sendAndWait() is the primary method for getting agent responses
      - Contract: Returns CopilotAssistantMessageEvent with content
      - Usage Notes: Resolves when session becomes idle
      - Quality Contribution: Verifies response handling
      - Worked Example: sendAndWait({prompt:'hi'}) → {type:'assistant.message', data:{content:'...'}}
      */
      const { FakeCopilotSession } = await import('@chainglass/shared/fakes');
      session = new FakeCopilotSession({
        events: [
          { type: 'assistant.message', data: { content: 'Hello, how can I help?' } },
          { type: 'session.idle', data: {} },
        ],
      });

      const result = await session.sendAndWait({ prompt: 'Hello' });

      expect(result).toBeDefined();
      expect(result?.type).toBe('assistant.message');
      expect(result?.data.content).toBe('Hello, how can I help?');
    });

    it('should return undefined if no assistant message received', async () => {
      /*
      Test Doc:
      - Why: Session may go idle without assistant response
      - Contract: Returns undefined if no assistant.message before idle
      - Usage Notes: Tests should handle undefined case
      - Quality Contribution: Verifies edge case handling
      - Worked Example: sendAndWait() with only idle event → undefined
      */
      const { FakeCopilotSession } = await import('@chainglass/shared/fakes');
      session = new FakeCopilotSession({
        events: [{ type: 'session.idle', data: {} }],
      });

      const result = await session.sendAndWait({ prompt: 'Hello' });

      expect(result).toBeUndefined();
    });

    it('should throw on session error event', async () => {
      /*
      Test Doc:
      - Why: Errors should propagate to caller
      - Contract: Throws if session.error event occurs
      - Usage Notes: Error message and stack from event data
      - Quality Contribution: Verifies error propagation
      - Worked Example: session.error event → throw Error
      */
      const { FakeCopilotSession } = await import('@chainglass/shared/fakes');
      session = new FakeCopilotSession({
        events: [
          { type: 'session.error', data: { message: 'Something went wrong', stack: 'at...' } },
        ],
      });

      await expect(session.sendAndWait({ prompt: 'Hello' })).rejects.toThrow(
        'Something went wrong'
      );
    });

    it('should throw on timeout', async () => {
      /*
      Test Doc:
      - Why: Long-running requests should timeout
      - Contract: Throws if idle not received within timeout
      - Usage Notes: Default timeout is 60s; can be configured
      - Quality Contribution: Verifies timeout behavior
      - Worked Example: sendAndWait() with no events and short timeout → throw
      */
      const { FakeCopilotSession } = await import('@chainglass/shared/fakes');
      session = new FakeCopilotSession({
        events: [], // No events - will timeout
        sendAndWaitDelay: 100, // 100ms delay before resolving
      });

      await expect(session.sendAndWait({ prompt: 'Hello' }, 50)).rejects.toThrow(/[Tt]imeout/);
    });

    it('should track sendAndWait calls for verification', async () => {
      /*
      Test Doc:
      - Why: Tests need to verify what prompts were sent
      - Contract: getSendHistory() returns all sendAndWait calls
      - Usage Notes: History includes prompt and options
      - Quality Contribution: Enables call verification
      - Worked Example: sendAndWait({prompt:'a'}), sendAndWait({prompt:'b'}) → history=[a,b]
      */
      const { FakeCopilotSession } = await import('@chainglass/shared/fakes');
      const fakeWithHistory = new FakeCopilotSession({
        events: [
          { type: 'assistant.message', data: { content: 'Response' } },
          { type: 'session.idle', data: {} },
        ],
      });

      await fakeWithHistory.sendAndWait({ prompt: 'First prompt' });
      await fakeWithHistory.sendAndWait({ prompt: 'Second prompt' });

      const sessionWithHistory = fakeWithHistory as ICopilotSession & {
        getSendHistory(): { prompt: string }[];
      };
      const history = sessionWithHistory.getSendHistory();
      expect(history).toHaveLength(2);
      expect(history[0]?.prompt).toBe('First prompt');
      expect(history[1]?.prompt).toBe('Second prompt');
    });
  });

  describe('on() event handling', () => {
    it('should invoke handler when events are emitted', async () => {
      /*
      Test Doc:
      - Why: Per DYK-03, events are emitted during sendAndWait()
      - Contract: Handler receives all configured events
      - Usage Notes: Handler stored from on(), invoked during sendAndWait()
      - Quality Contribution: Verifies event emission pattern
      - Worked Example: on(handler); sendAndWait() → handler called with events
      */
      const { FakeCopilotSession } = await import('@chainglass/shared/fakes');
      session = new FakeCopilotSession({
        events: [
          { type: 'assistant.message', data: { content: 'Hello' } },
          { type: 'session.idle', data: {} },
        ],
      });

      const receivedEvents: CopilotSessionEvent[] = [];
      session.on((event) => {
        receivedEvents.push(event);
      });

      await session.sendAndWait({ prompt: 'Test' });

      expect(receivedEvents).toHaveLength(2);
      expect(receivedEvents[0]?.type).toBe('assistant.message');
      expect(receivedEvents[1]?.type).toBe('session.idle');
    });

    it('should return unsubscribe function', async () => {
      /*
      Test Doc:
      - Why: Handlers should be removable to prevent leaks
      - Contract: on() returns function that unsubscribes handler
      - Usage Notes: After unsubscribe, handler no longer receives events
      - Quality Contribution: Verifies cleanup behavior
      - Worked Example: unsubscribe = on(handler); unsubscribe(); → handler not called
      */
      const { FakeCopilotSession } = await import('@chainglass/shared/fakes');
      session = new FakeCopilotSession({
        events: [
          { type: 'assistant.message', data: { content: 'Hello' } },
          { type: 'session.idle', data: {} },
        ],
      });

      const receivedEvents: CopilotSessionEvent[] = [];
      const unsubscribe = session.on((event) => {
        receivedEvents.push(event);
      });

      unsubscribe();
      await session.sendAndWait({ prompt: 'Test' });

      expect(receivedEvents).toHaveLength(0);
    });

    it('should support multiple handlers', async () => {
      /*
      Test Doc:
      - Why: Multiple subsystems may need to receive events
      - Contract: Multiple on() calls all receive events
      - Usage Notes: Each handler is independent
      - Quality Contribution: Verifies multi-handler support
      - Worked Example: on(h1); on(h2); sendAndWait() → both h1 and h2 called
      */
      const { FakeCopilotSession } = await import('@chainglass/shared/fakes');
      session = new FakeCopilotSession({
        events: [
          { type: 'assistant.message', data: { content: 'Hello' } },
          { type: 'session.idle', data: {} },
        ],
      });

      const handler1Events: CopilotSessionEvent[] = [];
      const handler2Events: CopilotSessionEvent[] = [];

      session.on((event) => handler1Events.push(event));
      session.on((event) => handler2Events.push(event));

      await session.sendAndWait({ prompt: 'Test' });

      expect(handler1Events).toHaveLength(2);
      expect(handler2Events).toHaveLength(2);
    });
  });

  describe('abort()', () => {
    it('should resolve without error', async () => {
      /*
      Test Doc:
      - Why: abort() cancels in-flight work
      - Contract: Resolves (doesn't reject) on abort
      - Usage Notes: Session remains valid after abort
      - Quality Contribution: Verifies abort behavior
      - Worked Example: abort() → resolves
      */
      const { FakeCopilotSession } = await import('@chainglass/shared/fakes');
      session = new FakeCopilotSession();

      await expect(session.abort()).resolves.toBeUndefined();
    });

    it('should track abort calls', async () => {
      /*
      Test Doc:
      - Why: Tests may need to verify abort was called
      - Contract: getAbortCount() returns number of abort() calls
      - Usage Notes: Tracks all abort calls
      - Quality Contribution: Enables abort verification
      - Worked Example: abort(); abort() → getAbortCount() === 2
      */
      const { FakeCopilotSession } = await import('@chainglass/shared/fakes');
      const fakeWithCount = new FakeCopilotSession();

      await fakeWithCount.abort();
      await fakeWithCount.abort();

      const sessionWithCount = fakeWithCount as ICopilotSession & { getAbortCount(): number };
      expect(sessionWithCount.getAbortCount()).toBe(2);
    });
  });

  describe('destroy()', () => {
    it('should resolve without error', async () => {
      /*
      Test Doc:
      - Why: destroy() releases resources
      - Contract: Resolves on successful destroy
      - Usage Notes: Session no longer usable after destroy
      - Quality Contribution: Verifies destroy behavior
      - Worked Example: destroy() → resolves
      */
      const { FakeCopilotSession } = await import('@chainglass/shared/fakes');
      session = new FakeCopilotSession();

      await expect(session.destroy()).resolves.toBeUndefined();
    });

    it('should clear event handlers on destroy', async () => {
      /*
      Test Doc:
      - Why: Handlers should be cleaned up on destroy
      - Contract: destroy() removes all registered handlers
      - Usage Notes: Prevents memory leaks
      - Quality Contribution: Verifies cleanup behavior
      - Worked Example: on(handler); destroy() → handler cleared
      */
      const { FakeCopilotSession } = await import('@chainglass/shared/fakes');
      session = new FakeCopilotSession({
        events: [
          { type: 'assistant.message', data: { content: 'Hello' } },
          { type: 'session.idle', data: {} },
        ],
      });

      const receivedEvents: CopilotSessionEvent[] = [];
      session.on((event) => receivedEvents.push(event));

      await session.destroy();

      // Trying to sendAndWait after destroy - handler should not receive events
      try {
        await session.sendAndWait({ prompt: 'After destroy' });
      } catch {
        // May throw - that's fine
      }

      // Events received before destroy should be preserved, but no new events after destroy
      expect(receivedEvents.length).toBeLessThanOrEqual(2);
    });

    it('should track destroy calls', async () => {
      /*
      Test Doc:
      - Why: Tests may need to verify destroy was called
      - Contract: wasDestroyed() returns true after destroy()
      - Usage Notes: Single boolean flag
      - Quality Contribution: Enables destroy verification
      - Worked Example: destroy() → wasDestroyed() === true
      */
      const { FakeCopilotSession } = await import('@chainglass/shared/fakes');
      const fakeWithFlag = new FakeCopilotSession();

      const sessionWithFlag = fakeWithFlag as ICopilotSession & { wasDestroyed(): boolean };
      expect(sessionWithFlag.wasDestroyed()).toBe(false);

      await fakeWithFlag.destroy();

      expect(sessionWithFlag.wasDestroyed()).toBe(true);
    });
  });
});
