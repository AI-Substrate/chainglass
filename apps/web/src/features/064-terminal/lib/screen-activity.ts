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

/**
 * Agent chrome that is not what the agent said, read from live panes (2026-09-29):
 * - turn status: Claude `✻ Worked for 14s`, omp `⎋ Waiting for …`, omp `ⓘ waiting on 1 job`
 * - box drawing: rules, table borders, and tool-output boxes (`│ …`, `╰───`) and job trees (`└─`)
 * - omp's per-turn stats line (`2026-09-29 15:01:37  ⤵ 1.5K  ⤴ 456 …`)
 * - pij's own notices (`pij: re-attached at cursor 91365`)
 * - Claude's right-aligned hint (`new task? /clear to save 378.8k tokens`)
 */
const NOISE = [
  /^[✻✶✳✢✽✺·*⎋ⓘ]\s/,
  /^[─━│┃┌┐└┘├┤┬┴┼╭╮╰╯═║╔╗╚╝]/,
  /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\s/,
  /^pij: /,
  /^new task\? \/clear to save/,
];
/** Claude's message bullet, tool-output elbow and recap mark: the first line of a block. */
const BLOCK_START = /^(?:⏺|●|⎿|※)\s*/;
const MAX_PARAGRAPH_LINES = 6;
const MAX_LAST_TEXT = 300;

function isNoise(text: string): boolean {
  return NOISE.some((pattern) => pattern.test(text));
}

/**
 * The last paragraph of real text on a screen, joined onto one line: above the input box when
 * there is one, skipping agent chrome (see {@link NOISE}). Agents hard-wrap their output, so the
 * last LINE alone is usually the tail of a sentence; the paragraph is what they last said.
 * A screen with no input box (a shell, a build) gives its last line alone. `null` for a screen
 * with no text at all.
 */
export function lastTextLine(screen: string): string | null {
  const lines = screen.split('\n').map((line) => line.trim());
  const top = inputBoxTop(lines);
  let end = (top >= 0 ? top : lines.length) - 1;
  while (end >= 0 && (lines[end].length === 0 || isNoise(lines[end]))) end--;
  if (end < 0) return null;
  let start = end;
  while (
    top >= 0 &&
    start > 0 &&
    end - start + 1 < MAX_PARAGRAPH_LINES &&
    !BLOCK_START.test(lines[start]) &&
    lines[start - 1].length > 0 &&
    !isNoise(lines[start - 1])
  ) {
    start--;
  }
  const text = lines
    .slice(start, end + 1)
    .join(' ')
    .replace(BLOCK_START, '');
  return text.length > MAX_LAST_TEXT ? `${text.slice(0, MAX_LAST_TEXT - 1)}…` : text;
}
