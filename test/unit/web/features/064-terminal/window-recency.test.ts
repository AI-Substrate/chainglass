import { describe, expect, it } from 'vitest';
import {
  RECENCY_STEPS,
  bumpRecency,
  recencyHeat,
} from '../../../../../apps/web/src/features/064-terminal/lib/window-recency';

describe('recencyHeat', () => {
  it('is full for the most recent window and 0 for unranked ones', () => {
    expect(recencyHeat(0)).toBe(1);
    expect(recencyHeat(-1)).toBe(0);
  });

  it('gives RECENCY_STEPS distinct, strictly decreasing, visible strengths', () => {
    const steps = Array.from({ length: RECENCY_STEPS }, (_, rank) => recencyHeat(rank));
    expect(steps).toHaveLength(8);
    for (let i = 1; i < steps.length; i++) expect(steps[i]).toBeLessThan(steps[i - 1]);
    expect(steps[steps.length - 1]).toBeGreaterThan(0);
  });

  it('is 0 beyond the last step', () => {
    expect(recencyHeat(RECENCY_STEPS)).toBe(0);
    expect(recencyHeat(RECENCY_STEPS + 5)).toBe(0);
  });
});

describe('bumpRecency', () => {
  it('moves a revisited window to the front without duplicating it', () => {
    expect(bumpRecency(['@1', '@2', '@3'], '@3')).toEqual(['@3', '@1', '@2']);
  });

  it('keeps only RECENCY_STEPS windows, dropping the oldest', () => {
    const order = Array.from({ length: RECENCY_STEPS }, (_, i) => `@${i}`);
    const next = bumpRecency(order, '@new');
    expect(next).toHaveLength(RECENCY_STEPS);
    expect(next[0]).toBe('@new');
    expect(next).not.toContain(`@${RECENCY_STEPS - 1}`);
  });
});
