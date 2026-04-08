/*
Test Doc:
- Why: Validate abortable sleep utility for cooperative cancellation in drive()
- Contract: abortableSleep resolves after delay, rejects immediately on abort, handles already-aborted signals
- Usage Notes: Uses node:timers/promises setTimeout with native AbortSignal support.
    Note on fake timers: vi.useFakeTimers() does NOT intercept node:timers/promises — it
    patches global setTimeout only. Abort tests use pre-aborted signals for determinism.
    The delay test uses a short real timer (50ms) since no fake timer can advance the native API.
- Quality Contribution: Catches abort timing bugs — ensures immediate AbortError on signal
- Worked Example: abortableSleep(10000, signal) where signal is pre-aborted → rejects immediately
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

  it('rejects immediately with already-aborted signal (deterministic)', async () => {
    const controller = new AbortController();
    controller.abort(); // pre-aborted — no timing dependency

    await expect(abortableSleep(10_000, controller.signal)).rejects.toThrow();
  });

  it('rejects when signal fires during sleep', async () => {
    const controller = new AbortController();

    // Abort after 10ms while sleeping for 10s
    setTimeout(() => controller.abort(), 10);
    const start = Date.now();

    await expect(abortableSleep(10_000, controller.signal)).rejects.toThrow();
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(100);
  });

  it('resolves normally when signal is provided but not aborted', async () => {
    const controller = new AbortController();
    const start = Date.now();
    await abortableSleep(50, controller.signal);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(40);
  });

  it('throws AbortError (name check, deterministic)', async () => {
    const controller = new AbortController();
    controller.abort(); // pre-aborted

    try {
      await abortableSleep(1000, controller.signal);
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(Error);
      expect((err as Error).name).toBe('AbortError');
    }
  });
});
