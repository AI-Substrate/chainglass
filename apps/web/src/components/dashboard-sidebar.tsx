'use client';

import { ThemeToggle } from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';
import { WorkspaceNav } from '@/components/workspaces/workspace-nav';
import { PasteUploadButton } from '@/features/041-file-browser/components/paste-upload-button';
import { useWorkspaceContext } from '@/features/041-file-browser/hooks/use-workspace-context';
import { DEV_NAV_ITEMS, WORKSPACE_NAV_ITEMS } from '@/lib/navigation-utils';
import { cn } from '@/lib/utils';
import { workspaceHref } from '@/lib/workspace-url';
import { ChevronLeft, PanelLeft, Settings } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense, useMemo, useState } from 'react';
import { WorktreeIdentityPopover } from './worktree-identity-popover';

/**
 * DashboardSidebar
 *
 * Context-aware sidebar with three levels:
 * - Home (/): workspace list + Dev section
 * - Workspace (/workspaces/[slug]): worktree list, no tools yet
 * - Worktree (/workspaces/[slug]/*?worktree=): tools first, worktree list below
 *
 * Workshop: workspace-context-session-binding.md
 * Tools (Browser/Agents/Workflows) are top-level, scoped to active worktree.
 * Worktree list is for switching context — NOT parent of tools.
 */
export function DashboardSidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === 'collapsed';
  const [devOpen, setDevOpen] = useState(false);

  // Detect workspace context from URL
  const workspaceSlug = useMemo(() => {
    const match = pathname.match(/^\/workspaces\/([^/]+)/);
    return match?.[1] ?? null;
  }, [pathname]);

  const isInWorkspace = workspaceSlug != null;
  const currentWorktree = searchParams.get('worktree');
  const wsCtx = useWorkspaceContext();

  return (
    <Sidebar role="complementary" collapsible="icon" className={cn(isCollapsed && 'w-16')}>
      <SidebarHeader className="border-b p-4">
        <div className="flex items-center justify-between gap-2">
          {!isCollapsed && (
            <div className="min-w-0">
              <span className="block truncate font-semibold">
                {isInWorkspace
                  ? `${wsCtx?.worktreeIdentity?.emoji || wsCtx?.emoji || ''} ${wsCtx?.worktreeIdentity?.branch || wsCtx?.name || decodeURIComponent(workspaceSlug)}`.trim()
                  : 'Chainglass'}
              </span>
              {isInWorkspace && currentWorktree && !wsCtx?.worktreeIdentity && (
                <span className="block truncate text-xs text-muted-foreground">
                  {currentWorktree.split('/').pop()}
                </span>
              )}
            </div>
          )}
          <div className="flex shrink-0 items-center gap-1">
            {currentWorktree && workspaceSlug && (
              <>
                <WorktreeIdentityPopover slug={workspaceSlug} worktreePath={currentWorktree} />
                <PasteUploadButton slug={workspaceSlug} worktreePath={currentWorktree} />
              </>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleSidebar}
              aria-label="Toggle sidebar"
              className="h-8 w-8"
            >
              <PanelLeft className="h-4 w-4" />
            </Button>
            <ThemeToggle />
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        {isInWorkspace ? (
          <>
            {/* 1. Tools — scoped to active worktree (top) */}
            <SidebarGroup>
              {!isCollapsed && <SidebarGroupLabel>Tools</SidebarGroupLabel>}
              <SidebarGroupContent>
                <SidebarMenu>
                  {WORKSPACE_NAV_ITEMS.map((item) => {
                    const href = workspaceHref(workspaceSlug, item.href, {
                      worktree: currentWorktree ?? undefined,
                    });
                    const isActive = pathname.startsWith(
                      `/workspaces/${workspaceSlug}${item.href}`
                    );
                    const Icon = item.icon;

                    return (
                      <SidebarMenuItem key={item.id}>
                        <SidebarMenuButton asChild isActive={isActive}>
                          <Link
                            href={href}
                            className={cn(
                              'flex items-center gap-3',
                              isActive && 'bg-accent text-accent-foreground'
                            )}
                          >
                            <Icon className="h-5 w-5" />
                            {!isCollapsed && <span>{item.label}</span>}
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            {/* 2. Worktree list — for switching context (below tools) */}
            <SidebarGroup>
              {!isCollapsed && <SidebarGroupLabel>Worktrees</SidebarGroupLabel>}
              <SidebarGroupContent>
                <Suspense
                  fallback={
                    <div className="px-3 py-2 text-xs text-muted-foreground">Loading...</div>
                  }
                >
                  <WorkspaceNav />
                </Suspense>
              </SidebarGroupContent>
            </SidebarGroup>

            {/* 3. Back to all workspaces */}
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild>
                      <Link href="/" className="flex items-center gap-2 text-muted-foreground">
                        <ChevronLeft className="h-4 w-4" />
                        {!isCollapsed && <span>All Workspaces</span>}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </>
        ) : (
          <>
            {/* Non-workspace: show workspace list */}
            <SidebarGroup>
              {!isCollapsed && <SidebarGroupLabel>Workspaces</SidebarGroupLabel>}
              <SidebarGroupContent>
                <Suspense
                  fallback={
                    <div className="px-3 py-2 text-xs text-muted-foreground">Loading...</div>
                  }
                >
                  <WorkspaceNav />
                </Suspense>
              </SidebarGroupContent>
            </SidebarGroup>
          </>
        )}

        {/* Settings link — always visible */}
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={pathname === '/settings/workspaces'}>
                  <Link
                    href="/settings/workspaces"
                    className={cn(
                      'flex items-center gap-3',
                      pathname === '/settings/workspaces' && 'bg-accent text-accent-foreground'
                    )}
                  >
                    <Settings className="h-5 w-5" />
                    {!isCollapsed && <span>Settings</span>}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Dev section — collapsed by default */}
        <SidebarGroup>
          {!isCollapsed && (
            <SidebarGroupLabel
              className="cursor-pointer select-none"
              onClick={() => setDevOpen((p) => !p)}
            >
              Dev {devOpen ? '▾' : '▸'}
            </SidebarGroupLabel>
          )}
          {(devOpen || isCollapsed) && (
            <SidebarGroupContent>
              <SidebarMenu>
                {DEV_NAV_ITEMS.map((item) => {
                  const isActive = pathname === item.href;
                  const Icon = item.icon;

                  return (
                    <SidebarMenuItem key={item.id}>
                      <SidebarMenuButton asChild isActive={isActive}>
                        <Link
                          href={item.href}
                          className={cn(
                            'flex items-center gap-3',
                            isActive && 'bg-accent text-accent-foreground'
                          )}
                        >
                          <Icon className="h-5 w-5" />
                          {!isCollapsed && <span>{item.label}</span>}
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          )}
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t p-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild isActive={pathname === '/settings/workspaces'}>
              <Link
                href="/settings/workspaces"
                className={cn(
                  'flex items-center gap-3',
                  pathname === '/settings/workspaces' && 'bg-accent text-accent-foreground'
                )}
              >
                <Settings className="h-5 w-5" />
                {!isCollapsed && <span>Settings</span>}
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
