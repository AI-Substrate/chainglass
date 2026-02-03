import type { BaseResult, ResultError } from '@chainglass/shared';
import type { WorkspaceContext } from '@chainglass/workflow';
import type {
  Execution,
  GraphOrchestratorSettings,
  GraphProperties,
  InputResolution,
  LineOrchestratorSettings,
  LineProperties,
  NodeExecutionStatus,
  NodeOrchestratorSettings,
  NodeProperties,
  PositionalGraphDefinition,
  TransitionMode,
} from '../schemas/index.js';

// ============================================
// Narrow Dependency Interfaces
// ============================================

/**
 * Narrow representation of a WorkUnit's input declaration.
 * Per DYK-P4-I2: local to positional-graph, mirrors WorkUnitInput from @chainglass/workflow.
 */
export interface NarrowWorkUnitInput {
  name: string;
  type: 'data' | 'file';
  required: boolean;
  description?: string;
}

/**
 * Narrow representation of a WorkUnit's output declaration.
 */
export interface NarrowWorkUnitOutput {
  name: string;
  type: 'data' | 'file';
  required: boolean;
  description?: string;
}

/**
 * Narrow representation of a loaded WorkUnit — just the fields collateInputs needs.
 */
export interface NarrowWorkUnit {
  slug: string;
  inputs: NarrowWorkUnitInput[];
  outputs: NarrowWorkUnitOutput[];
}

/**
 * Narrow interface for WorkUnit loading.
 * Per DYK-P4-I2: avoids cross-package dependency on @chainglass/workgraph.
 * Host app wires the real WorkUnitService to satisfy this at DI level.
 *
 * Phase 5: Return type widened to include typed `unit` with inputs/outputs
 * for collateInputs to check declared inputs and validate output names.
 */
export interface IWorkUnitLoader {
  load(
    ctx: WorkspaceContext,
    slug: string
  ): Promise<{ unit?: NarrowWorkUnit; errors: ResultError[] }>;
}

// ============================================
// Result Types — Graph CRUD
// ============================================

export interface GraphCreateResult extends BaseResult {
  graphSlug: string;
  lineId: string;
}

/**
 * Raw graph definition for programmatic use.
 * Per DYK-P3-I2: carries the full Zod-validated definition.
 */
export interface PGLoadResult extends BaseResult {
  definition?: PositionalGraphDefinition;
}

/**
 * Lightweight display summary for CLI.
 * Per DYK-P3-I2: structural summary, no runtime status (Phase 5).
 * DYK-I3: transition stays flat for display formatting compatibility.
 */
export interface PGShowResult extends BaseResult {
  slug?: string;
  version?: string;
  description?: string;
  createdAt?: string;
  lines?: Array<{
    id: string;
    label?: string;
    description?: string;
    transition: TransitionMode;
    nodeCount: number;
  }>;
  totalNodeCount?: number;
}

export interface PGListResult extends BaseResult {
  slugs: string[];
}

// ============================================
// Result Types — Line Operations
// ============================================

export interface AddLineResult extends BaseResult {
  lineId?: string;
  index?: number;
}

// ============================================
// Option Types
// ============================================

export interface AddLineOptions {
  afterLineId?: string;
  beforeLineId?: string;
  atIndex?: number;
  label?: string;
  description?: string;
  orchestratorSettings?: Partial<LineOrchestratorSettings>;
}

// ============================================
// Result Types — Node Operations (Phase 4+)
// ============================================

export interface AddNodeOptions {
  atPosition?: number;
  description?: string;
  orchestratorSettings?: Partial<NodeOrchestratorSettings>;
}

export interface MoveNodeOptions {
  /** Position in the target line (current line if toLineId absent, target line if present). Appends if omitted. */
  toPosition?: number;
  /** Target line ID. If omitted, node stays in its current line. */
  toLineId?: string;
}

export interface AddNodeResult extends BaseResult {
  nodeId?: string;
  lineId?: string;
  position?: number;
}

/**
 * DYK-I3: execution stays flat for display formatting compatibility.
 */
export interface NodeShowResult extends BaseResult {
  nodeId?: string;
  unitSlug?: string;
  execution?: Execution;
  description?: string;
  lineId?: string;
  position?: number;
  inputs?: Record<string, InputResolution>;
}

// ============================================
// Result Types — Input Resolution (Phase 5)
// ============================================

/** A single resolved source for an available input. */
export interface AvailableSource {
  sourceNodeId: string;
  sourceOutput: string;
  data: unknown;
}

/** Detail for an input that is fully resolved. */
export interface AvailableInput {
  inputName: string;
  required: boolean;
  sources: AvailableSource[];
}

/** Detail for an input whose sources aren't all complete yet. */
export interface WaitingInput {
  inputName: string;
  required: boolean;
  available: AvailableSource[];
  waiting: string[];
  hint?: string;
}

