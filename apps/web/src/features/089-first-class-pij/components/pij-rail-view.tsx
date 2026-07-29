'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { type FetchLike, usePijFleet } from '../hooks/use-pij-fleet';
import { usePijStatus } from '../hooks/use-pij-status';
import { SeatFocusProvider } from '../hooks/use-seat-focus';
import {
  type RailFleetSection,
  type RailSeatPlacement,
  groupRailFleet,
  seatTask,
} from '../lib/fleet-grouping';
import { formatElapsed } from '../lib/relative-time';
import type { PijTreeNode } from '../server/pij-records.interface';
import {
  type PijRailContractSeams,
  type QuestionDecision,
  type SeatRole,
  type SeatStatus,
  productionContractSeams,
  resolveQuestionStrip,
} from '../server/pij-status.contract';
import type { FleetRow, PijStatusRecord } from '../types';
import { FocusResult, useSeatFocusAffordance } from './seat-row';

const DOT_CLASS: Record<string, string> = {
  active: 'bg-emerald-600',
  working: 'bg-emerald-600',
  blocked: 'bg-red-600 ring-2 ring-red-600/15',
  question: 'bg-violet-600 ring-2 ring-violet-600/15',
  stopped: 'bg-muted-foreground/50',
  dead: 'bg-muted-foreground/50',
};

export interface PijRailViewProps {
  rows: FleetRow[];
  tree: PijTreeNode[];
  snapshotStatuses: readonly PijStatusRecord[];
  now: number;
  workspacePath: string;
  focusFetchImpl?: typeof fetch;
  contracts?: PijRailContractSeams;
}

export interface PijRailPanelProps {
  mainPath: string;
  worktreePath: string;
  refreshToken?: number;
  fleetFetchImpl?: FetchLike;
  focusFetchImpl?: typeof fetch;
  clock?: () => number;
  contracts?: PijRailContractSeams;
}

interface QuestionEntry {
  placement: RailSeatPlacement;
  decision: QuestionDecision;
}

function placementRecord(placement: RailSeatPlacement): Record<string, unknown> {
  return {
    ...(placement.node ?? {}),
    ...(placement.row?.extra ?? {}),
    ...(placement.row ?? {}),
  };
}

function roleLabel(role: SeatRole): string {
  if (role.kind === 'absent') return 'role unknown';
  if (role.role === 'pm') return 'PM';
  if (role.role === 'prime') return 'Prime · main';
  return 'worker';
}

function RoleBadge({ role }: { role: SeatRole }) {
  const reason = role.kind === 'absent' ? role.reason : 'current';
  return (
    <span
      data-role-reason={reason}
      className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-muted-foreground"
    >
      {roleLabel(role)}
    </span>
  );
}

function SeatDot({ placement }: { placement: RailSeatPlacement }) {
  const state = placement.row?.badge ?? placement.row?.state ?? 'unknown';
  return (
    <span
      aria-hidden="true"
      className={`size-1.5 shrink-0 rounded-full ${DOT_CLASS[state] ?? 'bg-muted-foreground'}`}
    />
  );
}

function StatusSummary({
  placement,
  status,
}: {
  placement: RailSeatPlacement;
  status: SeatStatus;
}) {
  const record = status.status;
  const stale = status.reason === 'status-stale';

  return (
    <div
      data-testid={`pij-status-${status.reason}-${placement.id}`}
      data-reason={status.reason}
      className="px-2.5 pb-2 pl-8"
    >
      {record ? (
        <>
          <div className="flex min-w-0 gap-1.5 text-[11px]">
            <span className="shrink-0 pt-0.5 text-[9px] font-extrabold tracking-wider text-muted-foreground">
              NOW
            </span>
            <span className="min-w-0 truncate" title={record.prev}>
              {record.prev}
            </span>
          </div>
          <div className="flex min-w-0 gap-1.5 text-[11px] text-muted-foreground">
            <span className="shrink-0 pt-0.5 text-[9px] font-extrabold tracking-wider">NEXT</span>
            <span className="min-w-0 truncate" title={record.next}>
              {record.next}
            </span>
          </div>
          <div
            className={`mt-0.5 pl-8 text-[9.5px] ${stale ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground'}`}
          >
            updated {formatAge(status.ageMs)}
            {stale ? ' — watchdog will nudge' : ''}
          </div>
        </>
      ) : (
        <div className="text-[10px] text-muted-foreground">{statusAbsenceCopy(status.reason)}</div>
      )}
    </div>
  );
}

function statusAbsenceCopy(reason: SeatStatus['reason']): string {
  switch (reason) {
    case 'not-a-pm':
      return 'PM status not applicable';
    case 'role-unknown':
      return 'PM status unavailable — role unknown';
    case 'no-status-yet':
      return 'PM status not written yet';
    case 'status-stale':
      return 'PM status is stale';
    case 'current':
      return 'PM status current';
  }
}

