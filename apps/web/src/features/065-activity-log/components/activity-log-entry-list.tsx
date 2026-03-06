'use client';

/**
 * Activity Log Entry List — renders entries with gap separators.
 *
 * Entries arrive newest-first from readActivityLog().
 * Inserts visual gap separator when >30min between adjacent entries (AC-13).
 * Source icons: 🖥 tmux, 🤖 agent, 📋 default.
 *
 * Plan 065: Worktree Activity Log — Phase 3
 */

import type { ActivityLogEntry } from '../types';

const GAP_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes

function sourceIcon(source: string): string {
  switch (source) {
    case 'tmux':
      return '🖥';
    case 'agent':
      return '🤖';
    default:
      return '📋';
  }
}

function relativeTime(timestamp: string): string {
  const ms = Date.now() - Date.parse(timestamp);
  if (ms < 60_000) return 'just now';
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}

function hasGap(a: string, b: string): boolean {
  return Math.abs(Date.parse(a) - Date.parse(b)) > GAP_THRESHOLD_MS;
}

function paneLabel(entry: ActivityLogEntry): string | null {
  if (entry.source !== 'tmux' || !entry.meta) return null;
  const pane = entry.meta.pane as string | undefined;
  const windowName = entry.meta.windowName as string | undefined;
  if (!pane) return null;
  // Show window index only (e.g., "2" not "2.0"), plus window name if available
  const windowIndex = pane.split('.')[0];
  if (windowName) return `${windowIndex}:${windowName}`;
  return windowIndex;
}

interface ActivityLogEntryListProps {
  entries: ActivityLogEntry[];
}

export function ActivityLogEntryList({ entries }: ActivityLogEntryListProps) {
  if (entries.length === 0) {
    return (
      <div
        className="flex items-center justify-center h-full text-muted-foreground text-sm"
        data-testid="activity-log-empty"
      >
        No activity recorded yet
      </div>
    );
  }

  return (
    <div className="flex flex-col overflow-y-auto h-full" data-testid="activity-log-entry-list">
      {entries.map((entry, i) => (
        <div key={`${entry.id}-${entry.timestamp}`}>
          {/* Gap separator: entries arrive newest-first, so check gap with previous (newer) entry */}
          {i > 0 && hasGap(entries[i - 1].timestamp, entry.timestamp) && (
            <div className="flex items-center gap-2 px-3 py-2" data-testid="activity-log-gap">
              <div className="flex-1 border-t border-dashed border-muted-foreground/30" />
              <span className="text-[10px] text-muted-foreground/50 shrink-0">gap</span>
              <div className="flex-1 border-t border-dashed border-muted-foreground/30" />
            </div>
          )}
          <div className="flex items-start gap-2 px-3 py-1.5 hover:bg-accent/50 text-sm">
            <span className="shrink-0 mt-0.5" title={entry.source}>
              {sourceIcon(entry.source)}
            </span>
            <span className="flex-1 min-w-0 break-words">
              {paneLabel(entry) && (
                <span className="text-xs text-muted-foreground font-mono mr-1.5">
                  {paneLabel(entry)}
                </span>
              )}
              {entry.label}
            </span>
            <span className="shrink-0 text-xs text-muted-foreground whitespace-nowrap">
              {relativeTime(entry.timestamp)}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
