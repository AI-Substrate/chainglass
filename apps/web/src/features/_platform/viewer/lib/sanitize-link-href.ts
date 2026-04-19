/**
 * sanitizeLinkHref — pure URL-sanitation helper for the Link popover.
 *
 * Phase 3 / T002. Allow-list approach: accept http/https/mailto and
 * root/repo-relative/fragment hrefs; prepend https:// to plain hostnames;
 * reject everything else (javascript/data/vbscript/file) including common
 * evasion vectors.
 *
 * Defense in depth: T006 also passes this function to
 * `Link.configure({ isAllowedUri })` so Tiptap's setLink command runs the
 * same gate even when callers bypass the popover.
 *
 * Pure function. Safe to call in server components, but typically invoked
 * from the client popover and the editor extension.
 */

import type { SanitizedHref } from './wysiwyg-extensions';

const ALLOWED_SCHEMES = new Set(['http', 'https', 'mailto']);

/**
 * Matches an ASCII scheme prefix: [a-z][a-z0-9+\-]*:
 *
 * Dot deliberately EXCLUDED from the scheme character class (despite RFC
 * 3986 permitting it) so that `example.com:8080/path` falls through to
 * the prepend-https branch instead of being mistakenly parsed as
 * scheme `example.com`. None of the allow-listed schemes use a dot.
 */
const ASCII_SCHEME_RX = /^([a-zA-Z][a-zA-Z0-9+\-]*):/;

/** Strips ASCII control characters (U+0000-U+001F and U+007F). */
function stripControlChars(s: string): string {
  return s.replace(/[\u0000-\u001F\u007F]/g, '');
}

export function sanitizeLinkHref(raw: string): SanitizedHref {
  // 1. Trim surrounding whitespace.
  const trimmed = raw.trim();

  // 2. Strip control characters anywhere in the string. This catches
  //    `jav\tascript:`, `java\nscript:`, `javas\rcript:`, and leading
  //    null-byte prefixes — after stripping, the scheme detection in
  //    step 5 fires against the cleaned form.
  const s = stripControlChars(trimmed);

  // 3. Empty-string guard.
  if (s === '') return { ok: false, reason: 'empty' };

  // 4. Paranoid percent-encoded scheme-prefix guard. If the input
  //    begins with `%` followed by two hex digits (e.g., `%6A` = 'j'),
  //    reject — accepting would let attackers sneak `javascript:` past
  //    the scheme regex by URL-encoding its first character.
  if (/^%[0-9a-fA-F]{2}/.test(s)) {
    return { ok: false, reason: 'javascript-scheme' };
  }

  // 5. ASCII scheme detection. If a scheme is present, it must be in
  //    the allow-list (http / https / mailto). Unknown schemes are
  //    rejected as `javascript-scheme` — the reason discriminator is
  //    a narrow union so callers can switch-exhaust it.
  const schemeMatch = ASCII_SCHEME_RX.exec(s);
  if (schemeMatch) {
    const scheme = schemeMatch[1]!.toLowerCase();
    if (ALLOWED_SCHEMES.has(scheme)) {
      return { ok: true, href: s };
    }
    return { ok: false, reason: 'javascript-scheme' };
  }

  // 6. Non-ASCII scheme-spoof guard. If the ASCII scheme regex didn't
  //    match AND the input starts with a non-ASCII codepoint AND a
  //    colon appears before any path/query/fragment boundary, the
  //    input is probably a Unicode-spoofed scheme (e.g. fullwidth
  //    `ｊavascript:`). Reject conservatively.
  //
  //    The dotless-i case (`javascrıpt:alert(1)`) intentionally slips
  //    past this guard because its first character IS ASCII; it falls
  //    through to step 8 and is prepended with `https://`. The
  //    resulting `https://javascrıpt:alert(1)` is NOT a javascript:
  //    URL — browsers only dispatch js execution on ASCII scheme
  //    matches — so prepending is safe. Tradeoff documented.
  if (!/^[\x00-\x7F]/.test(s)) {
    const colonIdx = s.indexOf(':');
    if (colonIdx !== -1) {
      const boundaryCandidates = ['/', '?', '#']
        .map((c) => s.indexOf(c))
        .filter((i) => i !== -1);
      const boundaryIdx = boundaryCandidates.length
        ? Math.min(...boundaryCandidates)
        : Infinity;
      if (colonIdx < boundaryIdx) {
        return { ok: false, reason: 'javascript-scheme' };
      }
    }
  }

  // 7. Preserve root-relative, ./repo-relative, ../sibling-relative,
  //    and #fragment-only hrefs verbatim. These never need scheme
  //    prepending.
  if (/^(\/|#|\.\.?\/)/.test(s)) {
    return { ok: true, href: s };
  }

  // 8. Otherwise — plain hostname or scheme-less input — prepend
  //    https:// and accept.
  return { ok: true, href: `https://${s}` };
}
