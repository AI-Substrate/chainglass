'use client';

/**
 * Plan 056: useStateInspector Hook
 *
 * Composes domain listing, current entries, diagnostics, and event stream
 * controls (pause/resume/clear) into a single hook for the inspector panel.
 *
 * Uses useState + subscribe for state system data instead of useSyncExternalStore,
 * because listDomains() and list('*') return new arrays on every call.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { useStateSystem } from '@/lib/state';
import type { StateChange, StateDomainDescriptor, StateEntry } from '@chainglass/shared/state';
import { useStateChangeLog } from './use-state-change-log';

export interface StateInspectorData {
  domains: StateDomainDescriptor[];
  entries: StateEntry[];
  logEntries: StateChange[];
  subscriberCount: number;
  entryCount: number;
  domainCount: number;
  logSize: number;
  logCapacity: number;
  paused: boolean;
  bufferedCount: number;
  domainFilter: string | null;
  setPaused: (paused: boolean) => void;
  clearStream: () => void;
  setDomainFilter: (domain: string | null) => void;
}

export function useStateInspector(): StateInspectorData {
  const system = useStateSystem();
  const [paused, setPaused] = useState(false);
  const [domainFilter, setDomainFilter] = useState<string | null>(null);
  const [cleared, setCleared] = useState(false);
  const clearedAtVersionRef = useRef(0);

  // Snapshot state — updated via subscribe callback
  const [domains, setDomains] = useState<StateDomainDescriptor[]>(() => system.listDomains());
  const [entries, setEntries] = useState<StateEntry[]>(() => system.list('*'));
  const [subscriberCount, setSubscriberCount] = useState(() => system.subscriberCount);
  const [entryCount, setEntryCount] = useState(() => system.entryCount);

  // Subscribe to all state changes and refresh snapshots
  useEffect(() => {
    const refresh = () => {
      setDomains(system.listDomains());
      setEntries(system.list('*'));
      setSubscriberCount(system.subscriberCount);
      setEntryCount(system.entryCount);
    };
    const unsub = system.subscribe('*', refresh);
    // Refresh on mount in case state changed between render and effect
    refresh();
    return unsub;
  }, [system]);

  // Log entries — filtered by domain if set
  const logPattern = domainFilter ? `${domainFilter}:**` : undefined;
  const allLogEntries = useStateChangeLog(logPattern);

  // Apply clear filter — only show entries after the clear point
  const logEntries = cleared
    ? allLogEntries.filter((_, i) => i >= clearedAtVersionRef.current)
    : allLogEntries;

  const clearStream = useCallback(() => {
    clearedAtVersionRef.current = allLogEntries.length;
    setCleared(true);
  }, [allLogEntries.length]);

  return {
    domains,
    entries: domainFilter ? entries.filter((e) => e.path.startsWith(`${domainFilter}:`)) : entries,
    logEntries: paused ? [] : logEntries,
    subscriberCount,
    entryCount,
    domainCount: domains.length,
    logSize: allLogEntries.length,
    logCapacity: 500,
    paused,
    bufferedCount: paused ? logEntries.length : 0,
    domainFilter,
    setPaused,
    clearStream,
    setDomainFilter,
  };
}
