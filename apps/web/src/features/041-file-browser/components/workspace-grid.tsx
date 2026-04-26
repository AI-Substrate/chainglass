'use client';

import { type ReactNode, useMemo, useState } from 'react';
import { WorkspaceSearch } from './workspace-search';

export interface WorkspaceGridItem {
  slug: string;
  name: string;
  path: string;
  searchableNames: string[];
}

export interface WorkspaceGridProps {
  items: WorkspaceGridItem[];
  cards: ReactNode[];
}

export function WorkspaceGrid({ items, cards }: WorkspaceGridProps) {
  const [query, setQuery] = useState('');

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
        ws.searchableNames.some((b) => b.toLowerCase().includes(term));
      if (matches) out.push(i);
    }
    return out;
  }, [items, query]);

  return (
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
  );
}
