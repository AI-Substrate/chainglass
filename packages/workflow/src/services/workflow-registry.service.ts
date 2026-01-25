/**
 * WorkflowRegistryService implementation for workflow template management.
 *
 * Per Phase 1: Core IWorkflowRegistry Infrastructure - Provides list() and info()
 * methods for querying workflow templates in .chainglass/workflows/.
 */

import type {
  CheckpointInfo,
  CheckpointResult,
  IFileSystem,
  IHashGenerator,
  IPathResolver,
  InfoResult,
  ListResult,
  RestoreResult,
  VersionsResult,
  WorkflowInfo,
  WorkflowMetadata,
  WorkflowSummary,
} from '@chainglass/shared';
import { WorkflowMetadataSchema } from '@chainglass/shared';
import type { CheckpointOptions } from '../interfaces/workflow-registry.interface.js';
import type { IWorkflowRegistry } from '../interfaces/workflow-registry.interface.js';
import type { IYamlParser } from '../interfaces/yaml-parser.interface.js';
import { generateWorkflowJson } from '../utils/generate-workflow-json.js';

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
  /** Checkpoint creation failed (I/O error during checkpoint) */
  CHECKPOINT_FAILED: 'E038',
  /** Restore operation failed (I/O error during restore) */
  RESTORE_FAILED: 'E039',
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
  /** Directories to exclude from hashing and copying */
  private static readonly EXCLUDED_DIRS = ['.git', 'node_modules', 'dist'];

  /**
   * Validate that a path does not escape the base directory (SEC-001, SEC-002).
   * Checks for '..' components which could enable path traversal attacks.
   *
   * @param entryPath - Relative path to validate
   * @returns true if path is safe, false if it contains traversal attempts
   */
  private static isPathSafe(entryPath: string): boolean {
    // Reject any path containing '..' to prevent directory escape
    return !entryPath.includes('..');
  }

  constructor(
    private readonly fs: IFileSystem,
    private readonly pathResolver: IPathResolver,
    private readonly yamlParser: IYamlParser,
    private readonly hashGenerator: IHashGenerator
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
   * Get the next checkpoint ordinal for a workflow.
   *
   * Per HD05: Uses max+1 pattern to handle gaps in ordinal sequence.
   *
   * @param workflowsDir - Path to workflows directory
   * @param slug - Workflow slug
   * @returns Next ordinal number (1 if no checkpoints exist)
   */
  async getNextCheckpointOrdinal(workflowsDir: string, slug: string): Promise<number> {
    const checkpointsDir = this.getCheckpointDir(workflowsDir, slug);

    if (!(await this.fs.exists(checkpointsDir))) {
      return 1;
    }

    try {
      const entries = await this.fs.readDir(checkpointsDir);
      const checkpointPattern = /^v(\d{3})-[a-f0-9]{8}$/;
      const ordinals: number[] = [];

      for (const entry of entries) {
        const match = entry.match(checkpointPattern);
        if (match) {
          ordinals.push(Number.parseInt(match[1], 10));
        }
      }

      if (ordinals.length === 0) {
        return 1;
      }

      return Math.max(...ordinals) + 1;
    } catch {
      return 1;
    }
  }

  /**
   * Generate a content hash for the current/ template.
   *
   * Per DYK-02: Files are sorted alphabetically before hashing
   * to ensure deterministic output regardless of readDir order.
   *
   * @param workflowsDir - Path to workflows directory
   * @param slug - Workflow slug
   * @returns 8-character hex hash prefix
   */
  async generateCheckpointHash(workflowsDir: string, slug: string): Promise<string> {
    const currentDir = this.pathResolver.join(workflowsDir, slug, 'current');

    // Collect all file paths and contents recursively
    const fileContents: { path: string; content: string }[] = [];
    await this.collectFilesForHash(currentDir, '', fileContents);

    // Sort by path for deterministic ordering (per DYK-02)
    fileContents.sort((a, b) => a.path.localeCompare(b.path));

    // Concatenate path:content pairs
    const combinedContent = fileContents.map((f) => `${f.path}:${f.content}`).join('\n');

    // Generate SHA-256 and return first 8 characters
    const fullHash = await this.hashGenerator.sha256(combinedContent);
    return fullHash.substring(0, 8);
  }

  /**
   * Recursively collect files for hashing, excluding .git, node_modules, dist.
   * Per SEC-001: Validates paths to prevent directory traversal attacks.
   * Per SEC-003: Handles file read errors gracefully (skip unreadable files).
   */
  private async collectFilesForHash(
    basePath: string,
    relativePath: string,
    results: { path: string; content: string }[]
  ): Promise<void> {
    const currentPath = relativePath ? this.pathResolver.join(basePath, relativePath) : basePath;

    if (!(await this.fs.exists(currentPath))) {
      return;
    }

    const entries = await this.fs.readDir(currentPath);

    for (const entry of entries) {
      // Check exclusions
      if (WorkflowRegistryService.EXCLUDED_DIRS.includes(entry)) {
        continue;
      }

      const entryPath = relativePath ? this.pathResolver.join(relativePath, entry) : entry;

      // SEC-001: Path traversal protection - skip entries with '..'
      if (!WorkflowRegistryService.isPathSafe(entryPath)) {
        continue;
      }

      const fullPath = this.pathResolver.join(basePath, entryPath);

      // SEC-003: Handle file access errors gracefully (stat and read)
      try {
        const stat = await this.fs.stat(fullPath);

        if (stat.isDirectory) {
          // Recurse into subdirectory
          await this.collectFilesForHash(basePath, entryPath, results);
        } else if (stat.isFile) {
          const content = await this.fs.readFile(fullPath);
          results.push({ path: entryPath, content });
        }
      } catch {
        // Skip files that can't be accessed (permissions, deleted during iteration)
      }
    }
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

  /**
   * Create a checkpoint of the current template.
   *
   * @param workflowsDir - Path to workflows directory
   * @param slug - Workflow slug
   * @param options - Checkpoint options
   * @returns CheckpointResult with checkpoint details
   */
  async checkpoint(
    workflowsDir: string,
    slug: string,
    options: CheckpointOptions
  ): Promise<CheckpointResult> {
    const workflowDir = this.pathResolver.join(workflowsDir, slug);
    const currentDir = this.pathResolver.join(workflowDir, 'current');
    const checkpointsDir = this.getCheckpointDir(workflowsDir, slug);
    const wfYamlPath = this.pathResolver.join(currentDir, 'wf.yaml');
    const workflowJsonPath = this.pathResolver.join(workflowDir, 'workflow.json');

    const createdAt = new Date().toISOString();

    // Validate current/ exists
    if (!(await this.fs.exists(currentDir))) {
      return {
        errors: [
          {
            code: WorkflowRegistryErrorCodes.INVALID_TEMPLATE,
            message: `Template directory missing: ${slug}/current/`,
            action: 'Create the current/ directory with a wf.yaml file',
          },
        ],
        ordinal: 0,
        hash: '',
        version: '',
        checkpointPath: '',
        createdAt,
      };
    }

    // Validate wf.yaml exists
    if (!(await this.fs.exists(wfYamlPath))) {
      return {
        errors: [
          {
            code: WorkflowRegistryErrorCodes.INVALID_TEMPLATE,
            message: `Template missing wf.yaml: ${slug}/current/wf.yaml`,
            action: 'Create a wf.yaml file in the current/ directory',
          },
        ],
        ordinal: 0,
        hash: '',
        version: '',
        checkpointPath: '',
        createdAt,
      };
    }

    // CORR-003: Wrap hash generation in try/catch
    let hash: string;
    try {
      hash = await this.generateCheckpointHash(workflowsDir, slug);
    } catch (error) {
      return {
        errors: [
          {
            code: WorkflowRegistryErrorCodes.INVALID_TEMPLATE,
            message: `Failed to hash template: ${error instanceof Error ? error.message : 'Unknown error'}`,
            action: 'Check file permissions in current/ directory',
          },
        ],
        ordinal: 0,
        hash: '',
        version: '',
        checkpointPath: '',
        createdAt,
      };
    }

    // Check for duplicate content (unless force)
    if (!options.force) {
      const existingVersions = await this.getVersions(checkpointsDir);
      const matchingVersion = existingVersions.find((v) => v.hash === hash);
      if (matchingVersion) {
        return {
          errors: [
            {
              code: WorkflowRegistryErrorCodes.DUPLICATE_CONTENT,
              message: `Template unchanged since ${matchingVersion.version}`,
              action: 'Make changes to the template or use --force to create anyway',
            },
          ],
          ordinal: 0,
          hash: '',
          version: '',
          checkpointPath: '',
          createdAt,
        };
      }
    }

    // Get next ordinal
    const ordinal = await this.getNextCheckpointOrdinal(workflowsDir, slug);
    const paddedOrdinal = ordinal.toString().padStart(3, '0');
    const version = `v${paddedOrdinal}-${hash}`;
    const checkpointPath = this.pathResolver.join(checkpointsDir, version);

    // Create checkpoint directory
    await this.fs.mkdir(checkpointPath, { recursive: true });

    // CORR-001: Wrap checkpoint creation in try/catch with cleanup on failure
    try {
      // Copy all files from current/ to checkpoint (using recursive helper)
      await this.copyDirectoryRecursive(currentDir, checkpointPath);

      // Create .checkpoint.json manifest
      const manifest: CheckpointManifest = {
        ordinal,
        hash,
        createdAt,
      };
      if (options.comment) {
        manifest.comment = options.comment;
      }
      await this.fs.writeFile(
        this.pathResolver.join(checkpointPath, '.checkpoint.json'),
        JSON.stringify(manifest, null, 2)
      );

      // Auto-generate workflow.json if missing (per CD03)
      // Per DYK-02: Uses shared utility from utils/generate-workflow-json.ts
      if (!(await this.fs.exists(workflowJsonPath))) {
        await generateWorkflowJson(workflowDir, slug, wfYamlPath, createdAt, {
          fs: this.fs,
          pathResolver: this.pathResolver,
          yamlParser: this.yamlParser,
        });
      }
    } catch (error) {
      // Cleanup on partial failure - remove orphaned checkpoint directory
      try {
        await this.fs.rmdir(checkpointPath, { recursive: true });
      } catch {
        // Best effort cleanup - ignore if already gone
      }
      return {
        errors: [
          {
            code: WorkflowRegistryErrorCodes.CHECKPOINT_FAILED,
            message: `Checkpoint creation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
            action: 'Check disk space and file permissions, then retry',
          },
        ],
        ordinal: 0,
        hash: '',
        version: '',
        checkpointPath: '',
        createdAt,
      };
    }

    return {
      errors: [],
      ordinal,
      hash,
      version,
      checkpointPath,
      createdAt,
    };
  }

  /**
   * Restore a checkpoint to current/.
   *
   * @param workflowsDir - Path to workflows directory
   * @param slug - Workflow slug
   * @param version - Version to restore (ordinal like 'v001' or full like 'v001-abc12345')
   * @returns RestoreResult
   */
  async restore(workflowsDir: string, slug: string, version: string): Promise<RestoreResult> {
    const workflowDir = this.pathResolver.join(workflowsDir, slug);
    const currentDir = this.pathResolver.join(workflowDir, 'current');
    const checkpointsDir = this.getCheckpointDir(workflowsDir, slug);

    // Check if workflow exists
    if (!(await this.fs.exists(workflowDir))) {
      return {
        errors: [
          {
            code: WorkflowRegistryErrorCodes.WORKFLOW_NOT_FOUND,
            message: `Workflow not found: ${slug}`,
            action: `Create workflow at ${workflowsDir}/${slug}/`,
          },
        ],
        slug,
        version: '',
        currentPath: currentDir,
      };
    }

    // Get all versions
    const versions = await this.getVersions(checkpointsDir);

    // Check if any checkpoints exist
    if (versions.length === 0) {
      return {
        errors: [
          {
            code: WorkflowRegistryErrorCodes.NO_CHECKPOINT,
            message: `No checkpoints exist for workflow: ${slug}`,
            action: `Create a checkpoint first with 'cg workflow checkpoint ${slug}'`,
          },
        ],
        slug,
        version: '',
        currentPath: currentDir,
      };
    }

    // Find matching version (by ordinal prefix or full version)
    let matchedVersion: CheckpointInfo | undefined;
    if (version.match(/^v\d{3}$/)) {
      // Ordinal only (e.g., 'v001')
      matchedVersion = versions.find((v) => v.version.startsWith(version));
    } else {
      // Full version string
      matchedVersion = versions.find((v) => v.version === version);
    }

    if (!matchedVersion) {
      return {
        errors: [
          {
            code: WorkflowRegistryErrorCodes.VERSION_NOT_FOUND,
            message: `Version not found: ${version}`,
            action: `Use 'cg workflow versions ${slug}' to see available versions`,
          },
        ],
        slug,
        version: '',
        currentPath: currentDir,
      };
    }

    const checkpointPath = this.pathResolver.join(checkpointsDir, matchedVersion.version);

    // Clear current/ directory
    if (await this.fs.exists(currentDir)) {
      await this.fs.rmdir(currentDir, { recursive: true });
    }
    await this.fs.mkdir(currentDir, { recursive: true });

    // CORR-004: Wrap copy operation in try/catch
    try {
      // Copy checkpoint files to current/
      await this.copyDirectoryRecursive(checkpointPath, currentDir);
    } catch (error) {
      return {
        errors: [
          {
            code: WorkflowRegistryErrorCodes.RESTORE_FAILED,
            message: `Restore failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
            action: 'Check file permissions and retry',
          },
        ],
        slug,
        version: '',
        currentPath: currentDir,
      };
    }

    return {
      errors: [],
      slug,
      version: matchedVersion.version,
      currentPath: currentDir,
    };
  }

  /**
   * List all checkpoint versions for a workflow.
   *
   * @param workflowsDir - Path to workflows directory
   * @param slug - Workflow slug
   * @returns VersionsResult
   */
  async versions(workflowsDir: string, slug: string): Promise<VersionsResult> {
    const workflowDir = this.pathResolver.join(workflowsDir, slug);
    const checkpointsDir = this.getCheckpointDir(workflowsDir, slug);

    // Check if workflow exists
    if (!(await this.fs.exists(workflowDir))) {
      return {
        errors: [
          {
            code: WorkflowRegistryErrorCodes.WORKFLOW_NOT_FOUND,
            message: `Workflow not found: ${slug}`,
            action: `Create workflow at ${workflowsDir}/${slug}/`,
          },
        ],
        slug,
        versions: [],
      };
    }

    const versionList = await this.getVersions(checkpointsDir);

    return {
      errors: [],
      slug,
      versions: versionList,
    };
  }

  /**
   * Recursively copy a directory, excluding .git, node_modules, dist.
   * Per DYK-01: Uses IFileSystem adapter, never direct fs access.
   * Per SEC-002: Validates paths to prevent directory traversal attacks.
   * Per CORR-002: Removed TOCTOU race by relying on mkdir({ recursive: true }).
   */
  private async copyDirectoryRecursive(
    sourceDir: string,
    destDir: string,
    relativePath = ''
  ): Promise<void> {
    const currentSource = relativePath
      ? this.pathResolver.join(sourceDir, relativePath)
      : sourceDir;
    const currentDest = relativePath ? this.pathResolver.join(destDir, relativePath) : destDir;

    if (!(await this.fs.exists(currentSource))) {
      return;
    }

    const entries = await this.fs.readDir(currentSource);

    for (const entry of entries) {
      // Skip excluded directories
      if (WorkflowRegistryService.EXCLUDED_DIRS.includes(entry)) {
        continue;
      }

      // Skip .checkpoint.json when copying (it's metadata, not template content)
      if (entry === '.checkpoint.json') {
        continue;
      }

      const entryRelPath = relativePath ? this.pathResolver.join(relativePath, entry) : entry;

      // SEC-002: Path traversal protection - skip entries with '..'
      if (!WorkflowRegistryService.isPathSafe(entryRelPath)) {
        continue;
      }

      const sourcePath = this.pathResolver.join(sourceDir, entryRelPath);
      const destPath = this.pathResolver.join(destDir, entryRelPath);

      const stat = await this.fs.stat(sourcePath);

      if (stat.isDirectory) {
        // Create destination directory and recurse
        await this.fs.mkdir(destPath, { recursive: true });
        await this.copyDirectoryRecursive(sourceDir, destDir, entryRelPath);
      } else if (stat.isFile) {
        // CORR-002: Removed TOCTOU race - mkdir({ recursive: true }) handles existence
        const parentDir = this.pathResolver.join(destDir, relativePath);
        if (parentDir !== destDir) {
          await this.fs.mkdir(parentDir, { recursive: true });
        }
        // Copy file
        await this.fs.copyFile(sourcePath, destPath);
      }
    }
  }

}
