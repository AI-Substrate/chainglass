import { FLEET_ROW_FIELDS } from '../join';
import type {
  IPijRecords,
  PijListRow,
  PijReadOptions,
  PijStateReport,
} from '../pij-records.interface';
import { type RsClient, RsError, type RsSeat } from './rs-client';

export type RsPijRecords = Pick<IPijRecords, 'list' | 'state'>;

export function createRsPijRecords(deps: { client: RsClient }): RsPijRecords {
  return new HttpRsPijRecords(deps.client);
}

class HttpRsPijRecords implements RsPijRecords {
  constructor(private readonly client: RsClient) {}

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
