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
import { basename, dirname, relative, resolve, sep } from 'node:path';
import type { FleetRow, FlowProjectJoin, PijId, TeamFlowJoin } from '../types';
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
  'orchestrationRole',
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
 * Note what this does NOT do: it never computes a badge. It only ever COPIES one.
 *
 * Where the badge comes from changed in Phase 4 and the rule did not. Bare `pij list` rows carry no
 * badge at all (measured 2026-07-26: the key is absent on 181 of 181 rows); with `--badge`, which the
 * poller's reader now always passes, every row carries a string (181 of 181, none null). Both states
 * pass through this line unchanged, because the badge is a ruled worst-first derivation across two
 * vocabularies and synthesising one from the fields we happen to have would drift from pij exactly
 * when an open assignment carries the worse state — i.e. exactly when the badge matters (AC-03).
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
    ...(Object.hasOwn(row, 'orchestrationRole')
      ? {
          orchestrationRole:
            row.orchestrationRole === 'prime' ||
            row.orchestrationRole === 'pm' ||
            row.orchestrationRole === 'worker'
              ? row.orchestrationRole
              : null,
        }
      : {}),
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

// The join's result type is part of the public contract (the UI branches on `confident`), so it lives
// in `types.ts` with the rest of it and is re-exported here beside the function that produces it.
export type { TeamFlowJoin, TeamFlowVia } from '../types';
export { NO_TEAM_FLOW } from '../types';

/** A pij project record, reduced to the one field that carries a plan. */
export interface ProjectPlanLink {
  slug: string;
  /** `pij project set <slug> --plan <path>`. Relative to the repo, or absolute. Usually absent. */
  planPath?: string | null;
}

/**
 * Join a team (a section's lead seat) to a plan folder.
 *
 * ## Why there is no second rung
 *
 * `joinFlowToProject` above can fall back to a folder-ordinal convention because both sides of that
 * join are minted by the same tooling. This join has no such fallback and must not grow one: the only
 * other available signal is the resemblance between an assignment title and a plan folder name, and
 * a resemblance join is wrong precisely when it is confident — two seats working adjacent plans get
 * silently swapped, and the UI reports a phase belonging to somebody else's work. Rung 2 is `none`,
 * and `none` renders as the POC-ratified "no flow", which is an honest thing for a UI to say.
 *
 * ## What the live records actually expose (measured 2026-07-26, recorded in the execution log)
 *
 * - `pij list --json` (179 rows — the fleet's own source): carries **no** plan, flow, project,
 *   assignment or task field at all.
 * - `pij tree --json`: carries `currentAssignment` (an assignment ID) and `currentTask` — but no
 *   project slug, so the chain stops one hop short.
 * - `pij node show <id> --json`: carries `assignments[].projectSlug` — a *project* link, per seat, at
 *   one process spawn each (179 per slow loop against the design's ONE).
 * - `pij project list --json`: carries `planPath`, populated for 3 of 17 projects — and **null for
 *   this very stream's project**.
 * - the spine: 302 of 19,380 events carry a `project`, and **zero of those also carry a peer or
 *   `node:` ref**, so the fast loop cannot attribute one to a seat either.
 *
 * So the join is implemented and rung 1 is real — it lights up the moment a seat-side `projectSlug`
 * reaches a row — but against today's store every team resolves to `via: 'none'`.
 */
export function joinTeamToFlow(input: {
  /** The lead seat's project, when a record carries one. */
  projectSlug?: string | null;
  projects?: readonly ProjectPlanLink[];
  /** Flow summaries for this workspace, as the fleet page already holds them. */
  flows?: readonly { planDir: string; planFolder: string }[];
  /** Absolute workspace path, for resolving a repo-relative `planPath`. */
  workspacePath: string;
}): TeamFlowJoin {
  const none: TeamFlowJoin = { planDir: null, planFolder: null, via: 'none', confident: false };
  if (!input.projectSlug) return none;

  const project = input.projects?.find((candidate) => candidate.slug === input.projectSlug);
  const planPath = project?.planPath;
  if (!planPath) return none;

  const absolute = resolve(input.workspacePath, planPath);
  // `--plan` accepts either the plan folder or a file inside it; a basename with a dot is the file
  // case (`…/089-first-class-pij/first-class-pij-plan.md`).
  const planDir = basename(absolute).includes('.') ? dirname(absolute) : absolute;

  // Prefer the flow the page already holds, so the folder name comes from the reader rather than from
  // string surgery — but a plan folder with no flow file is still a confident join.
  const flow = input.flows?.find((candidate) => resolve(candidate.planDir) === planDir);
  return {
    planDir,
    planFolder: flow?.planFolder ?? basename(planDir),
    via: 'assignment.project.planPath',
    confident: true,
  };
}

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
