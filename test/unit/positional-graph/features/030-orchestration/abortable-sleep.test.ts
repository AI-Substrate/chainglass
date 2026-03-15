/*
Test Doc:
- Why: Validate abortable sleep utility for cooperative cancellation in drive()
- Contract: abortableSleep resolves after delay, rejects immediately on abort, handles already-aborted signals
- Usage Notes: Uses node:timers/promises setTimeout with native AbortSignal support
- Quality Contribution: Catches abort timing bugs — ensures <100ms response to cancellation
- Worked Example: abortableSleep(10000, signal) where signal fires after 10ms → rejects within ~20ms
*/

import { describe, expect, it } from 'vitest';

import { abortableSleep } from '../../../../../packages/positional-graph/src/features/030-orchestration/abortable-sleep.js';

describe('abortableSleep', () => {
  it('resolves after specified delay without signal', async () => {
    const start = Date.now();
    await abortableSleep(50);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(40); // allow timer jitter
  });

  it('rejects immediately when signal fires during sleep', async () => {
    const controller = new AbortController();

    // Abort after 10ms while sleeping for 10s
    setTimeout(() => controller.abort(), 10);
    const start = Date.now();

    await expect(abortableSleep(10_000, controller.signal)).rejects.toThrow();
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(100); // responds within 100ms, not 10s
  });

  it('rejects immediately with already-aborted signal', async () => {
    const controller = new AbortController();
    controller.abort();

    const start = Date.now();
    await expect(abortableSleep(10_000, controller.signal)).rejects.toThrow();
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(50);
  });

  it('resolves normally when signal is provided but not aborted', async () => {
    const controller = new AbortController();
    const start = Date.now();
    await abortableSleep(50, controller.signal);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(40);
  });

  it('throws AbortError (name check)', async () => {
    const controller = new AbortController();
    controller.abort();

    try {
      await abortableSleep(1000, controller.signal);
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(Error);
      expect((err as Error).name).toBe('AbortError');
    }
  });
});
