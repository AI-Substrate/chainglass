/**
 * Plan 088 Phase 6 — T004: the health hook that feeds the preflight card.
 *
 * Proves the permission-only, non-blocking contract: when enabled it reads `/health` and surfaces
 * `permissions` (even on a denied grant — that IS the preflight case); when disabled (a session is
 * active) it never fetches; a health failure leaves `permissions` null without throwing (the picker
 * still loads). Mirrors the `useRemoteViewWindows` test shape.
 */
import { useRemoteViewHealth } from '@/features/088-remote-view/hooks/use-remote-view-health';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

function Probe({ enabled }: { enabled: boolean }) {
  const { permissions, loading, error } = useRemoteViewHealth({ enabled });
  return (
    <div
      data-testid="probe"
      data-loading={String(loading)}
      data-error={error ?? ''}
      data-screen={permissions?.screenRecording ?? ''}
      data-acc={permissions?.accessibility ?? ''}
    />
  );
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
});
