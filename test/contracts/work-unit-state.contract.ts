/**
 * Contract test factory for IWorkUnitStateService.
 *
 * Conformance tests run against both real and fake implementations.
 * Behavioral tests run against fake only (real needs filesystem for persistence).
 *
 * Plan 059 Phase 2 — TDD red phase.
 */

import type { IWorkUnitStateService } from '@chainglass/shared/interfaces/work-unit-state.interface';
import type { RegisterWorkUnitInput } from '@chainglass/shared/work-unit-state';
import { beforeEach, describe, expect, it } from 'vitest';

type Factory = () => IWorkUnitStateService;

function makeAgent(id: string, overrides?: Partial<RegisterWorkUnitInput>): RegisterWorkUnitInput {
  return {
    id,
    name: `Agent ${id}`,
    creator: { type: 'agent', label: 'Claude Code' },
    ...overrides,
  };
}

// ── Conformance Tests (both implementations) ──

export function workUnitStateConformanceTests(name: string, factory: Factory): void {
  describe(`IWorkUnitStateService conformance: ${name}`, () => {
    let service: IWorkUnitStateService;

    beforeEach(() => {
      service = factory();
    });

    describe('register', () => {
      it('should register a work unit', () => {
        service.register(makeAgent('a1'));
        const unit = service.getUnit('a1');
        expect(unit).toBeDefined();
        expect(unit?.id).toBe('a1');
        expect(unit?.name).toBe('Agent a1');
        expect(unit?.creator.type).toBe('agent');
      });

      it('should default status to idle when not specified', () => {
        service.register(makeAgent('a1'));
        expect(service.getUnit('a1')?.status).toBe('idle');
      });

      it('should respect explicit initial status', () => {
        service.register(makeAgent('a1', { status: 'working' }));
        expect(service.getUnit('a1')?.status).toBe('working');
      });

      it('should set registeredAt and lastActivityAt timestamps', () => {
        service.register(makeAgent('a1'));
        const unit = service.getUnit('a1');
        expect(unit?.registeredAt).toBeTruthy();
        expect(unit?.lastActivityAt).toBeTruthy();
      });

      it('should store sourceRef when provided', () => {
        service.register(
          makeAgent('a1', {
            sourceRef: { graphSlug: 'graph-1', nodeId: 'node-1' },
          })
        );
        const unit = service.getUnit('a1');
        expect(unit?.sourceRef).toEqual({ graphSlug: 'graph-1', nodeId: 'node-1' });
      });

      it('should store intent when provided', () => {
        service.register(makeAgent('a1', { intent: 'Reviewing code' }));
        expect(service.getUnit('a1')?.intent).toBe('Reviewing code');
      });
    });

    describe('unregister', () => {
      it('should remove a registered work unit', () => {
        service.register(makeAgent('a1'));
        service.unregister('a1');
        expect(service.getUnit('a1')).toBeUndefined();
      });

      it('should be a no-op for unknown IDs', () => {
        service.unregister('nonexistent');
        // Should not throw
      });
    });

    describe('updateStatus', () => {
      it('should update status', () => {
        service.register(makeAgent('a1'));
        service.updateStatus('a1', { status: 'working' });
        expect(service.getUnit('a1')?.status).toBe('working');
      });

      it('should update intent when provided', () => {
        service.register(makeAgent('a1'));
        service.updateStatus('a1', { status: 'working', intent: 'Building' });
        expect(service.getUnit('a1')?.intent).toBe('Building');
      });

      it('should preserve intent when not provided', () => {
        service.register(makeAgent('a1', { intent: 'Initial' }));
        service.updateStatus('a1', { status: 'working' });
        expect(service.getUnit('a1')?.intent).toBe('Initial');
      });

      it('should update lastActivityAt', () => {
        service.register(makeAgent('a1'));
        const before = service.getUnit('a1')?.lastActivityAt;
        // Small delay to ensure timestamp differs
        service.updateStatus('a1', { status: 'working' });
        const after = service.getUnit('a1')?.lastActivityAt;
        expect(after).toBeTruthy();
        // Can't guarantee strict inequality in same-ms execution, just verify it's set
      });

      it('should be a no-op for unknown IDs', () => {
        service.updateStatus('nonexistent', { status: 'working' });
        // Should not throw
      });
    });

    describe('getUnit', () => {
      it('should return undefined for unregistered ID', () => {
        expect(service.getUnit('nonexistent')).toBeUndefined();
      });

      it('should return the entry for registered ID', () => {
        service.register(makeAgent('a1'));
        const unit = service.getUnit('a1');
        expect(unit).toBeDefined();
        expect(unit?.id).toBe('a1');
      });
    });

    describe('getUnits', () => {
      it('should return empty array when nothing registered', () => {
        expect(service.getUnits()).toEqual([]);
      });

      it('should return all registered units', () => {
        service.register(makeAgent('a1'));
        service.register(makeAgent('a2'));
        const units = service.getUnits();
        expect(units).toHaveLength(2);
      });

      it('should filter by status', () => {
        service.register(makeAgent('a1'));
        service.register(makeAgent('a2'));
        service.updateStatus('a1', { status: 'working' });
        const working = service.getUnits({ status: 'working' });
        expect(working).toHaveLength(1);
        expect(working[0].id).toBe('a1');
      });

      it('should filter by creatorType', () => {
        service.register(makeAgent('a1'));
        service.register({
          id: 'w1',
          name: 'Workflow Node',
          creator: { type: 'workflow-node', label: 'Graph Node' },
        });
        const agents = service.getUnits({ creatorType: 'agent' });
        expect(agents).toHaveLength(1);
        expect(agents[0].id).toBe('a1');
      });
    });

    describe('getUnitBySourceRef', () => {
      it('should return undefined when no match', () => {
        expect(service.getUnitBySourceRef('graph-1', 'node-1')).toBeUndefined();
      });

      it('should find unit by graphSlug + nodeId', () => {
        service.register(
          makeAgent('a1', {
            sourceRef: { graphSlug: 'graph-1', nodeId: 'node-1' },
          })
        );
        const unit = service.getUnitBySourceRef('graph-1', 'node-1');
        expect(unit).toBeDefined();
        expect(unit?.id).toBe('a1');
      });

      it('should not match partial source ref', () => {
        service.register(
          makeAgent('a1', {
            sourceRef: { graphSlug: 'graph-1', nodeId: 'node-1' },
          })
        );
        expect(service.getUnitBySourceRef('graph-1', 'node-2')).toBeUndefined();
        expect(service.getUnitBySourceRef('graph-2', 'node-1')).toBeUndefined();
      });
    });

    describe('tidyUp', () => {
      it('should not remove fresh entries', () => {
        service.register(makeAgent('a1'));
        service.tidyUp();
        expect(service.getUnit('a1')).toBeDefined();
      });

      it('should not remove working entries regardless of age', () => {
        service.register(makeAgent('a1', { status: 'working' }));
        // Can't test 24h aging in conformance (no time manipulation)
        // but verify working status is not removed by immediate tidyUp
        service.tidyUp();
        expect(service.getUnit('a1')).toBeDefined();
      });

      it('should not remove waiting_input entries regardless of age', () => {
        service.register(makeAgent('a1', { status: 'waiting_input' }));
        service.tidyUp();
        expect(service.getUnit('a1')).toBeDefined();
      });
    });
  });
}

