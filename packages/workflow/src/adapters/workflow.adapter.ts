/**
 * Production WorkflowAdapter for loading workflows from filesystem.
 *
 * Per Phase 3: Production Adapters.
 * Per Critical Discovery 04: Uses pathResolver.join() for all path operations.
 * Per Critical Discovery 03: No caching - always fresh reads.
 *
 * Loads Workflow entities from three source types:
 * - current/: Editable template (isCurrent=true)
 * - checkpoints/: Frozen snapshot (isCheckpoint=true)
 * - runs/: Execution with runtime state (isRun=true)
 */

import type { IFileSystem, IPathResolver } from '@chainglass/shared';
import { Workflow } from '../entities/workflow.js';
import { EntityNotFoundError } from '../errors/entity-not-found.error.js';
import { RunCorruptError } from '../errors/run-errors.js';
import type { IWorkflowAdapter, RunListFilter } from '../interfaces/workflow-adapter.interface.js';
import type { IYamlParser } from '../interfaces/yaml-parser.interface.js';
import type { WfStatus } from '../types/wf-status.types.js';
import type { WfDefinition } from '../types/wf.types.js';

/**
 * Checkpoint metadata structure from checkpoint-metadata.json.
 */
interface CheckpointMetadataFile {
  ordinal: number;
  hash: string;
  created_at: string;
  comment?: string;
}

/**
 * Production implementation of IWorkflowAdapter.
 *
 * Reads workflows from the filesystem using injected dependencies:
 * - IFileSystem for file I/O
 * - IPathResolver for secure path operations
 * - IYamlParser for parsing wf.yaml
 */
export class WorkflowAdapter implements IWorkflowAdapter {
  private readonly WORKFLOWS_DIR = '.chainglass/workflows';
  private readonly RUNS_DIR = '.chainglass/runs';

  constructor(
    private readonly fs: IFileSystem,
    private readonly pathResolver: IPathResolver,
    private readonly yamlParser: IYamlParser
  ) {}

  /**
   * Load a workflow from the current/ directory (editable template).
   */
  async loadCurrent(slug: string): Promise<Workflow> {
    const workflowDir = this.pathResolver.join(this.WORKFLOWS_DIR, slug, 'current');
    const wfYamlPath = this.pathResolver.join(workflowDir, 'wf.yaml');

    // Check if wf.yaml exists
    const exists = await this.fs.exists(wfYamlPath);
    if (!exists) {
      throw new EntityNotFoundError('Workflow', slug, workflowDir);
    }

    // Read and parse wf.yaml
    const content = await this.fs.readFile(wfYamlPath);
    const definition = this.yamlParser.parse<WfDefinition>(content, wfYamlPath);

    return Workflow.createCurrent({
      slug,
      workflowDir,
      version: definition.version,
      description: definition.description,
      phases: [], // Phases loaded separately via PhaseAdapter
    });
  }

  /**
   * Load a workflow from a checkpoint directory (immutable snapshot).
   */
  async loadCheckpoint(slug: string, version: string): Promise<Workflow> {
    const workflowDir = this.pathResolver.join(this.WORKFLOWS_DIR, slug, 'checkpoints', version);
    const wfYamlPath = this.pathResolver.join(workflowDir, 'wf.yaml');
    const metadataPath = this.pathResolver.join(workflowDir, 'checkpoint-metadata.json');

    // Check if wf.yaml exists
    const exists = await this.fs.exists(wfYamlPath);
    if (!exists) {
      throw new EntityNotFoundError('Checkpoint', version, workflowDir);
    }

    // Read and parse wf.yaml
    const content = await this.fs.readFile(wfYamlPath);
    const definition = this.yamlParser.parse<WfDefinition>(content, wfYamlPath);

    // Read checkpoint metadata
    const metadataContent = await this.fs.readFile(metadataPath);
    const metadata: CheckpointMetadataFile = JSON.parse(metadataContent);

    return Workflow.createCheckpoint({
      slug,
      workflowDir,
      version: definition.version,
      description: definition.description,
      phases: [],
      checkpoint: {
        ordinal: metadata.ordinal,
        hash: metadata.hash,
        createdAt: new Date(metadata.created_at),
        comment: metadata.comment,
      },
    });
  }

