# External Research: State Management for Multi-Agent Chat Applications

**Research Date**: 2026-01-26
**Source**: Perplexity Deep Research
**Query**: State management patterns for multi-agent chat applications (2025-2026)

---

## Executive Summary

The optimal state management architecture for multi-agent chat applications in 2025-2026 **eschews monolithic global stores** (Redux, Zustand) in favor of a layered approach:

1. **Isolated state machines per session** (useReducer)
2. **Lightweight session manager** with callbacks (not Context broadcasts)
3. **Two-pass rendering** for hydration safety
4. **Explicit token budget tracking** with compaction strategies

---

## Architecture Overview: Three-Layer System

### Layer 1: Presentation
- Renders individual session components
- Memoized to prevent unnecessary re-renders

### Layer 2: State Management
- Per-session state machines (useReducer)
- Lightweight session orchestrator

### Layer 3: Persistence
- localStorage with Zod validation
- Handles serialization/hydration

**Key Principle**: Individual session components render efficiently without triggering updates to unrelated sessions.

---

## State Machine Pattern for Agent Sessions

### Session State Machine

```typescript
// Types
export type SessionState = 'idle' | 'running' | 'waiting_input' | 'completed' | 'archived';

export interface AgentSession {
  id: string;
  name: string;
  agentType: 'claude' | 'copilot';
  status: SessionState;
  messages: Message[];
  createdAt: number;
  lastActiveAt: number;
  contextWindowUsed: number;
  contextWindowLimit: number;
  archivedAt?: number;
  metadata: Record<string, unknown>;
}

export type SessionAction =
  | { type: 'START_RUN' }
  | { type: 'ADD_MESSAGE'; payload: Message }
  | { type: 'WAITING_INPUT' }
  | { type: 'MARK_COMPLETED' }
  | { type: 'ARCHIVE' }
  | { type: 'RESTORE' }
  | { type: 'UPDATE_CONTEXT'; payload: { used: number; limit: number } }
  | { type: 'CLEAR_MESSAGES' };

// Reducer with valid state transitions
function sessionReducer(state: AgentSession, action: SessionAction): AgentSession {
  switch (action.type) {
    case 'START_RUN':
      if (state.status !== 'idle' && state.status !== 'waiting_input') {
        return state; // Invalid transition
      }
      return { ...state, status: 'running', lastActiveAt: Date.now() };

    case 'ADD_MESSAGE':
      return {
        ...state,
        messages: [...state.messages, action.payload],
        contextWindowUsed: state.contextWindowUsed + action.payload.tokenCount,
        lastActiveAt: Date.now(),
      };

    case 'WAITING_INPUT':
      if (state.status !== 'running') return state;
      return { ...state, status: 'waiting_input', lastActiveAt: Date.now() };

    case 'MARK_COMPLETED':
      if (state.status !== 'running' && state.status !== 'waiting_input') return state;
      return { ...state, status: 'completed', lastActiveAt: Date.now() };

    case 'ARCHIVE':
      return { ...state, status: 'archived', archivedAt: Date.now() };

    case 'RESTORE':
      return { ...state, status: 'idle', archivedAt: undefined };

    case 'UPDATE_CONTEXT':
      return {
        ...state,
        contextWindowUsed: action.payload.used,
        contextWindowLimit: action.payload.limit,
      };

    case 'CLEAR_MESSAGES':
      return { ...state, messages: [], contextWindowUsed: 0 };

    default:
      return state;
  }
}
```

### Custom Hook for Session Management

```typescript
export function useAgentSession(initialSession: AgentSession) {
  const [session, dispatch] = useReducer(sessionReducer, initialSession);

  const startRun = useCallback(() => dispatch({ type: 'START_RUN' }), []);
  const addMessage = useCallback((message: Message) =>
    dispatch({ type: 'ADD_MESSAGE', payload: message }), []);
  const waitingInput = useCallback(() => dispatch({ type: 'WAITING_INPUT' }), []);
  const markCompleted = useCallback(() => dispatch({ type: 'MARK_COMPLETED' }), []);
  const archive = useCallback(() => dispatch({ type: 'ARCHIVE' }), []);
  const restore = useCallback(() => dispatch({ type: 'RESTORE' }), []);
  const updateContextWindow = useCallback((used: number, limit: number) =>
    dispatch({ type: 'UPDATE_CONTEXT', payload: { used, limit } }), []);

  return {
    session,
    actions: { startRun, addMessage, waitingInput, markCompleted, archive, restore, updateContextWindow },
  };
}
```

---

## Multi-Session Orchestration

### Sessions Manager

