/**
 * Workflow entity - unified model for current, checkpoint, and run sources.
 *
 * Per Plan 010: Entity Upgrade - The Workflow entity represents a workflow
 * loaded from any source (current/, checkpoints/, runs/). The model is the same,
 * only the populated state differs.
 *
 * Per DYK-02: Factory pattern enforces XOR invariant (isCurrent XOR isCheckpoint XOR isRun).
 * Per DYK-03: toJSON() uses camelCase keys, undefined→null, Date→ISO string.
 *
 * Source types:
 * - current/: isCurrent=true, checkpoint=null, run=null (editable template)
 * - checkpoints/: isCheckpoint=true, checkpoint=populated, run=null (frozen)
 * - runs/: isRun=true, checkpoint=populated, run=populated (runtime)
 */

import type { RunStatus } from '../types/wf-status.types.js';
import type { Phase, PhaseJSON } from './phase.js';

/**
 * Checkpoint metadata for workflows loaded from checkpoints/ or runs/.
 */
export interface CheckpointMetadata {
  /** 1-based version ordinal (e.g., 1 for v001) */
  readonly ordinal: number;
  /** 8-character content hash prefix */
  readonly hash: string;
  /** When the checkpoint was created */
  readonly createdAt: Date;
  /** Optional comment describing the checkpoint */
  readonly comment?: string;
}

/**
 * Run metadata for workflows loaded from runs/.
 */
export interface RunMetadata {
  /** Run identifier (e.g., 'run-2026-01-25-001') */
  readonly runId: string;
  /** Absolute path to the run directory */
  readonly runDir: string;
  /** Current run status */
  readonly status: RunStatus;
  /** When the run was created */
  readonly createdAt: Date;
}

/**
 * Input for creating a current workflow.
 */
interface CurrentWorkflowInput {
  slug: string;
  workflowDir: string;
  version: string;
  description?: string;
  phases: Phase[];
}

/**
 * Input for creating a checkpoint workflow.
 */
interface CheckpointWorkflowInput extends CurrentWorkflowInput {
  checkpoint: CheckpointMetadata;
}

/**
 * Input for creating a run workflow.
 */
interface RunWorkflowInput extends CheckpointWorkflowInput {
  run: RunMetadata;
}

/**
 * Serialized checkpoint metadata for JSON output.
 */
interface CheckpointMetadataJSON {
  ordinal: number;
  hash: string;
  createdAt: string; // ISO string
  comment: string | null;
}

/**
 * Serialized run metadata for JSON output.
 */
interface RunMetadataJSON {
  runId: string;
  runDir: string;
  status: RunStatus;
  createdAt: string; // ISO string
}

/**
 * Serialized Workflow for JSON output.
 */
export interface WorkflowJSON {
  slug: string;
  workflowDir: string;
  version: string;
  description: string | null;
  isCurrent: boolean;
  isCheckpoint: boolean;
  isRun: boolean;
  isTemplate: boolean;
  source: 'current' | 'checkpoint' | 'run';
  checkpoint: CheckpointMetadataJSON | null;
  run: RunMetadataJSON | null;
  phases: (PhaseJSON | Phase)[]; // Can be serialized phases or raw Phase entities
}

/**
 * Workflow entity - unified model for all source types.
 *
 * A Workflow can be loaded from three sources:
 * - "current" folder: The editable working copy (isCurrent=true)
 * - "checkpoints" folder: An immutable snapshot (isCheckpoint=true)
 * - "runs" folder: An execution with runtime state (isRun=true)
 *
 * The model is unified - same structure, different populated state.
 * Use factory methods to create instances (constructor is private).
 */
export class Workflow {
  /** Workflow slug (directory name) */
  readonly slug: string;

  /** Absolute path to the workflow source directory */
  readonly workflowDir: string;

  /** Semantic version from wf.yaml */
  readonly version: string;

  /** Optional description */
  readonly description: string | undefined;

  /** Phases in this workflow */
  readonly phases: ReadonlyArray<Phase>;

  /** True if loaded from current/ (editable template) */
  readonly isCurrent: boolean;

