import type { IGitWorktreeResolver } from '@chainglass/workflow';
import { FLEET_ROW_FIELDS, isFolderInWorkspace } from '../join';
import type {
  IPijRecords,
  PijListRow,
  PijNodeDetail,
  PijReadOptions,
  PijStateReport,
  PijTree,
  PijTreeNode,
  PijTreeScope,
} from '../pij-records.interface';
import { type RsClient, RsError, type RsSeat } from './rs-client';

export type RsPijRecords = Pick<IPijRecords, 'list' | 'state' | 'tree' | 'nodeShow'>;

export function createRsPijRecords(deps: {
  client: RsClient;
  worktrees?: Pick<IGitWorktreeResolver, 'detectWorktrees'>;
}): RsPijRecords {
  return new HttpRsPijRecords(deps.client, deps.worktrees);
}

class HttpRsPijRecords implements RsPijRecords {
  constructor(
    private readonly client: RsClient,
    private readonly worktrees?: Pick<IGitWorktreeResolver, 'detectWorktrees'>
  ) {}

  async list(_options: PijReadOptions = {}): Promise<PijListRow[]> {
    const seats = await this.client.seats();
    if (seats.length === 0) return [];

    // `unsupported` describes source-wide capability, not one seat. Read it once and attach the
    // same provenance to every row; one request per seat would recreate the fan-out this adapter
    // exists to remove.
    let unavailable: string[] = [];
    try {
      const report = await this.client.state(seats[0].id);
      if (!Array.isArray(report.unsupported)) {
        throw new RsError(
          'wire',
          'pij-rs state response omitted unsupported capability provenance'
        );
      }
      unavailable = report.unsupported.map(({ field }) => field);
    } catch (error) {
      // The provenance seat may disappear between reads; never sacrifice the whole roster for it.
      if (!(error instanceof RsError) || error.code !== 'not_found') throw error;
    }
    return seats.map((seat) => mapSeat(seat, unavailable));
  }

  state(id: string, _options: PijReadOptions = {}): Promise<PijStateReport> {
    return this.client.state(id);
  }

  async tree(scope: PijTreeScope): Promise<PijTree> {
    const seats = await this.client.seats();
    let roots: string[] | undefined;
    if ('cwd' in scope) {
      if (!this.worktrees)
        throw new RsError(
          'workspace_scope',
          'rs tree requires the worktree resolver for repository-family scoping'
        );
      roots = [
        scope.cwd,
        ...(await this.worktrees.detectWorktrees(scope.cwd)).map((tree) => tree.path),
      ];
    }
    const scoped = seats.filter(
      (seat) =>
        (scope.all || seat.tombstoned_at == null) &&
        (!roots ||
          roots.some(
            (root) => typeof seat.folder === 'string' && isFolderInWorkspace(seat.folder, root)
          ))
    );
    return {
      roots: parentForest(scoped),
      source: 'pij-rs',
      structureSource: 'rs-parent-links',
      rolesUnavailable: scoped.every((seat) => seat.role == null),
    };
  }

  async nodeShow(id: string, _options: PijReadOptions = {}): Promise<PijNodeDetail> {
    const seat = (await this.client.seats()).find((candidate) => candidate.id === id);
    if (!seat) throw new RsError('not_found', `No rs seat ${id}`);
    return {
      id: seat.id,
      source: 'pij-rs',
      cwd: seat.folder,
      harness: seat.harness,
      parent: seat.parent,
      systemState: seat.state,
      semanticState: seat.semantic_state,
      paneId: seat.pane,
      proc:
        typeof seat.proc?.pid === 'number' && typeof seat.proc.proc_start === 'number'
          ? { pid: seat.proc.pid, proc_start: seat.proc.proc_start }
          : null,
      boundModel: seat.model,
      boundProvider: seat.provider,
      effort: seat.effort,
      ...(Object.hasOwn(seat, 'role') ? { orchestrationRole: seat.role } : {}),
    };
  }
}

/** Shape explicit parent links only; neither position nor a seat name confers a role. */
function parentForest(seats: RsSeat[]): PijTreeNode[] {
  const byId = new Map(seats.map((seat) => [seat.id, seat]));
  if (byId.size !== seats.length)
    throw new RsError('wire', 'rs roster contains duplicate seat ids');
  const nodes = new Map<string, PijTreeNode>(
    seats.map((seat) => [
      seat.id,
      {
        id: seat.id,
        folder: seat.folder,
        harness: seat.harness,
        parent: seat.parent,
        children: [],
        ...(Object.hasOwn(seat, 'role') ? { orchestrationRole: seat.role } : {}),
        ...(seat.role === 'prime' ? { prime: true } : {}),
      },
    ])
  );
  const roots: PijTreeNode[] = [];
  const attached = new Set<string>();
  const visiting = new Set<string>();
  const attach = (id: string): void => {
    if (attached.has(id)) return;
    if (visiting.has(id)) throw new RsError('wire', `rs parent cycle includes ${id}`);
    const seat = byId.get(id);
    const node = nodes.get(id);
    if (!seat || !node) return;
    visiting.add(id);
    const parent = seat.parent ? nodes.get(seat.parent) : undefined;
    if (parent) {
      attach(parent.id);
      parent.children?.push(node);
    } else {
      roots.push(node);
    }
    visiting.delete(id);
    attached.add(id);
  };
  for (const id of nodes.keys()) attach(id);
  return roots;
}

interface RsTerminal {
  source: 'pij-rs';
  tombstoneCursor: number | null;
  tombstoneReason: string | null;
}

function mapSeat(seat: RsSeat, unavailable: string[]): PijListRow & { terminal?: RsTerminal } {
  if (typeof seat.folder !== 'string') {
    throw new RsError('wire', `pij-rs seat ${seat.id} omitted folder`);
  }

  const {
    proc,
    semantic_state: semanticState,
    role,
    model,
    provider,
    tombstoned_at: tombstoneCursor,
    tombstone_reason: tombstoneReason,
    ...rest
  } = seat;
  const terminal: RsTerminal | undefined =
    tombstoneCursor !== undefined || tombstoneReason !== undefined
      ? {
          source: 'pij-rs',
          tombstoneCursor: tombstoneCursor ?? null,
          tombstoneReason: tombstoneReason ?? null,
        }
      : undefined;

  const row: PijListRow & { terminal?: RsTerminal } = {
    ...rest,
    id: seat.id,
    folder: seat.folder,
    pid: proc?.pid ?? null,
    ...(Object.hasOwn(seat, 'semantic_state') ? { semanticState } : {}),
    ...(Object.hasOwn(seat, 'role') ? { orchestrationRole: role } : {}),
    ...(Object.hasOwn(seat, 'model') ? { boundModel: model } : {}),
    ...(Object.hasOwn(seat, 'provider') ? { boundProvider: provider } : {}),
    ...(terminal ? { terminal } : {}),
  };
  // Source capability and emitted-row capability differ: subtract mapped facts, add consumer gaps.
  const missing = new Set(
    unavailable.map((field) => (field === 'liveness:stale' ? 'liveness' : field))
  );
  for (const field of FLEET_ROW_FIELDS) missing.add(field);
  for (const [field, value] of Object.entries(row)) {
    if (value !== undefined) missing.delete(field);
  }
  row.rsUnavailable = [...missing];
  return row;
}
