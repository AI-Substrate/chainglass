/**
 * useKeyboardOpen Tests — TDD
 *
 * Tests for the virtual keyboard detection hook using visualViewport API.
 *
 * @vitest-environment jsdom
 */

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useKeyboardOpen } from '../../../../../apps/web/src/features/064-terminal/hooks/use-keyboard-open';

describe('useKeyboardOpen', () => {
  let resizeHandler: (() => void) | null = null;
  let originalVisualViewport: VisualViewport | null;

  function createFakeViewport(height: number) {
    return {
      height,
      width: 390,
      offsetLeft: 0,
      offsetTop: 0,
      pageLeft: 0,
      pageTop: 0,
      scale: 1,
      addEventListener: vi.fn((event: string, handler: () => void) => {
        if (event === 'resize') resizeHandler = handler;
      }),
      removeEventListener: vi.fn((event: string, handler: () => void) => {
        if (event === 'resize' && resizeHandler === handler) resizeHandler = null;
      }),
      dispatchEvent: vi.fn(),
      onresize: null,
      onscroll: null,
      onscrollend: null,
    } as unknown as VisualViewport;
  }

  beforeEach(() => {
    originalVisualViewport = window.visualViewport;
    Object.defineProperty(window, 'innerHeight', {
      value: 844,
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'visualViewport', {
      value: originalVisualViewport,
      writable: true,
      configurable: true,
    });
    resizeHandler = null;
  });

  it('returns isOpen=false and keyboardHeight=0 when no keyboard', () => {
    Object.defineProperty(window, 'visualViewport', {
      value: createFakeViewport(844),
      writable: true,
      configurable: true,
    });
    const { result } = renderHook(() => useKeyboardOpen());
    expect(result.current.isOpen).toBe(false);
    expect(result.current.keyboardHeight).toBe(0);
  });

  it('returns isOpen=true when viewport shrinks by >150px (keyboard open)', () => {
    const fakeVV = createFakeViewport(844);
    Object.defineProperty(window, 'visualViewport', {
      value: fakeVV,
      writable: true,
      configurable: true,
    });
    const { result } = renderHook(() => useKeyboardOpen());

    // Simulate keyboard opening (viewport shrinks to 444px = 400px keyboard)
    act(() => {
      (fakeVV as unknown as { height: number }).height = 444;
      resizeHandler?.();
    });

    expect(result.current.isOpen).toBe(true);
    expect(result.current.keyboardHeight).toBe(400);
  });

  it('returns isOpen=false when viewport shrink is <150px', () => {
    const fakeVV = createFakeViewport(844);
    Object.defineProperty(window, 'visualViewport', {
      value: fakeVV,
      writable: true,
      configurable: true,
    });
    const { result } = renderHook(() => useKeyboardOpen());

    // Simulate small shrink (browser chrome, not keyboard)
    act(() => {
      (fakeVV as unknown as { height: number }).height = 744;
      resizeHandler?.();
    });

    expect(result.current.isOpen).toBe(false);
    expect(result.current.keyboardHeight).toBe(100);
  });

  it('returns isOpen=false when visualViewport is not available', () => {
    Object.defineProperty(window, 'visualViewport', {
      value: null,
      writable: true,
      configurable: true,
    });
    const { result } = renderHook(() => useKeyboardOpen());
    expect(result.current.isOpen).toBe(false);
    expect(result.current.keyboardHeight).toBe(0);
  });

  it('cleans up listener on unmount', () => {
    const fakeVV = createFakeViewport(844);
    Object.defineProperty(window, 'visualViewport', {
      value: fakeVV,
      writable: true,
      configurable: true,
    });
    const { unmount } = renderHook(() => useKeyboardOpen());
    unmount();
    expect(fakeVV.removeEventListener).toHaveBeenCalledWith('resize', expect.any(Function));
  });
});
