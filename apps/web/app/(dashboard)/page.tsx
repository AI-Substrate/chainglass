/**
 * Landing Page — Workspace card grid with fleet status.
 *
 * Server Component with direct DI service call (DYK-P3-03).
 * Starred workspaces sorted first. Responsive grid.
 *
 * Phase 3: UI Overhaul — Plan 041: File Browser
 */

import { WORKSPACE_DI_TOKENS } from '@chainglass/shared';
import type { IWorkspaceService } from '@chainglass/workflow';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { FleetStatusBar } from '../../src/features/041-file-browser/components/fleet-status-bar';
import { WorkspaceCard } from '../../src/features/041-file-browser/components/workspace-card';
import { getContainer } from '../../src/lib/bootstrap-singleton';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const container = getContainer();
  const workspaceService = container.resolve<IWorkspaceService>(
    WORKSPACE_DI_TOKENS.WORKSPACE_SERVICE
  );

  const workspaces = await workspaceService.list();

  // Enrich with worktree info
  const enriched = await Promise.all(
    workspaces.map(async (ws) => {
      const info = await workspaceService.getInfo(ws.slug);
      return {
        slug: ws.slug,
        name: ws.name,
        path: ws.path,
        preferences: ws.toJSON().preferences,
        worktreeCount: info?.worktrees?.length ?? 0,
        worktreeNames: (info?.worktrees ?? []).map(
          (wt) => wt.branch || wt.path.split('/').pop() || wt.path
        ),
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

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">Your Workspaces</h1>
      </div>

      <FleetStatusBar />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {sorted.map((ws) => (
          <WorkspaceCard
            key={ws.slug}
            slug={ws.slug}
            name={ws.name}
            path={ws.path}
            preferences={ws.preferences}
            worktreeCount={ws.worktreeCount}
            worktreeNames={ws.worktreeCount <= 3 ? ws.worktreeNames : undefined}
          />
        ))}

        <Link
          href="/workspaces"
          className="flex items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 text-muted-foreground transition-colors hover:border-primary hover:text-primary"
        >
          <Plus className="h-5 w-5" />
          <span>Add workspace</span>
        </Link>
      </div>
    </div>
  );
}
