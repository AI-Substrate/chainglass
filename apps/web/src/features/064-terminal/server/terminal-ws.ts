/**
 * Terminal WebSocket Server — Sidecar process for terminal I/O
 *
 * Runs alongside Next.js as a separate Node.js process.
 * Accepts WebSocket connections, spawns PTY processes attached to
 * tmux sessions, and pipes I/O bidirectionally.
 *
 * Architecture: Sidecar (DR-02) — preserves Turbopack HMR.
 * tmux integration: atomic create-or-attach via `new-session -A` (DR-03).
 * DYK-04: Binds dual-stack (`::`) for remote access when TERMINAL_WS_HOST=0.0.0.0,
 *   so browsers that resolve `localhost` to IPv6 `::1` can reach the sidecar.
 *
 * Plan 064: Terminal Integration via tmux
 */

import fs from 'node:fs';
import https from 'node:https';
import { activeSigningSecret, findWorkspaceRoot } from '@chainglass/shared/auth-bootstrap-code';
import { type WebSocket, WebSocketServer } from 'ws';
import { appendActivityLogEntry } from '../../065-activity-log/lib/activity-log-writer.js';
import { shouldIgnorePaneTitle } from '../../065-activity-log/lib/ignore-patterns.js';
import type { CommandExecutor, PtyProcess, PtySpawner } from '../types';
import { isProcessAlive, isTmuxClient, reapStalePtys, recordPid, removePid } from './pty-registry';
import {
  assertBootstrapReadable,
  authorizeUpgrade,
  buildDefaultAllowedOrigins,
  discoverNextPort,
  getLocalNetworkHosts,
  mergeAllowedOrigins,
  parseAllowedOrigins,
  validateTerminalJwt,
} from './terminal-auth';
import { TmuxSessionManager } from './tmux-session-manager';

const ACTIVITY_LOG_POLL_MS = Number(process.env.ACTIVITY_LOG_POLL_MS ?? '10000');

// Plan 084 Phase 4 — re-export the auth contract so existing tests that
// imported these names from `terminal-ws` keep working. New consumers
// (route handlers, etc.) should import directly from `./terminal-auth` to
// avoid pulling the sidecar-only `ws` / `node-pty` / activity-log deps into
// the Next.js bundle.
export {
  TERMINAL_JWT_AUDIENCE,
  TERMINAL_JWT_ISSUER,
  type UpgradeAuthOpts,
  type UpgradeAuthResult,
  type ValidateTerminalJwtOpts,
  assertBootstrapReadable,
  authorizeUpgrade,
  buildDefaultAllowedOrigins,
  discoverNextPort,
  getLocalNetworkHosts,
  mergeAllowedOrigins,
  parseAllowedOrigins,
  validateTerminalJwt,
} from './terminal-auth';

export interface TerminalServerDeps {
  execCommand: CommandExecutor;
  spawnPty: PtySpawner;
  /**
   * FX001-2: injectable process killer (defaults to `process.kill`). Lets tests
   * assert force-kills without signalling real OS PIDs (FakePty.pid is a fake
   * constant, so a real `process.kill` could hit an unrelated process).
   */
  killProcess?: (pid: number, signal: NodeJS.Signals | number) => void;
}

export interface TerminalServer {
  handleConnection: (ws: WebSocket, sessionName: string, cwd: string) => void;
  derivePort: (nextPort: number) => number;
  start: (port: number) => void;
  close: () => void;
}

