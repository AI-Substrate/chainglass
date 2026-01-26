/**
 * Phase entity - unified model for template and run phases.
 *
 * Per Plan 010: Entity Upgrade - The Phase entity represents a phase loaded from
 * any source. The model is the same, only the populated state differs:
 * - Template phase: exists=false, values=undefined, status='pending'
 * - Run phase: exists=true/false, values=populated, status=runtime state
 *
 * Per DYK-03: toJSON() uses camelCase keys, undefined→null, Date→ISO string.
 *
 * This is the most complex entity with 20+ nested properties across 7 field groups:
 * - Identity (name, phaseDir, runDir)
 * - Definition (description, order)
 * - Input files, parameters, messages
 * - Output files, parameters
 * - Runtime state (status, facilitator, state, timing)
 * - Status history
 */

import type { ActionType, Facilitator, PhaseState } from '../types/wf-phase.types.js';
import type { PhaseRunStatus } from '../types/wf-status.types.js';

/**
 * Input file with existence status.
 */
export interface PhaseInputFile {
  readonly name: string;
  readonly required: boolean;
  readonly description?: string;
  readonly fromPhase?: string;
  readonly exists: boolean;
  readonly path: string;
}

/**
 * Input parameter with resolved value.
 */
export interface PhaseInputParameter {
  readonly name: string;
  readonly required: boolean;
  readonly description?: string;
  readonly fromPhase?: string;
  readonly value: unknown | undefined;
}

/**
 * Message option for choice types.
 */
export interface PhaseMessageOption {
  readonly key: string;
  readonly label: string;
  readonly description?: string;
}

/**
 * Input message with existence/answered status.
 */
export interface PhaseInputMessage {
  readonly id: string;
  readonly type: 'single_choice' | 'multi_choice' | 'free_text' | 'confirm';
  readonly from: 'agent' | 'orchestrator';
  readonly required: boolean;
  readonly subject: string;
  readonly prompt?: string;
  readonly options?: ReadonlyArray<PhaseMessageOption>;
  readonly description?: string;
  readonly exists: boolean;
  readonly answered: boolean;
}

/**
 * Output file with existence/validation status.
 */
export interface PhaseOutput {
  readonly name: string;
  readonly type: 'file';
  readonly required: boolean;
  readonly schema?: string;
  readonly description?: string;
  readonly exists: boolean;
  readonly valid: boolean;
  readonly path: string;
}

/**
 * Output parameter with extracted value.
 */
export interface PhaseOutputParameter {
  readonly name: string;
  readonly source: string;
  readonly query: string;
  readonly description?: string;
  readonly value: unknown | undefined;
}

/**
 * Status history entry.
 */
export interface PhaseStatusEntry {
  readonly timestamp: string;
  readonly from: Facilitator;
  readonly action: ActionType;
  readonly messageId?: string;
  readonly comment?: string;
  readonly data?: Record<string, unknown>;
}

/**
 * Input for creating a Phase entity.
 */
export interface PhaseInput {
  name: string;
  phaseDir: string;
  runDir: string;
  description: string;
  order: number;
  status: PhaseRunStatus;
  facilitator: Facilitator;
  state: PhaseState;
  startedAt?: Date;
  completedAt?: Date;
  inputFiles?: PhaseInputFile[];
  inputParameters?: PhaseInputParameter[];
  inputMessages?: PhaseInputMessage[];
  outputs?: PhaseOutput[];
  outputParameters?: PhaseOutputParameter[];
  statusHistory?: PhaseStatusEntry[];
  messages?: unknown[];
}

/**
 * Serialized Phase for JSON output.
 */
export interface PhaseJSON {
  name: string;
  phaseDir: string;
  runDir: string;
  description: string;
  order: number;
  status: PhaseRunStatus;
  facilitator: Facilitator;
  state: PhaseState;
  startedAt: string | null;
  completedAt: string | null;
  duration: number | null;
  isPending: boolean;
  isReady: boolean;
  isActive: boolean;
  isBlocked: boolean;
  isComplete: boolean;
  isFailed: boolean;
  isDone: boolean;
  inputFiles: PhaseInputFile[];
  inputParameters: PhaseInputParameter[];
  inputMessages: PhaseInputMessage[];
  outputs: PhaseOutput[];
  outputParameters: PhaseOutputParameter[];
  statusHistory: PhaseStatusEntry[];
  messages: unknown[];
}

/**
 * Phase entity - unified model for template and run phases.
 *
 * Per Key Invariant 2: Template Phase ≡ Run Phase (same fields, different populated values)
 * - Template: exists=false, value=undefined, status='pending'
 * - Run: exists=true/false, value=populated, status=runtime
 */
