'use client';

/**
 * WorkspaceNav - Sidebar navigation for workspaces and worktrees.
 *
 * Part of Plan 014: Workspaces - Phase 6: Web UI
 * Plan 059 Phase 4: Cross-worktree activity badges.
 *
 * Cross-domain composition point: This component combines _platform/panel-layout
 * rendering with agents-domain data (useWorktreeActivity). The hook returns plain
 * data matching WorktreeBadgeState; ActivityDot accepts plain props with no
 * cross-domain import. This is an intentional composition boundary.
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
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toggleWorktreeStar } from '../../../app/actions/workspace-actions';
import { useWorktreeActivity } from '../../hooks/use-worktree-activity';
import { sortWorktrees } from '../../lib/sort-worktrees';
import { ActivityDot } from './activity-dot';

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
 * WorkspaceNav displays workspace list or worktree list depending on context.
 *
 * Outside workspace: shows all workspaces with expandable worktrees
 * Inside workspace: shows only that workspace's worktrees (flat list for switching)
 */
export function WorkspaceNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { state } = useSidebar();
  const isCollapsed = state === 'collapsed';

  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Detect workspace context
  const workspaceSlug = pathname.match(/^\/workspaces\/([^/]+)/)?.[1] ?? null;
  const currentWorktree = searchParams.get('worktree');

  // Collect all worktree paths for activity polling (DYK-P4-03)
  const allWorktreePaths = useMemo(
    () => workspaces.flatMap((ws) => (ws.worktrees ?? []).map((wt) => wt.path)),
    [workspaces]
  );

  // Cross-worktree activity badges (DYK-P4-04: null exclude = show all)
  const { activities } = useWorktreeActivity({
    worktreePaths: allWorktreePaths,
    excludeWorktree: currentWorktree,
  });

  // Index activities by worktree path for O(1) lookup
  const activityMap = useMemo(() => {
    const map = new Map<string, (typeof activities)[0]>();
    for (const a of activities) {
      map.set(a.worktreePath, a);
    }
    return map;
  }, [activities]);

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

  // Inside workspace: show worktrees for this workspace only
  if (workspaceSlug) {
    const currentWs = workspaces.find((w) => w.slug === workspaceSlug);
    if (!currentWs && !loading) {
      return <div className="px-3 py-2 text-xs text-muted-foreground">No worktrees</div>;
    }
    if (!currentWs) {
      return <div className="px-3 py-2 text-xs text-muted-foreground">Loading...</div>;
    }

    const worktrees = currentWs.worktrees ?? [];
    const starredSet = new Set(currentWs.preferences?.starredWorktrees ?? []);

    const sorted = sortWorktrees(worktrees, starredSet);

    const rawSubPath = pathname.replace(`/workspaces/${workspaceSlug}`, '') || '/';
    // Default to browser when navigating from workspace root or worktree landing
    const subPath = rawSubPath === '/' || rawSubPath === '/worktree' ? '/browser' : rawSubPath;

    return (
      <div className="space-y-0.5 py-1">
        {sorted.map((wt) => {
          const label = wt.branch || (wt.isDetached ? 'detached' : 'main');
          const isSelected = currentWorktree === wt.path;
          const isStarred = starredSet.has(wt.path);
          const href = workspaceHref(workspaceSlug, subPath, { worktree: wt.path });

          return (
            <div key={wt.path} className="group/wt flex items-center gap-0.5">
              <button
                type="button"
                onClick={() => {
                  const formData = new FormData();
                  formData.set('slug', workspaceSlug);
                  formData.set('worktreePath', wt.path);
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
                href={href}
                className={cn(
                  'flex flex-1 items-center gap-2 truncate rounded px-1 py-1 text-xs hover:bg-accent',
                  isSelected && 'bg-accent font-medium text-accent-foreground'
                )}
                title={wt.path}
              >
                <GitBranch className="h-3 w-3 shrink-0" />
                <span className="truncate">{label}</span>
              </Link>
              <ActivityDot
                badge={activityMap.get(wt.path)}
                workspaceSlug={workspaceSlug}
                worktreePath={wt.path}
              />
            </div>
          );
        })}
      </div>
    );
  }

  // Outside workspace: show all workspaces with expandable worktrees
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
                {sortWorktrees(
                  workspace.worktrees ?? [],
                  new Set(workspace.preferences?.starredWorktrees ?? [])
                ).map((worktree) => {
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
                      <ActivityDot
                        badge={activityMap.get(worktree.path)}
                        workspaceSlug={workspace.slug}
                        worktreePath={worktree.path}
                      />
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
