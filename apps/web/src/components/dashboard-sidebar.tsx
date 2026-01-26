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
import { cn } from '@/lib/utils';
import {
  Code,
  FileText,
  GitBranch,
  GitCompare,
  Home,
  LayoutDashboard,
  PanelLeft,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * Navigation items for the dashboard
 */
const NAV_ITEMS = [
  { label: 'Home', href: '/', icon: Home },
  { label: 'Workflow Visualization', href: '/workflow', icon: GitBranch },
  { label: 'Kanban Board', href: '/kanban', icon: LayoutDashboard },
  { label: 'FileViewer Demo', href: '/demo/file-viewer', icon: Code },
  { label: 'MarkdownViewer Demo', href: '/demo/markdown-viewer', icon: FileText },
  { label: 'DiffViewer Demo', href: '/demo/diff-viewer', icon: GitCompare },
] as const;

/**
 * DashboardSidebar
 *
 * Collapsible sidebar with navigation items and theme toggle.
 * Uses shadcn Sidebar components for consistent styling and behavior.
 *
 * Features:
 * - Active route highlighting
 * - Collapse/expand toggle
 * - Icons-only mode when collapsed
 * - ThemeToggle in header
 */
export function DashboardSidebar() {
  const pathname = usePathname();
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === 'collapsed';

  return (
    <Sidebar role="complementary" collapsible="icon" className={cn(isCollapsed && 'w-16')}>
      <SidebarHeader className="border-b p-4">
        <div className="flex items-center justify-between gap-2">
          {!isCollapsed && <span className="font-semibold">Chainglass</span>}
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
        <SidebarGroup>
          {!isCollapsed && <SidebarGroupLabel>Navigation</SidebarGroupLabel>}
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV_ITEMS.map((item) => {
                const isActive = pathname === item.href;
                const Icon = item.icon;

                return (
                  <SidebarMenuItem key={item.href}>
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
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
