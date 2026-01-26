'use client';

/**
 * Standalone Agents Page
 *
 * Main page for agent interaction - displays:
 * - Agent creation form
 * - List of sessions
 * - Chat view for selected session
 *
 * Part of Plan 012: Multi-Agent Web UI (Phase 2: Core Chat)
 */

import { AgentChatInput } from '@/components/agents/agent-chat-input';
import { AgentCreationForm } from '@/components/agents/agent-creation-form';
import { AgentListView } from '@/components/agents/agent-list-view';
import { AgentStatusIndicator } from '@/components/agents/agent-status-indicator';
import { ContextWindowDisplay } from '@/components/agents/context-window-display';
import { LogEntry } from '@/components/agents/log-entry';
import { useAgentSession } from '@/hooks/useAgentSession';
import type { AgentSession, AgentType } from '@/lib/schemas/agent-session.schema';
import { cn } from '@/lib/utils';
import { Bot } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';

/**
 * Generate a unique session ID.
 */
function generateSessionId(): string {
  return `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Standalone agents page with session management and chat interface.
 */
export default function AgentsPage() {
  const [sessions, setSessions] = useState<AgentSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  // Get active session
  const activeSession = useMemo(
    () => sessions.find((s) => s.id === activeSessionId) ?? null,
    [sessions, activeSessionId]
  );

  // Use the hook for the active session (creates a new one if needed)
  const { state: sessionState, dispatch } = useAgentSession(activeSessionId ?? 'placeholder');

  // Handle new session creation
  const handleCreate = useCallback((name: string, agentType: AgentType) => {
    const id = generateSessionId();
    const now = Date.now();
    const newSession: AgentSession = {
      id,
      name,
      agentType,
      status: 'idle',
      messages: [],
      createdAt: now,
      lastActiveAt: now,
    };

    setSessions((prev) => [newSession, ...prev]);
    setActiveSessionId(id);
  }, []);

  // Handle session selection
  const handleSelect = useCallback((sessionId: string) => {
    setActiveSessionId(sessionId);
  }, []);

  // Handle sending a message
  const handleSendMessage = useCallback(
    (content: string) => {
      if (!activeSessionId) return;

      // Add user message
      dispatch({
        type: 'ADD_MESSAGE',
        message: { role: 'user', content, timestamp: Date.now() },
      });

      // Start run and simulate response (in real implementation, this would hit API)
      dispatch({ type: 'START_RUN' });

      // For now, just simulate a response after a short delay
      setTimeout(() => {
        dispatch({ type: 'APPEND_DELTA', delta: 'Hello! I am your AI assistant. ' });
        setTimeout(() => {
          dispatch({ type: 'APPEND_DELTA', delta: 'How can I help you today?' });
          dispatch({ type: 'COMPLETE_RUN' });
        }, 500);
      }, 500);
    },
    [activeSessionId, dispatch]
  );

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
          <AgentCreationForm onCreate={handleCreate} />
        </div>

        {/* Sessions List */}
        <div className="flex-1 overflow-auto">
          <AgentListView
            sessions={sessions}
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
              </div>
              <AgentStatusIndicator status={sessionState.status} />
            </header>

            {/* Context Window */}
            {sessionState.contextUsage !== undefined && (
              <ContextWindowDisplay usage={sessionState.contextUsage} className="border-b" />
            )}

            {/* Messages */}
            <div className="flex-1 overflow-auto divide-y divide-border/50">
              {sessionState.messages.map((msg, idx) => (
                <LogEntry
                  key={`${msg.timestamp}-${idx}`}
                  messageRole={msg.role}
                  content={msg.content}
                />
              ))}
              {/* Streaming content */}
              {sessionState.streamingContent && (
                <LogEntry
                  messageRole="assistant"
                  content={sessionState.streamingContent}
                  isStreaming
                />
              )}
              {sessionState.messages.length === 0 && !sessionState.streamingContent && (
                <div className="flex-1 flex items-center justify-center p-8 text-muted-foreground">
                  <p className="text-sm">Start a conversation by sending a message below.</p>
                </div>
              )}
            </div>

            {/* Input */}
            <div className="p-4 border-t">
              <AgentChatInput
                onMessage={handleSendMessage}
                disabled={sessionState.status === 'running'}
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
