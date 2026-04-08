/**
 * Auto-completion module — completes user-input nodes and answers Q&A during workflow runs.
 *
 * Plan 076 Phase 3 T002b.
 *
 * ADR-0014 override: imports @chainglass/positional-graph directly for
 * service calls (same precedent as @chainglass/shared import per amendment).
 *
 * Ported from:
 * - scripts/test-advanced-pipeline.ts (QuestionWatcher, lines 190-248)
 * - dev/test-graphs/shared/helpers.ts (completeUserInputNode, answerNodeQuestion)
 */

import { PositionalGraphService } from '@chainglass/positional-graph';
import { PositionalGraphAdapter } from '@chainglass/positional-graph/adapter';
import { buildPositionalGraphReality } from '@chainglass/positional-graph/features/030-orchestration';
import type { IPositionalGraphService, IWorkUnitLoader } from '@chainglass/positional-graph/interfaces';
import {
  WorkflowEventObserverRegistry,
  WorkflowEventsService,
} from '@chainglass/positional-graph';
import {
  NodeFileSystemAdapter,
  PathResolverAdapter,
  YamlParserAdapter,
  WorkflowEventType,
} from '@chainglass/shared';
import type { WorkspaceContext } from '@chainglass/workflow';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

// ── Scripted answer for Q&A auto-answering ────────────────────────────

export interface ScriptedAnswer {
  /** Substring to match in question text (case-insensitive) */
  match: string;
  /** Answer to provide */
  answer: string;
  /** Human-readable label for logging */
  label: string;
}

/** Default scripted answers — same as test-advanced-pipeline.ts */
const DEFAULT_SCRIPTED_ANSWERS: ScriptedAnswer[] = [
  { match: 'language', answer: 'python and go', label: 'python and go' },
  { match: 'framework', answer: 'fastapi', label: 'fastapi' },
  { match: 'database', answer: 'postgresql', label: 'postgresql' },
];

// ── Disk-based work unit loader ───────────────────────────────────────

/**
 * Build an IWorkUnitLoader that reads unit.yaml from a workspace's .chainglass/units/ dir.
 * Ported from dev/test-graphs/shared/helpers.ts buildDiskWorkUnitLoader().
 */
function buildDiskWorkUnitLoader(workspacePath: string): IWorkUnitLoader {
  const yamlParser = new YamlParserAdapter();
  return {
    async load(_ctx: WorkspaceContext, slug: string) {
      const unitYamlPath = path.join(workspacePath, '.chainglass', 'units', slug, 'unit.yaml');
      try {
        const content = await fs.readFile(unitYamlPath, 'utf-8');
        const parsed = yamlParser.parse<{
          slug: string;
          type: 'agent' | 'code' | 'user-input';
          inputs?: Array<{ name: string; type: 'data' | 'file'; required: boolean }>;
          outputs: Array<{ name: string; type: 'data' | 'file'; required: boolean }>;
          user_input?: {
            question_type: 'text' | 'single' | 'multi' | 'confirm';
            prompt: string;
            options?: Array<{ key: string; label: string; description?: string }>;
            default?: string | boolean;
          };
        }>(content, unitYamlPath);
        const base = {
          slug: parsed.slug,
          inputs: parsed.inputs ?? [],
          outputs: parsed.outputs,
        };
        if (parsed.type === 'user-input') {
          if (!parsed.user_input) {
            return {
              errors: [{ message: `Unit '${slug}' has type 'user-input' but is missing user_input config`, code: 'UNIT_LOAD_ERROR' }],
            };
          }
          return {
            unit: {
              ...base,
              type: 'user-input' as const,
              userInput: {
                prompt: parsed.user_input.prompt,
                inputType: parsed.user_input.question_type,
                outputName: base.outputs[0]?.name ?? 'output',
                options: parsed.user_input.options,
                default: parsed.user_input.default,
              },
            },
            errors: [],
          };
        }
        return {
          unit: { ...base, type: parsed.type === 'code' ? ('code' as const) : ('agent' as const) },
          errors: [],
        };
      } catch {
        return { errors: [{ message: `Unit '${slug}' not found`, code: 'NOT_FOUND' }] };
      }
    },
  };
}

// ── AutoCompletionRunner ──────────────────────────────────────────────

export class AutoCompletionRunner {
  private service: IPositionalGraphService;
  private ctx: WorkspaceContext;
  private graphSlug: string;
  private scriptedAnswers: ScriptedAnswer[];
  private answeredQuestions = new Set<string>();
  private userInputCompleted = false;
  private verbose: boolean;

