'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useChannelEvents } from '../../../lib/sse/use-channel-events';
import {
  type PijRailContractSeams,
  type SeatRole,
  type SeatStatus,
  productionContractSeams,
} from '../server/pij-status.contract';
import { PIJ_CHANNEL, type PijChannelEvent, type PijId, type PijStatusRecord } from '../types';

const STATUS_CHANNEL_RETENTION = 1_000;

type PijChannelMessage = PijChannelEvent & { channel?: string };

export interface UsePijStatusOptions {
  snapshot: readonly PijStatusRecord[];
  now?: () => number;
  contracts?: PijRailContractSeams;
}

export interface UsePijStatusResult {
  statuses: Map<string, PijStatusRecord>;
  resolve: (peer: PijId, role: SeatRole) => SeatStatus;
}

function sameStatuses(
  left: ReadonlyMap<string, PijStatusRecord>,
  right: ReadonlyMap<string, PijStatusRecord>
): boolean {
  if (left.size !== right.size) return false;
  for (const [peer, record] of left) {
    const candidate = right.get(peer);
    if (
      !candidate ||
      candidate.peer !== record.peer ||
      candidate.prev !== record.prev ||
      candidate.next !== record.next ||
      candidate.ts !== record.ts ||
      candidate.seq !== record.seq ||
      candidate.project !== record.project
    ) {
      return false;
    }
  }
  return true;
}

export function usePijStatus(options: UsePijStatusOptions): UsePijStatusResult {
  const now = options.now ?? Date.now;
  const contracts = options.contracts ?? productionContractSeams;
  const [statuses, setStatuses] = useState(() => contracts.status.newestByPeer(options.snapshot));
  const { messages, receivedCount } = useChannelEvents<PijChannelMessage>(PIJ_CHANNEL, {
    maxMessages: STATUS_CHANNEL_RETENTION,
  });
  const appliedCountRef = useRef(0);

  useEffect(() => {
    setStatuses((previous) => {
      const next = contracts.status.newestByPeer([...previous.values(), ...options.snapshot]);
      return sameStatuses(previous, next) ? previous : next;
    });
  }, [contracts, options.snapshot]);

  useEffect(() => {
    const pendingCount = receivedCount - appliedCountRef.current;
    if (pendingCount <= 0) return;
    const available = Math.min(pendingCount, messages.length);
    const pending = messages.slice(messages.length - available);
    appliedCountRef.current = receivedCount;

    const deltas = pending.filter(
      (message): message is Extract<PijChannelEvent, { type: 'status-delta' }> =>
        message.type === 'status-delta'
    );
    if (deltas.length === 0) return;

    setStatuses((previous) => {
      const records = [...previous.values(), ...deltas.flatMap((delta) => delta.statuses)];
      return contracts.status.newestByPeer(records);
    });
  }, [contracts, messages, receivedCount]);

  const resolve = useCallback(
    (peer: PijId, role: SeatRole) => contracts.status.resolve(role, statuses.get(peer), now()),
    [contracts, statuses, now]
  );

  return { statuses, resolve };
}
