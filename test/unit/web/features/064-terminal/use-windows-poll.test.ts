/**
 * @vitest-environment jsdom
 */

import {
  WINDOWS_POLL_MS,
  WINDOWS_REPLY_TIMEOUT_MS,
  useWindowsPoll,
} from '@/features/064-terminal/hooks/use-windows-poll';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function setVisibility(state: DocumentVisibilityState): void {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  document.dispatchEvent(new Event('visibilitychange'));
}

describe('useWindowsPoll', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setVisibility('visible');
  });
  afterEach(() => {
    vi.useRealTimers();
    setVisibility('visible');
  });

  it('never sends a windows request while the previous one is unanswered', () => {
    const send = vi.fn();
    const { result } = renderHook(() => useWindowsPoll(true, send));
    expect(send).toHaveBeenCalledTimes(1);

    // tmux is slow: three poll ticks pass with no reply, and nothing more goes out.
    act(() => vi.advanceTimersByTime(WINDOWS_POLL_MS * 3));
    expect(send).toHaveBeenCalledTimes(1);

    act(() => result.current());
    act(() => vi.advanceTimersByTime(WINDOWS_POLL_MS));
    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenLastCalledWith(JSON.stringify({ type: 'windows' }));
  });

  it('asks again when a request is never answered, so a dropped frame cannot stop the strip', () => {
    // Regression (2026-11-11): the first request went out on socket open, before the sidecar
    // listened, and was dropped. With no expiry the strip stayed empty for good.
    const send = vi.fn();
    renderHook(() => useWindowsPoll(true, send));
    expect(send).toHaveBeenCalledTimes(1);

    act(() => vi.advanceTimersByTime(WINDOWS_REPLY_TIMEOUT_MS - WINDOWS_POLL_MS));
    expect(send).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(WINDOWS_POLL_MS));
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('sends nothing from a hidden tab, and asks at once when the tab is shown', () => {
    setVisibility('hidden');
    const send = vi.fn();
    renderHook(() => useWindowsPoll(true, send));
    act(() => vi.advanceTimersByTime(WINDOWS_POLL_MS * 5));
    expect(send).not.toHaveBeenCalled();

    act(() => setVisibility('visible'));
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('asks again after a reconnect even if the old socket never answered', () => {
    const send = vi.fn();
    const onWindowsChange = vi.fn();
    const { rerender } = renderHook(
      ({ enabled }) => useWindowsPoll(enabled, send, onWindowsChange),
      { initialProps: { enabled: true } }
    );
    rerender({ enabled: false });
    expect(onWindowsChange).toHaveBeenLastCalledWith([]);
    rerender({ enabled: true });
    expect(send).toHaveBeenCalledTimes(2);
  });
});
