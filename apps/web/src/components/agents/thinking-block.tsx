'use client';

/**
 * ThinkingBlock - Collapsible block for displaying AI reasoning/thinking
 *
 * Renders thinking blocks with:
 * - Header showing "Thinking" label with brain icon
 * - Collapsed by default per AC6a
 * - Distinct visual styling from chat messages (AC6)
 * - Full keyboard navigation and ARIA support (AC14, AC16)
 *
 * Part of Plan 015: Better Agents (Phase 4: UI Components)
 *
 * @example
 * <ThinkingBlock
 *   content="I am reasoning about this problem..."
 * />
 *
 * @example
 * <ThinkingBlock
 *   content="Step 1: Parse the input..."
 *   signature="claude-thinking-abc123"
 * />
 */

import { cn } from '@/lib/utils';
import { Brain, ChevronRight } from 'lucide-react';
import { useId, useState } from 'react';

export interface ThinkingBlockProps {
  /** Thinking/reasoning content */
  content: string;
  /** Optional signature for Claude thinking blocks */
  signature?: string;
  /** Unique ID for ARIA controls */
  thinkingId?: string;
  /** Start expanded (for testing) */
  defaultExpanded?: boolean;
  /** Additional CSS classes */
  className?: string;
}

export function ThinkingBlock({
  content,
  signature,
  thinkingId,
  defaultExpanded = false,
  className,
}: ThinkingBlockProps) {
  // Generate unique ID for ARIA if not provided
  const generatedId = useId();
  const panelId = `thinking-panel-${thinkingId ?? generatedId}`;

  // Collapsed by default per AC6a
  const [expanded, setExpanded] = useState(defaultExpanded);

  const toggleExpanded = () => setExpanded((prev) => !prev);

  return (
    <div
      className={cn(
        'border rounded-md overflow-hidden',
        // Distinct styling from chat messages (AC6)
        'bg-violet-50/50 dark:bg-violet-950/20 border-violet-200 dark:border-violet-800',
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
          'hover:bg-violet-100/50 dark:hover:bg-violet-900/30 transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
        )}
      >
        {/* Thinking icon */}
        <Brain
          className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400 shrink-0"
          aria-hidden="true"
        />

        {/* Label */}
        <span className="text-sm font-medium text-violet-700 dark:text-violet-300">Thinking</span>

        {/* Expand chevron */}
        <ChevronRight
          className={cn(
            'h-3.5 w-3.5 text-violet-500 dark:text-violet-400 transition-transform shrink-0 ml-auto',
            expanded && 'rotate-90'
          )}
          aria-hidden="true"
        />
      </button>

      {/* Expandable content panel */}
      {expanded && (
        <section id={panelId} aria-labelledby={`thinking-header-${thinkingId ?? generatedId}`}>
          <div className="px-3 py-2 border-t border-violet-200/50 dark:border-violet-800/50">
            <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
              {content}
            </p>
          </div>
        </section>
      )}
      {/* Hidden region for ARIA controls reference (required for aria-controls to point to existing element) */}
      {!expanded && <div id={panelId} className="hidden" aria-hidden="true" />}
    </div>
  );
}

export default ThinkingBlock;
