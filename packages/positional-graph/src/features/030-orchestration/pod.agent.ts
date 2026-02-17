/**
 * AgentPod: execution container for agent-type work units.
 *
 * Wraps IAgentInstance with prompt loading and lifecycle delegation.
 * Reads generic node-starter-prompt.md (DYK-P4#1) — does NOT call
 * unit.getPrompt(). Session owned by the instance (not the pod).
 *
 * @see Workshop #4 (04-work-unit-pods.md)
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AgentResult, IAgentInstance } from '@chainglass/shared';
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

  constructor(
    readonly nodeId: string,
    private readonly agentInstance: IAgentInstance,
    private readonly unitSlug: string
  ) {}

  get sessionId(): string | undefined {
    return this.agentInstance.sessionId ?? undefined;
  }

  async execute(options: PodExecuteOptions): Promise<PodExecuteResult> {
    const prompt = loadStarterPrompt();

    try {
      const result = await this.agentInstance.run({
        prompt,
        cwd: options.ctx.worktreePath,
      });

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
    if (!this.agentInstance.sessionId) {
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
      const result = await this.agentInstance.run({
        prompt,
        cwd: options.ctx.worktreePath,
      });

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
    if (this.agentInstance.sessionId) {
      await this.agentInstance.terminate();
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
