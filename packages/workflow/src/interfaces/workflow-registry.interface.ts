/**
 * Workflow registry interface for managing workflow templates.
 *
 * Per Phase 1: Core IWorkflowRegistry Infrastructure - Provides list() and info()
 * methods for querying workflow templates in .chainglass/workflows/.
 *
 * Implementations:
 * - WorkflowRegistryService: Real implementation using IFileSystem, IPathResolver, IYamlParser, IHashGenerator
 * - FakeWorkflowRegistry: Configurable implementation for testing with call capture
 */

import type {
  CheckpointResult,
  InfoResult,
  ListResult,
  RestoreResult,
  VersionsResult,
} from '@chainglass/shared';

/**
 * Options for checkpoint creation.
 */
export interface CheckpointOptions {
  /** Optional comment describing this checkpoint */
  comment?: string;
  /** Force creation even if content is unchanged from previous checkpoint */
  force?: boolean;
}

/**
 * Interface for workflow template management operations.
 *
 * Workflows are stored in `.chainglass/workflows/<slug>/` with:
 * - `workflow.json` - Metadata file (name, description, tags, etc.)
 * - `current/` - The active template version (editable)
 * - `checkpoints/` - Immutable versioned snapshots (v001-abc123/, v002-def456/, etc.)
 */
export interface IWorkflowRegistry {
  /**
   * List all workflows in the registry.
   *
   * Scans the workflows directory for workflow.json files and returns
   * a summary of each workflow including checkpoint counts.
   *
   * @param workflowsDir - Path to workflows directory (e.g., '.chainglass/workflows')
   * @returns ListResult with workflows array (empty if no workflows)
   *
   * @example
   * ```typescript
   * const result = await registry.list('.chainglass/workflows');
   * if (result.errors.length === 0) {
   *   for (const workflow of result.workflows) {
   *     console.log(`${workflow.slug}: ${workflow.checkpointCount} checkpoints`);
   *   }
   * }
   * ```
   *
   * @throws Never throws - errors returned in ListResult.errors:
   * - Individual workflow parse errors are logged but don't fail the entire list
   */
  list(workflowsDir: string): Promise<ListResult>;

  /**
   * Get detailed information about a specific workflow.
   *
   * Returns complete workflow metadata including version history
   * from the checkpoints directory.
   *
   * @param workflowsDir - Path to workflows directory
   * @param slug - Workflow slug (directory name)
   * @returns InfoResult with workflow details or E030 error if not found
   *
   * @example
   * ```typescript
   * const result = await registry.info('.chainglass/workflows', 'hello-wf');
   * if (result.errors.length === 0 && result.workflow) {
   *   console.log(`Name: ${result.workflow.name}`);
   *   console.log(`Versions: ${result.workflow.versions.length}`);
   * }
   * ```
   *
   * @throws Never throws - errors returned in InfoResult.errors:
   * - E030: WORKFLOW_NOT_FOUND - Workflow slug doesn't exist
   * - E036: INVALID_TEMPLATE - workflow.json missing or invalid
   */
  info(workflowsDir: string, slug: string): Promise<InfoResult>;

  /**
   * Get the checkpoint directory path for a workflow.
   *
   * Utility method to construct the checkpoints path consistently.
   * Used by checkpoint, restore, and versions operations.
   *
   * @param workflowsDir - Path to workflows directory
   * @param slug - Workflow slug
   * @returns Absolute path to checkpoints directory (e.g., '.chainglass/workflows/hello-wf/checkpoints')
   *
   * @example
   * ```typescript
   * const checkpointsDir = registry.getCheckpointDir('.chainglass/workflows', 'hello-wf');
   * // Returns: '.chainglass/workflows/hello-wf/checkpoints'
   * ```
   */
  getCheckpointDir(workflowsDir: string, slug: string): string;

  /**
   * Create a checkpoint of the current template.
   *
   * Copies all files from current/ to a new checkpoint directory with format
   * checkpoints/v<NNN>-<hash>/ where NNN is zero-padded ordinal and hash is
   * 8-char SHA-256 content prefix.
   *
   * @param workflowsDir - Path to workflows directory
   * @param slug - Workflow slug
   * @param options - Checkpoint options (comment, force)
   * @returns CheckpointResult with ordinal, hash, version, and path
   *
   * @example
   * ```typescript
   * const result = await registry.checkpoint('.chainglass/workflows', 'hello-wf', {
   *   comment: 'Initial release'
   * });
   * if (result.errors.length === 0) {
   *   console.log(`Created checkpoint ${result.version}`);
   * }
   * ```
   *
   * @throws Never throws - errors returned in CheckpointResult.errors:
   * - E030: WORKFLOW_NOT_FOUND - Workflow doesn't exist
   * - E035: DUPLICATE_CONTENT - Template unchanged since last checkpoint
   * - E036: INVALID_TEMPLATE - current/ missing or wf.yaml missing
   */
  checkpoint(
    workflowsDir: string,
    slug: string,
    options: CheckpointOptions
  ): Promise<CheckpointResult>;

  /**
   * Restore a checkpoint to current/.
   *
   * Clears current/ and copies all files from the specified checkpoint.
   * Service layer executes unconditionally - CLI must prompt for confirmation.
   *
   * @param workflowsDir - Path to workflows directory
   * @param slug - Workflow slug
   * @param version - Version to restore (e.g., 'v001' or 'v001-abc12345')
   * @returns RestoreResult with restored version info
   *
   * @throws Never throws - errors returned in RestoreResult.errors:
   * - E030: WORKFLOW_NOT_FOUND - Workflow doesn't exist
   * - E033: VERSION_NOT_FOUND - Specified version doesn't exist
   * - E034: NO_CHECKPOINT - No checkpoints exist for workflow
   */
  restore(workflowsDir: string, slug: string, version: string): Promise<RestoreResult>;

  /**
   * List all checkpoint versions for a workflow.
   *
   * Returns version history sorted by ordinal descending (newest first).
   *
   * @param workflowsDir - Path to workflows directory
   * @param slug - Workflow slug
   * @returns VersionsResult with version history array
   *
   * @throws Never throws - errors returned in VersionsResult.errors:
   * - E030: WORKFLOW_NOT_FOUND - Workflow doesn't exist
   */
  versions(workflowsDir: string, slug: string): Promise<VersionsResult>;
}
