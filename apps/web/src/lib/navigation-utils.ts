/**
 * Navigation Data Utilities
 *
 * Centralized navigation item definitions for sidebar and bottom tab bar.
 * Provides a single source of truth for navigation items across the app.
 *
 * @see Phase 7: Mobile Templates & Documentation
 */

import {
  Bot,
  Code,
  FileText,
  FolderOpen,
  GitBranch,
  GitCompare,
  Home,
  LayoutDashboard,
  ListChecks,
  type LucideIcon,
  Smartphone,
} from 'lucide-react';

/**
 * Navigation item definition for sidebar and bottom tab bar.
 */
export interface NavItem {
  /** Unique identifier for the nav item */
  id: string;
  /** Display label */
  label: string;
  /** Route path */
  href: string;
  /** Lucide icon component */
  icon: LucideIcon;
}

/**
 * Navigation mode - determines which navigation pattern to use.
 * - 'phone': Bottom tab bar (viewport < 768px)
 * - 'desktop': Sidebar (viewport >= 768px)
 */
export type NavigationMode = 'phone' | 'desktop';

/**
 * Full navigation items for sidebar (tablet/desktop).
 * Includes all navigation destinations: core pages + demos.
 */
export const NAV_ITEMS: readonly NavItem[] = [
  { id: 'home', label: 'Home', href: '/', icon: Home },
  { id: 'workflows', label: 'Workflows', href: '/workflows', icon: ListChecks },
  { id: 'workspaces', label: 'Workspaces', href: '/workspaces', icon: FolderOpen },
  { id: 'workflow', label: 'Workflow Visualization', href: '/workflow', icon: GitBranch },
  { id: 'kanban', label: 'Kanban Board', href: '/kanban', icon: LayoutDashboard },
  { id: 'agents', label: 'Agents', href: '/agents', icon: Bot },
  { id: 'file-viewer-demo', label: 'FileViewer Demo', href: '/demo/file-viewer', icon: Code },
  {
    id: 'markdown-viewer-demo',
    label: 'MarkdownViewer Demo',
    href: '/demo/markdown-viewer',
    icon: FileText,
  },
  { id: 'diff-viewer-demo', label: 'DiffViewer Demo', href: '/demo/diff-viewer', icon: GitCompare },
  { id: 'responsive-demo', label: 'Responsive Demo', href: '/demo/responsive', icon: Smartphone },
] as const;

/**
 * Core navigation items for mobile bottom tab bar.
 * Limited to 3 essential items for optimal touch target sizing.
 *
 * Per DYK session decision: Demo pages excluded from phone nav.
 * Phone users access demos via sidebar on larger viewports.
 */
export const MOBILE_NAV_ITEMS: readonly NavItem[] = [
  { id: 'home', label: 'Home', href: '/', icon: Home },
  { id: 'workflows', label: 'Workflows', href: '/workflows', icon: ListChecks },
  { id: 'kanban', label: 'Kanban', href: '/kanban', icon: LayoutDashboard },
] as const;
