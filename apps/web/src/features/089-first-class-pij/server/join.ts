/**
 * The joins — Plan 089 Phase 1 (T006).
 *
 * Pure functions, no I/O. Two joins:
 *
 *   **seat ↔ workspace** — descriptor `folder` under workspace `path`. Both keys already exist; no
 *   new plumbing was needed to correlate them, which is why this is a filter and not a lookup table.
 *
 *   **flow ↔ project** — `provenance.plan_id` first, plan-folder convention second, and the join
 *   records *which rule fired*. meadowlark's first answer was "plan_id is null in every real flight
 *   plan"; reading this repo corrected it (088 carries `"088"`). So: opportunistic, never assumed.
 */
import { relative, resolve, sep } from 'node:path';
import type { FleetRow, FlowProjectJoin, PijId } from '../types';
import { asPijId } from '../types';

// Re-exported here because this module is where raw ids become keys: a reader following the join
// should find the one sanctioned branding entry point in the same file as the joins that need it.
export { asPijId } from '../types';
export type { PijId } from '../types';
import type { FlowProvenance } from './flow-reader.interface';
import type { PijListRow } from './pij-records.interface';

/**
 * Fields that must never travel onto a view row.
 *
 * `pid` and `paneId` recycle and are therefore not identity (C-03). `dataDir` is a record path, and
 * record paths are explicitly not a stable contract — surfacing one invites a consumer to bind to it.
 */
const NEVER_ON_A_ROW = new Set(['pid', 'paneId', 'dataDir']);

/** Fields lifted onto the typed row rather than left in `extra`. */
const PROMOTED = new Set([
  'id',
  'folder',
  'state',
  'activity',
  'liveness',
  'lastEventAt',
  'badge',
  'harness',
  'boundModel',
  'boundProvider',
  'effort',
  'bindHealth',
  'degraded',
  'failureReason',
  'prime',
  'unadopted',
  'currentTask',
  'currentAssignment',
  'contextMax',
  'contextCurrent',
  'windowId',
]);

/**
 * Is `folder` the workspace or inside it?
 *
 * Segment-aware on purpose. A `startsWith` check says `/repo-2` is inside `/repo`, and
 * sibling-with-shared-prefix is the NORMAL layout here because worktrees are named that way — so the
 * naive version would show another repo's seats as this repo's, plausibly and invisibly.
 */
export function isFolderInWorkspace(folder: string, workspacePath: string): boolean {
  if (!folder || !workspacePath) return false;
  const rel = relative(resolve(workspacePath), resolve(folder));
  if (rel === '') return true;
  return !rel.startsWith('..') && !rel.startsWith(`${sep}..`) && !rel.includes(`..${sep}`);
}

/** Filter a global `pij list` to one workspace. F-13: scoping is a server-side filter, not a CLI flag. */
export function joinSeatsToWorkspace(rows: PijListRow[], workspacePath: string): PijListRow[] {
  return rows.filter((row) => isFolderInWorkspace(row.folder ?? '', workspacePath));
}

/**
 * Project a raw list row onto a view row.
 *
 * Note what this does NOT do: it never computes a badge. `pij list` rows carry no badge (measured
 * 2026-07-26), and the badge is a ruled worst-first derivation across two vocabularies. Synthesising
 * one from the fields we happen to have would drift from pij exactly when an open assignment carries
 * the worse state — i.e. exactly when the badge matters (AC-03).
 */
export function toFleetRow(row: PijListRow): FleetRow {
  const extra: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (PROMOTED.has(key) || NEVER_ON_A_ROW.has(key)) continue;
    extra[key] = value;
  }

  return {
    id: asPijId(row.id),
    folder: row.folder,
    state: row.state,
    activity: row.activity,
    liveness: row.liveness,
    lastEventAt: row.lastEventAt ?? null,
    badge: typeof row.badge === 'string' ? row.badge : undefined,
    harness: typeof row.harness === 'string' ? row.harness : undefined,
    boundModel: row.boundModel ?? null,
    boundProvider: row.boundProvider ?? null,
    effort: row.effort ?? null,
    bindHealth: row.bindHealth,
    degraded: row.degraded,
    failureReason: row.failureReason ?? null,
    prime: row.prime,
    unadopted: row.unadopted,
    currentTask: typeof row.currentTask === 'string' ? row.currentTask : undefined,
    currentAssignment:
      typeof row.currentAssignment === 'string' ? row.currentAssignment : undefined,
    contextMax: typeof row.contextMax === 'number' ? row.contextMax : undefined,
    contextCurrent: (row.contextCurrent as FleetRow['contextCurrent']) ?? undefined,
    windowId: typeof row.windowId === 'string' ? row.windowId : undefined,
    extra,
  };
}

/** Index rows by pij id. The key type is `PijId`, so a pid cannot be passed here by accident. */
export function indexFleetById(rows: FleetRow[]): Map<PijId, FleetRow> {
  return new Map(rows.map((row) => [row.id, row]));
}

/** A plan folder is `<ordinal>-<slug>`; the ordinal is the conventional project id. */
const PLAN_FOLDER_ORDINAL = /^(\d{3,})-/;

/**
 * Join a flow to a project id.
 *
 * Order matters and is ruled (Finding 09): **data first** (`provenance.plan_id`, the designed hook,
 * populated in this repo), **convention second** (the plan folder's ordinal — a stable, git-derived
 * convention, but still a convention), and **nothing third**. `via` travels with the answer so the UI
 * can be honest about its own basis, and `confident` is true only for the data path.
 *
 * `provenance.agent` is deliberately not consulted: it is the driving SKILL's name (`the-flow` in
 * every flight plan in existence), not a seat, and joining on it would attribute every flow on the
 * machine to one imaginary agent.
 */
export function joinFlowToProject(input: {
  planFolder: string;
  provenance?: FlowProvenance;
}): FlowProjectJoin {
  const planId = input.provenance?.planId;
  if (typeof planId === 'string' && planId.length > 0) {
    return { planId, via: 'provenance.plan_id', confident: true };
  }

  const ordinal = PLAN_FOLDER_ORDINAL.exec(input.planFolder);
  if (ordinal) {
    return { planId: ordinal[1], via: 'plan-folder-convention', confident: false };
  }

  return { planId: null, via: 'none', confident: false };
}
