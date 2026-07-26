/**
 * pij observatory — /workspaces/[slug]/pij
 *
 * Server Component, sibling pattern of `workflows/page.tsx`: resolve, then hand a thin client shell
 * the values it needs.
 *
 * Its one real job is resolving the workspace's **absolute filesystem path**. Every `/api/pij/*`
 * route takes a path, never a slug, and a slug in that position does not fail — it returns a
 * plausible wrong answer (an empty fleet, or this repo's tree labelled as another workspace's). The
 * path is therefore read from the workspace record the layout already resolves, exactly as that
 * layout does, and a `?worktree=` parameter overrides it when the user is looking at a worktree —
 * which is a more specific already-resolved path, not a slug being rebuilt into one.
 *
 * Plan 089 Phase 2 (T001).
 */

import { PijPageClient } from '@/features/089-first-class-pij/components/pij-page-client';
import { WORKSPACE_DI_TOKENS } from '@chainglass/shared';
import type { IWorkspaceService } from '@chainglass/workflow';
import { getContainer } from '../../../../../src/lib/bootstrap-singleton';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function PijPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const sp = await searchParams;

  const container = getContainer();
  const workspaceService = container.resolve<IWorkspaceService>(
    WORKSPACE_DI_TOKENS.WORKSPACE_SERVICE
  );
  const workspaces = await workspaceService.list();
  const workspace = workspaces.find((w) => w.slug === slug);

  const worktreePath = typeof sp.worktree === 'string' ? sp.worktree : undefined;
  const workspacePath = worktreePath ?? workspace?.toJSON().path ?? '';
  const workspaceName = workspace?.name ?? decodeURIComponent(slug);

  if (!workspacePath) {
    // A rendered state, not a crash: without a path there is nothing honest to scope a read to, and
    // guessing one from the slug is the specific mistake this page is written to avoid.
    return (
      <div className="p-6 text-sm text-muted-foreground">
        <h1 className="mb-1 text-base font-semibold text-foreground">pij</h1>
        No filesystem path is recorded for the workspace <span className="font-mono">{slug}</span>,
        so its pij seats cannot be scoped. Open the workspace from the dashboard so its path is
        resolved, then return here.
      </div>
    );
  }

  return <PijPageClient workspacePath={workspacePath} workspaceName={workspaceName} />;
}