Maintains a map of sessions, uses callbacks instead of Context broadcast:

```typescript
export interface SessionsManagerState {
  sessions: Map<string, AgentSession>;
  activeSessionId: string | null;
  sortBy: 'recent' | 'alphabetical' | 'agentType';
}

export type SessionsManagerAction =
  | { type: 'CREATE_SESSION'; payload: AgentSession }
  | { type: 'UPDATE_SESSION'; payload: AgentSession }
  | { type: 'DELETE_SESSION'; payload: string }
  | { type: 'SET_ACTIVE_SESSION'; payload: string | null }
  | { type: 'ARCHIVE_SESSION'; payload: string }
  | { type: 'RESTORE_SESSION'; payload: string }
  | { type: 'BATCH_UPDATE_SESSIONS'; payload: AgentSession[] };

function sessionsReducer(
  state: SessionsManagerState,
  action: SessionsManagerAction
): SessionsManagerState {
  switch (action.type) {
    case 'CREATE_SESSION': {
      const newSessions = new Map(state.sessions);
      newSessions.set(action.payload.id, action.payload);
      return {
        ...state,
        sessions: newSessions,
        activeSessionId: action.payload.id, // Auto-activate new sessions
      };
    }

    case 'UPDATE_SESSION': {
      const newSessions = new Map(state.sessions);
      newSessions.set(action.payload.id, action.payload);
      return { ...state, sessions: newSessions };
    }

    case 'DELETE_SESSION': {
      const newSessions = new Map(state.sessions);
      newSessions.delete(action.payload);
      const newActiveId = state.activeSessionId === action.payload ? null : state.activeSessionId;
      return { ...state, sessions: newSessions, activeSessionId: newActiveId };
    }

    case 'SET_ACTIVE_SESSION':
      return { ...state, activeSessionId: action.payload };

    case 'ARCHIVE_SESSION': {
      const session = state.sessions.get(action.payload);
      if (!session) return state;
      const updated = { ...session, status: 'archived' as const, archivedAt: Date.now() };
      const newSessions = new Map(state.sessions);
      newSessions.set(action.payload, updated);
      return { ...state, sessions: newSessions };
    }

    case 'BATCH_UPDATE_SESSIONS': {
      const newSessions = new Map(state.sessions);
      action.payload.forEach((session) => newSessions.set(session.id, session));
      return { ...state, sessions: newSessions };
    }

    default:
      return state;
  }
}

export function useSessionsManager(initialSessions: AgentSession[] = []) {
  const initialState: SessionsManagerState = {
    sessions: new Map(initialSessions.map((s) => [s.id, s])),
    activeSessionId: initialSessions.length > 0 ? initialSessions[0].id : null,
    sortBy: 'recent',
  };

  const [state, dispatch] = useReducer(sessionsReducer, initialState);

  // Type-safe action creators
  const createSession = useCallback((session: AgentSession) =>
    dispatch({ type: 'CREATE_SESSION', payload: session }), []);
  const updateSession = useCallback((session: AgentSession) =>
    dispatch({ type: 'UPDATE_SESSION', payload: session }), []);
  const deleteSession = useCallback((sessionId: string) =>
    dispatch({ type: 'DELETE_SESSION', payload: sessionId }), []);
  const setActiveSession = useCallback((sessionId: string | null) =>
    dispatch({ type: 'SET_ACTIVE_SESSION', payload: sessionId }), []);
  const archiveSession = useCallback((sessionId: string) =>
    dispatch({ type: 'ARCHIVE_SESSION', payload: sessionId }), []);

  // Computed selectors
  const getActiveSession = useCallback(() =>
    state.activeSessionId ? state.sessions.get(state.activeSessionId) : null,
    [state.sessions, state.activeSessionId]);
  const getAllSessions = useCallback(() =>
    Array.from(state.sessions.values()), [state.sessions]);
  const getActiveSessions = useCallback(() =>
    Array.from(state.sessions.values()).filter((s) => s.status !== 'archived'),
    [state.sessions]);
  const getArchivedSessions = useCallback(() =>
    Array.from(state.sessions.values()).filter((s) => s.status === 'archived'),
    [state.sessions]);

  return {
    state,
    actions: { createSession, updateSession, deleteSession, setActiveSession, archiveSession },
    selectors: { getActiveSession, getAllSessions, getActiveSessions, getArchivedSessions },
  };
}
```

---

## Session Persistence with Zod Validation

### Zod Schemas

