import {
  type AutoSaveOnLeaveSnapshot,
  shouldFlush,
  useAutoSaveOnLeave,
} from '@/features/041-file-browser/hooks/use-auto-save-on-leave';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const dirty = (over: Partial<AutoSaveOnLeaveSnapshot> = {}): AutoSaveOnLeaveSnapshot => ({
  filePath: 'docs/notes.md',
  content: 'edited',
  isDirty: true,
  ...over,
});

describe('shouldFlush — the decision, without a DOM', () => {
  it('flushes only a dirty, enabled, not-already-saving buffer', () => {
    /*
    Test Doc:
    - Why: every guard here maps to a real way this feature misbehaves — a clean buffer
      would write on every file click, a disabled hook would write when told not to, and
      a null snapshot means no file is open at all.
    - Contract: dirty AND enabled AND not in-flight, or no flush.
    - Usage Notes: pure, so the table is the whole specification.
    - Quality Contribution: keeps the conditions from drifting apart as call sites grow.
    - Worked Example: a clean buffer → false, so switching files writes nothing.
    */
    expect(shouldFlush(dirty(), false, true)).toBe(true);
    expect(shouldFlush(dirty({ isDirty: false }), false, true)).toBe(false);
    expect(shouldFlush(null, false, true)).toBe(false);
    expect(shouldFlush(dirty(), false, false)).toBe(false);
    expect(shouldFlush(dirty(), true, true)).toBe(false);
  });
});

describe('useAutoSaveOnLeave', () => {
  it('saves the buffer as it is NOW, not as it was when the effect ran', async () => {
    /*
    Test Doc:
    - Why: THE STALE-CLOSURE BUG this hook exists to avoid. The flush runs from a cleanup
      and a window listener; if it captured `snapshot` it would persist the buffer from
      several keystrokes ago and silently lose the newest edits — the exact data loss the
      feature was built to prevent, in a form that looks like it works.
    - Contract: flush sends the latest rendered snapshot.
    - Usage Notes: rerender with new content, then flush.
    - Quality Contribution: pins the ref-not-dep choice as behaviour, not style.
    - Worked Example: render "v1", rerender "v2", flush → saves "v2".
    */
    const save = vi.fn().mockResolvedValue(true);
    const { result, rerender } = renderHook(
      ({ content }) => useAutoSaveOnLeave({ snapshot: dirty({ content }), save }),
      { initialProps: { content: 'v1' } }
    );

    rerender({ content: 'v2' });
    await act(async () => {
      await result.current.flush();
    });

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith('v2');
  });

  it('does not write a clean buffer', async () => {
    /*
    Test Doc:
    - Why: the bound that keeps this from being noise. Selecting files is the most common
      action in the browser; a hook that wrote on every one of them would move every
      file's mtime, spam the watcher, and make the git status meaningless.
    - Contract: isDirty false → no save call at all.
    - Usage Notes: —
    - Quality Contribution: makes "silent on the common path" an asserted property.
    - Worked Example: open a file, click another → zero writes.
    */
    const save = vi.fn().mockResolvedValue(true);
    const { result } = renderHook(() =>
      useAutoSaveOnLeave({ snapshot: dirty({ isDirty: false }), save })
    );

    await act(async () => {
      await result.current.flush();
    });

    expect(save).not.toHaveBeenCalled();
  });

  it('refuses a second flush while the first is still in flight', async () => {
    /*
    Test Doc:
    - Why: THE RACE. Selecting a new file calls flush and then re-renders, which re-runs
      the visibility effect; without the in-flight guard the same buffer is written twice
      and two saveFile calls race at the SAME expectedMtime — the second losing to a
      conflict dialog the user cannot explain, on a save they never asked for.
    - Contract: while a save is unresolved, further flushes are refused and return false.
    - Usage Notes: the save promise is held open deliberately, then released.
    - Quality Contribution: the concurrency guard is asserted rather than assumed.
    - Worked Example: flush, flush again before resolve → exactly one save.
    */
    let release: (v: boolean) => void = () => {};
    const save = vi.fn().mockReturnValue(
      new Promise<boolean>((res) => {
        release = res;
      })
    );
    const { result } = renderHook(() => useAutoSaveOnLeave({ snapshot: dirty(), save }));

    let first: Promise<boolean> = Promise.resolve(false);
    await act(async () => {
      first = result.current.flush();
      const second = await result.current.flush();
      expect(second).toBe(false);
      release(true);
      await first;
    });

    expect(save).toHaveBeenCalledTimes(1);
  });

  it('flushes on unmount — the in-app navigate-away case', async () => {
    /*
    Test Doc:
    - Why: leaving the browser page entirely is one of the two ways Jordan described
      navigating off, and it produces no click on another file, so the select-path flush
      never runs. Without the unmount flush this route loses the buffer.
    - Contract: unmounting a dirty editor saves it.
    - Usage Notes: —
    - Quality Contribution: covers the seam that has no user-visible event to hang off.
    - Worked Example: unmount with "edited" pending → save('edited').
    */
    const save = vi.fn().mockResolvedValue(true);
    const { unmount } = renderHook(() => useAutoSaveOnLeave({ snapshot: dirty(), save }));

    await act(async () => {
      unmount();
    });

    expect(save).toHaveBeenCalledWith('edited');
  });

  it('flushes when the tab is hidden, and not when it becomes visible', async () => {
    /*
    Test Doc:
    - Why: hiding the tab is a real "gone elsewhere" and still has a live event loop, so
      unlike unload the save can actually finish. The visible half matters too: firing on
      every focus regain would write constantly while the user alt-tabs.
    - Contract: visibilityState 'hidden' saves; 'visible' does not.
    - Usage Notes: visibilityState is stubbed, then the event dispatched.
    - Quality Contribution: pins both directions of the listener.
    - Worked Example: hidden → 1 save; visible → still 1.
    */
    const save = vi.fn().mockResolvedValue(true);
    renderHook(() => useAutoSaveOnLeave({ snapshot: dirty(), save }));

    const setVisibility = (value: DocumentVisibilityState) =>
      Object.defineProperty(document, 'visibilityState', { value, configurable: true });

    await act(async () => {
      setVisibility('hidden');
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(save).toHaveBeenCalledTimes(1);

    await act(async () => {
      setVisibility('visible');
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('lets navigation proceed when the save throws', async () => {
    /*
    Test Doc:
    - Why: the flush is awaited on the file-switch path. If a failed save rejected, the
      click that triggered it would break and the user would be stuck on the old file —
      an autosave feature holding the app hostage over its own failure.
    - Contract: a throwing save resolves false rather than rejecting.
    - Usage Notes: the save path raises its own toast; this only stops the propagation.
    - Quality Contribution: keeps a failure degrading to "not saved", never to "stuck".
    - Worked Example: save rejects → flush resolves false.
    */
    const save = vi.fn().mockRejectedValue(new Error('disk full'));
    const { result } = renderHook(() => useAutoSaveOnLeave({ snapshot: dirty(), save }));

    await act(async () => {
      await expect(result.current.flush()).resolves.toBe(false);
    });
  });
});
