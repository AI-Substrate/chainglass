import { EventEmitter } from 'node:events';
import { createTerminalServer } from '@/features/064-terminal/server/terminal-ws';
import { describe, expect, it, vi } from 'vitest';
import { type FakePty, createFakePtySpawner } from '../../../../fakes/fake-pty';

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

function createHarness(execCommand = vi.fn(() => ''), sessionName = 'terminal-session') {
  const spawner = createFakePtySpawner();
  const server = createTerminalServer({ execCommand, spawnPty: spawner.spawn });
  const socket = new FakeWebSocket();
  server.handleConnection(socket as unknown as import('ws').WebSocket, sessionName, process.cwd());
  execCommand.mockClear();
  socket.sent.length = 0;
  return { socket, pty: spawner.lastInstance as FakePty, execCommand };
}

const initial = '@3\t0\t1\tfirst\n@12\t7\t0\tsecond name\n';
const switched = '@3\t0\t0\tfirst\n@12\t7\t1\tsecond name\n';

// Observable protocol boundaries: native indices, exact session scope, readback,
// and failure frames never leaking into shell input.
describe('terminal WebSocket window controls', () => {
  it('lists native sparse indices from the connection session, ignoring payload targets', async () => {
    const { socket, execCommand, pty } = createHarness();
    execCommand.mockReturnValue(initial);

    await socket.simulateMessage({ type: 'windows', sessionName: 'other-session' });

    expect(execCommand).toHaveBeenCalledWith('tmux', [
      'list-windows',
      '-t',
      '=terminal-session',
      '-F',
      '#{window_id}\t#{window_index}\t#{window_active}\t#{window_name}',
    ]);
    expect(JSON.parse(socket.sent[0])).toEqual({
      type: 'windows',
      windows: [
        { id: '@3', index: 0, active: true, name: 'first' },
        { id: '@12', index: 7, active: false, name: 'second name' },
      ],
    });
    expect(pty.writeCalls).toEqual([]);
  });

  it('selects a session-qualified stable ID and returns fresh active state', async () => {
    const { socket, execCommand } = createHarness();
    execCommand
      .mockReturnValueOnce(initial)
      .mockReturnValueOnce('window-selected\n')
      .mockReturnValueOnce(switched);

    await socket.simulateMessage({
      type: 'select-window',
      windowId: '@12',
      windowIndex: 7,
      sessionName: 'other',
    });

    expect(execCommand).toHaveBeenNthCalledWith(2, 'tmux', [
      'if-shell',
      '-F',
      '-t',
      '=terminal-session:7',
      '#{==:#{window_id},@12}',
      "select-window -t '=terminal-session:7' ; display-message -p window-selected",
      'display-message -p window-changed',
    ]);
    expect(JSON.parse(socket.sent[0])).toEqual({
      type: 'windows',
      windows: [
        { id: '@3', index: 0, active: false, name: 'first' },
        { id: '@12', index: 7, active: true, name: 'second name' },
      ],
    });
  });

  it.each([undefined, null, 7, '', '7', 'other:@12', '@12;kill-server'])(
    'rejects malformed ID %s without invoking tmux or writing shell input',
    async (windowId) => {
      const { socket, execCommand, pty } = createHarness();
      await socket.simulateMessage({ type: 'select-window', windowId, windowIndex: 7 });
      expect(execCommand).not.toHaveBeenCalled();
      expect(JSON.parse(socket.sent[0])).toEqual({
        type: 'windows',
        windows: [],
        error: 'Invalid window ID',
      });
      expect(pty.writeCalls).toEqual([]);
    }
  );

  it('refuses a foreign or removed window without selecting it', async () => {
    const { socket, execCommand, pty } = createHarness();
    execCommand.mockReturnValue(initial);
    await socket.simulateMessage({ type: 'select-window', windowId: '@99', windowIndex: 7 });
    expect(execCommand).toHaveBeenCalledTimes(1);
    expect(JSON.parse(socket.sent[0])).toEqual({
      type: 'windows',
      windows: [],
      error: 'Window is not in the attached session',
    });
    expect(pty.writeCalls).toEqual([]);
  });

  it.each(['windows', 'select-window'])(
    'contains tmux failures for %s inside the control protocol',
    async (type) => {
      const { socket, execCommand, pty } = createHarness();
      execCommand.mockImplementation(() => {
        throw new Error('session disappeared');
      });
      await socket.simulateMessage({ type, windowId: '@12', windowIndex: 7 });
      expect(JSON.parse(socket.sent[0])).toEqual({
        type: 'windows',
        windows: [],
        error: 'session disappeared',
      });
      expect(pty.writeCalls).toEqual([]);
    }
  );

  it('does not retry globally when a window moves after the membership read', async () => {
    const { socket, execCommand, pty } = createHarness();
    execCommand.mockReturnValueOnce(initial).mockImplementationOnce(() => {
      throw new Error('window is no longer in this session');
    });

    await socket.simulateMessage({ type: 'select-window', windowId: '@12', windowIndex: 7 });

    expect(execCommand).toHaveBeenCalledTimes(2);
    expect(execCommand).toHaveBeenLastCalledWith('tmux', [
      'if-shell',
      '-F',
      '-t',
      '=terminal-session:7',
      '#{==:#{window_id},@12}',
      "select-window -t '=terminal-session:7' ; display-message -p window-selected",
      'display-message -p window-changed',
    ]);
    expect(JSON.parse(socket.sent[0])).toEqual({
      type: 'windows',
      windows: [],
      error: 'window is no longer in this session',
    });
    expect(pty.writeCalls).toEqual([]);
  });

  it('reports unavailable tmux without attempting a window command', async () => {
    const { socket, execCommand, pty } = createHarness(
      vi.fn(() => {
        throw new Error('missing tmux');
      })
    );
    await socket.simulateMessage({ type: 'windows' });
    expect(execCommand).not.toHaveBeenCalled();
    expect(JSON.parse(socket.sent[0])).toEqual({
      type: 'windows',
      windows: [],
      error: 'tmux is not available',
    });
    expect(pty.writeCalls).toEqual([]);
  });

  it('rejects an invalid connection session before listing', async () => {
    const { socket, execCommand } = createHarness(
      vi.fn(() => ''),
      'invalid:session'
    );
    await socket.simulateMessage({ type: 'windows' });
    expect(execCommand).not.toHaveBeenCalled();
    expect(JSON.parse(socket.sent[0])).toEqual({
      type: 'windows',
      windows: [],
      error: 'Invalid session name',
    });
  });

  it('selects the requested numbered link when one ID appears at two indices', async () => {
    const { socket, execCommand } = createHarness();
    execCommand
      .mockReturnValueOnce('@12\t0\t1\tshared\n@12\t3\t0\tshared\n')
      .mockReturnValueOnce('window-selected\n')
      .mockReturnValueOnce('@12\t0\t0\tshared\n@12\t3\t1\tshared\n');

    await socket.simulateMessage({ type: 'select-window', windowId: '@12', windowIndex: 3 });

    expect(execCommand).toHaveBeenNthCalledWith(2, 'tmux', [
      'if-shell',
      '-F',
      '-t',
      '=terminal-session:3',
      '#{==:#{window_id},@12}',
      "select-window -t '=terminal-session:3' ; display-message -p window-selected",
      'display-message -p window-changed',
    ]);
    expect(JSON.parse(socket.sent[0])).toEqual({
      type: 'windows',
      windows: [
        { id: '@12', index: 0, active: false, name: 'shared' },
        { id: '@12', index: 3, active: true, name: 'shared' },
      ],
    });
  });

  it('rejects a mismatched ID and index before mutation', async () => {
    const { socket, execCommand, pty } = createHarness();
    execCommand.mockReturnValue(initial);
    await socket.simulateMessage({ type: 'select-window', windowId: '@12', windowIndex: 0 });
    expect(execCommand).toHaveBeenCalledTimes(1);
    expect(JSON.parse(socket.sent[0])).toEqual({
      type: 'windows',
      windows: [],
      error: 'Window is not in the attached session',
    });
    expect(pty.writeCalls).toEqual([]);
  });

  it('reports index reuse caught by the in-tmux guard without selecting a replacement', async () => {
    const { socket, execCommand, pty } = createHarness();
    execCommand.mockReturnValueOnce(initial).mockReturnValueOnce('window-changed\n');
    await socket.simulateMessage({ type: 'select-window', windowId: '@12', windowIndex: 7 });
    expect(execCommand).toHaveBeenCalledTimes(2);
    expect(execCommand).toHaveBeenLastCalledWith('tmux', [
      'if-shell',
      '-F',
      '-t',
      '=terminal-session:7',
      '#{==:#{window_id},@12}',
      "select-window -t '=terminal-session:7' ; display-message -p window-selected",
      'display-message -p window-changed',
    ]);
    expect(JSON.parse(socket.sent[0])).toEqual({
      type: 'windows',
      windows: [],
      error: 'The tmux window changed',
    });
    expect(pty.writeCalls).toEqual([]);
  });

  it.each([undefined, null, '7', -1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid window index %s without executing tmux',
    async (windowIndex) => {
      const { socket, execCommand, pty } = createHarness();
      await socket.simulateMessage({ type: 'select-window', windowId: '@12', windowIndex });
      expect(execCommand).not.toHaveBeenCalled();
      expect(JSON.parse(socket.sent[0])).toEqual({
        type: 'windows',
        windows: [],
        error: 'Invalid window index',
      });
      expect(pty.writeCalls).toEqual([]);
    }
  );
});
