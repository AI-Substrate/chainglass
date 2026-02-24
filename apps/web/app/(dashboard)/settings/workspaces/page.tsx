/**
 * Workspace Settings Page — /settings/workspaces
 *
 * Manage workspace preferences: emoji, color, star, remove.
 * Server Component wrapper fetches workspace list, delegates to client table.
 *
 * Phase 5: Attention System — Plan 041
 */

import { WORKSPACE_DI_TOKENS } from '@chainglass/shared';
import type { IWorkspaceService } from '@chainglass/workflow';
import { getContainer } from '../../../../src/lib/bootstrap-singleton';
import { WorkspaceSettingsTable } from './workspace-settings-table';

export const dynamic = 'force-dynamic';

export default async function WorkspaceSettingsPage() {
  const container = getContainer();
  const workspaceService = container.resolve<IWorkspaceService>(
    WORKSPACE_DI_TOKENS.WORKSPACE_SERVICE
  );

  const workspaces = await workspaceService.list();
  const items = workspaces.map((ws) => {
    const json = ws.toJSON();
    return {
      slug: ws.slug,
      name: ws.name,
      path: ws.path,
      emoji: json.preferences.emoji,
      color: json.preferences.color,
      starred: json.preferences.starred,
    };
  });

  return (
    <div className="container mx-auto py-6">
      <h1 className="mb-6 text-2xl font-bold">Workspace Settings</h1>
      <WorkspaceSettingsTable workspaces={items} />
    </div>
  );
}
