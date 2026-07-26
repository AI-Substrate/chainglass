/**
 * Builder-flow reader — Plan 089 Phase 1, T005.
 *
 * The named trap, in meadowlark's words: a phase view that guesses wrong "renders a completed plan as
 * broken or vice versa". The trap is one level deeper than the file set — 088 has no
 * `.the-flow-state.json` and is **not** finished, so a reader that inferred completion from the file
 * census would render an actively-in-flight plan as done.
 *
 * So every rule below is a *ruled* rule, not a heuristic:
 *
 *   - classification is ONE signal (`provenance` present?), never a file census — Q8;
 *   - completion is `nav.bag.status`, with the terminal node as the read-time fallback — Q8;
 *   - phases are `type == "phase"`, NEVER an id pattern (088's are `ph1…ph6`) — Q2 correction 1;
 *   - order comes from walking `next[]`, never from array order — Q7 item 7;
 *   - reviews may be spine siblings OR excursions via `branch_of` — Q2 correction 2;
 *   - unknown statuses and node types are on disk right now and must not crash — Q7 item 6;
 *   - `*.legacy.*` is a tombstone: ignore always — Q8 item 3.
 *
 * Constitution P4: fixtures only, no vi.mock(). Fixtures materialize into an OS temp dir under the
 * real `the-flow.json` name; nothing under `docs/plans/` is read or written (C-02).
 */
import { afterEach, describe, expect, it } from 'vitest';
import { createFlowReader } from '../../../../apps/web/src/features/089-first-class-pij/server/flow-reader';
import {
  FLOW_FIXTURES,
  materializeFlowFixture,
  materializePlansRoot,
} from '../../../fixtures/flows/index';

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});

function planDirFor(name: (typeof FLOW_FIXTURES)[keyof typeof FLOW_FIXTURES]): string {
  const { planDir, cleanup } = materializeFlowFixture(name);
  cleanups.push(cleanup);
  return planDir;
}

const reader = createFlowReader();

