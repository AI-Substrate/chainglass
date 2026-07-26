/**
 * The join — Plan 089 Phase 1, T006.
 *
 * Two joins, both of which have a documented way of being confidently wrong:
 *
 *   **seat ↔ workspace** on descriptor `folder` under workspace `path`. A naive `startsWith` says
 *   `/repo-2` is inside `/repo`. Rows must be keyed on the pij id and NOTHING else: pane ids and pids
 *   both recycle (C-03), and a recycled key silently attributes one seat's state to another.
 *
 *   **flow ↔ project** on `provenance.plan_id` first, plan-folder convention second. meadowlark's
 *   first answer was "plan_id is null in every real flight plan", then reading THIS repo corrected it
 *   — 088 carries `plan_id: "088"`. So it is present-or-absent, never guaranteed, and which rule
 *   produced a join must travel with the join (Finding 09).
 */
import { describe, expect, it } from 'vitest';
import {
  asPijId,
  indexFleetById,
  joinFlowToProject,
  joinSeatsToWorkspace,
  joinTeamToFlow,
  toFleetRow,
} from '../../../../apps/web/src/features/089-first-class-pij/server/join';
import type { PijListRow } from '../../../../apps/web/src/features/089-first-class-pij/server/pij-records.interface';

function row(overrides: Partial<PijListRow> & { id: string; folder: string }): PijListRow {
  return {
    pid: 1234,
    state: 'idle',
    activity: 'done',
    liveness: 'active',
    lastEventAt: '2026-07-26T05:00:00.000Z',
    boundModel: 'claude-opus-5',
    effort: 'high',
    bindHealth: 'ok',
    degraded: false,
    prime: false,
    unadopted: false,
    ...overrides,
  };
}

describe('joinSeatsToWorkspace', () => {
  it('keeps seats whose folder is the workspace or below it', async () => {
    /*
    Test Doc:
    - Why: AC-04 — the default fleet view lists only seats in the current workspace, and `folder` is
      the join key that already exists on both sides.
    - Contract: folder === path, or folder is a descendant of path.
    - Usage Notes: —
    - Quality Contribution: The scope filter the whole default view depends on.
    - Worked Example: /w and /w/sub kept; /elsewhere dropped.
    */
    const rows = [
      row({ id: 'pij-at-root', folder: '/w' }),
      row({ id: 'pij-in-sub', folder: '/w/sub/deeper' }),
      row({ id: 'pij-elsewhere', folder: '/elsewhere' }),
    ];

    const kept = joinSeatsToWorkspace(rows, '/w');

    expect(kept.map((r) => r.id)).toEqual(['pij-at-root', 'pij-in-sub']);
  });

  it('does NOT treat a sibling with a shared prefix as inside the workspace', async () => {
    /*
    Test Doc:
    - Why: The classic path bug. `/Users/j/chainglass-2`.startsWith(`/Users/j/chainglass`) is true, so
      a prefix filter shows another repo's seats as this repo's — plausible, wrong, and invisible.
      Worktrees make sibling-with-shared-prefix the NORMAL layout here, not an edge case.
    - Contract: The match is on path segments; only a real descendant counts.
    - Usage Notes: —
    - Quality Contribution: Prevents cross-repo contamination of every workspace view.
    - Worked Example: /w-2 is excluded from workspace /w.
    */
    const rows = [
      row({ id: 'pij-here', folder: '/w' }),
      row({ id: 'pij-sibling', folder: '/w-2' }),
    ];

    const kept = joinSeatsToWorkspace(rows, '/w');

    expect(kept.map((r) => r.id)).toEqual(['pij-here']);
  });

  it('normalises a trailing slash on either side', async () => {
    /*
    Test Doc:
    - Why: Workspace paths arrive from config, URLs and git; descriptor folders come from the daemon.
      A trailing slash on one side must not empty the whole view.
    - Contract: '/w/' and '/w' are the same workspace.
    - Usage Notes: —
    - Quality Contribution: Removes a whole class of "the fleet is empty and I don't know why".
    - Worked Example: workspace '/w/' still matches folder '/w'.
    */
    const rows = [row({ id: 'pij-here', folder: '/w' })];

    expect(joinSeatsToWorkspace(rows, '/w/').map((r) => r.id)).toEqual(['pij-here']);
  });

  it('keeps a seat whose id is a single segment', async () => {
    /*
    Test Doc:
    - Why: C-03 / F-03 — pij ids may be single-segment, and the standing trap is code that
      pattern-matches a `pij-*` shape somewhere in the pipeline and quietly drops the rest.
    - Contract: No id-shape validation exists anywhere in the join.
    - Usage Notes: `shipname` is the fixture's single-segment id.
    - Quality Contribution: Pins C-03 at the join, the most likely place to reintroduce it.
    - Worked Example: 'shipname' survives.
    */
    const rows = [row({ id: 'shipname', folder: '/w' })];

    expect(joinSeatsToWorkspace(rows, '/w').map((r) => r.id)).toEqual(['shipname']);
  });

  it('drops rows with no folder rather than guessing a workspace for them', async () => {
    /*
    Test Doc:
    - Why: Absent optionals are ABSENT keys in pij records. A row with no `folder` has no workspace —
      inventing one (e.g. defaulting to the current workspace) is exactly the invented fact this plan
      exists to prevent.
    - Contract: A missing/blank folder never matches any workspace.
    - Usage Notes: —
    - Quality Contribution: Keeps "we don't know where this seat is" out of a workspace view.
    - Worked Example: a folderless row is excluded.
    */
    const rows = [row({ id: 'pij-nowhere', folder: '' }), row({ id: 'pij-here', folder: '/w' })];

    expect(joinSeatsToWorkspace(rows, '/w').map((r) => r.id)).toEqual(['pij-here']);
  });
});

