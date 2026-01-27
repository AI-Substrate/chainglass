'use client';

/**
 * ToolCallCard - Collapsible card for displaying tool invocations
 *
 * Renders tool calls with:
 * - Header showing tool name and status
 * - Collapsible body with input/output
 * - Auto-expand on error (AC12a)
 * - Output truncation at 20 lines or 2000 chars (AC13a)
 * - Full keyboard navigation and ARIA support (AC14, AC15, AC16)
 *
 * Part of Plan 015: Better Agents (Phase 4: UI Components)
 *
 * @example
 * <ToolCallCard
 *   toolName="Bash"
 *   status="running"
 *   input="npm test"
 *   output=""
 * />
 *
 * @example
 * <ToolCallCard
 *   toolName="Bash"
 *   status="error"
 *   input="npm test"
 *   output="Error: ENOENT"
 *   isError
 * />
 */

import { cn } from '@/lib/utils';
import { ChevronRight, Terminal } from 'lucide-react';
import { useEffect, useId, useState } from 'react';

export type ToolCallStatus = 'pending' | 'running' | 'complete' | 'error';

export interface ToolCallCardProps {
  /** Tool name to display in header */
  toolName: string;
  /** Current execution status */
  status: ToolCallStatus;
  /** Tool input (command, arguments) */
  input: string;
  /** Tool output (result, error message) */
  output: string;
  /** Whether this tool call resulted in an error */
  isError?: boolean;
  /** Unique ID for ARIA controls */
  toolCallId?: string;
  /** Start expanded (for testing) */
  defaultExpanded?: boolean;
  /** Additional CSS classes */
  className?: string;
}

/** Max lines before truncation */
const MAX_LINES = 20;
/** Max characters before truncation */
const MAX_CHARS = 2000;

/**
 * Status indicator dot with appropriate color and animation
 */
function StatusIndicator({ status }: { status: ToolCallStatus }) {
  return (
    <div className="relative shrink-0">
      <div
        className={cn(
          'h-1.5 w-1.5 rounded-full',
          status === 'complete' && 'bg-emerald-500',
          status === 'running' && 'bg-blue-500',
          status === 'error' && 'bg-red-500',
          status === 'pending' && 'bg-zinc-400'
        )}
      />
      {status === 'running' && (
        <div className="absolute inset-0 h-1.5 w-1.5 rounded-full bg-blue-500 animate-ping" />
      )}
    </div>
  );
}

/**
 * Status label text for screen readers and visual display
 */
function StatusLabel({ status }: { status: ToolCallStatus }) {
  const labels: Record<ToolCallStatus, string> = {
    pending: 'Pending',
    running: 'Running',
    complete: 'Complete',
    error: 'Error',
  };
  return (
    <span
      aria-live="polite"
      className={cn(
        'text-xs',
        status === 'complete' && 'text-emerald-600 dark:text-emerald-400',
        status === 'running' && 'text-blue-600 dark:text-blue-400',
        status === 'error' && 'text-red-600 dark:text-red-400',
        status === 'pending' && 'text-zinc-500'
      )}
    >
      {labels[status]}
    </span>
  );
}

/**
 * Truncate output and return truncated text with remaining count
 */
function truncateOutput(output: string): {
  text: string;
  isTruncated: boolean;
  remainingLines: number;
  remainingChars: number;
} {
  const lines = output.split('\n');

  // Check line count
  if (lines.length > MAX_LINES) {
    const truncatedLines = lines.slice(0, MAX_LINES);
    return {
      text: truncatedLines.join('\n'),
      isTruncated: true,
      remainingLines: lines.length - MAX_LINES,
      remainingChars: 0,
    };
  }

  // Check character count
  if (output.length > MAX_CHARS) {
    return {
      text: output.slice(0, MAX_CHARS),
      isTruncated: true,
      remainingLines: 0,
      remainingChars: output.length - MAX_CHARS,
    };
  }

  return { text: output, isTruncated: false, remainingLines: 0, remainingChars: 0 };
}

