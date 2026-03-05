/**
 * Contract test runner for IWorkUnitStateService.
 *
 * Conformance tests run against both real and fake.
 * Behavioral tests run against fake only (real needs filesystem
 * and CEN injection for full behavior).
 *
 * Plan 059 Phase 2.
 *
 * Test Doc:
 * - Why: Verify IWorkUnitStateService contract parity, persistence, and CEN emission
 * - Contract: IWorkUnitStateService — register, unregister, updateStatus, getUnit, getUnits, getUnitBySourceRef, tidyUp
 * - Usage Notes: Contract factory runs both real (temp dir) and fake; persistence tests seed JSON directly
 * - Quality Contribution: 60+ tests covering conformance, behavioral, persistence, hydration, CEN events
 * - Worked Example: register → updateStatus → persist → hydrate on new instance → verify state
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { FakeWorkUnitStateService } from '@chainglass/shared/fakes';
import { FakeCentralEventNotifier } from '@chainglass/shared/features/027-central-notify-events';
import { describe, expect, it } from 'vitest';
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

// ── Real Implementation: Persistence + Hydration Tests (F007) ──

describe('WorkUnitStateService persistence', () => {
  it('should persist entries to JSON and hydrate on new instance', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wus-persist-'));
    const fakeCEN = new FakeCentralEventNotifier();

    const svc1 = new WorkUnitStateService(tmpDir, fakeCEN);
    svc1.register({
      id: 'agent-1',
      name: 'Test Agent',
      creator: { type: 'agent', label: 'claude-code' },
    });
    svc1.updateStatus('agent-1', { status: 'working', intent: 'Building' });

    // New instance hydrates from JSON (simulates server restart)
    const svc2 = new WorkUnitStateService(tmpDir, new FakeCentralEventNotifier());
    const unit = svc2.getUnit('agent-1');
    expect(unit).toBeDefined();
    expect(unit?.name).toBe('Test Agent');
    expect(unit?.status).toBe('working');
    expect(unit?.intent).toBe('Building');
  });

  it('should tidyUp stale entries on hydration', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wus-tidy-'));
    const dataPath = path.join(tmpDir, '.chainglass', 'data', 'work-unit-state.json');
    fs.mkdirSync(path.dirname(dataPath), { recursive: true });

    const staleDate = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    const seeded = {
      entries: [
        {
          id: 'stale-1',
          name: 'Stale',
          status: 'idle',
          creator: { type: 'agent', label: 'test' },
          registeredAt: staleDate,
          lastActivityAt: staleDate,
        },
        {
          id: 'working-1',
          name: 'Working',
          status: 'working',
          creator: { type: 'agent', label: 'test' },
          registeredAt: staleDate,
          lastActivityAt: staleDate,
        },
      ],
    };
    fs.writeFileSync(dataPath, JSON.stringify(seeded), 'utf-8');

    const svc = new WorkUnitStateService(tmpDir, new FakeCentralEventNotifier());
    expect(svc.getUnit('stale-1')).toBeUndefined();
    expect(svc.getUnit('working-1')).toBeDefined();
  });

  it('should emit CEN events on register/updateStatus/unregister', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wus-cen-'));
    const fakeCEN = new FakeCentralEventNotifier();
    const svc = new WorkUnitStateService(tmpDir, fakeCEN);

    svc.register({ id: 'a1', name: 'Agent', creator: { type: 'agent', label: 'test' } });
    svc.updateStatus('a1', { status: 'working' });
    svc.unregister('a1');

    expect(fakeCEN.emittedEvents).toHaveLength(3);
    expect(fakeCEN.emittedEvents[0].eventType).toBe('registered');
    expect(fakeCEN.emittedEvents[1].eventType).toBe('status-changed');
    expect(fakeCEN.emittedEvents[2].eventType).toBe('removed');
  });
});
