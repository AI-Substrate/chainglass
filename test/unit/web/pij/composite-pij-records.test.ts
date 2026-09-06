import { describe, expect, it } from 'vitest';
import type {
  IPijRecords,
  PijNodeDetail,
  PijStateReport,
  PijTree,
} from '../../../../apps/web/src/features/089-first-class-pij/server/pij-records.interface';
import { createCompositePijRecords } from '../../../../apps/web/src/features/089-first-class-pij/server/rs/composite-pij-records';

interface FakeRecords extends IPijRecords {
  calls: string[];
}

function fakeRecords(source: string): FakeRecords {
  const calls: string[] = [];
  return {
    calls,
    async list() {
      calls.push('list');
      return [{ id: `${source}-list`, folder: '/workspace' }];
    },
    async tree() {
      calls.push('tree');
      return { roots: [{ id: `${source}-tree` }] } as PijTree;
    },
    async nodeShow(id) {
      calls.push(`nodeShow:${id}`);
      return { id: `${source}-${id}` } as PijNodeDetail;
    },
    async state(id) {
      calls.push(`state:${id}`);
      return { source, id } as PijStateReport;
    },
    async raw(args) {
      calls.push(`raw:${args.join(' ')}`);
      return { source, args };
    },
  };
}

describe('createCompositePijRecords', () => {
  it('routes list and state only to rs', async () => {
    const rs = fakeRecords('rs');
    const cli = fakeRecords('cli');
    const records = createCompositePijRecords({ rs, cli });

    await expect(records.list()).resolves.toEqual([{ id: 'rs-list', folder: '/workspace' }]);
    await expect(records.state('pij-seat')).resolves.toEqual({ source: 'rs', id: 'pij-seat' });

    expect(rs.calls).toEqual(['list', 'state:pij-seat']);
    expect(cli.calls).toEqual([]);
  });

  it('routes tree, nodeShow, and raw only to the CLI reader', async () => {
    const rs = fakeRecords('rs');
    const cli = fakeRecords('cli');
    const records = createCompositePijRecords({ rs, cli });

    await expect(records.tree({ global: true })).resolves.toEqual({
      roots: [{ id: 'cli-tree' }],
    });
    await expect(records.nodeShow('pij-seat')).resolves.toEqual({ id: 'cli-pij-seat' });
    await expect(records.raw(['version', '--json'])).resolves.toEqual({
      source: 'cli',
      args: ['version', '--json'],
    });

    expect(cli.calls).toEqual(['tree', 'nodeShow:pij-seat', 'raw:version --json']);
    expect(rs.calls).toEqual([]);
  });
});
