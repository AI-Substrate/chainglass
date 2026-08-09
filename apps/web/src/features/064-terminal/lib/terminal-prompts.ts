/**
 * Terminal prompt source (Plan 092, tk-0002).
 *
 * The shipped prompt list for the terminal prompt drawer. Jordan authors the
 * prompts in a markdown list file and this module is its typed mirror — the
 * feature must never hardcode a list that differs from his.
 *
 * PARITY IS ENFORCED — oq-0003 ruled 2026-08-08. The authoring file lives at
 * `prompt-drawer-list.md`, beside this module and git-tracked, and
 * `terminal-prompt-drawer.test.tsx` reads it off disk and fails when this list
 * drifts from it. That test resolves from the repo root and FAILS rather than
 * skips when the file is absent — a check that quietly stops checking is worse
 * than no check, and "the file moved somewhere ignored" is the exact failure it
 * guards (the list previously lived in gitignored `scratch/`).
 */
/** A single saved prompt shown as one drawer row. */
export interface TerminalPrompt {
  /** Stable identity for React keys and test selectors. */
  id: string;
  /** The FULL prompt text, delivered verbatim. Never pre-escaped here. */
  text: string;
}

/**
 * Maximum characters of prompt text rendered on a row before the ellipsis.
 * The drawer is about a third of the pane, so a row cannot show much; the
 * full text is always available on the row's `title`.
 */
export const PROMPT_LABEL_MAX_CHARS = 56;

/**
 * The shipped list. Mirrors Jordan's list file entry-for-entry, in order.
 * Prompt text is DATA — it is never interpolated into a shell string, and it
 * reaches tmux through argv plus literal mode (phase 2, ac-0007).
 */
export const TERMINAL_PROMPTS: readonly TerminalPrompt[] = [
  {
    id: 'prompt-1',
    text: 'ask me the questions 1 at a time. 1 sentence context, 1 sentence for the ask',
  },
  {
    id: 'prompt-2',
    text: 'summarise that in two sentences',
  },
  {
    id: 'prompt-3',
    text: 'give me that in a numbered list, 1 sentence per item',
  },
];

/**
 * Row label — the opening of the prompt on ONE line, with a trailing ellipsis
 * when there is more to see.
 *
 * Truncation is done here rather than left to CSS `text-overflow` because the
 * ellipsis is an asserted behaviour (ac-0003) and CSS overflow is unobservable
 * in jsdom. Newlines collapse to spaces so a multi-line prompt still reads as
 * a single row; the untouched original is what gets sent.
 */
export function promptLabel(text: string, max: number = PROMPT_LABEL_MAX_CHARS): string {
  const singleLine = text.replace(/\s+/g, ' ').trim();
  if (singleLine.length <= max) return singleLine;
  return `${singleLine.slice(0, max).trimEnd()}…`;
}

/**
 * Parse Jordan's markdown list file into prompt texts.
 *
 * Format: an ordered-list item whose body is wrapped in backticks —
 *   1. `the full prompt text`
 * Everything else in the file (prose, HTML comments, headings) is ignored, so
 * he can keep annotating it freely.
 *
 * Throws when the file yields no entries. That is deliberate: the parity check
 * this feeds must fail LOUDLY on an empty or moved file rather than silently
 * agreeing with an empty list (dw-0202).
 */
export function parsePromptList(markdown: string): string[] {
  const entries: string[] = [];
  for (const line of markdown.split('\n')) {
    const match = /^\s*\d+\.\s+`(.+)`\s*$/.exec(line);
    if (match?.[1]) entries.push(match[1]);
  }
  if (entries.length === 0) {
    throw new Error(
      'parsePromptList: no prompt entries found — expected lines of the form "1. `prompt text`". ' +
        'If the list file moved, fix the path rather than relaxing this check.'
    );
  }
  return entries;
}
