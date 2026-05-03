/**
 * @vitest-environment node
 *
 * Plan 084 Phase 5 T004 — auth.ts env-var alias + warn-once tests.
 *
 * Verifies:
 *   (i)   DISABLE_GITHUB_OAUTH=true → fake session
 *   (ii)  DISABLE_AUTH=true (legacy) → fake session + console.warn
 *   (iii) both unset → real auth path (returns NextAuth's auth fn — we just
 *         confirm it's NOT the fake-session shape)
 *   (iv)  both set → fake session + warn-once (legacy still warns)
 *   (v)   warn-once: two auth() calls in same process → only one warning
 *   (vi)  HMR-safe warn-once: simulate module re-import via vi.resetModules()
 *         → flag persists on globalThis, no second warning
 *
 * Constitution P4 — no `vi.mock` of console; real spy on `console.warn`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const FLAG_KEY = '__CHAINGLASS_DISABLE_AUTH_WARNED';

describe('auth.ts env-var alias + warn-once (T004)', () => {
  let originalDisableAuth: string | undefined;
  let originalDisableGithub: string | undefined;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    originalDisableAuth = process.env.DISABLE_AUTH;
    originalDisableGithub = process.env.DISABLE_GITHUB_OAUTH;
    delete process.env.DISABLE_AUTH;
    delete process.env.DISABLE_GITHUB_OAUTH;
    delete (globalThis as Record<string, unknown>)[FLAG_KEY];
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // Force fresh module load so wrapper picks up the cleaned env.
    vi.resetModules();
  });

  afterEach(() => {
    if (originalDisableAuth === undefined) {
      delete process.env.DISABLE_AUTH;
    } else {
      process.env.DISABLE_AUTH = originalDisableAuth;
    }
    if (originalDisableGithub === undefined) {
      delete process.env.DISABLE_GITHUB_OAUTH;
    } else {
      process.env.DISABLE_GITHUB_OAUTH = originalDisableGithub;
    }
    delete (globalThis as Record<string, unknown>)[FLAG_KEY];
    warnSpy.mockRestore();
  });

  // (i) DISABLE_GITHUB_OAUTH=true → fake session, no warning
  it('(i) DISABLE_GITHUB_OAUTH=true → fake session, NO warning', async () => {
    process.env.DISABLE_GITHUB_OAUTH = 'true';
    const { auth } = await import('../../../apps/web/src/auth');
    const session = await auth();
    expect(session).toEqual({ user: { name: 'debug', email: 'debug@local' } });
    expect(warnSpy).not.toHaveBeenCalled();
  });

  // (ii) DISABLE_AUTH=true (legacy) → fake session + warn
  it('(ii) DISABLE_AUTH=true (legacy) → fake session + warn-once', async () => {
    process.env.DISABLE_AUTH = 'true';
    const { auth } = await import('../../../apps/web/src/auth');
    const session = await auth();
    expect(session).toEqual({ user: { name: 'debug', email: 'debug@local' } });
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const msg = String(warnSpy.mock.calls[0][0]);
    expect(msg).toContain('DISABLE_AUTH is deprecated');
    expect(msg).toContain('DISABLE_GITHUB_OAUTH');
  });

  // (iii) both unset → does NOT return fake-session shape (real auth path)
  // We can't fully exercise NextAuth here without a session, but the wrapper
  // must NOT short-circuit to {user: debug}. It returns a function-or-promise
  // from NextAuth's _auth proxy; we just assert non-fake.
  it('(iii) both unset → does NOT return fake debug session', async () => {
    const { auth } = await import('../../../apps/web/src/auth');
    // auth() with no args goes through NextAuth's real path. In test env
    // (no GitHub creds, no session cookie) it returns null or rejects.
    // Either way: NOT the fake debug session.
    let result: unknown;
    try {
      result = await auth();
    } catch {
      result = 'real-auth-threw';
    }
    expect(result).not.toEqual({ user: { name: 'debug', email: 'debug@local' } });
  });

  // (iv) both set → fake session + warn-once (legacy still triggers warning)
  it('(iv) both set → fake session + warn-once (legacy still warns)', async () => {
    process.env.DISABLE_AUTH = 'true';
    process.env.DISABLE_GITHUB_OAUTH = 'true';
    const { auth } = await import('../../../apps/web/src/auth');
    const session = await auth();
    expect(session).toEqual({ user: { name: 'debug', email: 'debug@local' } });
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  // (v) warn-once: two auth() calls in same process → only one warning
  it('(v) warn-once: two auth() calls → exactly 1 warning', async () => {
    process.env.DISABLE_AUTH = 'true';
    const { auth } = await import('../../../apps/web/src/auth');
    await auth();
    await auth();
    await auth();
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  // (vi) HMR-safe: re-import the module (simulates HMR) — flag on globalThis persists
  it('(vi) HMR-safe warn-once: re-import module → still only 1 warning total', async () => {
    process.env.DISABLE_AUTH = 'true';
    // First "module load" — triggers warn
    const auth1 = (await import('../../../apps/web/src/auth')).auth;
    await auth1();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    // Simulate HMR — reset module cache but NOT globalThis flag
    vi.resetModules();
    const auth2 = (await import('../../../apps/web/src/auth')).auth;
    await auth2();
    // The globalThis flag persists across module reload → no second warning
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  // (vii) Middleware-style call (callback arg) under DISABLE_GITHUB_OAUTH
  // returns a pass-through function (no session check).
  it('(vii) DISABLE_GITHUB_OAUTH=true with callback arg → pass-through middleware', async () => {
    process.env.DISABLE_GITHUB_OAUTH = 'true';
    const { auth } = await import('../../../apps/web/src/auth');
    const middleware = auth(async () => undefined);
    expect(typeof middleware).toBe('function');
  });
});
