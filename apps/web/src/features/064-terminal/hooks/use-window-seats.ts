'use client';

/**
 * The pij seats behind terminal windows, for the window overview.
 *
 * The terminal overlay renders outside the workspace's SSE provider, so it cannot use
 * `usePijFleet` (its live channel needs that provider). Instead it re-reads the same global
 * `/api/pij/fleet` snapshot while the overview is open, and reads roles and status cards through
 * the pij domain's own contracts, so a seat here renders exactly as it does in the pij rail.
 */

import { useEffect, useState } from 'react';
import type { RailSeatPlacement } from '../../089-first-class-pij/lib/fleet-grouping';
import {
  type SeatStatus,
  newestStatusByPeer,
  readSeatRole,
  resolveSeatStatus,
} from '../../089-first-class-pij/server/pij-status.contract';
import type { FleetSnapshotData, PijSnapshot } from '../../089-first-class-pij/types';

export interface WindowSeat {
  placement: RailSeatPlacement;
  status: SeatStatus;
}

/** Status cards and roles move slowly; this is the overview's refresh while it is open. */
export const WINDOW_SEATS_REFRESH_MS = 5_000;

// Module-level so the effect below does not re-run (and re-fetch) on every render.
const defaultFetch = (url: string) => fetch(url);

export function useWindowSeats(
  open: boolean,
  fetchImpl: (url: string) => Promise<Response> = defaultFetch
): Map<string, WindowSeat> {
  const [seats, setSeats] = useState<Map<string, WindowSeat>>(() => new Map());

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetchImpl('/api/pij/fleet');
        if (!response.ok) return;
        const snapshot = (await response.json()) as PijSnapshot<FleetSnapshotData>;
        if (cancelled) return;
        const statuses = newestStatusByPeer(snapshot.data.statuses ?? []);
        const now = Date.now();
        const next = new Map<string, WindowSeat>();
        for (const row of snapshot.data.rows) {
          const role = readSeatRole({ ...row.extra, ...row });
          next.set(row.id, {
            placement: { id: row.id, row, depth: 0, role },
            status: resolveSeatStatus(role, statuses.get(row.id), now),
          });
        }
        setSeats(next);
      } catch {
        // Keep the last read: seats are decoration on the window list.
      }
    };
    void load();
    const timer = setInterval(() => void load(), WINDOW_SEATS_REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [open, fetchImpl]);

  return seats;
}
