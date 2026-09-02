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
    const report = await this.client.state(seats[0].id);
    if (!Array.isArray(report.unsupported)) {
      throw new RsError('wire', 'pij-rs state response omitted unsupported capability provenance');
    }
    const unavailable = report.unsupported.map(({ field }) => field);
    return seats.map((seat) => mapSeat(seat, unavailable));
  }

  state(id: string, _options: PijReadOptions = {}): Promise<PijStateReport> {
    return this.client.state(id);
  }
}

function mapSeat(seat: RsSeat, unavailable: string[]): PijListRow {
  if (typeof seat.folder !== 'string') {
    throw new RsError('wire', `pij-rs seat ${seat.id} omitted folder`);
  }

  const {
    proc,
    semantic_state: semanticState,
    role,
    tombstoned_at: tombstonedAt,
    tombstone_reason: tombstoneReason,
    ...rest
  } = seat;
  const terminal =
    tombstonedAt !== undefined || tombstoneReason !== undefined
      ? { tombstonedAt: tombstonedAt ?? null, tombstoneReason: tombstoneReason ?? null }
      : undefined;

  return {
    ...rest,
    id: seat.id,
    folder: seat.folder,
    pid: proc?.pid ?? null,
    ...(Object.hasOwn(seat, 'semantic_state') ? { semanticState } : {}),
    ...(Object.hasOwn(seat, 'role') ? { orchestrationRole: role } : {}),
    ...(terminal ? { terminal } : {}),
    rsUnavailable: [...unavailable],
  };
}
