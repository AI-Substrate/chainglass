/**
 * Does a Claude Code screen end its last message with a question to the user?
 *
 * Claude Code's bottom layout (2.1.x, read from a live pane 2026-09-28):
 *
 *   <transcript … last paragraph>
 *   ✻ Worked for 14s · done 3:50 pm      ← turn status (spinner glyph); not real text
 *   ──────────────────── <label> ─       ← input box top rule
 *   ❯                                    ← prompt
 *   ────────────────────────────         ← input box bottom rule
 *     7% main ⎇ main …                   ← footer / status line
 *     ⏵⏵ bypass permissions on …
 *
 * So: find the last box rule that is followed by a `❯` line, walk up past blank lines and
 * spinner-glyph status lines, and test the first real line. Returns `null` for anything that is
 * not a Claude Code screen, so other programs never get a question marker.
 */

const RULE = /^─{10,}/;
const PROMPT = /^❯/;
/** Claude's spinner / turn-status glyphs lead the "✻ Worked for 14s" style lines. */
const STATUS_LINE = /^[✻✶✳✢✽✺·*]\s/;
/** A question mark, optionally followed by closing quotes, brackets or markdown emphasis. */
const ENDS_WITH_QUESTION = /[?？]["'”’`)\]*_]*$/;

export function claudeScreenAsksQuestion(screen: string): boolean | null {
  const lines = screen.split('\n').map((line) => line.trimEnd());
  let boxTop = -1;
  for (let i = lines.length - 2; i >= 0; i--) {
    if (RULE.test(lines[i]) && PROMPT.test(lines[i + 1])) {
      boxTop = i;
      break;
    }
  }
  if (boxTop < 0) return null;
  for (let i = boxTop - 1; i >= 0; i--) {
    const text = lines[i].trim();
    if (text.length === 0 || STATUS_LINE.test(text)) continue;
    return ENDS_WITH_QUESTION.test(text);
  }
  return false;
}
