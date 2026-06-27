/**
 * Plan 088 Phase 6 — T004: the health hook that feeds the preflight card.
 *
 * Proves the permission-only, non-blocking contract: when enabled it reads `/health` and surfaces
 * `permissions` (even on a denied grant — that IS the preflight case); when disabled (a session is
 * active) it never fetches; a health failure leaves `permissions` null without throwing (the picker
 * still loads). Mirrors the `useRemoteViewWindows` test shape.
 */
import { useRemoteViewHealth } from '@/features/088-remote-view/hooks/use-remote-view-health';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

function Probe({ enabled }: { enabled: boolean }) {
  const { permissions, loading, error, refresh } = useRemoteViewHealth({ enabled });
  return (
    <div>
      <div
        data-testid="probe"
        data-loading={String(loading)}
        data-error={error ?? ''}
        data-screen={permissions?.screenRecording ?? ''}
        data-acc={permissions?.accessibility ?? ''}
      />
      <button type="button" data-testid="recheck" onClick={() => refresh()}>
        recheck
      </button>
    </div>
  );
}

/** A fetch double whose responses resolve on demand, so a test can control ordering. */
function deferredFetch() {
  const pending: Array<(r: Response) => void> = [];
  const fetchMock = vi.fn(() => new Promise<Response>((resolve) => pending.push(resolve)));
  return { fetchMock, pending };
}

function healthResponse(body: unknown, ok = true) {
  return { ok, status: ok ? 200 : 503, json: async () => body } as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useRemoteViewHealth (T004)', () => {
  it('reads /health and surfaces the permission grants when enabled', async () => {
    const fetchMock = vi.fn(async () =>
      healthResponse({
        ok: true,
        permissions: { screenRecording: 'denied', accessibility: 'granted' },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    render(<Probe enabled={true} />);

    await waitFor(() =>
      expect(screen.getByTestId('probe').getAttribute('data-screen')).toBe('denied')
    );
    expect(screen.getByTestId('probe').getAttribute('data-acc')).toBe('granted');
    expect(fetchMock).toHaveBeenCalledWith('/api/remote-view/health');
  });

  it('never fetches when disabled (a session is active)', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    render(<Probe enabled={false} />);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('leaves permissions null on a health failure (non-blocking — never throws)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down');
      })
    );

    render(<Probe enabled={true} />);

    await waitFor(() =>
      expect(screen.getByTestId('probe').getAttribute('data-loading')).toBe('false')
    );
    expect(screen.getByTestId('probe').getAttribute('data-screen')).toBe('');
    expect(screen.getByTestId('probe').getAttribute('data-error')).toMatch(/network down/);
  });

  it('a slow stale /health cannot overwrite a newer Re-check result (companion F001)', async () => {
    // The AC-14 recovery race: the initial fetch is slow; the user grants + clicks Re-check; the
    // Re-check returns `granted` (card clears); then the STALE initial resolves with `denied`. The
    // latest-wins request id must drop the stale response so the card does not reappear.
    const { fetchMock, pending } = deferredFetch();
    vi.stubGlobal('fetch', fetchMock);

    render(<Probe enabled={true} />);
    await waitFor(() => expect(pending).toHaveLength(1)); // initial /health in flight

    fireEvent.click(screen.getByTestId('recheck'));
    await waitFor(() => expect(pending).toHaveLength(2)); // Re-check /health in flight

    // Re-check (#2) resolves FIRST → granted, card clears.
    pending[1](
      healthResponse({
        ok: true,
        permissions: { screenRecording: 'granted', accessibility: 'granted' },
      })
    );
    await waitFor(() =>
      expect(screen.getByTestId('probe').getAttribute('data-screen')).toBe('granted')
    );

    // Stale initial (#1) resolves LATER with denied — must be dropped, not committed.
    pending[0](
      healthResponse({
        ok: true,
        permissions: { screenRecording: 'denied', accessibility: 'granted' },
      })
    );
    await new Promise((r) => setTimeout(r, 0)); // let the stale resolution flush its microtasks
    expect(screen.getByTestId('probe').getAttribute('data-screen')).toBe('granted'); // stable
  });
});