export function createTerminalServer(deps: TerminalServerDeps): TerminalServer {
  const manager = new TmuxSessionManager(deps.execCommand, deps.spawnPty);
  const activePtys = new Set<PtyProcess>();
  const activityLogIntervals = new Set<ReturnType<typeof setInterval>>();
  // FX001-1: idempotent-teardown bookkeeping. `disposedPtys` guards double-dispose
  // (ws 'close', ws 'error', and pty.onExit can all fire for one PTY); `ptyIntervals`
  // ties each PTY to its activity-log interval so disposePty clears both together.
  const disposedPtys = new WeakSet<PtyProcess>();
  const ptyIntervals = new Map<PtyProcess, ReturnType<typeof setInterval>>();
  // FX001-2: injectable killer (default real `process.kill`) + once-only guard.
  const killProcess =
    deps.killProcess ??
    ((pid: number, signal: NodeJS.Signals | number) => process.kill(pid, signal));
  let cleanedUp = false;
  // FX001-3: listen port keys the PID registry (0 until start() binds — so
  // handleConnection-only unit tests touch no filesystem).
  let listenPort = 0;
  // FX001-4: cap concurrent PTYs so a reconnect storm (or any leak) can't exhaust
  // the host's PTY table. Configurable via TERMINAL_MAX_ACTIVE_PTYS (default 100).
  const MAX_ACTIVE_PTYS = (() => {
    const n = Number(process.env.TERMINAL_MAX_ACTIVE_PTYS ?? '100');
    return Number.isInteger(n) && n > 0 ? n : 100;
  })();
  // Socket per PTY, for the idle backstop sweep.
  const ptyWs = new Map<PtyProcess, WebSocket>();
  let idleSweep: ReturnType<typeof setInterval> | null = null;
  let wss: WebSocketServer | null = null;

  // Plan 084 Phase 4 — Always-on auth.
  // Signing-key derivation requires sidecar cwd === main Next.js process cwd;
  // if forking the sidecar, inherit cwd or pass it explicitly via spawn options.
  // FX003 (2026-05-03) — `findWorkspaceRoot()` walks up to the same workspace
  // root the main Next.js process resolves, so HKDF keys converge.
  const cwd = findWorkspaceRoot(process.cwd());
  // FX001-3: stable per-sidecar root for the PID registry. handleConnection has
  // its own `cwd` PARAM (the connection's working dir) that shadows this one, so
  // capture the workspace root here under a distinct name.
  const sidecarRoot = cwd;

  /**
   * Periodic-refresh validator used by the in-band `msg.type === 'auth'`
   * message handler. Looks up the cached `activeSigningSecret(cwd)` on each
   * call (Map lookup, not file IO) and runs the strict claim-checking path.
   */
  async function validateToken(token: string): Promise<string | null> {
    const key = activeSigningSecret(cwd);
    const result = await validateTerminalJwt(token, { key, expectedCwd: cwd });
    return result.ok ? result.username : null;
  }

  /**
   * FX001-1: the single, idempotent teardown path for a PTY. Safe to call from
   * ws 'close', ws 'error', and pty.onExit — a second call is a no-op. Clears the
   * PTY's activity-log interval and kills the tmux ATTACH CLIENT via `pty.kill()`
   * (SIGHUP detach — never `tmux kill-session`, so the persistent session survives).
   */
  function disposePty(pty: PtyProcess): void {
    if (disposedPtys.has(pty)) return;
    disposedPtys.add(pty);

    const interval = ptyIntervals.get(pty);
    if (interval) {
      clearInterval(interval);
      activityLogIntervals.delete(interval);
      ptyIntervals.delete(pty);
    }

    activePtys.delete(pty);
    ptyWs.delete(pty);
    // FX001-3: drop from the per-port registry so the next start() won't try to
    // reap a pid that has already been cleanly disposed.
    if (listenPort > 0) removePid(sidecarRoot, listenPort, pty.pid);
    try {
      pty.kill();
    } catch {
      // PTY already exited — nothing to detach.
    }
  }

  function handleConnection(ws: WebSocket, sessionName: string, cwd: string): void {
    // FT-001: Validate CWD before PTY spawn
    const allowedBase = process.env.TERMINAL_ALLOWED_BASE ?? process.cwd();
    if (!manager.validateCwd(cwd, allowedBase)) {
      const msg = `CWD "${cwd}" is outside allowed base "${allowedBase}". Set TERMINAL_ALLOWED_BASE in apps/web/.env.local to a parent directory that covers all your workspaces (e.g. /Users/jak).`;
      console.error(`[terminal] Rejected connection (session=${sessionName}): ${msg}`);
      ws.send(JSON.stringify({ type: 'error', message: msg }));
      ws.close(4400, 'Invalid cwd');
      return;
    }

    // FX001-4: refuse new PTYs at the ceiling rather than exhausting host PTYs.
    if (activePtys.size >= MAX_ACTIVE_PTYS) {
      const msg = `Terminal capacity reached (${MAX_ACTIVE_PTYS} active sessions). Close one and retry.`;
      console.warn(`[terminal] Rejected connection (session=${sessionName}): ${msg}`);
      ws.send(JSON.stringify({ type: 'error', message: msg }));
      ws.close(4429, 'Max PTY limit');
      return;
    }

    const tmuxAvailable = manager.isTmuxAvailable();
    let pty: PtyProcess;

    // FT-002: Guard PTY spawn failures
    try {
      if (tmuxAvailable) {
        // Enable OSC 52 clipboard passthrough so drag-select auto-copies to the
        // browser clipboard (idempotent, best-effort) before attaching.
        manager.ensureClipboardOptions();
        pty = manager.spawnAttachedPty(sessionName, cwd, 80, 24);
        ws.send(JSON.stringify({ type: 'status', status: 'connected', tmux: true }));
      } else {
        pty = manager.spawnRawShell(cwd, 80, 24);
        ws.send(
          JSON.stringify({
            type: 'status',
            status: 'connected',
            tmux: false,
            message:
              "tmux not available — using raw shell. Sessions won't persist across page refreshes.",
          })
        );
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      ws.send(
        JSON.stringify({ type: 'error', message: `Failed to start terminal process: ${msg}` })
      );
      ws.close(1011, 'PTY spawn failed');
      return;
    }

    activePtys.add(pty);
    // FX001-3: register the live attach-client pid for the startup reaper. Only
    // when the server is actually listening — handleConnection-only unit tests
    // (listenPort 0) touch no filesystem.
    if (listenPort > 0) recordPid(sidecarRoot, listenPort, pty.pid);
    ptyWs.set(pty, ws); // FX001-4: track socket for the idle backstop sweep

    // Resolve worktree root from CWD (CWD may be a subdirectory)
    let worktreeRoot = cwd;
    try {
      worktreeRoot = deps.execCommand('git', ['-C', cwd, 'rev-parse', '--show-toplevel']).trim();
    } catch {
      // Non-git directory, bare repo, or git not installed — fall back to CWD
    }

    // Poll all panes and write activity log entries (configurable via ACTIVITY_LOG_POLL_MS)
    if (tmuxAvailable && ACTIVITY_LOG_POLL_MS > 0) {
      const logInterval = setInterval(() => {
        const paneTitles = manager.getPaneTitles(sessionName);
        for (const { pane, windowName, title } of paneTitles) {
          if (shouldIgnorePaneTitle(title)) continue;
          try {
            appendActivityLogEntry(worktreeRoot, {
              id: `tmux:${pane}`,
              source: 'tmux',
              label: title,
              timestamp: new Date().toISOString(),
              meta: { pane, windowName, session: sessionName },
            });
          } catch (error) {
            console.error('[terminal] Failed to append activity log entry', {
              sessionName,
              pane,
              error,
            });
          }
        }
      }, ACTIVITY_LOG_POLL_MS);
      activityLogIntervals.add(logInterval);
      // FX001-1: tie the interval to this PTY so disposePty clears it on EVERY
      // exit path (close, error, onExit). Previously only a nested ws 'close'
      // cleared it — an error-without-close or a pty-exit leaked the interval.
      ptyIntervals.set(pty, logInterval);
    }

    pty.onData((data: string) => {
      if ((ws as unknown as { readyState: number }).readyState === 1) {
        ws.send(data);
      }
    });

    pty.onExit(() => {
      disposePty(pty);
      if ((ws as unknown as { readyState: number }).readyState === 1) {
        ws.send(JSON.stringify({ type: 'status', status: 'exited' }));
        ws.close(1000, 'PTY exited');
      }
    });

    ws.on('message', async (raw: Buffer | string) => {
      const data = raw.toString();

      // Try to parse as JSON for control messages
      try {
        const msg = JSON.parse(data);
        if (msg.type === 'auth') {
          // Phase 4: always-on. Periodic-refresh path; close on rejection.
          const username = await validateToken(msg.token);
          if (!username) {
            ws.close(4403, 'Token refresh failed');
          }
          return;
        }
        if (msg.type === 'resize' && typeof msg.cols === 'number' && typeof msg.rows === 'number') {
          pty.resize(msg.cols, msg.rows);
          return;
        }
        if (msg.type === 'resync') {
          // Client requests re-fit — no server action needed, just acknowledge
          return;
        }
        if (msg.type === 'copy-buffer') {
          try {
            const buffer = deps.execCommand('tmux', ['show-buffer']);
            ws.send(JSON.stringify({ type: 'clipboard', data: buffer.trim() }));
          } catch (err) {
            // `tmux show-buffer` throws "no buffers" when nothing has been
            // yanked into tmux's paste buffer. This is reached only when the
            // browser also has no xterm selection (see terminal-inner.tsx), so
            // surface actionable guidance instead of the raw tmux error.
            const raw = err instanceof Error ? err.message : 'Unknown error';
            const friendly = /no buffers/i.test(raw)
              ? 'Nothing to copy — drag-select text in the terminal, then click copy.'
              : raw;
            ws.send(JSON.stringify({ type: 'clipboard', data: '', error: friendly }));
          }
          return;
        }
      } catch {
        // Not JSON — treat as raw terminal input
      }

      pty.write(data);
    });

    // FX001-1: funnel close AND error through the single idempotent teardown.
    // The missing 'error' handler was the in-session leak — a socket that errored
    // without a following clean 'close' orphaned its PTY for the process lifetime.
    ws.on('close', () => disposePty(pty));
    ws.on('error', () => disposePty(pty));
  }

  function derivePort(nextPort: number): number {
    return nextPort + 1500;
  }

  function cleanup(): void {
    // FX001-2: idempotent — a signal handler AND `beforeExit` can both fire.
    if (cleanedUp) return;
    cleanedUp = true;

    if (idleSweep) {
      clearInterval(idleSweep);
      idleSweep = null;
    }

    // Snapshot: disposePty mutates activePtys while we iterate.
    for (const pty of [...activePtys]) {
      disposePty(pty); // node-pty kills the real child (SIGHUP detach) + clears interval
      // Force-kill backstop for a wedged attach client. Guard with the SAME
      // liveness + is-tmux-CLIENT check as the reaper (companion review F001): a
      // pid the OS may have recycled — or the tmux SERVER — must never be
      // SIGKILLed. Only a still-live tmux attach client is force-killed.
      try {
        if (isProcessAlive(pty.pid, killProcess) && isTmuxClient(pty.pid, deps.execCommand)) {
          killProcess(pty.pid, 'SIGKILL');
        }
      } catch {
        // Process already exited.
      }
    }

    // Clear any interval not tied to a live PTY (defensive).
    for (const interval of activityLogIntervals) clearInterval(interval);
    activityLogIntervals.clear();
    ptyIntervals.clear();
    activePtys.clear();
  }

  function start(port: number): void {
    // Plan 084 Phase 4 — Startup assertion: bootstrap-code.json must be readable
    // at the sidecar's resolved cwd. On failure, log FATAL and exit; never
    // continue with a degraded auth posture (silent-bypass is closed permanently
    // — there is no escape-hatch env var, by design).
    try {
      assertBootstrapReadable(cwd);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      console.error(`[terminal] FATAL: ${detail}`);
      process.exit(1);
    }

    listenPort = port;
    // FX001-3: reap attach clients orphaned by a prior CRASHED sidecar on THIS
    // port (the un-catchable SIGKILL case that cleanup() can't reach) before we
    // accept new connections. Per-port keying isolates concurrent worktree
    // sidecars; the ps-guard inside reapStalePtys prevents killing reused PIDs.
    try {
      const reaped = reapStalePtys(sidecarRoot, port, deps.execCommand, killProcess);
      if (reaped.length > 0) {
        console.log(
          `[terminal] Reaped ${reaped.length} orphaned PTY client(s) from a prior run: ${reaped.join(', ')}`
        );
      }
    } catch (err) {
      console.error('[terminal] Startup PTY reap failed (continuing):', err);
    }

    // FX001-4: backstop sweep — dispose any PTY whose socket is already CLOSED
    // but whose 'close'/'error' somehow never fired (disposePty is idempotent).
    idleSweep = setInterval(() => {
      for (const [pty, sock] of ptyWs) {
        if ((sock as unknown as { readyState: number }).readyState === 3) disposePty(pty);
      }
    }, 30000);
    if (typeof idleSweep.unref === 'function') idleSweep.unref();

    // Bind to env-configurable host (default localhost; set TERMINAL_WS_HOST=0.0.0.0 for remote).
    // Node binds 0.0.0.0 as IPv4-ONLY, but browsers resolve `localhost` to IPv6
    // `::1` first — so an IPv4-only sidecar refuses the WS while Next (dual-stack
    // `*`) serves the page, and the terminal fails with no close code. Bind `::`
    // (IPv6 any) for dual-stack so both `::1` and `127.0.0.1` reach the sidecar.
    let host = process.env.TERMINAL_WS_HOST ?? '127.0.0.1';
    if (host === '0.0.0.0') host = '::';

    // Support WSS when HTTPS certs are available
    const certPath = process.env.TERMINAL_WS_CERT;
    const keyPath = process.env.TERMINAL_WS_KEY;
    let server: https.Server | undefined;
    const httpsEnabled = Boolean(certPath && keyPath);

    if (certPath && keyPath) {
      server = https.createServer({
        cert: fs.readFileSync(certPath),
        key: fs.readFileSync(keyPath),
      });
      wss = new WebSocketServer({ server });
      server.listen(port, host);
    } else {
      wss = new WebSocketServer({ port, host });
    }

    // Plan 084 Phase 4 — Origin allowlist + signing key.
    // Allowlist precedence: TERMINAL_WS_ALLOWED_ORIGINS env (comma-separated)
    //   → fallback: localhost + 127.0.0.1 variants for the active Next port.
    // Origin allowlist = default local/LAN origins ALWAYS, merged with any
    // operator additions from TERMINAL_WS_ALLOWED_ORIGINS (see mergeAllowedOrigins).
    // This lets a dev-tunnel origin be added without rejecting localhost/LAN.
    // CSWSH is still gated by the JWT (no IP-based trust).
    const allowedOrigins = mergeAllowedOrigins(
      buildDefaultAllowedOrigins(discoverNextPort(cwd), httpsEnabled, getLocalNetworkHosts()),
      process.env.TERMINAL_WS_ALLOWED_ORIGINS
    );
    const signingKey = activeSigningSecret(cwd);

    wss.on('connection', async (ws: WebSocket, req) => {
      const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
      const sessionName = url.searchParams.get('session');
      const sessionCwd = url.searchParams.get('cwd') ?? process.cwd();

      // DYK-04: Log session info without token
      const logId = `session=${sessionName ?? 'none'}`;

      // Always-on auth: Origin → token → claims.
      const auth = await authorizeUpgrade(req, { cwd, allowedOrigins, signingKey });
      if (!auth.ok) {
        ws.send(JSON.stringify({ type: 'error', message: auth.reason }));
        // F001: ws.close() reason is bounded to ≤123 UTF-8 bytes (RFC 6455);
        // use the short closeReason — never the verbose reason that may echo
        // attacker-controlled user input.
        ws.close(auth.code, auth.closeReason);
        console.log(`[terminal] Rejected connection (${logId}): ${auth.reason}`);
        return;
      }
      console.log(`[terminal] Authenticated connection (${logId}): user=${auth.username}`);

      if (!sessionName || !manager.validateSessionName(sessionName)) {
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid or missing session name' }));
        ws.close(4400, 'Invalid session name');
        return;
      }

      handleConnection(ws, sessionName, sessionCwd);
    });

    wss.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EADDRINUSE') {
        console.error(
          `Terminal WS server: port ${port} already in use. Set TERMINAL_WS_PORT to use a different port.`
        );
        process.exit(1);
      }
      console.error('Terminal WS server error:', error);
    });

    console.log(`Terminal WS server listening on ws://${host}:${port}/terminal`);

    // FX001-2: reap PTYs on every catchable shutdown path, not just SIGTERM/SIGINT.
    // SIGHUP fires on terminal hangup / parent death; `beforeExit` catches a clean
    // drain. (SIGKILL can't be caught — that orphan case is covered by FX001-3's
    // startup reaper.)
    const shutdown = (signal: string) => {
      console.log(`Terminal WS server: ${signal} received, cleaning up...`);
      cleanup();
      wss?.close();
      process.exit(0);
    };
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGHUP', () => shutdown('SIGHUP'));
    process.on('beforeExit', () => cleanup());
  }

  function close(): void {
    cleanup();
    wss?.close();
  }

  return { handleConnection, derivePort, start, close };
}

