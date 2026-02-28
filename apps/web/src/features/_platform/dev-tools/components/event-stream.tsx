'use client';

/**
 * Plan 056: EventStream Component
 *
 * Scrolling list of StateChange events from the StateChangeLog.
 * Compact rows (32px): relative timestamp, badge, domain, property, value.
 * AC-08..12, AC-24: live stream, filters, pause/resume/clear, auto-scroll.
 *
 * Workshop 001: event row design, auto-scroll with "new events" banner.
 */

import { useEffect, useRef, useState } from 'react';

import type { StateChange } from '@chainglass/shared/state';
import type { DetailItem } from './entry-detail';

function formatRelativeTime(timestamp: number, prevTimestamp?: number): string {
  if (!prevTimestamp) return '+0ms';
  const delta = timestamp - prevTimestamp;
  if (delta < 1000) return `+${delta}ms`;
  if (delta < 60000) return `+${(delta / 1000).toFixed(1)}s`;
  const m = Math.floor(delta / 60000);
  const s = Math.floor((delta % 60000) / 1000);
  return `+${m}m${s}s`;
}

function formatValue(value: unknown): string {
  if (value === undefined) return '—';
  if (typeof value === 'string') return `"${value.length > 20 ? `${value.slice(0, 20)}…` : value}"`;
  if (typeof value === 'object' && value !== null) return JSON.stringify(value).slice(0, 30);
  return String(value);
}

function valueColor(value: unknown): string {
  if (typeof value === 'string') return 'text-emerald-400';
  if (typeof value === 'number') return 'text-blue-400';
  if (typeof value === 'boolean') return 'text-amber-400';
  if (value === null || value === undefined) return 'text-muted-foreground italic';
  return 'text-zinc-300';
}

interface EventStreamProps {
  events: StateChange[];
  paused: boolean;
  bufferedCount: number;
  onSelect?: (item: DetailItem) => void;
  onResume?: () => void;
}

export function EventStream({
  events,
  paused,
  bufferedCount,
  onSelect,
  onResume,
}: EventStreamProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  // Auto-scroll to bottom when new events arrive
  const eventCount = events.length;
  // biome-ignore lint/correctness/useExhaustiveDependencies: eventCount triggers scroll on new events
  useEffect(() => {
    if (autoScroll && !paused && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [eventCount, autoScroll, paused]);

  const handleScroll = () => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    const atBottom = scrollHeight - scrollTop - clientHeight < 40;
    setAutoScroll(atBottom);
  };

  if (events.length === 0 && !paused) {
    return (
      <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
        No state changes recorded
      </div>
    );
  }

  return (
    <div className="relative h-full flex flex-col">
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto font-mono text-xs"
        onScroll={handleScroll}
      >
        {events.map((event, i) => {
          const prevTimestamp = i > 0 ? events[i - 1].timestamp : undefined;
          const isRemove = event.removed === true;

          return (
            <button
              type="button"
              key={`${event.path}-${event.timestamp}-${i}`}
              className={`h-8 w-full px-2 flex items-center gap-2 hover:bg-accent/50 cursor-pointer transition-colors text-left border-l-2 ${
                isRemove ? 'border-red-500' : 'border-blue-500'
              }`}
              onClick={() => onSelect?.({ kind: 'event', data: event })}
            >
              <span className="text-[10px] text-muted-foreground tabular-nums w-14 shrink-0">
                {formatRelativeTime(event.timestamp, prevTimestamp)}
              </span>
              <span className="w-3 shrink-0">
                {isRemove ? '✕' : event.previousValue !== undefined ? '○' : '●'}
              </span>
              <span className="text-muted-foreground w-20 truncate shrink-0">{event.domain}</span>
              <span className="text-foreground w-32 truncate shrink-0">{event.property}</span>
              <span
                className={`truncate flex-1 ${isRemove ? 'text-muted-foreground italic' : valueColor(event.value)}`}
              >
                {isRemove ? '— removed —' : formatValue(event.value)}
              </span>
            </button>
          );
        })}
      </div>

      {/* Paused banner */}
      {paused && (
        <button
          type="button"
          onClick={onResume}
          className="sticky bottom-0 w-full bg-background/90 backdrop-blur text-xs text-amber-400 py-1.5 px-3 cursor-pointer border-t border-border text-center"
        >
          ⏸ Paused {bufferedCount > 0 && `(${bufferedCount} buffered)`} — click to resume
        </button>
      )}

      {/* New events banner (when scrolled up) */}
      {!autoScroll && !paused && events.length > 0 && (
        <button
          type="button"
          onClick={() => {
            setAutoScroll(true);
            if (scrollRef.current) {
              scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
            }
          }}
          className="sticky bottom-0 w-full bg-background/90 backdrop-blur text-xs text-blue-400 py-1.5 px-3 cursor-pointer border-t border-border text-center"
        >
          ↓ Scroll to latest
        </button>
      )}
    </div>
  );
}
