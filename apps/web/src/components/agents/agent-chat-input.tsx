'use client';

/**
 * AgentChatInput - Chat input component with Cmd/Ctrl+Enter submission
 *
 * Features:
 * - Multi-line textarea with Cmd/Ctrl+Enter to submit
 * - Plain Enter inserts newline (for multi-line messages)
 * - Submit button never disabled (per MF-09 accessibility)
 * - Validation error shown on empty submission
 * - Keyboard shortcut hint in footer
 *
 * Part of Plan 012: Multi-Agent Web UI (Phase 2: Core Chat)
 */

import { cn } from '@/lib/utils';
import { Send } from 'lucide-react';
import { type ChangeEvent, type KeyboardEvent, useCallback, useState } from 'react';

export interface AgentChatInputProps {
  /** Callback when message is submitted */
  onMessage: (message: string) => void;
  /** Disable input (but not button per MF-09) */
  disabled?: boolean;
  /** Custom placeholder text */
  placeholder?: string;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Chat input component with Cmd/Ctrl+Enter submission.
 *
 * @example
 * <AgentChatInput
 *   onMessage={(msg) => dispatch({ type: 'ADD_MESSAGE', message: { role: 'user', content: msg, timestamp: Date.now() } })}
 *   disabled={status === 'running'}
 * />
 */
export function AgentChatInput({
  onMessage,
  disabled = false,
  placeholder = 'Send a message...',
  className,
}: AgentChatInputProps) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  /**
   * Handle input change - clear error when user types
   */
  const handleChange = useCallback(
    (e: ChangeEvent<HTMLTextAreaElement>) => {
      setValue(e.target.value);
      if (error) {
        setError(null);
      }
    },
    [error]
  );

  /**
   * Validate and submit message
   */
  const handleSubmit = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed) {
      setError('Please enter a message');
      return;
    }

    onMessage(trimmed);
    setValue('');
    setError(null);
  }, [value, onMessage]);

  /**
   * Handle keyboard shortcuts
   * - Cmd/Ctrl+Enter: Submit
   * - Plain Enter: Newline (default textarea behavior)
   */
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit]
  );

  return (
    <div className={cn('space-y-2', className)}>
      <div className="relative">
        <textarea
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={placeholder}
          aria-label="Message input"
          aria-invalid={error ? 'true' : 'false'}
          aria-describedby={error ? 'input-error' : undefined}
          className={cn(
            'w-full min-h-[80px] p-3 pr-12 resize-none',
            'text-sm font-mono rounded-lg',
            'bg-background border',
            'focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500',
            'transition-colors',
            error && 'border-red-500',
            disabled && 'opacity-50 cursor-not-allowed'
          )}
        />
        <button
          type="button"
          onClick={handleSubmit}
          aria-label="Send message"
          className={cn(
            'absolute bottom-2 right-2',
            'h-8 w-8 rounded-lg',
            'flex items-center justify-center',
            'bg-violet-600 hover:bg-violet-700 text-white',
            'transition-colors',
            'focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2'
          )}
        >
          <Send className="h-4 w-4" />
        </button>
      </div>

      {/* Error message */}
      {error && (
        <p id="input-error" role="alert" className="text-sm text-red-500">
          {error}
        </p>
      )}

      {/* Keyboard hint - navigator.platform is deprecated but userAgentData isn't widely supported */}
      <div className="flex items-center text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <kbd className="px-1 py-0.5 rounded bg-muted border font-mono">
            {typeof navigator !== 'undefined' && /Mac/.test(navigator.platform) ? '⌘' : 'Ctrl'}
          </kbd>
          <span>+</span>
          <kbd className="px-1 py-0.5 rounded bg-muted border font-mono">Enter</kbd>
          <span className="ml-1">to send</span>
        </span>
      </div>
    </div>
  );
}

export default AgentChatInput;
