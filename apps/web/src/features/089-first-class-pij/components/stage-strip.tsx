/**
 * Flow chip + stage strip — Plan 089 Phase 2 (T003).
 *
 * Both render on ONE condition: a `confident` team→flow join AND a flow to show. Anything less draws
 * the ratified fallback, "⛭ no flow", which is what almost every section shows today (see
 * `joinTeamToFlow` for the measured reason). A chip that appears on a guessed join is worse than no
 * chip: it attributes someone else's phase to this team, and it looks exactly as authoritative as a
 * real one.
 *
 * The strip renders `phases` as the flow reader produced them — filtered, walked and ordered there.
 * Nothing here re-walks `next[]`, re-orders by array position, or interprets a status word it does
 * not recognise: the flow schema is unenforced on write, `status --to bogus` persists, and only
 * `'done'` ever counts as done (C-09).
 */
'use client';

import type { FlowSummary } from '../server/flow-reader.interface';
import type { TeamFlowJoin } from '../types';

/** The one status word with a ruled meaning. Everything else is rendered, not interpreted. */
const DONE = 'done';
const IN_PROGRESS = 'in_progress';
/** A future the flow *assumes* — dashed, because it is not a plan, let alone progress. */
const ASSUMED = 'assumed';

export interface FlowContext {
  join: TeamFlowJoin;
  flow?: FlowSummary;
}

/** True when the pair is safe to render as fact. */
export function hasConfidentFlow(
  context: FlowContext | undefined
): context is Required<FlowContext> {
  return Boolean(context?.join.confident && context.flow);
}

export function FlowChip({ context }: { context?: FlowContext }) {
  if (!hasConfidentFlow(context)) {
    return (
      <span data-testid="flow-chip-absent" className="text-xs text-muted-foreground">
        ⛭ no flow
      </span>
    );
  }

  const { flow, join } = context;
  const currentIndex = flow.phases.findIndex((phase) => phase.current);
  const position = currentIndex >= 0 ? currentIndex + 1 : flow.phasesDone;
  const total = flow.phasesTotal;

  return (
    <span
      data-testid="flow-chip"
      className="inline-flex items-center gap-1.5 rounded-full border border-blue-400/50 bg-blue-50 px-2 py-px text-[11px] text-blue-900 dark:bg-blue-950/40 dark:text-blue-200"
    >
      <span>
        ⛭ {join.planFolder} · phase {position} of {total}
      </span>
      <span className="inline-flex gap-0.5" aria-hidden="true">
        {flow.phases.map((phase, index) => (
          <span
            key={phase.id}
            className={`inline-block size-1.5 rounded-full ${
              index + 1 < position
                ? 'bg-emerald-600'
                : index + 1 === position
                  ? 'bg-blue-600'
                  : 'bg-muted-foreground/40'
            }`}
          />
        ))}
      </span>
    </span>
  );
}

function stageClass(status: string): string {
  if (status === DONE)
    return 'border-emerald-600/40 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300';
  if (status === IN_PROGRESS)
    return 'border-blue-600/50 bg-blue-50 text-blue-800 dark:bg-blue-950/40 dark:text-blue-200';
  if (status === ASSUMED) return 'border-dashed border-border text-muted-foreground';
  return 'border-border text-muted-foreground';
}

export function StageStrip({ context }: { context?: FlowContext }) {
  if (!hasConfidentFlow(context)) return null;

  return (
    <div
      data-testid="stage-strip"
      className="flex flex-wrap items-center gap-1 border-b border-border bg-muted/40 px-3.5 py-2"
    >
      {context.flow.phases.map((phase, index) => (
        <span key={phase.id} className="flex items-center gap-1">
          {index > 0 && <span className="text-xs text-muted-foreground">›</span>}
          <span
            title={`${phase.id}: ${phase.status}${phase.offSpine ? ' (off-spine)' : ''}`}
            className={`rounded-full border px-2 py-px font-mono text-[11px] ${stageClass(phase.status)}`}
          >
            {phase.label || phase.id}
            {/* Surfaced, never spliced into the chain by array order: an off-spine node has no honest
                position, and inventing one draws an edge that does not exist. */}
            {phase.offSpine ? ' ⚠' : ''}
          </span>
        </span>
      ))}
    </div>
  );
}
