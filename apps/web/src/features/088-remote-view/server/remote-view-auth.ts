/**
 * Remote-view stream-socket auth surface — JWT claim constants.
 *
 * Mirrors `features/064-terminal/server/terminal-auth.ts` so the token route
 * stays a near-verbatim copy of the terminal route (Finding 03 — frozen HKDF
 * mint contract: copy, don't redesign). The ONLY differences from terminal are
 * the audience (`remote-view-ws`) and that remote-view JWTs carry NO `cwd` claim.
 *
 * The Origin allowlist helpers (`buildDefaultAllowedOrigins`, `parseAllowedOrigins`
 * in terminal-auth.ts) are consumed by the Swift daemon's upgrade check
 * (Plan 088 Task 4.4), NOT by this route — so they are not re-exported here.
 *
 * Plan 088 Phase 2 — T008; the shared session gate added in Phase 5 (T004).
 */

import { auth } from '@/auth';
import { NextResponse } from 'next/server';

/** JWT `iss` claim — same issuer as the terminal socket. */
export const REMOTE_VIEW_JWT_ISSUER = 'chainglass';

/** JWT `aud` claim mandated by the remote-view stream-socket auth contract. */
export const REMOTE_VIEW_JWT_AUDIENCE = 'remote-view-ws';

/** The authenticated identity a remote-view route proceeds with. */
export interface RemoteViewAuthedSession {
  /** `session.user.name` — the JWT `sub` and the audit identity. */
  userName: string;
}

/**
 * Injectable NextAuth session source. Defaults to the real `auth()`; unit tests
 * pass a stub so the unauthenticated→401 branch is provable WITHOUT relying on
 * `DISABLE_AUTH` (which fakes a session and would make that branch dead code).
 */
export type SessionGetter = () => Promise<{ user?: { name?: string | null } | null } | null>;

/** Discriminated result: proceed with `session`, or return `response` verbatim. */
export type RequireSessionResult =
  | { ok: true; session: RemoteViewAuthedSession }
  | { ok: false; response: NextResponse };

/**
 * The single NextAuth gate for every remote-view API route (T004 onward).
 *
 * One tested gate replaces the per-route hand-copied `auth()` pre-check, so a
 * route that forgets, mis-orders, or mis-wires the check can no longer ship
 * green. The precedent (`token/route.ts`) leaves this unproven: its suite forces
 * `DISABLE_AUTH=true`, faking a session (companion F010; backpressure-coverage.md
 * T004-b). `getSession` is injectable so the 401 branch is deterministic in unit
 * tests. Routes call it with no args and must return the 401 BEFORE touching the
 * daemon:
 *
 *   const gate = await requireRemoteViewSession();
 *   if (!gate.ok) return gate.response;
 *   // …proxy with gate.session…
 */
export async function requireRemoteViewSession(
  getSession: SessionGetter = () => auth(),
): Promise<RequireSessionResult> {
  const session = await getSession();
  if (!session?.user?.name) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }
  return { ok: true, session: { userName: session.user.name } };
}
