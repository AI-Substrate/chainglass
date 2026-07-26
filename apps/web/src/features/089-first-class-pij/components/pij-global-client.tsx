/**
 * The global pij page's client shell — Plan 089 Phase 4 (T005).
 *
 * **Snapshot-only, by design, and said out loud.** `MultiplexedSSEProvider` is mounted in the
 * workspace layout only (`workspaces/[slug]/layout.tsx`), and this page lives outside it. There is
 * therefore no `pij` channel here and no live update — so instead of pretending, the page states when
 * it was read, ages that statement as you look at it, and gives you a button to read again.
 *
 * A page that silently went stale would be the exact failure this plan is written against: it would
 * keep showing a fleet that no longer exists, with no way to tell. Staleness gets its own
 * `data-reason` once the snapshot passes the age where "as of" stops being reassuring.
 *
 * The two reads are independent (`/api/pij/fleet` with no scope, `/api/pij/tree?global=1`) and a
 * failure in either is rendered rather than thrown — one broken surface must not blank the other.
 */
'use client';

import { useCallback, useEffect, useState } from 'react';
import type { PijTreeNode } from '../server/pij-records.interface';
import type {
  FleetRow,
  FleetSnapshotData,
  PijSnapshot,
  PollerStatus,
  TreeSnapshotData,
} from '../types';
import { GlobalTree } from './global-tree';

/** Past this age the snapshot stops being "current" and the page says so. */
export const STALE_AFTER_MS = 60_000;

export interface PijGlobalClientProps {
  /** Test seam, mirroring `PijPageClient`'s. Production uses the global `fetch`. */
  fetchImpl?: typeof fetch;
  /** Injected in tests so relative times are deterministic. */
  nowImpl?: () => number;
}

interface GlobalState {
  rows: FleetRow[];
  roots: PijTreeNode[];
  status: PollerStatus | null;
  /** When the SERVER built the snapshot, not when we rendered it. */
  at: string | null;
  errors: { fleet: string | null; tree: string | null };
  loading: boolean;
}

const EMPTY: GlobalState = {
  rows: [],
  roots: [],
  status: null,
  at: null,
  errors: { fleet: null, tree: null },
  loading: true,
};

/** Turn a non-200 into the sentence the page shows. pij's own code, verbatim, when there is one. */
async function readError(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as {
    error?: string;
    code?: string;
  } | null;
  if (body?.code) return `${body.code}: ${body.error ?? 'read failed'}`;
  return body?.error ?? `read failed (HTTP ${response.status})`;
}

export function PijGlobalClient({ fetchImpl, nowImpl }: PijGlobalClientProps) {
  const [state, setState] = useState<GlobalState>(EMPTY);
  const [now, setNow] = useState(() => (nowImpl ?? Date.now)());

  const load = useCallback(async () => {
    const doFetch = fetchImpl ?? fetch;
    setState((prev) => ({ ...prev, loading: true }));

    // Both reads are issued together and settled independently: one failing surface must not blank
    // the other, because "the tree could not be read" and "there are no seats" are different pages.
    const [fleet, tree] = await Promise.all([
      doFetch('/api/pij/fleet').catch((error: Error) => error),
      doFetch('/api/pij/tree?global=1').catch((error: Error) => error),
    ]);

    const next: GlobalState = {
      rows: [],
      roots: [],
      status: null,
      at: null,
      errors: { fleet: null, tree: null },
      loading: false,
    };

    if (fleet instanceof Error) {
      next.errors.fleet = fleet.message;
    } else if (!fleet.ok) {
      next.errors.fleet = await readError(fleet);
    } else {
      const body = (await fleet.json()) as PijSnapshot<FleetSnapshotData>;
      next.rows = body.data.rows;
      next.status = body.data.status;
      next.at = body.at;
    }

    if (tree instanceof Error) {
      next.errors.tree = tree.message;
    } else if (!tree.ok) {
      next.errors.tree = await readError(tree);
    } else {
      const body = (await tree.json()) as PijSnapshot<TreeSnapshotData>;
      next.roots = body.data.roots;
      next.at = next.at ?? body.at;
    }

    setState(next);
    setNow((nowImpl ?? Date.now)());
  }, [fetchImpl, nowImpl]);

  useEffect(() => {
    void load();
  }, [load]);

  // Ages the "as of" statement. It moves the CLOCK, never the data — this page does not poll, and a
  // ticking timestamp over silently-refetched data would be the dishonesty in a different costume.
  useEffect(() => {
    const timer = setInterval(() => setNow((nowImpl ?? Date.now)()), 5_000);
    return () => clearInterval(timer);
  }, [nowImpl]);

  const ageMs = state.at ? now - Date.parse(state.at) : 0;
  const stale = state.at !== null && ageMs > STALE_AFTER_MS;

  return (
    <div className="p-6" data-testid="pij-global-page">
      <div className="mb-4 flex flex-wrap items-baseline gap-3">
        <h1 className="text-base font-semibold">pij fleet · all workspaces</h1>
        <span
          className="text-xs text-muted-foreground"
          data-testid="global-as-of"
          data-reason={stale ? 'snapshot-stale' : 'snapshot-current'}
        >
          {state.at
            ? `snapshot as of ${formatAge(ageMs)} — this page does not update itself`
            : 'no snapshot read yet'}
        </span>
        <button
          type="button"
          data-testid="global-refresh"
          onClick={() => void load()}
          disabled={state.loading}
          className="rounded border border-border px-2 py-0.5 text-xs text-muted-foreground hover:bg-accent disabled:opacity-50"
        >
          {state.loading ? 'reading…' : 'read again'}
        </button>
      </div>

      {stale ? (
        <div
          data-testid="global-stale-banner"
          data-reason="snapshot-stale"
          className="mb-3 rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300"
        >
          This snapshot is {formatAge(ageMs)} old. There is no live channel on this page by design —
          the pij channel is subscribed inside a workspace, not machine-wide. Read again for current
          state.
        </div>
      ) : null}

      <GlobalTree
        roots={state.roots}
        rows={state.rows}
        status={state.status}
        now={now}
        errors={state.errors}
      />
    </div>
  );
}

/** Coarse on purpose: this is an age, and second-precision would imply a liveness it does not have. */
function formatAge(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.round(minutes / 60)}h`;
}
