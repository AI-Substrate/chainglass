/**
 * Script runner types: abstraction for child process execution.
 *
 * IScriptRunner is consumed by CodePod. Only interface + fake
 * are provided in Phase 4 — real runner is deferred.
 *
 * @see Workshop #4 (04-work-unit-pods.md)
 */

// ── IScriptRunner ─────────────────────────────────────

export interface ScriptRunOptions {
  readonly script: string;
  readonly cwd: string;
  readonly env: Record<string, string>;
  readonly timeout: number;
  readonly onOutput?: (line: string) => void;
}

export interface ScriptRunResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly outputs: Record<string, unknown>;
}

/**
 * Thin wrapper around child process execution.
 * Real implementation deferred — only interface + fake for Phase 4.
 */
export interface IScriptRunner {
  run(options: ScriptRunOptions): Promise<ScriptRunResult>;
  kill(): void;
}

// ── FakeScriptRunner ──────────────────────────────────

export interface FakeScriptRunnerOptions {
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  outputs?: Record<string, unknown>;
}

/**
 * Test double for IScriptRunner.
 *
 * Returns pre-configured results. Tracks run history for assertions.
 */
export class FakeScriptRunner implements IScriptRunner {
  private readonly _runHistory: ScriptRunOptions[] = [];
  private _killed = false;

  constructor(private readonly options: FakeScriptRunnerOptions = {}) {}

  async run(runOptions: ScriptRunOptions): Promise<ScriptRunResult> {
    this._runHistory.push(runOptions);
    return {
      exitCode: this.options.exitCode ?? 0,
      stdout: this.options.stdout ?? '',
      stderr: this.options.stderr ?? '',
      outputs: this.options.outputs ?? {},
    };
  }

  kill(): void {
    this._killed = true;
  }

  // ── Test helpers ──────────────────────────────────

  getRunHistory(): readonly ScriptRunOptions[] {
    return this._runHistory;
  }

  get wasKilled(): boolean {
    return this._killed;
  }

  reset(): void {
    this._runHistory.length = 0;
    this._killed = false;
  }
}
