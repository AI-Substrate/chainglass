/**
 * pij overlay — context + hook — Plan 089 Phase 4 (T003).
 *
 * The fifth F-14 sibling, copied from `use-pr-view-overlay.tsx` rather than reinvented. Three
 * details in here are load-bearing and each exists because of a bug someone already had:
 *
 * - **`isOpeningRef` (PL-08).** Opening dispatches `overlay:close-all` for mutual exclusion (Plan
 *   065), and this provider listens for that same event. Without the guard the open closes itself.
 * - **The state lives HERE, in the always-mounted provider**, never in the lazily-mounted panel. The
 *   panel is a `dynamic(ssr:false)` import that unmounts; a route change inside the workspace would
 *   take the open/closed flag with it, and the overlay would silently shut whenever the user
 *   navigated (AC-12's "survives navigation").
 * - **The toggle listens for a CustomEvent**, because the sidebar sits OUTSIDE the overlay providers
 *   and cannot reach this context directly. The event is the seam.
 *
 * Deliberately NOT copied from `question-popper`: that sibling is missing `isOpeningRef`, its z-index
 * and its anchor measurement, and is a known outlier rather than a fourth pattern.
 */
'use client';

import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';

interface PijOverlayState {
  isOpen: boolean;
  /** The absolute workspace path the fleet read is scoped to. A path, never a slug. */
  workspacePath: string | null;
}

interface PijOverlayContextValue extends PijOverlayState {
  openPij: (workspacePath?: string) => void;
  closePij: () => void;
  togglePij: (workspacePath?: string) => void;
}

const PijOverlayContext = createContext<PijOverlayContextValue | null>(null);

interface PijOverlayProviderProps {
  children: ReactNode;
  /** The workspace path resolved by the layout. `?worktree=` overrides it at toggle time. */
  defaultWorkspacePath?: string;
}

export function PijOverlayProvider({ children, defaultWorkspacePath }: PijOverlayProviderProps) {
  const [state, setState] = useState<PijOverlayState>({
    isOpen: false,
    workspacePath: defaultWorkspacePath ?? null,
  });

  // PL-08: prevents the open from closing itself when it dispatches overlay:close-all.
  const isOpeningRef = useRef(false);
  const stateRef = useRef(state);
  stateRef.current = state;

  const closePij = useCallback(() => {
    setState((prev) => (prev.isOpen ? { ...prev, isOpen: false } : prev));
  }, []);

  /** Resolve the scope the same way the pij page does: `?worktree=` wins, then the layout's path. */
  const resolvePath = useCallback((requested?: string): string | null => {
    const params = new URLSearchParams(window.location.search);
    return requested ?? params.get('worktree') ?? stateRef.current.workspacePath;
  }, []);

  const openPij = useCallback(
    (workspacePath?: string) => {
      const resolved = resolvePath(workspacePath);
      if (!resolved) {
        console.warn('[pij-overlay] Cannot open: no workspace path resolved');
        return;
      }
      isOpeningRef.current = true;
      window.dispatchEvent(new CustomEvent('overlay:close-all'));
      isOpeningRef.current = false;
      setState({ isOpen: true, workspacePath: resolved });
    },
    [resolvePath]
  );

  const togglePij = useCallback(
    (workspacePath?: string) => {
      if (stateRef.current.isOpen) {
        setState((prev) => ({ ...prev, isOpen: false }));
        return;
      }
      openPij(workspacePath);
    },
    [openPij]
  );

  // The sidebar and the SDK command both reach us this way — they live outside this provider.
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      togglePij(detail?.workspacePath);
    };
    window.addEventListener('pij:toggle', handler);
    return () => window.removeEventListener('pij:toggle', handler);
  }, [togglePij]);

  // Mutual exclusion (Plan 065): someone else opening closes us — unless the someone is us.
  useEffect(() => {
    const handler = () => {
      if (isOpeningRef.current) return;
      closePij();
    };
    window.addEventListener('overlay:close-all', handler);
    return () => window.removeEventListener('overlay:close-all', handler);
  }, [closePij]);

  return (
    <PijOverlayContext.Provider value={{ ...state, openPij, closePij, togglePij }}>
      {children}
    </PijOverlayContext.Provider>
  );
}

export function usePijOverlay(): PijOverlayContextValue {
  const context = useContext(PijOverlayContext);
  if (!context) {
    throw new Error('usePijOverlay must be used within a PijOverlayProvider');
  }
  return context;
}
