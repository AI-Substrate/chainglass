import { EventEmitter } from 'node:events';
import { createTerminalServer } from '@/features/064-terminal/server/terminal-ws';
import type { ResizePaneRequest, TmuxWindowLayout } from '@/features/064-terminal/types';
import { describe, expect, it, vi } from 'vitest';
import { type FakePty, createFakePtySpawner } from '../../../../fakes/fake-pty';

class FakeWebSocket extends EventEmitter {
  readyState = 1;
  readonly sent: string[] = [];

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {}

  async simulateMessage(message: unknown): Promise<void> {
    for (const listener of this.listeners('message')) {
      await (listener as (raw: Buffer) => void | Promise<void>)(
        Buffer.from(JSON.stringify(message))
      );
    }
  }

  get result() {
    return JSON.parse(this.sent[this.sent.length - 1]);
  }
}

function initialLayout(): TmuxWindowLayout {
  return {
    windowId: '@1',
    width: 120,
    height: 40,
    revision:
      'abcd,120x40,0,0{39x40,0,0,1,39x40,40,0[39x9,40,0,2,39x19,40,10,3,39x10,40,30,4],40x40,80,0,5}|bottom|0|1',
    statusPosition: 'bottom',
    statusRows: 1,
    zoomed: false,
    panes: [
      { id: '%1', left: 0, top: 0, width: 39, height: 40 },
      { id: '%2', left: 40, top: 0, width: 39, height: 9 },
      { id: '%3', left: 40, top: 10, width: 39, height: 19 },
      { id: '%4', left: 40, top: 30, width: 39, height: 10 },
      { id: '%5', left: 80, top: 0, width: 40, height: 40 },
    ],
  };
}

function layoutOutput(
  layout: TmuxWindowLayout,
  status: number | string = layout.statusRows
): string {
  return layout.panes
    .map((pane) =>
      [
        layout.windowId,
        layout.width,
        layout.height,
        layout.revision,
        layout.statusPosition,
        layout.zoomed ? 1 : 0,
        status,
        pane.id,
        pane.left,
        pane.top,
        pane.width,
        pane.height,
      ].join('\t')
    )
    .join('\n');
}

class FakeTmux {
  available = true;
  layout = initialLayout();
  readError: unknown;
  resizeError: unknown;
  rawOutput: string | undefined;
  status: number | string | undefined;
  nextLayout: TmuxWindowLayout | undefined;
  beforeGuard: (() => void) | undefined;
  readonly mutations: string[] = [];

  readonly exec = vi.fn((_command: string, args: string[]): string => {
    if (args[0] === '-V') {
      if (!this.available) throw new Error('tmux missing');
      return 'tmux 3.6a';
    }
    if (args[0] === 'list-panes') {
      if (this.readError) throw this.readError;
      return this.rawOutput ?? layoutOutput(this.layout, this.status);
    }
    if (args[0] === 'if-shell') {
      this.beforeGuard?.();
      if (this.resizeError) throw this.resizeError;
      // A synchronous format guard either performs its fixed command or emits
      // the stale marker. Real tmux queue execution is covered by runtime smoke.
      const escaped = this.layout.revision.replace(/[#},]/g, (character) => `#${character}`);
      const currentGuard = `#{&&:#{==:#{window_id},${this.layout.windowId}},#{==:#{window_layout}|#{status-position}|#{window_zoomed_flag}|#{status},${escaped}}}`;
      if (args[4] !== currentGuard) return 'pane-layout-changed\n';
      this.mutations.push(args[5]);
      if (this.nextLayout) this.layout = this.nextLayout;
      return 'pane-resized\n';
    }
    return '';
  });
}

function createHarness(tmux = new FakeTmux()) {
  const spawner = createFakePtySpawner();
  const server = createTerminalServer({ execCommand: tmux.exec, spawnPty: spawner.spawn });
  const socket = new FakeWebSocket();
  server.handleConnection(
    socket as unknown as import('ws').WebSocket,
    'terminal-session',
    process.cwd()
  );
  tmux.exec.mockClear();
  const request: ResizePaneRequest = {
    windowId: tmux.layout.windowId,
    paneId: '%1',
    axis: 'x',
    fraction: 0.5,
    revision: tmux.layout.revision,
  };
  return { tmux, socket, request, pty: spawner.lastInstance as FakePty };
}

function resizeMessage(request: ResizePaneRequest) {
  return { type: 'resize-pane', ...request };
}

function selectedLayoutBody(tmux: FakeTmux): string {
  const match =
    /^select-layout -t '=terminal-session:@1' '[0-9a-f]{4},([^']+)' ; display-message -p pane-resized$/.exec(
      tmux.mutations[0]
    );
  expect(match).not.toBeNull();
  return match?.[1] ?? '';
}

