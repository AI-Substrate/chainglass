/**
 * One plan folder, in whichever of the five states it is in — Plan 089 Phase 3 (T003).
 *
 * This is the `fleet-empty-state` pattern applied to a *row* rather than a page: an exported reason
 * (here the reader's own `FlowSummary.state`, so the discriminator is trivially honest), a distinct
 * `data-reason` per state, and five renderings that cannot be mistaken for one another.
 *
 * The wordings are ruled, not stylistic. `legacy` is "predates the flow CLI" because a pre-CLI flow
 * is an artefact of *when* it was made — reporting it as broken sends someone to fix a file that is
 * exactly as it should be. `untracked` is "untracked work", not "missing flow", because the work
 * happened; only the tracking did not. And `not-started` is distinguished from `untracked` by the
 * presence of artifacts, which is a real difference: one folder has a plan in it and one is empty.
 *
 * Completion comes from `completion` / `completionSource` and from nowhere else. Never from the file
 * set — a folder with six phase directories in it proves nothing about whether the plan is done, and
 * counting them would be the confident lie this feature exists to avoid.
 */
'use client';

import type { FlowState, FlowSummary } from '../server/flow-reader.interface';
import { FlowStateBadge } from './flow-state-badge';
import { PhaseRail } from './phase-rail';

/**
 * What each state means, in one sentence a human can act on.
 *
 * Pure and exported so the wordings are assertable directly, rather than only through the DOM.
 */
export function flowStateNote(flow: FlowSummary): string {
  switch (flow.state) {
    case 'live':
      return `Tracked by the flow CLI · ${flow.phasesDone} of ${flow.phasesTotal} phases done.`;
    case 'legacy':
      return 'Predates the flow CLI; needs re-creating. Not an error — every flow verb refuses it (E308) until it is re-created.';
    case 'untracked':
      return 'Untracked work: artifacts are here, but no flow was ever created for them.';
    case 'not-started':
      return 'Nothing started: no flow, and no artifacts either. A designed state, not a fault.';
    case 'corrupt':
      return 'The flow document could not be read as a flow. This is a read failure in the file, not an empty plan.';
  }
}

/** Whether this state has a rail to draw. Only `live` does; the other four have no phases at all. */
function hasRail(state: FlowState): boolean {
  return state === 'live';
}

export interface FlowPlanCardProps {
  flow: FlowSummary;
  /** Live plans draw their rail inline. Off elsewhere so a long list stays a list. */
  showRail?: boolean;
}

export function FlowPlanCard({ flow, showRail = true }: FlowPlanCardProps) {
  return (
    <div
      data-testid={`flow-plan-${flow.planFolder}`}
      data-reason={flow.state}
      className="border-b border-border px-2 py-2 last:border-b-0"
    >
      <div className="flex flex-wrap items-baseline gap-2 text-[13px]">
        <FlowStateBadge state={flow.state} />
        <span className="font-mono">{flow.planFolder}</span>
        {flow.slug ? <span className="text-xs text-muted-foreground">{flow.slug}</span> : null}
      </div>
      <p className="mt-0.5 text-xs text-muted-foreground">{flowStateNote(flow)}</p>
      {/* `reason` is the reader's own words for why it classified this folder as it did. Shown
          verbatim, because a paraphrase of a diagnosis is not a diagnosis. */}
      {flow.reason ? (
        <p
          data-testid={`flow-plan-reason-${flow.planFolder}`}
          className="mt-0.5 font-mono text-[11px] text-muted-foreground"
        >
          {flow.reason}
        </p>
      ) : null}
      {showRail && hasRail(flow.state) ? <PhaseRail flow={flow} /> : null}
    </div>
  );
}