/** Detail for an input with a resolution error. */
export interface ErrorInput {
  inputName: string;
  required: boolean;
  code: string;
  message: string;
}

/** A single entry in the InputPack — one of three states. */
export type InputEntry =
  | { status: 'available'; detail: AvailableInput }
  | { status: 'waiting'; detail: WaitingInput }
  | { status: 'error'; detail: ErrorInput };

/**
 * The result of collateInputs — maps each declared input to its resolution status.
 * `ok` is true when every REQUIRED input has status 'available'.
 */
export interface InputPack {
  inputs: Record<string, InputEntry>;
  ok: boolean;
}

// ============================================
// Result Types — canRun (Phase 5)
// ============================================

export interface CanRunResult {
  canRun: boolean;
  reason?: string;
  gate?: 'preceding' | 'transition' | 'serial' | 'inputs';
  inputPack: InputPack;
  blockingNodes?: string[];
  waitingForTransition?: boolean;
  waitingForSerial?: string;
}

// ============================================
// Result Types — Status API (Phase 5)
// ============================================

/** Full computed or stored status for a node. */
export type ExecutionStatus = 'pending' | 'ready' | NodeExecutionStatus; // 'running' | 'waiting-question' | 'blocked-error' | 'complete'

/**
 * DYK-I3: execution stays flat for display formatting compatibility.
 */
export interface NodeStatusResult {
  nodeId: string;
  unitSlug: string;
  execution: Execution;
  lineId: string;
  position: number;

  /** Current state (computed or stored). */
  status: ExecutionStatus;

  /** Readiness detail — always computed, even for running/complete nodes. */
  ready: boolean;
  readyDetail: {
    precedingLinesComplete: boolean;
    transitionOpen: boolean;
    serialNeighborComplete: boolean;
    inputsAvailable: boolean;
    unitFound: boolean;
    reason?: string;
  };

  /** Input resolution (always resolved). */
  inputPack: InputPack;

  /**
   * Present when status is 'waiting-question'.
   * Populated by execution lifecycle (Phase 6+).
   */
  pendingQuestion?: {
    questionId: string;
    text: string;
    questionType: 'text' | 'single' | 'multi' | 'confirm';
    options?: { key: string; label: string }[];
    askedAt: string;
  };

  /**
   * Present when status is 'blocked-error'.
   * Populated by execution lifecycle (Phase 6+).
   */
  error?: {
    code: string;
    message: string;
    occurredAt: string;
  };

  startedAt?: string;
  completedAt?: string;
}

/** A chain-starter is position 0, or any parallel node that breaks a serial chain. */
export interface StarterReadiness {
  nodeId: string;
  position: number;
  ready: boolean;
  reason?: string;
}

/**
 * DYK-I3: transition stays flat for display formatting compatibility.
 */
export interface LineStatusResult {
  lineId: string;
  label?: string;
  index: number;
  transition: TransitionMode;
  transitionTriggered: boolean;

  complete: boolean;
  empty: boolean;

  canRun: boolean;
  precedingLinesComplete: boolean;
  transitionOpen: boolean;
  starterNodes: StarterReadiness[];

  nodes: NodeStatusResult[];

  readyNodes: string[];
  runningNodes: string[];
  waitingQuestionNodes: string[];
  blockedNodes: string[];
  completedNodes: string[];
}

export interface GraphStatusResult {
  graphSlug: string;
  version: string;
  description?: string;

  status: 'pending' | 'in_progress' | 'complete' | 'failed';
  totalNodes: number;
  completedNodes: number;

  lines: LineStatusResult[];

  readyNodes: string[];
  runningNodes: string[];
  waitingQuestionNodes: string[];
  blockedNodes: string[];
  completedNodeIds: string[];
}

// ============================================
// Result Types — Output Storage (Phase 2, Plan 028)
// ============================================

/** Result from saveOutputData */
export interface SaveOutputDataResult extends BaseResult {
  nodeId?: string;
  outputName?: string;
  saved: boolean;
}

/** Result from saveOutputFile */
export interface SaveOutputFileResult extends BaseResult {
  nodeId?: string;
  outputName?: string;
  saved: boolean;
  /** Relative path where file was stored (relative to node dir) */
  filePath?: string;
}

/** Result from getOutputData */
export interface GetOutputDataResult extends BaseResult {
  nodeId?: string;
  outputName?: string;
  value?: unknown;
}

/** Result from getOutputFile */
export interface GetOutputFileResult extends BaseResult {
  nodeId?: string;
  outputName?: string;
  /** Absolute path to the stored file */
  filePath?: string;
}

// ============================================
// Service Interface
// ============================================

export interface IPositionalGraphService {
  // Graph CRUD
  create(ctx: WorkspaceContext, slug: string): Promise<GraphCreateResult>;
  load(ctx: WorkspaceContext, slug: string): Promise<PGLoadResult>;
  show(ctx: WorkspaceContext, slug: string): Promise<PGShowResult>;
  delete(ctx: WorkspaceContext, slug: string): Promise<BaseResult>;
  list(ctx: WorkspaceContext): Promise<PGListResult>;