describe('toFleetRow / indexFleetById — keyed on the pij id ONLY (C-03)', () => {
  it('carries neither paneId nor pid onto the fleet row', async () => {
    /*
    Test Doc:
    - Why: Both recycle. AC-03 forbids rendering either as identity, and the cheapest way to make
      that enforceable is for the view type to never have them — you cannot render, key, or match on
      a field that is not there.
    - Contract: A FleetRow built from a list row has no `pid` and no `paneId` key.
    - Usage Notes: The source row carries pid 1234.
    - Quality Contribution: Turns a rule that needs remembering into one the type system holds.
    - Worked Example: 'pid' and 'paneId' are not keys of the row.
    */
    const fleetRow = toFleetRow(row({ id: 'pij-a', folder: '/w', pid: 1234, paneId: '%99' }));

    expect(Object.keys(fleetRow)).not.toContain('pid');
    expect(Object.keys(fleetRow)).not.toContain('paneId');
    expect(fleetRow.id).toBe('pij-a');
  });

  it('indexes rows by branded pij id, so a pid or pane id cannot be used as a key', async () => {
    /*
    Test Doc:
    - Why: "Types make paneId/pid keys impossible" is the phase's success criterion. A branded PijId
      means a number (pid) will not compile as a key, and a raw string has to pass through asPijId()
      — a deliberate, greppable act rather than an accident.
    - Contract: indexFleetById returns Map<PijId, FleetRow>; lookups go through asPijId().
    - Usage Notes: The compile-time half is enforced by `tsc -p tsconfig.test.json`; this asserts the
      runtime half behaves.
    - Quality Contribution: Makes C-03 structural.
    - Worked Example: get(asPijId('shipname')) finds the row.
    */
    const index = indexFleetById([
      toFleetRow(row({ id: 'shipname', folder: '/w' })),
      toFleetRow(row({ id: 'pij-b', folder: '/w' })),
    ]);

    expect(index.size).toBe(2);
    expect(index.get(asPijId('shipname'))?.id).toBe('shipname');
  });

  it('preserves provenance-bearing fields and additive fields on the row', async () => {
    /*
    Test Doc:
    - Why: C-05 — `effort`/`boundModel` render as *pinned* until observed, and the gauge is a value or
      an honest 'unknown'. The row must carry enough for the view to say which, and must not lose
      dove's `needs-human` field when it lands.
    - Contract: boundModel/effort/lastEventAt/state survive; unknown fields survive too.
    - Usage Notes: —
    - Quality Contribution: Keeps AC-03's provenance wording renderable, and the additive-field
      promise real.
    - Worked Example: needsHuman survives onto the row.
    */
    const fleetRow = toFleetRow(
      row({
        id: 'pij-a',
        folder: '/w',
        boundModel: 'claude-opus-5',
        effort: 'high',
        needsHuman: true,
      })
    );

    expect(fleetRow.boundModel).toBe('claude-opus-5');
    expect(fleetRow.effort).toBe('high');
    expect(fleetRow.lastEventAt).toBe('2026-07-26T05:00:00.000Z');
    expect(fleetRow.extra.needsHuman).toBe(true);
  });

  it('never re-derives the badge — it carries what pij reported and nothing more', async () => {
    /*
    Test Doc:
    - Why: AC-03. `pij list` rows do not carry a badge (measured 2026-07-26: the row has `state`,
      `activity`, `liveness` and no `badge`), and the badge is a worst-first derivation over TWO
      vocabularies. Synthesising one here would be a local reimplementation of pij's own logic —
      the named failure mode.
    - Contract: A list-derived row has `badge: undefined`; the value only arrives from `node show`.
    - Usage Notes: —
    - Quality Contribution: Forces the honest answer ("not read yet") instead of a plausible one.
    - Worked Example: badge is undefined even though state is 'idle'.
    */
    const fleetRow = toFleetRow(row({ id: 'pij-a', folder: '/w', state: 'idle' }));

    expect(fleetRow.badge).toBeUndefined();
    expect(fleetRow.state).toBe('idle');
  });
});