export function ToolCallCard({
  toolName,
  status,
  input,
  output,
  isError = false,
  toolCallId,
  defaultExpanded = false,
  className,
}: ToolCallCardProps) {
  // Generate unique ID for ARIA if not provided
  const generatedId = useId();
  const panelId = `tool-panel-${toolCallId ?? generatedId}`;

  // Expand state - auto-expand on error (AC12a)
  const [expanded, setExpanded] = useState(defaultExpanded || isError);
  const [showFullOutput, setShowFullOutput] = useState(false);

  // Auto-expand when error state changes (AC12a)
  useEffect(() => {
    if (isError) {
      setExpanded(true);
    }
  }, [isError]);

  const hasOutput = output.length > 0;
  const {
    text: displayOutput,
    isTruncated,
    remainingLines,
    remainingChars,
  } = truncateOutput(output);

  const toggleExpanded = () => setExpanded((prev) => !prev);

  return (
    <div
      className={cn(
        'border rounded-md overflow-hidden bg-muted/20',
        isError && 'border-red-300 dark:border-red-700 bg-red-50/50 dark:bg-red-950/20',
        className
      )}
    >
      {/* Header - clickable to expand/collapse */}
      <button
        type="button"
        onClick={toggleExpanded}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggleExpanded();
          }
        }}
        aria-expanded={expanded}
        aria-controls={panelId}
        className={cn(
          'w-full text-left px-3 py-2 flex items-center gap-2',
          'hover:bg-muted/30 transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
        )}
      >
        {/* Status indicator dot */}
        <StatusIndicator status={status} />

        {/* Tool icon */}
        <Terminal className="h-3.5 w-3.5 text-muted-foreground shrink-0" aria-hidden="true" />

        {/* Tool name */}
        <span className="font-medium text-sm">{toolName}</span>

        {/* Expand chevron */}
        <ChevronRight
          className={cn(
            'h-3.5 w-3.5 text-muted-foreground transition-transform shrink-0 ml-auto',
            expanded && 'rotate-90'
          )}
          aria-hidden="true"
        />

        {/* Status label */}
        <StatusLabel status={status} />
      </button>

      {/* Expandable content panel */}
      {expanded && (
        <section id={panelId} aria-labelledby={`tool-header-${toolCallId ?? generatedId}`}>
          {/* Input section */}
          <div className="px-3 py-2 border-t border-border/50 bg-muted/30">
            <div className="font-mono text-xs text-muted-foreground">
              <span className="text-muted-foreground/70">$ </span>
              {input}
            </div>
          </div>

          {/* Output section */}
          <div className="border-t border-border/50 bg-zinc-950 dark:bg-zinc-950">
            <pre
              className={cn(
                'px-3 py-2 font-mono text-[11px] text-zinc-400 whitespace-pre-wrap leading-relaxed overflow-x-auto',
                isError && 'text-red-400'
              )}
            >
              {showFullOutput ? output : displayOutput}
              {!hasOutput && <span className="text-zinc-600 italic">No output</span>}
            </pre>

            {/* Truncation controls */}
            {isTruncated && !showFullOutput && (
              <button
                type="button"
                onClick={() => setShowFullOutput(true)}
                className="px-3 py-1.5 text-xs text-blue-400 hover:text-blue-300 hover:underline"
              >
                Show more
                {remainingLines > 0 && ` (${remainingLines} more lines)`}
                {remainingChars > 0 && ` (${remainingChars} more characters)`}
              </button>
            )}

            {isTruncated && showFullOutput && (
              <button
                type="button"
                onClick={() => setShowFullOutput(false)}
                className="px-3 py-1.5 text-xs text-blue-400 hover:text-blue-300 hover:underline"
              >
                Show less
              </button>
            )}
          </div>
        </section>
      )}
      {/* Hidden region for ARIA controls reference (required for aria-controls to point to existing element) */}
      {!expanded && <div id={panelId} className="hidden" aria-hidden="true" />}
    </div>
  );
}

export default ToolCallCard;
