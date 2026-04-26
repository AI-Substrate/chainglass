/**
 * markdown-frontmatter — YAML front-matter split/rejoin for the WYSIWYG editor.
 *
 * Phase 4 / T002 + T003. Replaces the Phase 1 passthrough stubs inside
 * `markdown-wysiwyg-editor.tsx` with edge-case-hardened implementations.
 *
 * Finding 03 (Critical): Tiptap's markdown serializer does not understand
 * YAML front-matter. Content must be split before Tiptap parses the body
 * and rejoined on every `onChange` emission. A bug here silently loses
 * user front-matter across mode switches.
 *
 * INVARIANT (load-bearing — documented here, tested in
 * `test/unit/.../markdown-frontmatter.test.ts`):
 *
 *   FORWARD:  split(x).frontMatter + split(x).body === x   (for ALL x)
 *   REVERSE:  split(join(fm, body)) === { frontMatter: fm, body }
 *             — but ONLY for well-formed (fm, body) pairs, where `fm` is
 *             either '' or a valid split output and `body` doesn't itself
 *             begin with a fresh `---\n...\n---` block.
 *
 * Pure functions. Safe in server + client components.
 */

const SCAN_CAP_LINES = 500;

/**
 * Splits a markdown string into its YAML front-matter prefix and the body.
 *
 * The `frontMatter` return value INCLUDES the closing `---` line AND its
 * trailing newline (if the original input had one). This makes `join` a
 * trivial string concat and guarantees the forward invariant above.
 *
 * Behavior:
 *   - If input doesn't begin with a `---` fence (optionally preceded by a
 *     UTF-8 BOM), returns `{ frontMatter: '', body: input }` verbatim.
 *   - Scans the first {@link SCAN_CAP_LINES} lines after the open fence
 *     looking for a line equal to `---` (tolerating CRLF `\r` suffixes).
 *     If none found within the cap, returns passthrough.
 *   - Preserves CRLF line endings and BOM prefixes byte-for-byte.
 *   - The scanner stops at the FIRST matching close fence — subsequent
 *     `---` tokens (e.g. setext headings, tokens inside fenced code
 *     blocks in the body) remain in `body`.
 */
export function splitFrontMatter(md: string): { frontMatter: string; body: string } {
  // 1. Trivial empty-string passthrough.
  if (md === '') return { frontMatter: '', body: '' };

  // 2. Line-based scan. We `.split('\n')` and compare each line ignoring a
  //    trailing `\r` so CRLF content round-trips byte-for-byte when we
  //    reconstruct via `.join('\n')`. This is simpler and safer than a
  //    regex-with-multiline-flag approach (see T002 Notes in phase dossier).
  const lines = md.split('\n');

  // 3. Detect open fence. The first line must be exactly `---` (or `\ufeff---`
  //    when a BOM prefix is present), optionally followed by `\r` for CRLF.
  const first = lines[0] ?? '';
  const firstStripped = stripBomPrefix(stripTrailingCR(first));
  if (firstStripped !== '---') {
    return { frontMatter: '', body: md };
  }

  // 4. Scan lines[1..=SCAN_CAP_LINES] for the first bare `---` (CRLF-tolerant).
  //    Cap is inclusive: scan at most SCAN_CAP_LINES non-header lines.
  const maxIdx = Math.min(lines.length - 1, SCAN_CAP_LINES);
  let closeIdx = -1;
  for (let i = 1; i <= maxIdx; i++) {
    if (stripTrailingCR(lines[i] ?? '') === '---') {
      closeIdx = i;
      break;
    }
  }

  // 5. No close fence within the cap → passthrough (treat as "no front-matter").
  if (closeIdx === -1) {
    return { frontMatter: '', body: md };
  }

  // 6. Reconstruct frontMatter and body. The frontMatter includes lines[0..closeIdx]
  //    joined with `\n`; if there were more lines after the close fence in the
  //    original input (i.e., a trailing newline existed after `---`), add one `\n`
  //    so byte-identity holds.
  const fmLines = lines.slice(0, closeIdx + 1);
  let frontMatter = fmLines.join('\n');

  const hasTrailingNewlineAfterClose = closeIdx < lines.length - 1;
  if (hasTrailingNewlineAfterClose) {
    frontMatter += '\n';
  }

  const body = lines.slice(closeIdx + 1).join('\n');

  return { frontMatter, body };
}

/**
 * Joins a front-matter string and a body string back into a single markdown
 * document.
 *
 * This is a trivial concat BY DESIGN — the complexity lives in `splitFrontMatter`,
 * which already includes the closing `---\n` inside its `frontMatter` output.
 *
 * Forward round-trip invariant:
 *   join(split(x).frontMatter, split(x).body) === x   (for ALL x)
 */
export function joinFrontMatter(frontMatter: string, body: string): string {
  if (frontMatter === '') return body;
  return frontMatter + body;
}

// --- helpers -----------------------------------------------------------------

function stripTrailingCR(s: string): string {
  return s.endsWith('\r') ? s.slice(0, -1) : s;
}

function stripBomPrefix(s: string): string {
  return s.length > 0 && s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}
