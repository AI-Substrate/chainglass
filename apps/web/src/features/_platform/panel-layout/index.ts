/**
 * Panel Layout — Barrel Export
 *
 * Reusable three-panel layout system for workspace detail pages.
 * Domain: _platform/panel-layout
 * Plan 043: Panel Layout System
 */

// Types
export type { PanelMode, BarHandler, BarContext, ExplorerPanelHandle } from './types';

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
export { AsciiSpinner } from './components/ascii-spinner';
export type { AsciiSpinnerProps } from './components/ascii-spinner';

// Stub handlers
export { createSymbolSearchStub } from './stub-handlers';
