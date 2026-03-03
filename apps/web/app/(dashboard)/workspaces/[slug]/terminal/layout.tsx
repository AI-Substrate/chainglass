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
  return <>{children}</>;
}
