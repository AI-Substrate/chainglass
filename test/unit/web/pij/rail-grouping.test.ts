import { groupRailFleet } from '@/features/089-first-class-pij/lib/fleet-grouping';
import type { PijTreeNode } from '@/features/089-first-class-pij/server/pij-records.interface';
import {
  type PijRailContractSeams,
  fakeRoleRecordFromTreeDepth,
  productionContractSeams,
} from '@/features/089-first-class-pij/server/pij-status.contract';
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
