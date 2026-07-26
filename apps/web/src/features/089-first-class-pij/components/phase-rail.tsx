/**
 * The phase rail — Plan 089 Phase 3 (T004).
 *
 * One plan's spine, drawn left to right. Four rules govern it, and each exists because the obvious
 * implementation gets it wrong:
 *
 * 1. **Order comes from `FlowPhase.order`, never from array position.** Flow documents store their
 *    nodes NEWEST FIRST, so rendering `phases` in array order draws the plan backwards. `order` is the
 *    1-based position the reader computed by walking `next[]`, which is the only thing that knows the
 *    real sequence.
 *
 * 2. **Off-spine phases are excursions, not rail positions.** An `offSpine` node was unreachable by
 *    that walk. Splicing it in by array order would draw an edge that does not exist — a chain the
 *    plan never had, rendered as authoritatively as the real one. It is shown, below, unplaced.
 *
 * 3. **Reviews attach to the phase they branch off, not to the current one.** In 088 all three
 *    reviews branch off `ph4` while `nav.now` is `ph6`. Hanging them off the cursor is the specific
 *    misreading this component is written against: it would report Phase 6 as having been reviewed
 *    three times, when Phase 6 has not been reviewed at all.
 *
 * 4. **`activations` are PHASE activations.** There is no seat dimension anywhere in flow data, so
 *    calling them "coder activations" or drawing a face beside them would invent one. The label says
 *    what was counted: cursor entries into that node.
 *
 * `next` is `nav.next`, which fires no event and routes nothing. It is rendered, once, explicitly
 * marked advisory — a suggestion the document is carrying, never a claim about what happens next.
 */
'use client';

import type { FlowPhase, FlowReview, FlowSummary } from '../server/flow-reader.interface';

/** The one status word with a ruled meaning (C-09). Everything else is rendered, not interpreted. */
const DONE = 'done';
const IN_PROGRESS = 'in_progress';

export interface PhaseRailProps {
  flow: FlowSummary;
}

/**
 * The spine, in the order the plan actually runs.
 *
 * Sorts a COPY — `phases` belongs to the caller (and, upstream, to a snapshot that other components
 * are rendering from), and a component that reorders its own props in place is a bug that only shows
 * up somewhere else.
 */
export function spinePhases(phases: FlowPhase[]): FlowPhase[] {
  return phases.filter((phase) => !phase.offSpine).sort((a, b) => a.order - b.order);
}

/** Phases the `next[]` walk could not reach. Surfaced, never given a fabricated position. */
export function offSpinePhases(phases: FlowPhase[]): FlowPhase[] {
  return phases.filter((phase) => phase.offSpine).sort((a, b) => a.order - b.order);
}

/**
 * Where the cursor is, as a 1-based position on the spine, or `null` when it is not on the spine at
 * all (the cursor may sit on a chore or a review). `nowPhaseId` is the owning phase the reader already
 * resolved up the `branch_of` chain, so this never walks anything itself.
 */
export function railPosition(flow: FlowSummary): number | null {
  const spine = spinePhases(flow.phases);
  const index = spine.findIndex((phase) => phase.id === flow.nowPhaseId);
  if (index >= 0) return index + 1;
  const current = spine.findIndex((phase) => phase.current);
  return current >= 0 ? current + 1 : null;
}

/** The reviews that branch off a given phase. Keyed on `branch_of`, which is the only honest key. */
export function reviewsForPhase(reviews: FlowReview[], phaseId: string): FlowReview[] {
  return reviews.filter((review) => review.branchOf === phaseId);
}

function pipClass(phase: FlowPhase): string {
  if (phase.status === DONE)
    return 'border-emerald-600 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300';
  if (phase.status === IN_PROGRESS)
    return 'border-blue-600 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-200';
  // Everything else — `assumed`, `known`, and any word the CLI persisted without validating — is a
  // future, drawn as a future. Statuses are unenforced on write, so this branch is the common one.
  return 'border-dashed border-border text-muted-foreground';
}

function pipGlyph(phase: FlowPhase): string {
  if (phase.status === DONE) return '✓';
  if (phase.status === IN_PROGRESS) return '●';
  return String(phase.order);
}