describe('joinFlowToProject — data first, convention second, provenance recorded (Finding 09)', () => {
  it('uses provenance.plan_id when it is present and records that it did', async () => {
    /*
    Test Doc:
    - Why: `plan_id` is the DESIGNED hook and it is populated in this repo (088). Preferring it over
      convention makes the join data rather than inference wherever the data exists.
    - Contract: planId from provenance; via 'provenance.plan_id'.
    - Usage Notes: —
    - Quality Contribution: The join's strongest rule, with its own audit trail.
    - Worked Example: plan_id '088' → { planId: '088', via: 'provenance.plan_id' }.
    */
    const result = joinFlowToProject({
      planFolder: '088-remote-app-view',
      provenance: {
        branch: 'main',
        repo: 'r',
        agent: 'the-flow',
        planId: '088',
        createdAt: null,
        harnessVersion: null,
      },
    });

    expect(result).toEqual({ planId: '088', via: 'provenance.plan_id', confident: true });
  });

  it('falls back to the plan-folder ordinal and marks the join as convention', async () => {
    /*
    Test Doc:
    - Why: `plan_id` is null in most flows (the-flow's create block does not pass it, and the
      HARNESS_PLAN_ID env fallback is defective in 0.12.0). The folder ordinal is a stable,
      git-derived convention — but it IS a convention, and the UI must be able to say so.
    - Contract: No plan_id → ordinal from the folder name; via 'plan-folder-convention';
      confident false.
    - Usage Notes: —
    - Quality Contribution: Keeps inference labelled as inference (the plan's governing doctrine).
    - Worked Example: '089-first-class-pij' → { planId: '089', via: 'plan-folder-convention' }.
    */
    const result = joinFlowToProject({
      planFolder: '089-first-class-pij',
      provenance: {
        branch: 'main',
        repo: 'r',
        agent: 'the-flow',
        planId: null,
        createdAt: null,
        harnessVersion: null,
      },
    });

    expect(result).toEqual({
      planId: '089',
      via: 'plan-folder-convention',
      confident: false,
    });
  });

  it('reports no join at all rather than inventing one for an unconventional folder', async () => {
    /*
    Test Doc:
    - Why: A folder with no ordinal has no honest project id. Returning the folder name as if it were
      one would put a fabricated id into the join.
    - Contract: No plan_id and no ordinal → planId null, via 'none'.
    - Usage Notes: —
    - Quality Contribution: Preserves the honest-unknown outcome at the last join in the pipeline.
    - Worked Example: 'scratchpad' → { planId: null, via: 'none' }.
    */
    const result = joinFlowToProject({ planFolder: 'scratchpad' });

    expect(result).toEqual({ planId: null, via: 'none', confident: false });
  });

  it('never treats provenance.agent as a seat', async () => {
    /*
    Test Doc:
    - Why: `agent` is the driving SKILL's name — every flight plan in existence says 'the-flow'. It is
      the rail-title source and will never distinguish seats. Using it as a join key would attribute
      every flow on the machine to one imaginary agent.
    - Contract: The join result exposes no agent/seat field.
    - Usage Notes: —
    - Quality Contribution: Closes the most inviting wrong join in the flow data.
    - Worked Example: result keys are exactly planId/via/confident.
    */
    const result = joinFlowToProject({
      planFolder: '088-remote-app-view',
      provenance: {
        branch: 'main',
        repo: 'r',
        agent: 'the-flow',
        planId: '088',
        createdAt: null,
        harnessVersion: null,
      },
    });

    expect(Object.keys(result).sort()).toEqual(['confident', 'planId', 'via']);
  });
});

