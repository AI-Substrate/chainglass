/**
 * The pij observatory page — Plan 089 Phase 2 (T001).
 *
 * Two tabs, one data path. Everything both tabs render comes from `usePijFleet`, which is the only
 * thing in the browser that talks to `/api/pij/*` — the client never reaches the CLI or the store,
 * and there is no mutating call anywhere on this page (C-02, C-06).
 *
 * The workspace **path** arrives as a prop, resolved server-side. It is never rebuilt from the slug:
 * every one of the three routes takes a filesystem path (the tree route hands it straight to the CLI
 * as `cwd`, the flow route joins `docs/plans` onto it, the fleet route resolves it against each
 * seat's folder), and a slug in that position returns a confidently wrong answer — an empty fleet, or
 * chainglass's own tree labelled as somebody else's repo.
 */
'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useCallback, useEffect, useState } from 'react';
import { usePijFleet } from '../hooks/use-pij-fleet';
import { type FleetScope, FleetView } from './fleet-view';
import { RepoTree } from './repo-tree';

export interface PijPageClientProps {
  /** The workspace's absolute filesystem path. Resolved by the server component. */
  workspacePath: string;
  /** Display name for the header. Cosmetic — never a scoping key. */
  workspaceName: string;
}

export function PijPageClient({ workspacePath, workspaceName }: PijPageClientProps) {
  const [scope, setScope] = useState<FleetScope>('workspace');
  const [tab, setTab] = useState('fleet');
  const fleet = usePijFleet({ workspacePath, scope });

  /**
   * "Now" as state rather than `Date.now()` inline: every relative time on the page is derived from
   * one instant, so nothing renders as 3s ago beside 4s ago for the same event, and tests can pin it.
   */
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 5_000);
    return () => clearInterval(timer);
  }, []);

  const { refresh } = fleet;
  const onTabChange = useCallback(
    (next: string) => {
      setTab(next);
      // The tree and flow snapshots have no delta channel in this phase, so a tab change is the
      // natural moment to re-read them rather than polling a tab nobody is looking at.
      refresh();
    },
    [refresh]
  );

  return (
    <div className="flex h-full flex-col overflow-auto p-4">
      <header className="mb-3 flex flex-wrap items-baseline gap-3">
        <h1 className="text-base font-semibold">pij</h1>
        <span className="text-xs text-muted-foreground">
          {workspaceName} · <span className="font-mono">{workspacePath}</span>
        </span>
        <span className="flex-1" />
        <span
          data-testid="pij-connection-phase"
          className="text-xs text-muted-foreground"
          title={`spine seq ${fleet.seq}`}
        >
          {fleet.phase === 'live'
            ? '● live'
            : fleet.phase === 'connecting'
              ? '◌ connecting'
              : '◍ degraded'}
        </span>
      </header>

      <Tabs value={tab} onValueChange={onTabChange} className="flex-1">
        <TabsList variant="line">
          <TabsTrigger value="fleet">Fleet</TabsTrigger>
          <TabsTrigger value="tree">Repo tree</TabsTrigger>
        </TabsList>

        <TabsContent value="fleet">
          <FleetView
            rows={fleet.rows}
            tree={fleet.tree}
            status={fleet.status}
            workspacePath={workspacePath}
            now={now}
            scope={scope}
            onScopeChange={setScope}
            filteredOut={fleet.filteredOut}
            fetchError={fleet.errors.fleet}
          />
        </TabsContent>

        <TabsContent value="tree">
          <RepoTree roots={fleet.tree} error={fleet.errors.tree} workspacePath={workspacePath} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
