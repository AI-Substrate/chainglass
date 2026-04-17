'use client';

import { useCallback, useEffect, useState } from 'react';

const KEYBOARD_THRESHOLD = 150;

export interface KeyboardOpenState {
  /** Whether the virtual keyboard is likely open */
  isOpen: boolean;
  /** Estimated keyboard height in pixels */
  keyboardHeight: number;
  /** Y position (in CSS px) where a toolbar should be placed — bottom of visible viewport */
  toolbarTop: number | null;
}

/**
 * useKeyboardOpen — detects virtual keyboard open/close via visualViewport API.
 *
 * Returns `{ isOpen, keyboardHeight, toolbarTop }`. The keyboard is considered
 * open when the viewport shrinks by more than 150px from window.innerHeight
 * (the threshold distinguishes keyboard from browser chrome changes).
 *
 * `toolbarTop` is the Y coordinate (from document top) for positioning a
 * fixed toolbar at the bottom of the visible area — above the keyboard AND
 * any browser chrome (iOS Safari form accessory bar, address bar).
 *
 * No-op on desktop or when visualViewport is unavailable.
 *
 * Plan 078: Mobile Experience — Phase 2
 */
export function useKeyboardOpen(): KeyboardOpenState {
  const [state, setState] = useState<KeyboardOpenState>({
    isOpen: false,
    keyboardHeight: 0,
    toolbarTop: null,
  });

  const handleResize = useCallback(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const offset = Math.max(0, Math.round(window.innerHeight - vv.height));
    setState({
      isOpen: offset > KEYBOARD_THRESHOLD,
      keyboardHeight: offset,
      toolbarTop: Math.round(vv.offsetTop + vv.height),
    });
  }, []);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    handleResize();
    vv.addEventListener('resize', handleResize);
    vv.addEventListener('scroll', handleResize);
    return () => {
      vv.removeEventListener('resize', handleResize);
      vv.removeEventListener('scroll', handleResize);
    };
  }, [handleResize]);

  return state;
}
