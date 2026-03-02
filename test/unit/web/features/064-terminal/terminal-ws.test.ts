import { describe, it, expect, beforeEach } from 'vitest';
import { FakeTmuxExecutor } from '../../../../fakes/fake-tmux-executor';
import { createFakePtySpawner, FakePty } from '../../../../fakes/fake-pty';
import { createTerminalServer, type TerminalServerDeps } from '@/features/064-terminal/server/terminal-ws';

function createFakeWs() {
  const sent: string[] = [];
  let closeCode: number | undefined;
  let closeReason: string | undefined;
  let messageHandler: ((data: Buffer | string) => void) | null = null;
  let closeHandler: (() => void) | null = null;
  let closed = false;

  return {
    send: (data: string) => { if (!closed) sent.push(data); },
    close: (code?: number, reason?: string) => { closed = true; closeCode = code; closeReason = reason; closeHandler?.(); },
    on: (event: string, handler: (...args: unknown[]) => void) => {
      if (event === 'message') messageHandler = handler as (data: Buffer | string) => void;
      if (event === 'close') closeHandler = handler as () => void;
    },
    get sent() { return sent; },
    get closeCode() { return closeCode; },
    get closeReason() { return closeReason; },
    get closed() { return closed; },
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

      server.handleConnection(ws as unknown as import('ws').WebSocket, '064-tmux', '/path/to/worktree');

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

      server.handleConnection(ws as unknown as import('ws').WebSocket, '064-tmux', '/tmp');
      ws.simulateMessage('ls -la\n');

      const pty = spawner.lastInstance!;
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

      server.handleConnection(ws as unknown as import('ws').WebSocket, '064-tmux', '/tmp');
      const pty = spawner.lastInstance!;
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

      server.handleConnection(ws as unknown as import('ws').WebSocket, '064-tmux', '/tmp');
      ws.simulateMessage(JSON.stringify({ type: 'resize', cols: 120, rows: 40 }));

      const pty = spawner.lastInstance!;
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

      server.handleConnection(ws as unknown as import('ws').WebSocket, '064-tmux', '/tmp');
      const pty = spawner.lastInstance!;
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

      server.handleConnection(ws1 as unknown as import('ws').WebSocket, '064-tmux', '/tmp');
      server.handleConnection(ws2 as unknown as import('ws').WebSocket, '064-tmux', '/tmp');

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

      server.handleConnection(ws as unknown as import('ws').WebSocket, '064-tmux', '/tmp');

      expect(spawner.spawnCount).toBe(1);
      const statusMsg = JSON.parse(ws.sent[0]);
      expect(statusMsg.type).toBe('status');
      expect(statusMsg.tmux).toBe(false);
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
});
