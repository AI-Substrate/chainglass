/**
 * CodePod: execution container for code-type work units.
 *
 * Wraps IScriptRunner for script execution. Passes graph context
 * as env vars (CG_GRAPH_SLUG, CG_NODE_ID, CG_WORKSPACE_PATH) so
 * scripts can interact with the workflow via CLI commands.
 *
 * @see Workshop #4 (04-work-unit-pods.md), Workshop 06 (finishing-codepod.md)
 */

import type { IWorkUnitPod, PodExecuteOptions, PodExecuteResult } from './pod.types.js';
import type { IScriptRunner } from './script-runner.types.js';

export class CodePod implements IWorkUnitPod {
  readonly unitType = 'code' as const;
  readonly sessionId = undefined;

  constructor(
    readonly nodeId: string,
    private readonly scriptRunner: IScriptRunner,
    private readonly scriptPath: string,
    private readonly unitSlug: string
  ) {}

  async execute(options: PodExecuteOptions): Promise<PodExecuteResult> {
    const { inputs, ctx } = options;

    const env = {
      ...buildScriptEnv(inputs.inputs),
      CG_GRAPH_SLUG: options.graphSlug,
      CG_NODE_ID: this.nodeId,
      CG_WORKSPACE_PATH: ctx.worktreePath,
    };

    try {
      const result = await this.scriptRunner.run({
        script: this.scriptPath,
        cwd: ctx.worktreePath,
        env,
        timeout: 60,
      });

      if (result.exitCode === 0) {
        return {
          outcome: 'completed',
          outputs: result.outputs,
        };
      }
      return {
        outcome: 'error',
        error: {
          code: 'SCRIPT_FAILED',
          message: `Script exited with code ${result.exitCode}: ${result.stderr}`,
        },
      };
    } catch (err) {
      return {
        outcome: 'error',
        error: {
          code: 'POD_SCRIPT_EXECUTION_ERROR',
          message: err instanceof Error ? err.message : String(err),
        },
      };
    }
  }

  async resumeWithAnswer(): Promise<PodExecuteResult> {
    return {
      outcome: 'error',
      error: {
        code: 'POD_NOT_SUPPORTED',
        message: 'Code units do not support question/answer protocol',
      },
    };
  }

  async terminate(): Promise<void> {
    this.scriptRunner.kill();
  }
}

function buildScriptEnv(inputs: Record<string, unknown>): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [name, value] of Object.entries(inputs)) {
    const envKey = `INPUT_${name.toUpperCase()}`;
    env[envKey] = typeof value === 'string' ? value : JSON.stringify(value);
  }
  return env;
}
