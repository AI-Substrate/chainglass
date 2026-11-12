import { usePanelState } from '@/features/041-file-browser/hooks/use-panel-state';
import type {
  ChangesSnapshot,
  ChangesSnapshotParts,
} from '@/features/041-file-browser/services/changes-snapshot';
import type { ChangedFile } from '@/features/041-file-browser/services/working-changes';
import type { PanelMode } from '@/features/_platform/panel-layout';
import { act, renderHook } from '@testing-library/react';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('sonner', () => ({
  toast: {
    info: vi.fn(),
  },
}));

function snapshotWith(workingChanges: ChangedFile[]): ChangesSnapshot {
  return {
    changedFiles: { ok: true, files: workingChanges.map((change) => change.path) },
    diffStats: { ok: true, stats: { files: workingChanges.length, insertions: 2, deletions: 0 } },
    workingChanges: { ok: true, files: workingChanges },
    recentFiles: { ok: true, files: ['b.ts'] },
  };
}

const modifiedA: ChangedFile = { path: 'a.ts', status: 'modified', area: 'unstaged' };

/** Run a step inside act and let the snapshot promise it starts resolve. */
async function step(fn: () => void): Promise<void> {
  await act(async () => fn());
}

interface Props {
  mode: PanelMode;
  worktree: string;
}

async function renderPanelState(panel: PanelMode) {
  const calls: Array<{ worktree: string; parts: ChangesSnapshotParts }> = [];
  const state = { snapshot: snapshotWith([modifiedA]) };
  const fetchChangesSnapshot = async (worktree: string, parts: ChangesSnapshotParts) => {
    calls.push({ worktree, parts });
    return state.snapshot;
  };
  let hook!: ReturnType<typeof render>;
  const render = () =>
    renderHook(
      ({ mode, worktree }: Props) =>
        usePanelState({
          isGit: true,
          worktreePath: worktree,
          panel: mode,
          setUrlPanel: vi.fn(),
          fetchChangesSnapshot,
          refreshThrottleMs: 2_000,
        }),
      { initialProps: { mode: panel, worktree: '/repo' } as Props }
    );
  await step(() => {
    hook = render();
  });
  const parts = () => calls.map((call) => call.parts);
  return { ...hook, calls, parts, state };
}

function setHidden(hidden: boolean) {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
  document.dispatchEvent(new Event('visibilitychange'));
}

