import { describe, expect, it } from 'vitest';
import { claudeScreenAsksQuestion } from '../../../../../apps/web/src/features/064-terminal/lib/claude-question';

// Shape copied from a live Claude Code 2.1 pane (2026-09-28); transcript text replaced.
const screen = (lastLine: string) =>
  [
    '⏺ Here is where things stand.',
    '',
    `  ${lastLine}`,
    '',
    '✻ Worked for 14s · done 3:50 pm',
    '',
    `${'─'.repeat(80)} planless ─`,
    '❯',
    '─'.repeat(90),
    '  7% main ⎇ main rs • Opus 5.5 • high • 70k/1.0M • 51% ↻18:40',
    '  ⏵⏵ bypass permissions on (shift+tab to cycle) · ← 1 agent?',
    '',
  ].join('\n');

describe('claudeScreenAsksQuestion', () => {
  it('reads the last transcript line above the status line and input box, never the footer', () => {
    expect(claudeScreenAsksQuestion(screen('Should the map show every option at once?'))).toBe(
      true
    );
    expect(claudeScreenAsksQuestion(screen('Should it say "pick one?"'))).toBe(true);
    // The footer above ends in "?" — a statement in the transcript must still read false.
    expect(claudeScreenAsksQuestion(screen('I have noted the decisions.'))).toBe(false);
  });

  it('claims nothing for a screen without a Claude Code input box', () => {
    expect(claudeScreenAsksQuestion('$ ls\nREADME.md\nare you sure?\n$')).toBeNull();
  });
});
