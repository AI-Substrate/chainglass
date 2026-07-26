/**
 * Fleet-page UI fixtures — Plan 089 Phase 2.
 *
 * One synthetic workspace shaped like the real forest the POC was ratified against: a prime that
 * governs two sections (a PM with workers, and a standalone worker), plus a root outside any prime.
 * Every hazard the view has to survive is represented deliberately:
 *
 *   - a seat in a SIBLING directory with a shared prefix (`…/chainglass-worktree`) — the containment
 *     hazard that a `startsWith` filter gets wrong
 *   - a row present in the fleet but ABSENT from the tree snapshot — the placement-of-unknown-rows rule
 *   - a row whose `lastEventAt` is null — shown, never hidden by the idle filter
 *   - a row long past the idle window — hidden by the filter
 *   - a row with `badge` absent and `contextCurrent.value === 'unknown'` — absences that must render
 *     as absences rather than as zeroes
 *
 * These are plain objects, not files: nothing here is written anywhere, least of all under `~/.pij`.
 */
import type { PijTreeNode } from '../../../apps/web/src/features/089-first-class-pij/server/pij-records.interface';
import type {
  FleetRow,
  PollerStatus,
} from '../../../apps/web/src/features/089-first-class-pij/types';
import { asPijId } from '../../../apps/web/src/features/089-first-class-pij/types';

/** The workspace the UI fixtures are scoped to. An absolute PATH — never a slug. */
export const UI_WORKSPACE_PATH = '/Users/fixture/substrate/chainglass';

/** A sibling repo sharing the workspace's prefix. `startsWith` says "inside"; it is not. */
export const UI_SIBLING_PATH = '/Users/fixture/substrate/chainglass-worktree';

/** A wholly unrelated workspace — the foreign-delta source. */
export const UI_FOREIGN_PATH = '/Users/fixture/osk/osk-split-billing';

/** "Now" for every relative-time assertion. Fixtures are dated against this, never against wall time. */
export const UI_NOW = '2026-07-26T12:00:00.000Z';

/** Minutes before {@link UI_NOW}, as an ISO string. */
export function minutesAgo(minutes: number): string {
  return new Date(Date.parse(UI_NOW) - minutes * 60_000).toISOString();
}

/** Hours before {@link UI_NOW}, as an ISO string. */
export function hoursAgo(hours: number): string {
  return minutesAgo(hours * 60);
}

export function fleetRow(id: string, overrides: Partial<FleetRow> = {}): FleetRow {
  return {
    id: asPijId(id),
    folder: UI_WORKSPACE_PATH,
    state: 'idle',
    activity: 'idle',
    liveness: 'active',
    lastEventAt: minutesAgo(3),
    harness: 'claude',
    boundModel: null,
    boundProvider: null,
    effort: null,
    prime: false,
    unadopted: false,
    extra: {},
    ...overrides,
  };
}

/** The prime that governs the workspace. */
export const UI_PRIME_ID = 'pij-prime-owl';
/** A PM: a child of the prime that itself has children. */
export const UI_PM_ID = 'pij-pm-cheetah';
/** Workers under the PM. */
export const UI_WORKER_IDS = ['pij-worker-nigel', 'pij-worker-vole'] as const;
/** A child of the prime with no children of its own — a standalone worker section. */
export const UI_SOLO_ID = 'pij-solo-mongoose';
/** A root that is not a prime — renders under "Outside any prime". */
export const UI_LOOSE_ID = 'pij-loose-heron';
/** In the fleet, absent from the tree — must still render, never vanish. */
export const UI_UNPLACED_ID = 'pij-unplaced-quokka';
/** Inside the sibling repo: a containment hazard, not a member of this workspace. */
export const UI_SIBLING_ID = 'pij-sibling-lark';
/** Last heard from long before the idle window. */
export const UI_STALE_ID = 'pij-stale-tortoise';
/** No `lastEventAt` at all — shown, because absence is not evidence of idleness. */
export const UI_NO_EVENT_ID = 'pij-silent-crane';

/**
 * The repo-scoped forest. Extra fields the real CLI emits (`pid`, `paneId`, `dataDir`,
 * `effectiveParentId`) are present on purpose: the tree renderer must tolerate them AND never put the
 * first three in the DOM (C-03).
 */
