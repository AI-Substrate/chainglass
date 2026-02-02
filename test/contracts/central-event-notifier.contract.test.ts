/**
 * Plan 027: Central Domain Event Notification System
 *
 * Contract test runner for ICentralEventNotifier.
 *
 * Phase 1: Runs against FakeCentralEventNotifier only.
 * Phase 2: Will add CentralEventNotifierService (real) to this runner.
 */

import { FakeCentralEventNotifier } from '@chainglass/shared/features/027-central-notify-events/fake-central-event-notifier';
import { centralEventNotifierContractTests } from './central-event-notifier.contract.js';

// Run contract tests against FakeCentralEventNotifier
centralEventNotifierContractTests('FakeCentralEventNotifier', () => {
  const fake = new FakeCentralEventNotifier();
  return {
    notifier: fake,
    advanceTime: (ms: number) => fake.advanceTime(ms),
  };
});
