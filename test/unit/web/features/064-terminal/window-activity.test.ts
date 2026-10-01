import { describe, expect, it } from 'vitest';
import {
  WindowActivityTracker,
  formatIdle,
} from '../../../../../apps/web/src/features/064-terminal/lib/window-activity';

// Samples are (cumulative CPU seconds, wall seconds), polled every 2s like the strip.
// Busy = at least 2% of a core; idle agents measured ~0.5%.
describe('WindowActivityTracker', () => {
  it('never marks a window active or timed for a click redraw on an otherwise idle agent', () => {
    const tracker = new WindowActivityTracker();
    const w = 's:@18';
    expect(tracker.observe(w, 10.0, 0)).toEqual({ activeSeconds: null, idleSeconds: null });
    expect(tracker.observe(w, 10.01, 2)).toEqual({ activeSeconds: null, idleSeconds: null });
    // The click: one 80ms redraw burst (4% over the sample), then idle again.
    expect(tracker.observe(w, 10.09, 4)).toEqual({ activeSeconds: null, idleSeconds: null });
    expect(tracker.observe(w, 10.1, 6)).toEqual({ activeSeconds: null, idleSeconds: null });
  });

  it('turns active on sustained work, rides out a short pause, then counts idle from the last work', () => {
    const tracker = new WindowActivityTracker();
    const w = 's:@1';
    tracker.observe(w, 0, 0);
    expect(tracker.observe(w, 0.2, 2).activeSeconds).toBeNull(); // first busy sample: unconfirmed
    expect(tracker.observe(w, 0.4, 4)).toEqual({ activeSeconds: 4, idleSeconds: 0 }); // from 1st busy
    expect(tracker.observe(w, 0.4, 6).activeSeconds).toBe(6); // 2s quiet: within grace
    expect(tracker.observe(w, 0.6, 8).activeSeconds).toBe(8); // working again
    tracker.observe(w, 0.6, 10);
    tracker.observe(w, 0.6, 12);
    expect(tracker.observe(w, 0.6, 16)).toEqual({ activeSeconds: null, idleSeconds: 8 });
  });
});

describe('formatIdle', () => {
  it('never runs wider than four characters, so strip boxes keep one width', () => {
    const cases: Array<[number, string]> = [
      [8, '8s'],
      [600, '10m'],
      [3_600, '1h'],
      [94 * 60, '1.5h'],
      [13 * 3_600 + 59 * 60, '13h'],
      [60 * 3_600, '2.5d'],
      [12 * 86_400 + 3_600, '12d'],
    ];
    for (const [seconds, label] of cases) expect(formatIdle(seconds)).toBe(label);
  });
});
