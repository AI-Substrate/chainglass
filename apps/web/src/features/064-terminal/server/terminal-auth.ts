/**
 * Terminal-WS auth surface — pure functions and constants only.
 *
 * Plan 084 Phase 4 (2026-05-03). Lives in its own module so the
 * Next.js route handlers (`apps/web/app/api/terminal/token/route.ts`) can
 * import the JWT shape contract + validators without dragging in the
 * sidecar-only dependencies (`ws`, `node-pty`, activity-log writer) that
 * `terminal-ws.ts` carries. Server-only — uses `node:crypto`-backed
 * primitives via `@chainglass/shared`.
 *
 * `terminal-ws.ts` re-exports every name here for backward-compat with
 * existing tests; new consumers should import directly from this file.
 */
import { networkInterfaces } from 'node:os';
import { activeSigningSecret } from '@chainglass/shared/auth-bootstrap-code';
import { readServerInfo } from '@chainglass/shared/event-popper';
import { jwtVerify } from 'jose';

/** JWT `iss` claim mandated by the terminal-WS auth contract. */
export const TERMINAL_JWT_ISSUER = 'chainglass';

/** JWT `aud` claim mandated by the terminal-WS auth contract. */
export const TERMINAL_JWT_AUDIENCE = 'terminal-ws';

export interface ValidateTerminalJwtOpts {
  /** HMAC key (Buffer for HKDF / AUTH_SECRET path) — passed directly to `jose.jwtVerify` without re-encoding. */
  readonly key: Buffer | Uint8Array;
  /** Expected `cwd` claim — must equal the sidecar's resolved workspace root. */
  readonly expectedCwd: string;
}

export type UpgradeAuthResult =
  | { ok: true; username: string }
  | {
      ok: false;
      code: number;
      /**
       * Verbose reason — safe for log lines + JSON error payloads. May
       * include attacker-controlled user input (e.g., the offending Origin).
       */
      reason: string;
      /**
       * Short close-frame reason — UTF-8 byte length always ≤ 123 (RFC 6455
       * limit; `ws` library throws above this). NEVER includes user input.
       * Use this with `ws.close(code, closeReason)`; use `reason` for JSON
       * payload + logs.
       *
       * F001 (code-review 2026-05-03): a long attacker-controlled Origin
       * echoed into the close reason would otherwise crash the sidecar.
       */
      closeReason: string;
    };

/**
 * Verify a terminal-WS JWT and assert the required claims:
 *   - signature is valid for `opts.key`
 *   - `iss` is the literal string `chainglass` (presence-checked via `typeof`)
 *   - `aud` is the literal string `terminal-ws` (presence-checked)
 *   - `cwd` exactly equals `opts.expectedCwd` (presence-checked)
 *   - `sub` is a non-empty string (returned as username)
 *
 * Failure → `{ ok: false, code: 4403, reason }`. Never throws.
 */
export async function validateTerminalJwt(
  token: string,
  opts: ValidateTerminalJwtOpts,
): Promise<UpgradeAuthResult> {
  try {
    const { payload } = await jwtVerify(token, opts.key);
    if (typeof payload.iss !== 'string' || payload.iss !== TERMINAL_JWT_ISSUER) {
      return { ok: false, code: 4403, reason: 'Invalid token (iss)', closeReason: 'Invalid token' };
    }
    if (typeof payload.aud !== 'string' || payload.aud !== TERMINAL_JWT_AUDIENCE) {
      return { ok: false, code: 4403, reason: 'Invalid token (aud)', closeReason: 'Invalid token' };
    }
    if (typeof payload.cwd !== 'string' || payload.cwd !== opts.expectedCwd) {
      return { ok: false, code: 4403, reason: 'Invalid token (cwd)', closeReason: 'Invalid token' };
    }
    if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
      return { ok: false, code: 4403, reason: 'Invalid token (sub)', closeReason: 'Invalid token' };
    }
    return { ok: true, username: payload.sub };
  } catch {
    return { ok: false, code: 4403, reason: 'Invalid or expired token', closeReason: 'Invalid or expired token' };
  }
}

/**
 * Parse the optional `TERMINAL_WS_ALLOWED_ORIGINS` env var (comma-separated
 * list of origins for `0.0.0.0` / remote-dev deployments).
 *
 * Returns `null` when unset / blank — caller falls back to the localhost
 * default.
 */
export function parseAllowedOrigins(envValue: string | undefined): Set<string> | null {
  if (envValue === undefined) return null;
  const trimmed = envValue.trim();
  if (trimmed.length === 0) return null;
  const list = trimmed
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (list.length === 0) return null;
  return new Set(list);
}

/**
 * Enumerate the host strings to include in the default Origin allowlist.
 *
 * Always includes `localhost` and `127.0.0.1`. When the sidecar runs in a
 * dev setup that's reachable on the LAN (the user browses
 * `http://192.168.x.y:3000` from a phone or another device), the WebSocket
 * upgrade's `Origin` will carry that LAN IP — so we enumerate every
 * non-internal IPv4 interface address from `os.networkInterfaces()` too.
 *
 * IPv6 (`[::1]` and global IPv6) is NOT auto-enumerated — operators using
 * IPv6 must opt in via `TERMINAL_WS_ALLOWED_ORIGINS`. Auto-detection of
 * IPv6 broadens the surface in ways that depend on the environment in
 * non-obvious ways; explicit opt-in keeps the threat model legible.
 *
 * Note: this does NOT weaken CSWSH protection — the JWT (signed via
 * `activeSigningSecret(cwd)`) is the actual gate. The Origin allowlist's
 * job is to reject same-origin attackers from a different page; LAN IPs
 * are covered by JWT possession.
 */
