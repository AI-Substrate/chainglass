/**
 * useAgentSession - Session state management for agent interactions
 *
 * Provides a reducer-based state machine for managing individual agent sessions.
 * Implements merge-not-replace pattern for SSE event handling (HF-08).
 *
 * Part of Plan 012: Multi-Agent Web UI (Phase 2: Core Chat)
 */

import type { AgentMessage, AgentSession, SessionStatus } from '@/lib/schemas/agent-session.schema';
import { AgentSessionStore } from '@/lib/stores/agent-session.store';
import { useCallback, useEffect, useReducer, useRef } from 'react';

// ============ Types ============

/**
 * Session reducer action types.
 * Pure actions for state machine transitions.
 */
export type SessionAction =
  | { type: 'START_RUN' }
  | { type: 'STOP_RUN' }
  | { type: 'COMPLETE_RUN' }
  | { type: 'APPEND_DELTA'; delta: string }
  | { type: 'ADD_MESSAGE'; message: AgentMessage }
  | { type: 'UPDATE_STATUS'; status: SessionStatus }
  | { type: 'SET_ERROR'; error: { message: string; code?: string } }
  | { type: 'CLEAR_ERROR' }
  | { type: 'UPDATE_CONTEXT_USAGE'; usage: number }
  | { type: 'LOAD_SESSION'; session: AgentSession };

/**
 * Session state for the reducer.
 * Extends AgentSession with runtime fields for streaming and errors.
 */
export interface SessionState extends AgentSession {
  /** Current error, if any */
  error: { message: string; code?: string } | null;
  /** Accumulated streaming text before being finalized as message */
  streamingContent: string;
}

// ============ Helper Functions ============

/**
 * Creates initial session state from an AgentSession.
 */
export function createSessionState(session: AgentSession): SessionState {
  return {
    ...session,
    error: null,
    streamingContent: '',
  };
}

// ============ sessionReducer ============

/**
 * Pure reducer for session state management.
 *
 * State machine transitions:
 * - idle → running (START_RUN)
 * - running → idle (STOP_RUN)
 * - running → completed (COMPLETE_RUN)
 * - completed → running (START_RUN for new conversation)
 *
 * Per HF-08: APPEND_DELTA uses merge-not-replace pattern to handle
 * concurrent SSE events safely.
 *
 * @param state - Current session state
 * @param action - Action to perform
 * @returns New session state (never mutates input)
 */
export function sessionReducer(state: SessionState, action: SessionAction): SessionState {
  switch (action.type) {
    case 'START_RUN': {
      // No-op if already running
      if (state.status === 'running') {
        return state;
      }
      // Valid transitions: idle, completed, waiting_input → running
      return {
        ...state,
        status: 'running',
        streamingContent: '', // Clear for new run
        lastActiveAt: Date.now(),
      };
    }

    case 'STOP_RUN': {
      // No-op if not running
      if (state.status !== 'running') {
        return state;
      }
      return {
        ...state,
        status: 'idle',
        lastActiveAt: Date.now(),
      };
    }

    case 'COMPLETE_RUN': {
      // Finalize streaming content as assistant message if non-empty
      const messages = state.streamingContent
        ? [
            ...state.messages,
            {
              role: 'assistant' as const,
              content: state.streamingContent,
              timestamp: Date.now(),
            },
          ]
        : state.messages;

      return {
        ...state,
        status: 'completed',
        messages,
        streamingContent: '', // Clear after finalization
        lastActiveAt: Date.now(),
      };
    }

    case 'APPEND_DELTA': {
      // HF-08: Merge-not-replace pattern for concurrent SSE events
      // Only append, never replace existing content
      return {
        ...state,
        streamingContent: state.streamingContent + action.delta,
        lastActiveAt: Date.now(),
      };
    }

    case 'ADD_MESSAGE': {
      return {
        ...state,
        messages: [...state.messages, action.message],
        lastActiveAt: Date.now(),
      };
    }

    case 'UPDATE_STATUS': {
      return {
        ...state,
        status: action.status,
        lastActiveAt: Date.now(),
      };
    }

    case 'SET_ERROR': {
      return {
        ...state,
        error: action.error,
        lastActiveAt: Date.now(),
      };
    }

    case 'CLEAR_ERROR': {
      // No-op if no error
      if (state.error === null) {
        return state;
      }
      return {
        ...state,
        error: null,
      };
    }

    case 'UPDATE_CONTEXT_USAGE': {
      return {
        ...state,
        contextUsage: action.usage,
      };
    }

    case 'LOAD_SESSION': {
      // Replace entire state with loaded session
      return createSessionState(action.session);
    }

    default: {
      // Exhaustive check - TypeScript will error if a case is missing
      const _exhaustive: never = action;
      return state;
    }
  }
}

