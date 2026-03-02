/**
 * FakePty — Test double for node-pty IPty interface
 *
 * In-memory PTY implementation that records method calls and allows
 * simulating data output and exit events. No actual process spawned.
 *
 * Constitution P4: Fakes Over Mocks — no vi.mock().
 */

import type { PtyProcess } from '@/features/064-terminal/types';

export class FakePty implements PtyProcess {
  pid = 9999;
  killed = false;

  readonly writeCalls: string[] = [];
  readonly resizeCalls: Array<{ cols: number; rows: number }> = [];

  private dataCallbacks: Array<(data: string) => void> = [];
  private exitCallbacks: Array<(e: { exitCode: number }) => void> = [];

  onData(callback: (data: string) => void): void {
    this.dataCallbacks.push(callback);
  }

  onExit(callback: (e: { exitCode: number }) => void): void {
    this.exitCallbacks.push(callback);
  }

  write(data: string): void {
    this.writeCalls.push(data);
  }

  resize(cols: number, rows: number): void {
    this.resizeCalls.push({ cols, rows });
  }

  kill(): void {
    this.killed = true;
  }

  // ============ Test Helpers ============

  /** Simulate data arriving from the PTY (terminal output) */
  simulateData(data: string): void {
    for (const cb of this.dataCallbacks) cb(data);
  }

  /** Simulate the PTY process exiting */
  simulateExit(exitCode = 0): void {
    for (const cb of this.exitCallbacks) cb({ exitCode });
  }

  /** Assert write was called with specific data */
  assertWritten(data: string): void {
    if (!this.writeCalls.includes(data)) {
      throw new Error(
        `Expected write("${data}"). Writes: ${JSON.stringify(this.writeCalls)}`
      );
    }
  }

  /** Assert resize was called with specific dimensions */
  assertResized(cols: number, rows: number): void {
    const found = this.resizeCalls.some((c) => c.cols === cols && c.rows === rows);
    if (!found) {
      throw new Error(
        `Expected resize(${cols}, ${rows}). Resizes: ${JSON.stringify(this.resizeCalls)}`
      );
    }
  }
}

/**
 * Factory function for creating FakePty instances.
 * Returns the last created instance for inspection.
 */
export function createFakePtySpawner() {
  let lastInstance: FakePty | null = null;
  const instances: FakePty[] = [];

  return {
    spawn: (
      _command: string,
      _args: string[],
      _options: Record<string, unknown>
    ): FakePty => {
      lastInstance = new FakePty();
      instances.push(lastInstance);
      return lastInstance;
    },
    get lastInstance() {
      return lastInstance;
    },
    get instances() {
      return instances;
    },
    get spawnCount() {
      return instances.length;
    },
  };
}