describe('createFlowReader — the five ruled states (AC-07)', () => {
  it('classifies a flow with provenance as live', async () => {
    /*
    Test Doc:
    - Why: `provenance` present is THE signal that a flow is CLI-readable. Everything else in the
      folder is decoration or tombstone.
    - Contract: state === 'live', and the provenance keys are surfaced for the join.
    - Usage Notes: live-088 mirrors the real 088 flow, including plan_id '088'.
    - Quality Contribution: Pins the one signal the whole classifier hangs off.
    - Worked Example: live-088 → live, planId '088', branch '084-random-enhancements-3'.
    */
    const summary = await reader.read(planDirFor(FLOW_FIXTURES.live088));

    expect(summary.state).toBe('live');
    expect(summary.provenance?.planId).toBe('088');
    expect(summary.provenance?.branch).toBe('084-random-enhancements-3');
  });

  it('classifies a flow with NO provenance as legacy, not as an error and not as empty', async () => {
    /*
    Test Doc:
    - Why: Every `harness flow` verb refuses these with E308 — a deliberate clean break with no
      migration. Rendering them as an error or as "no data" is wrong twice: the work is real and the
      folder is internally consistent.
    - Contract: state === 'legacy' with a reason a human can read; no throw.
    - Usage Notes: legacy-e308 is the pre-024 hand-cranked shape (cursor/milestones_*, no nav).
    - Quality Contribution: One of the five distinct renders AC-07 requires.
    - Worked Example: legacy-e308 → legacy, reason mentions provenance/E308.
    */
    const summary = await reader.read(planDirFor(FLOW_FIXTURES.legacyE308));

    expect(summary.state).toBe('legacy');
    expect(summary.reason).toMatch(/provenance|E308/i);
    expect(summary.phases).toEqual([]);
  });

  it('classifies artifacts-without-a-flow as untracked work', async () => {
    /*
    Test Doc:
    - Why: Two indistinguishable causes (predates the flow / built by direct-jump, which writes no
      flow state by design) and one honest label: *worked, not tracked*. Calling it "not started"
      erases real work.
    - Contract: A `*-plan.md` or a `tasks/` directory with no flow → 'untracked'.
    - Usage Notes: untracked-work ships both.
    - Quality Contribution: Distinguishes the two most-common empty cases across 82 of 85 plan dirs.
    - Worked Example: untracked-work → untracked.
    */
    const summary = await reader.read(planDirFor(FLOW_FIXTURES.untrackedWork));

    expect(summary.state).toBe('untracked');
  });

  it('classifies an empty plan folder as not-started, ignoring a .gitkeep placeholder', async () => {
    /*
    Test Doc:
    - Why: "Genuinely nothing started" is a designed state, not a fallback and not a blank. And the
      artifact probe must be specific: a placeholder file is not work.
    - Contract: No flow and no artifacts → 'not-started'; `.gitkeep` does not count.
    - Usage Notes: The fixture contains only `.gitkeep`.
    - Quality Contribution: Stops the artifact probe from being a directory-non-empty check.
    - Worked Example: not-started → not-started.
    */
    const summary = await reader.read(planDirFor(FLOW_FIXTURES.notStarted));

    expect(summary.state).toBe('not-started');
  });

  it('classifies nav.now pointing at a missing node as corrupt', async () => {
    /*
    Test Doc:
    - Why: `orient` errors E305 here rather than degrading to `node: null`. A reader that shrugged
      would render a plan positioned nowhere as if it were positioned somewhere.
    - Contract: state === 'corrupt' with the dangling id in the reason.
    - Usage Notes: corrupt-nav points at 'phase-99', absent from nodes[].
    - Quality Contribution: The fifth AC-07 state, and the subtlest.
    - Worked Example: corrupt-nav → corrupt, reason names phase-99.
    */
    const summary = await reader.read(planDirFor(FLOW_FIXTURES.corruptNav));

    expect(summary.state).toBe('corrupt');
    expect(summary.reason).toContain('phase-99');
  });

  it('classifies an unparseable document as corrupt rather than throwing', async () => {
    /*
    Test Doc:
    - Why: The reader runs inside a poller tick over every plan folder in a workspace. One malformed
      document must not take out the scan.
    - Contract: A JSON parse failure → 'corrupt', never an exception.
    - Usage Notes: corrupt-json is truncated mid-document.
    - Quality Contribution: Keeps the flow scan total.
    - Worked Example: corrupt-json → corrupt, reason mentions parse.
    */
    const summary = await reader.read(planDirFor(FLOW_FIXTURES.corruptJson));

    expect(summary.state).toBe('corrupt');
    expect(summary.reason).toMatch(/parse/i);
  });

  it('classifies a missing plan directory as not-started rather than throwing', async () => {
    /*
    Test Doc:
    - Why: A workspace can be scanned while a folder is being created or removed.
    - Contract: A nonexistent directory reads as 'not-started'.
    - Usage Notes: —
    - Quality Contribution: No path in the reader can throw at the poller.
    - Worked Example: /nonexistent → not-started.
    */
    const summary = await reader.read('/nonexistent/docs/plans/999-nope');

    expect(summary.state).toBe('not-started');
  });
});

describe('createFlowReader — completion (the "renders a completed plan as broken" trap)', () => {
  it('takes completion from nav.bag.status when the bag is present', async () => {
    /*
    Test Doc:
    - Why: 088's ph6 is in_progress and ship is assumed. A reader inferring "finished" from the
      absent `.the-flow-state.json` would render an actively-in-flight plan as done — the exact
      failure meadowlark flagged.
    - Contract: `nav.bag.status: 'active'` → completion 'active', source 'nav.bag.status'.
    - Usage Notes: —
    - Quality Contribution: Pins completion to the one ruled source.
    - Worked Example: live-088 → active, from nav.bag.status.
    */
    const summary = await reader.read(planDirFor(FLOW_FIXTURES.live088));

    expect(summary.completion).toBe('active');
    expect(summary.completionSource).toBe('nav.bag.status');
  });

  it('falls back to the terminal node status when the bag is absent', async () => {
    /*
    Test Doc:
    - Why: Some live flows predate `nav.bag`. The ruled fallback is the TERMINAL NODE's status —
      never the file set, never the presence of any file.
    - Contract: No bag → completion from the terminal spine node, source 'terminal-node'.
    - Usage Notes: no-bag's terminal node is `ship`, status 'done'.
    - Quality Contribution: Makes the fallback chain explicit and testable.
    - Worked Example: no-bag → complete, from terminal-node.
    */
    const summary = await reader.read(planDirFor(FLOW_FIXTURES.noBag));

    expect(summary.completion).toBe('complete');
    expect(summary.completionSource).toBe('terminal-node');
  });
});

