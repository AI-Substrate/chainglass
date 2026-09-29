import { afterEach, describe, expect, it, vi } from 'vitest';
import { TmuxSessionManager } from '../../../../../apps/web/src/features/064-terminal/server/tmux-session-manager';

// One Claude Code window (pane 100 → claude 101). Each poll, tmux reports output
// (window_activity moves) and the scripted screen below is what capture-pane returns.
const screen = (transcriptTail: string, spinner: string, footerClock: string) =>
  [
    '⏺ Reading the plan.',
    `  ${transcriptTail}`,
    '',
    spinner,
    '',
    `${'─'.repeat(60)} planless ─`,
    '❯ half-typed reply',
    '─'.repeat(70),
    `  7% main ⎇ main • Opus 5.5 • ↻${footerClock}`,
  ].join('\n');

afterEach(() => vi.restoreAllMocks());

describe('window working state from screen changes', () => {
  it('ignores footer ticks and click redraws, and turns green only when the work area moves', async () => {
    let t = 0;
    let current = '';
    const exec = (_: string, args: string[]) =>
      args[0] === 'list-windows' ? '@1\t1\t0\tseat\n' : '';
    const execAsync = async (command: string, args: string[]) => {
      if (command === 'ps') return '100 1 0:00.10 -zsh\n101 100 0:01.00 claude';
      if (args[0] === 'list-panes') return `@1\t100\t${1_790_000_000 + t}\n`;
      if (args[0] === 'capture-pane') return current;
      return '';
    };
    const manager = new TmuxSessionManager(exec, (() => null) as never, execAsync);
    const poll = async () => {
      vi.spyOn(Date, 'now').mockReturnValue((1_790_000_000 + t) * 1000);
      manager.listWindows('main');
      await vi.waitFor(() =>
        expect((manager as unknown as { sampling: Set<string> }).sampling.size).toBe(0)
      );
      t += 2;
    };
    const green = () => manager.listWindows('main')[0].activeSeconds !== null;
    const idleLine = '✻ Worked for 14s · done 3:50 pm';

    // Idle agent: only the footer clock ticks (and the user's half-typed reply sits in the box).
    for (const clock of ['18:40', '18:38', '18:36', '18:34']) {
      current = screen('Done.', idleLine, clock);
      await poll();
    }
    expect(green()).toBe(false);

    // A click redraw: tmux reports output, the text is identical.
    await poll();
    await poll();
    expect(green()).toBe(false);

    // Working: the spinner counts up every poll.
    for (const seconds of [1, 3, 5]) {
      current = screen('Done.', `✻ Germinating… (${seconds}s · ↓ 217 tokens)`, '18:30');
      await poll();
    }
    expect(green()).toBe(true);
  });
});
