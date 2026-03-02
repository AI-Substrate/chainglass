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
