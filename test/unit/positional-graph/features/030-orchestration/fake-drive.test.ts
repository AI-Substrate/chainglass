/**
 * Tests for FakeGraphOrchestration.drive() — Plan 036 Phase 1.
 *
 * Test Doc:
 * - Why: Validate FakeGraphOrchestration.drive() contract before Phase 4 relies on it
 * - Contract: Fake returns configured DriveResults in FIFO order; tracks call history; throws if unconfigured
 * - Usage Notes: Use setDriveResult() to queue results; getDriveHistory() to inspect calls
 * - Quality Contribution: Catches fake/real parity drift when Phase 4 implements real drive()
 * - Worked Example: setDriveResult({exitReason:'complete',iterations:3,totalActions:5}) → drive() returns that result
 *
 * @packageDocumentation
 */

import type { DriveOptions, DriveResult } from '@chainglass/positional-graph';
import { FakeGraphOrchestration } from '@chainglass/positional-graph';
import { describe, expect, it } from 'vitest';
import { buildFakeReality } from '../../../../../packages/positional-graph/src/features/030-orchestration/fake-onbas.js';
import type { FakeGraphConfig } from '../../../../../packages/positional-graph/src/features/030-orchestration/orchestration-service.types.js';

// ── Helpers ─────────────────────────────────────────────

function makeConfig(overrides?: Partial<FakeGraphConfig>): FakeGraphConfig {
  return {
    runResults: [],
    reality: buildFakeReality({ graphSlug: 'test-graph' }),
    ...overrides,
  };
}

const COMPLETE_RESULT: DriveResult = {
  exitReason: 'complete',
  iterations: 3,
  totalActions: 5,
};

const FAILED_RESULT: DriveResult = {
  exitReason: 'failed',
  iterations: 1,
  totalActions: 0,
};

// ── Tests ───────────────────────────────────────────────

describe('FakeGraphOrchestration.drive()', () => {
  it('returns configured DriveResult', async () => {
    const fake = new FakeGraphOrchestration('test-graph', makeConfig());
    fake.setDriveResult(COMPLETE_RESULT);

    const result = await fake.drive();

    expect(result).toEqual(COMPLETE_RESULT);
  });

  it('returns results in FIFO order, last repeats', async () => {
    const fake = new FakeGraphOrchestration('test-graph', makeConfig());
    fake.setDriveResult(COMPLETE_RESULT);
    fake.setDriveResult(FAILED_RESULT);

    const first = await fake.drive();
    const second = await fake.drive();
    const third = await fake.drive();

    expect(first).toEqual(COMPLETE_RESULT);
    expect(second).toEqual(FAILED_RESULT);
    expect(third).toEqual(FAILED_RESULT); // last repeats
  });

  it('tracks call history with options', async () => {
    const fake = new FakeGraphOrchestration('test-graph', makeConfig());
    fake.setDriveResult(COMPLETE_RESULT);

    const opts: DriveOptions = { maxIterations: 50, actionDelayMs: 200 };
    await fake.drive(opts);
    await fake.drive();

    const history = fake.getDriveHistory();
    expect(history).toHaveLength(2);
    expect(history[0]).toEqual(opts);
    expect(history[1]).toBeUndefined();
  });

  it('throws when no result configured', async () => {
    const fake = new FakeGraphOrchestration('test-graph', makeConfig());

    await expect(fake.drive()).rejects.toThrow(
      'FakeGraphOrchestration(test-graph): no driveResults configured'
    );
  });
});
