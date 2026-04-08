/**
 * AgentPod: execution container for agent-type work units.
 *
 * Wraps IAgentInstance with prompt loading and lifecycle delegation.
 * Reads node-starter-prompt.md or node-resume-prompt.md based on
 * _hasExecuted flag (Finding 04). Template placeholders resolved
 * before passing to agent (AC-17). No caching (Finding 03).
 *
 * @see Workshop #4 (04-node-starter-and-resume-prompts.md)
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AgentResult, IAgentInstance } from '@chainglass/shared';
import type { IWorkUnitPod, PodExecuteOptions, PodExecuteResult } from './pod.types.js';

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
  const promptPath = resolve(getModuleDir(), 'node-starter-prompt.md');
  return readFileSync(promptPath, 'utf-8');
}

function loadResumePrompt(): string {
  const promptPath = resolve(getModuleDir(), 'node-resume-prompt.md');
  return readFileSync(promptPath, 'utf-8');
}

export class AgentPod implements IWorkUnitPod {
  readonly unitType = 'agent' as const;
  private _hasExecuted = false;

  constructor(
    readonly nodeId: string,
    private readonly agentInstance: IAgentInstance,
    private readonly unitSlug: string
  ) {}

  get sessionId(): string | undefined {
    return this.agentInstance.sessionId ?? undefined;
  }

  // Default pod agent timeout: 5 minutes. Configurable via orchestratorSettings.agentTimeout.
  private static readonly DEFAULT_TIMEOUT_MS = 300_000;

  async execute(options: PodExecuteOptions): Promise<PodExecuteResult> {
    const template = this._hasExecuted ? loadResumePrompt() : loadStarterPrompt();
    const prompt = this.resolveTemplate(template, options);
    this._hasExecuted = true;

    try {
      const result = await this.agentInstance.run({
        prompt,
        cwd: options.ctx.worktreePath,
        timeoutMs: AgentPod.DEFAULT_TIMEOUT_MS,
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

  /** @deprecated Not implemented — Q&A handled by event system (Plan 032). */
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

  private resolveTemplate(template: string, options: PodExecuteOptions): string {
    return template
      .replaceAll('{{graphSlug}}', options.graphSlug)
      .replaceAll('{{nodeId}}', this.nodeId)
      .replaceAll('{{unitSlug}}', this.unitSlug);
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
