/**
 * Terminal WebSocket Server — Sidecar process for terminal I/O
 *
 * Runs alongside Next.js as a separate Node.js process.
 * Accepts WebSocket connections, spawns PTY processes attached to
 * tmux sessions, and pipes I/O bidirectionally.
 *
 * Architecture: Sidecar (DR-02) — preserves Turbopack HMR.
 * tmux integration: atomic create-or-attach via `new-session -A` (DR-03).
 * DYK-04: Binds 0.0.0.0 for remote access.
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
import {
  assertBootstrapReadable,
  authorizeUpgrade,
  buildDefaultAllowedOrigins,
  discoverNextPort,
  getLocalNetworkHosts,
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
  parseAllowedOrigins,
  validateTerminalJwt,
} from './terminal-auth';

export interface TerminalServerDeps {
  execCommand: CommandExecutor;
  spawnPty: PtySpawner;
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
  let wss: WebSocketServer | null = null;

  // Plan 084 Phase 4 — Always-on auth.
  // Signing-key derivation requires sidecar cwd === main Next.js process cwd;
  // if forking the sidecar, inherit cwd or pass it explicitly via spawn options.
  // FX003 (2026-05-03) — `findWorkspaceRoot()` walks up to the same workspace
  // root the main Next.js process resolves, so HKDF keys converge.
  const cwd = findWorkspaceRoot(process.cwd());

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

    const tmuxAvailable = manager.isTmuxAvailable();
    let pty: PtyProcess;

    // FT-002: Guard PTY spawn failures
    try {
      if (tmuxAvailable) {
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

      ws.on('close', () => {
        clearInterval(logInterval);
        activityLogIntervals.delete(logInterval);
      });
    }

    pty.onData((data: string) => {
      if ((ws as unknown as { readyState: number }).readyState === 1) {
        ws.send(data);
      }
    });

    pty.onExit(() => {
      activePtys.delete(pty);
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
            const errMsg = err instanceof Error ? err.message : 'Unknown error';
            ws.send(JSON.stringify({ type: 'clipboard', data: '', error: errMsg }));
          }
          return;
        }
      } catch {
        // Not JSON — treat as raw terminal input
      }

      pty.write(data);
    });

    ws.on('close', () => {
      activePtys.delete(pty);
      pty.kill();
    });
  }

  function derivePort(nextPort: number): number {
    return nextPort + 1500;
  }

  function cleanup(): void {
    for (const interval of activityLogIntervals) {
      clearInterval(interval);
    }
    activityLogIntervals.clear();
    for (const pty of activePtys) {
      pty.kill();
    }
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

    // Bind to env-configurable host (default localhost; set TERMINAL_WS_HOST=0.0.0.0 for remote)
    const host = process.env.TERMINAL_WS_HOST ?? '127.0.0.1';

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
    // Signing key: cached `activeSigningSecret(cwd)`; identical to the key
    // used by `/api/terminal/token` to sign JWTs (cwd parity via FX003).
    // Default allowlist enumerates every non-internal IPv4 interface for the
    // active Next port, so LAN-IP browsing works without operator action.
    // CSWSH is still gated by the JWT (no IP-based trust).
    const allowedOrigins =
      parseAllowedOrigins(process.env.TERMINAL_WS_ALLOWED_ORIGINS) ??
      buildDefaultAllowedOrigins(discoverNextPort(cwd), httpsEnabled, getLocalNetworkHosts());
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

    process.on('SIGTERM', () => {
      console.log('Terminal WS server: SIGTERM received, cleaning up...');
      cleanup();
      wss?.close();
      process.exit(0);
    });

    process.on('SIGINT', () => {
      console.log('Terminal WS server: SIGINT received, cleaning up...');
      cleanup();
      wss?.close();
      process.exit(0);
    });
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