describe('createFlowReader — the phase rail (C-09)', () => {
  it('finds phases by type, not by id pattern, and orders them by walking next[]', async () => {
    /*
    Test Doc:
    - Why: TWO ruled traps at once. 088's phases are `ph1…ph6`, so an id pattern of `phase-N` finds
      zero. And 088's `nodes[]` array is in REVERSE order (ship first, research last), so array order
      renders the rail backwards.
    - Contract: phases are `type == "phase"` in `next[]`-walk order.
    - Usage Notes: The spine is research → plan → ph1 → … → ph6 → ship.
    - Quality Contribution: The rail is the phase view; getting its order wrong is the whole feature.
    - Worked Example: ph1..ph6 in ascending order, 6 phases, 5 done.
    */
    const summary = await reader.read(planDirFor(FLOW_FIXTURES.live088));

    expect(summary.phases.map((p) => p.id)).toEqual(['ph1', 'ph2', 'ph3', 'ph4', 'ph5', 'ph6']);
    expect(summary.phasesTotal).toBe(6);
    expect(summary.phasesDone).toBe(5);
  });

  it('never counts assumed or known nodes as done', async () => {
    /*
    Test Doc:
    - Why: `assumed` is speculative and `known` is designed; neither is a commitment and neither is
      evidence of anything. Counting either into "work done" inflates progress with fiction.
    - Contract: Only `status == "done"` counts.
    - Usage Notes: orphan-node carries a `known` phase and an `assumed` ship.
    - Quality Contribution: Keeps the done/total ratio honest.
    - Worked Example: orphan-node → 0 done despite a `known` phase present.
    */
    const summary = await reader.read(planDirFor(FLOW_FIXTURES.orphanNode));

    expect(summary.phasesDone).toBe(0);
    expect(summary.phases.find((p) => p.id === 'phase-2')?.status).toBe('known');
  });

  it('does not invent the array-order edge for an orphan node', async () => {
    /*
    Test Doc:
    - Why: An orphan node (created with no edges, accepted silently) is placed INTO the spine chain in
      array order by both `rail` and `render` — meadowlark's orphan rendered as
      `research --> z1 --> plan`, an edge that does not exist.
    - Contract: The orphan is still surfaced (never silently dropped) but is flagged `offSpine` and
      ordered after everything actually reachable.
    - Usage Notes: `z1` sits between research and phase-1 in the array.
    - Quality Contribution: The UI can show the orphan honestly instead of drawing a fake edge.
    - Worked Example: reachable phases first; z1 last with offSpine true.
    */
    const summary = await reader.read(planDirFor(FLOW_FIXTURES.orphanNode));

    expect(summary.phases.map((p) => p.id)).toEqual(['phase-1', 'phase-2', 'z1']);
    expect(summary.phases.find((p) => p.id === 'z1')?.offSpine).toBe(true);
    expect(summary.phases.find((p) => p.id === 'phase-1')?.offSpine).toBe(false);
  });

  it('marks the current phase from nav.now', async () => {
    /*
    Test Doc:
    - Why: "Which phase it's on" is the headline of the whole view.
    - Contract: `nav.now` naming a phase marks that phase current.
    - Usage Notes: live-088's nav.now is ph6.
    - Quality Contribution: AC-06's current position.
    - Worked Example: ph6.current === true, and nothing else is.
    */
    const summary = await reader.read(planDirFor(FLOW_FIXTURES.live088));

    expect(summary.nowPhaseId).toBe('ph6');
    expect(summary.phases.filter((p) => p.current).map((p) => p.id)).toEqual(['ph6']);
  });

  it('resolves a chore at nav.now to its owning phase via branch_of', async () => {
    /*
    Test Doc:
    - Why: The cursor frequently sits on an excursion (a chore, a workshop, a backpressure survey).
      Reporting "no current phase" then would be wrong — the phase is one hop up `branch_of`.
    - Contract: nav.now on an excursion → nowPhaseId is the phase it branches off.
    - Usage Notes: kitchen-sink's `boot` node is `branch_of: "a"`, a phase.
    - Quality Contribution: AC-06's "chore → owning phase" rule.
    - Worked Example: nav.now 'boot' → nowPhaseId 'a'.
    */
    const summary = await reader.read(planDirFor(FLOW_FIXTURES.kitchenSink), { now: 'boot' });

    expect(summary.nowPhaseId).toBe('a');
  });

  it('excludes excursions from the rail', async () => {
    /*
    Test Doc:
    - Why: Any node with `branch_of` — workshops, ADRs, backpressure, fix-loops, reconcile — is an
      excursion, excluded from the rail and rendered dotted. Counting them as phases or as progress
      inflates both.
    - Contract: No node carrying `branch_of` appears in `phases`.
    - Usage Notes: live-088 has 8 excursions (dr, ws, bp, rv4, fx4, rv4b, fx4b, rv4c).
    - Quality Contribution: Keeps the rail the spine.
    - Worked Example: none of rv4/fx4/ws/bp/dr appear among the 6 phases.
    */
    const summary = await reader.read(planDirFor(FLOW_FIXTURES.live088));

    const ids = summary.phases.map((p) => p.id);
    for (const excursion of ['dr', 'ws', 'bp', 'rv4', 'fx4', 'rv4b', 'fx4b', 'rv4c']) {
      expect(ids).not.toContain(excursion);
    }
  });
});

