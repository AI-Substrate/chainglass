'use client';

import { type ReactNode, createContext, useContext, useEffect, useMemo, useState } from 'react';
import { WorkspaceSearch } from './workspace-search';

export interface WorkspaceGridItem {
  slug: string;
  name: string;
  path: string;
}

export interface WorkspaceGridProps {
  items: WorkspaceGridItem[];
  cards: ReactNode[];
}

/** Worktree names per workspace slug; `null` while loading. */
export type WorkspaceWorktreeNames = Record<string, string[]> | null;

/**
 * Worktree names reach the cards after the page: listing them runs `git worktree list` per
 * workspace, which used to hold the whole home page until the slowest repo answered.
 */
export const WorkspaceWorktreesContext = createContext<WorkspaceWorktreeNames>(null);

interface WorktreesResponse {
  workspaces: Array<{
    slug: string;
    worktrees?: Array<{ path: string; branch: string | null }>;
  }>;
}

async function fetchWorktreeNames(): Promise<Record<string, string[]>> {
  const res = await fetch('/api/workspaces?include=worktrees', { cache: 'no-store' });
  if (!res.ok) return {};
  const data = (await res.json()) as WorktreesResponse;
  return Object.fromEntries(
    data.workspaces.map((ws) => [
      ws.slug,
      (ws.worktrees ?? []).map((wt) => wt.branch || wt.path.split('/').pop() || wt.path),
    ])
  );
}

export function WorkspaceGrid({ items, cards }: WorkspaceGridProps) {
  const [query, setQuery] = useState('');
  const [worktreeNames, setWorktreeNames] = useState<WorkspaceWorktreeNames>(null);

  useEffect(() => {
    let cancelled = false;
    fetchWorktreeNames()
      .catch(() => ({}))
      .then((names) => {
        if (!cancelled) setWorktreeNames(names);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredIndices = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return items.map((_, i) => i);
    const out: number[] = [];
    for (let i = 0; i < items.length; i++) {
      const ws = items[i];
      const matches =
        ws.name.toLowerCase().includes(term) ||
        ws.slug.toLowerCase().includes(term) ||
        ws.path.toLowerCase().includes(term) ||
        (worktreeNames?.[ws.slug] ?? []).some((b) => b.toLowerCase().includes(term));
      if (matches) out.push(i);
    }
    return out;
  }, [items, query, worktreeNames]);

  return (
    <WorkspaceWorktreesContext.Provider value={worktreeNames}>
      <div className="space-y-4">
        <WorkspaceSearch
          value={query}
          onChange={setQuery}
          matchCount={filteredIndices.length}
          totalCount={items.length}
        />

        {filteredIndices.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            {query ? (
              <>
                No workspaces match <span className="font-mono">&quot;{query}&quot;</span>.
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="ml-2 underline hover:text-foreground"
                >
                  Clear filter
                </button>
              </>
            ) : (
              <>No workspaces yet. Use “Add workspace” above to get started.</>
            )}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredIndices.map((i) => cards[i])}
          </div>
        )}
      </div>
    </WorkspaceWorktreesContext.Provider>
  );
}

/** A card's worktree line: up to three names, else a count; a placeholder while loading. */
export function WorkspaceWorktreeSummary({ slug }: { slug: string }) {
  const worktreeNames = useContext(WorkspaceWorktreesContext);
  const names = worktreeNames?.[slug];
  let text = '';
  if (!worktreeNames) text = '… worktrees';
  else if (names)
    text = names.length <= 3 && names.length > 0 ? names.join(' · ') : `${names.length} worktrees`;
  return <p className="text-xs text-muted-foreground">{text}</p>;
}
