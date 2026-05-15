/**
 * Landing Page — Workspace card grid with fleet status.
 *
 * Server Component with direct DI service call (DYK-P3-03).
 * Starred workspaces sorted first. Responsive grid.
 *
 * Phase 3: UI Overhaul — Plan 041: File Browser
 */

import { Button } from '@/components/ui/button';
import { WORKSPACE_DI_TOKENS } from '@chainglass/shared';
import type { IWorkspaceService } from '@chainglass/workflow';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { FleetStatusBar } from '../../src/features/041-file-browser/components/fleet-status-bar';
import { WorkspaceCard } from '../../src/features/041-file-browser/components/workspace-card';
import { WorkspaceGrid } from '../../src/features/041-file-browser/components/workspace-grid';
import { getContainer } from '../../src/lib/bootstrap-singleton';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const container = getContainer();
  const workspaceService = container.resolve<IWorkspaceService>(
    WORKSPACE_DI_TOKENS.WORKSPACE_SERVICE
  );

  const workspaces = await workspaceService.list();

  const enriched = await Promise.all(
    workspaces.map(async (ws) => {
      const info = await workspaceService.getInfo(ws.slug);
      const names = (info?.worktrees ?? []).map(
        (wt) => wt.branch || wt.path.split('/').pop() || wt.path
      );
      return {
        slug: ws.slug,
        name: ws.name,
        path: ws.path,
        preferences: ws.toJSON().preferences,
        worktreeCount: info?.worktrees?.length ?? 0,
        searchableNames: names,
      };
    })
  );

  // Sort: starred first (by sortOrder), then unstarred (by sortOrder)
  const sorted = [...enriched].sort((a, b) => {
    if (a.preferences.starred !== b.preferences.starred) {
      return a.preferences.starred ? -1 : 1;
    }
    return a.preferences.sortOrder - b.preferences.sortOrder;
  });

  const items = sorted.map((ws) => ({
    slug: ws.slug,
    name: ws.name,
    path: ws.path,
    searchableNames: ws.searchableNames,
  }));

  const cards = sorted.map((ws) => (
    <WorkspaceCard
      key={ws.slug}
      slug={ws.slug}
      name={ws.name}
      path={ws.path}
      preferences={ws.preferences}
      worktreeCount={ws.worktreeCount}
      worktreeNames={ws.worktreeCount <= 3 ? ws.searchableNames : undefined}
    />
  ));

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Your Workspaces</h1>
        <Button asChild size="sm">
          <Link href="/workspaces">
            <Plus className="h-4 w-4" />
            <span>Add workspace</span>
          </Link>
        </Button>
      </div>

      <FleetStatusBar />

      <WorkspaceGrid items={items} cards={cards} />
    </div>
  );
}
