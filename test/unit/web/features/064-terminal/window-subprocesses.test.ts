import { afterEach, describe, expect, it, vi } from 'vitest';
import { TmuxSessionManager } from '../../../../../apps/web/src/features/064-terminal/server/tmux-session-manager';

// An omp window (pane 100 → omp 101) with four idle helpers and a vite dev server, shaped like
// unasphere window 14 on 2026-09-29. Each poll advances 2s; cpu columns are cumulative seconds.
function psSnapshot(t: number, viteRate: number): string {
  const row = (pid: number, ppid: number, cpu: number, args: string) =>
    `${pid} ${ppid} 0:${cpu.toFixed(2).padStart(5, '0')} ${args}`;
  return [
    row(100, 1, 0.1, 'pij-rs seat pij-w14'),
    row(101, 100, 1 + t * 0.023, 'omp'), // omp idles at ~2.3% on its own
    ...[102, 103, 104, 105].map((pid) => row(pid, 101, 1 + t * 0.005, `node /x/mcp-${pid}.js`)),
    row(106, 101, 1 + t * viteRate, 'node ./node_modules/.bin/../vite/bin/vite.js --port 55181'),
  ].join('\n');
}

async function poll(manager: TmuxSessionManager, t: number): Promise<void> {
  vi.spyOn(Date, 'now').mockReturnValue((1_790_000_000 + t) * 1000);
  manager.listWindows('main');
  await vi.waitFor(() =>
    expect((manager as unknown as { sampling: Set<string> }).sampling.size).toBe(0)
  );
}

afterEach(() => vi.restoreAllMocks());

describe('agent window activity vs its subprocesses', () => {
  it('keeps an idle agent grey, and flags busy subprocesses by name without lighting the agent', async () => {
    let viteRate = 0;
    let t = 0;
    const exec = (_: string, args: string[]) =>
      args[0] === 'list-windows' ? '@14\t14\t0\tpij-w14\n' : '';
    const execAsync = async (command: string, args: string[]) => {
      if (command === 'ps') return psSnapshot(t, viteRate);
      if (args[0] === 'list-panes') return '@14\t100\n';
      return '';
    };
    const manager = new TmuxSessionManager(exec, (() => null) as never, execAsync);
    const read = () => manager.listWindows('main')[0];

    // Idle: omp at 2.3% (under its 5% bar), four helpers at 0.5% each (2% summed, none busy).
    for (t = 0; t <= 8; t += 2) await poll(manager, t);
    expect(read()).toMatchObject({ agent: 'pi', activeSeconds: null, busySubprocesses: null });

    // The agent's dev server spins up; omp itself stays idle.
    viteRate = 0.58;
    for (t = 10; t <= 16; t += 2) await poll(manager, t);
    expect(read()).toMatchObject({ activeSeconds: null, busySubprocesses: ['vite 58%'] });
  });
});
