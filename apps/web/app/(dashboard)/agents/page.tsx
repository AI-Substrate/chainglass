'use client';

/**
 * Standalone Agents Page
 *
 * Architecture:
 * - Single SSE channel ('agents') for all agent events
 * - Centralized sessions state with per-session messages
 * - Events routed to correct session by sessionId
 *
 * Part of Plan 012: Multi-Agent Web UI (Phase 2: Core Chat)
 */

import { AgentChatInput } from '@/components/agents/agent-chat-input';
import { AgentCreationForm } from '@/components/agents/agent-creation-form';
import { AgentListView } from '@/components/agents/agent-list-view';
import { AgentStatusIndicator } from '@/components/agents/agent-status-indicator';
import { ContextWindowDisplay } from '@/components/agents/context-window-display';
import { LogEntry } from '@/components/agents/log-entry';
import { useAgentSSE } from '@/hooks/useAgentSSE';
import type {
  AgentMessage,
  AgentSession,
  AgentType,
  SessionStatus,
} from '@/lib/schemas/agent-session.schema';
import { Bot, RefreshCw } from 'lucide-react';
import { useCallback, useMemo, useRef, useState } from 'react';

/**
 * Extended session state with runtime fields.
 */
interface SessionState extends AgentSession {
  streamingContent: string;
  error: { message: string; code?: string } | null;
  contextUsage?: number;
}

/**
 * Generate a unique session ID.
 */
