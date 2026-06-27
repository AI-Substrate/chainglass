/**
 * build/verifyAssetToken — HMAC-SHA256 asset-token sign/verify
 *
 * Why: Plan 084 FX011. The HtmlViewer renders HTML inside a sandboxed
 *      iframe whose opaque origin strips the HttpOnly bootstrap cookie
 *      from sub-resource requests. An asset token is a short-lived,
 *      worktree-bound HMAC that the iframe can carry in URLs to prove
 *      the parent React was cookie-authenticated when the token was
 *      minted.
 * Contract: `buildAssetToken(worktree, key, ttlSeconds): { token, expiresAt }`
 *           `verifyAssetToken(token, worktree, key, nowSeconds): boolean`
 *           Token shape: `<expSecs>.<base64url(HMAC-SHA256(key, "asset:" + worktree + ":" + expSecs))>`
 *           Type-tagged with the literal "asset:" prefix for domain
 *           separation from the cookie HMAC (NIST SP 800-108 § 8.2).
 * Quality contribution: real `node:crypto`; constant-time compare;
 *                       boundary-condition coverage on expiry;
 *                       no mocks.
 */

import { describe, expect, it } from 'vitest';

import { buildAssetToken, verifyAssetToken } from '@chainglass/shared/auth-bootstrap-code';

const KEY_A = Buffer.from('test-key-aaaaaaaaaaaaaaaaaaaaaaa', 'utf-8');
const KEY_B = Buffer.from('test-key-bbbbbbbbbbbbbbbbbbbbbbb', 'utf-8');
const WORKTREE_A = '/Users/test/workspace-a';
const WORKTREE_B = '/Users/test/workspace-b';
const TTL = 600;
const NOW_S = 1_700_000_000; // fixed reference instant (seconds)

describe('buildAssetToken', () => {
  it('returns a token of shape <expSecs>.<hmac> with non-empty halves', () => {
    const { token, expiresAt } = buildAssetToken(WORKTREE_A, KEY_A, TTL);
    const parts = token.split('.');
    expect(parts).toHaveLength(2);
    expect(parts[0]).toMatch(/^[0-9]+$/);
    expect(parts[1]).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(parts[1].length).toBeGreaterThan(0);
    expect(expiresAt).toBeGreaterThan(Date.now());
  });

  it('returns `expiresAt` ≈ now + ttlSeconds*1000 (ms epoch)', () => {
    const before = Date.now();
    const { expiresAt } = buildAssetToken(WORKTREE_A, KEY_A, TTL);
    const after = Date.now();
    expect(expiresAt).toBeGreaterThanOrEqual(before + TTL * 1000 - 1000);
    expect(expiresAt).toBeLessThanOrEqual(after + TTL * 1000 + 1000);
  });

  it('produces a token whose expSecs == floor(expiresAt / 1000)', () => {
    const { token, expiresAt } = buildAssetToken(WORKTREE_A, KEY_A, TTL);
    const expSecs = Number.parseInt(token.split('.')[0] ?? '', 10);
    expect(expSecs).toBe(Math.floor(expiresAt / 1000));
  });

  it('produces different tokens for different worktrees (binding)', () => {
    // Different worktrees minted at the same instant yield different
    // HMAC halves even if expSecs collide.
    const ta = buildAssetToken(WORKTREE_A, KEY_A, TTL).token;
    const tb = buildAssetToken(WORKTREE_B, KEY_A, TTL).token;
    // The HMAC halves should differ even when expSecs match
    const hmacA = ta.split('.')[1];
    const hmacB = tb.split('.')[1];
    if (ta.split('.')[0] === tb.split('.')[0]) {
      expect(hmacA).not.toBe(hmacB);
    }
  });

  it('produces different tokens for different keys (rotation invariant)', () => {
    const ta = buildAssetToken(WORKTREE_A, KEY_A, TTL).token;
    const tb = buildAssetToken(WORKTREE_A, KEY_B, TTL).token;
    const hmacA = ta.split('.')[1];
    const hmacB = tb.split('.')[1];
    if (ta.split('.')[0] === tb.split('.')[0]) {
      expect(hmacA).not.toBe(hmacB);
    }
  });
});

describe('verifyAssetToken — happy path', () => {
  it('verifies a freshly built token against the same worktree + key', () => {
    const { token } = buildAssetToken(WORKTREE_A, KEY_A, TTL);
    const now = Math.floor(Date.now() / 1000);
    expect(verifyAssetToken(token, WORKTREE_A, KEY_A, now)).toBe(true);
  });
});

