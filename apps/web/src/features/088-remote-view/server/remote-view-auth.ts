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
 * Plan 088 Phase 2 — T008.
 */

/** JWT `iss` claim — same issuer as the terminal socket. */
export const REMOTE_VIEW_JWT_ISSUER = 'chainglass';

/** JWT `aud` claim mandated by the remote-view stream-socket auth contract. */
export const REMOTE_VIEW_JWT_AUDIENCE = 'remote-view-ws';
