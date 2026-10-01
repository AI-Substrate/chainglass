import { afterEach, describe, expect, it, vi } from 'vitest';
import { lastTextLine } from '../../../../../apps/web/src/features/064-terminal/lib/screen-activity';
import { overviewWindows } from '../../../../../apps/web/src/features/064-terminal/lib/window-overview';
import { TmuxSessionManager } from '../../../../../apps/web/src/features/064-terminal/server/tmux-session-manager';
import type { TerminalWindow } from '../../../../../apps/web/src/features/064-terminal/types';

// Claude Code's bottom layout (2.1.x): transcript, turn status, input box, footer.
const CLAUDE_SCREEN = [
  '⏺ Ran the suite: 548 files passed.',
  '',
  '⏺ Should I also rename window 0?',
  '',
  '✻ Worked for 14s',
  '────────────────────────────────────────',
  '❯ ',
  '────────────────────────────────────────',
  '  7% main ⎇ main',
].join('\n');

afterEach(() => vi.restoreAllMocks());

// omp's bottom layout: a hard-wrapped paragraph, a tool box, then its stats line and a pij notice.
const OMP_SCREEN = [
  ' One tooling problem: dispatch passes --bin omp to Pij,',
  ' which rejects anything but an absolute path.',
  '',
  ' │ ls -la',
  ' ╰──────────────────',
  ' 2026-09-29 15:01:37  ⤵ 1.5K  ⤴ 456  💾 521K',
  ' pij: re-attached at cursor 91365',
  '  ⎋ Waiting for prep proof mode',
  '────────────────────────────────────────',
  '❯ ',
  '────────────────────────────────────────',
].join('\n');

describe('lastTextLine', () => {
  it('reads the last block above the input box, without the bullet or turn status', () => {
    expect(lastTextLine(CLAUDE_SCREEN)).toBe('Should I also rename window 0?');
  });

  it('joins a hard-wrapped paragraph and skips tool boxes, stats lines and pij notices', () => {
    expect(lastTextLine(OMP_SCREEN)).toBe(
      'One tooling problem: dispatch passes --bin omp to Pij, which rejects anything but an absolute path.'
    );
  });

  it('reads a plain shell screen from the bottom, and nothing from a blank one', () => {
    expect(lastTextLine('$ pnpm test\n Tests  12 passed\n$ \n\n')).toBe('$');
    expect(lastTextLine('\n\n')).toBeNull();
  });
});

describe('window seats and last lines', () => {
  it('joins a seat only when its process runs in the pane, so a recycled pane id never matches', async () => {
    const exec = (_: string, args: string[]) =>
      args[0] === 'list-windows' ? '@14\t14\t0\tshell\n@15\t15\t0\tclaude-seat\n' : '';
    const execAsync = async (command: string, args: string[]) => {
      if (command === 'ps') {
        return ['100 1 0:00.10 -zsh', '200 1 0:00.10 -zsh', '201 200 0:01.00 claude'].join('\n');
      }
      if (args[0] === 'list-panes') return '@14\t100\t1\t%0\n@15\t200\t1\t%1\n';
      if (args[0] === 'capture-pane') return args.at(-1) === '@15' ? CLAUDE_SCREEN : '$ ls\n';
      return '';
    };
    const readSeats = async () => [
      { id: 'pij-live-seat', pane: '%1', pid: 201 },
      // %0's old seat: the pane id was reused and pid 999 is not in its tree.
      { id: 'pij-gone-seat', pane: '%0', pid: 999 },
    ];
    const manager = new TmuxSessionManager(exec, (() => null) as never, execAsync, readSeats);

    manager.listWindows('main');
    await vi.waitFor(() =>
      expect((manager as unknown as { sampling: Set<string> }).sampling.size).toBe(0)
    );

    const [shell, claude] = manager.listWindows('main');
    expect(shell).toMatchObject({ seatId: null, lastLine: '$ ls' });
    expect(claude).toMatchObject({
      seatId: 'pij-live-seat',
      lastLine: 'Should I also rename window 0?',
    });
  });
});

describe('overviewWindows', () => {
  const win = (index: number, overrides: Partial<TerminalWindow> = {}): TerminalWindow => ({
    id: `@${index}`,
    index,
    name: `w${index}`,
    active: false,
    idleSeconds: null,
    activeSeconds: null,
    question: false,
    agent: null,
    background: null,
    lastLine: null,
    seatId: null,
    ...overrides,
  });

  it('lists recent windows by recency, and pins primes first whatever the filter or search', () => {
    const windows = [
      win(0, { idleSeconds: 7_200, seatId: 'pij-prime' }), // prime, idle for 2h
      win(1, { idleSeconds: 600 }),
      win(2, { activeSeconds: 30, idleSeconds: 0 }),
      win(3, { idleSeconds: 3_600 }), // not recent
      win(4), // never seen working
    ];
    const isPrime = (window: TerminalWindow) => window.seatId === 'pij-prime';

    expect(overviewWindows(windows, 'recent', '', isPrime).map((w) => w.index)).toEqual([0, 2, 1]);
    expect(overviewWindows(windows, 'working', 'w2', isPrime).map((w) => w.index)).toEqual([0, 2]);
    expect(overviewWindows(windows, 'all', 'nothing', isPrime).map((w) => w.index)).toEqual([0]);
  });
});
