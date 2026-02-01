import type { BaseResult, ResultError } from '@chainglass/shared';
import type { WorkspaceContext } from '@chainglass/workflow';
import type {
  Execution,
  InputResolution,
  PositionalGraphDefinition,
  TransitionMode,
} from '../schemas/index.js';

// ============================================
// Narrow Dependency Interfaces
// ============================================

/**
 * Narrow interface for WorkUnit existence validation.
 * Per DYK-P4-I2: avoids cross-package dependency on @chainglass/workgraph.
 * Host app wires the real WorkUnitService to satisfy this at DI level.
 */
export interface IWorkUnitLoader {
  load(ctx: WorkspaceContext, slug: string): Promise<{ unit?: unknown; errors: ResultError[] }>;
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
  transition?: TransitionMode;
}

// ============================================
// Result Types — Node Operations (Phase 4+)
// ============================================

export interface AddNodeOptions {
  atPosition?: number;
  description?: string;
  execution?: Execution;
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
  setLineTransition(
    ctx: WorkspaceContext,
    graphSlug: string,
    lineId: string,
    transition: TransitionMode
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
  setNodeExecution(
    ctx: WorkspaceContext,
    graphSlug: string,
    nodeId: string,
    execution: Execution
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
}
