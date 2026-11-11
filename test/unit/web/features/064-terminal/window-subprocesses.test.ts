import { afterEach, describe, expect, it, vi } from 'vitest';
import { TmuxSessionManager } from '../../../../../apps/web/src/features/064-terminal/server/tmux-session-manager';

// Two windows shaped like live unasphere panes (2026-09-29). @14: omp with tool servers, a
// language server, and a vite dev server parked under its daemon broker. @15: Claude with only
// infrastructure (tool servers, caffeinate). cpu columns are cumulative seconds at time t.
function psSnapshot(t: number, viteRate: number): string {
  const row = (pid: number, ppid: number, cpu: number, args: string) =>
    `${pid} ${ppid} 0:${cpu.toFixed(2).padStart(5, '0')} ${args}`;
  const idle = (base: number) => base + t * 0.005;
  return [
    row(100, 1, 0.1, '-zsh'),
    row(101, 100, 1 + t * 0.023, 'omp'), // omp idles at ~2.3% on its own
    row(102, 101, idle(1), 'node /Users/me/.npm-global/bin/zen-mcp'),
    row(103, 101, idle(1), 'npm exec @perplexity-ai/mcp-server'),
    row(104, 101, idle(1), '/Users/me/.local/bin/omp __omp_worker_lsp_mux'),
    row(105, 104, 1 + t * 0.3, 'node /Users/me/.npm-global/bin/typescript-language-server --stdio'),
    row(106, 101, idle(1), '/Users/me/.local/bin/omp __omp_worker_daemon_broker'),
    row(107, 106, idle(1), 'node /opt/homebrew/bin/pnpm exec vite --port 55181'),
    row(108, 107, 1 + t * viteRate, 'node ./node_modules/.bin/../vite/bin/vite.js --port 55181'),
    row(200, 1, 0.1, '-zsh'),
    row(201, 200, idle(1), 'claude --dangerously-skip-permissions'),
    row(202, 201, idle(1), 'node /Users/me/.npm-global/bin/perplexity-mcp'),
    row(203, 201, idle(1), '/Users/me/.local/bin/uv tool uvx mcp-for-blender@2.0.0'),
    row(204, 201, idle(1), 'caffeinate -i -t 300'),
  ].join('\n');
}

async function poll(manager: TmuxSessionManager, t: number): Promise<void> {
  vi.spyOn(Date, 'now').mockReturnValue((1_790_000_000 + t) * 1000);
  await manager.listWindows('main');
  await vi.waitFor(() =>
    expect((manager as unknown as { sampling: Set<string> }).sampling.size).toBe(0)
  );
}

afterEach(() => vi.restoreAllMocks());

describe('agent window activity vs its background jobs', () => {
  it('reports jobs only for real work, idle until they burn CPU — never lighting the agent', async () => {
    let viteRate = 0;
    let t = 0;
    const exec = async (_: string, args: string[]) =>
      args[0] === 'list-windows' ? '@14\t14\t0\tomp-seat\n@15\t15\t0\tclaude-seat\n' : '';
    const execAsync = async (command: string, args: string[]) => {
      if (command === 'ps') return psSnapshot(t, viteRate);
      if (args[0] === 'list-panes') return '@14\t100\t1\n@15\t200\t1\n';
      return '';
    };
    const manager = new TmuxSessionManager(exec, (() => null) as never, execAsync);
    // One list per check: every list also starts a sample, which must not land between two reads.
    const snapshot = async () => {
      const windows = await manager.listWindows('main');
      return (id: string) => windows.find((w) => w.id === id);
    };

    // Idle: a busy language server (30%) and tool servers are infrastructure, not jobs.
    for (t = 0; t <= 8; t += 2) await poll(manager, t);
    let read = await snapshot();
    expect(read('@15')).toMatchObject({ agent: 'claude', background: null });
    expect(read('@14')).toMatchObject({ agent: 'pi', activeSeconds: null });
    expect(read('@14')?.background?.jobs.map((job) => job.label)).toEqual(['vite']);
    expect(read('@14')?.background?.cpu).toBeLessThan(0.03);

    // The dev server starts working; omp itself stays idle.
    viteRate = 0.58;
    for (t = 10; t <= 14; t += 2) await poll(manager, t);
    read = await snapshot();
    expect(read('@14')?.activeSeconds).toBeNull();
    expect(read('@14')?.background?.jobs[0].cpu).toBeCloseTo(0.585, 2);
    expect(read('@14')?.background?.cpu).toBeCloseTo(0.585, 2);
  });

  it("counts none of Copilot's own processes as jobs, only the work it starts", async () => {
    // Shaped like live pij panes (2026-11-09). @16: the npm install, a node shim whose child is the
    // native binary (the agent itself, idling at ~2.5%) with Copilot's extension host and a tool
    // server under it. @17: the standalone install, extension host directly under the agent, and
    // a cargo build the agent started.
    let t = 0;
    const row = (pid: number, ppid: number, cpu: number, args: string) =>
      `${pid} ${ppid} 0:${cpu.toFixed(2).padStart(5, '0')} ${args}`;
    const native =
      '/Users/me/.npm-global/lib/node_modules/@github/copilot/node_modules/@github/copilot-darwin-arm64/copilot';
    const host = '/Users/me/.copilot/pkg/darwin-arm64/1.0.108-1/preloads/extension_bootstrap.mjs';
    const snapshot = () =>
      [
        row(300, 1, 0.1, '-zsh'),
        row(301, 300, 1, 'node /Users/me/.npm-global/bin/copilot --yolo --resume prime'),
        row(302, 301, 1 + t * 0.025, `${native} --yolo --resume prime`),
        row(303, 302, 1 + t * 0.005, `${native} ${host}`),
        row(304, 302, 1, 'npm exec @perplexity-ai/mcp-server'),
        row(400, 1, 0.1, '-zsh'),
        row(401, 400, 1 + t * 0.03, 'copilot --yolo --model gpt-6.1-sol'),
        row(402, 401, 1 + t * 0.005, `/Users/me/.local/bin/copilot ${host}`),
        row(403, 401, 1, 'cargo test -p pij-daemon'),
      ].join('\n');
    const exec = async (_: string, args: string[]) =>
      args[0] === 'list-windows' ? '@16\t16\t0\tcopilot-npm\n@17\t17\t0\tcopilot-local\n' : '';
    const execAsync = async (command: string, args: string[]) => {
      if (command === 'ps') return snapshot();
      if (args[0] === 'list-panes') return '@16\t300\t1\n@17\t400\t1\n';
      return '';
    };
    const manager = new TmuxSessionManager(exec, (() => null) as never, execAsync);

    for (t = 0; t <= 8; t += 2) await poll(manager, t);
    const windows = await manager.listWindows('main');
    const read = (id: string) => windows.find((w) => w.id === id);
    expect(read('@16')).toMatchObject({ agent: 'copilot', background: null });
    expect(read('@17')?.agent).toBe('copilot');
    expect(read('@17')?.background?.jobs.map((job) => job.label)).toEqual(['cargo']);
  });
});
