/**
 * Plan 088 Phase 5 — T004: the `/api/remote-view/windows` + `/health` routes.
 *
 * Determinism: the routes resolve a daemon-control from DI and gate on NextAuth — both mocked,
 * so no daemon, no child process, no NextAuth env. Proves the contract the picker depends on:
 *   - 401 for an unauthenticated caller, returned BEFORE the container is ever resolved
 *     (the gate-before-daemon ordering — a route that skipped the gate would fail this);
 *   - 200 `{ windows: WindowDescriptor[] }` / the health verdict on the happy path (fake control);
 *   - named error codes (403 E_PERMISSION, 503 {ok:false}) instead of opaque failures (AC-14).
 */
import {
  DaemonControlError,
  type RemoteViewDaemonControl,
  createFakeDaemonControl,
} from '@/features/088-remote-view/server/daemon-control';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// vi.mock is hoisted above all top-level code, so the mock fns it references must come from
// vi.hoisted (which runs before the mocks) — not plain consts (the repo-info route-test pattern).
const { authMock, resolveMock } = vi.hoisted(() => ({ authMock: vi.fn(), resolveMock: vi.fn() }));
vi.mock('@/auth', () => ({ auth: authMock }));
vi.mock('@/lib/bootstrap-singleton', () => ({ getContainer: () => ({ resolve: resolveMock }) }));

import { GET as healthGET } from '@/../app/api/remote-view/health/route';
import { GET as windowsGET } from '@/../app/api/remote-view/windows/route';

/** Make the DI container resolve to a specific control for one test. */
function useControl(control: RemoteViewDaemonControl): void {
  resolveMock.mockReturnValue(control);
}

beforeEach(() => {
  vi.clearAllMocks();
  authMock.mockResolvedValue({ user: { name: 'alice' } }); // authenticated by default
  useControl(createFakeDaemonControl());
});

describe('GET /api/remote-view/windows', () => {
  it('returns 401 for an unauthenticated caller — before touching the daemon', async () => {
    authMock.mockResolvedValue(null);

    const res = await windowsGET();

    expect(res.status).toBe(401);
    expect(resolveMock).not.toHaveBeenCalled(); // gate runs first; daemon never resolved
  });

  it('returns 200 with the window catalog when authenticated', async () => {
    const res = await windowsGET();

    expect(res.status).toBe(200);
    const body = (await res.json()) as { windows: Array<{ id: number; app: string }> };
    expect(Array.isArray(body.windows)).toBe(true);
    expect(body.windows[0]).toMatchObject({ id: 34202, app: 'Godot' });
  });

  it('returns 403 E_PERMISSION when the Screen-Recording grant is missing', async () => {
    useControl(
      createFakeDaemonControl({
        listWindows: async () => {
          throw new DaemonControlError('E_PERMISSION', 'Screen Recording permission is required.');
        },
      })
    );

    const res = await windowsGET();

    expect(res.status).toBe(403);
    expect((await res.json()) as { error: string }).toMatchObject({ error: 'E_PERMISSION' });
  });

  it('returns 500 E_INTERNAL for any other enumeration failure', async () => {
    useControl(
      createFakeDaemonControl({
        listWindows: async () => {
          throw new DaemonControlError('E_INTERNAL', 'bundle not installed');
        },
      })
    );

    const res = await windowsGET();

    expect(res.status).toBe(500);
    expect((await res.json()) as { error: string }).toMatchObject({ error: 'E_INTERNAL' });
  });

  it('returns 503 E_BUNDLE_MISSING (named, not opaque E_INTERNAL) when the bundle is absent (T008)', async () => {
    useControl(
      createFakeDaemonControl({
        listWindows: async () => {
          throw new DaemonControlError('E_BUNDLE_MISSING', 'run `just streamd-install`');
        },
      })
    );

    const res = await windowsGET();

    expect(res.status).toBe(503);
    expect((await res.json()) as { error: string }).toMatchObject({ error: 'E_BUNDLE_MISSING' });
  });
});

describe('GET /api/remote-view/health', () => {
  it('returns 401 for an unauthenticated caller — before touching the daemon', async () => {
    authMock.mockResolvedValue(null);

    const res = await healthGET();

    expect(res.status).toBe(401);
    expect(resolveMock).not.toHaveBeenCalled();
  });

  it('returns 200 with the daemon verdict ({ ok, … }) when authenticated', async () => {
    const res = await healthGET();

    expect(res.status).toBe(200);
    expect((await res.json()) as { ok: boolean }).toMatchObject({ ok: true });
  });

  it('returns 503 { ok: false } when the daemon cannot be brought up', async () => {
    useControl(
      createFakeDaemonControl({
        health: async () => {
          throw new DaemonControlError('E_INTERNAL', 'daemon did not become healthy');
        },
      })
    );

    const res = await healthGET();

    expect(res.status).toBe(503);
    expect((await res.json()) as { ok: boolean }).toMatchObject({ ok: false });
  });

  it('returns 503 { ok:false, error:E_BUNDLE_MISSING } — agreeing with /windows on bundle state (T008)', async () => {
    useControl(
      createFakeDaemonControl({
        health: async () => {
          throw new DaemonControlError('E_BUNDLE_MISSING', 'run `just streamd-install`');
        },
      })
    );

    const res = await healthGET();

    expect(res.status).toBe(503);
    expect((await res.json()) as { ok: boolean; error: string }).toMatchObject({
      ok: false,
      error: 'E_BUNDLE_MISSING',
    });
  });
});

/**
 * T008 — the session-only gate, proven structurally. The live probe once saw `/health` answer to
 * an `X-Local-Token` alone; that was `DISABLE_AUTH=true` faking a NextAuth session in dev, NOT the
 * route accepting the token. The routes are NextAuth-only by construction: both export `GET()` with
 * ZERO parameters, so they never receive a `NextRequest` and literally cannot read a token header —
 * unlike `/sessions`, which takes `(req)` and runs `requireRemoteViewAccess` (token OR session).
 * This pins that property so a refactor can't quietly thread a request in and open a token path.
 */
describe('session-only auth gate on /health + /windows (T008, security-relevant)', () => {
  it('both route handlers take no request arg — cannot read X-Local-Token, so they are session-only', () => {
    expect(healthGET).toHaveLength(0);
    expect(windowsGET).toHaveLength(0);
  });

  it('an unauthenticated caller (no NextAuth session) is rejected 401 before the daemon is touched', async () => {
    authMock.mockResolvedValue(null); // no session; the routes can't fall back to a token

    const [h, w] = await Promise.all([healthGET(), windowsGET()]);

    expect(h.status).toBe(401);
    expect(w.status).toBe(401);
    expect(resolveMock).not.toHaveBeenCalled();
  });
});