  // Line operations
  addLine(
    ctx: WorkspaceContext,
    graphSlug: string,
    options?: AddLineOptions
  ): Promise<AddLineResult>;
  removeLine(ctx: WorkspaceContext, graphSlug: string, lineId: string): Promise<BaseResult>;
  moveLine(
    ctx: WorkspaceContext,
    graphSlug: string,
    lineId: string,
    toIndex: number
  ): Promise<BaseResult>;
  setLineLabel(
    ctx: WorkspaceContext,
    graphSlug: string,
    lineId: string,
    label: string
  ): Promise<BaseResult>;
  setLineDescription(
    ctx: WorkspaceContext,
    graphSlug: string,
    lineId: string,
    description: string
  ): Promise<BaseResult>;

  // Node operations (Phase 4)
  addNode(
    ctx: WorkspaceContext,
    graphSlug: string,
    lineId: string,
    unitSlug: string,
    options?: AddNodeOptions
  ): Promise<AddNodeResult>;
  removeNode(ctx: WorkspaceContext, graphSlug: string, nodeId: string): Promise<BaseResult>;
  moveNode(
    ctx: WorkspaceContext,
    graphSlug: string,
    nodeId: string,
    options: MoveNodeOptions
  ): Promise<BaseResult>;
  setNodeDescription(
    ctx: WorkspaceContext,
    graphSlug: string,
    nodeId: string,
    description: string
  ): Promise<BaseResult>;
  showNode(ctx: WorkspaceContext, graphSlug: string, nodeId: string): Promise<NodeShowResult>;

  // Input wiring (Phase 5)
  setInput(
    ctx: WorkspaceContext,
    graphSlug: string,
    nodeId: string,
    inputName: string,
    source: InputResolution
  ): Promise<BaseResult>;
  removeInput(
    ctx: WorkspaceContext,
    graphSlug: string,
    nodeId: string,
    inputName: string
  ): Promise<BaseResult>;

  // Input resolution (Phase 5)
  collateInputs(ctx: WorkspaceContext, graphSlug: string, nodeId: string): Promise<InputPack>;

  // Status API (Phase 5)
  getNodeStatus(
    ctx: WorkspaceContext,
    graphSlug: string,
    nodeId: string
  ): Promise<NodeStatusResult>;
  getLineStatus(
    ctx: WorkspaceContext,
    graphSlug: string,
    lineId: string
  ): Promise<LineStatusResult>;
  getStatus(ctx: WorkspaceContext, graphSlug: string): Promise<GraphStatusResult>;

  // Transition control (Phase 5)
  triggerTransition(ctx: WorkspaceContext, graphSlug: string, lineId: string): Promise<BaseResult>;

  // Properties & Orchestrator Settings (Subtask 001)
  updateGraphProperties(
    ctx: WorkspaceContext,
    graphSlug: string,
    properties: Partial<GraphProperties>
  ): Promise<BaseResult>;
  updateLineProperties(
    ctx: WorkspaceContext,
    graphSlug: string,
    lineId: string,
    properties: Partial<LineProperties>
  ): Promise<BaseResult>;
  updateNodeProperties(
    ctx: WorkspaceContext,
    graphSlug: string,
    nodeId: string,
    properties: Partial<NodeProperties>
  ): Promise<BaseResult>;
  updateGraphOrchestratorSettings(
    ctx: WorkspaceContext,
    graphSlug: string,
    settings: Partial<GraphOrchestratorSettings>
  ): Promise<BaseResult>;
  updateLineOrchestratorSettings(
    ctx: WorkspaceContext,
    graphSlug: string,
    lineId: string,
    settings: Partial<LineOrchestratorSettings>
  ): Promise<BaseResult>;
  updateNodeOrchestratorSettings(
    ctx: WorkspaceContext,
    graphSlug: string,
    nodeId: string,
    settings: Partial<NodeOrchestratorSettings>
  ): Promise<BaseResult>;

  // Output Storage (Phase 2, Plan 028)
  saveOutputData(
    ctx: WorkspaceContext,
    graphSlug: string,
    nodeId: string,
    outputName: string,
    value: unknown
  ): Promise<SaveOutputDataResult>;
  saveOutputFile(
    ctx: WorkspaceContext,
    graphSlug: string,
    nodeId: string,
    outputName: string,
    sourcePath: string
  ): Promise<SaveOutputFileResult>;
  getOutputData(
    ctx: WorkspaceContext,
    graphSlug: string,
    nodeId: string,
    outputName: string
  ): Promise<GetOutputDataResult>;
  getOutputFile(
    ctx: WorkspaceContext,
    graphSlug: string,
    nodeId: string,
    outputName: string
  ): Promise<GetOutputFileResult>;
}