function nestedLayout(axis: 'x' | 'y'): TmuxWindowLayout {
  const body =
    axis === 'x'
      ? '162x41,0,0{80x41,0,0[80x20,0,0{39x20,0,0,1,40x20,40,0,2},80x20,0,21,3],40x41,81,0,4,40x41,122,0,5}'
      : '41x162,0,0[41x80,0,0{20x80,0,0[20x39,0,0,1,20x40,0,40,2],20x80,21,0,3},41x40,0,81,4,41x40,0,122,5]';
  const panes = [
    { id: '%1', left: 0, top: 0, width: 39, height: 20 },
    { id: '%2', left: 40, top: 0, width: 40, height: 20 },
    { id: '%3', left: 0, top: 21, width: 80, height: 20 },
    { id: '%4', left: 81, top: 0, width: 40, height: 41 },
    { id: '%5', left: 122, top: 0, width: 40, height: 41 },
  ];
  return {
    ...initialLayout(),
    width: axis === 'x' ? 162 : 41,
    height: axis === 'x' ? 41 : 162,
    revision: `abcd,${body}|bottom|0|1`,
    panes:
      axis === 'x'
        ? panes
        : panes.map((pane) => ({
            id: pane.id,
            left: pane.top,
            top: pane.left,
            width: pane.height,
            height: pane.width,
          })),
  };
}

