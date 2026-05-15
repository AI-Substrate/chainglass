/**
 * generateBootstrapCode — randomized Crockford base32 code generator
 *
 * Why: Plan 084 Phase 1 T002 — every Chainglass instance needs a
 *      human-readable, dictation-friendly secret with 60 bits of entropy.
 * Contract: returns a 14-char string `XXXX-XXXX-XXXX` matching
 *           BOOTSTRAP_CODE_PATTERN; uses node:crypto for randomness.
 * Usage: called by `ensureBootstrapCode` (T003) and tests; never logged.
 * Quality contribution: deterministic CI via 1k-uniqueness assertion;
 *                       no mocks (Constitution P4); chi-square optional.
 * Worked example:
 *   ```ts
 *   const code = generateBootstrapCode();
 *   // code === '7K2P-9XQM-3T8R' (one possible value)
 *   BOOTSTRAP_CODE_PATTERN.test(code) === true;
 *   ```
 */

import { describe, expect, it } from 'vitest';

import {
  BOOTSTRAP_CODE_PATTERN,
  generateBootstrapCode,
} from '@chainglass/shared/auth-bootstrap-code';

describe('generateBootstrapCode', () => {
  it('returns a 14-character string', () => {
    const code = generateBootstrapCode();
    expect(code).toHaveLength(14);
  });

  it('matches BOOTSTRAP_CODE_PATTERN', () => {
    const code = generateBootstrapCode();
    expect(code).toMatch(BOOTSTRAP_CODE_PATTERN);
  });

  it('produces 1k unique codes (uniqueness sufficient for deterministic CI)', () => {
    const codes = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      codes.add(generateBootstrapCode());
    }
    expect(codes.size).toBe(1000);
  });

  it('every character lies in the Crockford alphabet (no I, L, O, U)', () => {
    // Run 200 iterations and assert every code-character lands in the
    // Crockford alphabet. Without this we could only verify the regex
    // pattern, not that the generator actually emits valid characters.
    const allowedChars = new Set('0123456789ABCDEFGHJKMNPQRSTVWXYZ-');
    for (let i = 0; i < 200; i++) {
      const code = generateBootstrapCode();
      for (const ch of code) {
        expect(allowedChars.has(ch)).toBe(true);
      }
    }
  });

  it('places hyphens at positions 4 and 9 (groups of 4)', () => {
    const code = generateBootstrapCode();
    expect(code[4]).toBe('-');
    expect(code[9]).toBe('-');
  });
});
