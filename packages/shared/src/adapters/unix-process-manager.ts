import { type ChildProcess, spawn } from 'node:child_process';
import * as readline from 'node:readline';

import type { ILogger } from '../interfaces/logger.interface.js';
import type {
  IProcessManager,
  ProcessExitResult,
  ProcessHandle,
  ProcessSignal,
  SpawnOptions,
  StdioOption,
} from '../interfaces/process-manager.interface.js';

/**
 * Internal state for a managed process.
 */
interface ManagedProcess {
  child: ChildProcess;
  pid: number;
  stdout: string;
  stderr: string;
  exited: boolean;
  exitResult: ProcessExitResult | null;
  exitPromise: Promise<ProcessExitResult>;
  exitResolve: (result: ProcessExitResult) => void;
}

/**
 * Default signal escalation interval in milliseconds.
 * Per AC-14: 2 seconds between signals.
 */
const DEFAULT_SIGNAL_INTERVAL_MS = 2000;

/**
 * UnixProcessManager implements IProcessManager for Unix-like systems.
 *
 * Per Critical Discovery 02: Implements signal escalation SIGINT → SIGTERM → SIGKILL
 * with configurable intervals (default 2000ms per AC-14).
 *
 * Per DYK-06: Buffers stdout/stderr for retrieval via getProcessOutput() after
 * process exits, enabling ClaudeCodeAdapter to parse CLI output.
 *
 * Features:
 * - Real process spawning via child_process.spawn()
 * - Signal escalation with configurable timing
 * - Buffered stdout/stderr capture
 * - Graceful handling of already-exited processes
 *
 * Usage:
 * ```typescript
 * const pm = new UnixProcessManager(logger);
 * const handle = await pm.spawn({ command: 'echo', args: ['hello'] });
 * const result = await handle.waitForExit();
 * const output = pm.getProcessOutput(handle.pid);
 * ```
 */
export class UnixProcessManager implements IProcessManager {
  private readonly _logger: ILogger;
  private readonly _processes = new Map<number, ManagedProcess>();
  private readonly _signalIntervalMs: number;

  /**
   * Create a new UnixProcessManager.
   *
   * @param logger - Logger for observability
   * @param signalIntervalMs - Interval between signal escalation steps (default 2000ms)
   */
  constructor(logger: ILogger, signalIntervalMs: number = DEFAULT_SIGNAL_INTERVAL_MS) {
    this._logger = logger;
    this._signalIntervalMs = signalIntervalMs;
  }

  async spawn(options: SpawnOptions): Promise<ProcessHandle> {
    const { command, args = [], cwd, env, stdio, onStdoutLine } = options;

    this._logger.debug('Spawning process', { command, args, cwd });

    return new Promise((resolve, reject) => {
      // Map StdioOption to Node.js stdio values
      const defaultStdio: [StdioOption, StdioOption, StdioOption] = ['ignore', 'pipe', 'pipe'];
      const stdioConfig = stdio ?? defaultStdio;
      
      const child = spawn(command, args, {
        cwd,
        env: env ?? process.env,
        stdio: stdioConfig,
      });

      // Handle spawn error (e.g., command not found)
      child.on('error', (err) => {
        this._logger.error('Process spawn failed', err, { cmd: command });
        reject(err);
      });

      // Need pid to track process
      if (child.pid === undefined) {
        // This shouldn't happen on Unix, but handle it
        reject(new Error(`Failed to get PID for spawned process: ${command}`));
        return;
      }

      const pid = child.pid;

      // Create exit promise machinery
      let exitResolve!: (result: ProcessExitResult) => void;
      const exitPromise = new Promise<ProcessExitResult>((res) => {
        exitResolve = res;
      });

      const managed: ManagedProcess = {
        child,
        pid,
        stdout: '',
        stderr: '',
        exited: false,
        exitResult: null,
        exitPromise,
        exitResolve,
      };

      this._processes.set(pid, managed);

      // Buffer stdout and optionally call onStdoutLine callback
      if (child.stdout) {
        if (onStdoutLine) {
          // Per DYK-02: Use readline for line-by-line callback
          const rl = readline.createInterface({ input: child.stdout });
          rl.on('line', (line) => {
            managed.stdout += line + '\n';
            onStdoutLine(line);
          });
        } else {
          // Original buffering behavior
          child.stdout.on('data', (chunk: Buffer) => {
            managed.stdout += chunk.toString();
          });
        }
      }

      // Buffer stderr
      child.stderr?.on('data', (chunk: Buffer) => {
        managed.stderr += chunk.toString();
      });

      // Handle exit
      child.on('exit', (code, signal) => {
        this._handleExit(pid, code, signal);
      });

      // Handle close (after exit, when streams are closed)
      child.on('close', () => {
        this._logger.debug('Process streams closed', { pid });
      });

      // Resolve with handle once spawn succeeds
      // Use process.nextTick to ensure error handler has a chance to fire
      process.nextTick(() => {
        if (!child.killed && child.pid) {
          const handle: ProcessHandle = {
            pid,
            waitForExit: () => exitPromise,
          };

          this._logger.info('Process spawned', { pid, command });
          resolve(handle);
        }
      });
    });
  }

