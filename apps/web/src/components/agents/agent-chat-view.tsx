'use client';

/**
 * AgentChatView - Main chat view component for agent interactions
 *
 * Single-authoritative-list architecture:
 * - Server stores ALL events (including user prompts) in one ordered array
 * - SSE delivers real-time updates; on page reload, server list is fetched
 * - No client-side timestamp sorting — events render in server array order
 * - Optimistic pending message shows until server confirms via refetch
 *
 * Part of Plan 019: Agent Manager Refactor (Phase 5: Consolidation & Cleanup)
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
import { LogEntry, type LogEntryProps } from './log-entry';

/**
 * Props for AgentChatView.
 */
export interface AgentChatViewProps {
  /** Agent ID to display */
  agentId: string;
  /** Resolved filesystem path for the workspace (used as cwd for agent runs) */
  workspacePath?: string;
  /** Whether to subscribe to SSE for real-time updates (default: true) */
  subscribeToSSE?: boolean;
  /** Additional CSS classes */
  className?: string;
}

export function AgentChatView({
  agentId,
  workspacePath,
  subscribeToSSE = true,
  className,
}: AgentChatViewProps) {
  const [streamingContent, setStreamingContent] = useState('');
  const [localError, setLocalError] = useState<{ message: string; code?: string } | null>(null);
  // Optimistic pending message — shown until server events include the user_prompt
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const refetchRef = useRef<(() => void) | null>(null);

  // SSE event callback
  const onAgentEvent = useCallback(
    (eventType: string, data: { agentId: string; delta?: string; content?: string }) => {
      // Streaming text deltas
      if (eventType === 'agent_text_delta' && (data.content || data.delta)) {
        setStreamingContent((prev) => prev + (data.content ?? data.delta ?? ''));
      }
      // Complete message events (short responses without streaming deltas)
      if (eventType === 'agent_message' && data.content) {
        setStreamingContent(data.content);
      }
      // User prompt arrived via SSE — clear optimistic pending message
      if (eventType === 'agent_user_prompt') {
        setPendingPrompt(null);
      }
      // Agent stopped — clear streaming and refetch for final state
      if (eventType === 'agent_status') {
        const statusData = data as { agentId: string; status?: string };
        if (statusData.status !== 'working') {
          setStreamingContent('');
          setPendingPrompt(null);
          refetchRef.current?.();
          if (statusData.status === 'error') {
            setLocalError((prev) => prev ?? { message: 'Agent encountered an error' });
          }
        }
      }
    },
    []
  );

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
    subscribeToSSE,
    onAgentEvent,
  });

  useEffect(() => {
    refetchRef.current = refetch;
  }, [refetch]);

  // Transform server events to LogEntry props — already in server array order
  const entryProps = useMemo(() => {
    if (!events || events.length === 0) return [];
    return transformAgentEventsToLogEntries(events);
  }, [events]);

  // Clear pending prompt when server events include it
  useEffect(() => {
    if (
      pendingPrompt &&
      events?.some((e) => e.type === 'user_prompt' && e.data.content === pendingPrompt)
    ) {
      setPendingPrompt(null);
    }
  }, [events, pendingPrompt]);

  // Auto-scroll to bottom
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll on content changes
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [entryProps, streamingContent, pendingPrompt]);

  // Send message
  const handleSendMessage = useCallback(
    async (content: string) => {
      setLocalError(null);
      setPendingPrompt(content);
      setStreamingContent('');

      try {
        await run({ prompt: content, cwd: workspacePath });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        setLocalError({ message });
        setPendingPrompt(null);
      }
    },
    [run, workspacePath]
  );

  // Retry last failed prompt
  const handleRetry = useCallback(() => {
    // Find last user_prompt in events
    const lastPrompt = events && [...events].reverse().find((e) => e.type === 'user_prompt');
    if (lastPrompt) {
      handleSendMessage(lastPrompt.data.content);
    }
  }, [events, handleSendMessage]);

  const error = localError || (hookError ? { message: hookError.message } : null);

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
      {/* Header */}
      <div className="shrink-0 border-b px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-muted-foreground" />
            <span className="font-medium text-sm truncate max-w-xs">{agent?.name ?? agentId}</span>
            <span className="text-xs text-muted-foreground">({agent?.type})</span>
          </div>
          <div className="flex items-center gap-2">
            {isConnected ? (
              <span title="Connected">
                <Wifi className="h-4 w-4 text-green-500" />
              </span>
            ) : (
              <span title="Disconnected">
                <WifiOff className="h-4 w-4 text-red-500" />
              </span>
            )}
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

      {/* Messages — single ordered list from server */}
      <div className="flex-1 overflow-auto">
        {entryProps.length === 0 && !streamingContent && !pendingPrompt ? (
          <div className="h-full flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <Bot className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No messages yet</p>
              <p className="text-xs mt-1">Send a message to start the conversation</p>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {entryProps.map((props) => {
              const { key: _key, ...restProps } = props as typeof props & { key?: string };
              return <LogEntry key={props.key} {...restProps} />;
            })}
            {/* Optimistic pending prompt — shown until server confirms */}
            {pendingPrompt && (
              <LogEntry messageRole="user" content={pendingPrompt} contentType="text" />
            )}
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

      {/* Input */}
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
