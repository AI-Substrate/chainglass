/**
 * ScriptRunner — Real subprocess executor for code work units.
 *
 * Spawns bash scripts via child_process.spawn with environment variables,
 * captures stdout/stderr/exitCode, supports kill() for termination.
 *
 * Per Plan 037 Phase 1, Workshop 06.
 *
 * @packageDocumentation
 */

import { type ChildProcess, spawn } from 'node:child_process';
import type { IScriptRunner, ScriptRunOptions, ScriptRunResult } from './script-runner.types.js';

/** How long a SIGTERM'd script gets to exit before the group is SIGKILL'd. */
const KILL_GRACE_MS = 2000;

/** Reported for a killed script that still exited 0 (128 + SIGTERM). */
const KILLED_EXIT_CODE = 143;

export class ScriptRunner implements IScriptRunner {
  private childProcess?: ChildProcess;
  private killed = false;
  private killTimer?: ReturnType<typeof setTimeout>;

  async run(options: ScriptRunOptions): Promise<ScriptRunResult> {
    return new Promise<ScriptRunResult>((resolve, reject) => {
      const child = spawn('bash', [options.script], {
        cwd: options.cwd,
        env: { ...process.env, ...options.env },
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: true,
      });

      this.childProcess = child;
      this.killed = false;
      let stdout = '';
      let stderr = '';
      let timedOut = false;

      const timer =
        options.timeout > 0
          ? setTimeout(() => {
              timedOut = true;
              this.kill();
            }, options.timeout * 1000)
          : undefined;

      child.stdout?.on('data', (data: Buffer) => {
        const text = data.toString();
        stdout += text;
        options.onOutput?.(text);
      });

      child.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      child.on('close', (exitCode) => {
        if (timer) clearTimeout(timer);
        clearTimeout(this.killTimer);
        this.childProcess = undefined;
        const code = exitCode ?? 1;
        resolve({
          // A kill that lands while bash is still starting can let the script run on to
          // exit 0; a killed script never reports success.
          exitCode: timedOut ? 124 : this.killed && code === 0 ? KILLED_EXIT_CODE : code,
          stdout,
          stderr: timedOut ? `${stderr}Script timed out after ${options.timeout}s` : stderr,
          outputs: {},
        });
      });

      child.on('error', (err) => {
        if (timer) clearTimeout(timer);
        clearTimeout(this.killTimer);
        this.childProcess = undefined;
        reject(err);
      });
    });
  }

  kill(): void {
    const child = this.childProcess;
    if (!child?.pid) return;
    this.killed = true;
    this.signal(child, 'SIGTERM');
    // A SIGTERM sent in the first few ms after spawn can be lost (the process group
    // may not exist yet), so escalate if the script is still running after the grace.
    clearTimeout(this.killTimer);
    this.killTimer = setTimeout(() => {
      if (this.childProcess === child) this.signal(child, 'SIGKILL');
    }, KILL_GRACE_MS);
    this.killTimer.unref?.();
  }

  private signal(child: ChildProcess, signal: NodeJS.Signals): void {
    if (!child.pid) return;
    try {
      process.kill(-child.pid, signal);
    } catch {
      child.kill(signal);
    }
  }
}
