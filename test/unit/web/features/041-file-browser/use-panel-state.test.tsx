import { usePanelState } from '@/features/041-file-browser/hooks/use-panel-state';
import type {
  ChangesSnapshot,
  ChangesSnapshotParts,
} from '@/features/041-file-browser/services/changes-snapshot';
import type { PanelMode } from '@/features/_platform/panel-layout';
import { act, renderHook } from '@testing-library/react';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('sonner', () => ({
  toast: {
    info: vi.fn(),
  },
}));

const snapshot: ChangesSnapshot = {
  changedFiles: { ok: true, files: ['a.ts'] },
  diffStats: { ok: true, stats: { files: 1, insertions: 2, deletions: 0 } },
  workingChanges: { ok: true, files: [{ path: 'a.ts', status: 'modified', area: 'unstaged' }] },
  recentFiles: { ok: true, files: ['b.ts'] },
};

/** Run a step inside act and let the snapshot promise it starts resolve. */
async function step(fn: () => void): Promise<void> {
  await act(async () => fn());
}

async function renderPanelState(panel: PanelMode) {
  const calls: ChangesSnapshotParts[] = [];
  const fetchChangesSnapshot = async (_worktreePath: string, parts: ChangesSnapshotParts) => {
    calls.push(parts);
    return snapshot;
  };
  let hook!: ReturnType<typeof render>;
  const render = () =>
    renderHook(
      ({ mode }: { mode: PanelMode }) =>
        usePanelState({
          isGit: true,
          worktreePath: '/repo',
          panel: mode,
          setUrlPanel: vi.fn(),
          fetchChangesSnapshot,
          refreshThrottleMs: 2_000,
        }),
      { initialProps: { mode: panel } }
    );
  await step(() => {
    hook = render();
  });
  return { ...hook, calls };
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

  it('loads tree parts on mount and changes parts only once the Changes panel shows', async () => {
    const { calls, rerender, result } = await renderPanelState('tree');
    expect(calls).toEqual([{ tree: true, changes: false }]);
    expect(result.current.changedFiles).toEqual(['a.ts']);

    await step(() => rerender({ mode: 'changes' }));
    expect(calls).toEqual([
      { tree: true, changes: false },
      { tree: false, changes: true },
    ]);
    expect(result.current.recentFiles).toEqual(['b.ts']);

    // Already loaded: switching away and back does not refetch.
    await step(() => rerender({ mode: 'tree' }));
    await step(() => rerender({ mode: 'changes' }));
    expect(calls).toHaveLength(2);
  });

  it('collapses a burst of file-change refreshes into one call after the throttle', async () => {
    const { result, calls } = await renderPanelState('changes');
    calls.length = 0;

    await step(() => {
      result.current.scheduleRefreshChanges();
      result.current.scheduleRefreshChanges();
      result.current.scheduleRefreshChanges();
    });
    expect(calls).toEqual([]);

    await step(() => vi.advanceTimersByTime(2_000));
    expect(calls).toEqual([{ tree: true, changes: true }]);
  });

  it('marks changes stale instead of fetching them while the Changes panel is hidden', async () => {
    const { result, calls, rerender } = await renderPanelState('tree');
    calls.length = 0;

    await step(() => result.current.scheduleRefreshChanges());
    await step(() => vi.advanceTimersByTime(2_000));
    expect(calls).toEqual([{ tree: true, changes: false }]);

    await step(() => rerender({ mode: 'changes' }));
    expect(calls).toEqual([
      { tree: true, changes: false },
      { tree: false, changes: true },
    ]);
  });

  it('defers file-change refreshes while the tab is hidden and runs one when it is shown', async () => {
    const { result, calls } = await renderPanelState('changes');
    calls.length = 0;

    await step(() => setHidden(true));
    await step(() => {
      result.current.scheduleRefreshChanges();
      result.current.scheduleRefreshChanges();
    });
    await step(() => vi.advanceTimersByTime(10_000));
    expect(calls).toEqual([]);

    await step(() => setHidden(false));
    expect(calls).toEqual([{ tree: true, changes: true }]);

    // Shown again with nothing changed while hidden: no extra call.
    await step(() => setHidden(true));
    await step(() => setHidden(false));
    expect(calls).toHaveLength(1);
  });
});
