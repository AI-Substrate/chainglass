/**
 * Navigation Data Utilities
 *
 * Centralized navigation item definitions for sidebar and bottom tab bar.
 * Provides a single source of truth for navigation items across the app.
 *
 * Phase 3 restructure: Split into workspace-scoped, dev, and landing groups.
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
  /** Route path (or template with `:slug` for workspace-scoped items) */
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
 * Workspace-scoped navigation items — shown inside a workspace context.
 * Browser, Agents, Workflows are the core product actions.
 */
export const WORKSPACE_NAV_ITEMS: readonly NavItem[] = [
  { id: 'browser', label: 'Browser', href: '/browser', icon: FolderOpen },
  { id: 'agents', label: 'Agents', href: '/agents', icon: Bot },
  { id: 'workflows', label: 'Workflows', href: '/workgraphs', icon: ListChecks },
] as const;

/**
 * Dev / prototype navigation items — collapsed section in sidebar.
 * Demos and internal tools that aren't core product.
 */
export const DEV_NAV_ITEMS: readonly NavItem[] = [
  { id: 'workflow-viz', label: 'Workflow Visualization', href: '/workflow', icon: GitBranch },
  { id: 'kanban', label: 'Kanban Board', href: '/kanban', icon: LayoutDashboard },
  { id: 'agents-global', label: 'Agents (Global)', href: '/agents', icon: Bot },
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
 * Landing page navigation — just Home.
 */
export const LANDING_NAV_ITEMS: readonly NavItem[] = [
  { id: 'home', label: 'Home', href: '/', icon: Home },
] as const;

/**
 * Full navigation items for sidebar (backward compat).
 * @deprecated Use WORKSPACE_NAV_ITEMS, DEV_NAV_ITEMS, LANDING_NAV_ITEMS instead.
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
