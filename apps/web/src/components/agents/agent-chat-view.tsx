'use client';

/**
 * AgentChatView - Main chat view component for agent sessions
 *
 * Features:
 * - Renders events from server session using LogEntry components
 * - Handles streaming content via SSE
 * - Message input with Cmd/Ctrl+Enter submission
 * - Error and loading states
 *
 * Part of Plan 018: Agent Workspace Data Model Migration (Phase 3)
 * Subtask 002: Agent Chat Page - ST002
 *
 * Per DYK-01: Connect-First SSE Pattern - SSE hook mounted before API calls
 * Per DYK-05: Uses transformEventsToLogEntries for event→UI mapping
 */

import { useAgentSSE } from '@/hooks/useAgentSSE';
import { type StoredEvent, useServerSession } from '@/hooks/useServerSession';
import { transformEventsToLogEntries } from '@/lib/transformers/stored-event-to-log-entry';
import { cn } from '@/lib/utils';
import { AlertCircle, Bot, Loader2, Wifi, WifiOff } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AgentChatInput } from './agent-chat-input';
import { ContextWindowDisplay } from './context-window-display';
import { LogEntry, type LogEntryProps } from './log-entry';

export interface AgentChatViewProps {
  /** Session ID to display */
  sessionId: string;
  /** Workspace slug for API calls */
  workspaceSlug: string;
  /** Worktree path for workspace context */
  worktreePath?: string;
  /** Agent type for the session */
  agentType: 'claude-code' | 'copilot';
  /** Whether the agent is currently running */
  isRunning?: boolean;
  /** Additional CSS classes */
  className?: string;
}

/**
 * API response type from /api/workspaces/{slug}/agents/run
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
 * User message in local state (not from server events).
 */
interface UserMessage {
  role: 'user';
  content: string;
  timestamp: number;
}

/**
 * Main chat view component.
 *
 * @example
 * <AgentChatView
 *   sessionId="session-123"
 *   workspaceSlug="my-workspace"
 *   worktreePath="/path/to/worktree"
 *   agentType="claude-code"
 * />
 */