describe('joinTeamToFlow (Phase 2, T003)', () => {
  const WORKSPACE = '/Users/fixture/substrate/chainglass';
  const PROJECTS = [
    {
      slug: 'p063-systemic-telemetry-repair',
      planPath: 'docs/plans/063-telemetry/telemetry-plan.md',
    },
    { slug: 's061-team-scaffold', planPath: 'docs/plans/061-team-scaffold/' },
    { slug: 'first-class-pij-support-in-the-chainglass-ui', planPath: null },
  ];
  const FLOWS = [
    { planDir: `${WORKSPACE}/docs/plans/063-telemetry`, planFolder: '063-telemetry' },
    { planDir: `${WORKSPACE}/docs/plans/088-remote-app-view`, planFolder: '088-remote-app-view' },
  ];

  it('reaches the plan folder through the project record — rung 1, and it is confident', async () => {
    /*
    Test Doc:
    - Why: `pij project set --plan <path>` is the ONE place a plan is attached to work by data. When a
      seat's project carries it, the join is a lookup, not a guess, and the UI may say so.
    - Contract: T003 rung 1; doctrine "inference stays labelled".
    - Usage Notes: `planPath` may name a FILE inside the plan folder — the join takes its directory.
    - Quality Contribution: pins the only rung that is allowed to be confident.
    - Worked Example: project → docs/plans/063-telemetry/telemetry-plan.md → 063-telemetry.
    */
    const result = joinTeamToFlow({
      projectSlug: 'p063-systemic-telemetry-repair',
      projects: PROJECTS,
      flows: FLOWS,
      workspacePath: WORKSPACE,
    });

    expect(result).toEqual({
      planDir: `${WORKSPACE}/docs/plans/063-telemetry`,
      planFolder: '063-telemetry',
      via: 'assignment.project.planPath',
      confident: true,
    });
  });

  it('accepts a planPath that names the folder itself', async () => {
    /*
    Test Doc:
    - Why: both forms are in the live store — one project points at a plan file, another at a folder.
    - Contract: T003 rung 1.
    - Usage Notes: a trailing slash must not produce an empty basename.
    - Quality Contribution: covers the second observed shape of a single field.
    - Worked Example: docs/plans/061-team-scaffold/ → 061-team-scaffold.
    */
    const result = joinTeamToFlow({
      projectSlug: 's061-team-scaffold',
      projects: PROJECTS,
      flows: FLOWS,
      workspacePath: WORKSPACE,
    });

    expect(result.planFolder).toBe('061-team-scaffold');
    expect(result.confident).toBe(true);
  });

  it('returns `none` when the project carries no plan — the live case for this stream', async () => {
    /*
    Test Doc:
    - Why: measured 2026-07-26, only 3 of 17 projects carry `planPath`, and this stream's own project
      is not one of them. `none` is therefore the NORMAL answer, not an error path.
    - Contract: T003 rung 2.
    - Usage Notes: the view renders the ratified "no flow" fallback on exactly this result.
    - Quality Contribution: the honest-absence case is pinned as a first-class outcome.
    - Worked Example: first-class-pij-support-… has planPath null → none.
    */
    const result = joinTeamToFlow({
      projectSlug: 'first-class-pij-support-in-the-chainglass-ui',
      projects: PROJECTS,
      flows: FLOWS,
      workspacePath: WORKSPACE,
    });

    expect(result).toEqual({ planDir: null, planFolder: null, via: 'none', confident: false });
  });

  it('returns `none` when the seat carries no project at all', async () => {
    /*
    Test Doc:
    - Why: `pij list` rows carry no project field whatsoever, so this is what every team resolves to
      today. It must be a value, never a throw or an empty chip.
    - Contract: T003 rung 2.
    - Usage Notes: —
    - Quality Contribution: guards the default path the whole fleet takes.
    - Worked Example: no projectSlug → none.
    */
    expect(joinTeamToFlow({ projects: PROJECTS, flows: FLOWS, workspacePath: WORKSPACE })).toEqual({
      planDir: null,
      planFolder: null,
      via: 'none',
      confident: false,
    });
  });

  it('never joins on the resemblance between an assignment title and a plan folder', async () => {
    /*
    Test Doc:
    - Why: THE forbidden rung. A resemblance join is wrong exactly when it is confident — two seats on
      adjacent plans get silently swapped and the UI reports somebody else's phase.
    - Contract: T003 "Never join by name similarity".
    - Usage Notes: the input below is maximally tempting: the slug all but names the plan folder.
    - Quality Contribution: makes the absence of the fuzzy rung executable rather than promised.
    - Worked Example: slug 'first-class-pij-support-…' does NOT reach '089-first-class-pij'.
    */
    const result = joinTeamToFlow({
      projectSlug: 'first-class-pij-support-in-the-chainglass-ui',
      projects: PROJECTS,
      flows: [
        ...FLOWS,
        {
          planDir: `${WORKSPACE}/docs/plans/089-first-class-pij`,
          planFolder: '089-first-class-pij',
        },
      ],
      workspacePath: WORKSPACE,
    });

    expect(result.planFolder).toBeNull();
    expect(result.via).toBe('none');
  });

  it('is confident about a plan folder that has no flow file yet', async () => {
    /*
    Test Doc:
    - Why: the join answers "which plan folder", not "is there a flow in it". A folder with no
      the-flow.json is one of the five ruled absence states, not a failed join.
    - Contract: T003; flow-reader's FlowState vocabulary.
    - Usage Notes: the view still shows no chip — it requires a join AND a flow.
    - Quality Contribution: keeps the two questions separate so neither is answered by the other.
    - Worked Example: planPath resolves, flows[] does not contain it → confident, planFolder set.
    */
    const result = joinTeamToFlow({
      projectSlug: 'p063-systemic-telemetry-repair',
      projects: PROJECTS,
      flows: [],
      workspacePath: WORKSPACE,
    });

    expect(result.confident).toBe(true);
    expect(result.planFolder).toBe('063-telemetry');
  });
});