  async terminate(pid: number): Promise<void> {
    const managed = this._processes.get(pid);

    // Handle unknown or already-exited process
    if (!managed || managed.exited) {
      this._logger.debug('Terminate called on non-running process', { pid, known: !!managed });
      return;
    }

    this._logger.info('Terminating process with signal escalation', { pid });

    // Signal escalation: SIGINT → SIGTERM → SIGKILL
    const signals: ProcessSignal[] = ['SIGINT', 'SIGTERM', 'SIGKILL'];

    for (const signal of signals) {
      // Check if already exited
      if (managed.exited) {
        this._logger.debug('Process exited during termination', { pid, signal });
        return;
      }

      await this.signal(pid, signal);

      // Wait for exit or timeout
      const exitedDuringWait = await this._waitForExit(managed, this._signalIntervalMs);
      if (exitedDuringWait) {
        this._logger.debug('Process exited after signal', { pid, signal });
        return;
      }
    }

    // Should not reach here - SIGKILL always works
    this._logger.warn('Process did not exit after SIGKILL', { pid });
  }

  async signal(pid: number, signal: ProcessSignal): Promise<void> {
    const managed = this._processes.get(pid);

    if (!managed) {
      // Unknown process - might be stale PID, handle gracefully
      this._logger.debug('Signal to unknown process', { pid, signal });
      return;
    }

    if (managed.exited) {
      // Already exited - no-op
      this._logger.debug('Signal to exited process', { pid, signal });
      return;
    }

    this._logger.debug('Sending signal', { pid, signal });

    try {
      managed.child.kill(signal);
    } catch (err) {
      // Process may have exited between check and kill
      this._logger.debug('Signal failed (process may have exited)', {
        pid,
        signal,
        error: (err as Error).message,
      });
    }
  }

  async isRunning(pid: number): Promise<boolean> {
    const managed = this._processes.get(pid);

    if (!managed) {
      // Unknown process - check if OS knows about it
      try {
        process.kill(pid, 0);
        return true; // Process exists (may not be ours)
      } catch {
        return false;
      }
    }

    return !managed.exited;
  }

  getPid(handle: ProcessHandle): number {
    return handle.pid;
  }

  /**
   * Get buffered stdout output from a process.
   *
   * Per DYK-06: Returns accumulated stdout for parsing after process exits.
   * Called by ClaudeCodeAdapter after waitForExit() completes.
   *
   * @param pid - Process ID to get output for
   * @returns Buffered stdout content, or empty string if unknown
   */
  getProcessOutput(pid: number): string {
    const managed = this._processes.get(pid);
    return managed?.stdout ?? '';
  }

  /**
   * Handle process exit event.
   */
  private _handleExit(pid: number, code: number | null, signal: NodeJS.Signals | null): void {
    const managed = this._processes.get(pid);
    if (!managed) return;

    managed.exited = true;

    // Map signal to ProcessSignal type if present
    let mappedSignal: ProcessSignal | undefined;
    if (signal === 'SIGINT' || signal === 'SIGTERM' || signal === 'SIGKILL') {
      mappedSignal = signal;
    }

    const result: ProcessExitResult = {
      exitCode: code,
      signal: mappedSignal,
    };

    managed.exitResult = result;
    managed.exitResolve(result);

    this._logger.info('Process exited', { pid, exitCode: code, signal });
  }

  /**
   * Wait for process to exit, with timeout.
   *
   * @param managed - Managed process state
   * @param timeoutMs - Maximum time to wait
   * @returns true if process exited, false if timeout
   */
  private _waitForExit(managed: ManagedProcess, timeoutMs: number): Promise<boolean> {
    return new Promise((resolve) => {
      if (managed.exited) {
        resolve(true);
        return;
      }

      const timeout = setTimeout(() => {
        resolve(false);
      }, timeoutMs);

      managed.exitPromise.then(() => {
        clearTimeout(timeout);
        resolve(true);
      });
    });
  }
}
