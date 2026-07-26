/**
 * One section — Plan 089 Phase 2 (T003).
 *
 * A section is one child of a prime: either a PM with a team beneath it, or a standalone worker. The
 * ratified POC's anatomy, top to bottom: flow chip · assignment title · seat count, then the
 * `project:` / `worktree:` meta line, then the stage strip, then the seats — the lead exactly once,
 * with its members indented beneath it.
 *
 * `project:` shows the plan folder the join reached, and shows an em dash when it reached none. It is
 * never the assignment title dressed up as a project: the title is prose a human typed, and printing
 * it in a field labelled "project" would assert a linkage that does not exist.
 */
'use client';

import { type FleetSection, seatTask } from '../lib/fleet-grouping';
import { SeatRow, SeatRowHeader } from './seat-row';
import { FlowChip, type FlowContext, StageStrip } from './stage-strip';

/** `/Users/jordanknight/x` → `~/x`. Cosmetic only; the full path stays in the title attribute. */
export function shortenHome(path: string | undefined): string {
  if (!path) return '—';
  return path.replace(/^\/Users\/[^/]+\//, '~/');
}

export function TeamSection({
  section,
  now,
  flow,
}: {
  section: FleetSection;
  now: number;
  flow?: FlowContext;
}) {
  const lead = section.lead;
  const title = seatTask(lead) ?? '(no assignment)';
  const folder = lead.row?.folder ?? lead.node?.folder;

  return (
    <div
      data-testid={`team-section-${lead.id}`}
      className="mb-3 overflow-hidden rounded-lg border border-border bg-card"
    >
      <div className="flex items-center gap-2 border-b border-border bg-muted/60 px-3.5 py-2">
        <FlowChip context={flow} />
        <span className="flex-1 truncate text-xs" title={title}>
          {title}
        </span>
        {section.unplaced ? (
          <span
            className="rounded-full border border-border px-1.5 text-[10px] text-muted-foreground"
            title="in the fleet, not yet placed by the tree snapshot"
          >
            unplaced
          </span>
        ) : null}
        <span className="text-xs text-muted-foreground">
          {section.seatCount} seat{section.seatCount === 1 ? '' : 's'}
        </span>
      </div>

      <div className="border-b border-border/60 bg-muted/30 px-3.5 py-1 text-[11px] text-muted-foreground">
        <span>
          project:{' '}
          {flow?.join.planFolder ? (
            <span className="font-medium text-foreground">{flow.join.planFolder}</span>
          ) : (
            <span className="text-muted-foreground/70">—</span>
          )}
        </span>
        <span className="ml-4" title={folder}>
          worktree: <span className="font-mono">{shortenHome(folder)}</span>
        </span>
      </div>

      <StageStrip context={flow} />
      <SeatRowHeader />
      <SeatRow placement={lead} now={now} />
      {section.members.map((member) => (
        <SeatRow key={member.id} placement={member} now={now} />
      ))}
    </div>
  );
}
