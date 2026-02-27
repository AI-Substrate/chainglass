/**
 * Plan 037: Test Graph Infrastructure — Helpers
 *
 * Reusable helper functions for test graph fixtures.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type {
  IPositionalGraphService,
  IWorkUnitLoader,
} from '@chainglass/positional-graph/interfaces';
import { YamlParserAdapter } from '@chainglass/shared';
import type { WorkspaceContext } from '@chainglass/workflow';

/**
 * Ensure the PodManager graphs directory exists for a given graph slug.
 * PodManager writes pod-sessions.json to .chainglass/graphs/<slug>/ which is
 * separate from the service's graph data at .chainglass/data/workflows/<slug>/.
 */
export async function ensureGraphsDir(workspacePath: string, graphSlug: string): Promise<void> {
  await fs.mkdir(path.join(workspacePath, '.chainglass', 'graphs', graphSlug), { recursive: true });
}

/**
 * Recursively finds all .sh files under the given directory and makes them executable.
 */
export async function makeScriptsExecutable(dir: string): Promise<void> {
  const entries = await fs.readdir(dir, { withFileTypes: true, recursive: true });
  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith('.sh')) {
      // parentPath available in Node 20.12+; fall back to manual join
      const parent = (entry as { parentPath?: string }).parentPath ?? dir;
      const fullPath = path.join(parent, entry.name);
      await fs.chmod(fullPath, 0o755);
    }
  }
}

/**
 * Completes a user-input node by calling the proper service methods.
 * Simulates a human completing their input via the UI (programmatic service calls).
 *
 * Status flow: ready → starting → agent-accepted → complete
 * Uses the same API as CLI commands: startNode, raiseNodeEvent(accepted), saveOutputData, endNode.
 */
export async function completeUserInputNode(
  service: IPositionalGraphService,
  ctx: WorkspaceContext,
  graphSlug: string,
  nodeId: string,
  outputs: Record<string, unknown> = {}
): Promise<void> {
  // 1. Start the node (ready → starting)
  await service.startNode(ctx, graphSlug, nodeId);

  // 2. Accept the node (starting → agent-accepted)
  await service.raiseNodeEvent(ctx, graphSlug, nodeId, 'node:accepted', {}, 'agent');

  // 3. Save each output
  for (const [name, value] of Object.entries(outputs)) {
    await service.saveOutputData(ctx, graphSlug, nodeId, name, value);
  }

  // 4. Complete the node (agent-accepted → complete)
  await service.endNode(ctx, graphSlug, nodeId);
}

/**
 * Clear a blocked-error node and restart it.
 * Raises node:restart with source 'orchestrator' (allowed per core event types).
 */
export async function clearErrorAndRestart(
  service: IPositionalGraphService,
  ctx: WorkspaceContext,
  graphSlug: string,
  nodeId: string
): Promise<void> {
  await service.raiseNodeEvent(
    ctx,
    graphSlug,
    nodeId,
    'node:restart',
    { reason: 'Error cleared' },
    'orchestrator'
  );
}

/**
 * Answer a question on a waiting-question node and restart it.
 * Calls answerQuestion then raises node:restart to resume execution.
 */
export async function answerNodeQuestion(
  service: IPositionalGraphService,
  ctx: WorkspaceContext,
  graphSlug: string,
  nodeId: string,
  questionId: string,
  answer: unknown
): Promise<void> {
  await service.answerQuestion(ctx, graphSlug, nodeId, questionId, answer);
  await service.raiseNodeEvent(
    ctx,
    graphSlug,
    nodeId,
    'node:restart',
    { reason: 'Question answered' },
    'orchestrator'
  );
}

/**
 * Build an IWorkUnitLoader that reads unit.yaml from a workspace's .chainglass/units/ dir.
 * Shared across template generation scripts, integration tests, and test helpers.
 */
export function buildDiskWorkUnitLoader(workspacePath: string): IWorkUnitLoader {
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
        if (parsed.type === 'user-input' && parsed.user_input) {
          return {
            unit: {
              ...base,
              type: 'user-input' as const,
              userInput: {
                prompt: parsed.user_input.prompt,
                questionType: parsed.user_input.question_type,
                options: parsed.user_input.options,
                default: parsed.user_input.default,
              },
            },
            errors: [],
          };
        }
        return {
          unit: {
            ...base,
            type: parsed.type === 'code' ? ('code' as const) : ('agent' as const),
          },
          errors: [],
        };
      } catch {
        return { errors: [{ message: `Unit '${slug}' not found`, code: 'NOT_FOUND' }] };
      }
    },
  };
}
