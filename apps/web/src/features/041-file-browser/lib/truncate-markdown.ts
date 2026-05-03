/**
 * `truncateMarkdown` — produce a safe excerpt of a markdown document for the
 * Recent Changes Feed (T014).
 *
 * Hard-binding cases (Finding 06): front-matter-only / FM+prose / mid-fence /
 * mid-list / overlong line / empty input. Each is exercised by a test in
 * `test/unit/web/features/041-file-browser/lib/truncate-markdown.test.ts`.
 *
 * The excerpt walks lines in order, counting non-empty lines and total
 * characters. When *either* limit fires we stop, then post-fix the boundary:
 *  - if we stopped inside a fenced code block (``` ... ```), extend to the
 *    closing fence so we never split a fence.
 *  - if we stopped on a list-item line, extend through any continuation
 *    lines (indented prose / nested items) until a blank line or new
 *    top-level paragraph.
 *
 * For docs that consist only of front matter (or are entirely whitespace)
 * we return ''. For a single overlong line that exceeds `maxChars` we
 * truncate at `maxChars` and append a horizontal ellipsis.
 */

const FRONT_MATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;
const FENCE_RE = /^\s*```/;
const LIST_MARKER_RE = /^(\s*)([-*+]\s|\d+\.\s)/;
const LIST_CONTINUATION_RE = /^\s+/;

export interface TruncateMarkdownOptions {
  /** Hard cap on non-empty lines included. Default 8 (matches feed setting `mdExcerptLines`). */
  maxLines?: number;
  /** Hard cap on total character length (rough; soft for fence/list extension). Default 600. */
  maxChars?: number;
}

export function truncateMarkdown(
  input: string,
  { maxLines = 8, maxChars = 600 }: TruncateMarkdownOptions = {}
): string {
  if (!input || input.trim() === '') return '';

  // Normalise line endings — CRLF docs are common on Windows.
  const normalised = input.replace(/\r\n/g, '\n');

  // Strip a leading YAML/TOML-style front-matter block.
  let body = normalised;
  const fm = FRONT_MATTER_RE.exec(normalised);
  if (fm) {
    body = normalised.slice(fm[0].length);
  }
  body = body.replace(/^\s+/, '');

  if (body === '') return '';

  const lines = body.split('\n');

  // Case 5: single overlong line.
  if (lines.length === 1 && lines[0].length > maxChars) {
    return `${lines[0].slice(0, maxChars)}…`;
  }
  // Even with multiple lines, if the FIRST line is itself overlong and is
  // alone after FM stripping, the same truncation applies.
  if (lines[0].length > maxChars && lines.slice(1).every((l) => l.trim() === '')) {
    return `${lines[0].slice(0, maxChars)}…`;
  }

  const out: string[] = [];
  let charCount = 0;
  let nonEmptyLineCount = 0;
  let insideFence = false;
  let stopIdx = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const isFenceMarker = FENCE_RE.test(line);
    if (isFenceMarker) insideFence = !insideFence;
    out.push(line);
    charCount += line.length + 1; // +1 for the synthetic newline
    if (line.trim() !== '') nonEmptyLineCount++;

    if (nonEmptyLineCount >= maxLines || charCount >= maxChars) {
      stopIdx = i;
      break;
    }
  }

  // No truncation hit — return everything.
  if (stopIdx === -1) {
    return out.join('\n').trimEnd();
  }

  // Case 3: extend through a code fence we're sitting inside.
  if (insideFence) {
    for (let i = stopIdx + 1; i < lines.length; i++) {
      const next = lines[i] ?? '';
      out.push(next);
      if (FENCE_RE.test(next)) {
        insideFence = false;
        break;
      }
    }
    // If we walked off the end with the fence still open, that's OK —
    // the test invariant just requires no infinite loop / no throw.
  }

  // Case 4: extend through a list item if the boundary landed on/inside one.
  const stopLine = lines[stopIdx] ?? '';
  const stopIsListItem = LIST_MARKER_RE.test(stopLine);
  // Also extend if the stop line is an indented continuation of a list item.
  const stopIsListContinuation =
    !stopIsListItem &&
    LIST_CONTINUATION_RE.test(stopLine) &&
    out.some((l) => LIST_MARKER_RE.test(l));

  if (stopIsListItem || stopIsListContinuation) {
    for (let i = stopIdx + 1; i < lines.length; i++) {
      const next = lines[i] ?? '';
      if (next.trim() === '') break;
      // Stop when we leave the list (a non-indented line that isn't itself a
      // list marker means we've reentered top-level prose).
      if (!LIST_CONTINUATION_RE.test(next) && !LIST_MARKER_RE.test(next)) break;
      out.push(next);
    }
  }

  return out.join('\n').trimEnd();
}
