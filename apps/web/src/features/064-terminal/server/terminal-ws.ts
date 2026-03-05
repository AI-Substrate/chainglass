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
import { jwtVerify } from 'jose';
import { type WebSocket, WebSocketServer } from 'ws';
import type { CommandExecutor, PtyProcess, PtySpawner } from '../types';
import { TmuxSessionManager } from './tmux-session-manager';

const PANE_TITLE_POLL_MS = Number(process.env.TERMINAL_PANE_TITLE_POLL_MS ?? '10000');

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
  const paneTitleIntervals = new Set<ReturnType<typeof setInterval>>();
  let wss: WebSocketServer | null = null;

  // Auth config — hoisted to factory scope so handleConnection can access
  const authSecret = process.env.AUTH_SECRET;
  const authEnabled = !!authSecret;
  const authKey = authSecret ? new TextEncoder().encode(authSecret) : null;

  async function validateToken(token: string): Promise<string | null> {
    if (!authKey) return null;
    try {
      const { payload } = await jwtVerify(token, authKey);
      return typeof payload.sub === 'string' ? payload.sub : null;
    } catch {
      return null;
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

    // Poll pane title and push to client (configurable via TERMINAL_PANE_TITLE_POLL_MS)
    let lastPaneTitle = '';
    if (tmuxAvailable && PANE_TITLE_POLL_MS > 0) {
      const titleInterval = setInterval(() => {
        if ((ws as unknown as { readyState: number }).readyState !== 1) return;
        const title = manager.getPaneTitle(sessionName) ?? '';
        if (title !== lastPaneTitle) {
          lastPaneTitle = title;
          ws.send(JSON.stringify({ type: 'pane_title', title }));
        }
      }, PANE_TITLE_POLL_MS);
      paneTitleIntervals.add(titleInterval);

      // Send initial pane title immediately
      const initial = manager.getPaneTitle(sessionName) ?? '';
      if (initial) {
        lastPaneTitle = initial;
        ws.send(JSON.stringify({ type: 'pane_title', title: initial }));
      }

      // Clean up interval when connection closes
      ws.on('close', () => {
        clearInterval(titleInterval);
        paneTitleIntervals.delete(titleInterval);
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
        if (msg.type === 'auth' && authEnabled) {
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
    for (const interval of paneTitleIntervals) {
      clearInterval(interval);
    }
    paneTitleIntervals.clear();
    for (const pty of activePtys) {
      pty.kill();
    }
    activePtys.clear();
  }

  function start(port: number): void {
    // Bind to env-configurable host (default localhost; set TERMINAL_WS_HOST=0.0.0.0 for remote)
    const host = process.env.TERMINAL_WS_HOST ?? '127.0.0.1';

    // Support WSS when HTTPS certs are available
    const certPath = process.env.TERMINAL_WS_CERT;
    const keyPath = process.env.TERMINAL_WS_KEY;
    let server: https.Server | undefined;

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

    // DYK-03: Warn if AUTH_SECRET missing
    if (!authEnabled) {
      console.warn(
        '[terminal] WARNING: AUTH_SECRET not set — WebSocket connections are UNAUTHENTICATED. ' +
          'Set AUTH_SECRET in .env.local to enable terminal auth.'
      );
    }

    wss.on('connection', async (ws: WebSocket, req) => {
      const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
      const sessionName = url.searchParams.get('session');
      const cwd = url.searchParams.get('cwd') ?? process.cwd();

      // DYK-04: Log session info without token
      const logId = `session=${sessionName ?? 'none'}`;

      // Auth check — skip if AUTH_SECRET not configured (graceful fallback)
      if (authEnabled) {
        const token = url.searchParams.get('token');
        if (!token) {
          ws.send(JSON.stringify({ type: 'error', message: 'Missing auth token' }));
          ws.close(4401, 'Missing auth token');
          console.log(`[terminal] Rejected connection (${logId}): missing token`);
          return;
        }
        const username = await validateToken(token);
        if (!username) {
          ws.send(JSON.stringify({ type: 'error', message: 'Invalid or expired token' }));
          ws.close(4403, 'Invalid or expired token');
          console.log(`[terminal] Rejected connection (${logId}): invalid token`);
          return;
        }
        console.log(`[terminal] Authenticated connection (${logId}): user=${username}`);
      }

      if (!sessionName || !manager.validateSessionName(sessionName)) {
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid or missing session name' }));
        ws.close(4400, 'Invalid session name');
        return;
      }

      handleConnection(ws, sessionName, cwd);
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
}
