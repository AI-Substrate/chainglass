/**
 * Workspaces List Page - /workspaces
 *
 * Part of Plan 014: Workspaces - Phase 6: Web UI
 *
 * Server component that lists all workspaces with add form.
 * Uses Server Actions for mutations.
 */

import { WORKSPACE_DI_TOKENS } from '@chainglass/shared';
import type { IWorkspaceService } from '@chainglass/workflow';
import { FolderOpen, Plus } from 'lucide-react';
import Link from 'next/link';
import { WorkspaceAddForm } from '../../../src/components/workspaces/workspace-add-form';
import { WorkspaceRemoveButton } from '../../../src/components/workspaces/workspace-remove-button';
import { getContainer } from '../../../src/lib/bootstrap-singleton';

export const dynamic = 'force-dynamic';

export default async function WorkspacesPage() {
  const container = getContainer();
  const workspaceService = container.resolve<IWorkspaceService>(
    WORKSPACE_DI_TOKENS.WORKSPACE_SERVICE
  );

  const workspaces = await workspaceService.list();

  return (
    <div className="container mx-auto py-6">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FolderOpen className="h-8 w-8" />
          <h1 className="text-3xl font-bold">Workspaces</h1>
        </div>
      </div>

      {/* Add Workspace Form */}
      <div className="mb-8 rounded-lg border p-6">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
          <Plus className="h-5 w-5" />
          Add Workspace
        </h2>
        <WorkspaceAddForm />
      </div>

      {/* Workspace List */}
      {workspaces.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <FolderOpen className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
          <h2 className="mb-2 text-xl font-semibold">No workspaces yet</h2>
          <p className="text-muted-foreground">Add a workspace above to get started.</p>
        </div>
      ) : (
        <div className="rounded-lg border">
          <table className="w-full">
            <thead className="border-b bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium">Name</th>
                <th className="px-4 py-3 text-left text-sm font-medium">Path</th>
                <th className="px-4 py-3 text-left text-sm font-medium">Created</th>
                <th className="px-4 py-3 text-right text-sm font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {workspaces.map((workspace) => (
                <tr key={workspace.slug} className="hover:bg-muted/50">
                  <td className="px-4 py-3">
                    <Link
                      href={`/workspaces/${workspace.slug}`}
                      className="font-medium hover:underline"
                    >
                      {workspace.name}
                    </Link>
                    <div className="text-xs text-muted-foreground">{workspace.slug}</div>
                  </td>
                  <td className="px-4 py-3">
                    <code className="rounded bg-muted px-2 py-1 text-sm">{workspace.path}</code>
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {workspace.createdAt.toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <WorkspaceRemoveButton slug={workspace.slug} name={workspace.name} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
