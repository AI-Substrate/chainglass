/**
 * GET /api/worktree-activity
 *
 * Cross-worktree activity summary for every registered worktree (see
 * `src/lib/server/worktree-activity.ts`). Takes no parameters: the server
 * knows the registry, and a client-sent path list outgrew the URL limit.
 *
 * Plan 059 Phase 4 — T001
 */

import { WORKSPACE_DI_TOKENS } from '@chainglass/shared';
import type { IWorkspaceService } from '@chainglass/workflow';
import { getContainer } from '../../../src/lib/bootstrap-singleton';
import { listWorktreeActivity } from '../../../src/lib/server/worktree-activity';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  try {
    const workspaceService = getContainer().resolve<IWorkspaceService>(
      WORKSPACE_DI_TOKENS.WORKSPACE_SERVICE
    );
    return Response.json({ activities: await listWorktreeActivity(workspaceService) });
  } catch (error) {
    console.error('[/api/worktree-activity] Error:', error);
    return Response.json({ error: 'Failed to read worktree activity' }, { status: 500 });
  }
}
