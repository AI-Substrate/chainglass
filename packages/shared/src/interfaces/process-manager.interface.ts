/**
 * Signal types that can be sent to a process.
 */
export type ProcessSignal = 'SIGINT' | 'SIGTERM' | 'SIGKILL';

/**
 * Standard I/O configuration for spawn.
 * Per DYK-01: Allows configuring stdin behavior for streaming.
 *
 * - 'inherit': Inherit from parent process (needed for Claude CLI streaming)
 * - 'pipe': Create a pipe (default for stdout/stderr)
 * - 'ignore': Discard (default for stdin)
 */
export type StdioOption = 'inherit' | 'pipe' | 'ignore';

/**
 * Stdio configuration array [stdin, stdout, stderr]
 */
export type StdioOptions = [StdioOption, StdioOption, StdioOption];

/**
 * Options for spawning a new process.
 */
export interface SpawnOptions {
  /** Command to execute */
  command: string;
  /** Arguments to pass to the command */
  args?: string[];
  /** Working directory for the process */
  cwd?: string;
  /** Environment variables for the process */
  env?: Record<string, string>;
  /**
   * Standard I/O configuration [stdin, stdout, stderr].
   * Default: ['ignore', 'pipe', 'pipe']
   *
   * For streaming: use default ['ignore', 'pipe', 'pipe'].
   * Note: stdin='ignore' works correctly since prompt is passed via -p flag.
   * Avoid stdin='pipe' as it can cause subprocess hanging.
   */
  stdio?: StdioOptions;
  /**
   * Callback invoked for each line of stdout.
   * Per DYK-02: Enables real-time event streaming in adapters.
   *
   * When provided, the callback is called as each line arrives.
   * The process manager still buffers full output for getProcessOutput().
   *
   * @param line - A single line from stdout (without newline)
   */
  onStdoutLine?: (line: string) => void;
}

/**
 * Result of a process exit.
 */
export interface ProcessExitResult {
  /** Exit code (0 for success, >0 for failure, null if killed by signal) */
  exitCode: number | null;
  /** Signal that killed the process (if any) */
  signal?: ProcessSignal;
}

/**
 * Handle to a spawned process.
 *
 * Provides access to process ID and methods to wait for completion.
 */
export interface ProcessHandle {
  /** Process ID (PID) assigned by the OS */
  pid: number;

  /**
   * Wait for the process to exit.
   * @returns ProcessExitResult with exit code and signal info
   */
  waitForExit(): Promise<ProcessExitResult>;

  /**
   * Get stdout stream from the process.
   * Returns undefined if stdout is not captured.
   */
  readonly stdout?: AsyncIterable<string>;

  /**
   * Get stderr stream from the process.
   * Returns undefined if stderr is not captured.
   */
  readonly stderr?: AsyncIterable<string>;
}

/**
 * Interface for process lifecycle management.
 *
 * Per DYK-04: Full 5-method interface defined from Phase 1:
 * spawn(), terminate(), signal(), isRunning(), getPid()
 *
 * This enables signal escalation testing and complete process control.
 *
 * Implementations:
 * - FakeProcessManager: Test double with signal tracking
 * - ProcessManager: Real process management (Phase 3)
 */
export interface IProcessManager {
  /**
   * Spawn a new process.
   *
   * @param options - Command, args, cwd, and env settings
   * @returns ProcessHandle for the spawned process
   * @throws Error if command not found or spawn fails
   */
  spawn(options: SpawnOptions): Promise<ProcessHandle>;

  /**
   * Terminate a process using signal escalation.
   *
   * Per AC-14: Uses SIGINT → SIGTERM → SIGKILL sequence with 2-second intervals.
   * Completes when process exits or after SIGKILL.
   *
   * @param pid - Process ID to terminate
   * @throws Error if process not found (may be already exited - handle gracefully)
   */
  terminate(pid: number): Promise<void>;

  /**
   * Send a specific signal to a process.
   *
   * @param pid - Process ID to signal
   * @param signal - Signal to send (SIGINT, SIGTERM, SIGKILL)
   * @throws Error if process not found
   */
  signal(pid: number, signal: ProcessSignal): Promise<void>;

  /**
   * Check if a process is currently running.
   *
   * @param pid - Process ID to check
   * @returns true if process is running, false otherwise
   */
  isRunning(pid: number): Promise<boolean>;

  /**
   * Get the PID from a ProcessHandle.
   *
   * @param handle - ProcessHandle to extract PID from
   * @returns The process ID
   */
  getPid(handle: ProcessHandle): number;

  /**
   * Get buffered stdout output from a completed process.
   *
   * Optional method for process managers that buffer output internally.
   * Used by ClaudeCodeAdapter to retrieve CLI output after process exits.
   *
   * @param pid - Process ID to get output for
   * @returns Buffered stdout content, or empty string if unavailable
   */
  getProcessOutput?(pid: number): string;

  /**
   * Get buffered stderr for a process.
   * @param pid - Process ID to get stderr for
   * @returns Buffered stderr content, or empty string if unavailable
   */
  getProcessStderr?(pid: number): string;
}
