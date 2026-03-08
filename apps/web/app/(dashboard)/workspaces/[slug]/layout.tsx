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
import { WorkspaceAgentChrome } from '../../../../src/components/agents/workspace-agent-chrome';
import { WorkspaceProvider } from '../../../../src/features/041-file-browser/hooks/use-workspace-context';
import { getContainer } from '../../../../src/lib/bootstrap-singleton';
import { SDKWorkspaceConnector } from '../../../../src/lib/sdk/sdk-workspace-connector';
import { MultiplexedSSEProvider } from '../../../../src/lib/sse';
import { updateSDKMru, updateSDKSettings } from '../../../actions/sdk-settings-actions';
import { ActivityLogOverlayWrapper } from './activity-log-overlay-wrapper';
import { QuestionPopperOverlayWrapper } from './question-popper-overlay-wrapper';
import { TerminalOverlayWrapper } from './terminal-overlay-wrapper';
import { WorkspaceAttentionWrapper } from './workspace-attention-wrapper';

export const dynamic = 'force-dynamic';

/** Static channel list for the multiplexed SSE provider.
 * Defined outside the component to prevent re-renders from new array references.
 * Phase 3+ will consume these channels via useChannelEvents/useChannelCallback.
 */
const WORKSPACE_SSE_CHANNELS = [
  'event-popper',
  'file-changes',
  'work-unit-state',
  'workflows',
  'unit-catalog',
] as const;

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
  const sdkSettings = prefs?.sdkSettings ?? {};
  const sdkMru = prefs?.sdkMru ?? [];

  const defaultWorktreePath = ws?.toJSON().path ?? '';
  const defaultBranch = defaultWorktreePath.split('/').pop() ?? slug;

  return (
    <WorkspaceProvider
      slug={slug}
      name={name}
      emoji={emoji}
      color={color}
      worktreePreferences={worktreePreferences}
    >
      <SDKWorkspaceConnector
        slug={slug}
        sdkSettings={sdkSettings}
        sdkMru={sdkMru}
        persistSettings={updateSDKSettings}
        persistMru={updateSDKMru}
      />
      <WorkspaceAttentionWrapper>
        <TerminalOverlayWrapper defaultSessionName={defaultBranch} defaultCwd={defaultWorktreePath}>
          <MultiplexedSSEProvider channels={[...WORKSPACE_SSE_CHANNELS]}>
            <ActivityLogOverlayWrapper defaultWorktreePath={defaultWorktreePath}>
              <QuestionPopperOverlayWrapper>
                <WorkspaceAgentChrome slug={slug} workspacePath={ws?.path}>
                  {children}
                </WorkspaceAgentChrome>
              </QuestionPopperOverlayWrapper>
            </ActivityLogOverlayWrapper>
          </MultiplexedSSEProvider>
        </TerminalOverlayWrapper>
      </WorkspaceAttentionWrapper>
    </WorkspaceProvider>
  );
}
