/**
 * Panel Layout — Barrel Export
 *
 * Reusable three-panel layout system for workspace detail pages.
 * Domain: _platform/panel-layout
 * Plan 043: Panel Layout System
 */

// Types
export type {
  PanelMode,
  BarHandler,
  BarContext,
  ExplorerPanelHandle,
  FileSearchSortMode,
  FileSearchEntry,
  FileChangeInfo,
  CodeSearchMode,
  CodeSearchAvailability,
  CodeSearchResult,
  GrepSearchResult,
  FlowSpaceSearchResult,
} from './types';
export { FLOWSPACE_CATEGORY_ICONS } from './types';

// Components
export { PanelHeader } from './components/panel-header';
export type {
  PanelHeaderProps,
  PanelHeaderMode,
  PanelHeaderAction,
} from './components/panel-header';
export { ExplorerPanel } from './components/explorer-panel';
export type { ExplorerPanelProps } from './components/explorer-panel';
export { LeftPanel } from './components/left-panel';
export type { LeftPanelProps, LeftPanelMode } from './components/left-panel';
export { MainPanel } from './components/main-panel';
export type { MainPanelProps } from './components/main-panel';
export { PanelShell } from './components/panel-shell';
export type { PanelShellProps } from './components/panel-shell';
export { MobilePanelShell } from './components/mobile-panel-shell';
export type { MobilePanelShellProps, MobilePanelShellView } from './components/mobile-panel-shell';
export { MobileSwipeStrip } from './components/mobile-swipe-strip';
export type { MobileSwipeStripProps, MobileSwipeStripView } from './components/mobile-swipe-strip';
export { MobileExplorerSheet } from './components/mobile-explorer-sheet';
export type { MobileExplorerSheetProps } from './components/mobile-explorer-sheet';
export { AsciiSpinner } from './components/ascii-spinner';
export type { AsciiSpinnerProps } from './components/ascii-spinner';
