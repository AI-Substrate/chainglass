/**
 * Plan 088 — host-locked guard.
 *
 * A locked Mac makes ScreenCaptureKit return a stale/empty content set, so the window/display
 * catalogs come back empty and the picker looks like "no windows" with no hint why. The one-shots
 * flag the lock (exit 4 → `E_LOCKED` → 423); the panel must FLIP to an explicit "unlock the host"
 * card instead of the picker, and its Re-check must re-load the catalogs + health. This pins that
 * flip so a refactor can't regress it back to a silent empty grid.
 */
import { RemoteViewPanel } from '@/features/088-remote-view/components/remote-view-panel';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { windowsRefresh, displaysRefresh, healthRefresh } = vi.hoisted(() => ({
  windowsRefresh: vi.fn(),
  displaysRefresh: vi.fn(),
  healthRefresh: vi.fn(),
}));

// Stub the Viewport so picker-mode rendering never touches WebCodecs/WebSocket.
vi.mock('@/features/088-remote-view/components/viewport', () => ({
  Viewport: () => <div data-testid="vp-stub" />,
}));
// Both catalogs report the host-locked code (they share one lock check on the daemon side).
vi.mock('@/features/088-remote-view/hooks/use-remote-view-windows', () => ({
  useRemoteViewWindows: () => ({
    windows: [],
    loading: false,
    error: "The host Mac is locked, so its windows can't be listed.",
    code: 'E_LOCKED',
    refresh: windowsRefresh,
  }),
}));
vi.mock('@/features/088-remote-view/hooks/use-remote-view-displays', () => ({
  useRemoteViewDisplays: () => ({
    displays: [],
    loading: false,
    error: "The host Mac is locked, so its displays can't be listed.",
    code: 'E_LOCKED',
    refresh: displaysRefresh,
  }),
}));
vi.mock('@/features/088-remote-view/hooks/use-remote-view-health', () => ({
  useRemoteViewHealth: () => ({
    permissions: null,
    loading: false,
    error: null,
    refresh: healthRefresh,
  }),
}));

const baseProps = {
  slug: 'ws',
  worktreePath: '/tmp/wt',
  onPickWindow: vi.fn(),
  onReturnToPicker: vi.fn(),
  onClose: vi.fn(),
};

afterEach(() => {
  vi.clearAllMocks();
});

describe('RemoteViewPanel — host-locked guard', () => {
  it('flips to the host-locked card (not the picker) when a catalog reports E_LOCKED', () => {
    render(<RemoteViewPanel {...baseProps} rv={null} />);
    expect(screen.queryByTestId('remote-view-host-locked')).not.toBeNull();
    // The picker (and its "No capturable windows" empty state) must NOT show — that's the confusing
    // symptom we're replacing with an actionable message.
    expect(screen.queryByTestId('remote-view-window-picker')).toBeNull();
  });

  it('Re-check re-loads both catalogs and the health preflight', () => {
    render(<RemoteViewPanel {...baseProps} rv={null} />);
    fireEvent.click(screen.getByRole('button', { name: /re-check/i }));
    expect(windowsRefresh).toHaveBeenCalled();
    expect(displaysRefresh).toHaveBeenCalled();
    expect(healthRefresh).toHaveBeenCalled();
  });
});