export class Phase {
  // ===== Identity =====
  readonly name: string;
  readonly phaseDir: string;
  readonly runDir: string;

  // ===== From Definition =====
  readonly description: string;
  readonly order: number;

  // ===== Runtime State =====
  readonly status: PhaseRunStatus;
  readonly facilitator: Facilitator;
  readonly state: PhaseState;
  readonly startedAt: Date | undefined;
  readonly completedAt: Date | undefined;

  // ===== Input Files =====
  readonly inputFiles: ReadonlyArray<PhaseInputFile>;

  // ===== Input Parameters =====
  readonly inputParameters: ReadonlyArray<PhaseInputParameter>;

  // ===== Input Messages =====
  readonly inputMessages: ReadonlyArray<PhaseInputMessage>;

  // ===== Output Files =====
  readonly outputs: ReadonlyArray<PhaseOutput>;

  // ===== Output Parameters =====
  readonly outputParameters: ReadonlyArray<PhaseOutputParameter>;

  // ===== Status History =====
  readonly statusHistory: ReadonlyArray<PhaseStatusEntry>;

  // ===== Messages (loaded from messages/ folder) =====
  readonly messages: ReadonlyArray<unknown>;

  /**
   * Create a Phase entity.
   *
   * @param input - Phase data
   */
  constructor(input: PhaseInput) {
    this.name = input.name;
    this.phaseDir = input.phaseDir;
    this.runDir = input.runDir;
    this.description = input.description;
    this.order = input.order;
    this.status = input.status;
    this.facilitator = input.facilitator;
    this.state = input.state;
    this.startedAt = input.startedAt;
    this.completedAt = input.completedAt;
    this.inputFiles = Object.freeze([...(input.inputFiles ?? [])]);
    this.inputParameters = Object.freeze([...(input.inputParameters ?? [])]);
    this.inputMessages = Object.freeze([...(input.inputMessages ?? [])]);
    this.outputs = Object.freeze([...(input.outputs ?? [])]);
    this.outputParameters = Object.freeze([...(input.outputParameters ?? [])]);
    this.statusHistory = Object.freeze([...(input.statusHistory ?? [])]);
    this.messages = Object.freeze([...(input.messages ?? [])]);
  }

  // ===== Computed Properties =====

  /**
   * Duration in milliseconds between started and completed.
   * Returns undefined if either time is not set.
   */
  get duration(): number | undefined {
    if (this.startedAt && this.completedAt) {
      return this.completedAt.getTime() - this.startedAt.getTime();
    }
    return undefined;
  }

  /** True if status is 'pending'. */
  get isPending(): boolean {
    return this.status === 'pending';
  }

  /** True if status is 'ready'. */
  get isReady(): boolean {
    return this.status === 'ready';
  }

  /** True if status is 'active'. */
  get isActive(): boolean {
    return this.status === 'active';
  }

  /** True if status is 'blocked'. */
  get isBlocked(): boolean {
    return this.status === 'blocked';
  }

  /** True if status is 'complete'. */
  get isComplete(): boolean {
    return this.status === 'complete';
  }

  /** True if status is 'failed'. */
  get isFailed(): boolean {
    return this.status === 'failed';
  }

  /** True if phase is done (complete or failed). */
  get isDone(): boolean {
    return this.isComplete || this.isFailed;
  }

  /**
   * Serialize to JSON for API/web consumption.
   *
   * Per DYK-03:
   * - camelCase property names
   * - undefined → null
   * - Date → ISO-8601 string
   * - Recursive serialization for arrays
   */
  toJSON(): PhaseJSON {
    return {
      name: this.name,
      phaseDir: this.phaseDir,
      runDir: this.runDir,
      description: this.description,
      order: this.order,
      status: this.status,
      facilitator: this.facilitator,
      state: this.state,
      startedAt: this.startedAt?.toISOString() ?? null,
      completedAt: this.completedAt?.toISOString() ?? null,
      duration: this.duration ?? null,
      isPending: this.isPending,
      isReady: this.isReady,
      isActive: this.isActive,
      isBlocked: this.isBlocked,
      isComplete: this.isComplete,
      isFailed: this.isFailed,
      isDone: this.isDone,
      inputFiles: [...this.inputFiles],
      inputParameters: [...this.inputParameters],
      inputMessages: [...this.inputMessages],
      outputs: [...this.outputs],
      outputParameters: [...this.outputParameters],
      statusHistory: [...this.statusHistory],
      messages: [...this.messages],
    };
  }
}