function ExcursionChip({ review }: { review: FlowReview }) {
  return (
    <span
      data-testid={`rail-review-${review.id}`}
      data-branch-of={review.branchOf ?? ''}
      title={`${review.id} · branch_of ${review.branchOf ?? '(none)'} · ${review.status}`}
      className="inline-block rounded-full border border-dashed border-purple-500/50 px-1.5 py-px text-[10px] text-purple-700 dark:text-purple-300"
    >
      {review.id}
    </span>
  );
}

export function PhaseRail({ flow }: PhaseRailProps) {
  const spine = spinePhases(flow.phases);
  const strays = offSpinePhases(flow.phases);
  const position = railPosition(flow);
  // Reviews that branch off nothing sit ON the spine; they are listed apart rather than pinned to a
  // phase, because a review with no `branch_of` has not told us which phase it belongs to.
  const unattached = flow.reviews.filter((review) => !review.branchOf);

  return (
    <div data-testid={`phase-rail-${flow.planFolder}`} className="mt-2">
      <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span data-testid="rail-position">
          {position === null
            ? `cursor off the spine (nav.now ${flow.now ?? '—'})`
            : `phase ${position} of ${flow.phasesTotal}`}
        </span>
        <span data-testid="rail-done">
          {flow.phasesDone} of {flow.phasesTotal} done
        </span>
        {/* Completion states its own basis: `nav.bag.status`, or the terminal node when there is no
            bag. Never the file set — a folder full of artifacts proves nothing about a flow. */}
        <span data-testid="rail-completion">
          {flow.completion} · from{' '}
          <span className="font-mono">
            {flow.completionSource === 'none' ? 'no source' : flow.completionSource}
          </span>
        </span>
        {flow.next ? (
          <span data-testid="rail-next" className="italic">
            advisory next: <span className="font-mono not-italic">{flow.next}</span> (nav.next fires
            nothing)
          </span>
        ) : null}
      </div>

      <ol className="flex flex-wrap items-start gap-x-1 gap-y-3">
        {spine.map((phase, index) => {
          const attached = reviewsForPhase(flow.reviews, phase.id);
          return (
            <li
              key={phase.id}
              data-testid={`rail-phase-${phase.id}`}
              data-order={phase.order}
              className="flex items-start"
            >
              {index > 0 ? (
                <span
                  aria-hidden="true"
                  className={`mt-3.5 h-0.5 w-4 ${
                    spine[index - 1].status === DONE ? 'bg-emerald-600/60' : 'bg-border'
                  }`}
                />
              ) : null}
              <span className="flex w-28 flex-col items-center gap-1">
                <span
                  title={`${phase.id}: ${phase.status}`}
                  className={`flex size-7 items-center justify-center rounded-full border-2 text-[11px] ${pipClass(phase)}`}
                >
                  {pipGlyph(phase)}
                </span>
                <span className="text-center text-[11px] leading-tight text-muted-foreground">
                  {phase.label || phase.id}
                </span>
                {phase.activations > 0 ? (
                  <span
                    data-testid={`rail-activations-${phase.id}`}
                    className="text-[10px] text-muted-foreground"
                  >
                    ↻ {phase.activations} phase activation{phase.activations === 1 ? '' : 's'}
                  </span>
                ) : null}
                {attached.length > 0 ? (
                  <span className="flex flex-wrap justify-center gap-0.5">
                    {attached.map((review) => (
                      <ExcursionChip key={review.id} review={review} />
                    ))}
                  </span>
                ) : null}
              </span>
            </li>
          );
        })}
      </ol>

      {strays.length > 0 ? (
        <p data-testid="rail-off-spine" className="mt-3 text-xs text-muted-foreground">
          ⚠ off the spine, position unknown:{' '}
          {strays.map((phase) => (
            <span key={phase.id} className="mr-1 font-mono">
              {phase.id}
            </span>
          ))}
          — the `next[]` walk never reached these, so the rail does not place them.
        </p>
      ) : null}

      {unattached.length > 0 ? (
        <p data-testid="rail-unattached-reviews" className="mt-2 text-xs text-muted-foreground">
          reviews on the spine:{' '}
          {unattached.map((review) => (
            <ExcursionChip key={review.id} review={review} />
          ))}
        </p>
      ) : null}
    </div>
  );
}
