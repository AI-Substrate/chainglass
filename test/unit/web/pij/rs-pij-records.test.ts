import { FakeGitWorktreeResolver } from '@chainglass/workflow';
import { describe, expect, it } from 'vitest';
import {
  FLEET_ROW_FIELDS,
  toFleetRow,
} from '../../../../apps/web/src/features/089-first-class-pij/server/join';
import type { PijListRow } from '../../../../apps/web/src/features/089-first-class-pij/server/pij-records.interface';
import {
  readSeatRole,
  readWatchdogState,
  watchdogSummary,
} from '../../../../apps/web/src/features/089-first-class-pij/server/pij-status.contract';
import type {
  Cursor,
  RsClient,
  RsEvent,
  RsSeat,
  RsStateReport,
} from '../../../../apps/web/src/features/089-first-class-pij/server/rs/rs-client';
import { RsError } from '../../../../apps/web/src/features/089-first-class-pij/server/rs/rs-client';
import { createRsPijRecords } from '../../../../apps/web/src/features/089-first-class-pij/server/rs/rs-pij-records';
import UNSUPPORTED from '../../../../docs/plans/093-pij-rs-reader/assets/inputs/live-unsupported-2026-09-06.json';

class FakeRsClient implements RsClient {
  readonly stateIds: string[] = [];

  constructor(
    private readonly rows: RsSeat[],
    private readonly report: RsStateReport = {
      id: rows[0]?.id ?? 'none',
      unsupported: UNSUPPORTED,
    }
  ) {}

  async seats(): Promise<RsSeat[]> {
    return this.rows;
  }

  async state(id: string): Promise<RsStateReport> {
    this.stateIds.push(id);
    return { ...this.report, id };
  }

  async *events(_from?: Cursor, _signal?: AbortSignal): AsyncIterable<RsEvent> {}
}

function liveSeat(overrides: Partial<RsSeat> = {}): RsSeat {
  return {
    id: 'pij-rs-seat',
    machine: 'local',
    harness: 'omp',
    pane: '%42',
    proc: { pid: 4242, proc_start: 20260902010101 },
    folder: '/workspace',
    state: 'idle',
    semantic_state: null,
    role: null,
    parent: null,
    relay: false,
    ...overrides,
  };
}

