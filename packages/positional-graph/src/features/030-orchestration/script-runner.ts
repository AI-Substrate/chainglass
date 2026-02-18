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

export class ScriptRunner implements IScriptRunner {
  private childProcess?: ChildProcess;

  async run(options: ScriptRunOptions): Promise<ScriptRunResult> {
    return new Promise<ScriptRunResult>((resolve, reject) => {
      const child = spawn('bash', [options.script], {
        cwd: options.cwd,
        env: { ...process.env, ...options.env },
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: true,
      });

      this.childProcess = child;
      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data: Buffer) => {
        const text = data.toString();
        stdout += text;
        options.onOutput?.(text);
      });

      child.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      child.on('close', (exitCode) => {
        this.childProcess = undefined;
        resolve({
          exitCode: exitCode ?? 1,
          stdout,
          stderr,
          outputs: {},
        });
      });

      child.on('error', (err) => {
        this.childProcess = undefined;
        reject(err);
      });
    });
  }

  kill(): void {
    if (this.childProcess?.pid) {
      try {
        process.kill(-this.childProcess.pid, 'SIGTERM');
      } catch {
        this.childProcess?.kill('SIGTERM');
      }
    }
  }
}
