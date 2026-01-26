'use client';

/**
 * ContextWindowDisplay - Token usage progress bar
 *
 * Displays context window usage with color-coded thresholds:
 * - < 75%: violet (normal)
 * - >= 75% and < 90%: amber (warning)
 * - >= 90%: red (critical)
 *
 * Part of Plan 012: Multi-Agent Web UI (Phase 2: Core Chat)
 */

import { cn } from '@/lib/utils';

export interface ContextWindowDisplayProps {
  /** Usage percentage (0-100), undefined if not available */
  usage: number | undefined;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Get the color class based on usage threshold.
 */
function getColorClass(usage: number): string {
  if (usage >= 90) {
    return 'bg-red-500';
  }
  if (usage >= 75) {
    return 'bg-amber-500';
  }
  return 'bg-violet-500';
}

/**
 * Compact context window progress bar.
 *
 * @example
 * <ContextWindowDisplay usage={45} />
 * // → Violet bar at 45% width
 *
 * <ContextWindowDisplay usage={85} />
 * // → Amber bar at 85% width (warning)
 */
export function ContextWindowDisplay({ usage, className }: ContextWindowDisplayProps) {
  // Handle unavailable state
  if (usage === undefined) {
    return null;
  }

  return (
    <section
      className={cn('flex items-center gap-3 px-4 py-1.5', className)}
      aria-label="Context window usage"
    >
      <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Context</span>
      <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all', getColorClass(usage))}
          style={{ width: `${Math.min(100, Math.max(0, usage))}%` }}
          role="progressbar"
          aria-valuenow={usage}
          aria-valuemin={0}
          aria-valuemax={100}
          tabIndex={0}
        />
      </div>
      <span className="text-[10px] text-muted-foreground font-mono">{usage}%</span>
    </section>
  );
}

export default ContextWindowDisplay;
