/**
 * Plan 088 Phase 5 — T005: the session hook's default `createSession` (R6 auto-recreate wiring).
 *
 * Phase 2 stubbed `defaultCreateSession` to `null` ("real daemon recreate lands in Phase 5").
 * Phase 5 wires it to `POST /api/remote-view/sessions { windowId }`. This proves the swap:
 *   - on 200 it returns the new sessionId (so R6 reconnects the recreated session);
 *   - on failure it returns null and never throws (R6 then falls through to `daemonDown`,
 *     not an unhandled rejection inside the reducer).
 */
import { defaultCreateSession } from '@/features/088-remote-view/hooks/use-remote-view-session';
import { afterEach, describe, expect, it, vi } from 'vitest';

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('defaultCreateSession (R6 auto-recreate)', () => {
  it('POSTs the windowId and returns the new sessionId', async () => {
    const fetchSpy = vi.fn(async () =>
      jsonResponse({ sessionId: 'ses_new', windowId: 34202, state: 'streaming' }, 200)
    );
    vi.stubGlobal('fetch', fetchSpy);

    const sid = await defaultCreateSession(34202);

    expect(sid).toBe('ses_new');
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/remote-view/sessions',
      expect.objectContaining({ method: 'POST' })
    );
    const sent = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
    expect(sent).toEqual({ windowId: 34202 });
  });

  it('returns null when the route fails (R6 → daemonDown, never throws)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ error: 'E_INTERNAL' }, 500))
    );

    await expect(defaultCreateSession(34202)).resolves.toBeNull();
  });

  it('returns null when fetch rejects outright', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down');
      })
    );

    await expect(defaultCreateSession(34202)).resolves.toBeNull();
  });
});
