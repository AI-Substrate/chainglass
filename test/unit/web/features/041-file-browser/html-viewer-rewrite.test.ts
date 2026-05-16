/**
 * Plan 084 FX011 — `rewriteRelativeUrls` (HtmlViewer URL rewriter) unit tests.
 *
 * The rewriter takes raw HTML, resolves relative `<img>`/`<link>`/`<script>`
 * URLs against the HTML file's directory, and rewrites them to absolute
 * raw-file API URLs that the sandboxed iframe can fetch. FX011 extends the
 * rewriter to also splice an asset token `&_at=<token>` onto each URL so the
 * iframe's sub-resource requests authenticate without the bootstrap cookie.
 *
 * Source of truth: `apps/web/src/features/041-file-browser/components/html-viewer.tsx`
 */
import { describe, expect, it } from 'vitest';

import { rewriteRelativeUrls } from '../../../../../apps/web/src/features/041-file-browser/components/html-viewer';

const CURRENT_FILE = 'projects/osk/doctors-surgery-30s-fb/concept/storyboard.html';
const RAW_BASE = '/api/workspaces/higgs-jordo/files/raw?worktree=/Users/test/wt';
const ORIGIN = 'http://localhost:3000';
const TOKEN = '1700000600.abc123def456ghi789jkl0';

describe('rewriteRelativeUrls', () => {
  it('appends &_at=<token> to every rewritten relative URL', () => {
    const html = '<img src="../characters/spag-bowl/pinned/hero.png">';
    const out = rewriteRelativeUrls(html, CURRENT_FILE, RAW_BASE, ORIGIN, TOKEN);
    expect(out).toContain(`_at=${encodeURIComponent(TOKEN)}`);
    expect(out).toContain('characters%2Fspag-bowl%2Fpinned%2Fhero.png');
  });

  it('handles multiple relative URLs in the same HTML', () => {
    const html = `<img src="a.png"><img src="b.png">`;
    const out = rewriteRelativeUrls(html, CURRENT_FILE, RAW_BASE, ORIGIN, TOKEN);
    // Both URLs must carry the token
    const matches = out.match(new RegExp(`_at=${encodeURIComponent(TOKEN)}`, 'g'));
    expect(matches).toHaveLength(2);
  });

  it('leaves absolute http URLs untouched', () => {
    const html = '<img src="http://example.com/foo.png">';
    const out = rewriteRelativeUrls(html, CURRENT_FILE, RAW_BASE, ORIGIN, TOKEN);
    expect(out).toBe(html);
    expect(out).not.toContain('_at=');
  });

  it('leaves protocol-relative // URLs untouched', () => {
    const html = '<img src="//cdn.example.com/foo.png">';
    const out = rewriteRelativeUrls(html, CURRENT_FILE, RAW_BASE, ORIGIN, TOKEN);
    expect(out).toBe(html);
  });

  it('leaves data: URLs untouched', () => {
    const html = '<img src="data:image/png;base64,abc">';
    const out = rewriteRelativeUrls(html, CURRENT_FILE, RAW_BASE, ORIGIN, TOKEN);
    expect(out).toBe(html);
  });

  it('leaves anchor #fragment hrefs untouched', () => {
    const html = '<a href="#spag-bowl">link</a>';
    const out = rewriteRelativeUrls(html, CURRENT_FILE, RAW_BASE, ORIGIN, TOKEN);
    expect(out).toBe(html);
  });

  it('leaves root-relative / URLs untouched (browser handles via absolute base)', () => {
    const html = '<img src="/already-absolute.png">';
    const out = rewriteRelativeUrls(html, CURRENT_FILE, RAW_BASE, ORIGIN, TOKEN);
    expect(out).toBe(html);
  });

  it('rewrites href and src consistently', () => {
    const html = '<link href="../styles.css"><script src="../app.js"></script>';
    const out = rewriteRelativeUrls(html, CURRENT_FILE, RAW_BASE, ORIGIN, TOKEN);
    const matches = out.match(new RegExp(`_at=${encodeURIComponent(TOKEN)}`, 'g'));
    expect(matches).toHaveLength(2);
  });

  it('URL-encodes tokens with reserved characters (defensive — base64url is URL-safe but ensure encoding round-trips)', () => {
    // Even though base64url alphabet has no reserved URL chars, double-
    // encode-decode should round-trip for any string the caller hands us.
    const weirdToken = '17.abc/+=def'; // not actual base64url, but tests escaping
    const html = '<img src="./foo.png">';
    const out = rewriteRelativeUrls(html, CURRENT_FILE, RAW_BASE, ORIGIN, weirdToken);
    expect(out).toContain(`_at=${encodeURIComponent(weirdToken)}`);
    // Verify the token is decodable back to its original
    const match = out.match(/_at=([^"'&]+)/);
    expect(match).not.toBeNull();
    expect(decodeURIComponent(match![1]!)).toBe(weirdToken);
  });

  it('produces absolute URLs (with origin) so the sandboxed iframe can fetch them', () => {
    const html = '<img src="./foo.png">';
    const out = rewriteRelativeUrls(html, CURRENT_FILE, RAW_BASE, ORIGIN, TOKEN);
    expect(out).toContain(ORIGIN);
  });
});