describe('createFlowReader — phase activations (never "coder activations")', () => {
  it('counts cursor entries per node from cursor-moved events, including re-entry', async () => {
    /*
    Test Doc:
    - Why: There is no seat or agent dimension anywhere in flow data — `events[]` records WHAT
      changed, never WHO. Per-node cursor entries are the honest proxy, and only if re-entry counts:
      a phase that was returned to after a review is more active, not equally active.
    - Contract: activations[node] = number of `cursor-moved` events whose `details.to` is that node.
    - Usage Notes: live-088 enters ph4 twice (ph2→ph4, then ph5→ph4 after the review excursions).
    - Quality Contribution: Supplies AC-06's count under its honest label.
    - Worked Example: ph4 → 2, ph1 → 1, ph3 → 0.
    */
    const summary = await reader.read(planDirFor(FLOW_FIXTURES.live088));

    const byId = new Map(summary.phases.map((p) => [p.id, p.activations]));
    expect(byId.get('ph4')).toBe(2);
    expect(byId.get('ph1')).toBe(1);
    expect(byId.get('ph3')).toBe(0);
  });
});

describe('createFlowReader — reviews, on the spine AND as excursions', () => {
  it('finds excursion reviews via branch_of, which a spine walk alone would miss entirely', async () => {
    /*
    Test Doc:
    - Why: The current template puts one `review-N` ON the spine; 088's reviews are excursions
      (rv4/rv4b/rv4c, `branch_of: ph4`). Since excursions are excluded from the rail, a rail-only
      review count reports ZERO reviews for a plan that had three.
    - Contract: `reviews` includes excursion reviews, each carrying the phase it hangs off.
    - Usage Notes: —
    - Quality Contribution: AC-06's "review state including excursion reviews".
    - Worked Example: three reviews, all excursions, all branch_of ph4.
    */
    const summary = await reader.read(planDirFor(FLOW_FIXTURES.live088));

    expect(summary.reviews.map((r) => r.id)).toEqual(['rv4', 'rv4b', 'rv4c']);
    expect(summary.reviews.every((r) => r.excursion)).toBe(true);
    expect(summary.reviews.every((r) => r.branchOf === 'ph4')).toBe(true);
  });
});