  constructor(options: {
    workspacePath: string;
    graphSlug: string;
    scriptedAnswers?: ScriptedAnswer[];
    verbose?: boolean;
  }) {
    const nodeFs = new NodeFileSystemAdapter();
    const pathResolver = new PathResolverAdapter();
    const yamlParser = new YamlParserAdapter();
    const adapter = new PositionalGraphAdapter(nodeFs, pathResolver);
    const loader = buildDiskWorkUnitLoader(options.workspacePath);

    this.service = new PositionalGraphService(nodeFs, pathResolver, yamlParser, adapter, loader);
    this.ctx = {
      workspaceSlug: 'harness-workspace',
      workspaceName: 'Harness Workspace',
      workspacePath: options.workspacePath,
      worktreePath: options.workspacePath,
      worktreeBranch: null,
      isMainWorktree: true,
      hasGit: false,
    };
    this.graphSlug = options.graphSlug;
    this.scriptedAnswers = options.scriptedAnswers ?? DEFAULT_SCRIPTED_ANSWERS;
    this.verbose = options.verbose ?? false;
  }

  /**
   * Called on each idle event from the drive loop.
   * Checks for uncompleted user-input nodes and pending questions.
   * Returns true if any action was taken.
   */
  async onIdle(): Promise<boolean> {
    let actionTaken = false;

    // Complete user-input node on first idle
    if (!this.userInputCompleted) {
      actionTaken = await this.tryCompleteUserInput();
    }

    // Check for pending Q&A
    if (await this.tryAnswerQuestions()) {
      actionTaken = true;
    }

    return actionTaken;
  }

  private async tryCompleteUserInput(): Promise<boolean> {
    try {
      const statusResult = await this.service.getStatus(this.ctx, this.graphSlug);
      // Find user-input nodes that are ready or pending
      for (const line of statusResult.lines) {
        for (const node of line.nodes) {
          if (node.unitType === 'user-input' && (node.status === 'ready' || node.status === 'pending')) {
            if (this.verbose) {
              console.error(`[auto-complete] Completing user-input node ${node.nodeId}`);
            }
            await this.completeUserInputNode(node.nodeId, {
              requirements: 'Build a CLI tool that converts CSV files to JSON format with support for custom delimiters and header mapping.',
            });
            this.userInputCompleted = true;
            if (this.verbose) {
              console.error(`[auto-complete] ✓ User-input node ${node.nodeId} completed`);
            }
            return true;
          }
        }
      }
    } catch (err) {
      if (this.verbose) {
        console.error(`[auto-complete] Error completing user-input: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    return false;
  }

  private async tryAnswerQuestions(): Promise<boolean> {
    try {
      const statusResult = await this.service.getStatus(this.ctx, this.graphSlug);
      const state = await this.service.loadGraphState(this.ctx, this.graphSlug);
      const reality = buildPositionalGraphReality({
        statusResult,
        state,
        snapshotAt: new Date().toISOString(),
      });

      for (const q of reality.pendingQuestions) {
        if (this.answeredQuestions.has(q.questionId)) continue;

        const scripted = this.scriptedAnswers.find((a) =>
          q.text.toLowerCase().includes(a.match.toLowerCase()),
        );

        if (!scripted) {
          if (this.verbose) {
            console.error(`[auto-complete] No scripted answer for question: "${q.text}"`);
          }
          // Provide a generic answer to keep the workflow moving
          const genericAnswer = 'yes';
          await this.answerNodeQuestion(q.nodeId, q.questionId, genericAnswer);
          this.answeredQuestions.add(q.questionId);
          if (this.verbose) {
            console.error(`[auto-complete] ✓ Generic answer provided for ${q.questionId}`);
          }
          return true;
        }

        if (this.verbose) {
          console.error(`[auto-complete] Answering Q&A: "${scripted.label}" for ${q.nodeId}`);
        }
        await this.answerNodeQuestion(q.nodeId, q.questionId, scripted.answer);
        this.answeredQuestions.add(q.questionId);
        if (this.verbose) {
          console.error(`[auto-complete] ✓ Question ${q.questionId} answered`);
        }
        return true;
      }
    } catch (err) {
      if (this.verbose) {
        console.error(`[auto-complete] Error checking questions: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    return false;
  }

  /**
   * Ported from dev/test-graphs/shared/helpers.ts completeUserInputNode().
   * Status flow: ready → starting → agent-accepted → complete
   */
  private async completeUserInputNode(
    nodeId: string,
    outputs: Record<string, unknown> = {},
  ): Promise<void> {
    await this.service.startNode(this.ctx, this.graphSlug, nodeId);
    await this.service.raiseNodeEvent(
      this.ctx, this.graphSlug, nodeId,
      WorkflowEventType.NodeAccepted, {}, 'agent',
    );
    for (const [name, value] of Object.entries(outputs)) {
      await this.service.saveOutputData(this.ctx, this.graphSlug, nodeId, name, value);
    }
    await this.service.endNode(this.ctx, this.graphSlug, nodeId);
  }

  /**
   * Ported from dev/test-graphs/shared/helpers.ts answerNodeQuestion().
   * Uses WorkflowEventsService for the 3-event handshake.
   */
  private async answerNodeQuestion(
    nodeId: string,
    questionId: string,
    answer: unknown,
  ): Promise<void> {
    const observers = new WorkflowEventObserverRegistry();
    const wfEvents = new WorkflowEventsService(this.service, () => this.ctx, observers);
    await wfEvents.answerQuestion(this.graphSlug, nodeId, questionId, answer);
  }
}