function formatAge(ageMs: number | undefined): string {
  if (ageMs === undefined) return '—';
  const seconds = Math.max(0, Math.round(ageMs / 1000));
  if (seconds < 90) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 90) return `${minutes}m ago`;
  return `${Math.round(minutes / 60)}h ago`;
}

function questionFor(
  placement: RailSeatPlacement,
  contracts: PijRailContractSeams,
  now: number
): QuestionDecision {
  return contracts.question.read(placementRecord(placement), now);
}

function SeatHeader({
  placement,
  question,
}: {
  placement: RailSeatPlacement;
  question: QuestionDecision;
}) {
  const state = placement.row?.badge ?? placement.row?.state ?? 'unknown';
  const focus = useSeatFocusAffordance(placement);
  return (
    <div>
      <button
        type="button"
        data-testid={`focus-seat-${placement.id}`}
        data-state={state}
        disabled={!focus.inWorkspace || focus.busy}
        title={focus.title}
        onClick={() => focus.available && focus.focus.focus(placement.id)}
        className="flex w-full min-w-0 items-center gap-1.5 px-2.5 py-1.5 text-left hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span aria-hidden="true" className="shrink-0 text-[9px] text-muted-foreground">
          ▾
        </span>
        <SeatDot placement={placement} />
        <span className="min-w-0 flex-1 truncate font-mono text-[11px]" title={placement.id}>
          {placement.id}
        </span>
        {question.placement === 'strip' ? (
          <span className="shrink-0 rounded bg-violet-100 px-1 py-0.5 text-[9px] font-bold text-violet-700 dark:bg-violet-950/40 dark:text-violet-300">
            ? needs you
          </span>
        ) : null}
        <RoleBadge role={placement.role} />
      </button>
      <FocusResult placement={placement} />
    </div>
  );
}

function WorkerRow({
  placement,
  question,
  now,
}: {
  placement: RailSeatPlacement;
  question: QuestionDecision;
  now: number;
}) {
  const row = placement.row;
  const state = row?.badge ?? row?.state ?? 'unknown';
  const task = seatTask(placement) ?? row?.activity ?? 'no task read';
  const folder = row?.folder ?? placement.node?.folder;
  const worktree = folder?.split('/').filter(Boolean).at(-1);
  const inline = question.reason === 'blocked-note-inline' ? question : null;
  const focus = useSeatFocusAffordance(placement);

  return (
    <div
      data-testid={`pij-worker-${placement.id}`}
      data-state={state}
      className={`border-t border-border/60 px-2.5 py-1 ${
        state === 'blocked'
          ? 'bg-red-50/70 dark:bg-red-950/20'
          : state === 'question'
            ? 'bg-violet-50/70 dark:bg-violet-950/20'
            : ''
      }`}
    >
      <button
        type="button"
        data-testid={`focus-seat-${placement.id}`}
        disabled={!focus.inWorkspace || focus.busy}
        title={focus.title}
        onClick={() => focus.available && focus.focus.focus(placement.id)}
        className="flex w-full min-w-0 items-center gap-1.5 text-left text-[11px] disabled:cursor-not-allowed disabled:opacity-50"
      >
        <SeatDot placement={placement} />
        <span className="min-w-0 shrink truncate font-mono" title={placement.id}>
          {placement.id}
        </span>
        <span className="min-w-0 flex-1 truncate text-muted-foreground" title={task}>
          {task}
        </span>
        {worktree ? (
          <span
            className="min-w-0 shrink truncate rounded bg-muted px-1 font-mono text-[9.5px] text-muted-foreground"
            title={folder}
          >
            ⑂ {worktree}
          </span>
        ) : null}
        <span className="shrink-0 rounded bg-muted px-1 text-[9px] font-bold uppercase text-muted-foreground">
          {state}
        </span>
        <span className="shrink-0 text-[9.5px] text-muted-foreground">
          {formatElapsed(row?.lastEventAt, now)}
        </span>
      </button>
      {inline ? (
        <div
          data-testid={`pij-blocked-note-${placement.id}`}
          data-reason={inline.reason}
          className="mt-0.5 truncate pl-3 text-[10px] font-medium text-red-700 dark:text-red-400"
          title={inline.text}
        >
          {inline.text}
        </div>
      ) : null}
      <FocusResult placement={placement} />
    </div>
  );
}

