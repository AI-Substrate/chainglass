'use client';

/**
 * TmuxBellWrapper — Mounts the tmux bell notification hook.
 *
 * Must be inside MultiplexedSSEProvider and WorkspaceProvider.
 * Plays sound + flashes tab title on tmux bell events.
 *
 * Plan 080: tmux Eventing System
 */

import { useTmuxBellNotification } from '@/features/064-terminal/hooks/use-tmux-bell-notification';

export function TmuxBellWrapper({
  children,
  defaultWorktreePath,
}: { children: React.ReactNode; defaultWorktreePath?: string }) {
  useTmuxBellNotification(defaultWorktreePath);
  return <>{children}</>;
}
