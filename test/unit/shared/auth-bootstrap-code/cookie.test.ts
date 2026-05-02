/**
 * build/verifyCookieValue — HMAC-SHA256 cookie sign/verify
 *
 * Why: Plan 084 Phase 1 T004. The popup sets a server-signed cookie
 *      that proves bootstrap-code possession. Stateless; rotating the
 *      code or the signing key invalidates every existing cookie.
 * Contract: `buildCookieValue(code, key)` returns a base64url HMAC.
 *           `verifyCookieValue(value, code, key)` is constant-time true/false.
 * Usage: Phase 3 verify route + proxy gate; Phase 5 `requireLocalAuth`.
 * Quality contribution: real `node:crypto`; constant-time compare; no mocks.
 * Worked example:
 *   ```ts
 *   const cookie = buildCookieValue('7K2P-9XQM-3T8R', secretKey);
 *   verifyCookieValue(cookie, '7K2P-9XQM-3T8R', secretKey) === true;
 *   verifyCookieValue(cookie, 'WRONG-CODE-XXXX', secretKey) === false;
 *   ```
 */

import { describe, expect, it } from 'vitest';

import {
  buildCookieValue,
  verifyCookieValue,
} from '@chainglass/shared/auth-bootstrap-code';

const KEY_A = Buffer.from('test-key-aaaaaaaaaaaaaaaaaaaaaaa', 'utf-8');
const KEY_B = Buffer.from('test-key-bbbbbbbbbbbbbbbbbbbbbbb', 'utf-8');
const CODE = '7K2P-9XQM-3T8R';
const ROTATED_CODE = 'M3T1-V8XW-7K9P';

describe('buildCookieValue', () => {
  it('returns a non-empty base64url string', () => {
    const value = buildCookieValue(CODE, KEY_A);
    expect(value).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(value.length).toBeGreaterThan(0);
  });

  it('is deterministic for the same code + key', () => {
    expect(buildCookieValue(CODE, KEY_A)).toBe(buildCookieValue(CODE, KEY_A));
  });

  it('produces different values for different keys (rotation invariant)', () => {
    expect(buildCookieValue(CODE, KEY_A)).not.toBe(buildCookieValue(CODE, KEY_B));
  });

  it('produces different values for different codes', () => {
    expect(buildCookieValue(CODE, KEY_A)).not.toBe(
      buildCookieValue(ROTATED_CODE, KEY_A),
    );
  });
});

describe('verifyCookieValue', () => {
  it('verifies a freshly built cookie', () => {
    const value = buildCookieValue(CODE, KEY_A);
    expect(verifyCookieValue(value, CODE, KEY_A)).toBe(true);
  });

  it('rejects a cookie verified against the wrong code (post-rotation)', () => {
    const value = buildCookieValue(CODE, KEY_A);
    expect(verifyCookieValue(value, ROTATED_CODE, KEY_A)).toBe(false);
  });

  it('rejects a cookie verified against the wrong key', () => {
    const value = buildCookieValue(CODE, KEY_A);
    expect(verifyCookieValue(value, CODE, KEY_B)).toBe(false);
  });

  it('rejects a tampered cookie value (1 char flip)', () => {
    const value = buildCookieValue(CODE, KEY_A);
    const tampered = `${value.slice(0, -1)}${value.slice(-1) === 'A' ? 'B' : 'A'}`;
    expect(verifyCookieValue(tampered, CODE, KEY_A)).toBe(false);
  });

  it('rejects an `undefined` cookie value', () => {
    expect(verifyCookieValue(undefined, CODE, KEY_A)).toBe(false);
  });

  it('rejects an empty-string cookie value', () => {
    expect(verifyCookieValue('', CODE, KEY_A)).toBe(false);
  });

  it('rejects a cookie of mismatched length (avoids timingSafeEqual throw)', () => {
    const value = buildCookieValue(CODE, KEY_A);
    expect(verifyCookieValue(`${value}-extra`, CODE, KEY_A)).toBe(false);
    expect(verifyCookieValue(value.slice(0, 5), CODE, KEY_A)).toBe(false);
  });
});
