/**
 * Terminal Page — /workspaces/[slug]/terminal
 *
 * Server Component that resolves workspace info and passes
 * to TerminalPageClient for PanelShell composition.
 *
 * Plan 064: Terminal Integration via tmux
 * DYK-02: Derives branch name from worktree path for tmux session matching.
 */

import { WORKSPACE_DI_TOKENS } from '@chainglass/shared';
import type { IWorkspaceService } from '@chainglass/workflow';
import { Suspense } from 'react';
import { TerminalPageClient } from '../../../../../src/features/064-terminal/components/terminal-page-client';
import { sanitizeSessionName } from '../../../../../src/features/064-terminal/lib/sanitize-session-name';
import { getContainer } from '../../../../../src/lib/bootstrap-singleton';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function TerminalPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const searchParamsResolved = await searchParams;

  const container = getContainer();
  const workspaceService = container.resolve<IWorkspaceService>(
    WORKSPACE_DI_TOKENS.WORKSPACE_SERVICE
  );

  const info = await workspaceService.getInfo(slug);
  if (!info) {
    return (
      <div className="flex items-center justify-center p-8 text-muted-foreground">
        Workspace not found
      </div>
    );
  }

  const worktreePath =
    typeof searchParamsResolved.worktree === 'string' ? searchParamsResolved.worktree : info.path;

  const wt = info.worktrees.find((w) => w.path === worktreePath);
  const worktreeBranch = sanitizeSessionName(wt?.branch ?? worktreePath.split('/').pop() ?? '');

  return (
    <Suspense fallback={<div className="p-4">Loading terminal...</div>}>
      <TerminalPageClient slug={slug} worktreePath={worktreePath} worktreeBranch={worktreeBranch} />
    </Suspense>
  );
}
