/**
 * Terminal Domain — Barrel Export
 *
 * Public contracts for the terminal business domain.
 * Domain: terminal
 * Plan 064: Terminal Integration via tmux
 */

// Types
export type {
  TerminalSession,
  TerminalMessage,
  ConnectionStatus,
  TerminalServerOptions,
  PtySpawner,
  PtyProcess,
  CommandExecutor,
} from './types';

// Components (Phase 2)
export { TerminalView } from './components/terminal-view';
export type { TerminalViewProps } from './components/terminal-view';
export { ConnectionStatusBadge } from './components/connection-status-badge';
export { TerminalSkeleton } from './components/terminal-skeleton';
