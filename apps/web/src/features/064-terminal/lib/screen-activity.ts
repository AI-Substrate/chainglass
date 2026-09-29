/**
 * The part of a pane's screen that changes only when the program is doing work.
 *
 * Agent TUIs (Claude Code, omp) draw an input box — a `─` rule, a `❯` prompt line, another rule —
 * with a footer below it. The footer changes by itself (countdown timers, status fields), and the
 * box changes when the USER types, so neither is evidence of the agent working. Everything above
 * the box — the transcript and the spinner/turn-status line — changes every second while the agent
 * works and is frozen while it is idle. A redraw (attach, click) repaints identical text, so it
 * never registers as a change. Screens without an input box are compared whole.
 */

const RULE = /^─{10,}/;
const PROMPT = /^❯/;

/** Index of the last input box's top rule (a `─` rule followed by a `❯` line), or -1. */
export function inputBoxTop(lines: string[]): number {
  for (let i = lines.length - 2; i >= 0; i--) {
    if (RULE.test(lines[i]) && PROMPT.test(lines[i + 1])) return i;
  }
  return -1;
}

/** The screen text whose changes mean "working": above the input box, or the whole screen. */
export function workRegion(screen: string): string {
  const lines = screen.split('\n').map((line) => line.trimEnd());
  const top = inputBoxTop(lines);
  return (top >= 0 ? lines.slice(0, top) : lines).join('\n');
}