export const UI_TREE_ROOTS: PijTreeNode[] = [
  {
    id: UI_PRIME_ID,
    folder: UI_WORKSPACE_PATH,
    harness: 'claude',
    prime: true,
    pid: 4242,
    paneId: '%1881',
    dataDir: '/Users/fixture/.pij/pij-prime-owl',
    children: [
      {
        id: UI_PM_ID,
        folder: UI_WORKSPACE_PATH,
        harness: 'claude',
        effectiveParentId: UI_PRIME_ID,
        pid: 4243,
        paneId: '%1882',
        children: [
          { id: UI_WORKER_IDS[0], folder: UI_WORKSPACE_PATH, harness: 'claude', pid: 4244 },
          { id: UI_WORKER_IDS[1], folder: UI_WORKSPACE_PATH, harness: 'codex', pid: 4245 },
        ],
      },
      { id: UI_SOLO_ID, folder: UI_WORKSPACE_PATH, harness: 'claude', pid: 4246 },
    ],
  },
  {
    id: UI_LOOSE_ID,
    folder: UI_WORKSPACE_PATH,
    harness: 'pi',
    unadopted: true,
    pid: 4247,
    paneId: '%1889',
  },
];

/** Fleet rows matching {@link UI_TREE_ROOTS}, plus the rows that exercise placement and filtering. */
export const UI_FLEET_ROWS: FleetRow[] = [
  fleetRow(UI_PRIME_ID, { prime: true, state: 'working', lastEventAt: minutesAgo(1) }),
  fleetRow(UI_PM_ID, {
    state: 'working',
    badge: 'waiting',
    currentAssignment: 'asg-yelping-boar',
    currentTask: 'PM the first-class pij UI stream',
    boundModel: 'claude-opus-5',
    effort: 'high',
    contextMax: 1_000_000,
    contextCurrent: { value: 'unknown', asOf: minutesAgo(2), provenance: 'claude-transcript' },
  }),
  fleetRow(UI_WORKER_IDS[0], {
    state: 'working',
    badge: 'working',
    currentTask: 'Implement phase 2 of plan 089',
    boundModel: 'claude-opus-5',
    effort: 'high',
    contextMax: 1_000_000,
    contextCurrent: { value: 104_542, asOf: minutesAgo(1), provenance: 'claude-transcript' },
  }),
  // No `badge`. Since Phase 4 the poller asks for badges (`pij list --json --badge`) and live rows
  // carry one 181/181 — but the flag is a request, not a guarantee, and a row that arrives without
  // one must render the absence rather than re-derive it (AC-03). This row keeps that leg covered.
  fleetRow(UI_WORKER_IDS[1], { state: 'idle', harness: 'codex', boundModel: 'gpt-5' }),
  fleetRow(UI_SOLO_ID, { state: 'idle', currentTask: 'Land the SSE mux teardown' }),
  fleetRow(UI_LOOSE_ID, { state: 'idle', unadopted: true, harness: 'pi' }),
  fleetRow(UI_UNPLACED_ID, { state: 'working', lastEventAt: minutesAgo(1) }),
  fleetRow(UI_STALE_ID, { state: 'stopped', lastEventAt: hoursAgo(72) }),
  fleetRow(UI_NO_EVENT_ID, { state: 'starting', lastEventAt: null }),
];

/** A seat living in the sibling repo. Never a member of {@link UI_WORKSPACE_PATH}. */
export const UI_SIBLING_ROW: FleetRow = fleetRow(UI_SIBLING_ID, { folder: UI_SIBLING_PATH });

/** A seat in a wholly different workspace — what a global `fleet-delta` carries to every tab. */
export const UI_FOREIGN_ROW: FleetRow = fleetRow('pij-foreign-otter', { folder: UI_FOREIGN_PATH });

/** A healthy poller. `fleetSize` is deliberately larger than the scoped row count — it is GLOBAL. */
export function pollerStatus(overrides: Partial<PollerStatus> = {}): PollerStatus {
  return {
    running: true,
    lastSpinePollAt: minutesAgo(0),
    lastRecordsPollAt: minutesAgo(0),
    seq: 40,
    lastError: null,
    spineMissing: false,
    tornLinesSkipped: 0,
    fleetSize: 178,
    ...overrides,
  };
}
