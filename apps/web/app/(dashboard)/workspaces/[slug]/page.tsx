/**
 * Workspace Detail Page - /workspaces/[slug]
 *
 * Part of Plan 014: Workspaces - Phase 6: Web UI
 *
 * Server component that shows workspace info and worktree list.
 */

import { WORKSPACE_DI_TOKENS } from '@chainglass/shared';
import type { IWorkspaceService } from '@chainglass/workflow';
import { ArrowRight, Bot, FileText, FolderOpen, GitBranch, LayoutDashboard } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { WorkspaceRemoveButton } from '../../../../src/components/workspaces/workspace-remove-button';
import { getContainer } from '../../../../src/lib/bootstrap-singleton';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{
    slug: string;
  }>;
}

export default async function WorkspaceDetailPage({ params }: PageProps) {
  const { slug } = await params;

  const container = getContainer();
  const workspaceService = container.resolve<IWorkspaceService>(
    WORKSPACE_DI_TOKENS.WORKSPACE_SERVICE
  );

  const info = await workspaceService.getInfo(slug);

  if (!info) {
    notFound();
  }

  return (
    <div className="container mx-auto py-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FolderOpen className="h-8 w-8" />
          <div>
            <h1 className="text-3xl font-bold">{info.name}</h1>
            <p className="text-muted-foreground">{info.slug}</p>
          </div>
        </div>
        <WorkspaceRemoveButton slug={info.slug} name={info.name} />
      </div>

      {/* Info Card */}
      <div className="mb-8 rounded-lg border p-6">
        <dl className="grid gap-4 md:grid-cols-2">
          <div>
            <dt className="text-sm font-medium text-muted-foreground">Path</dt>
            <dd className="mt-1">
              <code className="rounded bg-muted px-2 py-1 text-sm">{info.path}</code>
            </dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-muted-foreground">Created</dt>
            <dd className="mt-1">{info.createdAt.toLocaleDateString()}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-muted-foreground">Git Repository</dt>
            <dd className="mt-1">{info.hasGit ? 'Yes' : 'No'}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-muted-foreground">Worktrees</dt>
            <dd className="mt-1">{info.worktrees.length}</dd>
          </div>
        </dl>
      </div>

      {/* Worktrees */}
      <div className="rounded-lg border">
        <div className="border-b bg-muted/50 px-4 py-3">
          <h2 className="flex items-center gap-2 font-semibold">
            <GitBranch className="h-5 w-5" />
            Worktrees
          </h2>
        </div>

        {info.worktrees.length === 0 ? (
          <div className="p-6 text-center text-muted-foreground">
            No worktrees found. This workspace is not a git repository or git worktree detection
            failed.
          </div>
        ) : (
          <div className="divide-y">
            {info.worktrees.map((worktree) => {
              const label = worktree.branch || (worktree.isDetached ? 'detached HEAD' : 'unknown');
              const landingUrl = `/workspaces/${slug}/worktree?worktree=${encodeURIComponent(worktree.path)}`;
              const samplesUrl = `/workspaces/${slug}/samples?worktree=${encodeURIComponent(worktree.path)}`;
              const agentsUrl = `/workspaces/${slug}/agents?worktree=${encodeURIComponent(worktree.path)}`;

              return (
                <div
                  key={worktree.path}
                  className="flex items-center justify-between px-4 py-3 hover:bg-muted/50"
                >
                  <Link href={landingUrl} className="flex items-center gap-3 hover:underline">
                    <GitBranch className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <div className="font-medium">{label}</div>
                      <code className="text-xs text-muted-foreground">{worktree.path}</code>
                    </div>
                  </Link>
                  <div className="flex items-center gap-4">
                    <Link
                      href={landingUrl}
                      className="flex items-center gap-1 text-sm text-primary hover:underline"
                      title="Worktree Overview"
                    >
                      <LayoutDashboard className="h-4 w-4" />
                      Overview
                    </Link>
                    <Link
                      href={agentsUrl}
                      className="flex items-center gap-1 text-sm text-muted-foreground hover:text-primary hover:underline"
                      title="Agent Sessions"
                    >
                      <Bot className="h-4 w-4" />
                      Agents
                    </Link>
                    <Link
                      href={samplesUrl}
                      className="flex items-center gap-1 text-sm text-muted-foreground hover:text-primary hover:underline"
                      title="Code Samples"
                    >
                      <FileText className="h-4 w-4" />
                      Samples
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