describe('usePanelState', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    setHidden(false);
  });

  afterEach(() => {
    vi.useRealTimers();
    setHidden(false);
  });

  it('always includes PIJ and names its toast correctly', () => {
    const setUrlPanel = vi.fn();
    const { result } = renderHook(() =>
      usePanelState({
        isGit: false,
        worktreePath: '/repo',
        panel: 'tree',
        setUrlPanel,
        fetchChangesSnapshot: vi.fn(),
      })
    );

    expect(result.current.panelModes.map((mode) => mode.key)).toEqual(['tree', 'pij']);

    act(() => result.current.handlePanelModeChange('pij'));

    expect(setUrlPanel).toHaveBeenCalledWith('pij');
    expect(toast.info).toHaveBeenCalledWith('PIJ');
  });

  it('loads status (with working changes) on mount and recent files only once Changes shows', async () => {
    const { parts, rerender, result } = await renderPanelState('tree');
    expect(parts()).toEqual([{ status: true, recent: false }]);
    // Working changes drive tab-title attention and explorer badges, so Tree mode has them.
    expect(result.current.workingChanges).toEqual([modifiedA]);
    expect(result.current.changedFiles).toEqual(['a.ts']);

    await step(() => rerender({ mode: 'changes', worktree: '/repo' }));
    expect(parts()).toEqual([
      { status: true, recent: false },
      { status: false, recent: true },
    ]);
    expect(result.current.recentFiles).toEqual(['b.ts']);

    // Already loaded: switching away and back does not refetch.
    await step(() => rerender({ mode: 'tree', worktree: '/repo' }));
    await step(() => rerender({ mode: 'changes', worktree: '/repo' }));
    expect(parts()).toHaveLength(2);
  });

  it('keeps working changes current in Tree mode after file changes', async () => {
    const { result, state } = await renderPanelState('tree');
    expect(result.current.workingChanges).toEqual([modifiedA]);

    state.snapshot = snapshotWith([]);
    await step(() => result.current.scheduleRefreshChanges());
    await step(() => vi.advanceTimersByTime(2_000));

    expect(result.current.workingChanges).toEqual([]);
  });

  it('collapses a burst of file-change refreshes into one call after the throttle', async () => {
    const { result, calls, parts } = await renderPanelState('changes');
    calls.length = 0;

    await step(() => {
      result.current.scheduleRefreshChanges();
      result.current.scheduleRefreshChanges();
      result.current.scheduleRefreshChanges();
    });
    expect(parts()).toEqual([]);

    await step(() => vi.advanceTimersByTime(2_000));
    expect(parts()).toEqual([{ status: true, recent: true }]);
  });

  it('marks recent files stale instead of fetching them while the Changes panel is hidden', async () => {
    const { result, calls, parts, rerender } = await renderPanelState('tree');
    calls.length = 0;

    await step(() => result.current.scheduleRefreshChanges());
    await step(() => vi.advanceTimersByTime(2_000));
    expect(parts()).toEqual([{ status: true, recent: false }]);

    await step(() => rerender({ mode: 'changes', worktree: '/repo' }));
    expect(parts()).toEqual([
      { status: true, recent: false },
      { status: false, recent: true },
    ]);
  });

  it('reloads everything for a new worktree and ignores the old worktree answer', async () => {
    const { calls, rerender, result } = await renderPanelState('changes');
    expect(calls).toEqual([{ worktree: '/repo', parts: { status: true, recent: true } }]);

    await step(() => rerender({ mode: 'changes', worktree: '/other' }));
    expect(calls).toEqual([
      { worktree: '/repo', parts: { status: true, recent: true } },
      { worktree: '/other', parts: { status: true, recent: true } },
    ]);
    expect(result.current.workingChanges).toEqual([modifiedA]);
  });

  it('defers file-change refreshes while the tab is hidden and runs one when it is shown', async () => {
    const { result, calls, parts } = await renderPanelState('changes');
    calls.length = 0;

    await step(() => setHidden(true));
    await step(() => {
      result.current.scheduleRefreshChanges();
      result.current.scheduleRefreshChanges();
    });
    await step(() => vi.advanceTimersByTime(10_000));
    expect(parts()).toEqual([]);

    await step(() => setHidden(false));
    expect(parts()).toEqual([{ status: true, recent: true }]);

    // Shown again with nothing changed while hidden: no extra call.
    await step(() => setHidden(true));
    await step(() => setHidden(false));
    expect(parts()).toHaveLength(1);
  });

  it('lets a throttled refresh pending at resume cover the hidden changes', async () => {
    const { result, calls, parts } = await renderPanelState('changes');
    calls.length = 0;

    // Visible change arms the throttle; the tab hides and another change marks it stale.
    await step(() => result.current.scheduleRefreshChanges());
    await step(() => setHidden(true));
    await step(() => result.current.scheduleRefreshChanges());

    await step(() => setHidden(false));
    expect(parts()).toEqual([]);

    await step(() => vi.advanceTimersByTime(2_000));
    expect(parts()).toEqual([{ status: true, recent: true }]);
    await step(() => vi.advanceTimersByTime(10_000));
    expect(parts()).toHaveLength(1);
  });

  it('keeps the throttle spacing from a refresh that just ran when the tab returns', async () => {
    const { result, calls, parts } = await renderPanelState('changes');
    calls.length = 0;

    await step(() => result.current.scheduleRefreshChanges());
    await step(() => vi.advanceTimersByTime(2_000));
    expect(parts()).toHaveLength(1);

    // 100 ms later the tab hides, a change arrives, and 100 ms after that the tab returns.
    await step(() => vi.advanceTimersByTime(100));
    await step(() => setHidden(true));
    await step(() => result.current.scheduleRefreshChanges());
    await step(() => vi.advanceTimersByTime(100));
    await step(() => setHidden(false));
    expect(parts()).toHaveLength(1);

    // The resume refresh waits out the spacing from the last one: 2 s after it, not 200 ms.
    await step(() => vi.advanceTimersByTime(1_799));
    expect(parts()).toHaveLength(1);
    await step(() => vi.advanceTimersByTime(1));
    expect(parts()).toHaveLength(2);
  });
});
