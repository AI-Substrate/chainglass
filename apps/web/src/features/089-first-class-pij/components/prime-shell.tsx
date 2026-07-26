/**
 * A prime and what it governs — Plan 089 Phase 2 (T003).
 *
 * The ratified POC's outer block: a bordered shell headed by the prime's own seat, with one section
 * per child indented beneath it. This is the "each running sub-project reads as one block" goal made
 * literal — a human scanning the page sees N shells, not N×M rows.
 *
 * "governs N sections" counts the prime's children, not its descendants. A prime with three PMs
 * governs three sections however many workers sit under them, and that is the number that tells you
 * how many separate pieces of work are in flight.
 */
'use client';

import type { PrimeShell as PrimeShellModel } from '../lib/fleet-grouping';
import type { PijId } from '../types';
import { Freshness } from './freshness';
import { RoleChip, seatRole } from './role-chip';
import { FocusButton, ObservedState } from './seat-row';
import type { FlowContext } from './stage-strip';
import { TeamSection, shortenHome } from './team-section';

export function PrimeShell({
  shell,
  now,
  flowFor,
}: {
  shell: PrimeShellModel;
  now: number;
  flowFor?: (id: PijId) => FlowContext | undefined;
}) {
  const sectionCount = shell.sections.length;

  return (
    <div
      data-testid={`prime-shell-${shell.lead.id}`}
      className="mb-5 overflow-hidden rounded-xl border border-purple-300/60 bg-card dark:border-purple-400/30"
    >
      <div className="flex flex-wrap items-center gap-2.5 border-b border-purple-200/60 bg-purple-50/60 px-4 py-2.5 dark:border-purple-400/20 dark:bg-purple-950/20">
        <ObservedState placement={shell.lead} now={now} />
        <span className="font-mono text-[13px]" data-seat-id={shell.lead.id}>
          {shell.lead.id}
        </span>
        <RoleChip role={seatRole({ node: shell.lead.node, row: shell.lead.row })} />
        <span className="text-[11px] text-muted-foreground">
          governs {sectionCount} section{sectionCount === 1 ? '' : 's'} ·{' '}
          <span className="font-mono" title={shell.lead.row?.folder ?? shell.lead.node?.folder}>
            {shortenHome(shell.lead.row?.folder ?? shell.lead.node?.folder)}
          </span>
        </span>
        <span className="flex-1" />
        <Freshness at={shell.lead.row?.lastEventAt} now={now} />
        {/* The prime is a seat with a window like any other. It renders in this custom header rather
            than in a SeatRow, so without this line it would be the one visible seat in the workspace
            view with no focus affordance — a gap a reader would have to guess the meaning of. */}
        <FocusButton placement={shell.lead} />
      </div>

      <div className="ml-3.5 flex flex-col border-l-[3px] border-purple-300/60 px-3.5 pb-1.5 pt-3 dark:border-purple-400/30">
        {sectionCount === 0 ? (
          <div className="pb-2 text-[11px] text-muted-foreground">no children</div>
        ) : (
          shell.sections.map((section) => (
            <TeamSection
              key={section.lead.id}
              section={section}
              now={now}
              flow={flowFor?.(section.lead.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}
