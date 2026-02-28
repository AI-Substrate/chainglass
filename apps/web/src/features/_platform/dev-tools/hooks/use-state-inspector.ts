'use client';

/**
 * Plan 056: useStateInspector Hook
 *
 * Composes domain listing, current entries, diagnostics, and event stream
 * controls (pause/resume/clear) into a single hook for the inspector panel.
 *
 * Uses useState + subscribe for state system data instead of useSyncExternalStore,
 * because listDomains() and list('*') return new arrays on every call.
 *
 * Domain filtering supports multi-select (Set of domain names).
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
  domainFilters: Set<string>;
  toggleDomainFilter: (domain: string) => void;
  clearDomainFilters: () => void;
  setPaused: (paused: boolean) => void;
  clearStream: () => void;
}

function matchesDomainFilters(path: string, filters: Set<string>): boolean {
  if (filters.size === 0) return true;
  const domain = path.split(':')[0];
  return filters.has(domain);
}

export function useStateInspector(): StateInspectorData {
  const system = useStateSystem();
  const [paused, setPaused] = useState(false);
  const [domainFilters, setDomainFilters] = useState<Set<string>>(new Set());
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
    refresh();
    return unsub;
  }, [system]);

  // Log entries — no pattern filter at hook level, filter in-memory for multi-select
  const allLogEntries = useStateChangeLog();

  // Apply domain + clear filters
  let logEntries = allLogEntries;
  if (cleared) {
    logEntries = logEntries.filter((_, i) => i >= clearedAtVersionRef.current);
  }
  if (domainFilters.size > 0) {
    logEntries = logEntries.filter((e) => domainFilters.has(e.domain));
  }

  const toggleDomainFilter = useCallback((domain: string) => {
    setDomainFilters((prev) => {
      const next = new Set(prev);
      if (next.has(domain)) next.delete(domain);
      else next.add(domain);
      return next;
    });
  }, []);

  const clearDomainFilters = useCallback(() => {
    setDomainFilters(new Set());
  }, []);

  const clearStream = useCallback(() => {
    clearedAtVersionRef.current = allLogEntries.length;
    setCleared(true);
  }, [allLogEntries.length]);

  return {
    domains,
    entries:
      domainFilters.size > 0
        ? entries.filter((e) => matchesDomainFilters(e.path, domainFilters))
        : entries,
    logEntries: paused ? [] : logEntries,
    subscriberCount,
    entryCount,
    domainCount: domains.length,
    logSize: allLogEntries.length,
    logCapacity: 500,
    paused,
    bufferedCount: paused ? logEntries.length : 0,
    domainFilters,
    toggleDomainFilter,
    clearDomainFilters,
    setPaused,
    clearStream,
  };
}
