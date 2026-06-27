/**
 * Plan 088 Phase 5 — T005: the `/api/remote-view/sessions` CRUD routes.
 *
 * Determinism: the routes resolve `IRemoteViewService` from DI and gate on NextAuth — both
 * mocked, so no daemon, no NextAuth env. Proves the contract the picker + agent surfaces depend on:
 *   - 401 for an unauthenticated caller, returned BEFORE the container is ever resolved
 *     (the gate-before-service ordering — a route that skipped the gate would fail this);
 *   - GET 200 `{ sessions: SessionSummary[] }` from the service's active list;
 *   - POST `{ windowId }` → 200 flat `SessionSummary`; **idempotent per windowId** (same sessionId)
 *     — the frozen IRemoteViewService contract, and the create path R6 auto-recreate calls;
 *   - POST malformed body → 400 `E_BAD_BODY` (mirrors the daemon's contract);
 *   - DELETE → 204 and terminal (the session leaves the active list);
 *   - a daemon/attach failure → named 500 `E_INTERNAL` instead of an opaque crash (AC-14).
 */
import {
  FakeRemoteViewService,
  type IRemoteViewService,
} from '@/features/088-remote-view/server/remote-view-service';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// vi.mock is hoisted above all top-level code, so the mock fns it references must come from
// vi.hoisted (which runs before the mocks) — the same pattern as remote-view-routes.test.ts.
const { authMock, resolveMock, localAuthMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  resolveMock: vi.fn(),
  localAuthMock: vi.fn(),
}));
vi.mock('@/auth', () => ({ auth: authMock }));
// F004: the routes gate via requireRemoteViewAccess (NextAuth OR Plan-084 local token).
vi.mock('@/lib/local-auth', () => ({ requireLocalAuth: localAuthMock }));
vi.mock('@/lib/bootstrap-singleton', () => ({ getContainer: () => ({ resolve: resolveMock }) }));

import { DELETE as sessionDELETE } from '@/../app/api/remote-view/sessions/[sessionId]/route';
import { GET as sessionsGET, POST as sessionsPOST } from '@/../app/api/remote-view/sessions/route';

/** Make the DI container resolve to a specific service for one test. */
function useService(service: IRemoteViewService): void {
  resolveMock.mockReturnValue(service);
}

function getReq(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest('http://localhost/api/remote-view/sessions', { headers });
}

function postReq(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/remote-view/sessions', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function deleteReq(sessionId: string): [NextRequest, { params: Promise<{ sessionId: string }> }] {
  return [
    new NextRequest(`http://localhost/api/remote-view/sessions/${sessionId}`, { method: 'DELETE' }),
    { params: Promise.resolve({ sessionId }) },
  ];
}

beforeEach(() => {
  vi.clearAllMocks();
  authMock.mockResolvedValue({ user: { name: 'alice' } }); // authenticated by default
  localAuthMock.mockResolvedValue({ ok: false, reason: 'no-credential' }); // no local cred by default
  useService(new FakeRemoteViewService());
});

describe('GET /api/remote-view/sessions', () => {
  it('returns 401 for an unauthenticated caller — before touching the service', async () => {
    authMock.mockResolvedValue(null);

    const res = await sessionsGET(getReq());

    expect(res.status).toBe(401);
    expect(resolveMock).not.toHaveBeenCalled(); // gate runs first; service never resolved
  });

  it('accepts a valid X-Local-Token (CLI/MCP flow) with no NextAuth session — F004', async () => {
    authMock.mockResolvedValue(null);
    localAuthMock.mockResolvedValue({ ok: true, via: 'local-token' });
    const service = new FakeRemoteViewService();
    await service.attach(34202);
    useService(service);

    const res = await sessionsGET(getReq({ 'x-local-token': 'a-valid-token' }));

    expect(res.status).toBe(200);
    const body = (await res.json()) as { sessions: unknown[] };
    expect(body.sessions).toHaveLength(1); // local-token caller reached the service
  });

  it('returns 200 with the active session list', async () => {
    const service = new FakeRemoteViewService();
    await service.attach(34202);
    useService(service);

    const res = await sessionsGET(getReq());

    expect(res.status).toBe(200);
    const body = (await res.json()) as { sessions: Array<{ windowId: number; app: string }> };
    expect(body.sessions).toHaveLength(1);
    expect(body.sessions[0]).toMatchObject({ windowId: 34202, app: 'Godot' });
  });
});

describe('POST /api/remote-view/sessions', () => {
  it('returns 401 for an unauthenticated caller — before touching the service', async () => {
    authMock.mockResolvedValue(null);

    const res = await sessionsPOST(postReq({ windowId: 34202 }));

    expect(res.status).toBe(401);
    expect(resolveMock).not.toHaveBeenCalled();
  });

  it('attaches a window and returns the flat SessionSummary', async () => {
    const res = await sessionsPOST(postReq({ windowId: 34202 }));

    expect(res.status).toBe(200);
    const body = (await res.json()) as { sessionId: string; windowId: number; title: string };
    expect(body.windowId).toBe(34202);
    expect(body.title).toBe('spike-target');
    expect(body.sessionId).toMatch(/^ses_/);
  });

  it('is idempotent per windowId — a second attach returns the same session', async () => {
    const service = new FakeRemoteViewService();
    useService(service);

    const first = (await (await sessionsPOST(postReq({ windowId: 34202 }))).json()) as {
      sessionId: string;
    };
    const second = (await (await sessionsPOST(postReq({ windowId: 34202 }))).json()) as {
      sessionId: string;
    };

    expect(second.sessionId).toBe(first.sessionId);
    expect(service.list()).toHaveLength(1); // one window → one session
  });

  it('returns 400 E_BAD_BODY when windowId is missing / not a number', async () => {
    const res = await sessionsPOST(postReq({ nope: true }));

    expect(res.status).toBe(400);
    expect((await res.json()) as { error: string }).toMatchObject({ error: 'E_BAD_BODY' });
  });

  it('returns 500 E_INTERNAL when attach fails (daemon unreachable)', async () => {
    useService({
      list: () => [],
      attach: async () => {
        throw new Error('daemon unreachable');
      },
      detach: async () => {},
      getSession: () => null,
    });

    const res = await sessionsPOST(postReq({ windowId: 34202 }));

    expect(res.status).toBe(500);
    expect((await res.json()) as { error: string }).toMatchObject({ error: 'E_INTERNAL' });
  });
});

describe('DELETE /api/remote-view/sessions/[sessionId]', () => {
  it('returns 401 for an unauthenticated caller — before touching the service', async () => {
    authMock.mockResolvedValue(null);

    const res = await sessionDELETE(...deleteReq('ses_anything'));

    expect(res.status).toBe(401);
    expect(resolveMock).not.toHaveBeenCalled();
  });

  it('detaches the session (terminal) and returns 204', async () => {
    const service = new FakeRemoteViewService();
    const created = await service.attach(34202);
    useService(service);

    const res = await sessionDELETE(...deleteReq(created.sessionId));

    expect(res.status).toBe(204);
    expect(service.list()).toHaveLength(0); // terminal — gone from the active list
  });
});
