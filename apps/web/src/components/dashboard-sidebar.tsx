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
import { WorktreeIdentityPopover } from '@/features/041-file-browser/components/worktree-identity-popover';
import { WorktreeStateSubtitle } from '@/features/041-file-browser/components/worktree-state-subtitle';
import { useWorkspaceContext } from '@/features/041-file-browser/hooks/use-workspace-context';
import { DEV_NAV_ITEMS, WORKSPACE_NAV_ITEMS } from '@/lib/navigation-utils';
import { cn } from '@/lib/utils';
import { workspaceHref } from '@/lib/workspace-url';
import {
  ChevronLeft,
  ExternalLink,
  LogOut,
  PanelLeft,
  ScrollText,
  Settings,
  TerminalSquare,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense, useMemo, useState } from 'react';

import { signOut, useAuth } from '@/features/063-login/hooks/use-auth';

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
  const { user, isAuthenticated } = useAuth();
  const [devOpen, setDevOpen] = useState(false);
  const [worktreesOpen, setWorktreesOpen] = useState(true);

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
      <SidebarHeader className={cn('border-b', isCollapsed ? 'p-2' : 'p-4')}>
        {!isCollapsed && (
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0 flex-1">
              {isInWorkspace ? (
                <>
                  <span className="block truncate font-semibold">
                    {`${wsCtx?.worktreeIdentity?.emoji || wsCtx?.emoji || ''} ${wsCtx?.worktreeIdentity?.branch || currentWorktree?.split('/').pop() || decodeURIComponent(workspaceSlug)}`.trim()}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {wsCtx?.name || decodeURIComponent(workspaceSlug)}
                  </span>
                  {workspaceSlug && <WorktreeStateSubtitle slug={workspaceSlug} />}
                </>
              ) : (
                <span className="block truncate font-semibold">Chainglass</span>
              )}
            </div>
          </div>
        )}
        <div className={cn('flex items-center', isCollapsed ? 'justify-center' : 'mt-1 gap-1')}>
          {!isCollapsed && currentWorktree && workspaceSlug && (
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
            className="h-7 w-7"
          >
            <PanelLeft className="h-3.5 w-3.5" />
          </Button>
          {!isCollapsed && (
            <>
              <ThemeToggle />
              <Button
                variant="ghost"
                size="icon"
                onClick={() => window.open(window.location.href, '_blank')}
                aria-label="Open in new tab"
                className="h-7 w-7"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        {isInWorkspace ? (
          <>
            {/* 1. Tools — scoped to active worktree (only shown when worktree selected) */}
            {currentWorktree && (
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
            )}

            {/* 2. Back to all workspaces */}
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

            {/* 3. Worktree list — collapsible, expanded by default */}
            <SidebarGroup>
              {!isCollapsed && (
                <SidebarGroupLabel
                  className="cursor-pointer select-none"
                  onClick={() => setWorktreesOpen((p) => !p)}
                >
                  Worktrees {worktreesOpen ? '▾' : '▸'}
                </SidebarGroupLabel>
              )}
              {(worktreesOpen || isCollapsed) && (
                <SidebarGroupContent>
                  <Suspense
                    fallback={
                      <div className="px-3 py-2 text-xs text-muted-foreground">Loading...</div>
                    }
                  >
                    <WorkspaceNav />
                  </Suspense>
                </SidebarGroupContent>
              )}
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
          {isAuthenticated && user && (
            <SidebarMenuItem>
              <div
                className={cn(
                  'flex items-center gap-3 px-3 py-1.5 text-xs text-muted-foreground',
                  isCollapsed && 'justify-center px-0'
                )}
              >
                {!isCollapsed && <span className="truncate">{user.name ?? 'User'}</span>}
              </div>
            </SidebarMenuItem>
          )}
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={() => window.dispatchEvent(new CustomEvent('terminal:toggle'))}
              tooltip="Toggle Terminal (Ctrl+`)"
            >
              <TerminalSquare className="h-5 w-5" />
              {!isCollapsed && <span>Terminal</span>}
            </SidebarMenuButton>
          </SidebarMenuItem>
          {currentWorktree && (
            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={() => window.dispatchEvent(new CustomEvent('activity-log:toggle'))}
                tooltip="Toggle Activity Log"
              >
                <ScrollText className="h-5 w-5" />
                {!isCollapsed && <span>Activity</span>}
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              isActive={
                pathname === '/settings/workspaces' ||
                /\/workspaces\/[^/]+\/settings$/.test(pathname)
              }
            >
              <Link
                href={wsCtx?.slug ? `/workspaces/${wsCtx.slug}/settings` : '/settings/workspaces'}
                className={cn(
                  'flex items-center gap-3',
                  (pathname === '/settings/workspaces' ||
                    /\/workspaces\/[^/]+\/settings$/.test(pathname)) &&
                    'bg-accent text-accent-foreground'
                )}
              >
                <Settings className="h-5 w-5" />
                {!isCollapsed && <span>Settings</span>}
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          {isAuthenticated && (
            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={() => signOut({ callbackUrl: '/login' })}
                className="flex items-center gap-3 text-muted-foreground hover:text-foreground"
              >
                <LogOut className="h-5 w-5" />
                {!isCollapsed && <span>Sign out</span>}
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
