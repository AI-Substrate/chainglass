'use client';

/**
 * AgentChatView - Main chat view component for agent interactions
 *
 * Features:
 * - Renders events from server using LogEntry components
 * - Handles streaming content via SSE
 * - Message input with Cmd/Ctrl+Enter submission
 * - Error and loading states
 *
 * Part of Plan 019: Agent Manager Refactor (Phase 5: Consolidation & Cleanup)
 * Per DYK-01: Props changed from sessionId/workspaceSlug/agentType to just agentId
 * Per DYK-02: Uses useAgentInstance for both API fetch and SSE subscription
 * Per DYK-05: Uses transformAgentEventsToLogEntries from 019 feature folder
 */

import {
  type AgentStoredEvent,
  transformAgentEventsToLogEntries,
  useAgentInstance,
} from '@/features/019-agent-manager-refactor';
import { cn } from '@/lib/utils';
import { AlertCircle, Bot, Loader2, Wifi, WifiOff } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AgentChatInput } from './agent-chat-input';
import { ContextWindowDisplay } from './context-window-display';
import { LogEntry, type LogEntryProps } from './log-entry';

/**
 * Props for AgentChatView - Plan 019 simplified interface.
 * Per DYK-01: Only agentId needed; agent metadata comes from API.
 */
export interface AgentChatViewProps {
  /** Agent ID to display */
  agentId: string;
  /** Additional CSS classes */
  className?: string;
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
 * <AgentChatView agentId="agent-abc-123" />
 */
export function AgentChatView({ agentId, className }: AgentChatViewProps) {
  // Local state for user messages (before they're persisted server-side)
  const [userMessages, setUserMessages] = useState<UserMessage[]>([]);
  const [streamingContent, setStreamingContent] = useState('');
  const [localError, setLocalError] = useState<{ message: string; code?: string } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const refetchRef = useRef<(() => void) | null>(null);

  // Event callback - uses ref to avoid circular dependency
  const onAgentEvent = useCallback(
    (eventType: string, data: { agentId: string; delta?: string }) => {
      // Handle streaming text deltas
      if (eventType === 'agent_text_delta' && data.delta) {
        setStreamingContent((prev) => prev + data.delta);
      }
      // When agent stops, clear streaming and refetch for final state
      if (eventType === 'agent_status') {
        const statusData = data as { agentId: string; status?: string };
        if (statusData.status !== 'working') {
          setStreamingContent('');
          refetchRef.current?.();
          // Surface error status to the user
          if (statusData.status === 'error') {
            setLocalError((prev) => prev ?? { message: 'Agent encountered an error' });
          }
        }
      }
    },
    []
  );

  // Use the Plan 019 hook - handles API fetch + SSE subscription
  const {
    agent,
    events,
    isWorking,
    isLoading,
    error: hookError,
    isConnected,
    run,
    refetch,
  } = useAgentInstance(agentId, {
    subscribeToSSE: true,
    onAgentEvent,
  });

  // Update refetch ref when it changes
  useEffect(() => {
    refetchRef.current = refetch;
  }, [refetch]);

  // Transform events to LogEntry props
  const serverEventProps = useMemo(() => {
    if (!events || events.length === 0) return [];
    return transformAgentEventsToLogEntries(events);
  }, [events]);

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

  // Handle sending a message
  const handleSendMessage = useCallback(
    async (content: string) => {
      // Clear error and add user message to local state
      setLocalError(null);
      setUserMessages((prev) => [...prev, { role: 'user', content, timestamp: Date.now() }]);
      setStreamingContent('');

      try {
        // Use the hook's run method - calls POST /api/agents/{agentId}/run
        await run({
          prompt: content,
          cwd: agent?.workspace,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        setLocalError({ message });
      }
    },
    [run, agent?.workspace]
  );

  // Handle retry after error
  const handleRetry = useCallback(() => {
    const lastUserMsg = [...userMessages].reverse().find((m) => m.role === 'user');
    if (lastUserMsg) {
      handleSendMessage(lastUserMsg.content);
    }
  }, [userMessages, handleSendMessage]);

  // Combined error state
  const error = localError || (hookError ? { message: hookError.message } : null);

  // Loading state
  if (isLoading) {
    return (
      <div className={cn('flex-1 flex items-center justify-center', className)}>
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
          <p className="mt-2 text-sm text-muted-foreground">Loading agent...</p>
        </div>
      </div>
    );
  }

  // Agent not found
  if (agent === null) {
    return (
      <div className={cn('flex-1 flex items-center justify-center', className)}>
        <div className="text-center">
          <AlertCircle className="h-8 w-8 mx-auto text-amber-500" />
          <p className="mt-2 text-sm text-muted-foreground">Agent not found: {agentId}</p>
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
            <span className="font-medium text-sm truncate max-w-xs">{agent?.name ?? agentId}</span>
            <span className="text-xs text-muted-foreground">({agent?.type})</span>
          </div>
          <div className="flex items-center gap-2">
            {/* SSE connection indicator */}
            {isConnected ? (
              <span title="Connected">
                <Wifi className="h-4 w-4 text-green-500" />
              </span>
            ) : (
              <span title="Disconnected">
                <WifiOff className="h-4 w-4 text-red-500" />
              </span>
            )}
            {/* Status indicator */}
            {isWorking && (
              <span className="inline-flex items-center gap-1 text-xs text-blue-600">
                <Loader2 className="h-3 w-3 animate-spin" />
                Working
              </span>
            )}
            {agent?.intent && (
              <span className="text-xs text-muted-foreground truncate max-w-32">
                {agent.intent}
              </span>
            )}
          </div>
        </div>
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
            {unifiedTimeline.map((item) => {
              // Extract key from props to avoid React warning about key in spread
              const { key: _key, ...restProps } = item.props as typeof item.props & {
                key?: string;
              };
              return <LogEntry key={item.key} {...restProps} />;
            })}
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
          disabled={isWorking}
          placeholder={isWorking ? 'Agent is working...' : 'Send a message...'}
        />
      </div>
    </div>
  );
}

export default AgentChatView;
