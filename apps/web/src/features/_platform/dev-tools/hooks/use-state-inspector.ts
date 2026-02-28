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
 * FT-001: Clear uses timestamp marker, pause keeps pre-pause history visible.
 * FT-002: Refresh throttled via RAF to batch high-frequency updates.
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
  const [clearTimestamp, setClearTimestamp] = useState<number | null>(null);
  const pausedAtCountRef = useRef(0);

  // Snapshot state — updated via throttled subscribe callback
  const [domains, setDomains] = useState<StateDomainDescriptor[]>(() => system.listDomains());
  const [entries, setEntries] = useState<StateEntry[]>(() => system.list('*'));
  const [subscriberCount, setSubscriberCount] = useState(() => system.subscriberCount);
  const [entryCount, setEntryCount] = useState(() => system.entryCount);

  // FT-002: Throttle refresh via RAF to batch high-frequency updates
  useEffect(() => {
    let rafId: number | null = null;
    let pending = false;

    const refresh = () => {
      setDomains(system.listDomains());
      setEntries(system.list('*'));
      setSubscriberCount(system.subscriberCount);
      setEntryCount(system.entryCount);
      pending = false;
    };

    const onStateChange = () => {
      if (!pending) {
        pending = true;
        rafId = requestAnimationFrame(refresh);
      }
    };

    const unsub = system.subscribe('*', onStateChange);
    // Also poll domains since registerDomain() doesn't notify subscribers
    const domainPoll = setInterval(() => {
      setDomains(system.listDomains());
    }, 1000);
    refresh();
    return () => {
      unsub();
      clearInterval(domainPoll);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [system]);

  // Log entries — no pattern filter at hook level, filter in-memory for multi-select
  const allLogEntries = useStateChangeLog();

  // FT-001: Apply clear (timestamp-based) + domain filters
  let logEntries = allLogEntries;
  if (clearTimestamp !== null) {
    logEntries = logEntries.filter((e) => e.timestamp > clearTimestamp);
  }
  if (domainFilters.size > 0) {
    logEntries = logEntries.filter((e) => domainFilters.has(e.domain));
  }

  // Track pause snapshot count
  const handlePause = useCallback(
    (value: boolean) => {
      if (value) {
        pausedAtCountRef.current = logEntries.length;
      }
      setPaused(value);
    },
    [logEntries.length]
  );

  const bufferedCount = paused ? Math.max(0, logEntries.length - pausedAtCountRef.current) : 0;

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
    setClearTimestamp(Date.now());
  }, []);

  return {
    domains,
    entries:
      domainFilters.size > 0
        ? entries.filter((e) => matchesDomainFilters(e.path, domainFilters))
        : entries,
    logEntries,
    subscriberCount,
    entryCount,
    domainCount: domains.length,
    logSize: allLogEntries.length,
    logCapacity: 500,
    paused,
    bufferedCount,
    domainFilters,
    toggleDomainFilter,
    clearDomainFilters,
    setPaused: handlePause,
    clearStream,
  };
}