function TeamCard({
  section,
  now,
  status,
  contracts,
}: {
  section: RailFleetSection;
  now: number;
  status: SeatStatus;
  contracts: PijRailContractSeams;
}) {
  const leadQuestion = questionFor(section.lead, contracts, now);
  const project = seatTask(section.lead) ?? 'project not read';

  return (
    <div
      data-testid={`pij-team-${section.lead.id}`}
      className="mb-1.5 overflow-hidden rounded-lg border border-border bg-card"
    >
      <SeatHeader placement={section.lead} question={leadQuestion} />
      <div className="truncate px-2.5 pb-1 pl-8 text-[10px] text-muted-foreground" title={project}>
        {project}
      </div>
      <StatusSummary placement={section.lead} status={status} />
      {leadQuestion.reason === 'blocked-note-inline' ? (
        <div
          data-testid={`pij-blocked-note-${section.lead.id}`}
          data-reason={leadQuestion.reason}
          className="truncate border-t border-red-200 bg-red-50 px-2.5 py-1 text-[10px] font-medium text-red-700 dark:border-red-900 dark:bg-red-950/20 dark:text-red-400"
          title={leadQuestion.text}
        >
          {leadQuestion.text}
        </div>
      ) : null}
      {section.members.map((member) => (
        <WorkerRow
          key={member.id}
          placement={member}
          question={questionFor(member, contracts, now)}
          now={now}
        />
      ))}
    </div>
  );
}

function allPlacements(grouping: ReturnType<typeof groupRailFleet>): RailSeatPlacement[] {
  return [
    ...grouping.primes.flatMap((prime) => [
      prime.lead,
      ...prime.sections.flatMap((section) => [section.lead, ...section.members]),
    ]),
    ...grouping.loose.flatMap((section) => [section.lead, ...section.members]),
  ];
}

function NeedsYouStrip({ entries, now }: { entries: QuestionEntry[]; now: number }) {
  const strip = resolveQuestionStrip(entries.map((entry) => entry.decision));
  if (strip.reason === 'strip-empty-declared-only') {
    return (
      <div
        data-testid="pij-needs-you-empty"
        data-reason={strip.reason}
        className="mb-1.5 px-2 py-1 text-[10px] text-muted-foreground"
      >
        no declared questions
      </div>
    );
  }

  return (
    <div
      data-testid="pij-needs-you"
      className="mb-1.5 overflow-hidden rounded-lg border border-violet-300 bg-violet-50 dark:border-violet-800 dark:bg-violet-950/30"
    >
      <div className="px-2.5 pb-0.5 pt-1 text-[9px] font-extrabold tracking-wider text-violet-700 dark:text-violet-300">
        NEEDS YOU ({entries.length})
      </div>
      {entries.map((entry) => (
        <NeedsYouEntry key={entry.placement.id} entry={entry} now={now} />
      ))}
    </div>
  );
}

function NeedsYouEntry({ entry, now }: { entry: QuestionEntry; now: number }) {
  const { placement, decision } = entry;
  const focus = useSeatFocusAffordance(placement);
  const aged = decision.reason === 'declared-note' && decision.aged;

  return (
    <div>
      <button
        type="button"
        data-testid={`pij-question-${placement.id}`}
        data-reason={decision.reason}
        data-aged={aged || undefined}
        disabled={!focus.inWorkspace || focus.busy}
        title={focus.title}
        onClick={() => focus.available && focus.focus.focus(placement.id)}
        className="flex w-full min-w-0 items-baseline gap-1.5 px-2.5 py-1 text-left text-[11px] hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-violet-900/30"
      >
        <span className="min-w-0 shrink truncate font-mono" title={placement.id}>
          {placement.id.replace(/^pij-/, '')}
        </span>
        <span
          className="min-w-0 flex-1 truncate text-violet-700 dark:text-violet-300"
          title={'text' in decision ? decision.text : undefined}
        >
          {'text' in decision ? decision.text : ''}
        </span>
        <span
          className={`shrink-0 text-[9.5px] ${
            aged ? 'font-bold text-violet-700 dark:text-violet-300' : 'text-muted-foreground'
          }`}
        >
          {'at' in decision ? `asked ${formatElapsed(decision.at, now)}` : 'age unknown'}
        </span>
      </button>
      <FocusResult placement={placement} testIdPrefix="focus-question-result" />
    </div>
  );
}

