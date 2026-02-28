/**
 * Plan 053 Phase 5: Worktree Domain Registration
 *
 * Registers the `worktree` state domain as multi-instance (keyed by workspace slug).
 * Properties: `changed-file-count` (number) and `branch` (string).
 *
 * Per DYK-21: Multi-instance to isolate state per workspace/tab.
 * Per DYK-22: Instance ID is the workspace slug (already valid [a-zA-Z0-9_-]+).
 */

import type { IStateService } from '@chainglass/shared/state';

export function registerWorktreeState(state: IStateService): void {
  // Idempotent: React Strict Mode / HMR may re-run initializers
  const already = state.listDomains().some((d) => d.domain === 'worktree');
  if (already) return;

  state.registerDomain({
    domain: 'worktree',
    description: 'Worktree runtime state — file change counts and git branch per workspace',
    multiInstance: true,
    properties: [
      {
        key: 'changed-file-count',
        description: 'Number of files changed in the worktree',
        typeHint: 'number',
      },
      {
        key: 'branch',
        description: 'Current git branch name',
        typeHint: 'string',
      },
    ],
  });
}
