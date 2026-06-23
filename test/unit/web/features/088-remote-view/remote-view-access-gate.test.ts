// @vitest-environment node
/**
 * Plan 088 Phase 5 — F004 fix (companion HIGH on T009): the combined remote-view
 * access gate accepts EITHER a NextAuth session (browser) OR a Plan-084 local
 * credential (CLI/MCP `X-Local-Token` over loopback). The CLI verbs (T009) send
 * `X-Local-Token`, but the routes previously gated NextAuth-only — so `cg
 * remote-view *` would 401 in production. This gate closes that gap; both auth
 * sources are injected so the branches are deterministic without env/filesystem.
 */
import { requireRemoteViewAccess } from '@/features/088-remote-view/server/remote-view-auth';
import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';

function req(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest('http://localhost/api/remote-view/sessions', { headers });
}

describe('requireRemoteViewAccess — NextAuth OR local-token (F004)', () => {
  it('accepts a NextAuth session (browser flow) and never consults local auth', async () => {
    let localConsulted = false;
    const gate = await requireRemoteViewAccess(req(), {
      getSession: async () => ({ user: { name: 'alice' } }),
      localAuth: async () => {
        localConsulted = true;
        return { ok: false, reason: 'no-credential' };
      },
    });
    expect(gate.ok).toBe(true);
    if (gate.ok) expect(gate.session.userName).toBe('alice');
    expect(localConsulted).toBe(false); // session short-circuits — CLI has no cookie
  });

  it('accepts a valid local token when there is no session (CLI/MCP flow)', async () => {
    const gate = await requireRemoteViewAccess(req({ 'x-local-token': 'tok' }), {
      getSession: async () => null,
      localAuth: async () => ({ ok: true, via: 'local-token' }),
    });
    expect(gate.ok).toBe(true);
    if (gate.ok) expect(gate.session.userName).toContain('local');
  });

  it('401s when neither a session nor a valid local credential is present', async () => {
    const gate = await requireRemoteViewAccess(req(), {
      getSession: async () => null,
      localAuth: async () => ({ ok: false, reason: 'no-credential' }),
    });
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.response.status).toBe(401);
  });
});
