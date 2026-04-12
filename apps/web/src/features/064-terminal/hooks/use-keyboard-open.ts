'use client';

import { useCallback, useEffect, useState } from 'react';

const KEYBOARD_THRESHOLD = 150;

export interface KeyboardOpenState {
  /** Whether the virtual keyboard is likely open */
  isOpen: boolean;
  /** Estimated keyboard height in pixels */
  keyboardHeight: number;
}

/**
 * useKeyboardOpen — detects virtual keyboard open/close via visualViewport API.
 *
 * Returns `{ isOpen, keyboardHeight }`. The keyboard is considered open when
 * the viewport shrinks by more than 150px from window.innerHeight (the threshold
 * distinguishes keyboard from browser chrome changes).
 *
 * No-op on desktop or when visualViewport is unavailable.
 *
 * Plan 078: Mobile Experience — Phase 2
 */
export function useKeyboardOpen(): KeyboardOpenState {
  const [state, setState] = useState<KeyboardOpenState>({ isOpen: false, keyboardHeight: 0 });

  const handleResize = useCallback(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const offset = Math.max(0, Math.round(window.innerHeight - vv.height));
    setState({
      isOpen: offset > KEYBOARD_THRESHOLD,
      keyboardHeight: offset,
    });
  }, []);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    handleResize();
    vv.addEventListener('resize', handleResize);
    return () => vv.removeEventListener('resize', handleResize);
  }, [handleResize]);

  return state;
}
