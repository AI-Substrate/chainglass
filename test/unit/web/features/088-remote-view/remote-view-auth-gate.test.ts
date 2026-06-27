/**
 * Plan 088 Phase 5 — T004-b: the shared remote-view NextAuth gate.
 *
 * Closes the companion-F010 / backpressure-coverage.md blind spot. The precedent
 * suite (`token-route.test.ts`) forces `DISABLE_AUTH=true`, which fakes a session
 * and makes the unauthenticated→401 branch dead code — so "401 for unauthenticated"
 * was, until now, proven NOWHERE. Here the session getter is INJECTED, so the 401
 * path is deterministically provable without DISABLE_AUTH faking a session.
 *
 * Negative control: delete the `if (!session?.user?.name)` guard inside
 * `requireRemoteViewSession` and the two 401 cases below flip to RED.
 */
import { requireRemoteViewSession } from '@/features/088-remote-view/server/remote-view-auth';
import { describe, expect, it } from 'vitest';

describe('requireRemoteViewSession — shared remote-view NextAuth gate (T004-b)', () => {
  it('rejects an unauthenticated caller (no session) with 401', async () => {
    const gate = await requireRemoteViewSession(async () => null);

    expect(gate.ok).toBe(false);
    if (gate.ok) throw new Error('unreachable: expected the gate to reject');
    expect(gate.response.status).toBe(401);
    expect(await gate.response.json()).toEqual({ error: 'Unauthorized' });
  });

  it('rejects a session that carries no user.name with 401', async () => {
    const gate = await requireRemoteViewSession(async () => ({ user: { name: null } }));

    expect(gate.ok).toBe(false);
    if (gate.ok) throw new Error('unreachable: expected the gate to reject');
    expect(gate.response.status).toBe(401);
  });

  it('passes the authenticated user through on a valid session', async () => {
    const gate = await requireRemoteViewSession(async () => ({ user: { name: 'alice' } }));

    expect(gate.ok).toBe(true);
    if (!gate.ok) throw new Error('unreachable: expected the gate to pass');
    expect(gate.session.userName).toBe('alice');
  });

  it('defaults to the real NextAuth auth() so routes call it with no args', () => {
    // Default-arg arity: the getter is optional, so a route writes
    // `await requireRemoteViewSession()` and gets the production gate.
    // (We don't invoke the default here — that would hit real auth(), which
    // needs NextAuth env; the injected-getter cases above carry the proof.)
    expect(requireRemoteViewSession).toHaveLength(0);
  });
});
