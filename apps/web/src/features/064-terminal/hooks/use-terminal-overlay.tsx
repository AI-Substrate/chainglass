'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';

interface TerminalOverlayState {
  isOpen: boolean;
  sessionName: string | null;
  cwd: string | null;
}

interface TerminalOverlayContextValue extends TerminalOverlayState {
  openTerminal: (sessionName: string, cwd: string) => void;
  closeTerminal: () => void;
  toggleTerminal: (sessionName?: string, cwd?: string) => void;
}

const TerminalOverlayContext = createContext<TerminalOverlayContextValue | null>(null);

interface TerminalOverlayProviderProps {
  children: ReactNode;
  defaultSessionName?: string;
  defaultCwd?: string;
}

export function TerminalOverlayProvider({
  children,
  defaultSessionName,
  defaultCwd,
}: TerminalOverlayProviderProps) {
  const [state, setState] = useState<TerminalOverlayState>({
    isOpen: false,
    sessionName: defaultSessionName ?? null,
    cwd: defaultCwd ?? null,
  });

  const openTerminal = useCallback((sessionName: string, cwd: string) => {
    setState({ isOpen: true, sessionName, cwd });
  }, []);

  const closeTerminal = useCallback(() => {
    setState((prev) => ({ ...prev, isOpen: false }));
  }, []);

  const toggleTerminal = useCallback((sessionName?: string, cwd?: string) => {
    setState((prev) => {
      if (prev.isOpen) {
        return { ...prev, isOpen: false };
      }

      // Always check URL params first — they reflect the current worktree context
      const params = new URLSearchParams(window.location.search);
      const worktree = params.get('worktree');

      let resolvedSession = sessionName ?? null;
      let resolvedCwd = cwd ?? null;

      if (worktree) {
        resolvedCwd = resolvedCwd ?? worktree;
        resolvedSession = resolvedSession ?? worktree.split('/').pop() ?? null;
      }

      // Fall back to prev state (which holds server-side defaults)
      resolvedSession = resolvedSession ?? prev.sessionName;
      resolvedCwd = resolvedCwd ?? prev.cwd;

      if (!resolvedSession || !resolvedCwd) {
        console.warn('[terminal-overlay] Cannot open: no session/cwd resolved');
        return prev;
      }

      return {
        isOpen: true,
        sessionName: resolvedSession,
        cwd: resolvedCwd,
      };
    });
  }, []);

  // DYK-05: Listen for SDK terminal:toggle events (sidebar is outside provider)
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      toggleTerminal(detail?.sessionName, detail?.cwd);
    };
    window.addEventListener('terminal:toggle', handler);
    return () => window.removeEventListener('terminal:toggle', handler);
  }, [toggleTerminal]);

  // DYK-01: Auto-close overlay when navigating to terminal page
  useEffect(() => {
    const checkRoute = () => {
      if (window.location.pathname.includes('/terminal')) {
        setState((prev) => (prev.isOpen ? { ...prev, isOpen: false } : prev));
      }
    };

    // Check on popstate (back/forward) and on any navigation
    window.addEventListener('popstate', checkRoute);

    // Also check periodically for SPA navigation (Next.js doesn't fire popstate)
    const interval = setInterval(checkRoute, 500);

    return () => {
      window.removeEventListener('popstate', checkRoute);
      clearInterval(interval);
    };
  }, []);

  return (
    <TerminalOverlayContext.Provider
      value={{ ...state, openTerminal, closeTerminal, toggleTerminal }}
    >
      {children}
    </TerminalOverlayContext.Provider>
  );
}

export function useTerminalOverlay(): TerminalOverlayContextValue {
  const context = useContext(TerminalOverlayContext);
  if (!context) {
    throw new Error('useTerminalOverlay must be used within a TerminalOverlayProvider');
  }
  return context;
}
