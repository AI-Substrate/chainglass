import { type ChildProcess, exec, spawn } from 'node:child_process';

import type { ILogger } from '../interfaces/logger.interface.js';
import type {
  IProcessManager,
  ProcessExitResult,
  ProcessHandle,
  ProcessSignal,
  SpawnOptions,
} from '../interfaces/process-manager.interface.js';

/**
 * Internal state for a managed process on Windows.
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
 * Per AC-14: 2 seconds between termination attempts.
 */
const DEFAULT_SIGNAL_INTERVAL_MS = 2000;

/**
 * WindowsProcessManager implements IProcessManager for Windows systems.
 *
 * Per Plan Risk Table: Windows has different process model - uses `taskkill`
 * instead of Unix signals. SIGINT/SIGTERM/SIGKILL are not directly supported.
 *
 * Termination strategy:
 * 1. First attempt: CTRL+C signal via taskkill (graceful)
 * 2. Second attempt: taskkill /F (forced termination)
 *
 * Note: This is a documented limitation - Windows does not support the full
 * signal escalation semantics of Unix. The implementation provides equivalent
 * functionality using Windows-native mechanisms.
 *
 * Usage:
 * ```typescript
 * const pm = new WindowsProcessManager(logger);
 * const handle = await pm.spawn({ command: 'node', args: ['script.js'] });
 * await pm.terminate(handle.pid); // Uses taskkill
 * ```
 */
export class WindowsProcessManager implements IProcessManager {
  private readonly _logger: ILogger;
  private readonly _processes = new Map<number, ManagedProcess>();
  private readonly _signalIntervalMs: number;

  /**
   * Create a new WindowsProcessManager.
   *
   * @param logger - Logger for observability
   * @param signalIntervalMs - Interval between termination attempts (default 2000ms)
   */
  constructor(logger: ILogger, signalIntervalMs: number = DEFAULT_SIGNAL_INTERVAL_MS) {
    this._logger = logger;
    this._signalIntervalMs = signalIntervalMs;
  }

  async spawn(options: SpawnOptions): Promise<ProcessHandle> {
    const { command, args = [], cwd, env } = options;

    this._logger.debug('Spawning process (Windows)', { command, args, cwd });

    return new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        cwd,
        env: env ?? process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
        // Windows-specific: use shell for better command handling
        shell: true,
      });

      // Handle spawn error
      child.on('error', (err) => {
        this._logger.error('Process spawn failed (Windows)', err, { cmd: command });
        reject(err);
      });

      if (child.pid === undefined) {
        reject(new Error(`Failed to get PID for spawned process: ${command}`));
        return;
      }

      const pid = child.pid;

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

      child.stdout?.on('data', (chunk: Buffer) => {
        managed.stdout += chunk.toString();
      });

      child.stderr?.on('data', (chunk: Buffer) => {
        managed.stderr += chunk.toString();
      });

      child.on('exit', (code, signal) => {
        this._handleExit(pid, code, signal);
      });

      process.nextTick(() => {
        if (!child.killed && child.pid) {
          const handle: ProcessHandle = {
            pid,
            waitForExit: () => exitPromise,
          };

          this._logger.info('Process spawned (Windows)', { pid, command });
          resolve(handle);
        }
      });
    });
  }

  async terminate(pid: number): Promise<void> {
    const managed = this._processes.get(pid);

    if (!managed || managed.exited) {
      this._logger.debug('Terminate called on non-running process (Windows)', {
        pid,
        known: !!managed,
      });
      return;
    }

    this._logger.info('Terminating process with taskkill (Windows)', { pid });

    // First attempt: try graceful termination
    // Note: On Windows, there's no direct equivalent to SIGINT for console processes
    // We try regular taskkill first, then taskkill /F
    try {
      await this._execTaskkill(pid, false);
      const exited = await this._waitForExit(managed, this._signalIntervalMs);
      if (exited) {
        this._logger.debug('Process exited after graceful taskkill', { pid });
        return;
      }
    } catch {
      // Process might not respond to graceful termination
    }

    // Second attempt: force kill
    try {
      await this._execTaskkill(pid, true);
      await this._waitForExit(managed, this._signalIntervalMs);
      this._logger.debug('Process terminated with forced taskkill', { pid });
    } catch {
      // Already exited or other error
      this._logger.debug('Taskkill /F completed or failed', { pid });
    }
  }

  async signal(pid: number, signal: ProcessSignal): Promise<void> {
    const managed = this._processes.get(pid);

    if (!managed) {
      this._logger.debug('Signal to unknown process (Windows)', { pid, signal });
      return;
    }

    if (managed.exited) {
      this._logger.debug('Signal to exited process (Windows)', { pid, signal });
      return;
    }

    this._logger.debug('Sending signal via taskkill (Windows)', { pid, signal });

    // Map signals to Windows behavior
    // SIGKILL always uses /F, others try graceful first
    const forceKill = signal === 'SIGKILL';

    try {
      await this._execTaskkill(pid, forceKill);
    } catch (err) {
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
      // Check via tasklist
      return this._checkProcessExists(pid);
    }

    return !managed.exited;
  }

  getPid(handle: ProcessHandle): number {
    return handle.pid;
  }

  /**
   * Get buffered stdout output from a process.
   */
  getProcessOutput(pid: number): string {
    const managed = this._processes.get(pid);
    return managed?.stdout ?? '';
  }

  /**
   * Execute taskkill command.
   *
   * @param pid - Process ID to kill
   * @param force - If true, use /F flag for forced termination
   */
  private _execTaskkill(pid: number, force: boolean): Promise<void> {
    return new Promise((resolve, reject) => {
      const flags = force ? '/F' : '';
      const cmd = `taskkill /PID ${pid} ${flags}`.trim();

      exec(cmd, (error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Check if a process exists using tasklist.
   */
  private _checkProcessExists(pid: number): Promise<boolean> {
    return new Promise((resolve) => {
      exec(`tasklist /FI "PID eq ${pid}" /NH`, (error, stdout) => {
        if (error) {
          resolve(false);
          return;
        }
        // If process exists, tasklist output contains the PID
        resolve(stdout.includes(String(pid)));
      });
    });
  }

  private _handleExit(pid: number, code: number | null, signal: NodeJS.Signals | null): void {
    const managed = this._processes.get(pid);
    if (!managed) return;

    managed.exited = true;

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

    this._logger.info('Process exited (Windows)', { pid, exitCode: code, signal });
  }

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
