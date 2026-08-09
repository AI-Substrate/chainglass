import { useTerminalSocket } from '@/features/064-terminal/hooks/use-terminal-socket';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

class FakeBrowserWebSocket {
  static OPEN = 1;
  static instances: FakeBrowserWebSocket[] = [];

  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(_url: string) {
    FakeBrowserWebSocket.instances.push(this);
  }

  close(): void {
    this.readyState = 3;
  }

  send(): void {}

  open(): void {
    this.readyState = FakeBrowserWebSocket.OPEN;
    this.onopen?.();
  }

  simulateMessage(data: string): void {
    this.onmessage?.({ data });
  }
}

const originalWebSocket = globalThis.WebSocket;

describe('useTerminalSocket rename-window control frame', () => {
  beforeEach(() => {
    FakeBrowserWebSocket.instances = [];
    vi.stubGlobal('WebSocket', FakeBrowserWebSocket);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    globalThis.WebSocket = originalWebSocket;
  });

  it('does not write rename-window replies into xterm', async () => {
    const onData = vi.fn();
    renderHook(() =>
      useTerminalSocket({
        sessionName: 'terminal-session',
        cwd: '/tmp',
        onData,
      })
    );

    await waitFor(() => expect(FakeBrowserWebSocket.instances).toHaveLength(1));
    act(() => {
      FakeBrowserWebSocket.instances[0].open();
      FakeBrowserWebSocket.instances[0].simulateMessage(
        JSON.stringify({ type: 'rename-window', renamed: true })
      );
    });

    expect(onData).not.toHaveBeenCalled();
  });

  it('reports a failed rename-window reply to the UI callback', async () => {
    const onRenameWindowResult = vi.fn();
    renderHook(() =>
      useTerminalSocket({
        sessionName: 'terminal-session',
        cwd: '/tmp',
        onRenameWindowResult,
      })
    );

    await waitFor(() => expect(FakeBrowserWebSocket.instances).toHaveLength(1));
    act(() => {
      FakeBrowserWebSocket.instances[0].open();
      FakeBrowserWebSocket.instances[0].simulateMessage(
        JSON.stringify({ type: 'rename-window', renamed: false, error: 'tmux failed' })
      );
    });

    expect(onRenameWindowResult).toHaveBeenCalledWith({
      renamed: false,
      error: 'tmux failed',
    });
  });
});
