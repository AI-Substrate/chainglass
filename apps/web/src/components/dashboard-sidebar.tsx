'use client';

import { ThemeToggle } from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';
import {
  Sidebar,
  SidebarContent,
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
import { DEV_NAV_ITEMS, WORKSPACE_NAV_ITEMS } from '@/lib/navigation-utils';
import { cn } from '@/lib/utils';
import { workspaceHref } from '@/lib/workspace-url';
import { ChevronLeft, PanelLeft } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Suspense, useMemo, useState } from 'react';

/**
 * DashboardSidebar
 *
 * Context-aware sidebar:
 * - Inside workspace (/workspaces/[slug]/*): workspace header with emoji,
 *   worktree picker, Browser/Agents/Workflows nav, "← All Workspaces", Dev section
 * - Outside workspace (/): minimal sidebar or collapsed
 *
 * Phase 3: UI Overhaul — Plan 041: File Browser
 * Finding 04: Shared by all 21+ pages — test all routes after changes.
 */
export function DashboardSidebar() {
  const pathname = usePathname();
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === 'collapsed';
  const [devOpen, setDevOpen] = useState(false);

  // Detect workspace context from URL
  const workspaceSlug = useMemo(() => {
    const match = pathname.match(/^\/workspaces\/([^/]+)/);
    return match?.[1] ?? null;
  }, [pathname]);

  const isInWorkspace = workspaceSlug != null;

  return (
    <Sidebar role="complementary" collapsible="icon" className={cn(isCollapsed && 'w-16')}>
      <SidebarHeader className="border-b p-4">
        <div className="flex items-center justify-between gap-2">
          {!isCollapsed && (
            <span className="font-semibold">
              {isInWorkspace ? decodeURIComponent(workspaceSlug) : 'Chainglass'}
            </span>
          )}
          <div className="flex items-center gap-1">
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
            {/* Workspace-scoped navigation */}
            <SidebarGroup>
              {!isCollapsed && <SidebarGroupLabel>Workspace</SidebarGroupLabel>}
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

            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu>
                  {WORKSPACE_NAV_ITEMS.map((item) => {
                    const href = workspaceHref(workspaceSlug, item.href);
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

            {/* Back to all workspaces */}
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
          /* Non-workspace: show workspace list */
          <SidebarGroup>
            {!isCollapsed && <SidebarGroupLabel>Workspaces</SidebarGroupLabel>}
            <SidebarGroupContent>
              <Suspense
                fallback={<div className="px-3 py-2 text-xs text-muted-foreground">Loading...</div>}
              >
                <WorkspaceNav />
              </Suspense>
            </SidebarGroupContent>
          </SidebarGroup>
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
    </Sidebar>
  );
}