describe('verifyAssetToken — undefined / null / malformed', () => {
  it('rejects `undefined` without throwing', () => {
    expect(verifyAssetToken(undefined, WORKTREE_A, KEY_A, NOW_S)).toBe(false);
  });

  it('rejects `null` without throwing', () => {
    // biome-ignore lint/suspicious/noExplicitAny: testing null-safety at runtime boundary
    expect(verifyAssetToken(null as any, WORKTREE_A, KEY_A, NOW_S)).toBe(false);
  });

  it('rejects an empty string', () => {
    expect(verifyAssetToken('', WORKTREE_A, KEY_A, NOW_S)).toBe(false);
  });

  it('rejects a token with no dot (single part)', () => {
    expect(verifyAssetToken('nodothere', WORKTREE_A, KEY_A, NOW_S)).toBe(false);
  });

  it('rejects a token with too many dots (three parts)', () => {
    expect(verifyAssetToken('1.2.3', WORKTREE_A, KEY_A, NOW_S)).toBe(false);
  });

  it('rejects a token with non-decimal expSecs', () => {
    expect(verifyAssetToken('abc.zzzzzzzzzzzzzzzz', WORKTREE_A, KEY_A, NOW_S)).toBe(false);
  });

  it('rejects a token with negative expSecs', () => {
    expect(verifyAssetToken('-1.zzzzzzzzzzzzzzzz', WORKTREE_A, KEY_A, NOW_S)).toBe(false);
  });
});

describe('verifyAssetToken — expiry boundary triad', () => {
  it('accepts a token at `now = expSecs - 1` (valid 1s before expiry)', () => {
    const { token } = buildAssetToken(WORKTREE_A, KEY_A, TTL);
    const expSecs = Number.parseInt(token.split('.')[0] ?? '', 10);
    expect(verifyAssetToken(token, WORKTREE_A, KEY_A, expSecs - 1)).toBe(true);
  });

  it('rejects a token at `now = expSecs` (expired at exact moment)', () => {
    const { token } = buildAssetToken(WORKTREE_A, KEY_A, TTL);
    const expSecs = Number.parseInt(token.split('.')[0] ?? '', 10);
    expect(verifyAssetToken(token, WORKTREE_A, KEY_A, expSecs)).toBe(false);
  });

  it('rejects a token at `now = expSecs + 1` (expired by 1s)', () => {
    const { token } = buildAssetToken(WORKTREE_A, KEY_A, TTL);
    const expSecs = Number.parseInt(token.split('.')[0] ?? '', 10);
    expect(verifyAssetToken(token, WORKTREE_A, KEY_A, expSecs + 1)).toBe(false);
  });
});

describe('verifyAssetToken — worktree binding', () => {
  it('rejects a token minted for worktree A when verified against worktree B', () => {
    const { token } = buildAssetToken(WORKTREE_A, KEY_A, TTL);
    const now = Math.floor(Date.now() / 1000);
    expect(verifyAssetToken(token, WORKTREE_B, KEY_A, now)).toBe(false);
  });

  it('accepts a token minted for worktree A only against worktree A', () => {
    const { token } = buildAssetToken(WORKTREE_A, KEY_A, TTL);
    const now = Math.floor(Date.now() / 1000);
    expect(verifyAssetToken(token, WORKTREE_A, KEY_A, now)).toBe(true);
  });
});

describe('verifyAssetToken — key rotation', () => {
  it('rejects a token verified against a rotated key', () => {
    const { token } = buildAssetToken(WORKTREE_A, KEY_A, TTL);
    const now = Math.floor(Date.now() / 1000);
    expect(verifyAssetToken(token, WORKTREE_A, KEY_B, now)).toBe(false);
  });
});

describe('verifyAssetToken — length-mismatch / tampering', () => {
  it('rejects a token with HMAC half truncated (length mismatch, no throw)', () => {
    const { token } = buildAssetToken(WORKTREE_A, KEY_A, TTL);
    const [exp, hmac] = token.split('.');
    if (!hmac) throw new Error('buildAssetToken must return a token with an HMAC half');
    const truncated = `${exp}.${hmac.slice(0, 4)}`;
    const now = Math.floor(Date.now() / 1000);
    expect(verifyAssetToken(truncated, WORKTREE_A, KEY_A, now)).toBe(false);
  });

  it('rejects a token with HMAC half extended (length mismatch, no throw)', () => {
    const { token } = buildAssetToken(WORKTREE_A, KEY_A, TTL);
    const now = Math.floor(Date.now() / 1000);
    expect(verifyAssetToken(`${token}EXTRA`, WORKTREE_A, KEY_A, now)).toBe(false);
  });

  it('rejects a token with 1-char HMAC flip (timing-safe compare miss)', () => {
    const { token } = buildAssetToken(WORKTREE_A, KEY_A, TTL);
    const [exp, hmac] = token.split('.');
    if (!hmac) throw new Error('buildAssetToken must return a token with an HMAC half');
    const flipped = `${exp}.${hmac.slice(0, -1)}${hmac.slice(-1) === 'A' ? 'B' : 'A'}`;
    const now = Math.floor(Date.now() / 1000);
    expect(verifyAssetToken(flipped, WORKTREE_A, KEY_A, now)).toBe(false);
  });
});
