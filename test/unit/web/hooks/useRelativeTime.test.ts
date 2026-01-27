/**
 * useRelativeTime Hook Tests
 *
 * Tests for the auto-updating relative time hook.
 * Part of Plan 015: Better Agents - Session Management
 */

import { formatRelativeTime, useRelativeTime } from '@/hooks/useRelativeTime';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('formatRelativeTime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-15T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "just now" for timestamps less than 1 minute ago', () => {
    const now = Date.now();
    expect(formatRelativeTime(now)).toBe('just now');
    expect(formatRelativeTime(now - 30_000)).toBe('just now'); // 30 seconds ago
  });

  it('returns "Xm ago" for timestamps 1-59 minutes ago', () => {
    const now = Date.now();
    expect(formatRelativeTime(now - 60_000)).toBe('1m ago'); // 1 minute
    expect(formatRelativeTime(now - 30 * 60_000)).toBe('30m ago'); // 30 minutes
    expect(formatRelativeTime(now - 59 * 60_000)).toBe('59m ago'); // 59 minutes
  });

  it('returns "Xh ago" for timestamps 1-23 hours ago', () => {
    const now = Date.now();
    expect(formatRelativeTime(now - 60 * 60_000)).toBe('1h ago'); // 1 hour
    expect(formatRelativeTime(now - 12 * 60 * 60_000)).toBe('12h ago'); // 12 hours
    expect(formatRelativeTime(now - 23 * 60 * 60_000)).toBe('23h ago'); // 23 hours
  });

  it('returns "Xd ago" for timestamps 1-6 days ago', () => {
    const now = Date.now();
    expect(formatRelativeTime(now - 24 * 60 * 60_000)).toBe('1d ago'); // 1 day
    expect(formatRelativeTime(now - 3 * 24 * 60 * 60_000)).toBe('3d ago'); // 3 days
    expect(formatRelativeTime(now - 6 * 24 * 60 * 60_000)).toBe('6d ago'); // 6 days
  });

  it('returns localized date for timestamps 7+ days ago', () => {
    const now = Date.now();
    const sevenDaysAgo = now - 7 * 24 * 60 * 60_000;
    const result = formatRelativeTime(sevenDaysAgo);
    // Should be a date string, not "7d ago"
    expect(result).not.toBe('7d ago');
    expect(result).toMatch(/\d/); // Contains numbers (date)
  });
});

describe('useRelativeTime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-15T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns formatted relative time', () => {
    const fiveMinutesAgo = Date.now() - 5 * 60_000;
    const { result } = renderHook(() => useRelativeTime(fiveMinutesAgo));

    expect(result.current).toBe('5m ago');
  });

  it('updates when time passes', () => {
    const now = Date.now();
    const { result } = renderHook(() => useRelativeTime(now));

    expect(result.current).toBe('just now');

    // Advance time by 2 minutes
    act(() => {
      vi.advanceTimersByTime(2 * 60_000);
    });

    expect(result.current).toBe('2m ago');
  });

  it('updates on the specified interval', () => {
    const now = Date.now();
    const intervalMs = 30_000; // 30 seconds
    const { result } = renderHook(() => useRelativeTime(now, intervalMs));

    expect(result.current).toBe('just now');

    // Advance by 30 seconds - should trigger update
    act(() => {
      vi.advanceTimersByTime(30_000);
    });

    expect(result.current).toBe('just now'); // Still under 1 minute

    // Advance by another 30 seconds - now 1 minute total
    act(() => {
      vi.advanceTimersByTime(30_000);
    });

    expect(result.current).toBe('1m ago');
  });

  it('updates immediately when timestamp changes', () => {
    const fiveMinutesAgo = Date.now() - 5 * 60_000;
    const tenMinutesAgo = Date.now() - 10 * 60_000;

    const { result, rerender } = renderHook(({ timestamp }) => useRelativeTime(timestamp), {
      initialProps: { timestamp: fiveMinutesAgo },
    });

    expect(result.current).toBe('5m ago');

    // Change the timestamp
    rerender({ timestamp: tenMinutesAgo });

    expect(result.current).toBe('10m ago');
  });

  it('cleans up interval on unmount', () => {
    const clearIntervalSpy = vi.spyOn(global, 'clearInterval');
    const now = Date.now();

    const { unmount } = renderHook(() => useRelativeTime(now));

    unmount();

    expect(clearIntervalSpy).toHaveBeenCalled();
    clearIntervalSpy.mockRestore();
  });
});
