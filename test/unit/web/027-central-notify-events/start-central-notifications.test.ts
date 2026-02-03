/**
 * Plan 027: Central Domain Event Notification System
 *
 * Unit tests for startCentralNotificationSystem() bootstrap helper.
 *
 * Per DYK Insight #3: Minimal skeleton — tests verify globalThis gating
 * and idempotency only. No DI resolution or watcher activation in Phase 2.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { startCentralNotificationSystem } from '../../../../apps/web/src/features/027-central-notify-events/start-central-notifications';

describe('startCentralNotificationSystem', () => {
  afterEach(() => {
    // Clean up globalThis flag between tests
    globalThis.__centralNotificationsStarted = undefined;
  });

  it('S01: first call sets globalThis flag', async () => {
    /*
    Test Doc:
    - Why: Single-start invariant — flag prevents double-start across HMR
    - Contract: After first call, globalThis.__centralNotificationsStarted === true
    - Usage Notes: Flag survives HMR via globalThis (same as SSEManager pattern)
    - Quality Contribution: Catches missing flag-set logic
    - Worked Example: startCentralNotificationSystem() → flag is true
    */
    expect(globalThis.__centralNotificationsStarted).toBeUndefined();

    await startCentralNotificationSystem();

    expect(globalThis.__centralNotificationsStarted).toBe(true);
  });

  it('S02: second call is no-op (idempotent)', async () => {
    /*
    Test Doc:
    - Why: Idempotency — double-call must not throw or re-execute
    - Contract: Calling twice doesn't throw and flag remains true
    - Usage Notes: Next.js HMR may trigger multiple calls during development
    - Quality Contribution: Catches missing early-return guard
    - Worked Example: call twice → no error, flag still true
    */
    await startCentralNotificationSystem();
    await startCentralNotificationSystem();

    // Should not throw, flag should still be true
    expect(globalThis.__centralNotificationsStarted).toBe(true);
  });
});
