/**
 * Feature barrel for 041-file-browser.
 *
 * Per Plan 041: File Browser & Workspace-Centric UI
 * PlanPak feature folder — components and services for file browsing.
 *
 * Phase 1: Empty barrel (infrastructure only).
 * Phase 2: Param definitions for file browser deep linking.
 * Phase 3: Landing page components, worktree picker, title hook.
 */

export { fileBrowserParams, fileBrowserPageParamsCache } from './params';
export { WorkspaceCard } from './components/workspace-card';
export type { WorkspaceCardProps } from './components/workspace-card';
export { FleetStatusBar } from './components/fleet-status-bar';
export type { FleetStatusBarProps } from './components/fleet-status-bar';
export { WorktreePicker } from './components/worktree-picker';
export type { WorktreePickerProps, WorktreeItem } from './components/worktree-picker';
export { WorktreeIdentityPopover } from './components/worktree-identity-popover';
export { useAttentionTitle } from './hooks/use-attention-title';
export type { UseAttentionTitleOptions } from './hooks/use-attention-title';
export { WorkspaceProvider, useWorkspaceContext } from './hooks/use-workspace-context';
export type {
  WorkspaceContextValue,
  WorkspaceProviderProps,
  WorktreeIdentity,
  WorktreeIdentityInput,
} from './hooks/use-workspace-context';

// Services (consumed by pr-view domain)
export { getWorkingChanges } from './services/working-changes';
export type { ChangedFile, WorkingChangesResult } from './services/working-changes';