```typescript
import { z } from 'zod';

const MessageSchema = z.object({
  id: z.string().uuid(),
  role: z.enum(['user', 'assistant']),
  content: z.string(),
  timestamp: z.number(),
  tokenCount: z.number().min(0),
});

const SessionSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(200),
  agentType: z.enum(['claude', 'copilot']),
  status: z.enum(['idle', 'running', 'waiting_input', 'completed', 'archived']),
  messages: z.array(MessageSchema),
  createdAt: z.number(),
  lastActiveAt: z.number(),
  contextWindowUsed: z.number().min(0),
  contextWindowLimit: z.number().min(1),
  archivedAt: z.number().optional(),
  metadata: z.record(z.unknown()),
});

const SessionsDataSchema = z.object({
  sessions: z.array(SessionSchema),
  activeSessionId: z.string().uuid().nullable(),
  version: z.literal(1), // For future schema migrations
});

type ValidatedSessionsData = z.infer<typeof SessionsDataSchema>;
```

### Storage Key and Error Handling

```typescript
const SESSIONS_STORAGE_KEY = 'agent-sessions-v1';

class StorageError extends Error {
  constructor(
    message: string,
    public readonly cause: 'not_available' | 'quota_exceeded' | 'parse_error'
  ) {
    super(message);
  }
}
```

### Hydration Hook (Prevents Hydration Mismatches)

```typescript
export function useSessionsHydration(
  onDataLoaded: (data: ValidatedSessionsData) => void,
  onError?: (error: StorageError) => void
) {
  const [isHydrated, setIsHydrated] = useState(false);
  const hydrationRef = useRef(false);

  useEffect(() => {
    // Guard against hydration running multiple times
    if (hydrationRef.current) return;
    hydrationRef.current = true;

    const hydrateFromStorage = async () => {
      try {
        if (typeof window === 'undefined' || !window.localStorage) {
          throw new StorageError('localStorage not available', 'not_available');
        }

        const rawData = window.localStorage.getItem(SESSIONS_STORAGE_KEY);
        if (!rawData) {
          setIsHydrated(true);
          return;
        }

        let parsedData: unknown;
        try {
          parsedData = JSON.parse(rawData);
        } catch (e) {
          throw new StorageError('Failed to parse stored sessions', 'parse_error');
        }

        const validationResult = SessionsDataSchema.safeParse(parsedData);
        if (!validationResult.success) {
          console.error('Sessions validation failed:', validationResult.error);
          throw new StorageError('Stored sessions failed validation', 'parse_error');
        }

        onDataLoaded(validationResult.data);
        setIsHydrated(true);
      } catch (error) {
        if (error instanceof StorageError) {
          onError?.(error);
        }
        setIsHydrated(true);
      }
    };

    hydrateFromStorage();
  }, [onDataLoaded, onError]);

  return isHydrated;
}
```

### Persistence Hook with Debouncing

```typescript
export function useSessionsPersistence(
  sessions: AgentSession[],
  activeSessionId: string | null,
  enabled: boolean = true
) {
  const storeRef = useRef<SessionsPersistentStore | null>(null);
  const pendingUpdateRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      storeRef.current = new SessionsPersistentStore();
    } catch (error) {
      console.error('Failed to initialize sessions store:', error);
    }
  }, []);

  useEffect(() => {
    if (!enabled || !storeRef.current) return;

    if (pendingUpdateRef.current) {
      clearTimeout(pendingUpdateRef.current);
    }

    // Debounce by 500ms to batch rapid updates
    pendingUpdateRef.current = setTimeout(async () => {
      try {
        const dataToSave: ValidatedSessionsData = {
          sessions: sessions,
          activeSessionId: activeSessionId,
          version: 1,
        };
        await storeRef.current!.save(dataToSave);
      } catch (error) {
        console.error('Failed to persist sessions:', error);
      }
    }, 500);

    return () => {
      if (pendingUpdateRef.current) {
        clearTimeout(pendingUpdateRef.current);
      }
    };
  }, [sessions, activeSessionId, enabled]);

  return storeRef.current;
}
```

---

## Token Budget Tracking

### Model Context Limits (2026)

```typescript
const MODEL_CONTEXT_LIMITS: Record<string, number> = {
  'claude-3-5-sonnet': 200000,
  'claude-3-opus': 200000,
  'gpt-4-turbo': 128000,
  'gpt-4o': 128000,
  'copilot-latest': 100000,
};

const COMPLETION_BUFFER = 2000; // Reserve for completion output
```

### Token Budget Status

