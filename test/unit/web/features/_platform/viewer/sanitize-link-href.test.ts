/**
 * sanitizeLinkHref Tests — Phase 3 / T002 (TDD).
 *
 * Pure-function security gate that normalizes user-entered URLs for the
 * Link popover. Allow-list approach: accept http/https/mailto and
 * root/repo-relative/fragment paths; prepend https:// to scheme-less
 * inputs; reject everything else (javascript/data/vbscript/file/etc.)
 * including well-known evasion vectors (control-char embeds, URL-encoded
 * scheme prefixes, fullwidth Unicode scheme spoofs).
 *
 * Constitution §3 (TDD) — this test file was written RED, then the
 * implementation was added until every case turned GREEN.
 * Constitution §4/§7 — no mocks, no vi.fn, no vi.spyOn. Pure in/out.
 */

import { describe, expect, it } from 'vitest';

import { sanitizeLinkHref } from '../../../../../../apps/web/src/features/_platform/viewer/lib/sanitize-link-href';

describe('sanitizeLinkHref — happy-path accepts', () => {
  it('accepts an https URL unchanged', () => {
    expect(sanitizeLinkHref('https://example.com')).toEqual({
      ok: true,
      href: 'https://example.com',
    });
  });

  it('accepts an http URL unchanged', () => {
    expect(sanitizeLinkHref('http://example.com')).toEqual({
      ok: true,
      href: 'http://example.com',
    });
  });

  it('prepends https:// to a scheme-less bare hostname', () => {
    expect(sanitizeLinkHref('example.com')).toEqual({
      ok: true,
      href: 'https://example.com',
    });
  });

  it('prepends https:// to a scheme-less www hostname', () => {
    expect(sanitizeLinkHref('www.example.com')).toEqual({
      ok: true,
      href: 'https://www.example.com',
    });
  });

  it('accepts a mailto URL unchanged', () => {
    expect(sanitizeLinkHref('mailto:a@b.c')).toEqual({
      ok: true,
      href: 'mailto:a@b.c',
    });
  });

  it('preserves a root-relative path', () => {
    expect(sanitizeLinkHref('/relative/path')).toEqual({
      ok: true,
      href: '/relative/path',
    });
  });

  it('preserves a ./repo-relative path', () => {
    expect(sanitizeLinkHref('./file.md')).toEqual({
      ok: true,
      href: './file.md',
    });
  });

  it('preserves a ../sibling path', () => {
    expect(sanitizeLinkHref('../sibling.md')).toEqual({
      ok: true,
      href: '../sibling.md',
    });
  });

  it('preserves a #fragment-only href', () => {
    expect(sanitizeLinkHref('#anchor')).toEqual({
      ok: true,
      href: '#anchor',
    });
  });

  it('trims surrounding whitespace', () => {
    expect(sanitizeLinkHref('  https://example.com  ')).toEqual({
      ok: true,
      href: 'https://example.com',
    });
  });

  it('trims trailing newlines', () => {
    expect(sanitizeLinkHref('https://example.com\n')).toEqual({
      ok: true,
      href: 'https://example.com',
    });
  });

  it('accepts a URL containing balanced parentheses (Wikipedia-style)', () => {
    // Round-trip coverage for Finding-like parenthesized-URL robustness.
    expect(sanitizeLinkHref('https://en.wikipedia.org/wiki/Foo_(bar)')).toEqual({
      ok: true,
      href: 'https://en.wikipedia.org/wiki/Foo_(bar)',
    });
  });
});

describe('sanitizeLinkHref — empty input', () => {
  it('rejects an empty string', () => {
    expect(sanitizeLinkHref('')).toEqual({ ok: false, reason: 'empty' });
  });

  it('rejects whitespace-only input', () => {
    expect(sanitizeLinkHref('   \t\n  ')).toEqual({ ok: false, reason: 'empty' });
  });
});

describe('sanitizeLinkHref — dangerous scheme rejections', () => {
  it('rejects javascript: scheme', () => {
    expect(sanitizeLinkHref('javascript:alert(1)')).toEqual({
      ok: false,
      reason: 'javascript-scheme',
    });
  });

  it('rejects JavaScript: with mixed case', () => {
    expect(sanitizeLinkHref('JavaScript:alert(1)')).toEqual({
      ok: false,
      reason: 'javascript-scheme',
    });
  });

  it('rejects vbscript: scheme', () => {
    expect(sanitizeLinkHref('vbscript:msgbox(1)')).toEqual({
      ok: false,
      reason: 'javascript-scheme',
    });
  });

  it('rejects data: URL', () => {
    expect(sanitizeLinkHref('data:text/html,<script>alert(1)</script>')).toEqual({
      ok: false,
      reason: 'javascript-scheme',
    });
  });

  it('rejects file:// URL', () => {
    expect(sanitizeLinkHref('file:///etc/passwd')).toEqual({
      ok: false,
      reason: 'javascript-scheme',
    });
  });
});

describe('sanitizeLinkHref — evasion vectors', () => {
  it('rejects tab-embedded javascript: (jav\\tascript:)', () => {
    // \t U+0009 — some parsers strip tabs before scheme detection.
    expect(sanitizeLinkHref('jav\tascript:alert(1)')).toEqual({
      ok: false,
      reason: 'javascript-scheme',
    });
  });

  it('rejects newline-embedded javascript: (java\\nscript:)', () => {
    expect(sanitizeLinkHref('java\nscript:alert(1)')).toEqual({
      ok: false,
      reason: 'javascript-scheme',
    });
  });

  it('rejects CR-embedded javascript: (javas\\rcript:)', () => {
    expect(sanitizeLinkHref('javas\rcript:alert(1)')).toEqual({
      ok: false,
      reason: 'javascript-scheme',
    });
  });

  it('rejects null-byte-prefixed javascript:', () => {
    expect(sanitizeLinkHref('\u0000javascript:alert(1)')).toEqual({
      ok: false,
      reason: 'javascript-scheme',
    });
  });

  it('rejects percent-encoded scheme prefix (%6Aavascript:)', () => {
    // Paranoid guard: pre-scheme %XX-looking prefix = reject as
    // javascript-scheme rather than prepend https:// and accept.
    expect(sanitizeLinkHref('%6Aavascript:alert(1)')).toEqual({
      ok: false,
      reason: 'javascript-scheme',
    });
  });

  it('rejects fullwidth-Unicode javascript scheme (ｊavascript:)', () => {
    // U+FF4A "ｊ" — ASCII normalization catches this; our regex
    // requires [a-z] for scheme start so the colon is never a scheme
    // boundary, BUT the trailing ":alert(1)" plus an unknown-scheme
    // prefix is exactly the shape the paranoid guard is for.
    expect(sanitizeLinkHref('ｊavascript:alert(1)')).toEqual({
      ok: false,
      reason: 'javascript-scheme',
    });
  });
});

describe('sanitizeLinkHref — dotless-i spoof (documented trade-off)', () => {
  it('accepts javascrıpt: (U+0131) as scheme-less and prepends https://', () => {
    // This is the documented edge from the dossier: because the scheme
    // detection fails (non-ASCII letter), the input is treated as a
    // scheme-less string and prepended with https://. The resulting
    // href is 'https://javascrıpt:alert(1)' which is NOT executable as
    // JavaScript (browsers only dispatch javascript: on ASCII scheme
    // matches). We document this behavior rather than bending the
    // allow-list rules.
    expect(sanitizeLinkHref('javascrıpt:alert(1)')).toEqual({
      ok: true,
      href: 'https://javascrıpt:alert(1)',
    });
  });
});