describe('createRsPijRecords', () => {
  it('maps every rs seat field and preserves source-unavailable provenance', async () => {
    const client = new FakeRsClient([
      liveSeat({
        id: 'pij-tombstoned',
        tombstoned_at: 3436,
        tombstone_reason: 'process-exited',
        model: 'gpt-6',
        provider: 'github-copilot',
        effort: 'high',
        future_rs_field: { value: 1 },
      }),
    ]);
    const records = createRsPijRecords({ client });

    const [row] = await records.list();

    expect(row).toMatchObject({
      id: 'pij-tombstoned',
      machine: 'local',
      harness: 'omp',
      pane: '%42',
      folder: '/workspace',
      pid: 4242,
      state: 'idle',
      semanticState: null,
      orchestrationRole: null,
      parent: null,
      relay: false,
      terminal: {
        source: 'pij-rs',
        tombstoneCursor: 3436,
        tombstoneReason: 'process-exited',
      },
      future_rs_field: { value: 1 },
      boundModel: 'gpt-6',
      boundProvider: 'github-copilot',
      effort: 'high',
    });
    expect(row).not.toHaveProperty('proc');
    expect(row).not.toHaveProperty('semantic_state');
    expect(row).not.toHaveProperty('role');
    expect(row).not.toHaveProperty('tombstoned_at');
    expect(row).not.toHaveProperty('tombstone_reason');
    expect(row).not.toHaveProperty('model');
    expect(row).not.toHaveProperty('provider');
    expect(row.rsUnavailable).not.toContain('terminal');
    expect(row.rsUnavailable).not.toContain('boundModel');
    expect(row.rsUnavailable).not.toContain('boundProvider');
    expect(toFleetRow(row)).toMatchObject({
      boundModel: 'gpt-6',
      boundProvider: 'github-copilot',
      effort: 'high',
    });
  });

  it('omits unsupported seat fields so existing field-specific absence semantics stay authoritative', async () => {
    const records = createRsPijRecords({ client: new FakeRsClient([liveSeat()]) });

    const [row] = await records.list();

    for (const field of [
      'activity',
      'lastEventAt',
      'liveness',
      'failureReason',
      'bindHealth',
      'degraded',
      'watchdog',
    ]) {
      expect(row).not.toHaveProperty(field);
    }
    const watchdog = readWatchdogState(row as PijListRow);
    expect(watchdog).toEqual({ reason: 'unreported', willNudge: false });
    expect(watchdogSummary(watchdog)).toBe('watchdog not reported');
    expect(readSeatRole(row as PijListRow)).toEqual({ kind: 'absent', reason: 'role-unknown' });
  });

  it('reads unsupported provenance once per global list, never once per seat', async () => {
    const client = new FakeRsClient([
      liveSeat({ id: 'pij-one' }),
      liveSeat({ id: 'pij-two' }),
      liveSeat({ id: 'pij-three' }),
    ]);
    const records = createRsPijRecords({ client });

    const rows = await records.list();

    expect(rows).toHaveLength(3);
    expect(client.stateIds).toEqual(['pij-one']);
    expect(rows[0].rsUnavailable).toEqual(rows[1].rsUnavailable);
    expect(rows[1].rsUnavailable).toEqual(rows[2].rsUnavailable);
  });

  it('does not request state provenance when the fleet is empty', async () => {
    const client = new FakeRsClient([]);
    const records = createRsPijRecords({ client });

    await expect(records.list()).resolves.toEqual([]);
    expect(client.stateIds).toEqual([]);
  });

  it('delegates state by id without changing the live report', async () => {
    const report: RsStateReport = {
      id: 'pij-seat',
      state: 'working',
      liveness: 'active',
      unsupported: UNSUPPORTED,
    };
    const client = new FakeRsClient([liveSeat()], report);
    const records = createRsPijRecords({ client });

    await expect(records.state('pij-seat')).resolves.toEqual(report);
    expect(client.stateIds).toEqual(['pij-seat']);
  });
  it('partitions every consumer field into a carried fact or an unavailable field, never both', async () => {
    const records = createRsPijRecords({
      client: new FakeRsClient([
        liveSeat(),
        liveSeat({ model: 'gpt-6', provider: null, tombstoned_at: 3436, tombstone_reason: null }),
      ]),
    });
    for (const row of await records.list()) {
      const unavailable = new Set(row.rsUnavailable as string[]);
      expect(unavailable.has('liveness:stale')).toBe(false);
      expect(unavailable.has('liveness')).toBe(true);
      expect(unavailable.has('prime')).toBe(true);
      expect(unavailable.has('unadopted')).toBe(true);
      for (const field of FLEET_ROW_FIELDS) {
        const carried = Object.hasOwn(row, field) && row[field] !== undefined;
        expect(unavailable.has(field), field).toBe(!carried);
      }
      for (const field of unavailable) {
        expect(row[field], field).toBeUndefined();
      }
    }
  });
  it('keeps the roster when the provenance seat vanishes between HTTP reads', async () => {
    const client = new FakeRsClient([liveSeat()]);
    client.state = async () => {
      throw new RsError('not_found', 'seat disappeared');
    };
    const [row] = await createRsPijRecords({ client }).list();
    expect(row.id).toBe('pij-rs-seat');
    expect(row.rsUnavailable).toContain('liveness');
    expect(row.rsUnavailable).toContain('bindHealth');
  });
  it('builds the parent forest from rs identities even when every role is null', async () => {
    const client = new FakeRsClient([
      liveSeat({ id: 'rs-child', parent: 'rs-lead' }),
      liveSeat({ id: 'rs-grandchild', parent: 'rs-child' }),
      liveSeat({ id: 'rs-lead' }),
      liveSeat({ id: 'rs-orphan', parent: 'legacy-unknown-parent' }),
    ]);
    const forest = await createRsPijRecords({ client }).tree({ global: true });
    expect(forest).toMatchObject({
      structureSource: 'rs-parent-links',
      rolesUnavailable: true,
      roots: [
        {
          id: 'rs-lead',
          orchestrationRole: null,
          children: [{ id: 'rs-child', children: [{ id: 'rs-grandchild' }] }],
        },
        { id: 'rs-orphan', parent: 'legacy-unknown-parent', children: [] },
      ],
    });
    expect(forest.roots[0]).not.toHaveProperty('prime');
    expect(forest.structureWarnings).toBeUndefined();
    expect(client.stateIds).toEqual([]);
  });

  it('scopes to actual git worktree roots without claiming foreign ancestors or prefix siblings', async () => {
    const worktrees = new FakeGitWorktreeResolver();
    worktrees.setWorktrees(
      '/workspace',
      ['/workspace', '/sibling-feature'].map((path) => ({
        path,
        head: 'abc',
        branch: 'main',
        isDetached: false,
        isBare: false,
        isPrunable: false,
      }))
    );
    const client = new FakeRsClient([
      liveSeat({ id: 'rs-child', parent: 'rs-prime', folder: '/sibling-feature/src' }),
      liveSeat({ id: 'rs-prime', role: 'prime' }),
      liveSeat({ id: 'legacy-prefix-sibling', folder: '/workspace-other' }),
      liveSeat({ id: 'rs-foreign-parent', folder: '/foreign' }),
      liveSeat({ id: 'rs-local-orphan', parent: 'rs-foreign-parent' }),
    ]);
    const forest = await createRsPijRecords({ client, worktrees }).tree({ cwd: '/workspace' });
    expect(forest.roots.map((node) => node.id)).toEqual(['rs-prime', 'rs-local-orphan']);
    expect(forest.roots[0]).toMatchObject({
      prime: true,
      orchestrationRole: 'prime',
      children: [{ id: 'rs-child' }],
    });
    expect(forest.rolesUnavailable).toBe(false);
    expect(worktrees.detectWorktreesCalls).toEqual([{ repoPath: '/workspace' }]);
  });

  it('preserves explicit tombstones for all scope without inferring death from idle', async () => {
    const records = createRsPijRecords({
      client: new FakeRsClient([
        liveSeat({ id: 'rs-idle', state: 'idle' }),
        liveSeat({ id: 'rs-tombstone', tombstoned_at: 42 }),
      ]),
    });
    expect((await records.tree({ global: true })).roots.map((node) => node.id)).toEqual([
      'rs-idle',
    ]);
    expect((await records.tree({ global: true, all: true })).roots.map((node) => node.id)).toEqual([
      'rs-idle',
      'rs-tombstone',
    ]);
  });

  it.each([
    { name: 'self-cycle', cycle: [{ id: 'rs-a', parent: 'rs-a' }] },
    {
      name: 'multi-node cycle',
      cycle: [
        { id: 'rs-a', parent: 'rs-b' },
        { id: 'rs-b', parent: 'rs-a' },
      ],
    },
  ])(
    'promotes only $name members while preserving descendants and healthy trees',
    async ({ cycle }) => {
      const records = createRsPijRecords({
        client: new FakeRsClient([
          // Starting below the cycle catches incorrectly promoting the whole traversal path.
          liveSeat({ id: 'rs-child', parent: 'rs-a' }),
          ...cycle.map((seat) => liveSeat(seat)),
          liveSeat({ id: 'rs-healthy-child', parent: 'rs-lead' }),
          liveSeat({ id: 'rs-lead', role: 'prime' }),
        ]),
      });
      const forest = await records.tree({ global: true });
      expect(forest.roots.map((node) => node.id).sort()).toEqual([
        ...cycle.map((seat) => seat.id),
        'rs-lead',
      ]);
      for (const member of cycle) {
        expect(forest.roots.find((node) => node.id === member.id)).toMatchObject({
          ...member,
          orchestrationRole: null,
          children:
            member.id === 'rs-a'
              ? [{ id: 'rs-child', parent: 'rs-a', orchestrationRole: null, children: [] }]
              : [],
        });
      }
      expect(forest.roots.find((node) => node.id === 'rs-lead')).toMatchObject({
        prime: true,
        orchestrationRole: 'prime',
        children: [{ id: 'rs-healthy-child', parent: 'rs-lead', children: [] }],
      });
      const renderedIds = forest.roots.flatMap((node) => [
        node.id,
        ...(node.children ?? []).map((child) => child.id),
      ]);
      expect(new Set(renderedIds).size).toBe(cycle.length + 3);
      expect(renderedIds).toHaveLength(cycle.length + 3);
      expect(forest.structureWarnings).toEqual([
        `Parent cycle (${cycle.map((seat) => seat.id).join(', ')}): displayed each member as a root; source parents unchanged.`,
      ]);
      expect(await records.tree({ global: true })).toEqual(forest);
    }
  );

  it('still finds every cycle member when one ID is also duplicated', async () => {
    const records = createRsPijRecords({
      client: new FakeRsClient([
        liveSeat({ id: 'rs-child', parent: 'rs-a' }),
        liveSeat({ id: 'rs-a', parent: 'rs-b' }),
        liveSeat({ id: 'rs-a', parent: null }),
        liveSeat({ id: 'rs-b', parent: 'rs-a' }),
      ]),
    });
    const forest = await records.tree({ global: true });
    expect(forest.roots).toMatchObject([
      { id: 'rs-b', parent: 'rs-a', children: [] },
      {
        id: 'rs-a',
        parent: 'rs-b',
        children: [{ id: 'rs-child', parent: 'rs-a', children: [] }],
      },
    ]);
    expect(forest.structureWarnings).toHaveLength(2);
    expect(forest.structureWarnings?.[0]).toContain('Duplicate seat ID rs-a');
    expect(forest.structureWarnings?.[1]).toContain('Parent cycle (rs-a, rs-b)');
  });

  it('promotes duplicate IDs once, keeping the first descriptor and unaffected links', async () => {
    const first = liveSeat({ id: 'rs-duplicate', parent: 'rs-lead', role: 'worker' });
    const records = createRsPijRecords({
      client: new FakeRsClient([
        liveSeat({ id: 'rs-child', parent: first.id }),
        first,
        liveSeat({ id: 'rs-lead', role: 'prime' }),
        liveSeat({
          id: first.id,
          parent: 'rs-child',
          role: 'prime',
          folder: '/other',
          harness: 'claude',
        }),
        liveSeat({ id: first.id, parent: null }),
        liveSeat({ id: 'rs-healthy-child', parent: 'rs-lead' }),
      ]),
    });
    const forest = await records.tree({ global: true });
    expect(forest.roots).toMatchObject([
      {
        id: 'rs-lead',
        prime: true,
        children: [{ id: 'rs-healthy-child', parent: 'rs-lead', children: [] }],
      },
      {
        id: first.id,
        parent: first.parent,
        folder: first.folder,
        harness: first.harness,
        orchestrationRole: first.role,
        children: [{ id: 'rs-child', parent: first.id, children: [] }],
      },
    ]);
    expect(forest.roots[1]).not.toHaveProperty('prime');
    expect(forest.structureWarnings).toEqual([
      `Duplicate seat ID ${first.id}: kept the first descriptor and displayed it as a root; source parent unchanged.`,
    ]);
    expect(first.parent).toBe('rs-lead');
  });

  it('returns fresh rs focus identity without inventing liveness or a window', async () => {
    const records = createRsPijRecords({
      client: new FakeRsClient([liveSeat({ id: 'rs-focus' })]),
    });
    const detail = await records.nodeShow('rs-focus');
    expect(detail).toMatchObject({
      id: 'rs-focus',
      source: 'pij-rs',
      cwd: '/workspace',
      paneId: '%42',
      proc: { pid: 4242, proc_start: 20260902010101 },
    });
    expect(detail).not.toHaveProperty('liveness');
    expect(detail).not.toHaveProperty('windowId');
    await expect(records.nodeShow('legacy-seat')).rejects.toMatchObject({ code: 'not_found' });
  });
});
