/**
 * Terminal prompt source — the ONE file to edit (Plan 092, tk-0002).
 *
 * ADD A PROMPT: write it into `PROMPT_TEXTS` below. That is the whole job.
 * Order here is the order in the drawer, and ids are derived, so there is no
 * second list to keep in step.
 *
 * WHY THIS IS ONE FILE NOW. The list used to live in `prompt-drawer-list.md`
 * beside this module, with `TERMINAL_PROMPTS` as its hand-maintained mirror and
 * a test suite reading the markdown off disk to prove the two agreed. That
 * bought authoring-in-markdown at the price of two edits per prompt and three
 * tests whose only job was to police the duplication. Jordan asked for one
 * edit; the cheapest way to make two copies agree is to have one copy.
 *
 * The markdown route was considered and rejected on evidence, not taste: this
 * app has no `?raw` import support (no webpack rule, no precedent anywhere in
 * the repo), so keeping markdown as the single source meant a bundler config
 * change with real dev/prod divergence risk — more machinery than a prompt list
 * warrants, and a new failure mode in place of a solved one.
 *
 * Prompt text is DATA. It is never interpolated into a shell string; it reaches
 * tmux through argv plus literal mode (see `send-prompt-keys.ts`), which is what
 * makes backticks, `$(…)`, quotes and semicolons inert. Write prompts exactly as
 * you want them typed — no escaping, no pre-quoting.
 */

/** A single saved prompt shown as one drawer row. */
export interface TerminalPrompt {
  /** Stable identity for React keys and test selectors. Derived from position. */
  id: string;
  /** The FULL prompt text, delivered verbatim. Never pre-escaped here. */
  text: string;
}

/**
 * The shipped list, in drawer order. THIS IS THE AUTHORING SURFACE — add,
 * remove and reorder freely; nothing else needs touching.
 */
const PROMPT_TEXTS: readonly string[] = [
  'ask me the questions 1 at a time. 1 sentence context, 1 sentence for the ask',
  'summarise that in two sentences',
  'give me that in a numbered list, 1 sentence per item',
];

/**
 * Maximum characters of prompt text rendered on a row before the ellipsis.
 * The drawer is about a third of the pane, so a row cannot show much; the
 * full text is always available on the row's `title`.
 */
export const PROMPT_LABEL_MAX_CHARS = 56;

/**
 * The typed list the drawer renders.
 *
 * Ids are positional (`prompt-1`, `prompt-2`, …) so that adding a prompt cannot
 * collide with an existing id or require inventing a name. They are identity for
 * React and for test selectors only — nothing persists them, so reordering the
 * list is safe.
 */
export const TERMINAL_PROMPTS: readonly TerminalPrompt[] = PROMPT_TEXTS.map((text, index) => ({
  id: `prompt-${index + 1}`,
  text,
}));

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
