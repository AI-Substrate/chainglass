/**
 * Flow-view UI fixtures — Plan 089 Phase 3.
 *
 * Phase 1's `test/fixtures/flows/` holds the real thing: plan folders on disk, materialized under
 * their true filenames and read by the real `IFlowReader`. That is what the tab and rail tests use,
 * because "does the reader classify this folder correctly" is a question only a real read can answer.
 *
 * This module answers a different question. The hook's containment rule keys on `planDir`, an
 * ABSOLUTE path that must be inside the workspace — and a materialized fixture lives in an OS temp
 * directory, which is inside nothing. So these are hand-built summaries whose only interesting
 * property is where they claim to live: under {@link UI_WORKSPACE_PATH}, under a sibling that shares
 * its prefix, or somewhere else entirely.
 *
 * Nothing here is written anywhere. `planDir` values are strings that name paths; no such path is
 * created, opened, or (least of all) written to.
 */
import { join } from 'node:path';
import type { FlowSummary } from '../../../apps/web/src/features/089-first-class-pij/server/flow-reader.interface';
import { UI_FOREIGN_PATH, UI_SIBLING_PATH, UI_WORKSPACE_PATH } from './fleet-ui';

/** Where flight plans live, by the convention every `/builder` repo follows. */
export const UI_PLANS_ROOT = join(UI_WORKSPACE_PATH, 'docs', 'plans');

/**
 * A summary for a plan folder inside the fixture workspace.
 *
 * Defaults to the `untracked` state — the dominant reality (83 of this repo's 86 plan folders), so a
 * test that cares about a state has to say so, and one that does not gets the common case.
 */
export function flowSummary(planFolder: string, overrides: Partial<FlowSummary> = {}): FlowSummary {
  const planDir = overrides.planDir ?? join(UI_PLANS_ROOT, planFolder);
  return {
    planDir,
    planFolder,
    state: 'untracked',
    completion: 'unknown',
    completionSource: 'none',
    phases: [],
    phasesDone: 0,
    phasesTotal: 0,
    reviews: [],
    nodes: [],
    eventCount: 0,
    signature: '0:',
    readAt: '2026-07-26T12:00:00.000Z',
    ...overrides,
  };
}

/** A plan folder in the SIBLING repo — `startsWith` says "inside"; it is not. */
export function siblingFlowSummary(planFolder: string): FlowSummary {
  return flowSummary(planFolder, {
    planDir: join(UI_SIBLING_PATH, 'docs', 'plans', planFolder),
  });
}

/** A plan folder in a wholly different workspace — what a global `flow-delta` carries to every tab. */
export function foreignFlowSummary(planFolder: string): FlowSummary {
  return flowSummary(planFolder, {
    planDir: join(UI_FOREIGN_PATH, 'docs', 'plans', planFolder),
  });
}
