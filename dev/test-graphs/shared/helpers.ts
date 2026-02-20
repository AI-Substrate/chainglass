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
 * Completes a user-input node by raising accept, saving outputs, and raising completed.
 * Simulates a human completing their input via the UI (programmatic service calls).
 *
 * Event source is 'human' — this is the UI/CLI acting on behalf of a person.
 */
export async function completeUserInputNode(
  service: IPositionalGraphService,
  ctx: WorkspaceContext,
  graphSlug: string,
  nodeId: string,
  outputs: Record<string, unknown> = {}
): Promise<void> {
  // 1. Accept the node (waiting → accepted)
  await service.raiseNodeEvent(ctx, graphSlug, nodeId, 'node:accepted', {}, 'human');

  // 2. Save each output
  for (const [name, value] of Object.entries(outputs)) {
    await service.saveOutputData(ctx, graphSlug, nodeId, name, value);
  }

  // 3. Complete the node (accepted → complete)
  await service.raiseNodeEvent(ctx, graphSlug, nodeId, 'node:completed', {}, 'human');
}
