'use client';

/**
 * TerminalSingletonProvider — one xterm DOM node, many viewports.
 *
 * FX012 (Plan 084 random-enhancements-3): the floating overlay, the inline
 * split's right ⅓, and the `/terminal` page all share ONE xterm instance.
 * Mount the provider once at the workspace `[slug]` layout. Each surface
 * renders a `<TerminalViewport id="..." active={...} />`; the singleton's
 * `useLayoutEffect` physically `appendChild`'s the xterm host DOM node from
 * the offscreen park into the active viewport's slot when `activeId` changes.
 *
 * Why offscreen (not `display:none`): xterm reads element dimensions on mount;
 * `display:none` returns 0×0 and xterm bails. Offscreen 1×1 keeps it happy.
 *
 * Mobile path (`MobilePanelShell`) keeps its own `<TerminalView>` — different
 * DOM tree, no shared singleton. Two `TerminalInner` instances total app-wide
 * (mobile + desktop singleton), never simultaneously visible.
 */

import dynamic from 'next/dynamic';
import {
  type CSSProperties,
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTerminalOverlay } from '../hooks/use-terminal-overlay';
import type { ConnectionStatus } from '../types';

const TerminalInnerLazy = dynamic(() => import('./terminal-inner'), { ssr: false });

interface TerminalSingletonContextValue {
  activate(id: string): void;
  deactivate(id: string): void;
  registerSlot(id: string, slotEl: HTMLElement): void;
  activeId: string | null;
  /**
   * Connection status of the singleton's underlying WS. Surfaced so the
   * `TerminalOverlayPanel` header badge keeps working after the panel stops
   * mounting its own `<TerminalInner>` and instead consumes the viewport.
   * Documented as an extension of the FX012 dossier's "exact shape" — see
   * Discoveries entry in the fix log.
   */
  connectionStatus: ConnectionStatus;
}

const TerminalSingletonContext = createContext<TerminalSingletonContextValue | null>(null);

export function useTerminalSingleton(): TerminalSingletonContextValue {
  const ctx = useContext(TerminalSingletonContext);
  if (!ctx) {
    throw new Error('useTerminalSingleton must be used within a TerminalSingletonProvider');
  }
  return ctx;
}

interface TerminalSingletonProviderProps {
  themeOverride?: 'dark' | 'light' | 'system';
  children: ReactNode;
}

const PARK_STYLE: CSSProperties = {
  position: 'absolute',
  left: -99999,
  top: -99999,
  width: 1,
  height: 1,
  overflow: 'hidden',
  pointerEvents: 'none',
};

export function TerminalSingletonProvider({
  themeOverride,
  children,
}: TerminalSingletonProviderProps) {
  // FX012 follow-up: sessionName/cwd are sourced from the overlay state so the
  // singleton tracks the user's chosen session (worktree-specific) instead of
  // a static workspace-default locked in at provider mount. Callers that drive
  // the singleton without opening the float (inline split, /terminal page
  // session-selector) must call `overlay.setSessionContext(name, cwd)` before
  // activating their viewport — `openTerminal` and `toggleTerminal` already do.
  const { sessionName, cwd } = useTerminalOverlay();
  const [activeId, setActiveId] = useState<string | null>(null);
  // Lazy-mount gate — TerminalInner doesn't mount (and the WS doesn't
  // connect) until the first viewport activates. Preserves Plan 084 / pre-
  // FX012 behavior: workspaces the user never opens a terminal on stay
  // disconnected. Once activated, stays mounted — subsequent deactivations
  // park the xterm offscreen but keep the WS / scrollback alive.
  const [hasActivated, setHasActivated] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const parkRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const slotsRef = useRef<Map<string, HTMLElement>>(new Map());

  // LIFO activation — latest activator wins. Also flips hasActivated true
  // on first activation so the inner xterm mounts lazily.
  const activate = useCallback((id: string) => {
    setActiveId(id);
    setHasActivated(true);
  }, []);

  const deactivate = useCallback((id: string) => {
    setActiveId((prev) => (prev === id ? null : prev));
  }, []);

  const registerSlot = useCallback((id: string, el: HTMLElement) => {
    slotsRef.current.set(id, el);
  }, []);

  // Reparent the xterm host into the active viewport's slot (or back to park).
  // React doesn't actively re-attach the host on its own re-renders; the JSX
  // structure is stable so the reconciler leaves DOM parent-child untouched.
  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const target = activeId == null ? parkRef.current : slotsRef.current.get(activeId);
    if (!target) return;
    if (host.parentElement === target) return;
    target.appendChild(host);
    // ResizeObserver inside TerminalInner observes its container element
    // directly; reparenting changes the container's bounding rect, which the
    // observer should pick up on the next frame. If KF-03 fails in-impl, add
    // an explicit fit() call here via a ref forwarded from TerminalInner.
    window.dispatchEvent(new CustomEvent('terminal:viewport-changed', { detail: { activeId } }));
  }, [activeId]);

  const ctxValue = useMemo<TerminalSingletonContextValue>(
    () => ({ activate, deactivate, registerSlot, activeId, connectionStatus }),
    [activate, deactivate, registerSlot, activeId, connectionStatus]
  );

  const ready = Boolean(sessionName && cwd) && hasActivated;

  return (
    <TerminalSingletonContext.Provider value={ctxValue}>
      <div ref={parkRef} data-terminal-park="" aria-hidden="true" style={PARK_STYLE}>
        {ready ? (
          <div ref={hostRef} className="h-full w-full" data-terminal-singleton-host="">
            <TerminalInnerLazy
              sessionName={sessionName as string}
              cwd={cwd as string}
              themeOverride={themeOverride}
              onConnectionChange={setConnectionStatus}
              isVisible={activeId !== null}
            />
          </div>
        ) : null}
      </div>
      {children}
    </TerminalSingletonContext.Provider>
  );
}
