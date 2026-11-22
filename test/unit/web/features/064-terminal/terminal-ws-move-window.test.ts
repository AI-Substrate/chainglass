import { execFile } from 'node:child_process';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { createTerminalServer } from '@/features/064-terminal/server/terminal-ws';
import { TmuxSessionManager } from '@/features/064-terminal/server/tmux-session-manager';
import type { TerminalWindow } from '@/features/064-terminal/types';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { WebSocket as WsWebSocket } from 'ws';
import { type FakePty, createFakePtySpawner } from '../../../../fakes/fake-pty';

const execFileAsync = promisify(execFile);

class FakeWebSocket extends EventEmitter {
  readyState = 1;
  readonly sent: string[] = [];

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {}

  async simulateMessage(message: object): Promise<void> {
    for (const listener of this.listeners('message')) {
      await (listener as (raw: Buffer) => void | Promise<void>)(
        Buffer.from(JSON.stringify(message))
      );
    }
  }
}

async function createHarness(
  execCommand = vi.fn((_command: string, _args: string[]) => ''),
  sessionName = 'terminal-session'
) {
  const spawner = createFakePtySpawner();
  const server = createTerminalServer({
    execCommand: async (command, args) => execCommand(command, args),
    spawnPty: spawner.spawn,
  });
  const socket = new FakeWebSocket();
  await server.handleConnection(socket as unknown as WsWebSocket, sessionName, process.cwd());
  execCommand.mockClear();
  socket.sent.length = 0;
  return { socket, pty: spawner.lastInstance as FakePty, execCommand };
}

const initialList = '@1\t0\t1\tfirst\n@2\t59\t0\tsecond\n@3\t86\t0\tthird\n';
const afterMove = '@2\t59\t0\tsecond\n@1\t60\t1\tfirst\n@3\t86\t0\tthird\n';

