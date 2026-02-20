/**
 * Plan 037: Test Graph Infrastructure — Helpers
 *
 * Reusable helper functions for test graph fixtures.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { IPositionalGraphService } from '@chainglass/positional-graph/interfaces';
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
