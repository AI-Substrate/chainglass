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
  /**
   * True when the session name matches the current worktree-folder basename
   * (e.g. worktree `/Users/x/github/higgs-jordo` → session `higgs-jordo`).
   * Aligns with the convention used by `tmux new-session -A -s <basename>`.
   * Plan FX006.
   */
  isWorktreeFolderMatch: boolean;
  /**
   * True when the session name matches the current worktree's branch name.
   * Pre-FX006 this was the only "current worktree" signal (under the
   * misleading name `isCurrentWorktree`). Now demoted to a fallback —
   * primarily useful when a user manually maintains branch-named sessions.
   * Plan FX006.
   */
  isBranchMatch: boolean;
}

/** Messages exchanged over the terminal WebSocket */
export type TerminalMessage =
  | { type: 'data'; data: string }
  | { type: 'resize'; cols: number; rows: number }
  | { type: 'status'; status: string; tmux: boolean; message?: string }
  | { type: 'resync' }
  | { type: 'send-keys'; text: string; submit: boolean }
  | { type: 'rename-window'; name: string }
  | { type: 'sessions'; sessions: TerminalSession[] };

/**
 * Deliver a saved prompt to the coding agent in the pane (Plan 092).
 *
 * `submit` is a FLAG, never a newline: a real newline in an agent TUI is a
 * submit, so the type and the Enter are two separate tmux calls with a settle
 * between them. Only the sender can sequence that, so the caller carries
 * intent and the sender owns delivery.
 */
export type SendPrompt = (text: string, options: { submit: boolean }) => void;

/** Rename the active tmux window for the terminal's attached session. */
export type RenameWindow = (name: string) => void;

/** Outcome of a rename-window control frame, as reported by the sidecar. */
export interface RenameWindowResult {
  /** True when tmux completed the window rename. */
  renamed: boolean;
  error?: string;
}

/** Outcome of a send-keys control frame, as reported by the sidecar. */
export interface SendPromptResult {
  /**
   * True when tmux exited zero. NOT proof the agent accepted the prompt —
   * naming it `delivered` rather than `ok` is deliberate, so no UI can build a
   * success claim on it. Verified submit is Plan 092 ph-0003.
   */
  delivered: boolean;
  error?: string;
}

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
