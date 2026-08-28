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

  it('cancel drops the pending save instead of performing it', async () => {
    const saveFn = vi.fn().mockResolvedValue({ errors: [] });
    const { result } = renderHook(() => useAutoSave(saveFn, { delay: 5000 }));

    act(() => {
      result.current.trigger('pending-value');
    });

    await act(async () => {
      result.current.cancel();
    });

    // The distinction from flush(): the pending value is discarded, not written.
    expect(saveFn).not.toHaveBeenCalled();

    // And it stays discarded — the debounce timer must be dead, not merely early.
    await act(async () => {
      vi.advanceTimersByTime(10000);
    });
    expect(saveFn).not.toHaveBeenCalled();
  });

  it('cancel does not suppress a later trigger', async () => {
    const saveFn = vi.fn().mockResolvedValue({ errors: [] });
    const { result } = renderHook(() => useAutoSave(saveFn, { delay: 500 }));

    act(() => {
      result.current.trigger('discarded');
      result.current.cancel();
      result.current.trigger('kept');
    });

    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    expect(saveFn).toHaveBeenCalledTimes(1);
    expect(saveFn).toHaveBeenCalledWith('kept');
  });

  it('cancel closes the orphan-draft race that flush cannot (plan 087)', async () => {
    // The real sequence this exists for. The user types (draft debounce pending),
    // then navigates away: the TARGET is written and the draft deleted. A pending
    // draft-debounce firing after that delete resurrects an orphan draft, which
    // offers a spurious restore prompt on next load — precisely the "reopen, no
    // prompt" behaviour the navigate-away design promises.
    const draftStore = new Set<string>();
    const saveDraft = vi.fn(async (value: string) => {
      draftStore.add(value);
      return { errors: [] };
    });
    const { result } = renderHook(() => useAutoSave(saveDraft, { delay: 1000 }));

    act(() => {
      result.current.trigger('in-progress edit');
    });

    // Navigate away: target written, draft deleted, pending draft-save cancelled.
    await act(async () => {
      result.current.cancel();
      draftStore.clear();
    });

    // Time passes well beyond the debounce window.
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });

    expect(saveDraft).not.toHaveBeenCalled();
    expect(draftStore.size).toBe(0);
  });

  it('a flush after cancel writes nothing — the discarded value is gone, not merely unscheduled', async () => {
    // Cancelling must clear the pending VALUE, not just the timer. If only the
    // timer is cleared, any later flush() resurrects the value cancel was called
    // to discard — the same orphan, arriving by a different route.
    const saveFn = vi.fn().mockResolvedValue({ errors: [] });
    const { result } = renderHook(() => useAutoSave(saveFn, { delay: 5000 }));

    act(() => {
      result.current.trigger('discarded');
      result.current.cancel();
    });

    await act(async () => {
      result.current.flush();
    });

    expect(saveFn).not.toHaveBeenCalled();
  });
});
