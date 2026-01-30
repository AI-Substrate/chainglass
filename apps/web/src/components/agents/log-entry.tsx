'use client';

/**
 * LogEntry - Terminal-style message rendering component
 *
 * Renders conversation messages in a log/terminal style (not chat bubbles).
 * Based on the prototype in agent-session-dialog.tsx.
 *
 * Features:
 * - User messages: violet left border highlight
 * - Assistant messages: plain with Bot icon, streaming indicator
 * - System messages: muted italic text
 * - Whitespace preservation for code/multiline content
 * - contentType routing to ToolCallCard/ThinkingBlock (Phase 4)
 *
 * Part of Plan 012: Multi-Agent Web UI (Phase 2: Core Chat)
 * Extended in Plan 015: Better Agents (Phase 4: UI Components)
 */

/** Message content type for routing to appropriate component */
type MessageContentType = 'text' | 'tool_call' | 'tool_result' | 'thinking';

import { cn } from '@/lib/utils';
import { Bot, User } from 'lucide-react';
import { MarkdownInline } from '../markdown-inline';
import { ThinkingBlock } from './thinking-block';
import { ToolCallCard, type ToolCallStatus } from './tool-call-card';

/**
 * Tool data for tool_call and tool_result content types.
 * Matches Phase 1-3 event schema structure.
 */
export interface ToolData {
  /** Tool name (e.g., "Bash", "Read") */
  toolName: string;
  /** Tool input (command, arguments) */
  input: string;
  /** Tool output (result text) */
  output?: string;
  /** Execution status */
  status: ToolCallStatus;
  /** Whether the tool call resulted in an error */
  isError?: boolean;
  /** Unique tool call ID for correlation */
  toolCallId?: string;
}

/**
 * Thinking data for thinking content type.
 * Matches Phase 1-3 event schema structure.
 */
export interface ThinkingData {
  /** Thinking/reasoning content */
  content: string;
  /** Optional signature for Claude thinking */
  signature?: string;
  /** Optional thinking ID */
  thinkingId?: string;
}

export interface LogEntryProps {
  /**
   * Message role in the conversation.
   *
   * Note: Intentionally named `messageRole` instead of `role` to avoid collision
   * with the HTML `role` attribute when props are spread onto DOM elements.
   */
  messageRole: 'user' | 'assistant' | 'system';
  /** Message content (used for text messages) */
  content: string;
  /** Whether this message is currently streaming */
  isStreaming?: boolean;
  /**
   * Content type for routing to appropriate component.
   * - 'text': Normal text message (default)
   * - 'tool_call': Route to ToolCallCard (running state)
   * - 'tool_result': Route to ToolCallCard (complete/error state)
   * - 'thinking': Route to ThinkingBlock
   *
   * Per DYK-08: Defaults to 'text' for backward compatibility.
   */
  contentType?: MessageContentType;
  /** Tool data for tool_call/tool_result content types */
  toolData?: ToolData;
  /** Thinking data for thinking content type */
  thinkingData?: ThinkingData;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Terminal-style log entry for a single message.
 *
 * @example
 * // User message with violet border
 * <LogEntry messageRole="user" content="Hello agent" />
 *
 * // Assistant streaming response
 * <LogEntry messageRole="assistant" content="I can help..." isStreaming />
 *
 * // System notification
 * <LogEntry messageRole="system" content="Session started" />
 *
 * @example
 * // Tool call (Phase 4)
 * <LogEntry
 *   messageRole="assistant"
 *   content=""
 *   contentType="tool_call"
 *   toolData={{ toolName: "Bash", input: "npm test", status: "running" }}
 * />
 *
 * @example
 * // Thinking block (Phase 4)
 * <LogEntry
 *   messageRole="assistant"
 *   content=""
 *   contentType="thinking"
 *   thinkingData={{ content: "I am reasoning about this..." }}
 * />
 */
export function LogEntry({
  messageRole,
  content,
  isStreaming = false,
  contentType,
  toolData,
  thinkingData,
  className,
}: LogEntryProps) {
  // Normalize contentType with default 'text' (DYK-08 backward compat)
  const effectiveContentType = contentType ?? 'text';

  // Route to ToolCallCard for tool_call content type
  if (effectiveContentType === 'tool_call' && toolData) {
    return (
      <div className={cn('px-4 py-2', className)}>
        <ToolCallCard
          toolName={toolData.toolName}
          status={toolData.status}
          input={toolData.input}
          output={toolData.output ?? ''}
          isError={toolData.isError}
          toolCallId={toolData.toolCallId}
        />
      </div>
    );
  }

  // Route to ToolCallCard for tool_result content type (same component, different data)
  if (effectiveContentType === 'tool_result' && toolData) {
    return (
      <div className={cn('px-4 py-2', className)}>
        <ToolCallCard
          toolName={toolData.toolName}
          status={toolData.status}
          input={toolData.input}
          output={toolData.output ?? ''}
          isError={toolData.isError}
          toolCallId={toolData.toolCallId}
        />
      </div>
    );
  }

  // Route to ThinkingBlock for thinking content type
  if (effectiveContentType === 'thinking' && thinkingData) {
    return (
      <div className={cn('px-4 py-2', className)}>
        <ThinkingBlock
          content={thinkingData.content}
          signature={thinkingData.signature}
          thinkingId={thinkingData.thinkingId}
        />
      </div>
    );
  }

  // System message - muted inline
  if (messageRole === 'system') {
    return (
      <div className={cn('px-4 py-1.5 text-xs text-muted-foreground italic', className)}>
        {content}
      </div>
    );
  }

  // User message - highlighted with left border
  if (messageRole === 'user') {
    return (
      <div className={cn('px-4 py-2 bg-muted/40 border-l-2 border-violet-500', className)}>
        <div className="flex items-start gap-2">
          <User className="h-3.5 w-3.5 text-violet-500 mt-0.5 shrink-0" aria-hidden="true" />
          <div className="flex-1 min-w-0">
            <p className="text-sm whitespace-pre-wrap leading-relaxed">{content}</p>
          </div>
        </div>
      </div>
    );
  }

  // Assistant message - plain with icon (default for text contentType)
  // Renders markdown for formatted output from agents
  return (
    <div className={cn('px-4 py-2 hover:bg-muted/20 transition-colors', className)}>
      <div className="flex items-start gap-2">
        <Bot className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" aria-hidden="true" />
        <div className="flex-1 min-w-0">
          <MarkdownInline
            content={content}
            className="text-sm leading-relaxed text-foreground"
          />
          {isStreaming && (
            <span className="inline-flex items-center gap-1 mt-1 text-[10px] text-blue-500">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute h-full w-full rounded-full bg-blue-400 opacity-75" />
                <span className="relative rounded-full h-1.5 w-1.5 bg-blue-500" />
              </span>
              typing...
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export default LogEntry;