// ============ CLI Entry Point ============
// When run directly (not imported for tests), start the server.

const isDirectRun = process.argv[1]?.includes('terminal-ws');
if (isDirectRun) {
  const { execFileSync } = await import('node:child_process');
  const pty = await import('node-pty');

  const execCommand: CommandExecutor = (command, args) => {
    return execFileSync(command, args, { encoding: 'utf8' });
  };

  const spawnPty: PtySpawner = (command, args, options) => {
    return pty.spawn(command, args, {
      name: options.name,
      cols: options.cols,
      rows: options.rows,
      cwd: options.cwd,
      env: options.env,
    });
  };

  const server = createTerminalServer({ execCommand, spawnPty });
  const nextPort = Number.parseInt(process.env.PORT ?? '3000', 10);
  const wsPort = process.env.TERMINAL_WS_PORT
    ? Number.parseInt(process.env.TERMINAL_WS_PORT, 10)
    : server.derivePort(nextPort);

  server.start(wsPort);

  // Start tmux monitor — separate from activity log polling (PL-10)
  try {
    const { startTmuxMonitor } = await import('./tmux-monitor');
    startTmuxMonitor(nextPort);
  } catch (error) {
    console.error('[terminal] Failed to start tmux monitor (continuing without it):', error);
  }
}