describe('terminal WebSocket move-window control frame', () => {
  it('builds an atomic double-guarded tmux move-window -a command and returns the fresh list', async () => {
    const { socket, execCommand, pty } = await createHarness();
    execCommand
      .mockReturnValueOnce(initialList)
      .mockReturnValueOnce('window-moved\n')
      .mockReturnValueOnce(afterMove);

    await socket.simulateMessage({
      type: 'move-window',
      sourceId: '@1',
      sourceIndex: 0,
      targetId: '@2',
      targetIndex: 59,
      position: 'after',
    });

    expect(execCommand).toHaveBeenNthCalledWith(2, 'tmux', [
      'if-shell',
      '-F',
      '-t',
      '=terminal-session:0',
      '#{==:#{window_id},@1}',
      "if-shell -F -t '=terminal-session:59' '#{==:#{window_id},@2}' \"move-window -a -s '=terminal-session:0' -t '=terminal-session:59' ; display-message -p window-moved\" 'display-message -p target-changed'",
      'display-message -p source-changed',
    ]);
    const reply = JSON.parse(socket.sent[0]);
    expect(reply.type).toBe('windows');
    expect(reply.error).toBeUndefined();
    expect(
      reply.windows.map((w: { id: string; index: number; active: boolean }) => [
        w.id,
        w.index,
        w.active,
      ])
    ).toEqual([
      ['@2', 59, false],
      ['@1', 60, true],
      ['@3', 86, false],
    ]);
    expect(pty.writeCalls).toEqual([]);
  });

  it('uses -b when position is before', async () => {
    const { socket, execCommand } = await createHarness();
    execCommand
      .mockReturnValueOnce(initialList)
      .mockReturnValueOnce('window-moved\n')
      .mockReturnValueOnce('@3\t0\t1\tthird\n@1\t1\t0\tfirst\n@2\t59\t0\tsecond\n');

    await socket.simulateMessage({
      type: 'move-window',
      sourceId: '@3',
      sourceIndex: 86,
      targetId: '@1',
      targetIndex: 0,
      position: 'before',
    });

    expect(execCommand).toHaveBeenNthCalledWith(2, 'tmux', [
      'if-shell',
      '-F',
      '-t',
      '=terminal-session:86',
      '#{==:#{window_id},@3}',
      "if-shell -F -t '=terminal-session:0' '#{==:#{window_id},@1}' \"move-window -b -s '=terminal-session:86' -t '=terminal-session:0' ; display-message -p window-moved\" 'display-message -p target-changed'",
      'display-message -p source-changed',
    ]);
  });

  it.each([
    [
      { sourceId: 'bad', sourceIndex: 0, targetId: '@2', targetIndex: 1, position: 'after' },
      'Invalid source window ID',
    ],
    [
      { sourceId: '@1', sourceIndex: -1, targetId: '@2', targetIndex: 1, position: 'after' },
      'Invalid source window index',
    ],
    [
      {
        sourceId: '@1',
        sourceIndex: 0,
        targetId: '@2;kill-server',
        targetIndex: 1,
        position: 'after',
      },
      'Invalid target window ID',
    ],
    [
      { sourceId: '@1', sourceIndex: 0, targetId: '@2', targetIndex: 1.5, position: 'after' },
      'Invalid target window index',
    ],
    [
      { sourceId: '@1', sourceIndex: 0, targetId: '@2', targetIndex: 1, position: 'swap' },
      'Invalid move position',
    ],
    [
      { sourceId: '@1', sourceIndex: 5, targetId: '@1', targetIndex: 5, position: 'before' },
      'Source and target window must differ',
    ],
  ])('rejects invalid payload %o without invoking tmux', async (payload, error) => {
    const { socket, execCommand, pty } = await createHarness();

    await socket.simulateMessage({ type: 'move-window', ...payload });

    expect(execCommand).not.toHaveBeenCalled();
    expect(JSON.parse(socket.sent[0])).toEqual({ type: 'windows', windows: [], error });
    expect(pty.writeCalls).toEqual([]);
  });

  it('refuses when source or target window is not in the attached session', async () => {
    const { socket, execCommand } = await createHarness();
    execCommand.mockReturnValue(initialList);

    await socket.simulateMessage({
      type: 'move-window',
      sourceId: '@99',
      sourceIndex: 0,
      targetId: '@2',
      targetIndex: 59,
      position: 'after',
    });

    expect(execCommand).toHaveBeenCalledTimes(1);
    expect(JSON.parse(socket.sent[0])).toEqual({
      type: 'windows',
      windows: [],
      error: 'Source window is not in the attached session',
    });

    socket.sent.length = 0;
    execCommand.mockClear();
    execCommand.mockReturnValue(initialList);

    await socket.simulateMessage({
      type: 'move-window',
      sourceId: '@1',
      sourceIndex: 0,
      targetId: '@99',
      targetIndex: 59,
      position: 'after',
    });

    expect(execCommand).toHaveBeenCalledTimes(1);
    expect(JSON.parse(socket.sent[0])).toEqual({
      type: 'windows',
      windows: [],
      error: 'Target window is not in the attached session',
    });
  });

  it('reports when a window moves before the atomic guard fires and never leaks into PTY', async () => {
    const { socket, execCommand, pty } = await createHarness();
    execCommand.mockReturnValueOnce(initialList).mockReturnValueOnce('target-changed\n');

    await socket.simulateMessage({
      type: 'move-window',
      sourceId: '@1',
      sourceIndex: 0,
      targetId: '@2',
      targetIndex: 59,
      position: 'after',
    });

    expect(JSON.parse(socket.sent[0])).toEqual({
      type: 'windows',
      windows: [],
      error: 'The tmux window changed',
    });
    expect(pty.writeCalls).toEqual([]);
  });
});

// Real tmux integration against a dedicated private socket inside a freshly owned temp dir.
// NEVER touches the default tmux server or TMUX_TMPDIR.
async function hasTmux(): Promise<boolean> {
  try {
    await execFileAsync('tmux', ['-V']);
    return true;
  } catch {
    return false;
  }
}

