/**
 * WorkflowRegistryService implementation for workflow template management.
 *
 * Per Phase 1: Core IWorkflowRegistry Infrastructure - Provides list() and info()
 * methods for querying workflow templates in .chainglass/workflows/.
 */

import type {
  CheckpointInfo,
  IFileSystem,
  IPathResolver,
  InfoResult,
  ListResult,
  WorkflowInfo,
  WorkflowMetadata,
  WorkflowSummary,
} from '@chainglass/shared';
import { WorkflowMetadataSchema } from '@chainglass/shared';
import type { IWorkflowRegistry } from '../interfaces/workflow-registry.interface.js';
import type { IYamlParser } from '../interfaces/yaml-parser.interface.js';

/**
 * Error codes for workflow registry operations.
 *
 * Per Critical Discovery 01: Error codes E030, E033-E036 reserved for
 * workflow registry. E031-E032 skipped to avoid collision with PhaseService.
 */
export const WorkflowRegistryErrorCodes = {
  /** Workflow not found in registry (slug doesn't exist) */
  WORKFLOW_NOT_FOUND: 'E030',
  /** Requested checkpoint version not found */
  VERSION_NOT_FOUND: 'E033',
  /** No checkpoints exist for workflow (can't compose without checkpoint) */
  NO_CHECKPOINT: 'E034',
  /** Checkpoint content identical to existing version (duplicate) */
  DUPLICATE_CONTENT: 'E035',
  /** Template is invalid (missing wf.yaml, invalid schema, etc.) */
  INVALID_TEMPLATE: 'E036',
  /** Failed to read directory */
  DIR_READ_FAILED: 'E037',
} as const;

/** Maximum workflow.json file size (10MB) to prevent DoS */
const MAX_WORKFLOW_JSON_SIZE = 10 * 1024 * 1024;

/**
 * Checkpoint manifest structure.
 */
interface CheckpointManifest {
  ordinal: number;
  hash: string;
  createdAt: string;
  comment?: string;
}

/**
 * WorkflowRegistryService implements workflow template management.
 *
 * Depends on:
 * - IFileSystem: File operations (read, readDir, exists)
 * - IPathResolver: Secure path resolution
 * - IYamlParser: Parse YAML files (optional, for checkpoint parsing)
 */
export class WorkflowRegistryService implements IWorkflowRegistry {
  constructor(
    private readonly fs: IFileSystem,
    private readonly pathResolver: IPathResolver,
    private readonly yamlParser: IYamlParser
  ) {}

  /**
   * List all workflows in the registry.
   *
   * @param workflowsDir - Path to workflows directory
   * @returns ListResult with workflows array
   */
  async list(workflowsDir: string): Promise<ListResult> {
    const workflows: WorkflowSummary[] = [];

    // Check if workflows directory exists
    if (!(await this.fs.exists(workflowsDir))) {
      return { errors: [], workflows: [] };
    }

    // List subdirectories in workflows dir
    let entries: string[];
    try {
      entries = await this.fs.readDir(workflowsDir);
    } catch (err) {
      return {
        errors: [
          {
            code: WorkflowRegistryErrorCodes.DIR_READ_FAILED,
            message: `Failed to read workflows directory: ${err instanceof Error ? err.message : String(err)}`,
            action: 'Check directory permissions and existence',
          },
        ],
        workflows: [],
      };
    }

    // Process each potential workflow directory
    for (const entry of entries) {
      const workflowDir = this.pathResolver.join(workflowsDir, entry);
      const workflowJsonPath = this.pathResolver.join(workflowDir, 'workflow.json');

      // Skip if no workflow.json
      if (!(await this.fs.exists(workflowJsonPath))) {
        continue;
      }

      // Try to read and parse workflow.json
      try {
        const content = await this.fs.readFile(workflowJsonPath);

        // Size validation to prevent DoS
        if (content.length > MAX_WORKFLOW_JSON_SIZE) {
          continue; // Skip oversized files silently in list
        }

        const rawData = JSON.parse(content);

        // Validate with Zod schema
        const parsed = WorkflowMetadataSchema.safeParse(rawData);
        if (!parsed.success) {
          // Skip invalid workflows silently
          continue;
        }

        const metadata: WorkflowMetadata = parsed.data;

        // Count checkpoints
        const checkpointsDir = this.pathResolver.join(workflowDir, 'checkpoints');
        const checkpointCount = await this.countCheckpoints(checkpointsDir);

        workflows.push({
          slug: metadata.slug,
          name: metadata.name,
          description: metadata.description,
          checkpointCount,
        });
      } catch {
        // Skip workflows with parse errors silently
      }
    }

    // Sort by slug for consistent output
    workflows.sort((a, b) => a.slug.localeCompare(b.slug));

    return { errors: [], workflows };
  }

