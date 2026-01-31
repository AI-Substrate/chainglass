/**
 * Legacy Agents Page Redirect - /agents
 *
 * Part of Plan 018: Agent Workspace Data Model Migration (Phase 3)
 *
 * Server component that redirects to the first workspace's agents page.
 * Per AC-15/AC-16: Uses 307 redirect + deprecation notice.
 * Per DYK-02: Shows simple error if no workspaces exist.
 *
 * This page exists for backwards compatibility. The new URL pattern is:
 * /workspaces/[slug]/agents
 */

import { WORKSPACE_DI_TOKENS } from '@chainglass/shared';
import type { IWorkspaceService } from '@chainglass/workflow';
import { AlertCircle, Bot, FolderPlus } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getContainer } from '../../../src/lib/bootstrap-singleton';

export const dynamic = 'force-dynamic';

export default async function LegacyAgentsRedirectPage() {
  const container = getContainer();
  const workspaceService = container.resolve<IWorkspaceService>(
    WORKSPACE_DI_TOKENS.WORKSPACE_SERVICE
  );

  // List all workspaces
  const workspaces = await workspaceService.list();

  // If no workspaces exist, show simple error per DYK-02
  if (workspaces.length === 0) {
    return (
      <div className="container mx-auto py-12">
        <div className="mx-auto max-w-md text-center">
          <AlertCircle className="mx-auto mb-4 h-16 w-16 text-muted-foreground" />
          <h1 className="mb-2 text-2xl font-bold">No Workspaces Found</h1>
          <p className="mb-6 text-muted-foreground">
            Agent sessions are stored per-workspace. Please add a workspace first.
          </p>
          <Link
            href="/workspaces"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-primary-foreground hover:bg-primary/90"
          >
            <FolderPlus className="h-5 w-5" />
            Add Workspace
          </Link>
        </div>
      </div>
    );
  }

  // Get first workspace slug
  const firstWorkspace = workspaces[0];

  // Log deprecation warning
  console.warn(
    `[/agents] DEPRECATED: /agents is deprecated. Redirecting to /workspaces/${firstWorkspace.slug}/agents. Please update your bookmarks to use /workspaces/[slug]/agents instead.`
  );

  // 307 redirect to workspace-scoped agents page
  redirect(`/workspaces/${firstWorkspace.slug}/agents`);
}
