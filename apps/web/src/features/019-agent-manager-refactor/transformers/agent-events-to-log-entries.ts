/**
 * AgentStoredEvent to LogEntryProps Transformer
 *
 * Converts Plan 019 AgentStoredEvent objects to LogEntryProps for UI rendering.
 * This bridges the gap between:
 * - AgentStoredEvent: { eventId: string, type: 'text_delta' | 'tool_call' | ..., timestamp, data: {...} }
 * - LogEntryProps: { messageRole, content, contentType, toolData?, thinkingData? }
 *
 * Part of Plan 019: Agent Manager Refactor (Phase 5: Consolidation & Cleanup)
 * Per DYK-05: New transformer for new event schema, replacing old stored-event-to-log-entry.ts.
 */

import type { LogEntryProps, ThinkingData, ToolData } from '@/components/agents/log-entry';
import type { ToolCallStatus } from '@/components/agents/tool-call-card';
import type { AgentStoredEvent } from '@chainglass/shared/features/019-agent-manager-refactor/agent-instance.interface';

/**
 * Re-export AgentStoredEvent for consumers.
 */
export type { AgentStoredEvent };

/**
 * Convert a single AgentStoredEvent to LogEntryProps for rendering.
 *
 * @param event - The stored event from Plan 019 agent system
 * @returns LogEntryProps suitable for the LogEntry component
 */
export function agentEventToLogEntryProps(
  event: AgentStoredEvent
): LogEntryProps & { key: string } {
  const baseProps = {
    key: `${event.timestamp}_${event.eventId}`,
    messageRole: 'assistant' as const,
    content: '',
  };

  switch (event.type) {
    case 'tool_call': {
      const toolData: ToolData = {
        toolName: event.data.toolName,
        input: formatToolInput(event.data.input),
        status: 'running' as ToolCallStatus,
        toolCallId: event.data.toolCallId,
      };
      return {
        ...baseProps,
        contentType: 'tool_call',
        toolData,
      };
    }

    case 'tool_result': {
      const toolData: ToolData = {
        toolName: 'Tool',
        input: '',
        output: event.data.output,
        status: event.data.isError ? ('error' as ToolCallStatus) : ('complete' as ToolCallStatus),
        isError: event.data.isError,
        toolCallId: event.data.toolCallId,
      };
      return {
        ...baseProps,
        contentType: 'tool_result',
        toolData,
      };
    }

    case 'thinking': {
      const thinkingData: ThinkingData = {
        content: event.data.content,
        signature: event.data.signature,
      };
      return {
        ...baseProps,
        contentType: 'thinking',
        thinkingData,
      };
    }

    case 'message': {
      return {
        ...baseProps,
        contentType: 'text',
        content: event.data.content,
      };
    }

    case 'text_delta': {
      // text_delta events represent incremental text - accumulate for display
      return {
        ...baseProps,
        contentType: 'text',
        content: event.data.content,
        isStreaming: true,
      };
    }

    // Plan 019 status events - render as system messages
    case 'session_start':
    case 'session_idle':
    case 'session_error': {
      return {
        key: `${event.timestamp}_${event.eventId}`,
        messageRole: 'system',
        contentType: 'text',
        content: `[${event.type}] ${event.data.message ?? ''}`.trim(),
      };
    }

    case 'usage': {
      // Usage events typically don't render - skip with empty content
      return {
        key: `${event.timestamp}_${event.eventId}`,
        messageRole: 'system',
        contentType: 'text',
        content: '',
      };
    }

    default: {
      // Fallback for unknown types - render as text for forward compatibility
      const unknownEvent = event as { type: string; data?: { content?: string } };
      return {
        ...baseProps,
        contentType: 'text',
        content: unknownEvent.data?.content ?? `[${unknownEvent.type}]`,
      };
    }
  }
}

/**
 * Format tool input for display.
 */
function formatToolInput(input: unknown): string {
  if (typeof input === 'string') {
    return input;
  }
  if (input === null || input === undefined) {
    return '';
  }
  try {
    return JSON.stringify(input, null, 2);
  } catch {
    return String(input);
  }
}

/**
 * Merge tool_call and tool_result events by toolCallId.
 * Also merge consecutive thinking events into a single thinking block.
 * Accumulates text_delta events into complete messages.
 *
 * @param events - Array of AgentStoredEvents from Plan 019
 * @returns Array of LogEntryProps with merged and accumulated data
 */
