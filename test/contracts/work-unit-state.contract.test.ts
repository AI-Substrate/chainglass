/**
 * Contract test runner for IWorkUnitStateService.
 *
 * Conformance tests run against both real and fake.
 * Behavioral tests run against fake only (real needs filesystem
 * and CEN injection for full behavior).
 *
 * Plan 059 Phase 2.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { FakeWorkUnitStateService } from '@chainglass/shared/fakes';
import { FakeCentralEventNotifier } from '@chainglass/shared/features/027-central-notify-events';
import { WorkUnitStateService } from '../../apps/web/src/lib/work-unit-state/work-unit-state.service.js';
import {
  workUnitStateBehavioralTests,
  workUnitStateConformanceTests,
} from './work-unit-state.contract.js';

// ── Conformance Tests (both implementations) ──

workUnitStateConformanceTests('FakeWorkUnitStateService', () => new FakeWorkUnitStateService());

workUnitStateConformanceTests('WorkUnitStateService (Real)', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wus-test-'));
  const fakeCEN = new FakeCentralEventNotifier();
  return new WorkUnitStateService(tmpDir, fakeCEN);
});

// ── Behavioral Tests (fake only) ──

workUnitStateBehavioralTests('FakeWorkUnitStateService', () => new FakeWorkUnitStateService());