describe('createFlowReader — hostile and evolving documents', () => {
  it('reads the kitchen-sink adversarial fixture without crashing', async () => {
    /*
    Test Doc:
    - Why: "If your view handles that fixture it handles anything" — unknown node type, an INVALID
      status that is on disk because the schema is not enforced on mutation, HTML/pipe/brace injection
      and newlines in labels, multi-line user_input.
    - Contract: Reads as 'live'; unknown types and statuses survive; nothing is dropped silently.
    - Usage Notes: Copied verbatim from the harness repo's render golden.
    - Quality Contribution: The single highest-value robustness test available for this reader.
    - Worked Example: live, phases ['a','join'], the invalid status preserved verbatim elsewhere.
    */
    const summary = await reader.read(planDirFor(FLOW_FIXTURES.kitchenSink));

    expect(summary.state).toBe('live');
    expect(summary.phases.map((p) => p.id)).toEqual(['a', 'join']);
    expect(summary.phasesDone).toBe(0);
  });

  it('tolerates an unknown status instead of dropping or normalising the node', async () => {
    /*
    Test Doc:
    - Why: `status --to bogus` returns ok and persists `"status": "bogus"` — invalid values are on
      disk right now. The renderer degrades to a dashed `:::unknown` class; we mirror that by
      carrying the value through, not by guessing what was meant.
    - Contract: An unrecognised status is preserved verbatim and simply is not `done`.
    - Usage Notes: kitchen-sink's `adv` node has status 'mystery-status'.
    - Quality Contribution: Forward-compatibility with a schema that is unenforced by design.
    - Worked Example: the node is present in `nodes`, status 'mystery-status'.
    */
    const summary = await reader.read(planDirFor(FLOW_FIXTURES.kitchenSink));

    const adv = summary.nodes.find((n) => n.id === 'adv');
    expect(adv?.status).toBe('mystery-status');
    expect(adv?.type).toBe('weird-node-type');
  });

  it('does not bind agents[], the field that looks like the answer and is not', async () => {
    /*
    Test Doc:
    - Why: `agents[]` is fully supported by the renderer and populated by NOTHING — builder invariant
      #7 keeps it empty until the v2 `harness flow agent` verb lands. Binding it would surface
      fixture-only data as if it were real seat activity.
    - Contract: The summary exposes no agents field.
    - Usage Notes: kitchen-sink is the only document in existence with a populated agents[].
    - Quality Contribution: Keeps a known-empty dimension out of the UI, per the plan's Non-Goals.
    - Worked Example: 'agents' is not a key of the summary.
    */
    const summary = await reader.read(planDirFor(FLOW_FIXTURES.kitchenSink));

    expect(Object.keys(summary)).not.toContain('agents');
  });

  it('ignores a *.legacy.* tombstone sitting beside a live flow', async () => {
    /*
    Test Doc:
    - Why: `the-flow.legacy.json` is what a re-create leaves behind — a static record, not a system
      file. Parsing it, counting its nodes, or diffing it against the live flow are all wrong.
    - Contract: Only `the-flow.json` is read; the tombstone's 2 phases never appear.
    - Usage Notes: The live flow has 1 phase; the tombstone has 2 with ids old-1/old-2.
    - Quality Contribution: Prevents a dead flow's numbers leaking into a live plan's progress.
    - Worked Example: exactly ['phase-1'].
    */
    const summary = await reader.read(planDirFor(FLOW_FIXTURES.tombstone));

    expect(summary.phases.map((p) => p.id)).toEqual(['phase-1']);
    expect(summary.phasesTotal).toBe(1);
  });

  it('exposes a cheap change signature for coalescing (events length + nav.now)', async () => {
    /*
    Test Doc:
    - Why: Finding 08 — `events[]` length plus `nav.now` is a sufficient change signature, and it
      comes free. It lets the poller skip a broadcast when nothing moved.
    - Contract: `signature` is stable for an unchanged document and includes both inputs.
    - Usage Notes: —
    - Quality Contribution: The filter that keeps flow deltas quiet.
    - Worked Example: live-088 → '12:ph6' (12 events, cursor on ph6).
    */
    const planDir = planDirFor(FLOW_FIXTURES.live088);

    const first = await reader.read(planDir);
    const second = await reader.read(planDir);

    expect(first.signature).toBe(second.signature);
    expect(first.signature).toContain('ph6');
    expect(first.eventCount).toBe(12);
  });
});

describe('createFlowReader — scanning a workspace', () => {
  it('classifies every plan folder under a plans root, one row each', async () => {
    /*
    Test Doc:
    - Why: 82 of 85 plan folders in this repo have no flow data, so the scan's dominant output is
      absence — and absence has four distinct honest labels, not one.
    - Contract: scan() returns one summary per subdirectory, each with its ruled state.
    - Usage Notes: Five fixtures materialized as siblings.
    - Quality Contribution: Proves the classifier composes over a real directory shape.
    - Worked Example: live / legacy / untracked / not-started / corrupt, all present.
    */
    const { plansRoot, cleanup } = materializePlansRoot([
      FLOW_FIXTURES.live088,
      FLOW_FIXTURES.legacyE308,
      FLOW_FIXTURES.untrackedWork,
      FLOW_FIXTURES.notStarted,
      FLOW_FIXTURES.corruptNav,
    ]);
    cleanups.push(cleanup);

    const summaries = await reader.scan(plansRoot);

    expect(summaries).toHaveLength(5);
    expect(new Set(summaries.map((s) => s.state))).toEqual(
      new Set(['live', 'legacy', 'untracked', 'not-started', 'corrupt'])
    );
    expect(summaries.map((s) => s.planFolder)).toEqual(
      [...summaries.map((s) => s.planFolder)].sort()
    );
  });

  it('returns an empty list for a missing plans root instead of throwing', async () => {
    /*
    Test Doc:
    - Why: Not every workspace has a `docs/plans/`.
    - Contract: A missing root scans to [].
    - Usage Notes: —
    - Quality Contribution: Keeps the poller total across heterogeneous workspaces.
    - Worked Example: /nonexistent → [].
    */
    expect(await reader.scan('/nonexistent/docs/plans')).toEqual([]);
  });
});
