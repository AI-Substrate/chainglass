// @vitest-environment node
// Server-side code (node:fs, node:crypto, jose); jsdom env breaks jose's
// `payload instanceof Uint8Array` check via cross-realm Uint8Array.
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  TERMINAL_JWT_AUDIENCE,
  TERMINAL_JWT_ISSUER,
  type TerminalServerDeps,
  assertBootstrapReadable,
  authorizeUpgrade,
  buildDefaultAllowedOrigins,
  createTerminalServer,
  parseAllowedOrigins,
  validateTerminalJwt,
} from '@/features/064-terminal/server/terminal-ws';
import {
  _resetSigningSecretCacheForTests,
  activeSigningSecret,
} from '@chainglass/shared/auth-bootstrap-code';
import { SignJWT } from 'jose';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type FakePty, createFakePtySpawner } from '../../../../fakes/fake-pty';
import { FakeTmuxExecutor } from '../../../../fakes/fake-tmux-executor';

function createFakeWs() {
  const sent: string[] = [];
  let closeCode: number | undefined;
  let closeReason: string | undefined;
  let messageHandler: ((data: Buffer | string) => void) | null = null;
  let closeHandler: (() => void) | null = null;
  let closed = false;

  return {
    send: (data: string) => {
      if (!closed) sent.push(data);
    },
    close: (code?: number, reason?: string) => {
      closed = true;
      closeCode = code;
      closeReason = reason;
      closeHandler?.();
    },
    on: (event: string, handler: (...args: unknown[]) => void) => {
      if (event === 'message') messageHandler = handler as (data: Buffer | string) => void;
      if (event === 'close') closeHandler = handler as () => void;
    },
    get sent() {
      return sent;
    },
    get closeCode() {
      return closeCode;
    },
    get closeReason() {
      return closeReason;
    },
    get closed() {
      return closed;
    },
    simulateMessage: (data: string) => messageHandler?.(data),
    simulateClose: () => closeHandler?.(),
    readyState: 1,
    OPEN: 1,
  };
}

