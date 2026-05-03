/**
 * Plan 084 Phase 3 — T005/T006 unit test for `computeBootstrapVerified`.
 * The pure helper is what we test; full RSC + cookies() integration covered
 * by T007 integration tests.
 */
import { buildCookieValue } from '@chainglass/shared/auth-bootstrap-code';
import { describe, expect, it } from 'vitest';

import { computeBootstrapVerified } from '../../../../../apps/web/src/features/063-login/components/bootstrap-gate';

const CODE = '7K2P-9XQM-3T8R';
const KEY = Buffer.from('a'.repeat(64), 'utf-8');

describe('computeBootstrapVerified', () => {
  it('(missing cookie) → false', () => {
    expect(computeBootstrapVerified(undefined, CODE, KEY)).toBe(false);
  });

  it('(valid cookie value) → true', () => {
    const value = buildCookieValue(CODE, KEY);
    expect(computeBootstrapVerified(value, CODE, KEY)).toBe(true);
  });

  it('(tampered cookie value) → false', () => {
    expect(computeBootstrapVerified('not-the-real-hmac', CODE, KEY)).toBe(
      false,
    );
  });

  it('(empty cookie value) → false', () => {
    expect(computeBootstrapVerified('', CODE, KEY)).toBe(false);
  });
});
