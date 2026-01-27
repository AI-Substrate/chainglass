/**
 * Platform-aware ProcessManager adapter.
 *
 * Provides a platform-agnostic way to get a process manager.
 * Uses UnixProcessManager on Unix-like systems and WindowsProcessManager on Windows.
 */

import * as os from 'node:os';
import type { ILogger } from '../interfaces/logger.interface.js';
import type {
  IProcessManager,
  ProcessHandle,
  ProcessSignal,
  SpawnOptions,
} from '../interfaces/process-manager.interface.js';
import { UnixProcessManager } from './unix-process-manager.js';
import { WindowsProcessManager } from './windows-process-manager.js';

/**
 * Factory function to create a platform-appropriate process manager.
 *
 * @param logger - Optional logger for debugging (uses no-op if not provided)
 * @returns Platform-appropriate IProcessManager implementation
 */
export function createProcessManager(logger?: ILogger): IProcessManager {
  const platform = os.platform();
  // If no logger provided, create a no-op logger
  const safeLogger = logger ?? createNoOpLogger();

  if (platform === 'win32') {
    return new WindowsProcessManager(safeLogger);
  }
  return new UnixProcessManager(safeLogger);
}

/**
 * Create a no-op logger for when no logger is provided.
 */
function createNoOpLogger(): ILogger {
  return {
    trace: () => {},
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    fatal: () => {},
    child: () => createNoOpLogger(),
  };
}

/**
 * ProcessManagerAdapter provides a default process manager for the current platform.
 *
 * Implements IProcessManager by delegating to platform-specific implementation.
 * Use createProcessManager() for more control over logger injection.
 */
export class ProcessManagerAdapter implements IProcessManager {
  private readonly impl: IProcessManager;

  constructor(logger?: ILogger) {
    this.impl = createProcessManager(logger);
  }

  spawn(options: SpawnOptions): Promise<ProcessHandle> {
    return this.impl.spawn(options);
  }

  terminate(pid: number): Promise<void> {
    return this.impl.terminate(pid);
  }

  signal(pid: number, signal: ProcessSignal): Promise<void> {
    return this.impl.signal(pid, signal);
  }

  isRunning(pid: number): Promise<boolean> {
    return this.impl.isRunning(pid);
  }

  getPid(handle: ProcessHandle): number {
    return this.impl.getPid(handle);
  }

  getProcessOutput(pid: number): string {
    return this.impl.getProcessOutput?.(pid) ?? '';
  }
}