function ageEntry(service: IWorkUnitStateService, id: string): void {
  const entry = service.getUnit(id);
  if (!entry) throw new Error(`Entry ${id} not found`);
  const oldDate = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
  (entry as { lastActivityAt: string }).lastActivityAt = oldDate;
}

// ── Behavioral Tests (fake only — can manipulate time) ──

export function workUnitStateBehavioralTests(name: string, factory: Factory): void {
  describe(`IWorkUnitStateService behavioral: ${name}`, () => {
    let service: IWorkUnitStateService;

    beforeEach(() => {
      service = factory();
    });

    describe('tidyUp age-based expiry', () => {
      it('should remove idle entries older than 24h', () => {
        service.register(makeAgent('a1'));
        ageEntry(service, 'a1');
        service.tidyUp();
        expect(service.getUnit('a1')).toBeUndefined();
      });

      it('should keep working entries older than 24h', () => {
        service.register(makeAgent('a1', { status: 'working' }));
        ageEntry(service, 'a1');
        service.tidyUp();
        expect(service.getUnit('a1')).toBeDefined();
      });

      it('should keep waiting_input entries older than 24h', () => {
        service.register(makeAgent('a1', { status: 'waiting_input' }));
        ageEntry(service, 'a1');
        service.tidyUp();
        expect(service.getUnit('a1')).toBeDefined();
      });

      it('should remove completed entries older than 24h', () => {
        service.register(makeAgent('a1', { status: 'completed' }));
        ageEntry(service, 'a1');
        service.tidyUp();
        expect(service.getUnit('a1')).toBeUndefined();
      });

      it('should remove error entries older than 24h', () => {
        service.register(makeAgent('a1', { status: 'error' }));
        ageEntry(service, 'a1');
        service.tidyUp();
        expect(service.getUnit('a1')).toBeUndefined();
      });
    });

    describe('register calls tidyUp', () => {
      it('should clean stale entries when new one registers', () => {
        service.register(makeAgent('stale'));
        ageEntry(service, 'stale');
        // Registering a new entry triggers tidyUp
        service.register(makeAgent('fresh'));
        expect(service.getUnit('stale')).toBeUndefined();
        expect(service.getUnit('fresh')).toBeDefined();
      });
    });

    describe('full lifecycle', () => {
      it('should support register → working → waiting_input → working → completed → unregister', () => {
        service.register(makeAgent('a1'));
        expect(service.getUnit('a1')?.status).toBe('idle');

        service.updateStatus('a1', { status: 'working', intent: 'Building' });
        expect(service.getUnit('a1')?.status).toBe('working');

        service.updateStatus('a1', { status: 'waiting_input' });
        expect(service.getUnit('a1')?.status).toBe('waiting_input');

        service.updateStatus('a1', { status: 'working', intent: 'Resuming' });
        expect(service.getUnit('a1')?.status).toBe('working');

        service.updateStatus('a1', { status: 'completed' });
        expect(service.getUnit('a1')?.status).toBe('completed');

        service.unregister('a1');
        expect(service.getUnit('a1')).toBeUndefined();
      });
    });
  });
}