  /**
   * Get detailed information about a specific workflow.
   *
   * @param workflowsDir - Path to workflows directory
   * @param slug - Workflow slug
   * @returns InfoResult with workflow details or error
   */
  async info(workflowsDir: string, slug: string): Promise<InfoResult> {
    const workflowDir = this.pathResolver.join(workflowsDir, slug);
    const workflowJsonPath = this.pathResolver.join(workflowDir, 'workflow.json');

    // Check if workflow directory exists
    if (!(await this.fs.exists(workflowDir))) {
      return {
        errors: [
          {
            code: WorkflowRegistryErrorCodes.WORKFLOW_NOT_FOUND,
            message: `Workflow not found: ${slug}`,
            action: `Create workflow at ${workflowsDir}/${slug}/`,
          },
        ],
        workflow: undefined,
      };
    }

    // Check if workflow.json exists
    if (!(await this.fs.exists(workflowJsonPath))) {
      return {
        errors: [
          {
            code: WorkflowRegistryErrorCodes.WORKFLOW_NOT_FOUND,
            message: `Workflow configuration missing: ${slug}/workflow.json`,
            action: `Create workflow.json at ${workflowJsonPath}`,
          },
        ],
        workflow: undefined,
      };
    }

    // Try to read and parse workflow.json
    let metadata: WorkflowMetadata;
    try {
      const content = await this.fs.readFile(workflowJsonPath);

      // Size validation to prevent DoS
      if (content.length > MAX_WORKFLOW_JSON_SIZE) {
        return {
          errors: [
            {
              code: WorkflowRegistryErrorCodes.INVALID_TEMPLATE,
              message: `workflow.json for ${slug} exceeds maximum size (${MAX_WORKFLOW_JSON_SIZE} bytes)`,
              action: 'Reduce workflow.json size or split configuration',
            },
          ],
          workflow: undefined,
        };
      }

      const rawData = JSON.parse(content);

      // Validate with Zod schema
      const parsed = WorkflowMetadataSchema.safeParse(rawData);
      if (!parsed.success) {
        const firstError = parsed.error.issues[0];
        return {
          errors: [
            {
              code: WorkflowRegistryErrorCodes.INVALID_TEMPLATE,
              message: `Invalid workflow.json for ${slug}: ${firstError?.message || 'Schema validation failed'}`,
              path: firstError?.path.join('/'),
              action: `Fix the schema error in ${workflowJsonPath}`,
            },
          ],
          workflow: undefined,
        };
      }

      metadata = parsed.data;
    } catch (err) {
      return {
        errors: [
          {
            code: WorkflowRegistryErrorCodes.INVALID_TEMPLATE,
            message: `Failed to parse workflow.json for ${slug}: ${err instanceof Error ? err.message : String(err)}`,
            action: `Fix the JSON syntax in ${workflowJsonPath}`,
          },
        ],
        workflow: undefined,
      };
    }

    // Get checkpoint versions
    const checkpointsDir = this.pathResolver.join(workflowDir, 'checkpoints');
    const versions = await this.getVersions(checkpointsDir);

    const workflow: WorkflowInfo = {
      slug: metadata.slug,
      name: metadata.name,
      description: metadata.description,
      createdAt: metadata.created_at,
      updatedAt: metadata.updated_at,
      tags: metadata.tags,
      author: metadata.author,
      checkpointCount: versions.length,
      versions,
    };

    return { errors: [], workflow };
  }

  /**
   * Get the checkpoint directory path for a workflow.
   *
   * @param workflowsDir - Path to workflows directory
   * @param slug - Workflow slug
   * @returns Path to checkpoints directory
   */
  getCheckpointDir(workflowsDir: string, slug: string): string {
    return this.pathResolver.join(workflowsDir, slug, 'checkpoints');
  }

  /**
   * Count checkpoints in a checkpoints directory.
   *
   * @param checkpointsDir - Path to checkpoints directory
   * @returns Number of checkpoint directories
   */
  private async countCheckpoints(checkpointsDir: string): Promise<number> {
    if (!(await this.fs.exists(checkpointsDir))) {
      return 0;
    }

    try {
      const entries = await this.fs.readDir(checkpointsDir);
      // Count directories matching v###-* pattern
      const checkpointPattern = /^v\d{3}-[a-f0-9]{8}$/;
      return entries.filter((entry) => checkpointPattern.test(entry)).length;
    } catch {
      return 0;
    }
  }

  /**
   * Get version history from checkpoints directory.
   *
   * @param checkpointsDir - Path to checkpoints directory
   * @returns Array of CheckpointInfo, sorted by ordinal descending
   */
  private async getVersions(checkpointsDir: string): Promise<CheckpointInfo[]> {
    if (!(await this.fs.exists(checkpointsDir))) {
      return [];
    }

    const versions: CheckpointInfo[] = [];
    const checkpointPattern = /^v(\d{3})-([a-f0-9]{8})$/;

    try {
      const entries = await this.fs.readDir(checkpointsDir);

      for (const entry of entries) {
        const match = entry.match(checkpointPattern);
        if (!match) {
          continue;
        }

        const ordinal = Number.parseInt(match[1], 10);
        const hash = match[2];
        const manifestPath = this.pathResolver.join(checkpointsDir, entry, '.checkpoint.json');

        let createdAt = new Date().toISOString();
        let comment: string | undefined;

        // Try to read checkpoint manifest
        if (await this.fs.exists(manifestPath)) {
          try {
            const manifestContent = await this.fs.readFile(manifestPath);
            const manifest: CheckpointManifest = JSON.parse(manifestContent);
            createdAt = manifest.createdAt;
            comment = manifest.comment;
          } catch {
            // Use defaults if manifest can't be read
          }
        }

        versions.push({
          ordinal,
          hash,
          version: entry,
          createdAt,
          comment,
        });
      }
    } catch {
      return [];
    }

    // Sort by ordinal descending (newest first)
    versions.sort((a, b) => b.ordinal - a.ordinal);

    return versions;
  }
}
