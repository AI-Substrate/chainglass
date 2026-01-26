'use client';

/**
 * AgentSessionDialog - Modal for viewing and interacting with agent sessions
 *
 * Terminal/log-style design inspired by vibe-kanban's conversation UI.
 * Displays conversation as log entries with inline tool calls and status indicators.
 *
 * Features interactive question UI that toggles with the text input area.
 */

import {
  Bot,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Eye,
  HelpCircle,
  Loader2,
  MessageSquare,
  Send,
  Sparkles,
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
  onSendMessage?: (sessionId: string, message: string) => void;
  onStopAgent?: (sessionId: string) => void;
}

const statusConfig: Record<
  AgentSessionStatus,
  { label: string; color: string; bgColor: string; borderColor: string; icon: typeof Loader2 }
> = {
  idle: {
    label: 'Idle',
    color: 'text-zinc-500',
    bgColor: 'bg-zinc-100 dark:bg-zinc-800',
    borderColor: 'border-zinc-300 dark:border-zinc-700',
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
    label: 'Waiting',
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

/**
 * Terminal-style log entry for a single message
 */
function LogEntry({ message }: { message: AgentMessage }) {
  const [expanded, setExpanded] = useState(false);
  const isUser = message.role === 'user';
  const isAssistant = message.role === 'assistant';
  const isTool = message.role === 'tool';
  const isSystem = message.role === 'system';

  // Tool call entry - compact inline display
  if (isTool && message.tool) {
    const hasOutput = message.tool.output && message.tool.output.length > 0;
    const isMultiline = hasOutput && message.tool.output?.includes('\n');

    return (
      <div className="px-4 py-1.5 hover:bg-muted/30 transition-colors">
        <button
          type="button"
          onClick={() => hasOutput && setExpanded(!expanded)}
          className={cn(
            'w-full text-left flex items-center gap-2 text-sm',
            hasOutput && 'cursor-pointer'
          )}
        >
          {/* Status indicator dot */}
          <div className="relative shrink-0">
            <div
              className={cn(
                'h-1.5 w-1.5 rounded-full',
                message.tool.status === 'complete' && 'bg-emerald-500',
                message.tool.status === 'running' && 'bg-blue-500',
                message.tool.status === 'failed' && 'bg-red-500',
                message.tool.status === 'pending' && 'bg-zinc-400'
              )}
            />
            {message.tool.status === 'running' && (
              <div className="absolute inset-0 h-1.5 w-1.5 rounded-full bg-blue-500 animate-ping" />
            )}
          </div>

          {/* Icon */}
          <Terminal className="h-3 w-3 text-muted-foreground shrink-0" />

          {/* Command text */}
          <span className="font-mono text-xs text-foreground truncate flex-1">
            {message.tool.input || message.tool.name}
          </span>

          {/* Expand indicator */}
          {hasOutput && (
            <ChevronRight
              className={cn(
                'h-3 w-3 text-muted-foreground transition-transform shrink-0',
                expanded && 'rotate-90'
              )}
            />
          )}
        </button>

        {/* Expanded output */}
        {expanded && hasOutput && (
          <div className="mt-2 ml-5 border rounded overflow-hidden bg-zinc-950 dark:bg-zinc-950">
            <pre className="px-3 py-2 font-mono text-[11px] text-zinc-400 whitespace-pre-wrap max-h-32 overflow-auto leading-relaxed">
              {message.tool.output}
            </pre>
          </div>
        )}
      </div>
    );
  }

  // System message - muted inline
  if (isSystem) {
    return (
      <div className="px-4 py-1.5 text-xs text-muted-foreground italic">{message.content}</div>
    );
  }

  // User message - highlighted background
  if (isUser) {
    return (
      <div className="px-4 py-2 bg-muted/40 border-l-2 border-violet-500">
        <div className="flex items-start gap-2">
          <User className="h-3.5 w-3.5 text-violet-500 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm whitespace-pre-wrap leading-relaxed">{message.content}</p>
          </div>
        </div>
      </div>
    );
  }

  // Assistant message - plain with icon
  return (
    <div className="px-4 py-2 hover:bg-muted/20 transition-colors">
      <div className="flex items-start gap-2">
        <Bot className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm whitespace-pre-wrap leading-relaxed text-foreground/90">
            {message.content}
          </p>
          {message.isStreaming && (
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

/**
 * Inline question input panel (replaces text input when active)
 */
interface QuestionInputProps {
  question: AgentQuestion;
  onAnswer: (answer: string | string[] | boolean) => void;
  onCancel: () => void;
  isSubmitting: boolean;
}

function QuestionInput({ question, onAnswer, onCancel, isSubmitting }: QuestionInputProps) {
  const [selectedValue, setSelectedValue] = useState<string | string[] | boolean>(
    question.defaultValue ?? (question.type === 'multi_choice' ? [] : '')
  );

  const handleSubmit = () => {
    if (question.type === 'confirm') return;
    onAnswer(selectedValue);
  };

  const canSubmit =
    question.type === 'single_choice'
      ? typeof selectedValue === 'string' && selectedValue.length > 0
      : question.type === 'multi_choice'
        ? Array.isArray(selectedValue) && selectedValue.length > 0
        : false;

  return (
    <div className="space-y-3">
      {/* Question prompt */}
      <div className="flex items-start gap-2 text-sm">
        <HelpCircle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
        <span className="font-medium text-foreground">{question.prompt}</span>
      </div>

      {/* Single choice */}
      {question.type === 'single_choice' && question.choices && (
        <RadioGroup
          value={selectedValue as string}
          onValueChange={setSelectedValue}
          className="grid grid-cols-1 gap-1.5"
        >
          {question.choices.map((choice, idx) => (
            <label
              key={choice}
              htmlFor={`q-${question.id}-${idx}`}
              className={cn(
                'flex items-center gap-2 px-3 py-2 rounded border cursor-pointer transition-all text-sm',
                selectedValue === choice
                  ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/30'
                  : 'border-border hover:border-amber-300 hover:bg-muted/50'
              )}
            >
              <RadioGroupItem
                value={choice}
                id={`q-${question.id}-${idx}`}
                className="border-amber-400"
              />
              <span className="flex-1">{choice}</span>
              {selectedValue === choice && <Check className="h-3.5 w-3.5 text-amber-600" />}
            </label>
          ))}
        </RadioGroup>
      )}

      {/* Multi choice */}
      {question.type === 'multi_choice' && question.choices && (
        <div className="grid grid-cols-1 gap-1.5">
          {question.choices.map((choice, idx) => {
            const isChecked = Array.isArray(selectedValue) && selectedValue.includes(choice);
            return (
              <label
                key={choice}
                htmlFor={`q-${question.id}-mc-${idx}`}
                className={cn(
                  'flex items-center gap-2 px-3 py-2 rounded border cursor-pointer transition-all text-sm',
                  isChecked
                    ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/30'
                    : 'border-border hover:border-amber-300 hover:bg-muted/50'
                )}
              >
                <Checkbox
                  id={`q-${question.id}-mc-${idx}`}
                  checked={isChecked}
                  className="border-amber-400 data-[state=checked]:bg-amber-500"
                  onCheckedChange={(checked) => {
                    const current = Array.isArray(selectedValue) ? selectedValue : [];
                    if (checked) {
                      setSelectedValue([...current, choice]);
                    } else {
                      setSelectedValue(current.filter((c) => c !== choice));
                    }
                  }}
                />
                <span className="flex-1">{choice}</span>
                {isChecked && <Check className="h-3.5 w-3.5 text-amber-600" />}
              </label>
            );
          })}
        </div>
      )}

      {/* Confirm */}
      {question.type === 'confirm' && (
        <div className="flex gap-2">
          <Button
            className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
            onClick={() => onAnswer(true)}
            disabled={isSubmitting}
          >
            <ThumbsUp className="h-4 w-4 mr-2" />
            Yes
          </Button>
          <Button
            className="flex-1 bg-red-600 hover:bg-red-700 text-white"
            onClick={() => onAnswer(false)}
            disabled={isSubmitting}
          >
            <ThumbsDown className="h-4 w-4 mr-2" />
            No
          </Button>
        </div>
      )}

      {/* Submit for choice questions */}
      {(question.type === 'single_choice' || question.type === 'multi_choice') && (
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onCancel} disabled={isSubmitting}>
            Type instead
          </Button>
          <Button
            className="flex-1 bg-amber-600 hover:bg-amber-700 text-white"
            onClick={handleSubmit}
            disabled={!canSubmit || isSubmitting}
          >
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Send className="h-4 w-4 mr-2" />
                Submit
              </>
            )}
          </Button>
        </div>
      )}
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
  const [showQuestionUI, setShowQuestionUI] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (open && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [open]);

  // Reset question UI visibility when dialog opens or question changes
  useEffect(() => {
    if (session?.pendingQuestion) {
      setShowQuestionUI(true);
    }
  }, [session?.pendingQuestion]);

  const handleSend = () => {
    if (!session || !inputValue.trim() || !onSendMessage) return;
    setIsSending(true);
    onSendMessage(session.id, inputValue);
    setInputValue('');
    setTimeout(() => setIsSending(false), 500);
  };

  const handleQuestionAnswer = (answer: string | string[] | boolean) => {
    if (!session || !onSendMessage) return;
    let message: string;
    if (typeof answer === 'boolean') {
      message = answer ? 'Yes' : 'No';
    } else if (Array.isArray(answer)) {
      message = answer.join(', ');
    } else {
      message = answer;
    }
    setIsSending(true);
    onSendMessage(session.id, message);
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
  const agentType = agentTypeConfig[session.agentType];
  const AgentIcon = agentType.icon;
  const isRunning = session.status === 'running';
  const canSend = session.status !== 'error' && !isSending;
  const hasQuestion = session.status === 'waiting_input' && session.pendingQuestion;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl h-[85vh] flex flex-col p-0 gap-0 overflow-hidden">
        {/* Compact Header */}
        <DialogHeader className="px-4 py-3 border-b shrink-0 bg-muted/30">
          <DialogTitle className="flex items-center gap-3 text-sm">
            <AgentIcon className={cn('h-4 w-4', agentType.color)} />
            <span className="font-mono font-medium">{session.runId}</span>
            <span className="text-muted-foreground">•</span>
            <span className="text-muted-foreground">{agentType.label}</span>
            <div className="flex-1" />
            <span
              className={cn(
                'flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded',
                status.bgColor,
                status.color
              )}
            >
              <StatusIcon className={cn('h-3 w-3', isRunning && 'animate-spin')} />
              {status.label}
            </span>
          </DialogTitle>
          <DialogDescription className="sr-only">
            Agent session for run {session.runId}
          </DialogDescription>
        </DialogHeader>

        {/* Context usage bar (compact) */}
        {(session.contextUsage ?? 0) > 0 && (
          <div className="px-4 py-1.5 border-b bg-muted/20 flex items-center gap-3">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
              Context
            </span>
            <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
              <div
                className={cn(
                  'h-full rounded-full transition-all',
                  (session.contextUsage ?? 0) > 90
                    ? 'bg-red-500'
                    : (session.contextUsage ?? 0) > 75
                      ? 'bg-amber-500'
                      : 'bg-violet-500'
                )}
                style={{ width: `${session.contextUsage ?? 0}%` }}
              />
            </div>
            <span className="text-[10px] text-muted-foreground font-mono">
              {session.contextUsage ?? 0}%
            </span>
          </div>
        )}

        {/* Messages - Terminal log style */}
        <div className="flex-1 overflow-y-auto min-h-0 font-sans">
          {session.messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <Terminal className="h-8 w-8 mb-2 opacity-30" />
              <p className="text-xs">No messages yet</p>
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              {session.messages.map((message) => (
                <LogEntry key={message.id} message={message} />
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="border-t bg-muted/30 shrink-0">
          {/* Question toggle button when question available */}
          {hasQuestion && (
            <button
              type="button"
              onClick={() => setShowQuestionUI(!showQuestionUI)}
              className={cn(
                'w-full px-4 py-2 flex items-center gap-2 text-left text-sm border-b transition-colors',
                showQuestionUI
                  ? 'bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300'
                  : 'hover:bg-muted/50 text-muted-foreground'
              )}
            >
              <HelpCircle className={cn('h-4 w-4', showQuestionUI && 'text-amber-500')} />
              <span className="flex-1 truncate font-medium">
                {showQuestionUI ? 'Agent Question' : session.pendingQuestion?.prompt}
              </span>
              <ChevronDown
                className={cn('h-4 w-4 transition-transform', showQuestionUI && 'rotate-180')}
              />
            </button>
          )}

          {/* Question UI or Text Input */}
          <div className="p-4">
            {hasQuestion && showQuestionUI && session.pendingQuestion ? (
              <QuestionInput
                question={session.pendingQuestion}
                onAnswer={handleQuestionAnswer}
                onCancel={() => setShowQuestionUI(false)}
                isSubmitting={isSending}
              />
            ) : (
              <div className="space-y-2">
                <div className="relative">
                  <Textarea
                    placeholder={
                      session.status === 'waiting_input'
                        ? 'Type your response...'
                        : session.status === 'error'
                          ? 'Session has an error'
                          : 'Send a message...'
                    }
                    className={cn(
                      'min-h-[80px] resize-none pr-12 text-sm font-mono',
                      'bg-background border rounded-lg',
                      'focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500',
                      session.status === 'waiting_input' && 'border-amber-400'
                    )}
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={!canSend}
                  />
                  <Button
                    size="icon"
                    className={cn(
                      'absolute bottom-2 right-2 h-8 w-8 rounded-lg',
                      'bg-violet-600 hover:bg-violet-700 text-white',
                      'disabled:opacity-50'
                    )}
                    onClick={handleSend}
                    disabled={!inputValue.trim() || !canSend}
                  >
                    {isSending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </Button>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <kbd className="px-1 py-0.5 rounded bg-muted border font-mono">⌘</kbd>
                    <span>+</span>
                    <kbd className="px-1 py-0.5 rounded bg-muted border font-mono">↵</kbd>
                    <span className="ml-1">to send</span>
                  </span>
                  {workflowSlug && (
                    <Link
                      href={`/workflows/${workflowSlug}/runs/${session.runId}`}
                      className="flex items-center gap-1 hover:text-foreground transition-colors"
                    >
                      View details
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Close button */}
        <Button
          variant="ghost"
          size="sm"
          className="absolute top-2 right-2"
          onClick={() => onOpenChange(false)}
        >
          <XCircle className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </Button>
      </DialogContent>
    </Dialog>
  );
}
