/**
 * Terminal Layout — /workspaces/[slug]/terminal
 *
 * Pass-through layout for the terminal page subtree.
 * Workspace context is already provided by the parent layout.
 *
 * Plan 064: Terminal Integration via tmux
 */

interface LayoutProps {
  children: React.ReactNode;
}

export default function TerminalLayout({ children }: LayoutProps) {
  // Desktop: relative within flex layout (sidebar provides height)
  // Mobile sizing is owned by MobilePanelShell (Plan 078, finding 01)
  return <div className="relative h-full bg-background">{children}</div>;
}