  /**
   * Load a workflow from a run directory (execution with runtime state).
   *
   * Per Critical Insight 1: Wraps JSON.parse in try-catch, throws RunCorruptError.
   */
  async loadRun(runDir: string): Promise<Workflow> {
    const wfStatusPath = this.pathResolver.join(runDir, 'wf-run', 'wf-status.json');

    // Check if wf-status.json exists
    const exists = await this.fs.exists(wfStatusPath);
    if (!exists) {
      throw new EntityNotFoundError('Run', runDir, runDir);
    }

    // Read and parse wf-status.json
    const content = await this.fs.readFile(wfStatusPath);
    let wfStatus: WfStatus;
    try {
      wfStatus = JSON.parse(content);
    } catch {
      // Per Critical Insight 1: Throw RunCorruptError on malformed JSON
      throw new RunCorruptError(
        this.pathResolver.basename(runDir),
        runDir,
        'Invalid JSON in wf-status.json'
      );
    }

    // Extract slug from wf-status (per data locality principle)
    const slug = wfStatus.workflow.slug ?? wfStatus.workflow.name;

    // Extract checkpoint metadata
    const versionHash = wfStatus.workflow.version_hash ?? '';
    const checkpointOrdinal = this.parseOrdinalFromHash(versionHash);

    return Workflow.createRun({
      slug,
      workflowDir: runDir,
      version: wfStatus.workflow.version,
      description: undefined, // Not stored in wf-status.json
      phases: [],
      checkpoint: {
        ordinal: checkpointOrdinal,
        hash: versionHash,
        createdAt: new Date(wfStatus.run.created_at), // Use run created_at as checkpoint date approximation
        comment: wfStatus.workflow.checkpoint_comment,
      },
      run: {
        runId: wfStatus.run.id,
        runDir,
        status: wfStatus.run.status,
        createdAt: new Date(wfStatus.run.created_at),
      },
    });
  }

  /**
   * List all checkpoint versions for a workflow.
   * Returns Workflow entities sorted by ordinal descending (newest first).
   */
  async listCheckpoints(slug: string): Promise<Workflow[]> {
    const checkpointsDir = this.pathResolver.join(this.WORKFLOWS_DIR, slug, 'checkpoints');

    // Check if checkpoints directory exists
    const exists = await this.fs.exists(checkpointsDir);
    if (!exists) {
      // Check if workflow exists at all
      const workflowDir = this.pathResolver.join(this.WORKFLOWS_DIR, slug);
      const workflowExists = await this.fs.exists(workflowDir);
      if (!workflowExists) {
        throw new EntityNotFoundError('Workflow', slug, workflowDir);
      }
      return [];
    }

    // Read checkpoint directories
    const entries = await this.fs.readDir(checkpointsDir);
    const checkpoints: Workflow[] = [];

    for (const entry of entries) {
      try {
        const workflow = await this.loadCheckpoint(slug, entry);
        checkpoints.push(workflow);
      } catch {
        // Skip invalid checkpoint directories
      }
    }

    // Sort by ordinal descending (newest first)
    return checkpoints.sort((a, b) => {
      const ordinalA = a.checkpoint?.ordinal ?? 0;
      const ordinalB = b.checkpoint?.ordinal ?? 0;
      return ordinalB - ordinalA;
    });
  }

