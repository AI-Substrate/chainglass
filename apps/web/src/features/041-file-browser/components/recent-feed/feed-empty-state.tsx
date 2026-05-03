/**
 * FeedEmptyState — Shown when seed completes with no entries (e.g., a brand-new
 * git repo with no commits, or all entries filtered out).
 *
 * Plan recent-changes-feed T011 — covers AC A3 (loading) sibling state.
 */

'use client';

import { Inbox } from 'lucide-react';

export interface FeedEmptyStateProps {
  /** Whether at least one filter chip is active (other than "all"). When true, copy nudges the user to broaden filters. */
  filtered?: boolean;
}

export function FeedEmptyState({ filtered = false }: FeedEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <Inbox className="h-10 w-10 text-muted-foreground/50" aria-hidden="true" />
      <div className="text-sm font-medium text-card-foreground">
        {filtered ? 'No matches for the active filters' : 'No recent changes yet'}
      </div>
      <div className="text-xs text-muted-foreground max-w-sm">
        {filtered
          ? 'Try clearing some filters or selecting "All" to see every change.'
          : 'Edit, add, or delete a file in this workspace and it will appear here as the freshest item.'}
      </div>
    </div>
  );
}
