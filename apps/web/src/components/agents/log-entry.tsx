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
 *
 * Part of Plan 012: Multi-Agent Web UI (Phase 2: Core Chat)
 */

import { cn } from '@/lib/utils';
import { Bot, User } from 'lucide-react';

export interface LogEntryProps {
  /**
   * Message role in the conversation.
   *
   * Note: Intentionally named `messageRole` instead of `role` to avoid collision
   * with the HTML `role` attribute when props are spread onto DOM elements.
   */
  messageRole: 'user' | 'assistant' | 'system';
  /** Message content */
  content: string;
  /** Whether this message is currently streaming */
  isStreaming?: boolean;
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
 */
export function LogEntry({ messageRole, content, isStreaming = false, className }: LogEntryProps) {
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

  // Assistant message - plain with icon
  return (
    <div className={cn('px-4 py-2 hover:bg-muted/20 transition-colors', className)}>
      <div className="flex items-start gap-2">
        <Bot className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" aria-hidden="true" />
        <div className="flex-1 min-w-0">
          <p className="text-sm whitespace-pre-wrap leading-relaxed text-foreground/90">
            {content}
          </p>
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