// ============ useAgentSession Hook ============

/**
 * Return type for the useAgentSession hook.
 */
export interface UseAgentSessionReturn {
  /** Current session state */
  state: SessionState;
  /** Dispatch an action to update state (memoized, stable reference) */
  dispatch: (action: SessionAction) => void;
}

/**
 * Creates a new session with default values.
 */
function createNewSession(sessionId: string): AgentSession {
  const now = Date.now();
  return {
    id: sessionId,
    name: `Session ${sessionId.slice(0, 8)}`,
    agentType: 'claude-code',
    status: 'idle',
    messages: [],
    createdAt: now,
    lastActiveAt: now,
  };
}

/**
 * Hook for managing a single agent session.
 *
 * Wraps sessionReducer with useReducer and provides:
 * - Automatic persistence to localStorage via AgentSessionStore
 * - Memoized dispatch function (stable reference across renders)
 * - SSR-safe: loads from localStorage after mount to avoid hydration mismatch
 *
 * @param sessionId - Unique session identifier
 * @param store - Optional AgentSessionStore for testing (defaults to localStorage)
 * @returns Session state and dispatch function
 *
 * @example
 * const { state, dispatch } = useAgentSession('session-123');
 *
 * // Start a run
 * dispatch({ type: 'START_RUN' });
 *
 * // Add a user message
 * dispatch({ type: 'ADD_MESSAGE', message: { role: 'user', content: 'Hello', timestamp: Date.now() } });
 *
 * // Handle streaming content
 * dispatch({ type: 'APPEND_DELTA', delta: 'Hi there!' });
 */
export function useAgentSession(
  sessionId: string,
  store?: AgentSessionStore
): UseAgentSessionReturn {
  // Create store ref (initialized in useEffect to be SSR-safe)
  const storeRef = useRef<AgentSessionStore | null>(store ?? null);

  // Track if we've loaded from storage yet
  const hasLoadedRef = useRef(false);

  // SSR-safe initial state: always create a new session with fixed timestamp
  // This ensures server and client render the same initial state
  const getInitialState = useCallback((): SessionState => {
    return createSessionState({
      id: sessionId,
      name: `Session ${sessionId.slice(0, 8)}`,
      agentType: 'claude-code',
      status: 'idle',
      messages: [],
      createdAt: 0, // Placeholder, will be updated from storage or on first action
      lastActiveAt: 0,
    });
  }, [sessionId]);

  const [state, rawDispatch] = useReducer(sessionReducer, null, getInitialState);

  // Initialize store and load from localStorage after mount (SSR-safe)
  useEffect(() => {
    if (!storeRef.current && typeof window !== 'undefined') {
      storeRef.current = new AgentSessionStore(window.localStorage);
    }

    // Load session from storage on initial mount
    if (!hasLoadedRef.current && storeRef.current) {
      hasLoadedRef.current = true;
      const existingSession = storeRef.current.getSession(sessionId);
      if (existingSession) {
        rawDispatch({ type: 'LOAD_SESSION', session: existingSession });
      }
    }
  }, [sessionId]);

  // Load session when sessionId changes (after initial mount)
  const prevSessionIdRef = useRef(sessionId);
  useEffect(() => {
    if (prevSessionIdRef.current !== sessionId) {
      prevSessionIdRef.current = sessionId;
      hasLoadedRef.current = true; // Mark as loaded for new session
      // Load the new session from store or create a new one
      const existingSession = storeRef.current?.getSession(sessionId);
      if (existingSession) {
        rawDispatch({ type: 'LOAD_SESSION', session: existingSession });
      } else {
        rawDispatch({ type: 'LOAD_SESSION', session: createNewSession(sessionId) });
      }
    }
  }, [sessionId]);

  // Persist state changes to store
  useEffect(() => {
    if (storeRef.current && hasLoadedRef.current) {
      // Extract AgentSession fields from SessionState for persistence
      const { error: _error, streamingContent: _streaming, ...sessionData } = state;
      storeRef.current.saveSession(sessionData);
    }
  }, [state]);

  // Memoize dispatch to maintain stable reference
  const dispatch = useCallback((action: SessionAction) => {
    rawDispatch(action);
  }, []);

  return { state, dispatch };
}
