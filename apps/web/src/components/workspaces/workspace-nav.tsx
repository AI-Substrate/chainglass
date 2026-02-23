'use client';

/**
 * WorkspaceNav - Sidebar navigation for workspaces and worktrees.
 *
 * Part of Plan 014: Workspaces - Phase 6: Web UI
 *
 * Per DYK-P6-04: Uses ?include=worktrees for single fetch.
 * Client component to support expansion state.
 */

import { useSidebar } from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';
import { workspaceHref } from '@/lib/workspace-url';
import { ChevronDown, ChevronRight, FolderOpen, GitBranch, Star } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { toggleWorktreeStar } from '../../../app/actions/workspace-actions';

/**
 * Workspace data from API response.
 */
interface Workspace {
  slug: string;
  name: string;
  path: string;
  hasGit?: boolean;
  preferences?: {
    starredWorktrees?: string[];
  };
  worktrees?: Array<{
    path: string;
    branch: string | null;
    isDetached: boolean;
    isBare: boolean;
  }>;
}

/**
 * WorkspaceNav displays workspace list with expandable worktrees.
 */
export function WorkspaceNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { state } = useSidebar();
  const isCollapsed = state === 'collapsed';

  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Load workspaces on mount
  useEffect(() => {
    async function fetchWorkspaces() {
      try {
        const response = await fetch('/api/workspaces?include=worktrees');
        if (response.ok) {
          const data = await response.json();
          setWorkspaces(data.workspaces || []);
        }
      } catch (error) {
        console.error('Failed to load workspaces:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchWorkspaces();
  }, []);

  // Toggle workspace expansion
  const toggleExpand = useCallback((slug: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) {
        next.delete(slug);
      } else {
        next.add(slug);
      }
      return next;
    });
  }, []);

  // Check if a worktree is selected (generic - works for any worktree-scoped page)
  const isWorktreeSelected = (slug: string, worktreePath: string) => {
    return (
      pathname.startsWith(`/workspaces/${slug}/`) && searchParams.get('worktree') === worktreePath
    );
  };

  if (isCollapsed) {
    // Icons-only mode
    return (
      <div className="px-2 py-2">
        <Link
          href="/workspaces"
          className={cn(
            'flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent',
            pathname === '/workspaces' && 'bg-accent text-accent-foreground'
          )}
          title="Workspaces"
        >
          <FolderOpen className="h-4 w-4" />
        </Link>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="px-3 py-2">
        <div className="text-muted-foreground text-xs">Loading...</div>
      </div>
    );
  }

  if (workspaces.length === 0) {
    return (
      <div className="px-3 py-2">
        <Link
          href="/workspaces"
          className="text-muted-foreground hover:text-foreground text-xs underline"
        >
          Add workspace
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-1 py-2">
      {workspaces.map((workspace) => {
        const isExpanded = expanded.has(workspace.slug);
        const hasWorktrees = (workspace.worktrees?.length ?? 0) > 0;
        const isWorkspaceActive = pathname.startsWith(`/workspaces/${workspace.slug}`);

        return (
          <div key={workspace.slug}>
            {/* Workspace header */}
            <div className="flex items-center gap-1 px-2">
              {hasWorktrees ? (
                <button
                  type="button"
                  onClick={() => toggleExpand(workspace.slug)}
                  className="hover:bg-muted flex h-6 w-6 items-center justify-center rounded"
                >
                  {isExpanded ? (
                    <ChevronDown className="h-3 w-3" />
                  ) : (
                    <ChevronRight className="h-3 w-3" />
                  )}
                </button>
              ) : (
                <div className="w-6" />
              )}
              <Link
                href={`/workspaces/${workspace.slug}`}
                className={cn(
                  'flex-1 truncate rounded px-2 py-1 text-sm hover:bg-accent',
                  isWorkspaceActive && 'bg-accent text-accent-foreground'
                )}
                title={workspace.path}
              >
                {workspace.name}
              </Link>
            </div>

            {/* Worktrees */}
            {isExpanded && hasWorktrees && (
              <div className="ml-6 space-y-0.5 border-l pl-2">
                {[...(workspace.worktrees ?? [])]
                  .sort((a, b) => {
                    const starredSet = new Set(workspace.preferences?.starredWorktrees ?? []);
                    const aStarred = starredSet.has(a.path);
                    const bStarred = starredSet.has(b.path);
                    if (aStarred !== bStarred) return aStarred ? -1 : 1;
                    return (a.branch ?? '').localeCompare(b.branch ?? '');
                  })
                  .map((worktree) => {
                    const isSelected = isWorktreeSelected(workspace.slug, worktree.path);
                    const label = worktree.branch || (worktree.isDetached ? 'detached' : 'main');
                    const isStarred = (workspace.preferences?.starredWorktrees ?? []).includes(
                      worktree.path
                    );

                    return (
                      <div key={worktree.path} className="group/wt flex items-center gap-0.5">
                        <button
                          type="button"
                          onClick={() => {
                            const formData = new FormData();
                            formData.set('slug', workspace.slug);
                            formData.set('worktreePath', worktree.path);
                            formData.set('action', isStarred ? 'unstar' : 'star');
                            toggleWorktreeStar(formData);
                          }}
                          className={cn(
                            'shrink-0 rounded p-0.5',
                            isStarred
                              ? 'text-yellow-500'
                              : 'text-transparent group-hover/wt:text-muted-foreground'
                          )}
                          aria-label={isStarred ? `Unstar ${label}` : `Star ${label}`}
                        >
                          <Star className={`h-3 w-3 ${isStarred ? 'fill-yellow-500' : ''}`} />
                        </button>
                        <Link
                          href={workspaceHref(workspace.slug, '/worktree', {
                            worktree: worktree.path,
                          })}
                          className={cn(
                            'flex flex-1 items-center gap-2 rounded px-1 py-1 text-xs hover:bg-accent',
                            isSelected && 'bg-accent text-accent-foreground'
                          )}
                          title={worktree.path}
                        >
                          <GitBranch className="h-3 w-3 flex-shrink-0" />
                          <span className="truncate">{label}</span>
                        </Link>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
