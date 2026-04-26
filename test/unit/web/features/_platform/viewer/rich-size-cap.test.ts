/**
 * rich-size-cap Tests — Phase 4 / T005 (TDD).
 *
 * Gate helper for the Rich-mode size cap (AC-16a). Uses UTF-8 byte length,
 * not JavaScript string length, so a multi-byte document correctly trips
 * the cap even when its `.length` is small.
 *
 * Constant is 200,000 bytes (decimal kilobytes — matches the spec's
 * informal "200 KB" phrasing, NOT 204,800 binary kibibytes).
 *
 * Constitution §3/§4/§7 — TDD, pure in/out, no mocks.
 */

import { describe, expect, it } from 'vitest';

import {
  RICH_MODE_SIZE_CAP_BYTES,
  exceedsRichSizeCap,
} from '../../../../../../apps/web/src/features/_platform/viewer/lib/rich-size-cap';

describe('RICH_MODE_SIZE_CAP_BYTES constant', () => {
  it('is exactly 200_000 (decimal KB, matches spec AC-16a)', () => {
    expect(RICH_MODE_SIZE_CAP_BYTES).toBe(200_000);
  });
});

describe('exceedsRichSizeCap — ASCII boundary', () => {
  it('(1) returns false for an empty string', () => {
    expect(exceedsRichSizeCap('')).toBe(false);
  });

  it('(2) returns false at 199_999 ASCII characters (just under cap)', () => {
    const s = 'x'.repeat(199_999);
    expect(exceedsRichSizeCap(s)).toBe(false);
  });

  it('boundary: returns false at exactly 200_000 ASCII characters (strict `>`)', () => {
    const s = 'x'.repeat(200_000);
    expect(exceedsRichSizeCap(s)).toBe(false);
  });

  it('(3) returns true at 200_001 ASCII characters (just over cap)', () => {
    const s = 'x'.repeat(200_001);
    expect(exceedsRichSizeCap(s)).toBe(true);
  });
});

describe('exceedsRichSizeCap — UTF-8 byte semantics (not string length)', () => {
  it("(4) returns true for 100_000 copies of '中' (= 300_000 bytes) even though .length is 100_000", () => {
    const s = '中'.repeat(100_000);
    expect(s.length).toBe(100_000); // sanity: string length well under cap
    expect(exceedsRichSizeCap(s)).toBe(true);
  });

  it("(5) boundary: '中'.repeat(66_666) = 199_998 bytes → false; '中'.repeat(66_667) = 200_001 bytes → true", () => {
    const under = '中'.repeat(66_666); // 66_666 × 3 bytes = 199_998 bytes
    expect(exceedsRichSizeCap(under)).toBe(false);

    const over = '中'.repeat(66_667); // 66_667 × 3 bytes = 200_001 bytes
    expect(exceedsRichSizeCap(over)).toBe(true);
  });
});
