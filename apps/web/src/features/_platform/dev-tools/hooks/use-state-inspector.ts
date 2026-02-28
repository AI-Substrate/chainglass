'use client';

/**
 * Plan 056: useStateInspector Hook
 *
 * Composes domain listing, current entries, diagnostics, and event stream
 * controls (pause/resume/clear) into a single hook for the inspector panel.
 */

import { useCallback, useRef, useState, useSyncExternalStore } from 'react';

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

  // Subscribe to system changes for re-rendering diagnostics
  const subscribe = useCallback(
    (onStoreChange: () => void) => system.subscribe('*', onStoreChange),
    [system]
  );
  const getDomains = useCallback(() => system.listDomains(), [system]);
  const getEntries = useCallback(() => system.list('*'), [system]);
  const getSubCount = useCallback(() => system.subscriberCount, [system]);
  const getEntryCount = useCallback(() => system.entryCount, [system]);

  const domains = useSyncExternalStore(subscribe, getDomains, getDomains);
  const entries = useSyncExternalStore(subscribe, getEntries, getEntries);
  const subscriberCount = useSyncExternalStore(subscribe, getSubCount, getSubCount);
  const entryCount = useSyncExternalStore(subscribe, getEntryCount, getEntryCount);

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