```typescript
export function getTokenBudgetStatus(
  used: number,
  limit: number
): 'healthy' | 'warning' | 'critical' {
  const percentage = (used / limit) * 100;
  if (percentage >= 90) return 'critical';
  if (percentage >= 75) return 'warning';
  return 'healthy';
}

export function calculateAvailableTokens(
  used: number,
  limit: number,
  bufferSize: number = COMPLETION_BUFFER
): number {
  return Math.max(0, limit - used - bufferSize);
}
```

### Message History Compaction

```typescript
export interface CompactionStrategy {
  type: 'truncate' | 'summarize' | 'chunked';
  targetMessageCount: number;
  preserveSystemPrompt: boolean;
}

export function compactMessageHistory(
  messages: Message[],
  strategy: CompactionStrategy
): { compacted: Message[]; removedCount: number } {
  if (messages.length <= strategy.targetMessageCount) {
    return { compacted: messages, removedCount: 0 };
  }

  switch (strategy.type) {
    case 'truncate': {
      const kept = messages.slice(-strategy.targetMessageCount);
      return { compacted: kept, removedCount: messages.length - kept.length };
    }

    case 'chunked': {
      // Keep system prompt, most recent, and sample older messages
      const recentMessages = messages.slice(-Math.floor(strategy.targetMessageCount * 0.7));
      const sampledMiddle = messages
        .slice(0, messages.length - recentMessages.length)
        .filter((_, i) => i % 2 === 0)
        .slice(0, Math.floor(strategy.targetMessageCount * 0.3));

      const compacted = [...sampledMiddle, ...recentMessages];
      return { compacted, removedCount: messages.length - compacted.length };
    }

    default:
      return { compacted: messages.slice(-strategy.targetMessageCount), removedCount: 0 };
  }
}
```

---

## Session Switching UI Component

### Memoized Session Tab

```typescript
const SessionTab = memo(function SessionTab({
  session,
  isActive,
  onSelect,
  onArchive,
  onDelete,
}: SessionTabProps) {
  const getStatusColor = (status: SessionState): string => {
    switch (status) {
      case 'running': return 'bg-blue-500';
      case 'waiting_input': return 'bg-yellow-500';
      case 'completed': return 'bg-green-500';
      case 'archived': return 'bg-gray-500';
      default: return 'bg-gray-400';
    }
  };

  const contextUsagePercent = Math.round(
    (session.contextWindowUsed / session.contextWindowLimit) * 100
  );

  return (
    <button
      onClick={onSelect}
      className={`px-4 py-2 rounded-lg flex items-center gap-2 border ${
        isActive ? 'bg-blue-50 border-blue-400 shadow-md' : 'bg-white hover:bg-gray-50'
      }`}
    >
      <span className={`w-2 h-2 rounded-full ${getStatusColor(session.status)}`} />
      <span className="truncate text-sm font-medium">{session.name}</span>

      {contextUsagePercent > 75 && (
        <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
          contextUsagePercent > 90
            ? 'bg-red-100 text-red-700'
            : 'bg-yellow-100 text-yellow-700'
        }`}>
          {contextUsagePercent}%
        </span>
      )}
    </button>
  );
});
```

### Session Switcher Component

```typescript
export const SessionSwitcher = memo(function SessionSwitcher({
  sessions,
  activeSessionId,
  onSessionSelect,
  onSessionArchive,
  onSessionDelete,
  onNewSession,
}: SessionSwitcherProps) {
  const { active, running, idle, archived } = useMemo(() => ({
    active: sessions.filter(s => s.id === activeSessionId && s.status !== 'archived'),
    running: sessions.filter(s => s.id !== activeSessionId && s.status === 'running'),
    idle: sessions.filter(s => s.id !== activeSessionId && (s.status === 'idle' || s.status === 'waiting_input')),
    archived: sessions.filter(s => s.status === 'archived'),
  }), [sessions, activeSessionId]);

  return (
    <div className="flex flex-col gap-4 p-4 bg-gray-50 rounded-lg">
      <button
        onClick={onNewSession}
        className="w-full px-4 py-2 rounded-lg bg-blue-500 text-white font-medium"
      >
        + New Session
      </button>

      {running.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold text-gray-600 uppercase">
            Running ({running.length})
          </p>
          {running.map((session) => (
            <SessionTab
              key={session.id}
              session={session}
              isActive={false}
              onSelect={() => onSessionSelect(session.id)}
              onArchive={() => onSessionArchive(session.id)}
              onDelete={() => onSessionDelete(session.id)}
            />
          ))}
        </div>
      )}

      {idle.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold text-gray-600 uppercase">
            Other Sessions ({idle.length})
          </p>
          {idle.map((session) => (
            <SessionTab key={session.id} session={session} /* ... */ />
          ))}
        </div>
      )}

      {archived.length > 0 && (
        <details>
          <summary className="text-xs font-semibold text-gray-600 uppercase cursor-pointer">
            Archived ({archived.length})
          </summary>
          {archived.map((session) => (
            <SessionTab key={session.id} session={session} /* ... */ />
          ))}
        </details>
      )}
    </div>
  );
});
```

---

## Common Pitfalls to Avoid

### 1. Context Broadcast Cascades

**Problem**: Storing all sessions in a single Context provider causes re-renders across all components.

**Solution**: Use selective subscriptions through custom hooks or useSyncExternalStore.

### 2. Stale Closures

**Problem**: Event handlers capture previous session state when users switch rapidly.

**Solution**: Use useRef to maintain latest session reference, or functional setState pattern.

```typescript
// BAD: Stale closure
const handleMessage = () => {
  addMessage({ sessionId: currentSessionId, ... }); // May be stale
};

