'use client';

/**
 * Plan 056: EntryDetail Component
 *
 * Side panel showing full JSON value, domain descriptor context.
 * Accepts discriminated union (DYK-34): StateEntry or StateChange.
 * AC-18: full JSON, AC-19: previousValue for events, AC-20: domain context.
 */

import type { StateChange, StateDomainDescriptor, StateEntry } from '@chainglass/shared/state';

export type DetailItem = { kind: 'entry'; data: StateEntry } | { kind: 'event'; data: StateChange };

function valueColor(value: unknown): string {
  if (typeof value === 'string') return 'text-emerald-400';
  if (typeof value === 'number') return 'text-blue-400';
  if (typeof value === 'boolean') return 'text-amber-400';
  if (value === null || value === undefined) return 'text-muted-foreground italic';
  return 'text-zinc-300';
}

function renderValue(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  return String(value);
}

interface EntryDetailProps {
  item: DetailItem | null;
  domains: StateDomainDescriptor[];
}

export function EntryDetail({ item, domains }: EntryDetailProps) {
  if (!item) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        Select an entry to inspect
      </div>
    );
  }

  const path = item.kind === 'entry' ? item.data.path : item.data.path;
  const segments = path.split(':');
  const domainName = segments[0];
  const descriptor = domains.find((d) => d.domain === domainName);
  const value = item.data.value;

  return (
    <div className="p-3 text-sm space-y-4 overflow-y-auto h-full">
      {/* Path */}
      <div>
        <span className="text-[10px] text-muted-foreground uppercase font-sans font-medium">
          Path
        </span>
        <p className="font-mono text-xs mt-0.5">{path}</p>
      </div>

      {/* Parsed segments */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs font-mono">
        <span className="text-muted-foreground">Domain</span>
        <span>{domainName}</span>
        {segments.length === 3 && (
          <>
            <span className="text-muted-foreground">Instance</span>
            <span>{segments[1]}</span>
          </>
        )}
        <span className="text-muted-foreground">Property</span>
        <span>{segments[segments.length - 1]}</span>
      </div>

      {/* Timestamp */}
      <div>
        <span className="text-[10px] text-muted-foreground uppercase font-sans font-medium">
          {item.kind === 'entry' ? 'Last Updated' : 'Timestamp'}
        </span>
        <p className="font-mono text-xs mt-0.5">
          {new Date(
            item.kind === 'entry' ? item.data.updatedAt : item.data.timestamp
          ).toISOString()}
        </p>
      </div>

      {/* Value */}
      <div>
        <span className="text-[10px] text-muted-foreground uppercase font-sans font-medium">
          Value
        </span>
        <pre
          className={`font-mono text-xs mt-0.5 whitespace-pre-wrap break-all ${valueColor(value)}`}
        >
          {renderValue(value)}
        </pre>
      </div>

      {/* Previous Value (events only — DYK-34) */}
      {item.kind === 'event' && item.data.previousValue !== undefined && (
        <div>
          <span className="text-[10px] text-muted-foreground uppercase font-sans font-medium">
            Previous Value
          </span>
          <pre
            className={`font-mono text-xs mt-0.5 whitespace-pre-wrap break-all ${valueColor(item.data.previousValue)}`}
          >
            {renderValue(item.data.previousValue)}
          </pre>
        </div>
      )}

      {/* Removed flag */}
      {item.kind === 'event' && item.data.removed && (
        <div className="text-xs text-red-400 font-medium">✕ Entry removed</div>
      )}

      {/* Domain context */}
      {descriptor && (
        <div className="border-t border-border pt-3">
          <span className="text-[10px] text-muted-foreground uppercase font-sans font-medium">
            Domain Info
          </span>
          <div className="mt-1 space-y-1 text-xs">
            <p>
              <span className="font-medium">{descriptor.domain}</span>
              <span className="text-muted-foreground ml-2">
                ({descriptor.multiInstance ? 'multi-instance' : 'singleton'})
              </span>
            </p>
            <p className="text-muted-foreground">{descriptor.description}</p>
            <p className="text-muted-foreground">
              Properties: {descriptor.properties.map((p) => p.key).join(', ')}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