  /**
   * List runs for a workflow, optionally filtered.
   * Filters are applied before full hydration for performance.
   */
  async listRuns(slug: string, filter?: RunListFilter): Promise<Workflow[]> {
    const runsBaseDir = this.pathResolver.join(this.RUNS_DIR, slug);

    // Check if runs base directory exists
    const baseExists = await this.fs.exists(runsBaseDir);
    if (!baseExists) {
      // Check if workflow exists
      const workflowDir = this.pathResolver.join(this.WORKFLOWS_DIR, slug);
      const workflowExists = await this.fs.exists(workflowDir);
      if (!workflowExists) {
        throw new EntityNotFoundError('Workflow', slug, workflowDir);
      }
      return [];
    }

    // Scan for run directories across all checkpoint versions
    const runs: Workflow[] = [];
    const checkpointVersions = await this.fs.readDir(runsBaseDir);

    for (const version of checkpointVersions) {
      const versionDir = this.pathResolver.join(runsBaseDir, version);
      const runDirs = await this.safeReadDir(versionDir);

      for (const runId of runDirs) {
        const runDir = this.pathResolver.join(versionDir, runId);
        const wfStatusPath = this.pathResolver.join(runDir, 'wf-run', 'wf-status.json');

        // Check if wf-status.json exists
        const statusExists = await this.fs.exists(wfStatusPath);
        if (!statusExists) {
          continue;
        }

        try {
          // Read wf-status.json for filtering before full hydration
          const content = await this.fs.readFile(wfStatusPath);
          const wfStatus: WfStatus = JSON.parse(content);

          // Apply filters before hydration (performance optimization)
          if (!this.matchesFilter(wfStatus, filter)) {
            continue;
          }

          // Hydrate the run
          const workflow = await this.loadRun(runDir);
          runs.push(workflow);
        } catch {
          // Skip corrupt/invalid runs
        }
      }
    }

    // Sort by creation date descending (newest first)
    runs.sort((a, b) => {
      const dateA = a.run?.createdAt.getTime() ?? 0;
      const dateB = b.run?.createdAt.getTime() ?? 0;
      return dateB - dateA;
    });

    // Apply limit if specified
    if (filter?.limit !== undefined && filter.limit > 0) {
      return runs.slice(0, filter.limit);
    }

    return runs;
  }

  /**
   * Check if a workflow exists in the registry.
   */
  async exists(slug: string): Promise<boolean> {
    const workflowJsonPath = this.pathResolver.join(this.WORKFLOWS_DIR, slug, 'workflow.json');
    return this.fs.exists(workflowJsonPath);
  }

  // ==================== Private Helpers ====================

  /**
   * Parse ordinal from version hash (e.g., 'abc12345' from 'v001-abc12345').
   * Returns 1 if parsing fails.
   */
  private parseOrdinalFromHash(versionHash: string): number {
    // Try to extract ordinal from version hash pattern
    const match = versionHash.match(/^v?(\d+)/);
    if (match) {
      return Number.parseInt(match[1], 10);
    }
    return 1;
  }

  /**
   * Check if a run matches the given filter criteria.
   * All specified filters are ANDed together.
   */
  private matchesFilter(wfStatus: WfStatus, filter?: RunListFilter): boolean {
    if (!filter) {
      return true;
    }

    // Status filter
    if (filter.status !== undefined) {
      const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
      if (!statuses.includes(wfStatus.run.status)) {
        return false;
      }
    }

    // createdAfter filter
    if (filter.createdAfter !== undefined) {
      const createdAt = new Date(wfStatus.run.created_at);
      if (createdAt <= filter.createdAfter) {
        return false;
      }
    }

    // createdBefore filter
    if (filter.createdBefore !== undefined) {
      const createdAt = new Date(wfStatus.run.created_at);
      if (createdAt >= filter.createdBefore) {
        return false;
      }
    }

    return true;
  }

  /**
   * Safely read directory, returning empty array on error.
   */
  private async safeReadDir(path: string): Promise<string[]> {
    try {
      return await this.fs.readDir(path);
    } catch {
      return [];
    }
  }
}
