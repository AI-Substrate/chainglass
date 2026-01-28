/**
 * StoredEvent to LogEntryProps Transformer
 *
 * Converts server-side StoredEvent objects to LogEntryProps for UI rendering.
 * This bridges the gap between:
 * - StoredEvent: { type: 'tool_call' | 'tool_result' | 'thinking' | 'message', data: {...}, timestamp, id }
 * - LogEntryProps: { messageRole, content, contentType, toolData?, thinkingData? }
 *
 * Part of Plan 015: Better Agents (Phase 5: Integration)
 * Per DYK-P5-02: Dedicated transformer for testability and single responsibility.
 */

import type { LogEntryProps, ThinkingData, ToolData } from '@/components/agents/log-entry';
import type { ToolCallStatus } from '@/components/agents/tool-call-card';
import type { AgentStoredEvent } from '@chainglass/shared';

/**
 * Stored event with ID - returned from IAgentEventAdapter.
 * The AgentStoredEvent union is extended with an id field by the adapter.
 * Re-exported for consumers that need to work with stored events.
 */
export type StoredEvent = AgentStoredEvent & { id: string };

/**
 * Convert a StoredEvent to LogEntryProps for rendering.
 *
 * @param event - The stored event from server
 * @returns LogEntryProps suitable for the LogEntry component
 *
 * @example
 * const events = session.events;
 * const logProps = events.map(storedEventToLogEntryProps);
 * return logProps.map(props => <LogEntry key={props.key} {...props} />);
 */
export function storedEventToLogEntryProps(event: StoredEvent): LogEntryProps & { key: string } {
  const baseProps = {
    key: event.id,
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
      // For tool_result, we need the corresponding tool_call to get the toolName
      // Since we don't have context of all events here, use a placeholder
      // The caller should merge tool_call and tool_result for complete data
      const toolData: ToolData = {
        toolName: 'Tool', // Will be overridden by merged data
        input: '', // Will be overridden by merged data
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
      // Message event contains the complete assistant response text
      return {
        ...baseProps,
        contentType: 'text',
        content: event.data.content,
      };
    }

    default: {
      // Fallback for unknown types - render as text
      // This handles forward compatibility if new event types are added
      const unknownEvent = event as { type: string; data?: { content?: string } };
      return {
        ...baseProps,
        contentType: 'text',
        content: unknownEvent.data?.content ?? `Unknown event: ${unknownEvent.type}`,
      };
    }
  }
}

/**
 * Format tool input for display.
 * Handles various input types (string, object, etc.)
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
 * Returns complete tool data with both input and output.
 *
 * @param events - Array of StoredEvents
 * @returns Array of LogEntryProps with merged tool data
 *
 * @example
 * const events = session.events;
 * const mergedProps = mergeToolEvents(events);
 * // tool_call events now include output from their corresponding tool_result
 * // consecutive thinking events are merged into a single entry
 */
export function mergeToolEvents(events: StoredEvent[]): (LogEntryProps & { key: string })[] {
  // Build a map of toolCallId -> tool_result data
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

  // Transform events, merging tool_result into tool_call and consolidating thinking
  const result: (LogEntryProps & { key: string })[] = [];
  let currentThinking: { key: string; content: string; signature?: string } | null = null;

  for (const event of events) {
    // Skip tool_result - they're merged into tool_call
    if (event.type === 'tool_result') {
      continue;
    }

    // Consolidate consecutive thinking events into a single block
    if (event.type === 'thinking') {
      if (currentThinking) {
        // Append to existing thinking block
        currentThinking.content += event.data.content;
        // Keep the latest signature if present
        if (event.data.signature) {
          currentThinking.signature = event.data.signature;
        }
      } else {
        // Start a new thinking block
        currentThinking = {
          key: event.id,
          content: event.data.content,
          signature: event.data.signature,
        };
      }
      continue;
    }

    // Non-thinking event encountered - flush any pending thinking block
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

    const props = storedEventToLogEntryProps(event);

    // If this is a tool_call, merge the result if available
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

  // Flush any remaining thinking block at the end
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
 * Convert StoredEvents to LogEntryProps, suitable for the agents page.
 * This is the main entry point for transforming server events to UI props.
 *
 * @param events - Array of StoredEvents from useServerSession
 * @returns Array of LogEntryProps ready for rendering
 */
export function transformEventsToLogEntries(
  events: StoredEvent[]
): (LogEntryProps & { key: string })[] {
  return mergeToolEvents(events);
}
