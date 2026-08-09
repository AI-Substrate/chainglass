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

  async simulateMessage(data: string): Promise<void> {
    for (const listener of this.listeners('message')) {
      await (listener as (raw: Buffer) => void | Promise<void>)(Buffer.from(data));
    }
  }
}

function createHarness(execCommand: ReturnType<typeof vi.fn>) {
  const spawner = createFakePtySpawner();
  const server = createTerminalServer({ execCommand, spawnPty: spawner.spawn });
  const socket = new FakeWebSocket();
  server.handleConnection(
    socket as unknown as import('ws').WebSocket,
    'terminal-session',
    process.cwd()
  );
  execCommand.mockClear();
  return { socket, pty: spawner.lastInstance as FakePty };
}

describe('terminal WebSocket rename-window control frame', () => {
  it('renames the active session window through a fixed tmux argv command', async () => {
    const execCommand = vi.fn(() => '');
    const { socket } = createHarness(execCommand);

    await socket.simulateMessage(JSON.stringify({ type: 'rename-window', name: 'my window' }));

    expect(execCommand).toHaveBeenCalledWith('tmux', [
      'rename-window',
      '-t',
      'terminal-session',
      '--',
      'my window',
    ]);
    expect(socket.sent).toContain(JSON.stringify({ type: 'rename-window', renamed: true }));
  });

  it.each([
    ['empty', ''],
    ['leading dash', '-x'],
  ])('rejects a %s label without executing tmux', async (_label, name) => {
    const execCommand = vi.fn(() => '');
    const { socket } = createHarness(execCommand);

    await socket.simulateMessage(JSON.stringify({ type: 'rename-window', name }));

    expect(execCommand).not.toHaveBeenCalled();
    expect(socket.sent).toContain(
      JSON.stringify({ type: 'rename-window', renamed: false, error: 'Invalid window name' })
    );
  });

  it('returns a control-frame error without writing the request into the terminal', async () => {
    const execCommand = vi.fn(() => {
      throw new Error('tmux failed');
    });
    const { socket, pty } = createHarness(execCommand);

    await socket.simulateMessage(JSON.stringify({ type: 'rename-window', name: 'my window' }));

    expect(pty.writeCalls).toEqual([]);
    expect(socket.sent).toContain(
      JSON.stringify({ type: 'rename-window', renamed: false, error: 'tmux failed' })
    );
  });
});
