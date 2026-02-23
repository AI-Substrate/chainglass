/**
 * FleetStatusBar — Summary bar showing agent fleet status across all workspaces.
 *
 * Server Component. Returns null when idle/no data (hidden).
 * Shows running count and clickable attention indicator.
 *
 * Phase 3: UI Overhaul — Plan 041: File Browser
 * DYK-P3-01: All props optional — placeholder until agent system wired
 */

import Link from 'next/link';

export interface FleetStatusBarProps {
  runningCount?: number;
  attentionCount?: number;
  firstAttentionHref?: string;
}

export function FleetStatusBar({
  runningCount,
  attentionCount,
  firstAttentionHref,
}: FleetStatusBarProps) {
  const hasRunning = runningCount != null && runningCount > 0;
  const hasAttention = attentionCount != null && attentionCount > 0;

  if (!hasRunning && !hasAttention) {
    return null;
  }

  return (
    <div className="flex items-center gap-4 rounded-lg border bg-muted/50 px-4 py-2 text-sm">
      {hasRunning && (
        <span className="text-muted-foreground">
          {runningCount} agent{runningCount === 1 ? '' : 's'} running
        </span>
      )}
      {hasAttention && firstAttentionHref && (
        <Link href={firstAttentionHref} className="text-amber-500 hover:underline">
          ◆ {attentionCount} needs attention
        </Link>
      )}
    </div>
  );
}
