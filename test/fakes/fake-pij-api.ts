/**
 * FakePijApi — a scripted stand-in for the three Phase 1 snapshot routes (Plan 089 Phase 2, T002).
 *
 * The page's hook is the ONLY thing in the browser that talks to `/api/pij/*`, so a fake `fetch` is
 * the whole seam: no server, no MSW, no `vi.mock()` (constitution P4). Two capabilities matter and
 * both are ordering tools, not conveniences:
 *
 *   - **deferred responses** — `deferFleet()` holds the fleet snapshot open so a test can deliver a
 *     `fleet-delta` in the window between subscribe and snapshot-resolve. That window IS the race the
 *     hook exists to survive; without a manual gate it cannot be reproduced deterministically.
 *   - **per-URL scripting** — each route answers independently, so a 400 or 503 on one surface is
 *     rendered as a designed state without knocking the other two out.
 *
 * Query strings are preserved in `calls` verbatim: `?workspace=` carries a PATH, and a test that
 * asserts a slug never reached the wire is asserting the single most expensive mistake in this phase.
 */
import type {
  FleetSnapshotData,
  FlowSnapshotData,
  PijSnapshot,
  TreeSnapshotData,
} from '../../apps/web/src/features/089-first-class-pij/types';

/** The shape the hook is injected with. Narrower than the DOM `fetch`, on purpose. */
export type FetchLike = (url: string) => Promise<Response>;

interface Scripted {
  status: number;
  body: unknown;
}

function jsonResponse(scripted: Scripted): Response {
  return new Response(JSON.stringify(scripted.body), {
    status: scripted.status,
    headers: { 'content-type': 'application/json' },
  });
}

export class FakePijApi {
  /** Every URL the hook asked for, in order, query string included. */
  readonly calls: string[] = [];

  private fleet: Scripted = {
    status: 200,
    body: {
      seq: 0,
      at: '2026-07-26T00:00:00.000Z',
      data: { workspace: null, rows: [], status: null },
    },
  };
  private tree: Scripted = {
    status: 200,
    body: { seq: 0, at: '2026-07-26T00:00:00.000Z', data: { workspace: null, roots: [] } },
  };
  private flow: Scripted = {
    status: 200,
    body: { seq: 0, at: '2026-07-26T00:00:00.000Z', data: { workspace: null, flows: [] } },
  };

  private fleetGate: (() => void) | null = null;

  setFleet(snapshot: PijSnapshot<FleetSnapshotData>): this {
    this.fleet = { status: 200, body: snapshot };
    return this;
  }

  setTree(snapshot: PijSnapshot<TreeSnapshotData>): this {
    this.tree = { status: 200, body: snapshot };
    return this;
  }

  setFlows(snapshot: PijSnapshot<FlowSnapshotData>): this {
    this.flow = { status: 200, body: snapshot };
    return this;
  }

  /** Script an error status for one route — the 400/503 designed states. */
  failWith(route: 'fleet' | 'tree' | 'flow', status: number, body: unknown): this {
    this[route] = { status, body };
    return this;
  }

  /**
   * Hold the NEXT fleet response open. Returns a release function; until it is called the hook is
   * living in exactly the window the subscribe-before-fetch contract is about.
   */
  deferFleet(): () => void {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.fleetGate = () => {
      release();
    };
    this.pendingFleet = gate;
    return () => {
      this.fleetGate?.();
      this.fleetGate = null;
      this.pendingFleet = null;
    };
  }

  private pendingFleet: Promise<void> | null = null;

  /** How many times a given route was fetched — the debounce/refetch assertions read this. */
  countOf(route: 'fleet' | 'tree' | 'flow'): number {
    return this.calls.filter((url) => url.startsWith(`/api/pij/${route}`)).length;
  }

  readonly fetch: FetchLike = async (url: string): Promise<Response> => {
    this.calls.push(url);
    if (url.startsWith('/api/pij/fleet')) {
      if (this.pendingFleet) await this.pendingFleet;
      return jsonResponse(this.fleet);
    }
    if (url.startsWith('/api/pij/tree')) return jsonResponse(this.tree);
    if (url.startsWith('/api/pij/flow')) return jsonResponse(this.flow);
    return new Response('not found', { status: 404 });
  };
}
