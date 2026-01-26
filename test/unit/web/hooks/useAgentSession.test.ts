/**
 * useAgentSession Hook Tests
 *
 * Tests for the sessionReducer and useAgentSession hook.
 * Implements Full TDD for Phase 2: Core Chat.
 *
 * Part of Plan 012: Multi-Agent Web UI (Phase 2: Core Chat)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { AgentSession, SessionStatus, AgentMessage } from '@/lib/schemas/agent-session.schema';

// ============ Test Helpers ============

/**
 * Creates a test session with default values.
 * Overrides can be provided to customize the session.
 */
function createTestSession(overrides: Partial<AgentSession> = {}): AgentSession {
  return {
    id: 'test-session-1',
    name: 'Test Session',
    agentType: 'claude-code',
    status: 'idle',
    messages: [],
    createdAt: Date.now(),
    lastActiveAt: Date.now(),
    ...overrides,
  };
}

/**
 * Creates a test message.
 */
function createTestMessage(overrides: Partial<AgentMessage> = {}): AgentMessage {
  return {
    role: 'user',
    content: 'Hello',
    timestamp: Date.now(),
    ...overrides,
  };
}

// ============ Types (to be implemented in T002) ============

/**
 * Session reducer action types.
 * These will be exported from useAgentSession.ts in T002.
 */
type SessionAction =
  | { type: 'START_RUN' }
  | { type: 'STOP_RUN' }
  | { type: 'COMPLETE_RUN' }
  | { type: 'APPEND_DELTA'; delta: string }
  | { type: 'ADD_MESSAGE'; message: AgentMessage }
  | { type: 'UPDATE_STATUS'; status: SessionStatus }
  | { type: 'SET_ERROR'; error: { message: string; code?: string } }
  | { type: 'CLEAR_ERROR' }
  | { type: 'UPDATE_CONTEXT_USAGE'; usage: number };

/**
 * Session state for the reducer.
 * Extends AgentSession with error field.
 */
interface SessionState extends AgentSession {
  error: { message: string; code?: string } | null;
  streamingContent: string; // Accumulated streaming text before being added as message
}

// Placeholder for the reducer - will be imported from implementation in T002
// For now, we define a stub that allows tests to compile
function sessionReducer(state: SessionState, action: SessionAction): SessionState {
  // This is a stub - actual implementation will be in T002
  // Tests will fail (RED) until T002 is complete
  throw new Error('sessionReducer not implemented - T002 pending');
}

/**
 * Creates initial session state from an AgentSession.
 */
function createSessionState(session: AgentSession): SessionState {
  return {
    ...session,
    error: null,
    streamingContent: '',
  };
}

// ============ T001: sessionReducer Tests ============

