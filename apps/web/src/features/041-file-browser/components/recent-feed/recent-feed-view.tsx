'use client';

export interface RecentFeedViewProps {
  slug: string;
  worktreePath: string;
  isGit: boolean;
  onClose: () => void;
}

export function RecentFeedView(_props: RecentFeedViewProps) {
  // T012 will replace this body with the seeded orchestrator (header + filters + virtualized list).
  // T003 ships only the routing branch; this stub keeps the import resolved during incremental landing.
  return (
    <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
      Recent changes feed — loading…
    </div>
  );
}

export default RecentFeedView;