// GOOD: Use ref
const sessionIdRef = useRef(currentSessionId);
useEffect(() => { sessionIdRef.current = currentSessionId; }, [currentSessionId]);

const handleMessage = () => {
  addMessage({ sessionId: sessionIdRef.current, ... }); // Always current
};
```

### 3. Hydration Mismatches

**Problem**: Reading localStorage during render causes server/client HTML mismatch.

**Solution**: Two-pass rendering - deterministic default on SSR, hydrate in useEffect.

```typescript
// Component renders empty state initially
const [isHydrated, setIsHydrated] = useState(false);

useEffect(() => {
  setIsHydrated(true); // Only after mount
}, []);

return isHydrated ? <SessionContent sessions={sessions} /> : <LoadingState />;
```

### 4. Memory Issues with Large Sessions

**Problem**: Many sessions with large message histories exhaust memory.

**Solution**: Progressive disclosure, virtualization, automatic compaction.

---

## Production Integration Example

```typescript
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSessionsManager } from './sessionsManager';
import { useSessionsHydration, useSessionsPersistence } from './sessionsPersistence';

export default function ChatApp() {
  const [isHydrated, setIsHydrated] = useState(false);
  const { state, actions, selectors } = useSessionsManager();

  // Hydration handler
  const handleDataLoaded = useCallback((data) => {
    if (data.sessions.length > 0) {
      actions.batchUpdateSessions(data.sessions);
      if (data.activeSessionId) {
        actions.setActiveSession(data.activeSessionId);
      }
    }
  }, [actions]);

  // Hydration effect
  useSessionsHydration(handleDataLoaded, (error) => console.error(error));

  // Persistence (only after hydration)
  useSessionsPersistence(
    Array.from(state.sessions.values()),
    state.activeSessionId,
    isHydrated
  );

  useEffect(() => { setIsHydrated(true); }, []);

  const handleCreateSession = useCallback(() => {
    const newSession = {
      id: crypto.randomUUID(),
      name: `Session ${state.sessions.size + 1}`,
      agentType: 'claude',
      status: 'idle',
      messages: [],
      createdAt: Date.now(),
      lastActiveAt: Date.now(),
      contextWindowUsed: 0,
      contextWindowLimit: 200000,
      metadata: {},
    };
    actions.createSession(newSession);
  }, [actions, state.sessions.size]);

  const activeSession = selectors.getActiveSession();

  return (
    <div className="flex h-screen">
      <SessionSwitcher
        sessions={selectors.getAllSessions()}
        activeSessionId={state.activeSessionId}
        onSessionSelect={actions.setActiveSession}
        onSessionArchive={actions.archiveSession}
        onSessionDelete={actions.deleteSession}
        onNewSession={handleCreateSession}
      />

      <main className="flex-1">
        {isHydrated ? (
          activeSession ? (
            <ChatView session={activeSession} />
          ) : (
            <EmptyState onCreateSession={handleCreateSession} />
          )
        ) : (
          <LoadingState />
        )}
      </main>
    </div>
  );
}
```

---

## Key Takeaways for Plan 012

1. **No global state libraries** - Use React 19 hooks (useReducer, useCallback, useMemo)
2. **State machine per session** - Explicit transitions prevent invalid states
3. **Lightweight orchestrator** - Map of sessions with callback-based updates
4. **Two-pass hydration** - Deterministic SSR, localStorage in useEffect
5. **Zod validation** - Type-safe persistence with schema versioning
6. **Debounced persistence** - 500ms batch to avoid excessive writes
7. **Token budget tracking** - Explicit accounting with compaction strategies
8. **Memoized components** - SessionTab, SessionSwitcher prevent re-renders

---

**Research Complete**
