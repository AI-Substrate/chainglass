/**
 * The five ruled flow states, as a badge — Plan 089 Phase 3 (T003).
 *
 * One word per state, and the five words are chosen so that four of them cannot be misread as
 * failure. Four of the five states are ABSENCES, and absence of a flow is the normal condition of a
 * plan folder in this repo: 83 of 86 have never had one. A view that renders those as errors, or as
 * blanks, is wrong about the overwhelming majority of its own subject matter.
 *
 * `live` is the only state that says the flow CLI can act on this folder. `corrupt` is the only one
 * that reports something broken — and even then the breakage is in the document, not in the reader.
 */
'use client';

import type { FlowState } from '../server/flow-reader.interface';

/** The word each state is shown as. Deliberately lowercase and unpunctuated: labels, not sentences. */
export const FLOW_STATE_LABEL: Record<FlowState, string> = {
  live: 'live',
  legacy: 'legacy',
  untracked: 'untracked work',
  'not-started': 'not started',
  corrupt: 'corrupt',
};

/**
 * Colour per state. `legacy` is amber rather than red on purpose — a pre-CLI flow is a genuine
 * artefact of when it was made, not a fault someone introduced.
 */
const FLOW_STATE_CLASS: Record<FlowState, string> = {
  live: 'border-emerald-600/40 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300',
  legacy: 'border-amber-500/40 bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300',
  untracked: 'border-border bg-muted/50 text-muted-foreground',
  'not-started': 'border-dashed border-border text-muted-foreground',
  corrupt: 'border-red-500/40 bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300',
};

export function FlowStateBadge({ state }: { state: FlowState }) {
  return (
    <span
      data-testid={`flow-state-badge-${state}`}
      className={`inline-block shrink-0 rounded-full border px-2 py-px text-[11px] ${FLOW_STATE_CLASS[state]}`}
    >
      {FLOW_STATE_LABEL[state]}
    </span>
  );
}