describe('terminal WebSocket pane layout and resize', () => {
  it('reads only the exact connection session active window, ignoring payload targets', async () => {
    const { tmux, socket, pty } = createHarness();
    await socket.simulateMessage({ type: 'pane-layout', sessionName: 'foreign', windowId: '@99' });

    expect(tmux.exec).toHaveBeenCalledOnce();
    expect(tmux.exec).toHaveBeenCalledWith('tmux', [
      'list-panes',
      '-t',
      '=terminal-session:',
      '-F',
      expect.stringContaining('#{pane_left}'),
    ]);
    expect(socket.result).toEqual({ type: 'pane-layout', layout: tmux.layout });
    expect(pty.writeCalls).toEqual([]);
  });

  it.each([
    ['x', '%3', 0.6, '32x19,40,10,3'],
    ['y', '%3', 0.9, '39x26,40,10,3'],
    ['x', '%1', 0.333, '40x40,0,0,1'],
    ['x', '%3', 0, '1x19,40,10,3'],
    ['y', '%3', 1, '39x28,40,10,3'],
  ] as const)(
    'converts the %s border fraction into pane cells and returns actual readback',
    async (axis, paneId, fraction, expectedCell) => {
      const { tmux, socket, request, pty } = createHarness();
      tmux.nextLayout = {
        ...initialLayout(),
        revision: 'read-back-layout|bottom|0',
        panes: [
          { id: '%1', left: 0, top: 0, width: 49, height: 40 },
          { id: '%2', left: 50, top: 0, width: 70, height: 19 },
          { id: '%3', left: 50, top: 20, width: 70, height: 20 },
        ],
      };
      await socket.simulateMessage({
        ...resizeMessage({ ...request, axis, paneId, fraction }),
        sessionName: 'foreign',
      });

      expect(tmux.mutations).toHaveLength(1);
      expect(selectedLayoutBody(tmux)).toContain(expectedCell);
      const guardCall = tmux.exec.mock.calls.find(([, args]) => args[0] === 'if-shell');
      expect(guardCall?.[1].slice(0, 4)).toEqual(['if-shell', '-F', '-t', '=terminal-session:']);
      expect(socket.result).toEqual({ type: 'pane-layout', layout: tmux.nextLayout });
      expect(pty.writeCalls).toEqual([]);
      expect(pty.resizeCalls).toEqual([]);
    }
  );

  it.each([
    [
      'x',
      '162x41,0,0{90x41,0,0[90x20,0,0{39x20,0,0,1,50x20,40,0,2},90x20,0,21,3],30x41,91,0,4,40x41,122,0,5}',
    ],
    [
      'y',
      '41x162,0,0[41x90,0,0{20x90,0,0[20x39,0,0,1,20x50,0,40,2],20x90,21,0,3},41x30,0,91,4,41x40,0,122,5]',
    ],
  ] as const)(
    'moves the nested %s outer border, not the nearer same-axis split',
    async (axis, expected) => {
      const tmux = new FakeTmux();
      tmux.layout = nestedLayout(axis);
      const { socket, request, pty } = createHarness(tmux);
      await socket.simulateMessage(
        resizeMessage({ ...request, paneId: '%2', axis, fraction: 90 / 162 })
      );
      // The entire tree proves the inner split and distant %5 subtree stay put,
      // along with window dimensions, pane IDs, ordering, and the orthogonal axis.
      expect(tmux.mutations).toHaveLength(1);
      expect(selectedLayoutBody(tmux)).toBe(expected);
      expect(socket.result.error).toBeUndefined();
      expect(pty.writeCalls).toEqual([]);
    }
  );

  it('clamps a nested subtree to recursive pane minima without touching distant siblings', async () => {
    const tmux = new FakeTmux();
    tmux.layout = nestedLayout('x');
    const { socket, request } = createHarness(tmux);
    await socket.simulateMessage(resizeMessage({ ...request, paneId: '%2', fraction: 0 }));
    expect(selectedLayoutBody(tmux)).toBe(
      '162x41,0,0{3x41,0,0[3x20,0,0{1x20,0,0,1,1x20,2,0,2},3x20,0,21,3],117x41,4,0,4,40x41,122,0,5}'
    );
  });

  it.each([
    ['x', '%5'],
    ['y', '%4'],
  ] as const)(
    'rejects an outer %s window edge instead of moving another split',
    async (axis, paneId) => {
      const { tmux, socket, request } = createHarness();
      await socket.simulateMessage(resizeMessage({ ...request, axis, paneId }));
      expect(tmux.mutations).toEqual([]);
      expect(socket.result.error).toBe('Pane has no resizable border on this axis');
    }
  );

  it('refuses pane-order mismatches rather than relocate panes through select-layout', async () => {
    const { tmux, socket, request } = createHarness();
    tmux.layout.panes.reverse();
    await socket.simulateMessage(resizeMessage(request));
    expect(tmux.mutations).toEqual([]);
    expect(socket.result.error).toBe('Tmux pane order changed');
  });

  it.each([
    ['off', 0],
    ['on', 1],
    ['0', 0],
    ['2', 2],
    ['5', 5],
  ] as const)('reports actual top status rows for %s', async (status, statusRows) => {
    const tmux = new FakeTmux();
    tmux.status = status;
    tmux.layout.statusPosition = 'top';
    tmux.layout.statusRows = statusRows;
    const { socket } = createHarness(tmux);
    await socket.simulateMessage({ type: 'pane-layout' });
    expect(socket.result.layout).toEqual(tmux.layout);
  });

  it.each(['@2', '@99'])(
    'rejects inactive or foreign window %s before mutation',
    async (windowId) => {
      const { tmux, socket, request } = createHarness();
      await socket.simulateMessage(resizeMessage({ ...request, windowId }));
      expect(tmux.mutations).toEqual([]);
      expect(tmux.exec.mock.calls.every(([, args]) => args[0] === 'list-panes')).toBe(true);
      expect(socket.result).toEqual({
        type: 'pane-layout',
        layout: tmux.layout,
        error: 'The active tmux window changed',
      });
    }
  );

  it.each(['%6', '%99'])('rejects inactive or foreign pane %s before mutation', async (paneId) => {
    const { tmux, socket, request } = createHarness();
    await socket.simulateMessage(resizeMessage({ ...request, paneId }));
    expect(tmux.mutations).toEqual([]);
    expect(tmux.exec.mock.calls.every(([, args]) => args[0] === 'list-panes')).toBe(true);
    expect(socket.result.error).toBe('Pane is not in the active tmux window');
  });

  it('rejects a stale layout and returns the refreshed geometry', async () => {
    const { tmux, socket, request } = createHarness();
    tmux.layout = { ...initialLayout(), revision: 'changed-layout|bottom|0' };
    await socket.simulateMessage(resizeMessage(request));
    expect(tmux.mutations).toEqual([]);
    expect(socket.result).toEqual({
      type: 'pane-layout',
      layout: tmux.layout,
      error: 'The tmux pane layout changed',
    });
  });

  it.each(['window switch', 'pane movement', 'zoom'] as const)(
    'guards a %s between preflight and execution',
    async (change) => {
      const { tmux, socket, request } = createHarness();
      tmux.beforeGuard = () => {
        if (change === 'window switch') tmux.layout = { ...initialLayout(), windowId: '@2' };
        else if (change === 'pane movement')
          tmux.layout = { ...initialLayout(), revision: 'moved-pane|bottom|0' };
        else tmux.layout = { ...initialLayout(), revision: 'zoomed-layout|bottom|1', zoomed: true };
      };
      await socket.simulateMessage(resizeMessage(request));
      expect(tmux.mutations).toEqual([]);
      expect(socket.result).toEqual({
        type: 'pane-layout',
        layout: tmux.layout,
        error: 'The active tmux window or pane layout changed',
      });
    }
  );

  it('reports zoom and top status while refusing to unzoom a resize target', async () => {
    const tmux = new FakeTmux();
    tmux.layout = {
      ...initialLayout(),
      revision: 'zoomed-layout|top|1',
      zoomed: true,
      statusPosition: 'top',
    };
    const { socket, request } = createHarness(tmux);
    await socket.simulateMessage({ type: 'pane-layout' });
    expect(socket.result.layout).toEqual(tmux.layout);
    await socket.simulateMessage(resizeMessage(request));
    expect(tmux.mutations).toEqual([]);
    expect(socket.result.error).toBe('Unzoom the tmux window before resizing panes');
  });

  it.each([
    { windowId: '@1;kill-server' },
    { windowId: 1 },
    { windowId: '' },
    { paneId: '%1;kill-server' },
    { paneId: null },
    { paneId: '-a' },
    { axis: 'z' },
    { axis: null },
    { fraction: -0.1 },
    { fraction: 1.1 },
    { fraction: '0.5' },
    { fraction: null },
    { fraction: Number.NaN },
    { fraction: Number.POSITIVE_INFINITY },
    { revision: '' },
    { revision: null },
    { revision: {} },
    { revision: 'x'.repeat(65537) },
  ])('rejects malformed resize fields without tmux or PTY input', async (overrides) => {
    const { tmux, socket, request, pty } = createHarness();
    await socket.simulateMessage({ ...resizeMessage(request), ...overrides });
    expect(tmux.exec).not.toHaveBeenCalled();
    expect(pty.writeCalls).toEqual([]);
    expect(socket.result).toEqual({
      type: 'pane-layout',
      layout: null,
      error: 'Invalid pane resize request',
    });
  });

  it('consumes a resize control frame with missing fields instead of typing it', async () => {
    const { tmux, socket, pty } = createHarness();
    await socket.simulateMessage({ type: 'resize-pane' });
    expect(tmux.exec).not.toHaveBeenCalled();
    expect(pty.writeCalls).toEqual([]);
    expect(socket.result.error).toBe('Invalid pane resize request');
  });

  it.each(['pane-layout', 'resize-pane'])(
    'returns an honest no-tmux error for %s',
    async (type) => {
      const tmux = new FakeTmux();
      tmux.available = false;
      const { socket, request, pty } = createHarness(tmux);
      await socket.simulateMessage({ ...request, type });
      expect(tmux.exec).not.toHaveBeenCalled();
      expect(pty.writeCalls).toEqual([]);
      expect(socket.result).toEqual({
        type: 'pane-layout',
        layout: null,
        error: 'tmux is not available',
      });
    }
  );

  it.each(['pane-layout', 'resize-pane'])(
    'contains read failures inside the %s branch',
    async (type) => {
      const { tmux, socket, request, pty } = createHarness();
      tmux.readError = new Error('session disappeared');
      await socket.simulateMessage({ ...request, type });
      expect(pty.writeCalls).toEqual([]);
      expect(socket.result).toEqual({
        type: 'pane-layout',
        layout: null,
        error: 'session disappeared',
      });
    }
  );

  it('returns resize errors with refreshed layout without writing the request into the terminal', async () => {
    const { tmux, socket, request, pty } = createHarness();
    tmux.resizeError = new Error('pane disappeared');
    await socket.simulateMessage(resizeMessage(request));
    expect(tmux.mutations).toEqual([]);
    expect(pty.writeCalls).toEqual([]);
    expect(socket.result).toEqual({
      type: 'pane-layout',
      layout: tmux.layout,
      error: 'pane disappeared',
    });
  });

  it.each(['', '@1\t120\t40\trevision\tbottom\t0\t1\t%1\t0\t0\tNaN\t40'])(
    'rejects malformed tmux geometry without terminal input',
    async (rawOutput) => {
      const { tmux, socket, pty } = createHarness();
      tmux.rawOutput = rawOutput;
      await socket.simulateMessage({ type: 'pane-layout' });
      expect(pty.writeCalls).toEqual([]);
      expect(socket.result.layout).toBeNull();
      expect(socket.result.error).toMatch(/Invalid tmux (window|pane) geometry/);
    }
  );
});
