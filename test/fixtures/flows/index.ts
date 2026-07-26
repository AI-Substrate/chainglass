/**
 * Builder-flow fixtures — Plan 089 Phase 1 (T002).
 *
 * Each directory here is a synthetic **plan folder** encoding exactly one ruled hazard from
 * `references/flow-answers-for-chainglass-ui.md`. The hazard ledger is `README.md` in this
 * directory; keep the two in sync.
 *
 * ## Why the documents are named `*.fixture.json`, not `the-flow.json`
 *
 * C-02 makes the flow files a sole-writer fence: the `harness flow` CLI is the only writer of
 * `the-flow.json` / `the-flow.md` / `.the-flow-state.json`, and this repo commits no file with those
 * names outside the real plan folders. So the fixture *documents* are committed under a name no tool
 * globs, and `materializeFlowFixture()` copies a plan folder into an OS temp directory under the
 * REAL filenames at test time. The reader is therefore exercised against `the-flow.json` exactly as
 * it will be in production, while the repo carries no flow-shaped file that any tool could resurrect.
 *
 * (The deliberately-unparseable fixture additionally carries a `.txt` suffix, because a file that is
 * invalid JSON by construction cannot live under a `.json` extension the formatter checks.)
 */
import { cpSync, mkdtempSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** This directory. */
export const FLOW_FIXTURES_DIR = import.meta.dirname;

/** The fixture plan folders, by the ruled state each one must classify as. */
export const FLOW_FIXTURES = {
  /** live — the real 088 shape: ids `ph1…ph6` (NOT `phase-N`), reviews as excursions off `ph4`. */
  live088: 'live-088',
  /** live — nav has no `bag`, so completion must fall back to the terminal node's status. */
  noBag: 'no-bag',
  /** live — an orphan node with no edges; walking `next[]` must not invent the array-order edge. */
  orphanNode: 'orphan-node',
  /** live — a `*.legacy.*` tombstone sits beside the live flow and must be ignored entirely. */
  tombstone: 'tombstone',
  /** live — the adversarial golden: unknown node type, invalid status, injection labels, agents[]. */
  kitchenSink: 'kitchen-sink',
  /** legacy — present but with no `provenance` block; every CLI verb refuses it with E308. */
  legacyE308: 'legacy-e308',
  /** corrupt — `nav.now` names a node that is not in `nodes[]`. */
  corruptNav: 'corrupt-nav',
  /** corrupt — the document does not parse at all. */
  corruptJson: 'corrupt-json',
  /** untracked — artifacts (`*-plan.md`, `tasks/<phase>/`) but no flow: worked, not tracked. */
  untrackedWork: 'untracked-work',
  /** not-started — an empty plan folder. A designed state, not an error. */
  notStarted: 'not-started',
} as const;

export type FlowFixtureName = (typeof FLOW_FIXTURES)[keyof typeof FLOW_FIXTURES];

/** Path to a fixture plan folder as committed (documents still named `*.fixture.json`). */
export function flowFixtureSourceDir(name: FlowFixtureName): string {
  return join(FLOW_FIXTURES_DIR, name);
}

/**
 * Copy a fixture plan folder into a temp directory, restoring the REAL flow filenames:
 * `the-flow.fixture.json` → `the-flow.json`, `the-flow.legacy.fixture.json` →
 * `the-flow.legacy.json`, and `*.fixture.json.txt` → `*.json`.
 *
 * @returns the temp plan-dir path and a `cleanup()` that removes it.
 */
export function materializeFlowFixture(name: FlowFixtureName): {
  planDir: string;
  cleanup: () => void;
} {
  const planDir = mkdtempSync(join(tmpdir(), `flow-fixture-${name}-`));
  cpSync(flowFixtureSourceDir(name), planDir, { recursive: true });
  restoreRealNames(planDir);
  return { planDir, cleanup: () => rmSync(planDir, { recursive: true, force: true }) };
}

/**
 * Materialize several fixtures as sibling plan folders under one synthetic `docs/plans/` root — what
 * a workspace scan sees.
 */
export function materializePlansRoot(names: readonly FlowFixtureName[]): {
  plansRoot: string;
  cleanup: () => void;
} {
  const plansRoot = mkdtempSync(join(tmpdir(), 'flow-fixture-plans-'));
  for (const name of names) {
    const dest = join(plansRoot, name);
    cpSync(flowFixtureSourceDir(name), dest, { recursive: true });
    restoreRealNames(dest);
  }
  return { plansRoot, cleanup: () => rmSync(plansRoot, { recursive: true, force: true }) };
}

/** Strip the `.fixture` marker (and any `.txt` guard suffix) from every file in a copied plan dir. */
function restoreRealNames(dir: string): void {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      restoreRealNames(full);
      continue;
    }
    const real = entry.replace(/\.fixture\.json(\.txt)?$/, '.json');
    if (real !== entry) renameSync(full, join(dir, real));
  }
}
