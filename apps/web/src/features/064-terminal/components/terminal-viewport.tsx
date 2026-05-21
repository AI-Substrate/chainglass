'use client';

/**
 * TerminalViewport — a slot div the singleton's xterm host gets `appendChild`'d
 * into when `active` is true.
 *
 * FX012 (Plan 084 random-enhancements-3): three surfaces (floating overlay,
 * inline split's right ⅓, `/terminal` page) render this primitive. Activation
 * is LIFO inside the singleton; in practice the state machine guarantees only
 * one viewport is `active` at a time, but LIFO is the safety net.
 *
 * Do NOT render React children inside the slot — the singleton injects DOM
 * children via `appendChild` and React's reconciler would remove them.
 */

import { useLayoutEffect, useRef } from 'react';
import { useTerminalSingleton } from './terminal-singleton-provider';

export interface TerminalViewportProps {
  /** Unique slot id, e.g. 'overlay', 'inline-3rd', 'terminal-page'. */
  id: string;
  /** When true, this viewport claims the singleton's xterm. */
  active: boolean;
}

export function TerminalViewport({ id, active }: TerminalViewportProps) {
  const slotRef = useRef<HTMLDivElement>(null);
  const { activate, deactivate, registerSlot } = useTerminalSingleton();

  // Register the slot before activate runs (layout-effect order: this one first).
  useLayoutEffect(() => {
    const el = slotRef.current;
    if (!el) return;
    registerSlot(id, el);
  }, [id, registerSlot]);

  // Activate / deactivate based on the active prop.
  useLayoutEffect(() => {
    if (!active) return;
    activate(id);
    return () => {
      deactivate(id);
    };
  }, [active, id, activate, deactivate]);

  // Empty slot — the singleton appendChild's the xterm host here.
  // Do NOT add React children: reconciliation would remove the xterm host.
  return (
    <div
      ref={slotRef}
      data-terminal-viewport-slot=""
      data-viewport-id={id}
      className="h-full w-full"
    />
  );
}
