'use client';

/**
 * Plan 056: StateEntriesTable Component
 *
 * Current state entries sorted by updatedAt (most recent first).
 * AC-04: sorted table, AC-05: path/value/time, AC-06: domain filter, AC-07: click → detail
 */

import type { StateEntry } from '@chainglass/shared/state';
import type { DetailItem } from './entry-detail';

function formatTimeAgo(updatedAt: number): string {
  const delta = Date.now() - updatedAt;
  if (delta < 1000) return 'just now';
  if (delta < 60000) return `${Math.floor(delta / 1000)}s ago`;
  if (delta < 3600000) return `${Math.floor(delta / 60000)}m ago`;
  return `${Math.floor(delta / 3600000)}h ago`;
}

function formatValue(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') return `"${value.length > 30 ? `${value.slice(0, 30)}…` : value}"`;
  try {
    if (typeof value === 'object') return JSON.stringify(value).slice(0, 40);
  } catch {
    return '[unserializable]';
  }
  return String(value);
}

function valueColor(value: unknown): string {
  if (typeof value === 'string') return 'text-emerald-400';
  if (typeof value === 'number') return 'text-blue-400';
  if (typeof value === 'boolean') return 'text-amber-400';
  if (value === null || value === undefined) return 'text-muted-foreground italic';
  return 'text-zinc-300';
}

interface StateEntriesTableProps {
  entries: StateEntry[];
  onSelect?: (item: DetailItem) => void;
}

export function StateEntriesTable({ entries, onSelect }: StateEntriesTableProps) {
  const sorted = [...entries].sort((a, b) => b.updatedAt - a.updatedAt);

  if (sorted.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
        No state entries published
      </div>
    );
  }

  return (
    <div className="flex flex-col text-xs font-mono">
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border text-muted-foreground uppercase text-[10px] font-sans font-medium">
        <span className="flex-1">Path</span>
        <span className="w-32 text-right">Value</span>
        <span className="w-16 text-right">Updated</span>
      </div>

      {sorted.map((entry) => (
        <button
          type="button"
          key={entry.path}
          className="flex items-center gap-2 px-3 py-1.5 hover:bg-accent/50 transition-colors text-left border-b border-border/50 last:border-b-0"
          onClick={() => onSelect?.({ kind: 'entry', data: entry })}
        >
          <span className="flex-1 truncate text-foreground">{entry.path}</span>
          <span className={`w-32 text-right truncate ${valueColor(entry.value)}`}>
            {formatValue(entry.value)}
          </span>
          <span className="w-16 text-right text-muted-foreground">
            {formatTimeAgo(entry.updatedAt)}
          </span>
        </button>
      ))}
    </div>
  );
}