export function PijRailView({
  rows,
  tree,
  snapshotStatuses,
  now,
  workspacePath,
  focusFetchImpl,
  contracts = productionContractSeams,
}: PijRailViewProps) {
  const grouping = useMemo(
    () => groupRailFleet({ rows, tree, now, contracts }),
    [rows, tree, now, contracts]
  );
  const status = usePijStatus({
    snapshot: snapshotStatuses,
    now: () => now,
    contracts,
  });
  const placements = useMemo(() => allPlacements(grouping), [grouping]);
  const questions = placements
    .map((placement) => ({
      placement,
      decision: questionFor(placement, contracts, now),
    }))
    .filter((entry): entry is QuestionEntry => entry.decision.placement === 'strip');
  const primeCount = placements.filter(
    (placement) => placement.role.kind === 'known' && placement.role.role === 'prime'
  ).length;
  const pmCount = placements.filter(
    (placement) => placement.role.kind === 'known' && placement.role.role === 'pm'
  ).length;
  const workerCount = placements.filter(
    (placement) => placement.role.kind === 'known' && placement.role.role === 'worker'
  ).length;
  const blockedCount = placements.filter(
    (placement) => (placement.row?.badge ?? placement.row?.state) === 'blocked'
  ).length;

  return (
    <SeatFocusProvider workspacePath={workspacePath} fetchImpl={focusFetchImpl}>
      <div data-testid="pij-rail-view" className="flex min-h-full flex-col bg-muted/20">
        <div className="flex-1 overflow-y-auto p-2">
          <NeedsYouStrip entries={questions} now={now} />

          {grouping.primes.map((prime) => {
            const question = questionFor(prime.lead, contracts, now);
            return (
              <div
                key={prime.lead.id}
                data-testid={`pij-prime-${prime.lead.id}`}
                className="mb-1.5 overflow-hidden rounded-lg border border-violet-300/70 bg-card dark:border-violet-800"
              >
                <SeatHeader placement={prime.lead} question={question} />
                {prime.sections.map((section) => (
                  <div key={section.lead.id} className="px-1.5">
                    <TeamCard
                      section={section}
                      now={now}
                      status={status.resolve(section.lead.id, section.lead.role)}
                      contracts={contracts}
                    />
                  </div>
                ))}
              </div>
            );
          })}

          {grouping.loose.map((section) => (
            <TeamCard
              key={section.lead.id}
              section={section}
              now={now}
              status={status.resolve(section.lead.id, section.lead.role)}
              contracts={contracts}
            />
          ))}
        </div>

        <div
          data-testid="pij-hot-count"
          className="flex flex-wrap justify-between gap-x-2 border-t border-border bg-card px-2.5 py-1.5 text-[10px] text-muted-foreground"
        >
          <span>
            <b className="font-semibold text-foreground">{primeCount}</b> prime ·{' '}
            <b className="font-semibold text-foreground">{pmCount}</b> PM ·{' '}
            <b className="font-semibold text-foreground">{workerCount}</b> workers
          </span>
          <span>
            <b className="font-semibold text-violet-700 dark:text-violet-300">{questions.length}</b>{' '}
            asking · <b className="font-semibold text-red-700 dark:text-red-400">{blockedCount}</b>{' '}
            blocked
          </span>
          <span>{placements.length} seats currently hot</span>
        </div>
      </div>
    </SeatFocusProvider>
  );
}

export function PijRailPanel({
  mainPath,
  worktreePath,
  refreshToken = 0,
  fleetFetchImpl,
  focusFetchImpl,
  clock = Date.now,
  contracts,
}: PijRailPanelProps) {
  const fleet = usePijFleet({
    workspacePath: mainPath,
    fetchImpl: fleetFetchImpl,
  });
  const [now, setNow] = useState(clock);
  const refreshTokenRef = useRef(refreshToken);

  useEffect(() => {
    const timer = setInterval(() => setNow(clock()), 5_000);
    return () => clearInterval(timer);
  }, [clock]);

  useEffect(() => {
    if (refreshTokenRef.current === refreshToken) return;
    refreshTokenRef.current = refreshToken;
    fleet.refresh();
  }, [fleet.refresh, refreshToken]);

  const mainName = pathName(mainPath);
  const worktreeName = pathName(worktreePath);

  return (
    <div className="flex min-h-full flex-col">
      <div
        data-testid="pij-rail-scope"
        className="flex min-w-0 items-center justify-between gap-2 border-b border-border px-2.5 py-1 text-[10.5px] text-muted-foreground"
      >
        <span className="min-w-0 truncate" title={mainPath}>
          <b className="font-semibold text-foreground">{mainName}</b> · this project only
        </span>
        {worktreePath !== mainPath ? (
          <span
            className="min-w-0 shrink truncate text-amber-700 dark:text-amber-400"
            title={`You are in worktree ${worktreeName}. The fleet resolves against ${mainPath}.`}
          >
            ⑂ {worktreeName} → main
          </span>
        ) : null}
      </div>
      <div
        data-testid="pij-rail-phase"
        data-phase={fleet.phase}
        className="border-b border-border px-2.5 py-1 text-[10px] text-muted-foreground"
      >
        {fleet.phase}
        {fleet.errors.fleet ? ` · ${fleet.errors.fleet}` : ''}
      </div>
      <PijRailView
        rows={fleet.rows}
        tree={fleet.tree}
        snapshotStatuses={fleet.statuses}
        now={now}
        workspacePath={mainPath}
        focusFetchImpl={focusFetchImpl}
        contracts={contracts}
      />
    </div>
  );
}

function pathName(path: string): string {
  return path.split('/').filter(Boolean).at(-1) ?? path;
}
