import { usePanelState } from '@/features/041-file-browser/hooks/use-panel-state';
import { act, renderHook } from '@testing-library/react';
import { toast } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('sonner', () => ({
  toast: {
    info: vi.fn(),
  },
}));

const okFiles = vi.fn().mockResolvedValue({ ok: true, files: [] });
const okStats = vi
  .fn()
  .mockResolvedValue({ ok: true, stats: { files: 0, insertions: 0, deletions: 0 } });

describe('usePanelState', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('always includes PIJ and names its toast correctly', () => {
    const setUrlPanel = vi.fn();
    const { result } = renderHook(() =>
      usePanelState({
        isGit: false,
        worktreePath: '/repo',
        panel: 'tree',
        setUrlPanel,
        fetchWorkingChanges: okFiles,
        fetchRecentFiles: okFiles,
        fetchChangedFiles: okFiles,
        fetchDiffStats: okStats,
      })
    );

    expect(result.current.panelModes.map((mode) => mode.key)).toEqual(['tree', 'pij']);

    act(() => result.current.handlePanelModeChange('pij'));

    expect(setUrlPanel).toHaveBeenCalledWith('pij');
    expect(toast.info).toHaveBeenCalledWith('PIJ');
  });
});
