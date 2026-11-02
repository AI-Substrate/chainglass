/**
 * Plan 027: Central Domain Event Notification System
 *
 * Unit tests for startCentralNotificationSystem() bootstrap helper.
 *
 * Per DYK Insight #3: Minimal skeleton — tests verify globalThis gating
 * and idempotency only. No DI resolution or watcher activation in Phase 2.
 */

import { WORKSPACE_DI_TOKENS } from '@chainglass/shared/di-tokens';
import { FakeCentralWatcherService } from '@chainglass/workflow';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { startCentralNotificationSystem } from '../../../../apps/web/src/features/027-central-notify-events/start-central-notifications';
import {
  getContainer,
  resetBootstrapSingleton,
} from '../../../../apps/web/src/lib/bootstrap-singleton';

describe('startCentralNotificationSystem', () => {
  let watcher: FakeCentralWatcherService;

  beforeEach(() => {
    // The real watcher starts filesystem watches over every workspace registered on the
    // machine, which took seconds and timed this suite out under load.
    watcher = new FakeCentralWatcherService();
    getContainer().register(WORKSPACE_DI_TOKENS.CENTRAL_WATCHER_SERVICE, { useValue: watcher });
  });

  afterEach(() => {
    // Clean up globalThis flag between tests
    globalThis.__centralNotificationsStarted = undefined;
    globalThis.__watcherMutationUnsubscribe__?.();
    resetBootstrapSingleton();
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
    expect(watcher.startCalls).toHaveLength(1);
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

    // Should not throw, flag should still be true, and the watcher started once
    expect(globalThis.__centralNotificationsStarted).toBe(true);
    expect(watcher.startCalls).toHaveLength(1);
  });
});
