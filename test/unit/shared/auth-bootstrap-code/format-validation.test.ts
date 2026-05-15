/**
 * BOOTSTRAP_CODE_PATTERN — exhaustive format validation
 *
 * Why: Plan 084 Phase 1 T007 (validation fix FC-H1). Phase 3's verify
 *      route must reject the same set of invalid formats with HTTP 400
 *      `{ error: 'invalid-format' }` (NOT 401 wrong-code). Sharing this
 *      sample set across Phase 1 (regex) and Phase 3 (route handler)
 *      keeps both layers in lockstep.
 * Contract: every entry in `INVALID_FORMAT_SAMPLES` MUST be rejected by
 *           `BOOTSTRAP_CODE_PATTERN.test()`. New invalid samples added to
 *           the fixture must continue to fail here.
 * Usage: parametric `it.each` to keep diagnostics readable.
 * Quality contribution: cross-phase fixture re-use; deterministic CI.
 * Worked example:
 *   ```ts
 *   for (const sample of INVALID_FORMAT_SAMPLES) {
 *     expect(BOOTSTRAP_CODE_PATTERN.test(sample)).toBe(false);
 *   }
 *   ```
 */

import { describe, expect, it } from 'vitest';

import {
  BOOTSTRAP_CODE_PATTERN,
  generateBootstrapCode,
} from '@chainglass/shared/auth-bootstrap-code';

import { INVALID_FORMAT_SAMPLES } from './test-fixtures';

describe('BOOTSTRAP_CODE_PATTERN — INVALID_FORMAT_SAMPLES', () => {
  it.each(INVALID_FORMAT_SAMPLES)('rejects %j', (sample) => {
    expect(BOOTSTRAP_CODE_PATTERN.test(sample)).toBe(false);
  });

  it('accepts a freshly generated valid code', () => {
    expect(BOOTSTRAP_CODE_PATTERN.test(generateBootstrapCode())).toBe(true);
  });

  it('contains all 6 enumerated invalid-shape categories', () => {
    expect(INVALID_FORMAT_SAMPLES).toHaveLength(6);
  });
});