describe('sessionReducer', () => {
  describe('START_RUN action', () => {
    it('should transition from idle to running on START_RUN', () => {
      /*
      Test Doc:
      - Why: Running state enables streaming and provides visual feedback
      - Contract: idle → running is valid transition
      - Usage Notes: Dispatch START_RUN before sending message to adapter
      - Quality Contribution: Prevents state confusion during agent run
      - Worked Example: { status: 'idle' } + START_RUN → { status: 'running' }
      */
      const initialState = createSessionState(createTestSession({ status: 'idle' }));
      const result = sessionReducer(initialState, { type: 'START_RUN' });

      expect(result.status).toBe('running');
      expect(result.streamingContent).toBe(''); // Cleared for new run
    });

    it('should reject START_RUN when already running (no-op)', () => {
      /*
      Test Doc:
      - Why: Prevents state corruption from duplicate START_RUN actions
      - Contract: running → running returns unchanged state (same reference)
      - Usage Notes: Check state before dispatching to avoid unnecessary renders
      - Quality Contribution: Catches double-click or rapid fire bugs
      - Worked Example: { status: 'running' } + START_RUN → same ref
      */
      const initialState = createSessionState(createTestSession({ status: 'running' }));
      const result = sessionReducer(initialState, { type: 'START_RUN' });

      expect(result).toBe(initialState); // Same reference (no-op)
    });

    it('should transition from completed to running on START_RUN', () => {
      /*
      Test Doc:
      - Why: Users should be able to start a new conversation after completion
      - Contract: completed → running is valid for new conversations
      - Usage Notes: This resets streaming content for the new run
      - Quality Contribution: Ensures continuous usage workflow
      - Worked Example: { status: 'completed' } + START_RUN → { status: 'running' }
      */
      const initialState = createSessionState(createTestSession({ status: 'completed' }));
      const result = sessionReducer(initialState, { type: 'START_RUN' });

      expect(result.status).toBe('running');
    });
  });

  describe('STOP_RUN action', () => {
    it('should transition from running to idle on STOP_RUN', () => {
      /*
      Test Doc:
      - Why: Users should be able to stop a running agent
      - Contract: running → idle on user-initiated stop
      - Usage Notes: Preserves messages accumulated so far
      - Quality Contribution: Enables user control over runaway agents
      - Worked Example: { status: 'running' } + STOP_RUN → { status: 'idle' }
      */
      const initialState = createSessionState(createTestSession({ status: 'running' }));
      const result = sessionReducer(initialState, { type: 'STOP_RUN' });

      expect(result.status).toBe('idle');
    });

    it('should be no-op when not running', () => {
      /*
      Test Doc:
      - Why: Can't stop what isn't running
      - Contract: idle + STOP_RUN → same ref (no-op)
      - Usage Notes: Safe to call STOP_RUN regardless of current state
      - Quality Contribution: Prevents invalid state transitions
      - Worked Example: { status: 'idle' } + STOP_RUN → same ref
      */
      const initialState = createSessionState(createTestSession({ status: 'idle' }));
      const result = sessionReducer(initialState, { type: 'STOP_RUN' });

      expect(result).toBe(initialState); // Same reference
    });
  });

  describe('COMPLETE_RUN action', () => {
    it('should transition from running to completed on COMPLETE_RUN', () => {
      /*
      Test Doc:
      - Why: Indicates successful completion of agent run
      - Contract: running → completed on agent completion
      - Usage Notes: Streaming content should be finalized as message
      - Quality Contribution: Clear visual feedback when agent finishes
      - Worked Example: { status: 'running' } + COMPLETE_RUN → { status: 'completed' }
      */
      const initialState = createSessionState(createTestSession({ status: 'running' }));
      const result = sessionReducer(initialState, { type: 'COMPLETE_RUN' });

      expect(result.status).toBe('completed');
    });

    it('should finalize streaming content as assistant message on COMPLETE_RUN', () => {
      /*
      Test Doc:
      - Why: Streaming content needs to become a permanent message
      - Contract: streamingContent → assistant message on completion
      - Usage Notes: Only adds message if streamingContent is non-empty
      - Quality Contribution: Ensures no content is lost on completion
      - Worked Example: { streamingContent: 'Hello' } + COMPLETE_RUN → message added
      */
      const initialState = createSessionState(createTestSession({ status: 'running' }));
      initialState.streamingContent = 'Hello, I can help with that!';

      const result = sessionReducer(initialState, { type: 'COMPLETE_RUN' });

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].role).toBe('assistant');
      expect(result.messages[0].content).toBe('Hello, I can help with that!');
      expect(result.streamingContent).toBe(''); // Cleared after finalization
    });

    it('should not add empty message if no streaming content', () => {
      /*
      Test Doc:
      - Why: Avoid polluting message history with empty messages
      - Contract: empty streamingContent → no message added
      - Usage Notes: Safe to call COMPLETE_RUN even without streaming content
      - Quality Contribution: Keeps message history clean
      - Worked Example: { streamingContent: '' } + COMPLETE_RUN → no new message
      */
      const initialState = createSessionState(createTestSession({ status: 'running' }));
      initialState.streamingContent = '';
      initialState.messages = [];

      const result = sessionReducer(initialState, { type: 'COMPLETE_RUN' });

      expect(result.messages).toHaveLength(0);
    });
  });

  describe('APPEND_DELTA action (HF-08: merge-not-replace)', () => {
    it('should append delta to streaming content', () => {
      /*
      Test Doc:
      - Why: SSE delivers text in increments that must be accumulated
      - Contract: APPEND_DELTA concatenates delta to streamingContent
      - Usage Notes: Per HF-08, this uses merge-not-replace pattern
      - Quality Contribution: Correct streaming behavior for SSE
      - Worked Example: { streamingContent: 'Hel' } + delta:'lo' → 'Hello'
      */
      const initialState = createSessionState(createTestSession({ status: 'running' }));
      initialState.streamingContent = 'Hel';

      const result = sessionReducer(initialState, { type: 'APPEND_DELTA', delta: 'lo' });

      expect(result.streamingContent).toBe('Hello');
    });

    it('should handle concurrent deltas with merge-not-replace pattern', () => {
      /*
      Test Doc:
      - Why: Per HF-08, SSE events can interleave; must preserve all deltas
      - Contract: Multiple APPEND_DELTA actions accumulate correctly
      - Usage Notes: Each delta appends; never replaces previous content
      - Quality Contribution: Prevents lost streaming content from race conditions
      - Worked Example: 'A' + 'B' + 'C' → 'ABC'
      */
      let state = createSessionState(createTestSession({ status: 'running' }));
      state.streamingContent = '';

      state = sessionReducer(state, { type: 'APPEND_DELTA', delta: 'A' });
      state = sessionReducer(state, { type: 'APPEND_DELTA', delta: 'B' });
      state = sessionReducer(state, { type: 'APPEND_DELTA', delta: 'C' });

      expect(state.streamingContent).toBe('ABC');
    });

    it('should update lastActiveAt on delta', () => {
      /*
      Test Doc:
      - Why: Activity tracking for session sorting/management
      - Contract: APPEND_DELTA updates lastActiveAt timestamp
      - Usage Notes: Used for "most recent" session display
      - Quality Contribution: Accurate session activity tracking
      - Worked Example: { lastActiveAt: old } + APPEND_DELTA → { lastActiveAt: now }
      */
      const oldTime = Date.now() - 10000;
      const initialState = createSessionState(
        createTestSession({ status: 'running', lastActiveAt: oldTime })
      );
      initialState.streamingContent = '';

      const before = Date.now();
      const result = sessionReducer(initialState, { type: 'APPEND_DELTA', delta: 'text' });
      const after = Date.now();

      expect(result.lastActiveAt).toBeGreaterThanOrEqual(before);
      expect(result.lastActiveAt).toBeLessThanOrEqual(after);
    });

    it('should preserve other state when appending delta', () => {
      /*
      Test Doc:
      - Why: Per HF-08, merge-not-replace must preserve unrelated state
      - Contract: Other session fields unchanged by APPEND_DELTA
      - Usage Notes: Only streamingContent and lastActiveAt change
      - Quality Contribution: Prevents accidental state corruption
      - Worked Example: messages array preserved through delta append
      */
      const existingMessage = createTestMessage({ content: 'User message' });
      const initialState = createSessionState(
        createTestSession({
          status: 'running',
          messages: [existingMessage],
          contextUsage: 45,
        })
      );

      const result = sessionReducer(initialState, { type: 'APPEND_DELTA', delta: 'text' });

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0]).toBe(existingMessage);
      expect(result.contextUsage).toBe(45);
      expect(result.status).toBe('running');
    });
  });

  describe('ADD_MESSAGE action', () => {
    it('should add message to messages array', () => {
      /*
      Test Doc:
      - Why: Need to add user messages before sending to agent
      - Contract: ADD_MESSAGE appends message to array
      - Usage Notes: Used for user messages, not streaming assistant responses
      - Quality Contribution: Ensures user input is recorded
      - Worked Example: [] + ADD_MESSAGE(user msg) → [user msg]
      */
      const initialState = createSessionState(createTestSession({ messages: [] }));
      const message = createTestMessage({ role: 'user', content: 'Hello agent' });

      const result = sessionReducer(initialState, { type: 'ADD_MESSAGE', message });

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0]).toBe(message);
    });

    it('should preserve existing messages when adding new one', () => {
      /*
      Test Doc:
      - Why: Message history must be preserved
      - Contract: New messages append, don't replace
      - Usage Notes: Follows immutable update pattern
      - Quality Contribution: Prevents message history corruption
      - Worked Example: [msg1] + ADD_MESSAGE(msg2) → [msg1, msg2]
      */
      const existingMsg = createTestMessage({ role: 'user', content: 'First' });
      const initialState = createSessionState(
        createTestSession({ messages: [existingMsg] })
      );
      const newMsg = createTestMessage({ role: 'assistant', content: 'Response' });

      const result = sessionReducer(initialState, { type: 'ADD_MESSAGE', message: newMsg });

      expect(result.messages).toHaveLength(2);
      expect(result.messages[0]).toBe(existingMsg);
      expect(result.messages[1]).toBe(newMsg);
    });
  });

  describe('UPDATE_STATUS action', () => {
    it('should update status to provided value', () => {
      /*
      Test Doc:
      - Why: SSE events can directly update status (agent_session_status event)
      - Contract: UPDATE_STATUS sets status to provided value
      - Usage Notes: Used for status updates from SSE, not user actions
      - Quality Contribution: Enables status sync from server
      - Worked Example: { status: 'running' } + UPDATE_STATUS('completed') → completed
      */
      const initialState = createSessionState(createTestSession({ status: 'running' }));

      const result = sessionReducer(initialState, { type: 'UPDATE_STATUS', status: 'completed' });

      expect(result.status).toBe('completed');
    });

    it('should handle all valid status transitions', () => {
      /*
      Test Doc:
      - Why: Server may send any valid status
      - Contract: All SessionStatus values are valid for UPDATE_STATUS
      - Usage Notes: Includes idle, running, waiting_input, completed, archived
      - Quality Contribution: Full status coverage
      - Worked Example: transitions to all statuses work
      */
      const statuses: SessionStatus[] = ['idle', 'running', 'waiting_input', 'completed', 'archived'];

      for (const status of statuses) {
        const initialState = createSessionState(createTestSession({ status: 'idle' }));
        const result = sessionReducer(initialState, { type: 'UPDATE_STATUS', status });
        expect(result.status).toBe(status);
      }
    });
  });

  describe('SET_ERROR action', () => {
    it('should set error with message', () => {
      /*
      Test Doc:
      - Why: Agent errors need to be displayed to user
      - Contract: SET_ERROR populates error field with message
      - Usage Notes: Also transitions status to 'error' equivalent (implementation decision)
      - Quality Contribution: Proper error handling
      - Worked Example: { error: null } + SET_ERROR → { error: { message: '...' } }
      */
      const initialState = createSessionState(createTestSession({ status: 'running' }));

      const result = sessionReducer(initialState, {
        type: 'SET_ERROR',
        error: { message: 'Connection lost' },
      });

      expect(result.error).toEqual({ message: 'Connection lost' });
    });

    it('should set error with message and code', () => {
      /*
      Test Doc:
      - Why: Error codes help with specific error handling
      - Contract: SET_ERROR can include optional error code
      - Usage Notes: Code is optional, used for programmatic error handling
      - Quality Contribution: Better error diagnostics
      - Worked Example: SET_ERROR({ message, code }) → { error: { message, code } }
      */
      const initialState = createSessionState(createTestSession({ status: 'running' }));

      const result = sessionReducer(initialState, {
        type: 'SET_ERROR',
        error: { message: 'Rate limited', code: 'RATE_LIMIT' },
      });

      expect(result.error).toEqual({ message: 'Rate limited', code: 'RATE_LIMIT' });
    });
  });

  describe('CLEAR_ERROR action', () => {
    it('should clear error field', () => {
      /*
      Test Doc:
      - Why: Allow recovery from transient errors
      - Contract: CLEAR_ERROR sets error to null
      - Usage Notes: User can dismiss error and retry
      - Quality Contribution: Error recovery workflow
      - Worked Example: { error: {...} } + CLEAR_ERROR → { error: null }
      */
      const initialState = createSessionState(createTestSession({ status: 'idle' }));
      initialState.error = { message: 'Previous error' };

      const result = sessionReducer(initialState, { type: 'CLEAR_ERROR' });

      expect(result.error).toBeNull();
    });

    it('should be no-op when no error exists', () => {
      /*
      Test Doc:
      - Why: Safe to call CLEAR_ERROR even without error
      - Contract: No change when error is already null
      - Usage Notes: Defensive programming pattern
      - Quality Contribution: Safe idempotent operation
      - Worked Example: { error: null } + CLEAR_ERROR → same state
      */
      const initialState = createSessionState(createTestSession({ status: 'idle' }));
      initialState.error = null;

      const result = sessionReducer(initialState, { type: 'CLEAR_ERROR' });

      // Should return same reference if no change
      expect(result.error).toBeNull();
    });
  });

  describe('UPDATE_CONTEXT_USAGE action', () => {
    it('should update context usage percentage', () => {
      /*
      Test Doc:
      - Why: Display token usage to user for context window awareness
      - Contract: UPDATE_CONTEXT_USAGE sets contextUsage field
      - Usage Notes: Value should be 0-100 percentage
      - Quality Contribution: Context window monitoring
      - Worked Example: { contextUsage: 0 } + UPDATE_CONTEXT_USAGE(45) → 45
      */
      const initialState = createSessionState(createTestSession({ contextUsage: 0 }));

      const result = sessionReducer(initialState, { type: 'UPDATE_CONTEXT_USAGE', usage: 45 });

      expect(result.contextUsage).toBe(45);
    });

    it('should handle boundary values', () => {
      /*
      Test Doc:
      - Why: Edge cases at 0% and 100%
      - Contract: Valid range is 0-100
      - Usage Notes: UI will show warnings at 75% and 90%
      - Quality Contribution: Boundary testing
      - Worked Example: 0% and 100% are valid
      */
      const initialState = createSessionState(createTestSession());

      const result0 = sessionReducer(initialState, { type: 'UPDATE_CONTEXT_USAGE', usage: 0 });
      expect(result0.contextUsage).toBe(0);

      const result100 = sessionReducer(initialState, { type: 'UPDATE_CONTEXT_USAGE', usage: 100 });
      expect(result100.contextUsage).toBe(100);
    });
  });

  describe('immutability', () => {
    it('should never mutate the input state', () => {
      /*
      Test Doc:
      - Why: React requires immutable state updates
      - Contract: Input state is never modified
      - Usage Notes: All updates return new object
      - Quality Contribution: Prevents subtle React bugs
      - Worked Example: original state unchanged after any action
      */
      const original = createSessionState(createTestSession({ status: 'idle' }));
      const originalJSON = JSON.stringify(original);

      sessionReducer(original, { type: 'START_RUN' });

      expect(JSON.stringify(original)).toBe(originalJSON);
    });
  });
});