  /** Checkpoint metadata (populated for checkpoints and runs) */
  readonly checkpoint: CheckpointMetadata | null;

  /** Run metadata (populated only for runs) */
  readonly run: RunMetadata | null;

  /**
   * Private constructor - use factory methods instead.
   * Per DYK-02: Factory pattern enforces XOR invariant.
   */
  private constructor(
    slug: string,
    workflowDir: string,
    version: string,
    description: string | undefined,
    phases: Phase[],
    isCurrent: boolean,
    checkpoint: CheckpointMetadata | null,
    run: RunMetadata | null
  ) {
    this.slug = slug;
    this.workflowDir = workflowDir;
    this.version = version;
    this.description = description;
    this.phases = Object.freeze([...phases]);
    this.isCurrent = isCurrent;
    this.checkpoint = checkpoint;
    this.run = run;
  }

  /**
   * Create a Workflow from current/ (editable template).
   *
   * @param input - Workflow data
   * @returns Workflow with isCurrent=true
   */
  static createCurrent(input: CurrentWorkflowInput): Workflow {
    return new Workflow(
      input.slug,
      input.workflowDir,
      input.version,
      input.description,
      input.phases,
      true, // isCurrent
      null, // checkpoint
      null // run
    );
  }

  /**
   * Create a Workflow from a checkpoint (frozen snapshot).
   *
   * @param input - Workflow data with checkpoint metadata
   * @returns Workflow with isCheckpoint=true
   */
  static createCheckpoint(input: CheckpointWorkflowInput): Workflow {
    return new Workflow(
      input.slug,
      input.workflowDir,
      input.version,
      input.description,
      input.phases,
      false, // isCurrent
      input.checkpoint,
      null // run
    );
  }

  /**
   * Create a Workflow from a run (execution with runtime state).
   *
   * @param input - Workflow data with checkpoint and run metadata
   * @returns Workflow with isRun=true
   */
  static createRun(input: RunWorkflowInput): Workflow {
    return new Workflow(
      input.slug,
      input.workflowDir,
      input.version,
      input.description,
      input.phases,
      false, // isCurrent
      input.checkpoint,
      input.run
    );
  }

  /**
   * True if loaded from a checkpoint (not current, not a run).
   */
  get isCheckpoint(): boolean {
    return this.checkpoint !== null && this.run === null;
  }

  /**
   * True if loaded from a run.
   */
  get isRun(): boolean {
    return this.run !== null;
  }

  /**
   * True if this is a template (current or checkpoint, not a run).
   */
  get isTemplate(): boolean {
    return this.isCurrent || this.isCheckpoint;
  }

  /**
   * Source type for explicit API clarity.
   */
  get source(): 'current' | 'checkpoint' | 'run' {
    if (this.isCurrent) return 'current';
    if (this.isRun) return 'run';
    return 'checkpoint';
  }

  /**
   * Serialize to JSON for API/web consumption.
   *
   * Per DYK-03:
   * - camelCase property names
   * - undefined → null
   * - Date → ISO-8601 string
   * - Recursive serialization for phases[]
   */
  toJSON(): WorkflowJSON {
    return {
      slug: this.slug,
      workflowDir: this.workflowDir,
      version: this.version,
      description: this.description ?? null,
      isCurrent: this.isCurrent,
      isCheckpoint: this.isCheckpoint,
      isRun: this.isRun,
      isTemplate: this.isTemplate,
      source: this.source,
      checkpoint: this.checkpoint
        ? {
            ordinal: this.checkpoint.ordinal,
            hash: this.checkpoint.hash,
            createdAt: this.checkpoint.createdAt.toISOString(),
            comment: this.checkpoint.comment ?? null,
          }
        : null,
      run: this.run
        ? {
            runId: this.run.runId,
            runDir: this.run.runDir,
            status: this.run.status,
            createdAt: this.run.createdAt.toISOString(),
          }
        : null,
      phases: this.phases.map((p) => (p && typeof p.toJSON === 'function' ? p.toJSON() : p)),
    };
  }
}
