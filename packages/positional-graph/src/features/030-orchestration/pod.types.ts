/**
 * Pod types: execution containers for work unit nodes.
 *
 * Pods bridge work unit definitions (what to run) with agent/code adapters
 * (how to run it). Each pod manages the runtime lifecycle of a single node.
 *
 * @see Workshop #4 (04-work-unit-pods.md)
 */

import type { z } from 'zod';
import type {
  PodErrorSchema,
  PodExecuteResultSchema,
  PodOutcomeSchema,
  PodQuestionSchema,
} from './pod.schema.js';

// ── Zod-derived types ────────────────────────────────────────

export type PodOutcome = z.infer<typeof PodOutcomeSchema>;
export type PodError = z.infer<typeof PodErrorSchema>;
export type PodQuestion = z.infer<typeof PodQuestionSchema>;
export type PodExecuteResult = z.infer<typeof PodExecuteResultSchema>;

// ── Non-serializable types (interfaces) ──────────────────────

/**
 * Options for pod execution. Not serializable (contains ctx object).
 */
export interface PodExecuteOptions {
  /** Resolved inputs from collateInputs */
  readonly inputs: { readonly inputs: Record<string, unknown>; readonly ok: boolean };

  /** Workspace context for file operations */
  readonly ctx: { readonly worktreePath: string };

  /** Graph slug (for output paths) */
  readonly graphSlug: string;

  /** Callback for pod events (question asked, output produced, etc.) */
  readonly onEvent?: PodEventHandler;
}

// ── Pod Events ───────────────────────────────────────────────

export type PodEventHandler = (event: PodEvent) => void;

export type PodEvent = PodOutputEvent | PodQuestionEvent | PodProgressEvent;

export interface PodOutputEvent {
  readonly type: 'output';
  readonly name: string;
  readonly value: unknown;
}

export interface PodQuestionEvent {
  readonly type: 'question';
  readonly question: PodQuestion;
}

export interface PodProgressEvent {
  readonly type: 'progress';
  readonly message: string;
}

// ── IWorkUnitPod ─────────────────────────────────────────────

/**
 * Execution container for a single node.
 *
 * AgentPod wraps IAgentAdapter.run() for agent-type work units.
 * CodePod wraps IScriptRunner for code-type work units.
 * User-input nodes have no pod (handled directly by ODS).
 */
export interface IWorkUnitPod {
  /** Node this pod is executing for */
  readonly nodeId: string;

  /** Unit type discriminator */
  readonly unitType: 'agent' | 'code';

  /** Current session ID (agents only, undefined until first execute) */
  readonly sessionId: string | undefined;

  /**
   * Execute the work unit.
   *
   * For agents: Calls IAgentAdapter.run() with prompt + inputs.
   * For code: Runs script with inputs as environment/args.
   *
   * Returns when execution completes, pauses (question), or fails.
   */
  execute(options: PodExecuteOptions): Promise<PodExecuteResult>;

  /**
   * Resume execution after a question is answered.
   *
   * For agents: Calls IAgentAdapter.run() with answer as prompt,
   *   using existing sessionId for context continuity.
   * For code: Not applicable (code units don't ask questions).
   */
  resumeWithAnswer(
    questionId: string,
    answer: unknown,
    options: PodExecuteOptions
  ): Promise<PodExecuteResult>;

  /**
   * Terminate execution.
   *
   * For agents: Calls IAgentAdapter.terminate(sessionId).
   * For code: Kills running process.
   */
  terminate(): Promise<void>;
}
