'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { TerminalSession } from '../types';

interface UseTerminalSessionsOptions {
  currentBranch: string;
}

interface UseTerminalSessionsReturn {
  sessions: TerminalSession[];
  loading: boolean;
  tmuxAvailable: boolean;
  selectedSession: string | null;
  setSelectedSession: (name: string) => void;
  refresh: () => void;
}

export function useTerminalSessions({
  currentBranch,
}: UseTerminalSessionsOptions): UseTerminalSessionsReturn {
  const [sessions, setSessions] = useState<TerminalSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [tmuxAvailable, setTmuxAvailable] = useState(true);
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const fetchSessions = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/terminal');
      if (!res.ok) return;

      const data = await res.json();
      if (!mountedRef.current) return;

      setTmuxAvailable(data.tmux !== false);

      const enriched: TerminalSession[] = (data.sessions ?? []).map(
        (s: { name: string; attached: number; windows: number; created: number }) => ({
          ...s,
          isCurrentWorktree: s.name === currentBranch,
        })
      );

      setSessions(enriched);

      // Auto-select current worktree session if no selection yet
      if (!selectedSession) {
        const current = enriched.find((s: TerminalSession) => s.isCurrentWorktree);
        if (current) {
          setSelectedSession(current.name);
        } else if (enriched.length > 0) {
          setSelectedSession(enriched[0].name);
        }
      }
    } catch {
      // Network error — leave sessions as-is
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [currentBranch, selectedSession]);

  // DYK-03: Fetch on mount + refetch on window focus
  useEffect(() => {
    mountedRef.current = true;
    fetchSessions();

    const onFocus = () => fetchSessions();
    window.addEventListener('focus', onFocus);

    return () => {
      mountedRef.current = false;
      window.removeEventListener('focus', onFocus);
    };
  }, [fetchSessions]);

  return {
    sessions,
    loading,
    tmuxAvailable,
    selectedSession,
    setSelectedSession,
    refresh: fetchSessions,
  };
}
