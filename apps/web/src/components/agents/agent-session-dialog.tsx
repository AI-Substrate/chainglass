'use client';

/**
 * AgentSessionDialog - Modal for viewing and interacting with agent sessions
 *
 * Inspired by vibe-kanban's conversation UI patterns.
 * Displays the agent's conversation history with message bubbles,
 * tool invocations, and allows sending follow-up messages.
 */

import {
  Bot,
  ExternalLink,
  Loader2,
  MessageSquare,
  Send,
  Terminal,
  User,
  XCircle,
} from 'lucide-react';
import Link from 'next/link';
import { useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

import type {
  AgentMessage,
  AgentSession,
  AgentSessionStatus,
} from '@/data/fixtures/agent-sessions.fixture';

interface AgentSessionDialogProps {
  session: AgentSession | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workflowSlug?: string;
  /** Callback when user sends a message */
  onSendMessage?: (sessionId: string, message: string) => void;
}

const statusConfig: Record<
  AgentSessionStatus,
  { label: string; color: string; bgColor: string; icon: typeof Loader2 }
> = {
  idle: {
    label: 'Idle',
    color: 'text-gray-500',
    bgColor: 'bg-gray-500/20',
    icon: Bot,
  },
  running: {
    label: 'Running',
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/20',
    icon: Loader2,
  },
  waiting_input: {
    label: 'Waiting for Input',
    color: 'text-amber-500',
    bgColor: 'bg-amber-500/20',
    icon: MessageSquare,
  },
  error: {
    label: 'Error',
    color: 'text-red-500',
    bgColor: 'bg-red-500/20',
    icon: XCircle,
  },
};

function MessageBubble({ message }: { message: AgentMessage }) {
  const isUser = message.role === 'user';
  const isAssistant = message.role === 'assistant';
  const isTool = message.role === 'tool';
  const isSystem = message.role === 'system';

  if (isTool && message.tool) {
    return (
      <div className="px-4 py-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
          <Terminal className="h-3 w-3" />
          <span className="font-mono">{message.tool.name}</span>
          <span
            className={cn(
              'px-1.5 py-0.5 rounded text-[10px] font-medium',
              message.tool.status === 'complete' &&
                'bg-green-500/20 text-green-600 dark:text-green-400',
              message.tool.status === 'running' &&
                'bg-blue-500/20 text-blue-600 dark:text-blue-400',
              message.tool.status === 'pending' &&
                'bg-gray-500/20 text-gray-600 dark:text-gray-400',
              message.tool.status === 'failed' && 'bg-red-500/20 text-red-600 dark:text-red-400'
            )}
          >
            {message.tool.status}
          </span>
        </div>
        <div className="border rounded-lg overflow-hidden bg-muted/30">
          {message.tool.input && (
            <div className="px-3 py-2 font-mono text-xs border-b bg-muted/50">
              <span className="text-muted-foreground">$ </span>
              {message.tool.input}
            </div>
          )}
          {message.tool.output && (
            <div className="px-3 py-2 font-mono text-xs whitespace-pre-wrap text-muted-foreground max-h-32 overflow-auto">
              {message.tool.output}
            </div>
          )}
          {message.tool.status === 'running' && (
            <div className="px-3 py-2 flex items-center gap-2 text-xs text-blue-500">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>Running...</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (isSystem) {
    return (
      <div className="px-4 py-2">
        <div className="text-xs text-muted-foreground text-center italic">{message.content}</div>
      </div>
    );
  }

  return (
    <div className={cn('px-4 py-2', isUser && 'flex justify-end')}>
      <div
        className={cn(
          'max-w-[85%] rounded-2xl px-4 py-2.5',
          isUser && 'bg-primary text-primary-foreground rounded-br-sm',
          isAssistant && 'bg-muted rounded-bl-sm'
        )}
      >
        {/* Role indicator */}
        <div className="flex items-center gap-2 mb-1.5">
          {isUser ? (
            <User className="h-3.5 w-3.5" />
          ) : (
            <Bot className={cn('h-3.5 w-3.5', message.isStreaming && 'animate-pulse')} />
          )}
          <span className="text-xs font-medium">{isUser ? 'You' : 'Agent'}</span>
          {message.isStreaming && (
            <span className="flex items-center gap-1 text-[10px] text-blue-500">
              <div className="flex gap-0.5">
                <div
                  className="w-1 h-1 rounded-full bg-blue-500 animate-bounce"
                  style={{ animationDelay: '0ms' }}
                />
                <div
                  className="w-1 h-1 rounded-full bg-blue-500 animate-bounce"
                  style={{ animationDelay: '150ms' }}
                />
                <div
                  className="w-1 h-1 rounded-full bg-blue-500 animate-bounce"
                  style={{ animationDelay: '300ms' }}
                />
              </div>
              streaming
            </span>
          )}
        </div>

        {/* Message content */}
        <div className="text-sm whitespace-pre-wrap leading-relaxed">{message.content}</div>

        {/* Timestamp */}
        <div
          className={cn(
            'text-[10px] mt-1.5',
            isUser ? 'text-primary-foreground/60' : 'text-muted-foreground'
          )}
        >
          {new Date(message.timestamp).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </div>
      </div>
    </div>
  );
}

export function AgentSessionDialog({
  session,
  open,
  onOpenChange,
  workflowSlug,
  onSendMessage,
}: AgentSessionDialogProps) {
  const [inputValue, setInputValue] = useState('');
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const handleSend = () => {
    if (!session || !inputValue.trim() || !onSendMessage) return;
    setIsSending(true);
    onSendMessage(session.id, inputValue);
    setInputValue('');
    setTimeout(() => setIsSending(false), 500);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!session) return null;

  const status = statusConfig[session.status];
  const StatusIcon = status.icon;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl h-[80vh] flex flex-col p-0 gap-0">
        {/* Header */}
        <DialogHeader className="px-6 py-4 border-b shrink-0">
          <DialogTitle className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-lg shadow-violet-500/25">
              <Bot className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <span className="block">Agent Session</span>
              <span className="text-sm font-normal text-muted-foreground">
                Run: {session.runId}
              </span>
            </div>
            <div
              className={cn(
                'flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium',
                status.bgColor
              )}
            >
              <StatusIcon
                className={cn(
                  'h-4 w-4',
                  status.color,
                  session.status === 'running' && 'animate-spin'
                )}
              />
              <span className={status.color}>{status.label}</span>
            </div>
          </DialogTitle>
          <DialogDescription className="sr-only">
            View and interact with the agent session for run {session.runId}.
          </DialogDescription>
        </DialogHeader>

        {/* Context usage bar */}
        {session.contextUsage !== undefined && (
          <div className="px-6 py-2 border-b bg-muted/30 shrink-0">
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-muted-foreground">Context Window</span>
              <span
                className={cn(
                  'font-mono font-medium',
                  session.contextUsage > 90
                    ? 'text-red-500'
                    : session.contextUsage > 75
                      ? 'text-amber-500'
                      : 'text-muted-foreground'
                )}
              >
                {session.contextUsage}%
              </span>
            </div>
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className={cn(
                  'h-full rounded-full transition-all duration-500',
                  session.contextUsage > 90
                    ? 'bg-red-500'
                    : session.contextUsage > 75
                      ? 'bg-amber-500'
                      : 'bg-gradient-to-r from-violet-500 to-purple-500'
                )}
                style={{ width: `${session.contextUsage}%` }}
              />
            </div>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto py-4">
          {session.messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Input area */}
        <div className="px-4 py-4 border-t bg-muted/30 shrink-0 space-y-3">
          <div className="relative">
            <Textarea
              placeholder={
                session.status === 'waiting_input'
                  ? 'Type your response to continue...'
                  : 'Send a follow-up message...'
              }
              className={cn(
                'min-h-[80px] resize-none pr-12 rounded-xl',
                'bg-background border-2',
                'focus:border-violet-400 focus:ring-4 focus:ring-violet-400/20',
                'transition-all duration-200'
              )}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isSending || session.status === 'error'}
            />
            <Button
              size="icon"
              className={cn(
                'absolute bottom-2 right-2 h-8 w-8 rounded-lg',
                'bg-gradient-to-r from-violet-500 to-purple-500',
                'hover:from-violet-600 hover:to-purple-600',
                'text-white shadow-lg shadow-violet-500/30',
                'disabled:opacity-50 disabled:shadow-none'
              )}
              onClick={handleSend}
              disabled={!inputValue.trim() || isSending || session.status === 'error'}
            >
              {isSending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>

          {/* Footer actions */}
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              <kbd className="px-1.5 py-0.5 rounded bg-muted font-mono">⌘</kbd>
              <span className="mx-1">+</span>
              <kbd className="px-1.5 py-0.5 rounded bg-muted font-mono">↵</kbd>
              <span className="ml-1.5">to send</span>
            </span>
            {workflowSlug && (
              <Link
                href={`/workflows/${workflowSlug}/runs/${session.runId}`}
                className="flex items-center gap-1 hover:text-primary transition-colors"
              >
                <span>View run details</span>
                <ExternalLink className="h-3 w-3" />
              </Link>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
