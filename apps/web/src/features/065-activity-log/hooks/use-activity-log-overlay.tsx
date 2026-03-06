'use client';

/**
 * Activity Log Overlay — Context + Hook
 *
 * Provides overlay state management for the activity log panel.
 * Dispatches overlay:close-all before opening (mutual exclusion with
 * terminal and agent overlays). Uses isOpening ref guard to prevent
 * self-close when dispatching overlay:close-all (DYK-01).
 *
 * Plan 065: Worktree Activity Log — Phase 3
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

interface ActivityLogOverlayState {
  isOpen: boolean;
  worktreePath: string | null;
}

interface ActivityLogOverlayContextValue extends ActivityLogOverlayState {
  openActivityLog: (worktreePath: string) => void;
  closeActivityLog: () => void;
  toggleActivityLog: (worktreePath?: string) => void;
}

const ActivityLogOverlayContext = createContext<ActivityLogOverlayContextValue | null>(null);

interface ActivityLogOverlayProviderProps {
  children: ReactNode;
  defaultWorktreePath?: string;
}

export function ActivityLogOverlayProvider({
  children,
  defaultWorktreePath,
}: ActivityLogOverlayProviderProps) {
  const [state, setState] = useState<ActivityLogOverlayState>({
    isOpen: false,
    worktreePath: defaultWorktreePath ?? null,
  });

  // DYK-01: Guard to prevent self-close when dispatching overlay:close-all
  const isOpeningRef = useRef(false);
  // Track isOpen in a ref so toggleActivityLog can read it outside setState
  const stateRef = useRef(state);
  stateRef.current = state;

  const closeActivityLog = useCallback(() => {
    setState((prev) => (prev.isOpen ? { ...prev, isOpen: false } : prev));
  }, []);

  const openActivityLog = useCallback((worktreePath: string) => {
    isOpeningRef.current = true;
    window.dispatchEvent(new CustomEvent('overlay:close-all'));
    isOpeningRef.current = false;
    setState({ isOpen: true, worktreePath });
  }, []);

  const toggleActivityLog = useCallback((worktreePath?: string) => {
    const prev = stateRef.current;
    if (prev.isOpen) {
      setState({ ...prev, isOpen: false });
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const urlWorktree = params.get('worktree');
    const resolved = worktreePath ?? urlWorktree ?? prev.worktreePath;

    if (!resolved) {
      console.warn('[activity-log-overlay] Cannot open: no worktree path resolved');
      return;
    }

    // Dispatch close-all OUTSIDE setState to avoid cross-component setState during render
    isOpeningRef.current = true;
    window.dispatchEvent(new CustomEvent('overlay:close-all'));
    isOpeningRef.current = false;

    setState({ isOpen: true, worktreePath: resolved });
  }, []);

  // Listen for activity-log:toggle events (from sidebar / SDK)
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      toggleActivityLog(detail?.worktreePath);
    };
    window.addEventListener('activity-log:toggle', handler);
    return () => window.removeEventListener('activity-log:toggle', handler);
  }, [toggleActivityLog]);

  // Listen for overlay:close-all (mutual exclusion with terminal/agent overlays)
  useEffect(() => {
    const handler = () => {
      if (isOpeningRef.current) return; // DYK-01: skip self-close
      closeActivityLog();
    };
    window.addEventListener('overlay:close-all', handler);
    return () => window.removeEventListener('overlay:close-all', handler);
  }, [closeActivityLog]);

  return (
    <ActivityLogOverlayContext.Provider
      value={{ ...state, openActivityLog, closeActivityLog, toggleActivityLog }}
    >
      {children}
    </ActivityLogOverlayContext.Provider>
  );
}

export function useActivityLogOverlay(): ActivityLogOverlayContextValue {
  const context = useContext(ActivityLogOverlayContext);
  if (!context) {
    throw new Error('useActivityLogOverlay must be used within an ActivityLogOverlayProvider');
  }
  return context;
}