function generateSessionId(): string {
  return `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Create initial session state.
 */
function createSession(id: string, name: string, agentType: AgentType): SessionState {
  const now = Date.now();
  return {
    id,
    name,
    agentType,
    status: 'idle',
    messages: [],
    createdAt: now,
    lastActiveAt: now,
    streamingContent: '',
    error: null,
  };
}

/**
 * API response type from /api/agents/run
 */
interface AgentRunResponse {
  agentSessionId: string;
  output: string;
  status: 'completed' | 'failed' | 'killed';
  tokens: {
    used: number;
    total: number;
    limit: number;
  } | null;
}

/**
 * Standalone agents page with session management and chat interface.
 */
export default function AgentsPage() {
  // Centralized sessions store - ALL sessions live here
  const [sessions, setSessions] = useState<Map<string, SessionState>>(new Map());
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  // Track agent session IDs for resume (per session)
  const agentSessionIdsRef = useRef<Map<string, string>>(new Map());

  // Get active session
  const activeSession = useMemo(
    () => (activeSessionId ? (sessions.get(activeSessionId) ?? null) : null),
    [sessions, activeSessionId]
  );

  // Get sessions as array for list view
  const sessionsList = useMemo(
    () => Array.from(sessions.values()).sort((a, b) => b.createdAt - a.createdAt),
    [sessions]
  );

  // Helper to update a specific session
  const updateSession = useCallback(
    (sessionId: string, updater: (s: SessionState) => SessionState) => {
      setSessions((prev) => {
        const session = prev.get(sessionId);
        if (!session) return prev;
        const next = new Map(prev);
        next.set(sessionId, updater(session));
        return next;
      });
    },
    []
  );

  // Single global SSE channel for all agent events
  const { isConnected: sseConnected } = useAgentSSE('agents', {
    onTextDelta: useCallback(
      (delta: string, sessionId: string) => {
        updateSession(sessionId, (s) => ({
          ...s,
          streamingContent: s.streamingContent + delta,
          lastActiveAt: Date.now(),
        }));
      },
      [updateSession]
    ),

    onStatusChange: useCallback(
      (status: string, sessionId: string) => {
        updateSession(sessionId, (s) => {
          if (status === 'running') {
            return { ...s, status: 'running' as SessionStatus, lastActiveAt: Date.now() };
          }
          if (status === 'completed') {
            // Finalize streaming content as assistant message
            const messages: AgentMessage[] = s.streamingContent
              ? [
                  ...s.messages,
                  {
                    role: 'assistant',
                    content: s.streamingContent,
                    timestamp: Date.now(),
                    contentType: 'text' as const,
                  },
                ]
              : s.messages;
            return {
              ...s,
              status: 'completed' as SessionStatus,
              messages,
              streamingContent: '',
              lastActiveAt: Date.now(),
            };
          }
          if (status === 'idle') {
            return { ...s, status: 'idle' as SessionStatus, lastActiveAt: Date.now() };
          }
          return s;
        });
      },
      [updateSession]
    ),

    onUsageUpdate: useCallback(
      (
        usage: { tokensUsed: number; tokensTotal: number; tokensLimit?: number },
        sessionId: string
      ) => {
        if (usage.tokensLimit && usage.tokensLimit > 0) {
          const percentage = Math.round((usage.tokensTotal / usage.tokensLimit) * 100);
          updateSession(sessionId, (s) => ({ ...s, contextUsage: percentage }));
        }
      },
      [updateSession]
    ),

    onError: useCallback(
      (message: string, sessionId: string, code?: string) => {
        updateSession(sessionId, (s) => ({
          ...s,
          error: { message, code },
          status: 'idle' as SessionStatus,
          lastActiveAt: Date.now(),
        }));
      },
      [updateSession]
    ),
  });

  // Handle new session creation
  const handleCreate = useCallback((name: string, agentType: AgentType) => {
    const id = generateSessionId();
    const session = createSession(id, name, agentType);
    setSessions((prev) => {
      const next = new Map(prev);
      next.set(id, session);
      return next;
    });
    setActiveSessionId(id);
  }, []);

  // Handle session selection
  const handleSelect = useCallback((sessionId: string) => {
    setActiveSessionId(sessionId);
  }, []);

  // Handle sending a message to the agent
  const handleSendMessage = useCallback(
    async (content: string) => {
      if (!activeSessionId || !activeSession) return;

      const sessionId = activeSessionId;
      const agentType = activeSession.agentType;

      // Clear error and add user message
      updateSession(sessionId, (s) => ({
        ...s,
        error: null,
        messages: [
          ...s.messages,
          { role: 'user', content, timestamp: Date.now(), contentType: 'text' as const },
        ],
        status: 'running' as SessionStatus,
        streamingContent: '',
        lastActiveAt: Date.now(),
      }));

      try {
        // Call the API
        const response = await fetch('/api/agents/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: content,
            agentType,
            sessionId,
            channel: 'agents', // Single global channel
            agentSessionId: agentSessionIdsRef.current.get(sessionId),
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `API error: ${response.status}`);
        }

        const data: AgentRunResponse = await response.json();

        // Store agent session ID for future calls
        if (data.agentSessionId) {
          agentSessionIdsRef.current.set(sessionId, data.agentSessionId);
        }

        // Fallback: If SSE didn't deliver the response (tab backgrounded), use API response
        setSessions((prev) => {
          const session = prev.get(sessionId);
          if (!session) return prev;

          // Only apply fallback if still running (SSE didn't complete it)
          if (session.status !== 'running') return prev;

          const next = new Map(prev);
          if (data.status === 'completed' && data.output) {
            next.set(sessionId, {
              ...session,
              status: 'completed',
              messages: [
                ...session.messages,
                {
                  role: 'assistant',
                  content: data.output,
                  timestamp: Date.now(),
                  contentType: 'text' as const,
                },
              ],
              streamingContent: '',
              lastActiveAt: Date.now(),
            });
          } else if (data.status === 'failed' || data.status === 'killed') {
            next.set(sessionId, {
              ...session,
              status: 'idle',
              error: { message: data.output || 'Agent failed' },
              lastActiveAt: Date.now(),
            });
          }
          return next;
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        updateSession(sessionId, (s) => ({
          ...s,
          error: { message },
          status: 'idle' as SessionStatus,
          lastActiveAt: Date.now(),
        }));
      }
    },
    [activeSessionId, activeSession, updateSession]
  );

  // Handle retry after error
  const handleRetry = useCallback(() => {
    if (!activeSession?.messages.length) return;
    const lastUserMsg = [...activeSession.messages].reverse().find((m) => m.role === 'user');
    if (lastUserMsg) {
      handleSendMessage(lastUserMsg.content);
    }
  }, [activeSession, handleSendMessage]);

  return (
    <main className="flex h-full">
      {/* Sidebar - Sessions List */}
      <aside className="w-72 border-r bg-muted/30 flex flex-col">
        {/* Header */}
        <div className="p-4 border-b">
          <h1 className="text-lg font-semibold flex items-center gap-2">
            <Bot className="h-5 w-5" />
            Agents
          </h1>
        </div>

        {/* Creation Form */}
        <div className="p-4 border-b">
          <AgentCreationForm onCreate={handleCreate} sessionCount={sessions.size} />
        </div>

        {/* Sessions List */}
        <div className="flex-1 overflow-auto">
          <AgentListView
            sessions={sessionsList}
            activeSessionId={activeSessionId}
            onSelect={handleSelect}
          />
        </div>
      </aside>

      {/* Main Content - Chat View */}
      <div className="flex-1 flex flex-col">
        {activeSession ? (
          <>
            {/* Chat Header */}
            <header className="px-4 py-3 border-b flex items-center justify-between">
              <div>
                <h2 className="font-medium">{activeSession.name}</h2>
                <p className="text-xs text-muted-foreground">
                  {activeSession.agentType === 'claude-code' ? 'Claude Code' : 'GitHub Copilot'}
                </p>
              </div>
              <AgentStatusIndicator status={activeSession.status} />
            </header>

            {/* Context Window */}
            {activeSession.contextUsage !== undefined && (
              <ContextWindowDisplay usage={activeSession.contextUsage} className="border-b" />
            )}

            {/* Messages */}
            <div className="flex-1 overflow-auto divide-y divide-border/50">
              {activeSession.messages.map((msg, idx) => (
                <LogEntry
                  key={`${msg.timestamp}-${idx}`}
                  messageRole={msg.role}
                  content={msg.content}
                />
              ))}
              {/* Streaming content */}
              {activeSession.streamingContent && (
                <LogEntry
                  messageRole="assistant"
                  content={activeSession.streamingContent}
                  isStreaming
                />
              )}
              {/* Error display */}
              {activeSession.error && (
                <div className="px-4 py-3 bg-red-50 dark:bg-red-950/20 border-l-2 border-red-500">
                  <div className="flex items-start gap-2 text-sm text-red-700 dark:text-red-400">
                    <span className="shrink-0">Error:</span>
                    <div className="flex-1">
                      <p>{activeSession.error.message}</p>
                      <button
                        type="button"
                        onClick={handleRetry}
                        className="mt-1 inline-flex items-center gap-1 text-xs text-red-600 dark:text-red-400 hover:underline"
                      >
                        <RefreshCw className="h-3 w-3" />
                        Retry
                      </button>
                    </div>
                  </div>
                </div>
              )}
              {activeSession.messages.length === 0 &&
                !activeSession.streamingContent &&
                !activeSession.error && (
                  <div className="flex-1 flex items-center justify-center p-8 text-muted-foreground">
                    <p className="text-sm">Start a conversation by sending a message below.</p>
                  </div>
                )}
            </div>

            {/* Input */}
            <div className="p-4 border-t">
              <AgentChatInput
                onMessage={handleSendMessage}
                disabled={activeSession.status === 'running'}
              />
            </div>
          </>
        ) : (
          /* No session selected */
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <Bot className="h-12 w-12 mx-auto mb-4 opacity-30" />
              <p className="text-lg font-medium">No session selected</p>
              <p className="text-sm mt-1">Create a new session or select one from the list</p>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
