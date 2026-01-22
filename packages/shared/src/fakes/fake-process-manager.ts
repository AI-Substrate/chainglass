import type {
  IProcessManager,
  ProcessExitResult,
  ProcessHandle,
  ProcessSignal,
  SpawnOptions,
} from '../interfaces/process-manager.interface.js';

/**
 * Internal state for a fake process.
 */
interface FakeProcessState {
  pid: number;
  running: boolean;
  exitCode: number | null;
  exitSignal: ProcessSignal | null;
  exitOnSignal: ProcessSignal | null;
  stubborn: boolean;
  output: string;
  waitResolvers: Array<(result: ProcessExitResult) => void>;
}

/**
 * Signal history entry with timing.
 */
interface SignalEntry {
  signal: ProcessSignal;
  timestamp: number;
}

/**
 * FakeProcessManager is a test double for IProcessManager that tracks
 * all operations and provides configurable process behaviors.
 *
 * Per DYK-04: Implements full 5-method interface (spawn, terminate, signal, isRunning, getPid).
 *
 * Features:
 * - Configurable process behaviors (stubborn, exit on signal)
 * - Signal tracking with timing for escalation verification
 * - Spawn history for call verification
 * - Assertion helpers for testing
 *
 * Usage:
 * ```typescript
 * const fake = new FakeProcessManager();
 *
 * const handle = await fake.spawn({ command: 'node', args: ['app.js'] });
 * fake.makeProcessStubborn(handle.pid); // Process ignores SIGINT/SIGTERM
 *
 * await fake.terminate(handle.pid);
 *
 * const signals = fake.getSignalsSent(handle.pid);
 * expect(signals).toContain('SIGKILL'); // Had to escalate to SIGKILL
 * ```
 */
export class FakeProcessManager implements IProcessManager {
  private _nextPid = 1001;
  private _processes = new Map<number, FakeProcessState>();
  private _spawnHistory: SpawnOptions[] = [];
  private _signalHistory = new Map<number, SignalEntry[]>();
  private _spawnError: Error | null = null;

  async spawn(options: SpawnOptions): Promise<ProcessHandle> {
    // Check if spawn should throw an error (for testing error handling)
    if (this._spawnError) {
      const error = this._spawnError;
      this._spawnError = null; // Only throw once
      throw error;
    }

    const pid = this._nextPid++;
    this._spawnHistory.push({ ...options });

    const state: FakeProcessState = {
      pid,
      running: true,
      exitCode: null,
      exitSignal: null,
      exitOnSignal: null,
      stubborn: false,
      output: '',
      waitResolvers: [],
    };
    this._processes.set(pid, state);
    this._signalHistory.set(pid, []);

    const handle: ProcessHandle = {
      pid,
      waitForExit: () => this._waitForExit(pid),
    };

    return handle;
  }

  async terminate(pid: number): Promise<void> {
    const state = this._processes.get(pid);
    if (!state || !state.running) {
      return; // Already exited or not found
    }

    // Signal escalation: SIGINT → SIGTERM → SIGKILL
    const signals: ProcessSignal[] = ['SIGINT', 'SIGTERM', 'SIGKILL'];

    for (const signal of signals) {
      await this.signal(pid, signal);

      // Check if process exited
      const currentState = this._processes.get(pid);
      if (!currentState?.running) {
        return;
      }

      // Wait between signals (minimal for fake; real would be 2s)
      await new Promise((resolve) => setTimeout(resolve, 1));
    }
  }

  async signal(pid: number, signal: ProcessSignal): Promise<void> {
    const state = this._processes.get(pid);

    // Record signal regardless of process state
    const history = this._signalHistory.get(pid) ?? [];
    history.push({ signal, timestamp: Date.now() });
    this._signalHistory.set(pid, history);

    if (!state || !state.running) {
      return;
    }

    // Stubborn processes only exit on SIGKILL
    if (state.stubborn) {
      if (signal === 'SIGKILL') {
        this._exitProcess(pid, 137, 'SIGKILL'); // 128 + 9
      }
      return;
    }

    // Check if process should exit on this specific signal (not earlier ones)
    if (state.exitOnSignal !== null) {
      if (state.exitOnSignal === signal) {
        this._exitProcess(pid, 128 + this._signalToCode(signal), signal);
      }
      // Don't exit on other signals if exitOnSignal is configured
      return;
    }

    // Default behavior: process exits on any signal
    this._exitProcess(pid, 128 + this._signalToCode(signal), signal);
  }

  async isRunning(pid: number): Promise<boolean> {
    const state = this._processes.get(pid);
    return state?.running ?? false;
  }

  getPid(handle: ProcessHandle): number {
    return handle.pid;
  }

  // ============================================
  // Test configuration methods
  // ============================================

  /**
   * Configure spawn() to throw an error on the next call.
   *
   * Use this to test error handling when CLI is not found or spawn fails.
   * The error is thrown once, then spawn() resumes normal behavior.
   *
   * @param error - Error to throw on next spawn() call
   *
   * @example
   * ```typescript
   * const fake = new FakeProcessManager();
   * const enoent = new Error('ENOENT: command not found') as NodeJS.ErrnoException;
   * enoent.code = 'ENOENT';
   * fake.setSpawnError(enoent);
   *
   * // This will throw
   * await expect(fake.spawn({ command: 'missing' })).rejects.toThrow('ENOENT');
   * ```
   */
  setSpawnError(error: Error): void {
    this._spawnError = error;
  }