describe('Terminal WebSocket Server', () => {
  let exec: FakeTmuxExecutor;
  let spawner: ReturnType<typeof createFakePtySpawner>;
  let deps: TerminalServerDeps;

  beforeEach(() => {
    exec = new FakeTmuxExecutor();
    spawner = createFakePtySpawner();
    deps = { execCommand: exec.exec, spawnPty: spawner.spawn };
  });

  describe('handleConnection', () => {
    it('should spawn PTY with correct tmux args when session and cwd provided', () => {
      /*
      Test Doc:
      - Why: Core connect flow — browser provides session name + CWD
      - Contract: handleConnection spawns PTY via TmuxSessionManager
      - Usage Notes: Session name and CWD from URL query params
      - Quality Contribution: Verifies the full connect path
      - Worked Example: ?session=064-tmux&cwd=/path → pty.spawn('tmux', ['new-session', '-A', ...])
      */
      exec.whenCommand('tmux', ['-V']).returns('tmux 3.4');
      const server = createTerminalServer(deps);
      const ws = createFakeWs();

      server.handleConnection(ws as unknown as import('ws').WebSocket, '064-tmux', process.cwd());

      expect(spawner.spawnCount).toBe(1);
      const statusMsg = JSON.parse(ws.sent[0]);
      expect(statusMsg.type).toBe('status');
      expect(statusMsg.status).toBe('connected');
      expect(statusMsg.tmux).toBe(true);
    });

    it('should pipe client data to PTY write', () => {
      /*
      Test Doc:
      - Why: Input path — user keystrokes must reach the terminal
      - Contract: ws.onmessage → pty.write for data messages
      - Usage Notes: Only raw string data is forwarded; JSON messages are parsed separately
      - Quality Contribution: Verifies bidirectional I/O
      - Worked Example: client sends "ls\n" → pty.write("ls\n")
      */
      exec.whenCommand('tmux', ['-V']).returns('tmux 3.4');
      const server = createTerminalServer(deps);
      const ws = createFakeWs();

      server.handleConnection(ws as unknown as import('ws').WebSocket, '064-tmux', process.cwd());
      ws.simulateMessage('ls -la\n');

      const pty = spawner.lastInstance as FakePty;
      expect(pty.writeCalls).toContain('ls -la\n');
    });

    it('should pipe PTY data to ws.send', () => {
      /*
      Test Doc:
      - Why: Output path — terminal output must reach the browser
      - Contract: pty.onData → ws.send
      - Usage Notes: Raw string data, no JSON wrapping for terminal output
      - Quality Contribution: Verifies bidirectional I/O
      - Worked Example: pty emits "drwxr-xr-x" → ws.send("drwxr-xr-x")
      */
      exec.whenCommand('tmux', ['-V']).returns('tmux 3.4');
      const server = createTerminalServer(deps);
      const ws = createFakeWs();

      server.handleConnection(ws as unknown as import('ws').WebSocket, '064-tmux', process.cwd());
      const pty = spawner.lastInstance as FakePty;
      pty.simulateData('drwxr-xr-x  12 user  staff  384 Jan 10 10:00 .\n');

      // First message is status, second is terminal output
      expect(ws.sent.length).toBeGreaterThanOrEqual(2);
      expect(ws.sent[1]).toContain('drwxr-xr-x');
    });

    it('should handle resize messages', () => {
      /*
      Test Doc:
      - Why: Terminal resize — browser window changes dimensions
      - Contract: JSON {type:'resize', cols, rows} → pty.resize(cols, rows)
      - Usage Notes: Resize messages are JSON, not raw strings
      - Quality Contribution: Verifies tmux gets SIGWINCH on resize
      - Worked Example: {type:"resize", cols:120, rows:40} → pty.resize(120, 40)
      */
      exec.whenCommand('tmux', ['-V']).returns('tmux 3.4');
      const server = createTerminalServer(deps);
      const ws = createFakeWs();

      server.handleConnection(ws as unknown as import('ws').WebSocket, '064-tmux', process.cwd());
      ws.simulateMessage(JSON.stringify({ type: 'resize', cols: 120, rows: 40 }));

      const pty = spawner.lastInstance as FakePty;
      pty.assertResized(120, 40);
    });

    it('should kill PTY on client disconnect', () => {
      /*
      Test Doc:
      - Why: Cleanup — browser closes, PTY must be freed (but tmux session survives)
      - Contract: ws.onclose → pty.kill()
      - Usage Notes: Killing PTY kills tmux CLIENT, not the SESSION
      - Quality Contribution: Prevents zombie PTY processes
      - Worked Example: ws close → pty.kill() → tmux session continues in background
      */
      exec.whenCommand('tmux', ['-V']).returns('tmux 3.4');
      const server = createTerminalServer(deps);
      const ws = createFakeWs();

      server.handleConnection(ws as unknown as import('ws').WebSocket, '064-tmux', process.cwd());
      const pty = spawner.lastInstance as FakePty;
      expect(pty.killed).toBe(false);

      ws.simulateClose();
      expect(pty.killed).toBe(true);
    });

    it('should support multiple clients for the same session', () => {
      /*
      Test Doc:
      - Why: Multi-client — terminal page + overlay both connect to same tmux session
      - Contract: Second client for same session gets own PTY (both attach to same tmux session)
      - Usage Notes: Each PTY is a separate tmux client; tmux mirrors output to all
      - Quality Contribution: Verifies multi-viewer support
      - Worked Example: Two ws connect for "064-tmux" → two PTYs spawned → tmux handles mirroring
      */
      exec.whenCommand('tmux', ['-V']).returns('tmux 3.4');
      const server = createTerminalServer(deps);
      const ws1 = createFakeWs();
      const ws2 = createFakeWs();

      server.handleConnection(ws1 as unknown as import('ws').WebSocket, '064-tmux', process.cwd());
      server.handleConnection(ws2 as unknown as import('ws').WebSocket, '064-tmux', process.cwd());

      expect(spawner.spawnCount).toBe(2);
    });

    it('should fall back to raw shell when tmux unavailable', () => {
      /*
      Test Doc:
      - Why: Graceful degradation — terminal works even without tmux
      - Contract: When tmux unavailable, spawn user's $SHELL + send {tmux:false} status
      - Usage Notes: Client shows toast warning about no persistence
      - Quality Contribution: Feature works on machines without tmux installed
      - Worked Example: tmux -V fails → spawn /bin/bash → {type:"status", tmux:false}
      */
      // No tmux configured → unavailable
      const server = createTerminalServer(deps);
      const ws = createFakeWs();

      server.handleConnection(ws as unknown as import('ws').WebSocket, '064-tmux', process.cwd());

      expect(spawner.spawnCount).toBe(1);
      const statusMsg = JSON.parse(ws.sent[0]);
      expect(statusMsg.type).toBe('status');
      expect(statusMsg.tmux).toBe(false);
      expect(statusMsg.message).toContain('tmux not available');
      expect(statusMsg.message).toContain('raw shell');
    });

    it('should reject invalid CWD paths', () => {
      /*
      Test Doc:
      - Why: Security — prevent directory traversal via CWD query param
      - Contract: Invalid CWD → error message + close with 4400
      - Usage Notes: FT-001 fix — validates CWD before PTY spawn
      - Quality Contribution: Blocks traversal attacks
      - Worked Example: cwd="/etc/passwd" → close(4400)
      */
      exec.whenCommand('tmux', ['-V']).returns('tmux 3.4');
      const server = createTerminalServer(deps);
      const ws = createFakeWs();

      server.handleConnection(ws as unknown as import('ws').WebSocket, '064-tmux', '/etc/passwd');

      expect(ws.closed).toBe(true);
      expect(ws.closeCode).toBe(4400);
      expect(spawner.spawnCount).toBe(0);
    });

    it('should handle PTY spawn failures gracefully', () => {
      /*
      Test Doc:
      - Why: Resilience — PTY spawn can fail (permissions, binary missing)
      - Contract: spawn failure → error message + close with 1011, no crash
      - Usage Notes: FT-002 fix — try/catch around spawn path
      - Quality Contribution: Server stays up when one connection fails
      - Worked Example: pty.spawn throws → {type:"error"} + close(1011)
      */
      exec.whenCommand('tmux', ['-V']).returns('tmux 3.4');
      const throwingSpawner = {
        spawn: () => {
          throw new Error('spawn EACCES');
        },
        lastInstance: null,
        instances: [],
        spawnCount: 0,
      };
      const server = createTerminalServer({
        execCommand: exec.exec,
        spawnPty: throwingSpawner.spawn,
      });
      const ws = createFakeWs();

      server.handleConnection(ws as unknown as import('ws').WebSocket, '064-tmux', process.cwd());

      expect(ws.closed).toBe(true);
      expect(ws.closeCode).toBe(1011);
      const errorMsg = JSON.parse(ws.sent[0]);
      expect(errorMsg.type).toBe('error');
      expect(errorMsg.message).toContain('Failed to start terminal process');
    });
  });

  describe('port derivation', () => {
    it('should derive port from PORT env + 1500', () => {
      /*
      Test Doc:
      - Why: Multi-worktree support — each worktree uses different ports
      - Contract: derivePort(3000) returns 4500; derivePort(3004) returns 4504
      - Usage Notes: Overridable via TERMINAL_WS_PORT env var
      - Quality Contribution: Prevents port conflicts across worktrees
      - Worked Example: PORT=3000 → WS port 4500; TERMINAL_WS_PORT=5000 → 5000
      */
      const server = createTerminalServer(deps);
      expect(server.derivePort(3000)).toBe(4500);
      expect(server.derivePort(3004)).toBe(4504);
    });
  });

  // ───────────────────────────────────────────────────────────────────────
  // Plan 084 Phase 4 — Terminal sidecar hardening
  // T001 RED tests for: always-on auth (HKDF path), iss/aud/cwd claim
  // presence + equality, Origin allowlist, AC-22 log discipline,
  // startup cwd assertion, periodic auth-refresh handler.
  // ───────────────────────────────────────────────────────────────────────

  describe('Phase 4 — auth surface', () => {
    let tempCwd: string;
    const origAuthSecret = process.env.AUTH_SECRET;

    beforeEach(() => {
      tempCwd = mkdtempSync(join(tmpdir(), 'p4-terminal-ws-'));
      mkdirSync(join(tempCwd, '.chainglass'), { recursive: true });
      // Pre-write a bootstrap-code file so HKDF derivation works deterministically.
      writeFileSync(
        join(tempCwd, '.chainglass', 'bootstrap-code.json'),
        JSON.stringify({
          version: 1,
          code: 'TEST-PHS4-AAAA',
          createdAt: '2026-05-03T00:00:00.000Z',
          rotatedAt: '2026-05-03T00:00:00.000Z',
        })
      );
      delete process.env.AUTH_SECRET;
      _resetSigningSecretCacheForTests();
    });

    afterEach(() => {
      if (origAuthSecret === undefined) delete process.env.AUTH_SECRET;
      else process.env.AUTH_SECRET = origAuthSecret;
      _resetSigningSecretCacheForTests();
      rmSync(tempCwd, { recursive: true, force: true });
    });

    describe('JWT shape constants', () => {
      it('exposes the issuer and audience as exported constants', () => {
        // Why: Phase 7 docs and external consumers need to reference the
        // exact strings; constants prevent drift.
        expect(TERMINAL_JWT_ISSUER).toBe('chainglass');
        expect(TERMINAL_JWT_AUDIENCE).toBe('terminal-ws');
      });
    });

    describe('validateTerminalJwt (always-on, HKDF path)', () => {
      async function signJwt(claims: Record<string, unknown>, key: Buffer): Promise<string> {
        const builder = new SignJWT(claims).setProtectedHeader({ alg: 'HS256' });
        if (claims.iat === undefined) builder.setIssuedAt();
        if (claims.exp === undefined) builder.setExpirationTime('5m');
        return builder.sign(key);
      }

      it('accepts a JWT signed via HKDF when AUTH_SECRET is unset (silent-bypass closed)', async () => {
        // Why: Finding 01 — terminal-WS must NOT silently degrade to no-auth
        // when AUTH_SECRET is unset. HKDF-derived key takes over.
        const key = activeSigningSecret(tempCwd);
        const token = await signJwt(
          {
            sub: 'alice',
            iss: TERMINAL_JWT_ISSUER,
            aud: TERMINAL_JWT_AUDIENCE,
            cwd: tempCwd,
          },
          key
        );

        const result = await validateTerminalJwt(token, { key, expectedCwd: tempCwd });
        expect(result).toEqual({ ok: true, username: 'alice' });
      });

      it('rejects a JWT with wrong iss with 4403', async () => {
        const key = activeSigningSecret(tempCwd);
        const token = await signJwt(
          { sub: 'alice', iss: 'evil', aud: TERMINAL_JWT_AUDIENCE, cwd: tempCwd },
          key
        );
        const result = await validateTerminalJwt(token, { key, expectedCwd: tempCwd });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.code).toBe(4403);
      });

      it('rejects a JWT with wrong aud with 4403', async () => {
        const key = activeSigningSecret(tempCwd);
        const token = await signJwt(
          { sub: 'alice', iss: TERMINAL_JWT_ISSUER, aud: 'other-service', cwd: tempCwd },
          key
        );
        const result = await validateTerminalJwt(token, { key, expectedCwd: tempCwd });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.code).toBe(4403);
      });

      it('rejects a JWT with wrong cwd with 4403', async () => {
        const key = activeSigningSecret(tempCwd);
        const token = await signJwt(
          {
            sub: 'alice',
            iss: TERMINAL_JWT_ISSUER,
            aud: TERMINAL_JWT_AUDIENCE,
            cwd: '/some/other/cwd',
          },
          key
        );
        const result = await validateTerminalJwt(token, { key, expectedCwd: tempCwd });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.code).toBe(4403);
      });

      it('rejects a JWT with MISSING iss claim with 4403 (no silent undefined === undefined)', async () => {
        // Why: validate-v2 fix — typeof !== 'string' presence check before equality.
        const key = activeSigningSecret(tempCwd);
        const token = await signJwt(
          { sub: 'alice', aud: TERMINAL_JWT_AUDIENCE, cwd: tempCwd },
          key
        );
        const result = await validateTerminalJwt(token, { key, expectedCwd: tempCwd });
        expect(result.ok).toBe(false);
      });

      it('rejects a JWT with MISSING aud claim with 4403', async () => {
        const key = activeSigningSecret(tempCwd);
        const token = await signJwt(
          { sub: 'alice', iss: TERMINAL_JWT_ISSUER, cwd: tempCwd },
          key
        );
        const result = await validateTerminalJwt(token, { key, expectedCwd: tempCwd });
        expect(result.ok).toBe(false);
      });

      it('rejects a JWT with MISSING cwd claim with 4403', async () => {
        const key = activeSigningSecret(tempCwd);
        const token = await signJwt(
          { sub: 'alice', iss: TERMINAL_JWT_ISSUER, aud: TERMINAL_JWT_AUDIENCE },
          key
        );
        const result = await validateTerminalJwt(token, { key, expectedCwd: tempCwd });
        expect(result.ok).toBe(false);
      });

      it('rejects a JWT signed with the wrong key (forgery attempt) with 4403', async () => {
        const wrongKey = Buffer.from('not-the-real-key-not-the-real-key', 'utf-8');
        const token = await signJwt(
          {
            sub: 'alice',
            iss: TERMINAL_JWT_ISSUER,
            aud: TERMINAL_JWT_AUDIENCE,
            cwd: tempCwd,
          },
          wrongKey
        );
        const realKey = activeSigningSecret(tempCwd);
        const result = await validateTerminalJwt(token, { key: realKey, expectedCwd: tempCwd });
        expect(result.ok).toBe(false);
      });

      it('rejects a malformed token with 4403 (no plaintext fallback)', async () => {
        const key = activeSigningSecret(tempCwd);
        const result = await validateTerminalJwt('not-a-jwt-at-all', {
          key,
          expectedCwd: tempCwd,
        });
        expect(result.ok).toBe(false);
      });

      it('honours AUTH_SECRET when set (parity path)', async () => {
        process.env.AUTH_SECRET = 'parity-test-secret-32-bytes-long';
        _resetSigningSecretCacheForTests();
        const key = activeSigningSecret(tempCwd);
        // Buffer key passed directly to jose — no TextEncoder re-wrap.
        const token = await signJwt(
          {
            sub: 'bob',
            iss: TERMINAL_JWT_ISSUER,
            aud: TERMINAL_JWT_AUDIENCE,
            cwd: tempCwd,
          },
          key
        );
        const result = await validateTerminalJwt(token, { key, expectedCwd: tempCwd });
        expect(result).toEqual({ ok: true, username: 'bob' });
      });
    });

    describe('parseAllowedOrigins', () => {
      it('parses a comma-separated list with trim', () => {
        const set = parseAllowedOrigins('http://a.example, http://b.example,http://c.example');
        expect(set).toEqual(new Set(['http://a.example', 'http://b.example', 'http://c.example']));
      });
      it('returns null when env var is undefined or empty', () => {
        expect(parseAllowedOrigins(undefined)).toBeNull();
        expect(parseAllowedOrigins('')).toBeNull();
        expect(parseAllowedOrigins('   ')).toBeNull();
      });
    });

    describe('buildDefaultAllowedOrigins', () => {
      it('enumerates BOTH localhost and 127.0.0.1 variants for the given port', () => {
        // Why: Browsers send Origin as either named or numeric loopback.
        // Default allowlist must accept both.
        const origins = buildDefaultAllowedOrigins('3000', false);
        expect(origins.has('http://localhost:3000')).toBe(true);
        expect(origins.has('http://127.0.0.1:3000')).toBe(true);
      });
      it('adds https:// variants when httpsEnabled is true', () => {
        const origins = buildDefaultAllowedOrigins('3000', true);
        expect(origins.has('https://localhost:3000')).toBe(true);
        expect(origins.has('https://127.0.0.1:3000')).toBe(true);
      });
      it('does NOT include IPv6 [::1] in the default (operator opt-in only)', () => {
        const origins = buildDefaultAllowedOrigins('3000', false);
        expect(origins.has('http://[::1]:3000')).toBe(false);
      });
    });

    describe('authorizeUpgrade', () => {
      it('rejects with 4403 when Origin header is missing', async () => {
        const key = activeSigningSecret(tempCwd);
        const allowedOrigins = buildDefaultAllowedOrigins('3000', false);
        const result = await authorizeUpgrade(
          { headers: {}, url: '/?token=anything' },
          { cwd: tempCwd, allowedOrigins, signingKey: key }
        );
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.code).toBe(4403);
      });

      it('rejects with 4403 when Origin is the literal string "null"', async () => {
        const key = activeSigningSecret(tempCwd);
        const allowedOrigins = buildDefaultAllowedOrigins('3000', false);
        const result = await authorizeUpgrade(
          { headers: { origin: 'null' }, url: '/?token=anything' },
          { cwd: tempCwd, allowedOrigins, signingKey: key }
        );
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.code).toBe(4403);
      });

      it('rejects with 4403 when Origin is cross-origin', async () => {
        const key = activeSigningSecret(tempCwd);
        const allowedOrigins = buildDefaultAllowedOrigins('3000', false);
        const result = await authorizeUpgrade(
          { headers: { origin: 'http://evil.example' }, url: '/?token=anything' },
          { cwd: tempCwd, allowedOrigins, signingKey: key }
        );
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.code).toBe(4403);
      });

      it('rejects with 4401 when token query param is missing (Origin allowed)', async () => {
        const key = activeSigningSecret(tempCwd);
        const allowedOrigins = buildDefaultAllowedOrigins('3000', false);
        const result = await authorizeUpgrade(
          { headers: { origin: 'http://localhost:3000' }, url: '/' },
          { cwd: tempCwd, allowedOrigins, signingKey: key }
        );
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.code).toBe(4401);
      });

      it('accepts when Origin is http://localhost:<port> and JWT is valid', async () => {
        const key = activeSigningSecret(tempCwd);
        const allowedOrigins = buildDefaultAllowedOrigins('3000', false);
        const builder = new SignJWT({
          sub: 'alice',
          iss: TERMINAL_JWT_ISSUER,
          aud: TERMINAL_JWT_AUDIENCE,
          cwd: tempCwd,
        }).setProtectedHeader({ alg: 'HS256' });
        builder.setIssuedAt();
        builder.setExpirationTime('5m');
        const token = await builder.sign(key);
        const result = await authorizeUpgrade(
          {
            headers: { origin: 'http://localhost:3000' },
            url: `/?token=${encodeURIComponent(token)}`,
          },
          { cwd: tempCwd, allowedOrigins, signingKey: key }
        );
        expect(result).toEqual({ ok: true, username: 'alice' });
      });

      it('accepts when Origin is http://127.0.0.1:<port> and JWT is valid', async () => {
        const key = activeSigningSecret(tempCwd);
        const allowedOrigins = buildDefaultAllowedOrigins('3000', false);
        const builder = new SignJWT({
          sub: 'alice',
          iss: TERMINAL_JWT_ISSUER,
          aud: TERMINAL_JWT_AUDIENCE,
          cwd: tempCwd,
        }).setProtectedHeader({ alg: 'HS256' });
        builder.setIssuedAt();
        builder.setExpirationTime('5m');
        const token = await builder.sign(key);
        const result = await authorizeUpgrade(
          {
            headers: { origin: 'http://127.0.0.1:3000' },
            url: `/?token=${encodeURIComponent(token)}`,
          },
          { cwd: tempCwd, allowedOrigins, signingKey: key }
        );
        expect(result).toEqual({ ok: true, username: 'alice' });
      });
    });

    describe('F001 regression — close-frame reason is bounded (no user input)', () => {
      it('a 200-byte attacker-controlled Origin produces a short closeReason and no exception', async () => {
        // Why: the WebSocket library's close() throws if reason exceeds 123
        // UTF-8 bytes (RFC 6455). Echoing the offending Origin into the close
        // reason would let a long cross-site probe crash the sidecar.
        const key = activeSigningSecret(tempCwd);
        const allowedOrigins = buildDefaultAllowedOrigins('3000', false);
        const longOrigin = 'http://' + 'a'.repeat(200) + '.example';
        expect(longOrigin.length).toBeGreaterThan(123);

        let result: Awaited<ReturnType<typeof authorizeUpgrade>>;
        await expect(
          (async () => {
            result = await authorizeUpgrade(
              { headers: { origin: longOrigin }, url: '/?token=anything' },
              { cwd: tempCwd, allowedOrigins, signingKey: key },
            );
          })(),
        ).resolves.toBeUndefined();

        // biome-ignore lint/style/noNonNullAssertion: assigned in the IIFE above
        const r = result!;
        expect(r.ok).toBe(false);
        if (!r.ok) {
          expect(r.code).toBe(4403);
          // Close reason MUST stay short (≤123 bytes) and MUST NOT echo the origin.
          expect(Buffer.byteLength(r.closeReason, 'utf-8')).toBeLessThanOrEqual(123);
          expect(r.closeReason).not.toContain(longOrigin);
          // Verbose reason is allowed to include the origin (for log + JSON payload).
          expect(r.reason).toContain(longOrigin);
        }
      });
    });

    describe('assertBootstrapReadable (startup assertion)', () => {
      it('returns silently when bootstrap-code.json is readable at cwd', () => {
        expect(() => assertBootstrapReadable(tempCwd)).not.toThrow();
      });

      it('throws an Error containing the cwd path but NOT the bootstrap code (AC-22)', () => {
        // Why: Sidecar must fail-fast with operator-actionable error, but
        // must never log the bootstrap CODE itself (audit trail).
        const missingCwd = mkdtempSync(join(tmpdir(), 'p4-no-bootstrap-'));
        try {
          // Force a permission/file failure: chmod the .chainglass dir to be read-only
          // and create the file as a directory so persistence.ts cannot read it.
          // Simpler: create an EMPTY .chainglass with a bootstrap-code.json that is a directory.
          mkdirSync(join(missingCwd, '.chainglass'), { recursive: true });
          mkdirSync(join(missingCwd, '.chainglass', 'bootstrap-code.json'), { recursive: true });
          // Now reading the file will fail — EISDIR.
          _resetSigningSecretCacheForTests();
          expect(() => assertBootstrapReadable(missingCwd)).toThrow();
          try {
            assertBootstrapReadable(missingCwd);
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            expect(msg).toContain(missingCwd);
            // AC-22: code value must NEVER appear in error messages.
            expect(msg).not.toMatch(/[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}/);
          }
        } finally {
          rmSync(missingCwd, { recursive: true, force: true });
          _resetSigningSecretCacheForTests();
        }
      });
    });
  });

  describe('activity log polling (Phase 2)', () => {
    it('resolves worktree root via git -C <cwd> rev-parse', () => {
      /*
      Test Doc:
      - Why: CWD may be a subdirectory — must resolve worktree root for correct log location
      - Contract: handleConnection uses git -C <cwd> rev-parse --show-toplevel
      - Usage Notes: Uses injectable execCommand, so we verify via FakeTmuxExecutor
      - Quality Contribution: Prevents activity log being written to wrong directory
      - Worked Example: cwd=/project/apps/web → git resolves /project → entries written to /project/.chainglass/data/
      */
      exec.whenCommand('tmux', ['-V']).returns('tmux 3.4');
      exec
        .whenCommand('git', ['-C', '/project/apps/web', 'rev-parse', '--show-toplevel'])
        .returns('/project\n');
      exec
        .whenCommand('tmux', [
          'list-panes',
          '-t',
          'test-session',
          '-s',
          '-F',
          '#{window_index}.#{pane_index}\t#{pane_title}',
        ])
        .returns('');

      const origBase = process.env.TERMINAL_ALLOWED_BASE;
      process.env.TERMINAL_ALLOWED_BASE = '/project';
      try {
        const server = createTerminalServer(deps);
        const ws = createFakeWs();
        server.handleConnection(
          ws as unknown as import('ws').WebSocket,
          'test-session',
          '/project/apps/web'
        );

        exec.assertExecuted('git', ['-C', '/project/apps/web', 'rev-parse', '--show-toplevel']);
      } finally {
        if (origBase === undefined) process.env.TERMINAL_ALLOWED_BASE = undefined;
        else process.env.TERMINAL_ALLOWED_BASE = origBase;
      }
    });

    it('falls back to CWD when git fails', () => {
      /*
      Test Doc:
      - Why: Non-git directories, bare repos, or missing git must not crash
      - Contract: handleConnection falls back to CWD when git rev-parse throws
      - Usage Notes: FakeTmuxExecutor throws on unconfigured commands
      - Quality Contribution: Ensures sidecar works without git
      - Worked Example: git rev-parse throws → worktreeRoot = cwd
      */
      exec.whenCommand('tmux', ['-V']).returns('tmux 3.4');
      // git rev-parse not configured → throws → should fall back to CWD

      const origBase = process.env.TERMINAL_ALLOWED_BASE;
      process.env.TERMINAL_ALLOWED_BASE = '/';
      try {
        const server = createTerminalServer(deps);
        const ws = createFakeWs();
        // Should not throw even though git fails
        expect(() => {
          server.handleConnection(
            ws as unknown as import('ws').WebSocket,
            'test-session',
            '/some/path'
          );
        }).not.toThrow();
      } finally {
        if (origBase === undefined) process.env.TERMINAL_ALLOWED_BASE = undefined;
        else process.env.TERMINAL_ALLOWED_BASE = origBase;
      }
    });

    it('does not emit pane_title WS messages', () => {
      /*
      Test Doc:
      - Why: Phase 2 replaced badge WS messages with filesystem writes
      - Contract: No pane_title messages sent over WebSocket
      - Usage Notes: Check ws.sent for absence of pane_title type
      - Quality Contribution: Confirms clean removal of PR #37 badge path
      - Worked Example: Connect → no pane_title in ws.sent
      */
      exec.whenCommand('tmux', ['-V']).returns('tmux 3.4');
      exec
        .whenCommand('git', ['-C', process.cwd(), 'rev-parse', '--show-toplevel'])
        .returns(`${process.cwd()}\n`);
      exec
        .whenCommand('tmux', [
          'list-panes',
          '-t',
          'test-session',
          '-s',
          '-F',
          '#{window_index}.#{pane_index}\t#{pane_title}',
        ])
        .returns('0.0\tSome Title\n');

      const origBase = process.env.TERMINAL_ALLOWED_BASE;
      process.env.TERMINAL_ALLOWED_BASE = process.cwd();
      try {
        const server = createTerminalServer(deps);
        const ws = createFakeWs();
        server.handleConnection(
          ws as unknown as import('ws').WebSocket,
          'test-session',
          process.cwd()
        );

        // No pane_title messages should be sent
        const paneTitleMsgs = ws.sent.filter((msg) => {
          try {
            return JSON.parse(msg).type === 'pane_title';
          } catch {
            return false;
          }
        });
        expect(paneTitleMsgs).toHaveLength(0);
      } finally {
        if (origBase === undefined) process.env.TERMINAL_ALLOWED_BASE = undefined;
        else process.env.TERMINAL_ALLOWED_BASE = origBase;
      }
    });
  });
});
