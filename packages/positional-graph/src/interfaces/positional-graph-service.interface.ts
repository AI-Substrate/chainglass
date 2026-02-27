import type { BaseResult, ResultError } from '@chainglass/shared';
import type { WorkspaceContext } from '@chainglass/workflow';
import type { EventSource, NodeEvent } from '../features/032-node-event-system/index.js';
import type { InspectResult } from '../features/040-graph-inspect/index.js';
import type {
  Execution,
  GraphOrchestratorSettings,
  GraphProperties,
  InputResolution,
  LineOrchestratorSettings,
  LineProperties,
  NodeConfig,
  NodeExecutionStatus,
  NodeOrchestratorSettings,
  NodeProperties,
  PositionalGraphDefinition,
  State,
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
  type: 'agent' | 'code' | 'user-input';
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
  gate?: 'preceding' | 'transition' | 'serial' | 'contextFrom' | 'inputs';
  inputPack: InputPack;
  blockingNodes?: string[];
  waitingForTransition?: boolean;
  waitingForSerial?: string;
}

// ============================================
// Result Types — Status API (Phase 5)
// ============================================

/** Full computed or stored status for a node. */
export type ExecutionStatus = 'pending' | 'ready' | NodeExecutionStatus; // 'starting' | 'agent-accepted' | 'waiting-question' | 'blocked-error' | 'restart-pending' | 'complete'

/**
 * DYK-I3: execution stays flat for display formatting compatibility.
 */
export interface NodeStatusResult {
  nodeId: string;
  unitSlug: string;
  unitType: 'agent' | 'code' | 'user-input';
  execution: Execution;
  noContext?: boolean;
  contextFrom?: string;
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
    contextFromReady?: boolean;
    inputsAvailable: boolean;
    unitFound: boolean;
    reason?: string;
  };

  /** Input resolution (always resolved). */
  inputPack: InputPack;

  /**
   * Present when status is 'waiting-question'.
   * Populated by execution lifecycle (Phase 6+).
   * @deprecated Q&A protocol is scaffolding — not integrated into real agent execution. Human input is a web-layer concern (Plan 054).
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
// Result Types — Node Lifecycle (Phase 3, Plan 028)
// ============================================

/** Result from startNode */
export interface StartNodeResult extends BaseResult {
  nodeId?: string;
  status?: 'starting';
  startedAt?: string;
}

/** Result from canEnd */
export interface CanEndResult extends BaseResult {
  nodeId?: string;
  canEnd: boolean;
  savedOutputs: string[];
  missingOutputs: string[];
}

/** Result from endNode */
export interface EndNodeResult extends BaseResult {
  nodeId?: string;
  status?: 'complete';
  completedAt?: string;
}

// ============================================
// Result Types — Question/Answer Protocol (Phase 4, Plan 028)
// ============================================

/** Input options for askQuestion @deprecated Q&A protocol is scaffolding — not integrated into real agent execution. Human input collection is a web-layer concern. */
export interface AskQuestionOptions {
  type: 'text' | 'single' | 'multi' | 'confirm';
  text: string;
  options?: string[];
  default?: string | boolean;
}

/** Result from askQuestion @deprecated Q&A protocol is scaffolding — not integrated into real agent execution. */
export interface AskQuestionResult extends BaseResult {
  nodeId?: string;
  questionId?: string;
  status?: 'waiting-question';
}

/** Result from answerQuestion @deprecated Q&A protocol is scaffolding — not integrated into real agent execution. */
export interface AnswerQuestionResult extends BaseResult {
  nodeId?: string;
  questionId?: string;
  status?: 'waiting-question';
}

/** Result from getAnswer @deprecated Q&A protocol is scaffolding — not integrated into real agent execution. */
export interface GetAnswerResult extends BaseResult {
  nodeId?: string;
  questionId?: string;
  answered: boolean;
  answer?: unknown;
}

// ============================================
// Result Types — Node Event System (Phase 6, Plan 032)
// ============================================

/** Result from raiseNodeEvent — includes event with stamps after handleEvents */
export interface RaiseNodeEventResult extends BaseResult {
  nodeId?: string;
  event?: NodeEvent;
  /** Whether this event type stops execution (from registry metadata) */
  stopsExecution?: boolean;
}

/** Filter options for getNodeEvents */
export interface GetNodeEventsFilter {
  /** Return a single event by ID */
  eventId?: string;
  /** Filter by event type(s) */
  types?: string[];
  /** Filter by event status */
  status?: string;
}

/** Result from getNodeEvents */
export interface GetNodeEventsResult extends BaseResult {
  nodeId?: string;
  events?: NodeEvent[];
}

/** Result from stampNodeEvent */
export interface StampNodeEventResult extends BaseResult {
  nodeId?: string;
  eventId?: string;
  subscriber?: string;
  stamp?: { action: string; stamped_at: string; data?: Record<string, unknown> };
}

