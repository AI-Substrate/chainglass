/**
 * The Flows tab — Plan 089 Phase 3 (T001, T003).
 *
 * The work spine: every plan folder in this workspace, classified, with the live ones showing their
 * phase rail. Phase 2 computed `flows` in the hook and handed it to nobody; this is its first
 * consumer, and the first thing on the page that `flow-delta` can move.
 *
 * ## Two levels of absence, deliberately kept apart
 *
 * A plan folder's own state (`live` / `legacy` / `untracked` / `not-started` / `corrupt`) is a fact
 * about that folder, rendered by {@link FlowPlanCard}. The tab has its own, separate question — "why
 * is there no list here at all?" — with three answers, and conflating them would report a
 * capability boundary as a fault:
 *
 *   - **`global-scope`** — `/api/pij/flow` requires a workspace, so there is no such thing as a
 *     machine-wide flow view. Scope says "all"; flows do not have an "all". A designed state, never
 *     an error and never a blank.
 *   - **`unreadable`** — the read failed. The `E-` code is shown verbatim, because it is the one
 *     string that makes the failure diagnosable.
 *   - **`no-plans`** — `docs/plans` holds nothing. The rarest of the three by far, and the only one
 *     that means what an empty page looks like it means.
 *
 * ## The histogram is the honest headline
 *
 * Absence dominates: 83 of this repo's 86 plan folders have never had a flow. A view that led with
 * "1 live flow" would be technically true and practically a lie about its own subject. Five counts,
 * always all five, so the shape of the reality is the first thing on screen.
 */
'use client';

import { useMemo } from 'react';
import type { FlowState, FlowSummary } from '../server/flow-reader.interface';
import type { FleetScope } from './fleet-view';
import { FlowPlanCard } from './flow-plan-card';
import { FLOW_STATE_LABEL } from './flow-state-badge';

/** The five states, always in this order, whatever the data holds. */
export const FLOW_STATE_ORDER: FlowState[] = [
  'live',
  'legacy',
  'untracked',
  'not-started',
  'corrupt',
];

export type FlowsAbsenceReason = 'global-scope' | 'unreadable' | 'no-plans';

export interface FlowsTabProps {
  flows: FlowSummary[];
  /** `errors.flows` — a non-2xx from the flow route, already carrying its `E-` code. */
  error: string | null;
  /** The page's scope toggle. Flows are workspace-scoped whatever it says; see the module docs. */
  scope: FleetScope;
  /** The absolute path being read. Printed with `no-plans`, where the path IS the diagnosis. */
  workspacePath: string;
  /** Plan folders the containment filter rejected since mount. Never the seat counter. */
  filteredOut: number;
}

/** Counts by state — always all five keys, so a zero renders as a zero rather than vanishing. */
export function flowHistogram(flows: FlowSummary[]): Record<FlowState, number> {
  const counts: Record<FlowState, number> = {
    live: 0,
    legacy: 0,
    untracked: 0,
    'not-started': 0,
    corrupt: 0,
  };
  for (const flow of flows) counts[flow.state] += 1;
  return counts;
}

/**
 * Why the list is empty, or `null` when it is not.
 *
 * Order is deliberate. Global scope outranks the error because in global scope the tab has not asked
 * a question worth failing: reporting a stale error under a state that says "this view does not apply
 * here" would attribute a fault to a boundary. The error then outranks emptiness, for the usual
 * reason — a failed read's zero is not a measured zero.
 */
export function flowsAbsenceReason(
  props: Pick<FlowsTabProps, 'flows' | 'error' | 'scope'>
): FlowsAbsenceReason | null {
  if (props.scope === 'global') return 'global-scope';
  if (props.error) return 'unreadable';
  if (props.flows.length === 0) return 'no-plans';
  return null;
}

const CARD = 'rounded-lg border p-4 text-sm';

export function FlowsTab(props: FlowsTabProps) {
  const reason = flowsAbsenceReason(props);

  // Sorted by folder name, which is the numeric plan order this repo has used since 001 — and the
  // same order `IFlowReader.scan` returns, so a snapshot and a delta-merged list look alike.
  const ordered = useMemo(
    () => [...props.flows].sort((a, b) => a.planFolder.localeCompare(b.planFolder)),
    [props.flows]
  );
  const counts = useMemo(() => flowHistogram(props.flows), [props.flows]);

  return (
    <div data-testid="pij-flows-tab">
      {reason === null ? (
        <>
          <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
            {FLOW_STATE_ORDER.map((state) => (
              <div
                key={state}
                data-testid={`flow-histogram-${state}`}
                className="rounded-lg border border-border bg-card px-3 py-2"
              >
                <div className="text-lg font-semibold">{counts[state]}</div>
                <div className="text-[11px] text-muted-foreground">{FLOW_STATE_LABEL[state]}</div>
              </div>
            ))}
          </div>

          <p className="mb-2 text-xs text-muted-foreground">
            Every plan folder under <span className="font-mono">docs/plans</span>, classified. Four
            of the five states are absences and none of them is a failure.
          </p>

          {props.filteredOut > 0 ? (
            <p
              className="mb-2 text-xs text-muted-foreground"
              data-testid="flows-filtered-out"
              title="live flow updates naming plan folders in other workspaces — the channel is shared by design"
            >
              {props.filteredOut} flow update{props.filteredOut === 1 ? '' : 's'} filtered out (plan
              folders in other workspaces)
            </p>
          ) : null}

          <div className="overflow-hidden rounded-lg border border-border bg-card">
            {ordered.map((flow) => (
              <FlowPlanCard key={flow.planDir} flow={flow} />
            ))}
          </div>
        </>
      ) : null}

      {reason === 'global-scope' ? (
        <div
          data-testid="flows-empty-global-scope"
          data-reason={reason}
          className={`${CARD} border-border bg-card`}
        >
          <h4 className="mb-1 font-medium">◌ Flows are workspace-scoped</h4>
          <p className="text-muted-foreground">
            The scope is set to the whole machine, and plan folders live inside a repo — there is no
            machine-wide flow view to show. Switch back to this workspace on the Fleet tab and the
            plans return.
          </p>
        </div>
      ) : null}

      {reason === 'unreadable' ? (
        <div
          data-testid="flows-empty-unreadable"
          data-reason={reason}
          className={`${CARD} border-red-500/40 bg-red-50/60 dark:bg-red-950/20`}
        >
          <h4 className="mb-1 font-medium">◎ Plan folders unreadable</h4>
          <p className="text-muted-foreground">
            Reading <span className="font-mono">docs/plans</span> failed. This is a read failure,
            not an empty repo — no conclusion about the plans can be drawn from it.
          </p>
          <p className="mt-1 font-mono text-xs text-foreground">{props.error}</p>
        </div>
      ) : null}

      {reason === 'no-plans' ? (
        <div
          data-testid="flows-empty-no-plans"
          data-reason={reason}
          className={`${CARD} border-border bg-card`}
        >
          <h4 className="mb-1 font-medium">◌ No plan folders here</h4>
          <p className="text-muted-foreground">
            The read succeeded and found nothing: this workspace has no{' '}
            <span className="font-mono">docs/plans</span> entries at all.
          </p>
          <p className="mt-1 break-all font-mono text-xs text-foreground">
            {props.workspacePath}/docs/plans
          </p>
        </div>
      ) : null}
    </div>
  );
}
