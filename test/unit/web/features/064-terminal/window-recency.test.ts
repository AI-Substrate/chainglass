import { describe, expect, it } from 'vitest';
import {
  RECENCY_FADE_MS,
  recencyHeat,
} from '../../../../../apps/web/src/features/064-terminal/lib/window-recency';

describe('recencyHeat', () => {
  const now = 1_000_000_000;

  it('is 0 for a window never selected', () => {
    expect(recencyHeat(undefined, now)).toBe(0);
  });

  it('is 1 at the moment of selection (and for a clock that runs behind)', () => {
    expect(recencyHeat(now, now)).toBe(1);
    expect(recencyHeat(now + 5_000, now)).toBe(1);
  });

  it('fades linearly to 0 over the fade window', () => {
    expect(recencyHeat(now - RECENCY_FADE_MS / 2, now)).toBeCloseTo(0.5);
    expect(recencyHeat(now - RECENCY_FADE_MS, now)).toBe(0);
    expect(recencyHeat(now - RECENCY_FADE_MS * 2, now)).toBe(0);
  });
});