export function getLocalNetworkHosts(): string[] {
  const hosts = new Set<string>(['localhost', '127.0.0.1']);
  try {
    for (const ifaces of Object.values(networkInterfaces())) {
      for (const i of ifaces ?? []) {
        if (i.family === 'IPv4' && !i.internal) {
          hosts.add(i.address);
        }
      }
    }
  } catch {
    // os.networkInterfaces() is best-effort; if it fails, we still have the loopbacks.
  }
  return Array.from(hosts);
}

/**
 * Default Origin allowlist for browser-driven WebSocket upgrades.
 *
 * `hosts` defaults to `['localhost', '127.0.0.1']` — the sidecar passes
 * the broader `getLocalNetworkHosts()` set so LAN-IP browsing works
 * without forcing operators to set `TERMINAL_WS_ALLOWED_ORIGINS`.
 *
 * Browsers may send `Origin` as either named or numeric loopback variants;
 * both are enumerated. `Origin: null` (private mode / file://) is rejected
 * by `authorizeUpgrade`, not represented here.
 */
export function buildDefaultAllowedOrigins(
  port: string,
  httpsEnabled: boolean,
  hosts: readonly string[] = ['localhost', '127.0.0.1'],
): Set<string> {
  const out = new Set<string>();
  for (const h of hosts) {
    out.add(`http://${h}:${port}`);
    if (httpsEnabled) out.add(`https://${h}:${port}`);
  }
  return out;
}

/**
 * Discover the active Next.js port for the default Origin allowlist.
 * Reads `<cwd>/.chainglass/server.json` (Plan 067 port-discovery); falls back
 * to `process.env.PORT ?? '3000'` with a `console.warn` when the file is
 * missing or stale (race: sidecar started before Next wrote `server.json`).
 */
export function discoverNextPort(cwd: string): string {
  const info = readServerInfo(cwd);
  if (info && Number.isFinite(info.port)) return String(info.port);
  const envPort = process.env.PORT;
  if (envPort && envPort.length > 0) {
    console.warn(
      `[terminal] .chainglass/server.json not found at cwd=${cwd}; falling back to PORT=${envPort} for Origin allowlist. ` +
        `Set TERMINAL_WS_ALLOWED_ORIGINS to override.`,
    );
    return envPort;
  }
  console.warn(
    `[terminal] .chainglass/server.json not found and PORT env var unset; falling back to port 3000 for Origin allowlist. ` +
      `Set TERMINAL_WS_ALLOWED_ORIGINS to override.`,
  );
  return '3000';
}

export interface UpgradeAuthOpts {
  /** Sidecar workspace root (must be `findWorkspaceRoot(process.cwd())` to match the main Next.js process). */
  readonly cwd: string;
  /** Origin allowlist (default-built or env-overridden). */
  readonly allowedOrigins: ReadonlySet<string>;
  /** HMAC key — passed directly to `jose` without re-encoding. */
  readonly signingKey: Buffer | Uint8Array;
}

/**
 * Full upgrade-time auth check: Origin allowlist → JWT extract → claim
 * verification. Returns `{ok:true, username}` on success; `{ok:false, code, reason}`
 * with WS close codes 4401 (missing token) or 4403 (Origin / claim violation).
 */
export async function authorizeUpgrade(
  req: { headers: { origin?: string; host?: string }; url?: string },
  opts: UpgradeAuthOpts,
): Promise<UpgradeAuthResult> {
  const origin = req.headers.origin;
  if (typeof origin !== 'string' || origin.length === 0) {
    return {
      ok: false,
      code: 4403,
      reason: 'Origin header missing',
      closeReason: 'Origin header missing',
    };
  }
  if (origin === 'null') {
    return {
      ok: false,
      code: 4403,
      reason: 'Origin null (private mode / file://) rejected',
      closeReason: 'Origin not allowed',
    };
  }
  if (!opts.allowedOrigins.has(origin)) {
    // Verbose reason includes the offending origin (for logs / JSON payload),
    // but the close-frame reason is a fixed-length constant — F001.
    return {
      ok: false,
      code: 4403,
      reason: `Origin not allowed: ${origin}`,
      closeReason: 'Origin not allowed',
    };
  }

  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const token = url.searchParams.get('token');
  if (typeof token !== 'string' || token.length === 0) {
    return {
      ok: false,
      code: 4401,
      reason: 'Missing auth token',
      closeReason: 'Missing auth token',
    };
  }

  return validateTerminalJwt(token, { key: opts.signingKey, expectedCwd: opts.cwd });
}

/**
 * Startup assertion: bootstrap-code.json must be readable at `cwd`.
 *
 * Calls `activeSigningSecret(cwd)`, which reads/generates the file. If the
 * read throws (EISDIR, ENOENT, EACCES, malformed JSON, etc.), the error
 * propagates with a clear `[terminal] startup-assertion` prefix; caller
 * (`start()`) converts it to `console.error` + `process.exit(1)`.
 *
 * **AC-22 compliance**: the wrapped error contains the cwd path (operator
 * needs it to debug) but never the bootstrap code value (audit requirement).
 */
export function assertBootstrapReadable(cwd: string): void {
  try {
    activeSigningSecret(cwd);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(
      `[terminal] startup-assertion: cannot read .chainglass/bootstrap-code.json at cwd=${cwd}. ` +
        `Sidecar cwd must match main Next.js process cwd. In container deployments, mount ` +
        `.chainglass/ as a host volume containing a pre-generated bootstrap-code.json (see ` +
        `CHAINGLASS_CONTAINER docs, Plan 067). Detail: ${detail}`,
    );
  }
}