// ============================================
// Result Types — Input Retrieval (Phase 5, Plan 028)
// ============================================

/** A single resolved data source for an input. */
export interface InputDataSource {
  sourceNodeId: string;
  sourceOutput: string;
  value: unknown;
}

/** Result from getInputData */
export interface GetInputDataResult extends BaseResult {
  nodeId?: string;
  inputName?: string;
  /** All resolved sources (per Critical Insight #4: from_unit collects all matches) */
  sources?: InputDataSource[];
  /** True when all sources are complete; false if partial (per Insight #5) */
  complete?: boolean;
}

/** A single resolved file source for an input. */
export interface InputFileSource {
  sourceNodeId: string;
  sourceOutput: string;
  /** Absolute path to the file */
  filePath: string;
}

/** Result from getInputFile */
export interface GetInputFileResult extends BaseResult {
  nodeId?: string;
  inputName?: string;
  /** All resolved file sources (per Critical Insight #4: from_unit collects all matches) */
  sources?: InputFileSource[];
  /** True when all sources are complete; false if partial (per Insight #5) */
  complete?: boolean;
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

  // Inspect (Plan 040)
  inspectGraph(ctx: WorkspaceContext, graphSlug: string): Promise<InspectResult>;

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

  // Node Lifecycle (Phase 3, Plan 028)
  startNode(ctx: WorkspaceContext, graphSlug: string, nodeId: string): Promise<StartNodeResult>;
  canEnd(ctx: WorkspaceContext, graphSlug: string, nodeId: string): Promise<CanEndResult>;
  endNode(
    ctx: WorkspaceContext,
    graphSlug: string,
    nodeId: string,
    message?: string
  ): Promise<EndNodeResult>;

  // Question/Answer Protocol (Phase 4, Plan 028)
  // @deprecated Q&A protocol is scaffolding — not integrated into real agent execution.
  // Human input collection is a web-layer concern (Plan 054). These methods are only
  // called by CLI `cg wf node ask/answer` and the web's answerQuestion server action
  // (which answers pre-baked dope questions). No real agent calls askQuestion.
  /** @deprecated Use web-layer human input submission instead. */
  askQuestion(
    ctx: WorkspaceContext,
    graphSlug: string,
    nodeId: string,
    options: AskQuestionOptions
  ): Promise<AskQuestionResult>;
  /** @deprecated Use web-layer human input submission instead. */
  answerQuestion(
    ctx: WorkspaceContext,
    graphSlug: string,
    nodeId: string,
    questionId: string,
    answer: unknown
  ): Promise<AnswerQuestionResult>;
  /** @deprecated Use web-layer human input submission instead. */
  getAnswer(
    ctx: WorkspaceContext,
    graphSlug: string,
    nodeId: string,
    questionId: string
  ): Promise<GetAnswerResult>;

  // Input Retrieval (Phase 5, Plan 028)
  getInputData(
    ctx: WorkspaceContext,
    graphSlug: string,
    nodeId: string,
    inputName: string
  ): Promise<GetInputDataResult>;
  getInputFile(
    ctx: WorkspaceContext,
    graphSlug: string,
    nodeId: string,
    inputName: string
  ): Promise<GetInputFileResult>;

  // Node Event System (Phase 6, Plan 032)
  raiseNodeEvent(
    ctx: WorkspaceContext,
    graphSlug: string,
    nodeId: string,
    eventType: string,
    payload: Record<string, unknown>,
    source: EventSource
  ): Promise<RaiseNodeEventResult>;
  getNodeEvents(
    ctx: WorkspaceContext,
    graphSlug: string,
    nodeId: string,
    filter?: GetNodeEventsFilter
  ): Promise<GetNodeEventsResult>;
  stampNodeEvent(
    ctx: WorkspaceContext,
    graphSlug: string,
    nodeId: string,
    eventId: string,
    subscriber: string,
    action: string,
    data?: Record<string, unknown>
  ): Promise<StampNodeEventResult>;

  // State Access (Phase 8, Plan 032 — E2E support)
  loadGraphState(ctx: WorkspaceContext, graphSlug: string): Promise<State>;
  persistGraphState(ctx: WorkspaceContext, graphSlug: string, state: State): Promise<void>;

  // Snapshot Restore (Phase 5, Plan 050 — undo/redo support)
  restoreSnapshot(
    ctx: WorkspaceContext,
    graphSlug: string,
    definition: PositionalGraphDefinition,
    nodeConfigs: Record<string, NodeConfig>
  ): Promise<BaseResult>;

  /** Load all node configs for snapshot capture. */
  loadAllNodeConfigs(
    ctx: WorkspaceContext,
    graphSlug: string
  ): Promise<{
    nodeConfigs: Record<string, NodeConfig>;
    errors: import('@chainglass/shared').ResultError[];
  }>;
}
