import { afterEach, describe, expect, it, vi } from 'vitest';
import { TmuxSessionManager } from '../../../../../apps/web/src/features/064-terminal/server/tmux-session-manager';

// Five plain shell windows (@1..@5, pane pids 101..105). `activity` is each window's
// window_activity; `version` is what its screen currently says.
const WINDOWS = ['@1', '@2', '@3', '@4', '@5'];

function createSession() {
  const activity = new Map(WINDOWS.map((id) => [id, 1_790_000_000]));
  const version = new Map(WINDOWS.map((id) => [id, 1]));
  let reads: string[] = [];
  const exec = async (_: string, args: string[]) =>
    args[0] === 'list-windows'
      ? WINDOWS.map((id, i) => `${id}\t${i + 1}\t0\tshell`).join('\n')
      : '';
  const sampleExec = async (command: string, args: string[]) => {
    if (command === 'ps') return WINDOWS.map((_, i) => `${101 + i} 1 0:00.10 -zsh`).join('\n');
    if (args[0] === 'list-panes') {
      return WINDOWS.map((id, i) => `${id}\t${101 + i}\t${activity.get(id)}`).join('\n');
    }
    if (args[0] === 'capture-pane') {
      const id = args.at(-1) as string;
      reads.push(id);
      return `$ echo ${id} v${version.get(id)}\n`;
    }
    return '';
  };
  const manager = new TmuxSessionManager(exec, (() => null) as never, sampleExec);
  let t = 0;
  /** One 2 s poll; resolves with the windows whose screens it read, in order. */
  const poll = async (): Promise<string[]> => {
    reads = [];
    vi.spyOn(Date, 'now').mockReturnValue((1_790_000_000 + t) * 1000);
    await manager.listWindows('main');
    await vi.waitFor(() =>
      expect((manager as unknown as { sampling: Set<string> }).sampling.size).toBe(0)
    );
    t += 2;
    return reads;
  };
  return { activity, version, poll, now: () => t };
}

afterEach(() => vi.restoreAllMocks());

describe('screen reads per sample', () => {
  it('reads a changed window it had no budget for at the front of the next sample', async () => {
    const session = createSession();
    // First sight: every screen and every question is read once, a few per sample.
    for (let i = 0; i < 4; i++) await session.poll();
    // All five windows print at once; the budget reads four of them.
    const printAll = (ids: string[], v: number) => {
      for (const id of ids) {
        session.activity.set(id, 1_790_000_000 + session.now());
        session.version.set(id, v);
      }
    };
    printAll(WINDOWS, 2);
    expect(await session.poll()).toEqual(['@1', '@2', '@3', '@4']);
    // The first four print again, but the fifth has waited longest: it goes first, never starved.
    printAll(['@1', '@2', '@3', '@4'], 3);
    expect(await session.poll()).toEqual(['@5', '@1', '@2', '@3']);
    expect(await session.poll()).toEqual(['@4']);
    expect(await session.poll()).toEqual([]);
  });

  it('re-reads an idle window for a question at most once a minute', async () => {
    const session = createSession();
    const perWindow = (reads: string[][]) =>
      WINDOWS.map((id) => reads.flat().filter((read) => read === id).length);

    // t = 0..58 s: each window's screen is read once (first sight) and its question once.
    const firstMinute: string[][] = [];
    while (session.now() < 60) firstMinute.push(await session.poll());
    expect(perWindow(firstMinute)).toEqual([2, 2, 2, 2, 2]);

    // From t = 60 s each question is due again, two windows per sample.
    const nextPolls: string[][] = [];
    for (let i = 0; i < 4; i++) nextPolls.push(await session.poll());
    expect(nextPolls.map((reads) => reads.length)).toEqual([2, 2, 1, 0]);
    expect(perWindow(nextPolls)).toEqual([1, 1, 1, 1, 1]);
  });
});
