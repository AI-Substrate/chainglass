/**
 * Plan 088 Phase 5 — T004: the picker's window loader after the fake→real swap.
 *
 * Proves the hook now sources the catalog from `GET /api/remote-view/windows` (fetch stubbed),
 * keeps the `{ windows, loading, error, refresh }` shape the picker already consumed, surfaces the
 * route's named error message on non-2xx (AC-14), and stays inert when disabled (a session active).
 */
import { useRemoteViewWindows } from '@/features/088-remote-view/hooks/use-remote-view-windows';
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const CATALOG = [
  { id: 1, app: 'Godot', title: 'game', pixelWidth: 800, pixelHeight: 656, scale: 2 },
  { id: 2, app: 'Simulator', title: 'iPhone 15', pixelWidth: 1170, pixelHeight: 2532, scale: 3 },
];

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useRemoteViewWindows', () => {
  it('loads the catalog from GET /api/remote-view/windows', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ windows: CATALOG }, 200))
    );

    const { result } = renderHook(() => useRemoteViewWindows());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.windows).toEqual(CATALOG);
    expect(result.current.error).toBeNull();
  });

  it('surfaces the route error message on non-2xx (AC-14: name the missing grant)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse(
          { error: 'E_PERMISSION', message: 'Screen Recording permission is required.' },
          403
        )
      )
    );

    const { result } = renderHook(() => useRemoteViewWindows());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.windows).toEqual([]);
    expect(result.current.error).toMatch(/Screen Recording/);
  });

  it('surfaces the route error CODE (e.g. E_LOCKED) so callers can flip UI on the cause', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse(
          { error: 'E_LOCKED', message: "The host Mac is locked, so its windows can't be listed." },
          423
        )
      )
    );

    const { result } = renderHook(() => useRemoteViewWindows());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.windows).toEqual([]);
    expect(result.current.code).toBe('E_LOCKED');
    expect(result.current.error).toMatch(/locked/i);
  });

  it('does not fetch when disabled (a session is active)', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const { result } = renderHook(() => useRemoteViewWindows({ enabled: false }));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.current.windows).toEqual([]);
  });
});
