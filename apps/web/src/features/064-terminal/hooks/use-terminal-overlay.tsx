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
}

export function TerminalOverlayProvider({ children }: TerminalOverlayProviderProps) {
  const [state, setState] = useState<TerminalOverlayState>({
    isOpen: false,
    sessionName: null,
    cwd: null,
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

      // DYK-03: Derive session/cwd from URL if not provided
      let resolvedSession = sessionName ?? prev.sessionName;
      let resolvedCwd = cwd ?? prev.cwd;

      if (!resolvedSession || !resolvedCwd) {
        const params = new URLSearchParams(window.location.search);
        const worktree = params.get('worktree');
        if (worktree) {
          resolvedCwd = resolvedCwd ?? worktree;
          resolvedSession = resolvedSession ?? worktree.split('/').pop() ?? null;
        }
      }

      if (!resolvedSession || !resolvedCwd) {
        return prev; // Can't open without session info
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
