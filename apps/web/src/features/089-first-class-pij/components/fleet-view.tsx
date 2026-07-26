/**
 * The fleet — Plan 089 Phase 2 (T003).
 *
 * The ratified POC's Fleet tab, for real: prime shells governing one section per child, an "Outside
 * any prime" band for everything else, a scope toggle, and the four empty states.
 *
 * Two structural rules are worth stating where they are enforced rather than only where they are
 * implemented (`lib/fleet-grouping.ts`):
 *
 * - **Grouping comes from the tree.** Not from ids, not from folders, not from assignment titles.
 * - **Every seat is drawn exactly once.** The grouping returns its draw order as a flat list of ids
 *   precisely so a test can assert that, and so this component has no opportunity to render a seat a
 *   second time "for context".
 *
 * The **global** scope is a deliberately different shape: a flat list, because the tree read is
 * repo-scoped and would place almost none of a machine-wide fleet. Pretending otherwise would draw a
 * forest of one-seat sections and imply structure that was never read.
 */
'use client';

import { useMemo } from 'react';
import { SeatFocusProvider } from '../hooks/use-seat-focus';
import { groupFleet, isWithinIdleWindow } from '../lib/fleet-grouping';
import type { PijTreeNode } from '../server/pij-records.interface';
import type { FleetRow, PijId, PollerStatus } from '../types';
import { FleetEmptyState } from './fleet-empty-state';
import { StalenessBanner } from './freshness';
import { PrimeShell } from './prime-shell';
import { SeatRow, SeatRowHeader } from './seat-row';
import type { FlowContext } from './stage-strip';
import { TeamSection } from './team-section';

export type FleetScope = 'workspace' | 'global';

export interface FleetViewProps {
  rows: FleetRow[];
  tree: PijTreeNode[];
  status: PollerStatus | null;
  /** The absolute path this view is scoped to. Shown when the filter matched nothing. */
  workspacePath: string;
  /** Injected so every relative time in the subtree is deterministic under test. */
  now: number;
  scope: FleetScope;
  onScopeChange: (scope: FleetScope) => void;
  /** Delta rows the containment filter rejected since mount. */
  filteredOut: number;
  fetchError?: string | null;
  /**
   * The team→flow join for a section lead. Absent for every seat today — see `joinTeamToFlow` for the
   * measured reason — which is why "⛭ no flow" is the normal rendering rather than a fallback.
   */
  flowFor?: (id: PijId) => FlowContext | undefined;
  /** Test seam for the focus route. Production uses the global `fetch`. */
  focusFetchImpl?: typeof fetch;
}

export function FleetView(props: FleetViewProps) {
  const { rows, tree, status, now, scope } = props;

  const grouping = useMemo(
    () => groupFleet({ rows, tree: scope === 'global' ? [] : tree, now }),
    [rows, tree, now, scope]
  );

  const globalRows = useMemo(
    () =>
      rows
        .filter((row) => isWithinIdleWindow(row, now))
        .sort((a, b) => (b.lastEventAt ?? '').localeCompare(a.lastEventAt ?? '')),
    [rows, now]
  );

  const visibleCount = scope === 'global' ? globalRows.length : grouping.seatIds.length;

  return (
    <div data-testid="pij-fleet-view">
      <StalenessBanner status={status} now={now} />

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="inline-flex overflow-hidden rounded-md border border-border">
          <button
            type="button"
            aria-pressed={scope === 'workspace'}
            onClick={() => props.onScopeChange('workspace')}
            className={`px-3 py-1 text-xs ${scope === 'workspace' ? 'bg-accent text-accent-foreground' : 'bg-card text-muted-foreground'}`}
          >
            this workspace
          </button>
          <button
            type="button"
            aria-pressed={scope === 'global'}
            onClick={() => props.onScopeChange('global')}
            className={`px-3 py-1 text-xs ${scope === 'global' ? 'bg-accent text-accent-foreground' : 'bg-card text-muted-foreground'}`}
          >
            all (hot tier)
          </button>
        </div>

        <span className="text-xs text-muted-foreground" data-testid="fleet-count">
          {scope === 'global'
            ? `${visibleCount} seats · hot tier, idle < 2d, all folders`
            : `${grouping.primes.length} prime · ${visibleCount} seats · this workspace`}
        </span>

        {grouping.hiddenByIdle > 0 && scope !== 'global' ? (
          <span className="text-xs text-muted-foreground" data-testid="fleet-hidden-count">
            {grouping.hiddenByIdle} hidden · last event over 48h ago
          </span>
        ) : null}

        {props.filteredOut > 0 ? (
          <span
            className="text-xs text-muted-foreground"
            data-testid="fleet-filtered-out"
            title="live updates carrying seats from other workspaces — the channel is shared by design"
          >
            {props.filteredOut} update{props.filteredOut === 1 ? '' : 's'} filtered out (other
            workspaces)
          </span>
        ) : null}
      </div>

      {/*
        Two counts, deliberately. `visibleCount` is what the list area drew; `rowCount` is the scoped
        snapshot before the idle filter. Handing the post-filter count to both would report "no seats
        matched this workspace" for a workspace whose seats are all simply quiet — the filter's own
        doing, reported as a path mismatch.
      */}
      <FleetEmptyState
        visibleCount={visibleCount}
        rowCount={rows.length}
        scope={scope}
        status={status}
        workspacePath={props.workspacePath}
        now={now}
        fetchError={props.fetchError}
      />

      {scope === 'global' ? (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <SeatRowHeader />
          {globalRows.map((row) => (
            <SeatRow key={row.id} placement={{ id: row.id, row, depth: 0 }} now={now} />
          ))}
        </div>
      ) : (
        /* The focus affordance exists ONLY here (C-06, T006). The global branch above mounts no
           provider, so every row in it renders no button — an absence by construction rather than a
           conditional someone can forget: there is no workspace up there to check containment
           against, and a button that cannot know whether it is allowed is a button that lies. */
        <SeatFocusProvider workspacePath={props.workspacePath} fetchImpl={props.focusFetchImpl}>
          {grouping.primes.map((shell) => (
            <PrimeShell key={shell.lead.id} shell={shell} now={now} flowFor={props.flowFor} />
          ))}

          {grouping.loose.length > 0 ? (
            <>
              <h3 className="mb-2 mt-2 text-[13px] font-medium text-muted-foreground">
                Outside any prime (unadopted roots)
              </h3>
              {grouping.loose.map((section) => (
                <TeamSection
                  key={section.lead.id}
                  section={section}
                  now={now}
                  flow={props.flowFor?.(section.lead.id)}
                />
              ))}
            </>
          ) : null}
        </SeatFocusProvider>
      )}
    </div>
  );
}