export function mergeAgentEvents(events: AgentStoredEvent[]): (LogEntryProps & { key: string })[] {
  // Build map of toolCallId -> tool_result data
  const resultMap = new Map<string, { output: string; isError: boolean; timestamp: string }>();

  for (const event of events) {
    if (event.type === 'tool_result') {
      resultMap.set(event.data.toolCallId, {
        output: event.data.output,
        isError: event.data.isError,
        timestamp: event.timestamp,
      });
    }
  }

  const result: (LogEntryProps & { key: string })[] = [];
  let currentThinking: { key: string; content: string; signature?: string } | null = null;
  let currentText: { key: string; content: string } | null = null;
  let hasSeenTextDelta = false;
  let hasSeenThinkingDelta = false;

  for (const event of events) {
    // Skip tool_result - they're merged into tool_call
    if (event.type === 'tool_result') {
      continue;
    }

    // Skip non-renderable events
    if (event.type === 'usage' || event.type === 'session_idle' || event.type === 'raw') {
      continue;
    }

    // Skip consolidated duplicates: the copilot SDK emits streaming deltas
    // then re-emits full content as message/thinking after the turn.
    if (event.type === 'message' && hasSeenTextDelta && !event.data.content) {
      continue; // Empty consolidated message
    }
    if (event.type === 'message' && hasSeenTextDelta) {
      continue; // Full consolidated message — duplicate of text_deltas
    }
    if (event.type === 'thinking' && hasSeenThinkingDelta) {
      // Check if this is a consolidated duplicate (full content, not a delta)
      // Heuristic: if we already have a currentThinking block being accumulated,
      // a new thinking event that restarts the content is likely a duplicate
      if (!currentThinking) {
        continue; // Consolidated thinking after deltas were already flushed
      }
    }

    // Accumulate text_delta into single message
    if (event.type === 'text_delta') {
      hasSeenTextDelta = true;
      if (currentText) {
        currentText.content += event.data.content;
      } else {
        currentText = {
          key: `${event.timestamp}_${event.eventId}`,
          content: event.data.content,
        };
      }
      continue;
    }

    // Consolidate consecutive thinking events
    if (event.type === 'thinking') {
      hasSeenThinkingDelta = true;
      // Flush any pending text first
      if (currentText) {
        result.push({
          key: currentText.key,
          messageRole: 'assistant',
          contentType: 'text',
          content: currentText.content,
        });
        currentText = null;
      }

      if (currentThinking) {
        currentThinking.content += event.data.content;
        if (event.data.signature) {
          currentThinking.signature = event.data.signature;
        }
      } else {
        currentThinking = {
          key: `${event.timestamp}_${event.eventId}`,
          content: event.data.content,
          signature: event.data.signature,
        };
      }
      continue;
    }

    // Non-text/non-thinking event - flush pending blocks
    if (currentText) {
      result.push({
        key: currentText.key,
        messageRole: 'assistant',
        contentType: 'text',
        content: currentText.content,
      });
      currentText = null;
    }

    if (currentThinking) {
      result.push({
        key: currentThinking.key,
        messageRole: 'assistant',
        content: '',
        contentType: 'thinking',
        thinkingData: {
          content: currentThinking.content,
          signature: currentThinking.signature,
        },
      });
      currentThinking = null;
    }

    const props = agentEventToLogEntryProps(event);

    // If tool_call, merge the result if available
    if (event.type === 'tool_call' && props.toolData) {
      const toolResult = resultMap.get(event.data.toolCallId);
      if (toolResult) {
        props.toolData = {
          ...props.toolData,
          output: toolResult.output,
          status: toolResult.isError ? 'error' : 'complete',
          isError: toolResult.isError,
        };
      }
    }

    result.push(props);
  }

  // Flush remaining blocks
  if (currentText) {
    result.push({
      key: currentText.key,
      messageRole: 'assistant',
      contentType: 'text',
      content: currentText.content,
    });
  }

  if (currentThinking) {
    result.push({
      key: currentThinking.key,
      messageRole: 'assistant',
      content: '',
      contentType: 'thinking',
      thinkingData: {
        content: currentThinking.content,
        signature: currentThinking.signature,
      },
    });
  }

  return result;
}

/**
 * Convert AgentStoredEvents to LogEntryProps, suitable for the agents page.
 * This is the main entry point for transforming Plan 019 events to UI props.
 *
 * @param events - Array of AgentStoredEvents from useAgentInstance
 * @returns Array of LogEntryProps ready for rendering
 */
export function transformAgentEventsToLogEntries(
  events: AgentStoredEvent[]
): (LogEntryProps & { key: string })[] {
  return mergeAgentEvents(events);
}