describe.runIf(await hasTmux())(
  'TmuxSessionManager.moveWindow against a private tmux server',
  () => {
    let socketDir = '';
    let socketPath = '';
    const sessionName = 'cg-move-window-test';

    /** Run tmux exclusively against our private socket; refuse if socketPath is unset. */
    async function runPrivateTmux(command: string, args: string[]): Promise<string> {
      if (command !== 'tmux') throw new Error(`Unexpected command: ${command}`);
      if (!socketPath || !socketDir || !socketPath.startsWith(socketDir)) {
        throw new Error('Refusing to invoke tmux without verified private socket path');
      }
      const { stdout } = await execFileAsync('tmux', ['-S', socketPath, ...args]);
      return stdout;
    }

    let manager: TmuxSessionManager;

    beforeAll(async () => {
      socketDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-tmux-move-'));
      socketPath = path.join(socketDir, 'tmux.sock');
      if (!fs.existsSync(socketDir)) {
        throw new Error(`Private tmux socket dir was not created: ${socketDir}`);
      }
      // Start an isolated server with -f /dev/null so user tmux.conf cannot interfere.
      await execFileAsync('tmux', [
        '-S',
        socketPath,
        '-f',
        '/dev/null',
        'new-session',
        '-d',
        '-s',
        sessionName,
        '-n',
        'alpha',
      ]);
      await runPrivateTmux('tmux', ['new-window', '-t', `=${sessionName}:`, '-n', 'beta']);
      await runPrivateTmux('tmux', ['new-window', '-t', `=${sessionName}:`, '-n', 'gamma']);
      await runPrivateTmux('tmux', ['new-window', '-t', `=${sessionName}:`, '-n', 'delta']);

      const spawner = createFakePtySpawner();
      manager = new TmuxSessionManager(runPrivateTmux, spawner.spawn);
    });

    afterAll(async () => {
      if (socketPath && socketDir && socketPath.startsWith(socketDir)) {
        try {
          await execFileAsync('tmux', ['-S', socketPath, 'kill-session', '-t', `=${sessionName}`]);
        } catch {
          // Session may already be gone; ensure private server on THIS socket stops cleanly.
        }
        try {
          await execFileAsync('tmux', ['-S', socketPath, 'kill-server']);
        } catch {
          // Server already exited when last session closed.
        }
        fs.rmSync(socketDir, { recursive: true, force: true });
      }
    });

    function requireWindow(list: TerminalWindow[], name: string): TerminalWindow {
      const found = list.find((w) => w.name === name);
      if (!found) throw new Error(`Expected window ${name} in private tmux session`);
      return found;
    }

    it('inserts before index 0, shifts later windows up without overwriting, and selects the moved window', async () => {
      // Select alpha (0) so delta (3) is NOT active before the move.
      const before = await manager.listWindows(sessionName, true);
      const alpha = requireWindow(before, 'alpha');
      const delta = requireWindow(before, 'delta');
      await manager.selectWindow(sessionName, alpha.id, alpha.index);

      // Move inactive delta before alpha (index 0).
      const after = await manager.moveWindow(
        sessionName,
        delta.id,
        delta.index,
        alpha.id,
        alpha.index,
        'before'
      );

      expect(after.map((w) => w.name)).toEqual(['delta', 'alpha', 'beta', 'gamma']);
      expect(after.map((w) => w.index)).toEqual([0, 1, 2, 3]);
      // Jordan's rule: the moved window becomes the selected window at its new index.
      expect(after.find((w) => w.id === delta.id)).toMatchObject({ index: 0, active: true });
      expect(after.filter((w) => w.active)).toHaveLength(1);
    });

    it('inserts into a sparse gap (59 then 86) adjacent to its neighbour and selects the moved window', async () => {
      // Arrange sparse indices: delta(0), alpha(1), beta(59), gamma(86); select delta(0).
      await runPrivateTmux('tmux', [
        'move-window',
        '-s',
        `=${sessionName}:2`,
        '-t',
        `=${sessionName}:59`,
      ]);
      await runPrivateTmux('tmux', [
        'move-window',
        '-s',
        `=${sessionName}:3`,
        '-t',
        `=${sessionName}:86`,
      ]);
      const sparse = await manager.listWindows(sessionName, true);
      const delta = requireWindow(sparse, 'delta');
      const alpha = requireWindow(sparse, 'alpha');
      const beta = requireWindow(sparse, 'beta');
      const gamma = requireWindow(sparse, 'gamma');
      await manager.selectWindow(sessionName, delta.id, delta.index);

      // Drop inactive alpha (1) between beta (59) and gamma (86) using position 'after' beta.
      const moved = await manager.moveWindow(
        sessionName,
        alpha.id,
        alpha.index,
        beta.id,
        beta.index,
        'after'
      );

      expect(moved.map((w) => [w.name, w.index])).toEqual([
        ['delta', 0],
        ['beta', 59],
        ['alpha', 60],
        ['gamma', 86],
      ]);
      // Moved window (alpha) is now active at index 60.
      expect(moved.find((w) => w.id === alpha.id)).toMatchObject({ index: 60, active: true });
      expect(moved.find((w) => w.id === gamma.id)).toMatchObject({ index: 86, active: false });

      // Now drop delta (0) before beta (59) — lands at 59 and shifts beta(60), alpha(61), leaves gamma(86).
      const movedBefore = await manager.moveWindow(
        sessionName,
        delta.id,
        delta.index,
        beta.id,
        beta.index,
        'before'
      );
      expect(movedBefore.map((w) => [w.name, w.index])).toEqual([
        ['delta', 59],
        ['beta', 60],
        ['alpha', 61],
        ['gamma', 86],
      ]);
      expect(movedBefore.find((w) => w.id === delta.id)).toMatchObject({ index: 59, active: true });
    });
  }
);
