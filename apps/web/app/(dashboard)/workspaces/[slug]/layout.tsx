/**
 * Workspace Layout — /workspaces/[slug]
 *
 * Server Component that fetches workspace preferences and wraps
 * children in WorkspaceProvider + WorkspaceAttentionWrapper.
 *
 * Phase 5: Attention System — Plan 041
 * DYK-02: Provides WorkspaceContext for sidebar emoji
 * DYK-03: Only fetches preferences (fast). Browser page sets hasChanges.
 */

import { WORKSPACE_DI_TOKENS } from '@chainglass/shared';
import type { IWorkspaceService } from '@chainglass/workflow';
import { WorkspaceProvider } from '../../../../src/features/041-file-browser/hooks/use-workspace-context';
import { getContainer } from '../../../../src/lib/bootstrap-singleton';
import { WorkspaceAttentionWrapper } from './workspace-attention-wrapper';

export const dynamic = 'force-dynamic';

interface LayoutProps {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}

export default async function WorkspaceLayout({ children, params }: LayoutProps) {
  const { slug } = await params;

  const container = getContainer();
  const workspaceService = container.resolve<IWorkspaceService>(
    WORKSPACE_DI_TOKENS.WORKSPACE_SERVICE
  );

  const workspaces = await workspaceService.list();
  const ws = workspaces.find((w) => w.slug === slug);
  const prefs = ws?.toJSON().preferences;

  const name = ws?.name ?? decodeURIComponent(slug);
  const emoji = prefs?.emoji ?? '';
  const color = prefs?.color ?? '';
  const worktreePreferences = prefs?.worktreePreferences ?? {};

  return (
    <WorkspaceProvider
      slug={slug}
      name={name}
      emoji={emoji}
      color={color}
      worktreePreferences={worktreePreferences}
    >
      <WorkspaceAttentionWrapper>{children}</WorkspaceAttentionWrapper>
    </WorkspaceProvider>
  );
}