  /**
   * Make a process stubborn - it will ignore SIGINT and SIGTERM,
   * only exiting on SIGKILL.
   */
  makeProcessStubborn(pid: number): void {
    const state = this._processes.get(pid);
    if (state) {
      state.stubborn = true;
    }
  }

  /**
   * Configure a process to exit when a specific signal is received.
   */
  exitProcessOnSignal(pid: number, signal: ProcessSignal): void {
    const state = this._processes.get(pid);
    if (state) {
      state.exitOnSignal = signal;
    }
  }

  /**
   * Force a process to exit with a specific exit code.
   */
  exitProcess(pid: number, exitCode: number): void {
    this._exitProcess(pid, exitCode, null);
  }

  /**
   * Set the buffered output for a process.
   *
   * Per DYK-06: FakeProcessManager doesn't provide stdout streams.
   * Instead, use this method to set output that will be returned
   * when getProcessOutput() is called after process exits.
   *
   * Usage:
   * ```typescript
   * const handle = await fake.spawn({ command: 'claude', args: [...] });
   * fake.setProcessOutput(handle.pid, '{"session_id":"abc","type":"message"}\n');
   * fake.exitProcess(handle.pid, 0);
   * const output = fake.getProcessOutput(handle.pid);
   * ```
   */
  setProcessOutput(pid: number, output: string): void {
    const state = this._processes.get(pid);
    if (state) {
      state.output = output;
    }
  }

  // ============================================
  // Test helper methods
  // ============================================

  /**
   * Get all spawn() calls made to this manager.
   */
  getSpawnHistory(): SpawnOptions[] {
    return [...this._spawnHistory];
  }

  /**
   * Get all signals sent to a specific process.
   */
  getSignalsSent(pid: number): ProcessSignal[] {
    const history = this._signalHistory.get(pid) ?? [];
    return history.map((entry) => entry.signal);
  }

  /**
   * Get timestamps of signals sent to a process.
   */
  getSignalTimings(pid: number): number[] {
    const history = this._signalHistory.get(pid) ?? [];
    return history.map((entry) => entry.timestamp);
  }

  /**
   * Get the buffered output for a process.
   *
   * Per DYK-06: Returns output previously set via setProcessOutput().
   *
   * @returns Process output or empty string if not set
   */
  getProcessOutput(pid: number): string {
    const state = this._processes.get(pid);
    return state?.output ?? '';
  }

  /**
   * Assert that spawn() was called with matching options.
   * Uses partial matching - all specified fields must match.
   *
   * @throws Error if no matching call found
   */
  assertSpawnCalled(expected: Partial<SpawnOptions>): void {
    const match = this._spawnHistory.some((call) => {
      return Object.entries(expected).every(([key, value]) => {
        const callValue = call[key as keyof SpawnOptions];
        if (Array.isArray(value)) {
          return JSON.stringify(callValue) === JSON.stringify(value);
        }
        return callValue === value;
      });
    });

    if (!match) {
      const history = this._spawnHistory.length === 0
        ? '(no calls)'
        : this._spawnHistory.map((c) => JSON.stringify(c)).join('\n  ');

      throw new Error(
        `Expected spawn() to be called with ${JSON.stringify(expected)}\n` +
        `Actual calls:\n  ${history}`
      );
    }
  }

  /**
   * Assert that a specific signal was sent to a process.
   *
   * @throws Error if signal was not sent
   */
  assertSignalSent(pid: number, signal: ProcessSignal): void {
    const signals = this.getSignalsSent(pid);
    if (!signals.includes(signal)) {
      throw new Error(
        `Expected signal ${signal} to be sent to PID ${pid}\n` +
        `Actual signals: ${signals.length === 0 ? '(none)' : signals.join(', ')}`
      );
    }
  }

  /**
   * Clear all state for test isolation.
   */
  reset(): void {
    this._processes.clear();
    this._spawnHistory = [];
    this._signalHistory.clear();
    this._nextPid = 1001;
    this._spawnError = null;
  }

  // ============================================
  // Private helpers
  // ============================================

  private _waitForExit(pid: number): Promise<ProcessExitResult> {
    const state = this._processes.get(pid);
    if (!state) {
      return Promise.resolve({ exitCode: null, signal: undefined });
    }

    if (!state.running) {
      return Promise.resolve({
        exitCode: state.exitCode,
        signal: state.exitSignal ?? undefined,
      });
    }

    return new Promise((resolve) => {
      state.waitResolvers.push(resolve);
    });
  }

  private _exitProcess(pid: number, exitCode: number, signal: ProcessSignal | null): void {
    const state = this._processes.get(pid);
    if (!state || !state.running) {
      return;
    }

    state.running = false;
    state.exitCode = exitCode;
    state.exitSignal = signal;

    // Resolve all waitForExit promises
    const result: ProcessExitResult = {
      exitCode,
      signal: signal ?? undefined,
    };
    for (const resolve of state.waitResolvers) {
      resolve(result);
    }
    state.waitResolvers = [];
  }

  private _signalToCode(signal: ProcessSignal): number {
    switch (signal) {
      case 'SIGINT':
        return 2;
      case 'SIGTERM':
        return 15;
      case 'SIGKILL':
        return 9;
    }
  }
}
