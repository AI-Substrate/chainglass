import { groupRailFleet, seatTask } from '@/features/089-first-class-pij/lib/fleet-grouping';
import type { PijTreeNode } from '@/features/089-first-class-pij/server/pij-records.interface';
import {
  type PijRailContractSeams,
  fakeRoleRecordFromTreeDepth,
  productionContractSeams,
} from '@/features/089-first-class-pij/server/pij-status.contract';
import { asPijId } from '@/features/089-first-class-pij/types';
import { describe, expect, it } from 'vitest';
import { fleetRow } from '../../../fixtures/pij/fleet-ui';

const NOW = Date.parse('2026-07-29T00:00:00.000Z');

function tree(): PijTreeNode[] {
  return [
    {
      id: 'pij-prime',
      prime: true,
      children: [
        {
          id: 'pij-pm',
          children: [{ id: 'pij-worker' }],
        },
      ],
    },
  ];
}

describe('rail grouping', () => {
  it('takes nesting from the tree and role labels only from JC-2 projections', () => {
    const grouping = groupRailFleet({
      tree: tree(),
      now: NOW,
      idleFilter: false,
      rows: [
        Object.assign(fleetRow('pij-prime'), { orchestrationRole: 'prime' as const }),
        Object.assign(fleetRow('pij-pm'), { orchestrationRole: 'pm' as const }),
        Object.assign(fleetRow('pij-worker'), { orchestrationRole: 'worker' as const }),
      ],
    });

    expect(grouping.primes[0].lead.role).toEqual({ kind: 'known', role: 'prime' });
    expect(grouping.primes[0].sections[0].lead.role).toEqual({ kind: 'known', role: 'pm' });
    expect(grouping.primes[0].sections[0].members[0].role).toEqual({
      kind: 'known',
      role: 'worker',
    });
    expect(grouping.primes[0].sections[0].members[0].depth).toBe(1);
  });

  it('does not turn tree prime/lead positions into production role labels', () => {
    const grouping = groupRailFleet({
      tree: tree(),
      now: NOW,
      idleFilter: false,
      rows: [fleetRow('pij-prime'), fleetRow('pij-pm'), fleetRow('pij-worker')],
    });

    expect(grouping.primes[0].lead.role).toEqual({
      kind: 'absent',
      reason: 'role-field-absent',
    });
    expect(grouping.primes[0].sections[0].lead.role).toEqual({
      kind: 'absent',
      reason: 'role-field-absent',
    });
  });

  it('passes through the fake-only tree-depth roles when the fake seam stamped them', () => {
    const grouping = groupRailFleet({
      tree: tree(),
      now: NOW,
      idleFilter: false,
      rows: [
        Object.assign(
          fleetRow('pij-prime'),
          fakeRoleRecordFromTreeDepth({ depth: 0, prime: true })
        ),
        Object.assign(fleetRow('pij-pm'), fakeRoleRecordFromTreeDepth({ depth: 1 })),
        Object.assign(fleetRow('pij-worker'), fakeRoleRecordFromTreeDepth({ depth: 2 })),
      ],
    });

    expect(grouping.primes[0].sections[0].lead.role).toEqual({ kind: 'known', role: 'pm' });
  });

  it('runs the real grouping consumer against a swapped role seam', () => {
    const swapped: PijRailContractSeams = {
      ...productionContractSeams,
      role: { read: () => ({ kind: 'known', role: 'worker' }) },
    };
    const grouping = groupRailFleet({
      tree: tree(),
      now: NOW,
      idleFilter: false,
      rows: [fleetRow('pij-prime'), fleetRow('pij-pm'), fleetRow('pij-worker')],
      contracts: swapped,
    });

    expect(grouping.primes[0].lead.role).toEqual({ kind: 'known', role: 'worker' });
    expect(grouping.primes[0].sections[0].lead.role).toEqual({
      kind: 'known',
      role: 'worker',
    });
  });
});

describe('seatTask — which read owns the assignment text', () => {
  it('distinguishes a row that says "no task" from a row that says nothing (s075)', () => {
    /*
    Test Doc:
    - Why: pij s075 clears `currentTask` when an assignment closes. The row is the live
      projection; the tree is a cached snapshot the rail refetches on its own cadence, so a tree
      fallback under a CLEARED row resurrects the discharged task and renders it as current —
      the exact defect s075 removes. But the fallback still has a real job: rows predating the
      field omit it entirely, and a FleetView test pins that shape. The two absences must not be
      collapsed — `null` is an answer, a missing key is a silence.
    - Contract: null → no task, tree not consulted; undefined/absent → tree answers; no row at
      all (tree-only seat) → tree answers.
    - Usage Notes: measured 2026-07-30 — list rows always carry the key (null when empty), tree
      nodes omit it. This is why the ratification asks pij to null rather than omit on close.
    - Quality Contribution: closes the resurrection path without breaking the legacy shape.
    - Worked Example: row {currentTask: null} + node {currentTask: 'old'} → undefined.
    */
    const node: PijTreeNode = { id: 'pij-pm', currentTask: 'closed work from a stale tree read' };

    // Cleared: the row carried the field and it is empty. Definitive.
    expect(
      seatTask({
        id: asPijId('pij-pm'),
        row: { ...fleetRow('pij-pm'), currentTask: null },
        node,
        depth: 1,
      })
    ).toBeUndefined();

    // Not carried: says nothing about the seat, so the tree still answers (legacy shape).
    expect(
      seatTask({
        id: asPijId('pij-pm'),
        row: { ...fleetRow('pij-pm'), currentTask: undefined },
        node,
        depth: 1,
      })
    ).toBe('closed work from a stale tree read');

    // A seat the fleet no longer lists at all still reads from the tree — the fallback's one job.
    expect(seatTask({ id: asPijId('pij-pm'), node, depth: 1 })).toBe(
      'closed work from a stale tree read'
    );
  });
});
