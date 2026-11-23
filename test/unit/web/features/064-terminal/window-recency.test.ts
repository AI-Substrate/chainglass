import { describe, expect, it } from 'vitest';
import {
  NEW_STAR_LIMIT,
  RECENCY_STEPS,
  bumpRecency,
  recencyHeat,
  updateKnown,
} from '../../../../../apps/web/src/features/064-terminal/lib/window-recency';

describe('updateKnown', () => {
  it('first sight of a session marks everything open as known (no flood of new markers)', () => {
    expect(updateKnown(null, ['@1', '@2'], '@1')).toEqual(['@1', '@2']);
  });

  it('a window that appears later stays unknown until it is selected', () => {
    expect(updateKnown(['@1', '@2'], ['@1', '@2', '@3'], '@1')).toEqual(['@1', '@2']);
    expect(updateKnown(['@1', '@2'], ['@1', '@2', '@3'], '@3')).toEqual(['@1', '@2', '@3']);
  });

  it('drops closed windows, and changes nothing while the list is still empty', () => {
    expect(updateKnown(['@1', '@2'], ['@2'], '@2')).toEqual(['@2']);
    expect(updateKnown(['@1'], [], null)).toEqual(['@1']);
    expect(updateKnown(null, [], null)).toBeNull();
  });

  it('caps unseen windows at NEW_STAR_LIMIT newest, permanently promoting the oldest to known', () => {
    expect(NEW_STAR_LIMIT).toBe(5);
    const current = ['@1', '@2', '@3', '@4', '@5', '@6', '@7'];
    const knownAfterSixNew = updateKnown(['@1'], current, '@1');
    expect(knownAfterSixNew).toEqual(['@1', '@2']);

    const unseen = current.filter((id) => !knownAfterSixNew?.includes(id));
    expect(unseen).toEqual(['@3', '@4', '@5', '@6', '@7']);

    // Selecting one of the five starred windows does not restore the star on dropped @2.
    const knownAfterSelect = updateKnown(knownAfterSixNew, current, '@7');
    expect(knownAfterSelect).toEqual(['@1', '@2', '@7']);
    expect(current.filter((id) => !knownAfterSelect?.includes(id))).toEqual([
      '@3',
      '@4',
      '@5',
      '@6',
    ]);
  });

  it('orders unseen windows by numeric tmux id, not list position or lexicographic order', () => {
    // @10..@13 appear earlier in the strip than @8 and @9 (e.g. after drag-to-reorder), and
    // lexicographically "@10" < "@8", "@9" — numeric id ordering must drop @8 (lowest id).
    const current = ['@1', '@13', '@10', '@12', '@9', '@11', '@8'];
    const known = updateKnown(['@1'], current, '@1');
    expect(known).toEqual(['@1', '@8']);

    const unseen = current.filter((id) => !known?.includes(id));
    expect(new Set(unseen)).toEqual(new Set(['@9', '@10', '@11', '@12', '@13']));
  });

  it('promotes multiple excess unseen windows at once in oldest-first id order', () => {
    const current = ['@1', '@2', '@3', '@4', '@5', '@6', '@7', '@8', '@9'];
    const known = updateKnown(['@1'], current, '@1');
    expect(known).toEqual(['@1', '@2', '@3', '@4']);
    expect(current.filter((id) => !known?.includes(id))).toEqual(['@5', '@6', '@7', '@8', '@9']);
  });
});

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
