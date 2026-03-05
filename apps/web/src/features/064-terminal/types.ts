/**
 * Terminal Domain — Public Types
 *
 * Core types for the terminal business domain.
 * Plan 064: Terminal Integration via tmux
 */

/** A tmux session discovered on the host machine */
export interface TerminalSession {
  /** Session name (e.g., "064-tmux") — matches worktree branch name */
  name: string;
  /** Number of currently attached tmux clients */
  attached: number;
  /** Number of tmux windows in this session */
  windows: number;
  /** Unix timestamp when session was created */
  created: number;
  /** Whether this session matches the current worktree's branch name */
  isCurrentWorktree: boolean;
}

/** Messages exchanged over the terminal WebSocket */
export type TerminalMessage =
  | { type: 'data'; data: string }
  | { type: 'resize'; cols: number; rows: number }
  | { type: 'status'; status: string; tmux: boolean; message?: string }
  | { type: 'resync' }
  | { type: 'sessions'; sessions: TerminalSession[] }
  | { type: 'pane_title'; title: string };

/** WebSocket connection state for the terminal */
export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';

/** Options for the sidecar WebSocket server */
export interface TerminalServerOptions {
  port: number;
  host?: string;
  /** Injectable PTY spawner for testing */
  spawnPty?: PtySpawner;
  /** Injectable command executor for testing */
  execCommand?: CommandExecutor;
}

/** Injectable function type for spawning PTY processes */
export type PtySpawner = (
  command: string,
  args: string[],
  options: { name: string; cols: number; rows: number; cwd: string; env: Record<string, string> }
) => PtyProcess;

/** Minimal PTY process interface (subset of node-pty IPty) */
export interface PtyProcess {
  onData: (callback: (data: string) => void) => void;
  onExit: (callback: (exitCode: { exitCode: number }) => void) => void;
  write: (data: string) => void;
  resize: (cols: number, rows: number) => void;
  kill: () => void;
  pid: number;
}

/** Injectable function type for executing shell commands */
export type CommandExecutor = (
  command: string,
  args: string[],
  options?: { encoding?: string; stdio?: string }
) => string;
