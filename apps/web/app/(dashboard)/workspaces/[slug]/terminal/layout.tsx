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
  // Mobile: fixed fullscreen above bottom tab bar (65px)
  // Desktop: relative within flex layout (sidebar provides height)
  return (
    <div className="fixed inset-0 bottom-[65px] z-10 bg-background md:relative md:bottom-0 md:z-auto md:h-full">
      {children}
    </div>
  );
}
