/**
 * AgentPod: execution container for agent-type work units.
 *
 * Wraps IAgentAdapter.run() with prompt loading and session tracking.
 * Reads generic node-starter-prompt.md (DYK-P4#1) — does NOT call
 * unit.getPrompt(). Owns mutable sessionId (DYK-P4#2).
 *
 * @see Workshop #4 (04-work-unit-pods.md)
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AgentResult, IAgentAdapter } from '@chainglass/shared';
import type { IWorkUnitPod, PodExecuteOptions, PodExecuteResult } from './pod.types.js';

let cachedPrompt: string | undefined;

function getModuleDir(): string {
  if (typeof import.meta?.dirname === 'string') {
    return import.meta.dirname;
  }
  if (typeof import.meta?.url === 'string') {
    return dirname(fileURLToPath(import.meta.url));
  }
  if (typeof __dirname === 'string') {
    return __dirname;
  }
  return process.cwd();
}

function loadStarterPrompt(): string {
  if (cachedPrompt === undefined) {
    const promptPath = resolve(getModuleDir(), 'node-starter-prompt.md');
    cachedPrompt = readFileSync(promptPath, 'utf-8');
  }
  return cachedPrompt;
}

export class AgentPod implements IWorkUnitPod {
  readonly unitType = 'agent' as const;
  private _sessionId: string | undefined;

  constructor(
    readonly nodeId: string,
    private readonly agentAdapter: IAgentAdapter
  ) {}

  get sessionId(): string | undefined {
    return this._sessionId;
  }

  async execute(options: PodExecuteOptions): Promise<PodExecuteResult> {
    const { contextSessionId, ctx } = options;

    const prompt = loadStarterPrompt();
    const sessionId = contextSessionId ?? this._sessionId;

    try {
      const result = await this.agentAdapter.run({
        prompt,
        sessionId,
        cwd: ctx.worktreePath,
      });

      this._sessionId = result.sessionId;
      return this.mapAgentResult(result);
    } catch (err) {
      return {
        outcome: 'error',
        error: {
          code: 'POD_AGENT_EXECUTION_ERROR',
          message: err instanceof Error ? err.message : String(err),
        },
      };
    }
  }

  async resumeWithAnswer(
    questionId: string,
    answer: unknown,
    options: PodExecuteOptions
  ): Promise<PodExecuteResult> {
    if (!this._sessionId) {
      return {
        outcome: 'error',
        error: {
          code: 'POD_NO_SESSION',
          message: `Cannot resume node '${this.nodeId}': no session ID`,
        },
      };
    }

    const answerStr = typeof answer === 'string' ? answer : JSON.stringify(answer);
    const prompt = `Answer to question ${questionId}: ${answerStr}`;

    try {
      const result = await this.agentAdapter.run({
        prompt,
        sessionId: this._sessionId,
        cwd: options.ctx.worktreePath,
      });

      this._sessionId = result.sessionId;
      return this.mapAgentResult(result);
    } catch (err) {
      return {
        outcome: 'error',
        error: {
          code: 'POD_AGENT_RESUME_ERROR',
          message: err instanceof Error ? err.message : String(err),
        },
      };
    }
  }

  async terminate(): Promise<void> {
    if (this._sessionId) {
      await this.agentAdapter.terminate(this._sessionId);
    }
  }

  private mapAgentResult(result: AgentResult): PodExecuteResult {
    switch (result.status) {
      case 'completed':
        return {
          outcome: 'completed',
          sessionId: result.sessionId,
        };

      case 'failed':
        return {
          outcome: 'error',
          sessionId: result.sessionId,
          error: {
            code: 'AGENT_FAILED',
            message: result.stderr ?? `Agent failed with exit code ${result.exitCode}`,
          },
        };

      case 'killed':
        return {
          outcome: 'terminated',
          sessionId: result.sessionId,
        };
    }
  }
}
