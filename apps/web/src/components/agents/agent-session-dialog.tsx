'use client';

/**
 * AgentSessionDialog - Modal for viewing and interacting with agent sessions
 *
 * Inspired by vibe-kanban's conversation UI patterns.
 * Displays the agent's conversation history with message bubbles,
 * tool invocations, and allows sending follow-up messages.
 *
 * Features interactive question UI when agent is waiting for input,
 * supporting single choice, multi choice, confirm, and free text.
 */

import {
  Bot,
  Check,
  CheckCircle2,
  ChevronRight,
  Circle,
  ExternalLink,
  HelpCircle,
  Loader2,
  MessageSquare,
  Send,
  Sparkles,
  Square,
  Terminal,
  ThumbsDown,
  ThumbsUp,
  User,
  XCircle,
  Zap,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

import type {
  AgentMessage,
  AgentQuestion,
  AgentSession,
  AgentSessionStatus,
  AgentType,
} from '@/data/fixtures/agent-sessions.fixture';

const agentTypeConfig: Record<AgentType, { label: string; icon: typeof Bot; color: string }> = {
  'claude-code': { label: 'Claude Code', icon: Sparkles, color: 'text-orange-500' },
  copilot: { label: 'GitHub Copilot', icon: Zap, color: 'text-blue-500' },
  generic: { label: 'Agent', icon: Bot, color: 'text-violet-500' },
};

interface AgentSessionDialogProps {
  session: AgentSession | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workflowSlug?: string;
  /** Callback when user sends a message */
  onSendMessage?: (sessionId: string, message: string) => void;
  /** Callback when user stops the agent */
  onStopAgent?: (sessionId: string) => void;
}

const statusConfig: Record<
  AgentSessionStatus,
  { label: string; color: string; bgColor: string; borderColor: string; icon: typeof Loader2 }
> = {
  idle: {
    label: 'Idle',
    color: 'text-gray-500',
    bgColor: 'bg-gray-100 dark:bg-gray-800',
    borderColor: 'border-gray-300 dark:border-gray-700',
    icon: Bot,
  },
  running: {
    label: 'Running',
    color: 'text-blue-600 dark:text-blue-400',
    bgColor: 'bg-blue-50 dark:bg-blue-950/50',
    borderColor: 'border-blue-300 dark:border-blue-700',
    icon: Loader2,
  },
  waiting_input: {
    label: 'Waiting for Input',
    color: 'text-amber-600 dark:text-amber-400',
    bgColor: 'bg-amber-50 dark:bg-amber-950/50',
    borderColor: 'border-amber-300 dark:border-amber-700',
    icon: MessageSquare,
  },
  error: {
    label: 'Error',
    color: 'text-red-600 dark:text-red-400',
    bgColor: 'bg-red-50 dark:bg-red-950/50',
    borderColor: 'border-red-300 dark:border-red-700',
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
      <div className="px-6 py-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
          <div className="flex h-5 w-5 items-center justify-center rounded bg-muted">
            <Terminal className="h-3 w-3" />
          </div>
          <span className="font-mono font-medium">{message.tool.name}</span>
          <ChevronRight className="h-3 w-3 text-muted-foreground/50" />
          <span
            className={cn(
              'px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide',
              message.tool.status === 'complete' &&
                'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-400',
              message.tool.status === 'running' &&
                'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-400',
              message.tool.status === 'pending' &&
                'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
              message.tool.status === 'failed' &&
                'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-400'
            )}
          >
            {message.tool.status === 'complete' && (
              <CheckCircle2 className="h-2.5 w-2.5 inline mr-1" />
            )}
            {message.tool.status === 'running' && (
              <Loader2 className="h-2.5 w-2.5 inline mr-1 animate-spin" />
            )}
            {message.tool.status}
          </span>
        </div>
        <div className="ml-7 border rounded-lg overflow-hidden bg-zinc-950/5 dark:bg-zinc-950/50">
          {message.tool.input && (
            <div className="px-4 py-2.5 font-mono text-xs border-b bg-zinc-100/50 dark:bg-zinc-900/50 flex items-center gap-2">
              <span className="text-emerald-600 dark:text-emerald-400 font-bold">$</span>
              <span className="text-zinc-800 dark:text-zinc-200">{message.tool.input}</span>
            </div>
          )}
          {message.tool.output && (
            <div className="px-4 py-3 font-mono text-xs whitespace-pre-wrap text-zinc-600 dark:text-zinc-400 max-h-40 overflow-auto leading-relaxed">
              {message.tool.output}
            </div>
          )}
          {message.tool.status === 'running' && !message.tool.output && (
            <div className="px-4 py-3 flex items-center gap-2 text-xs text-blue-600 dark:text-blue-400">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span className="font-medium">Executing...</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (isSystem) {
    return (
      <div className="px-6 py-3">
        <div className="text-xs text-muted-foreground text-center py-2 px-4 bg-muted/30 rounded-full inline-flex items-center gap-2 mx-auto">
          <Sparkles className="h-3 w-3" />
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className={cn('px-6 py-2', isUser ? 'flex justify-end' : '')}>
      <div
        className={cn(
          'max-w-[85%] rounded-2xl px-4 py-3',
          isUser &&
            'bg-gradient-to-br from-violet-500 to-purple-600 text-white rounded-br-md shadow-lg shadow-violet-500/20',
          isAssistant &&
            'bg-zinc-100 dark:bg-zinc-800/80 rounded-bl-md border border-zinc-200 dark:border-zinc-700'
        )}
      >
        {/* Role indicator */}
        <div className="flex items-center gap-2 mb-2">
          <div
            className={cn(
              'flex h-6 w-6 items-center justify-center rounded-full',
              isUser ? 'bg-white/20' : 'bg-violet-100 dark:bg-violet-900/50'
            )}
          >
            {isUser ? (
              <User className="h-3.5 w-3.5" />
            ) : (
              <Bot
                className={cn(
                  'h-3.5 w-3.5 text-violet-600 dark:text-violet-400',
                  message.isStreaming && 'animate-pulse'
                )}
              />
            )}
          </div>
          <span
            className={cn(
              'text-xs font-semibold',
              isUser ? 'text-white/90' : 'text-zinc-700 dark:text-zinc-300'
            )}
          >
            {isUser ? 'You' : 'Agent'}
          </span>
          {message.isStreaming && (
            <span className="flex items-center gap-1.5 text-[10px] text-blue-400 font-medium">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
              </span>
              streaming
            </span>
          )}
        </div>

        {/* Message content */}
        <div
          className={cn(
            'text-sm whitespace-pre-wrap leading-relaxed',
            isUser ? 'text-white' : 'text-zinc-700 dark:text-zinc-300'
          )}
        >
          {message.content}
        </div>

        {/* Timestamp */}
        <div
          className={cn(
            'text-[10px] mt-2 font-medium',
            isUser ? 'text-white/50' : 'text-zinc-400 dark:text-zinc-500'
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

/**
 * Interactive question panel for structured agent questions
 */
interface QuestionPanelProps {
  question: AgentQuestion;
  onAnswer: (answer: string | string[] | boolean) => void;
  isSubmitting: boolean;
}

function QuestionPanel({ question, onAnswer, isSubmitting }: QuestionPanelProps) {
  const [selectedValue, setSelectedValue] = useState<string | string[] | boolean>(
    question.defaultValue ?? (question.type === 'multi_choice' ? [] : '')
  );

  const handleSubmit = () => {
    if (question.type === 'confirm') return; // Confirm handles its own submit
    onAnswer(selectedValue);
  };

  const canSubmit =
    question.type === 'free_text'
      ? typeof selectedValue === 'string' && selectedValue.trim().length > 0
      : question.type === 'single_choice'
        ? typeof selectedValue === 'string' && selectedValue.length > 0
        : question.type === 'multi_choice'
          ? Array.isArray(selectedValue) && selectedValue.length > 0
          : false;

  return (
    <div className="mx-6 mb-4 p-4 rounded-2xl bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-50 dark:from-amber-950/40 dark:via-orange-950/30 dark:to-yellow-950/40 border-2 border-amber-200 dark:border-amber-800 shadow-lg shadow-amber-500/10">
      {/* Question header */}
      <div className="flex items-start gap-3 mb-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-lg shadow-amber-500/30 shrink-0">
          <HelpCircle className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
              Agent Question
            </span>
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
            </span>
          </div>
          <p className="text-sm font-medium text-amber-900 dark:text-amber-100">{question.prompt}</p>
        </div>
      </div>

      {/* Single choice */}
      {question.type === 'single_choice' && question.choices && (
        <RadioGroup
          value={selectedValue as string}
          onValueChange={setSelectedValue}
          className="space-y-2 mb-4"
        >
          {question.choices.map((choice, idx) => (
            <label
              key={choice}
              htmlFor={`q-${question.id}-${idx}`}
              className={cn(
                'flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all duration-200',
                selectedValue === choice
                  ? 'border-amber-500 bg-white dark:bg-amber-900/30 shadow-md'
                  : 'border-amber-200 dark:border-amber-800 hover:border-amber-300 hover:bg-white/50 dark:hover:bg-amber-900/20'
              )}
            >
              <RadioGroupItem value={choice} id={`q-${question.id}-${idx}`} className="border-amber-400" />
              <span className="text-sm font-medium text-amber-900 dark:text-amber-100">{choice}</span>
              {selectedValue === choice && <Check className="h-4 w-4 text-amber-600 ml-auto" />}
            </label>
          ))}
        </RadioGroup>
      )}

      {/* Multi choice */}
      {question.type === 'multi_choice' && question.choices && (
        <div className="space-y-2 mb-4">
          {question.choices.map((choice, idx) => {
            const isChecked = Array.isArray(selectedValue) && selectedValue.includes(choice);
            return (
              <label
                key={choice}
                htmlFor={`q-${question.id}-mc-${idx}`}
                className={cn(
                  'flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all duration-200',
                  isChecked
                    ? 'border-amber-500 bg-white dark:bg-amber-900/30 shadow-md'
                    : 'border-amber-200 dark:border-amber-800 hover:border-amber-300 hover:bg-white/50 dark:hover:bg-amber-900/20'
                )}
              >
                <Checkbox
                  id={`q-${question.id}-mc-${idx}`}
                  checked={isChecked}
                  className="border-amber-400 data-[state=checked]:bg-amber-500 data-[state=checked]:border-amber-500"
                  onCheckedChange={(checked) => {
                    const current = Array.isArray(selectedValue) ? selectedValue : [];
                    if (checked) {
                      setSelectedValue([...current, choice]);
                    } else {
                      setSelectedValue(current.filter((c) => c !== choice));
                    }
                  }}
                />
                <span className="text-sm font-medium text-amber-900 dark:text-amber-100">{choice}</span>
                {isChecked && <Check className="h-4 w-4 text-amber-600 ml-auto" />}
              </label>
            );
          })}
          <p className="text-xs text-amber-600 dark:text-amber-400 px-1">
            {Array.isArray(selectedValue) && selectedValue.length > 0
              ? `${selectedValue.length} selected`
              : 'Select one or more options'}
          </p>
        </div>
      )}

      {/* Confirm (Yes/No) */}
      {question.type === 'confirm' && (
        <div className="flex gap-3 mb-2">
          <Button
            className={cn(
              'flex-1 h-12 text-base font-semibold rounded-xl transition-all duration-200',
              'bg-gradient-to-br from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700',
              'text-white shadow-lg shadow-emerald-500/30 hover:shadow-emerald-500/50',
              'hover:scale-[1.02] active:scale-[0.98]'
            )}
            onClick={() => onAnswer(true)}
            disabled={isSubmitting}
          >
            <ThumbsUp className="h-5 w-5 mr-2" />
            Yes, proceed
          </Button>
          <Button
            className={cn(
              'flex-1 h-12 text-base font-semibold rounded-xl transition-all duration-200',
              'bg-gradient-to-br from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700',
              'text-white shadow-lg shadow-red-500/30 hover:shadow-red-500/50',
              'hover:scale-[1.02] active:scale-[0.98]'
            )}
            onClick={() => onAnswer(false)}
            disabled={isSubmitting}
          >
            <ThumbsDown className="h-5 w-5 mr-2" />
            No, cancel
          </Button>
        </div>
      )}

      {/* Submit button for choice questions */}
      {(question.type === 'single_choice' || question.type === 'multi_choice') && (
        <Button
          className={cn(
            'w-full h-11 font-semibold rounded-xl transition-all duration-200',
            'bg-gradient-to-r from-amber-500 via-orange-500 to-amber-500 bg-[length:200%_100%]',
            'hover:bg-[position:100%_0]',
            'text-white shadow-lg shadow-amber-500/30 hover:shadow-amber-500/50',
            'disabled:opacity-50 disabled:shadow-none',
            'hover:scale-[1.01] active:scale-[0.99]'
          )}
          onClick={handleSubmit}
          disabled={!canSubmit || isSubmitting}
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Submitting...
            </>
          ) : (
            <>
              <Send className="h-4 w-4 mr-2" />
              Submit Answer
            </>
          )}
        </Button>
      )}

      {/* Hint for typing alternative */}
      <p className="text-[11px] text-center text-amber-600/70 dark:text-amber-400/70 mt-3">
        Or type a custom response in the text box below
      </p>
    </div>
  );
}

export function AgentSessionDialog({
  session,
  open,
  onOpenChange,
  workflowSlug,
  onSendMessage,
  onStopAgent,
}: AgentSessionDialogProps) {
  const [inputValue, setInputValue] = useState('');
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (open && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [open, session?.messages.length]);

  const handleSend = () => {
    if (!session || !inputValue.trim() || !onSendMessage) return;
    setIsSending(true);
    onSendMessage(session.id, inputValue);
    setInputValue('');
    setTimeout(() => setIsSending(false), 500);
  };

  const handleStop = () => {
    if (!session || !onStopAgent) return;
    onStopAgent(session.id);
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
  const agentType = agentTypeConfig[session.agentType];
  const AgentIcon = agentType.icon;
  const isRunning = session.status === 'running';
  const canSend = session.status !== 'error' && !isSending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl h-[85vh] flex flex-col p-0 gap-0 overflow-hidden">
        {/* Header */}
        <DialogHeader className="px-6 py-4 border-b shrink-0 bg-gradient-to-r from-violet-500/5 to-purple-500/5">
          <DialogTitle className="flex items-center gap-4">
            {/* Agent Icon */}
            <div className="relative">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-lg shadow-violet-500/30">
                <AgentIcon className="h-6 w-6" />
              </div>
              {isRunning && (
                <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-4 w-4 bg-blue-500 items-center justify-center">
                    <Loader2 className="h-2.5 w-2.5 text-white animate-spin" />
                  </span>
                </span>
              )}
            </div>

            {/* Title & Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-lg">Agent Session</span>
                <span
                  className={cn(
                    'text-xs font-medium px-2 py-0.5 rounded-full',
                    agentType.color,
                    'bg-current/10'
                  )}
                >
                  {agentType.label}
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground mt-0.5">
                <span className="font-mono">{session.runId}</span>
                <span className="text-muted-foreground/50">•</span>
                <span>{session.messages.length} messages</span>
              </div>
            </div>

            {/* Status Badge */}
            <div
              className={cn(
                'flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold border',
                status.bgColor,
                status.borderColor
              )}
            >
              <StatusIcon className={cn('h-4 w-4', status.color, isRunning && 'animate-spin')} />
              <span className={status.color}>{status.label}</span>
            </div>
          </DialogTitle>
          <DialogDescription className="sr-only">
            View and interact with the agent session for run {session.runId}.
          </DialogDescription>
        </DialogHeader>

        {/* Context usage bar */}
        {session.contextUsage !== undefined && (
          <div className="px-6 py-3 border-b bg-muted/20 shrink-0">
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="text-muted-foreground font-medium">Context Window Usage</span>
              <span
                className={cn(
                  'font-mono font-bold tabular-nums',
                  session.contextUsage > 90
                    ? 'text-red-600 dark:text-red-400'
                    : session.contextUsage > 75
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-emerald-600 dark:text-emerald-400'
                )}
              >
                {session.contextUsage}%
              </span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className={cn(
                  'h-full rounded-full transition-all duration-500 ease-out',
                  session.contextUsage > 90
                    ? 'bg-gradient-to-r from-red-500 to-rose-500'
                    : session.contextUsage > 75
                      ? 'bg-gradient-to-r from-amber-500 to-orange-500'
                      : 'bg-gradient-to-r from-violet-500 to-purple-500'
                )}
                style={{ width: `${session.contextUsage}%` }}
              />
            </div>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto py-4 min-h-0">
          {session.messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <Bot className="h-12 w-12 mb-3 opacity-30" />
              <p className="text-sm">No messages yet</p>
            </div>
          ) : (
            <>
              {session.messages.map((message) => (
                <MessageBubble key={message.id} message={message} />
              ))}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        {/* Question Panel - shown when agent is waiting for structured input */}
        {session.status === 'waiting_input' && session.pendingQuestion && (
          <QuestionPanel
            question={session.pendingQuestion}
            onAnswer={(answer) => {
              // Format answer for sending
              let message: string;
              if (typeof answer === 'boolean') {
                message = answer ? 'Yes' : 'No';
              } else if (Array.isArray(answer)) {
                message = answer.join(', ');
              } else {
                message = answer;
              }
              if (onSendMessage) {
                setIsSending(true);
                onSendMessage(session.id, message);
                setTimeout(() => setIsSending(false), 500);
              }
            }}
            isSubmitting={isSending}
          />
        )}

        {/* Input area */}
        <div className="px-5 py-4 border-t bg-muted/30 shrink-0 space-y-3">
          <div className="relative">
            <Textarea
              placeholder={
                session.status === 'waiting_input'
                  ? 'Type your response to continue...'
                  : session.status === 'error'
                    ? 'Session has an error'
                    : 'Send a follow-up message...'
              }
              className={cn(
                'min-h-[90px] resize-none pr-14 rounded-xl text-sm',
                'bg-background border-2',
                'focus:border-violet-400 focus:ring-4 focus:ring-violet-400/20',
                'placeholder:text-muted-foreground/60',
                'transition-all duration-200',
                session.status === 'waiting_input' && 'border-amber-300 dark:border-amber-700'
              )}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={!canSend}
            />
            <Button
              size="icon"
              className={cn(
                'absolute bottom-3 right-3 h-10 w-10 rounded-xl',
                'bg-gradient-to-br from-violet-500 to-purple-600',
                'hover:from-violet-600 hover:to-purple-700',
                'text-white shadow-lg shadow-violet-500/30',
                'disabled:opacity-50 disabled:shadow-none disabled:cursor-not-allowed',
                'transition-all duration-200 hover:scale-105 active:scale-95'
              )}
              onClick={handleSend}
              disabled={!inputValue.trim() || !canSend}
            >
              {isSending ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Send className="h-5 w-5" />
              )}
            </Button>
          </div>

          {/* Footer actions */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {/* Keyboard hint */}
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 rounded bg-muted border text-[10px] font-mono font-semibold">
                  ⌘
                </kbd>
                <span>+</span>
                <kbd className="px-1.5 py-0.5 rounded bg-muted border text-[10px] font-mono font-semibold">
                  ↵
                </kbd>
                <span className="ml-1">to send</span>
              </span>

              {/* Stop button when running */}
              {isRunning && onStopAgent && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs gap-1.5 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30 border-red-200 dark:border-red-800"
                  onClick={handleStop}
                >
                  <Square className="h-3 w-3 fill-current" />
                  Stop
                </Button>
              )}
            </div>

            {/* View run details link */}
            {workflowSlug && (
              <Link
                href={`/workflows/${workflowSlug}/runs/${session.runId}`}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-violet-600 dark:hover:text-violet-400 transition-colors font-medium"
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
