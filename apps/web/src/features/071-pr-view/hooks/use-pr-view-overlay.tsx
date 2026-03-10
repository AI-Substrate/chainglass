'use client';

/**
 * PR View Overlay — Context + Hook
 *
 * Provides overlay state management for the PR View panel.
 * Dispatches overlay:close-all before opening (mutual exclusion with
 * terminal, activity-log, notes, and agent overlays). Uses isOpeningRef
 * guard to prevent self-close when dispatching overlay:close-all (PL-08).
 *
 * Plan 071: PR View & File Notes — Phase 5, T001
 */

import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';

interface PRViewOverlayState {
  isOpen: boolean;
  worktreePath: string | null;
}

interface PRViewOverlayContextValue extends PRViewOverlayState {
  openPRView: (worktreePath: string) => void;
  closePRView: () => void;
  togglePRView: (worktreePath?: string) => void;
}

const PRViewOverlayContext = createContext<PRViewOverlayContextValue | null>(null);

interface PRViewOverlayProviderProps {
  children: ReactNode;
  defaultWorktreePath?: string;
}

export function PRViewOverlayProvider({
  children,
  defaultWorktreePath,
}: PRViewOverlayProviderProps) {
  const [state, setState] = useState<PRViewOverlayState>({
    isOpen: false,
    worktreePath: defaultWorktreePath ?? null,
  });

  // PL-08: Guard to prevent self-close when dispatching overlay:close-all
  const isOpeningRef = useRef(false);
  const stateRef = useRef(state);
  stateRef.current = state;

  const closePRView = useCallback(() => {
    setState((prev) => (prev.isOpen ? { ...prev, isOpen: false } : prev));
  }, []);

  const openPRView = useCallback((worktreePath: string) => {
    isOpeningRef.current = true;
    window.dispatchEvent(new CustomEvent('overlay:close-all'));
    isOpeningRef.current = false;
    setState({ isOpen: true, worktreePath });
  }, []);

  const togglePRView = useCallback((worktreePath?: string) => {
    const prev = stateRef.current;
    if (prev.isOpen) {
      setState({ ...prev, isOpen: false });
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const urlWorktree = params.get('worktree');
    const resolved = worktreePath ?? urlWorktree ?? prev.worktreePath;

    if (!resolved) {
      console.warn('[pr-view-overlay] Cannot open: no worktree path resolved');
      return;
    }

    isOpeningRef.current = true;
    window.dispatchEvent(new CustomEvent('overlay:close-all'));
    isOpeningRef.current = false;

    setState({ isOpen: true, worktreePath: resolved });
  }, []);

  // Listen for pr-view:toggle events (from sidebar / SDK)
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      togglePRView(detail?.worktreePath);
    };
    window.addEventListener('pr-view:toggle', handler);
    return () => window.removeEventListener('pr-view:toggle', handler);
  }, [togglePRView]);

  // Listen for overlay:close-all (mutual exclusion)
  useEffect(() => {
    const handler = () => {
      if (isOpeningRef.current) return; // PL-08: skip self-close
      closePRView();
    };
    window.addEventListener('overlay:close-all', handler);
    return () => window.removeEventListener('overlay:close-all', handler);
  }, [closePRView]);

  return (
    <PRViewOverlayContext.Provider
      value={{
        ...state,
        openPRView,
        closePRView,
        togglePRView,
      }}
    >
      {children}
    </PRViewOverlayContext.Provider>
  );
}

export function usePRViewOverlay(): PRViewOverlayContextValue {
  const context = useContext(PRViewOverlayContext);
  if (!context) {
    throw new Error('usePRViewOverlay must be used within a PRViewOverlayProvider');
  }
  return context;
}