export function AgentChatView({
  sessionId,
  workspaceSlug,
  worktreePath,
  agentType,
  isRunning: isRunningProp = false,
  className,
}: AgentChatViewProps) {
  // Local state
  const [userMessages, setUserMessages] = useState<UserMessage[]>([]);
  const [streamingContent, setStreamingContent] = useState('');
  const [isRunning, setIsRunning] = useState(isRunningProp);
  const [error, setError] = useState<{ message: string; code?: string } | null>(null);
  const [contextUsage, setContextUsage] = useState<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const agentSessionIdRef = useRef<string | null>(null);

  // Server session hook - fetches events from storage
  const {
    session: serverSession,
    isLoading,
    error: sessionError,
    refetch,
    isConnected: serverSseConnected,
  } = useServerSession(sessionId, {
    subscribeToUpdates: true,
    workspaceSlug,
  });

  // SSE hook for real-time streaming - Per DYK-01: Connect BEFORE API calls
  // Using global 'agents' channel per DYK Insight #1
  const { isConnected: sseConnected } = useAgentSSE(
    'agents',
    {
      onTextDelta: useCallback(
        (delta: string, eventSessionId: string) => {
          // Filter by sessionId per DYK Insight #1
          if (eventSessionId !== sessionId) return;
          setStreamingContent((prev) => prev + delta);
        },
        [sessionId]
      ),

      onStatusChange: useCallback(
        (status: string, eventSessionId: string) => {
          if (eventSessionId !== sessionId) return;

          if (status === 'running') {
            setIsRunning(true);
          } else if (status === 'completed' || status === 'idle') {
            setIsRunning(false);
            setStreamingContent('');
            // Refetch to get final events
            refetch();
          }
        },
        [sessionId, refetch]
      ),

      onUsageUpdate: useCallback(
        (
          usage: { tokensUsed: number; tokensTotal: number; tokensLimit?: number },
          eventSessionId: string
        ) => {
          if (eventSessionId !== sessionId) return;
          if (usage.tokensLimit && usage.tokensLimit > 0) {
            const percentage = Math.round((usage.tokensTotal / usage.tokensLimit) * 100);
            setContextUsage(percentage);
          }
        },
        [sessionId]
      ),

      onError: useCallback(
        (message: string, eventSessionId: string, code?: string) => {
          if (eventSessionId !== sessionId) return;
          setError({ message, code });
          setIsRunning(false);
        },
        [sessionId]
      ),
    },
    { autoConnect: true }
  );

  // Transform server events to LogEntry props
  const serverEventProps = useMemo(() => {
    if (!serverSession?.events) return [];
    return transformEventsToLogEntries(serverSession.events as StoredEvent[]);
  }, [serverSession?.events]);

  // Merge user messages and server events into unified timeline
  const unifiedTimeline = useMemo(() => {
    // Convert user messages to timeline items
    const userItems = userMessages.map((msg, idx) => ({
      type: 'user' as const,
      timestamp: msg.timestamp,
      key: `user-${msg.timestamp}-${idx}`,
      props: {
        messageRole: 'user' as const,
        content: msg.content,
        contentType: 'text' as const,
      } satisfies LogEntryProps,
    }));

    // Convert server events to timeline items
    const serverItems = serverEventProps.map((props) => ({
      type: 'server' as const,
      timestamp: new Date(props.key.split('_')[0]).getTime() || Date.now(),
      key: props.key,
      props,
    }));

    // Merge and sort by timestamp
    return [...userItems, ...serverItems].sort((a, b) => a.timestamp - b.timestamp);
  }, [userMessages, serverEventProps]);

  // Auto-scroll to bottom when new content arrives
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll on both timeline and streaming changes
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [unifiedTimeline, streamingContent]);

  // Sync isRunning prop
  useEffect(() => {
    setIsRunning(isRunningProp);
  }, [isRunningProp]);

  // Handle sending a message
  const handleSendMessage = useCallback(
    async (content: string) => {
      // Clear error and add user message
      setError(null);
      setUserMessages((prev) => [...prev, { role: 'user', content, timestamp: Date.now() }]);
      setIsRunning(true);
      setStreamingContent('');

      try {
        // Build API URL
        const params = new URLSearchParams();
        if (worktreePath) {
          params.set('worktree', worktreePath);
        }
        const url = `/api/workspaces/${workspaceSlug}/agents/run${params.toString() ? `?${params.toString()}` : ''}`;

        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: content,
            agentType,
            sessionId,
            channel: 'agents', // Global channel per DYK Insight #1
            agentSessionId: agentSessionIdRef.current,
            worktreePath,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `API error: ${response.status}`);
        }

        const data: AgentRunResponse = await response.json();

        // Store agent session ID for future calls
        if (data.agentSessionId) {
          agentSessionIdRef.current = data.agentSessionId;
        }

        // Fallback: If SSE didn't complete, use API response
        // (This handles cases where tab was backgrounded)
        if (data.status === 'completed') {
          setIsRunning(false);
          setStreamingContent('');
          refetch();
        } else if (data.status === 'failed' || data.status === 'killed') {
          setError({ message: data.output || 'Agent failed' });
          setIsRunning(false);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        setError({ message });
        setIsRunning(false);
      }
    },
    [sessionId, workspaceSlug, worktreePath, agentType, refetch]
  );

  // Handle retry after error
  const handleRetry = useCallback(() => {
    const lastUserMsg = [...userMessages].reverse().find((m) => m.role === 'user');
    if (lastUserMsg) {
      handleSendMessage(lastUserMsg.content);
    }
  }, [userMessages, handleSendMessage]);

  // Loading state
  if (isLoading) {
    return (
      <div className={cn('flex-1 flex items-center justify-center', className)}>
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
          <p className="mt-2 text-sm text-muted-foreground">Loading session...</p>
        </div>
      </div>
    );
  }

  // Session error state
  if (sessionError) {
    return (
      <div className={cn('flex-1 flex items-center justify-center', className)}>
        <div className="text-center">
          <AlertCircle className="h-8 w-8 mx-auto text-red-500" />
          <p className="mt-2 text-sm text-red-600 dark:text-red-400">
            Failed to load session: {sessionError.message}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Header with status */}
      <div className="shrink-0 border-b px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-muted-foreground" />
            <span className="font-medium font-mono text-sm truncate max-w-xs">
              {sessionId.slice(-12)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {/* SSE connection indicator */}
            {sseConnected ? (
              <span title="Connected">
                <Wifi className="h-4 w-4 text-green-500" />
              </span>
            ) : (
              <span title="Disconnected">
                <WifiOff className="h-4 w-4 text-red-500" />
              </span>
            )}
            {/* Running indicator */}
            {isRunning && (
              <span className="inline-flex items-center gap-1 text-xs text-blue-600">
                <Loader2 className="h-3 w-3 animate-spin" />
                Running
              </span>
            )}
          </div>
        </div>
        {/* Context usage bar */}
        {contextUsage !== null && (
          <div className="mt-2">
            <ContextWindowDisplay usage={contextUsage} />
          </div>
        )}
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-auto">
        {unifiedTimeline.length === 0 && !streamingContent ? (
          <div className="h-full flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <Bot className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No messages yet</p>
              <p className="text-xs mt-1">Send a message to start the conversation</p>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {unifiedTimeline.map((item) => (
              <LogEntry key={item.key} {...item.props} />
            ))}
            {/* Streaming content */}
            {streamingContent && (
              <LogEntry messageRole="assistant" content={streamingContent} isStreaming />
            )}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Error display */}
      {error && (
        <div className="shrink-0 border-t bg-red-50 dark:bg-red-950/20 px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
              <AlertCircle className="h-4 w-4" />
              <span className="text-sm">{error.message}</span>
            </div>
            <button
              type="button"
              onClick={handleRetry}
              className="text-xs text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 underline"
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {/* Input area */}
      <div className="shrink-0 border-t p-4">
        <AgentChatInput
          onMessage={handleSendMessage}
          disabled={isRunning}
          placeholder={isRunning ? 'Agent is running...' : 'Send a message...'}
        />
      </div>
    </div>
  );
}

export default AgentChatView;
