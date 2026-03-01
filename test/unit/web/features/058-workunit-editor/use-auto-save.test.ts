import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAutoSave } from '@/features/_platform/hooks/use-auto-save';

describe('useAutoSave', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts with idle status', () => {
    const saveFn = vi.fn().mockResolvedValue({ errors: [] });
    const { result } = renderHook(() => useAutoSave(saveFn));
    expect(result.current.status).toBe('idle');
    expect(result.current.error).toBeNull();
  });

  it('debounces saves by configured delay', async () => {
    const saveFn = vi.fn().mockResolvedValue({ errors: [] });
    const { result } = renderHook(() => useAutoSave(saveFn, { delay: 500 }));

    act(() => {
      result.current.trigger('first');
      result.current.trigger('second');
      result.current.trigger('third');
    });

    // saveFn should not have been called yet
    expect(saveFn).not.toHaveBeenCalled();

    // Advance past debounce
    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    // Only the last value should be saved
    expect(saveFn).toHaveBeenCalledTimes(1);
    expect(saveFn).toHaveBeenCalledWith('third');
  });

  it('transitions to saving then saved on success', async () => {
    let resolvePromise: () => void;
    const saveFn = vi.fn().mockImplementation(
      () =>
        new Promise<{ errors: never[] }>((resolve) => {
          resolvePromise = () => resolve({ errors: [] });
        })
    );

    const { result } = renderHook(() => useAutoSave(saveFn, { delay: 0 }));

    act(() => {
      result.current.trigger('value');
    });

    expect(result.current.status).toBe('saving');

    await act(async () => {
      resolvePromise?.();
    });

    expect(result.current.status).toBe('saved');

    // Auto-clears to idle after 2s
    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(result.current.status).toBe('idle');
  });

  it('transitions to error on save failure', async () => {
    const saveFn = vi.fn().mockResolvedValue({
      errors: [{ message: 'Disk full' }],
    });

    const { result } = renderHook(() => useAutoSave(saveFn, { delay: 0 }));

    await act(async () => {
      result.current.trigger('value');
    });

    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe('Disk full');
  });

  it('transitions to error on thrown exception', async () => {
    const saveFn = vi.fn().mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useAutoSave(saveFn, { delay: 0 }));

    await act(async () => {
      result.current.trigger('value');
    });

    expect(result.current.status).toBe('error');
    expect(result.current.error).toContain('Network error');
  });

  it('flush bypasses debounce and saves immediately', async () => {
    const saveFn = vi.fn().mockResolvedValue({ errors: [] });
    const { result } = renderHook(() => useAutoSave(saveFn, { delay: 5000 }));

    act(() => {
      result.current.trigger('pending-value');
    });

    expect(saveFn).not.toHaveBeenCalled();

    await act(async () => {
      result.current.flush();
    });

    expect(saveFn).toHaveBeenCalledWith('pending-value');
  });

  it('calls onSaved callback after successful save', async () => {
    const onSaved = vi.fn();
    const saveFn = vi.fn().mockResolvedValue({ errors: [] });
    const { result } = renderHook(() => useAutoSave(saveFn, { delay: 0, onSaved }));

    await act(async () => {
      result.current.trigger('value');
    });

    expect(onSaved).toHaveBeenCalledTimes(1);
  });
});
