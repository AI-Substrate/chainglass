/**
 * FakeWorkGraphService for testing.
 *
 * Per Discovery 08: Fakes need call capture for CLI testing.
 * This fake captures all create(), load(), show(), status(), addNodeAfter(),
 * removeNode() calls for test assertions and can be configured with preset results.
 * Per Plan 021: All methods accept WorkspaceContext as first parameter (ignored by fake).
 */

import type { WorkspaceContext } from '@chainglass/workflow';

import type {
  AddNodeOptions,
  AddNodeResult,
  AddUnconnectedNodeResult,
  GraphCreateResult,
  GraphLoadResult,
  GraphShowResult,
  GraphStatusResult,
  IWorkGraphService,
  InputMapping,
  RemoveNodeOptions,
  RemoveNodeResult,
} from '../interfaces/index.js';

// ============================================
// Call Types (with ctx for workspace tracking)
// ============================================

export interface GraphCreateCall {
  ctx: WorkspaceContext;
  slug: string;
  timestamp: string;
  result: GraphCreateResult;
}

export interface GraphLoadCall {
  ctx: WorkspaceContext;
  slug: string;
  timestamp: string;
  result: GraphLoadResult;
}

export interface GraphShowCall {
  ctx: WorkspaceContext;
  slug: string;
  timestamp: string;
  result: GraphShowResult;
}

export interface GraphStatusCall {
  ctx: WorkspaceContext;
  slug: string;
  timestamp: string;
  result: GraphStatusResult;
}

export interface AddNodeAfterCall {
  ctx: WorkspaceContext;
  graphSlug: string;
  afterNodeId: string;
  unitSlug: string;
  options?: AddNodeOptions;
  timestamp: string;
  result: AddNodeResult;
}

export interface RemoveNodeCall {
  ctx: WorkspaceContext;
  graphSlug: string;
  nodeId: string;
  options?: RemoveNodeOptions;
  timestamp: string;
  result: RemoveNodeResult;
}

export interface CanConnectCall {
  ctx: WorkspaceContext;
  graphSlug: string;
  sourceNodeId: string;
  sourceOutput: string;
  targetNodeId: string;
  targetInput: string;
  timestamp: string;
  result: import('../interfaces/index.js').CanConnectResult;
}

// ============================================
// Fake Implementation
// ============================================

/**
 * Fake WorkGraph service for testing.
 * Uses composite keys (worktreePath|slug) for workspace isolation.
 */
export class FakeWorkGraphService implements IWorkGraphService {
  private createCalls: GraphCreateCall[] = [];
  private loadCalls: GraphLoadCall[] = [];
  private showCalls: GraphShowCall[] = [];
  private statusCalls: GraphStatusCall[] = [];
  private addNodeAfterCalls: AddNodeAfterCall[] = [];
  private removeNodeCalls: RemoveNodeCall[] = [];
  private canConnectCalls: CanConnectCall[] = [];

  private presetCreateResults = new Map<string, GraphCreateResult>();
  private presetLoadResults = new Map<string, GraphLoadResult>();
  private presetShowResults = new Map<string, GraphShowResult>();
  private presetStatusResults = new Map<string, GraphStatusResult>();
  private presetAddNodeResults = new Map<string, AddNodeResult>();
  private presetRemoveNodeResults = new Map<string, RemoveNodeResult>();
  private presetCanConnectResults = new Map<
    string,
    import('../interfaces/index.js').CanConnectResult
  >();

  // ==================== Key Helper ====================

  private getKey(ctx: WorkspaceContext, ...parts: string[]): string {
    if (!ctx?.worktreePath) {
      throw new Error('FakeWorkGraphService: ctx.worktreePath is required for key generation');
    }
    return `${ctx.worktreePath}|${parts.filter(Boolean).join(':')}`;
  }

  // ==================== Create ====================

  getCreateCalls(): GraphCreateCall[] {
    return [...this.createCalls];
  }

  getLastCreateCall(): GraphCreateCall | null {
    return this.createCalls.length > 0 ? this.createCalls[this.createCalls.length - 1] : null;
  }

  setPresetCreateResult(ctx: WorkspaceContext, slug: string, result: GraphCreateResult): void {
    this.presetCreateResults.set(this.getKey(ctx, slug), result);
  }

  async create(ctx: WorkspaceContext, slug: string): Promise<GraphCreateResult> {
    const key = this.getKey(ctx, slug);
    const result = this.presetCreateResults.get(key) ?? {
      graphSlug: slug,
      path: `.chainglass/data/work-graphs/${slug}`,
      errors: [],
    };

    this.createCalls.push({
      ctx,
      slug,
      timestamp: new Date().toISOString(),
      result,
    });

    return result;
  }

  // ==================== Load ====================

  getLoadCalls(): GraphLoadCall[] {
    return [...this.loadCalls];
  }

  getLastLoadCall(): GraphLoadCall | null {
    return this.loadCalls.length > 0 ? this.loadCalls[this.loadCalls.length - 1] : null;
  }

  setPresetLoadResult(ctx: WorkspaceContext, slug: string, result: GraphLoadResult): void {
    this.presetLoadResults.set(this.getKey(ctx, slug), result);
  }

  async load(ctx: WorkspaceContext, slug: string): Promise<GraphLoadResult> {
    const key = this.getKey(ctx, slug);
    const result = this.presetLoadResults.get(key) ?? {
      graph: undefined,
      status: undefined,
      errors: [
        {
          code: 'E101',
          message: `Graph '${slug}' not found`,
          action: `Create the graph with: cg wg create ${slug}`,
        },
      ],
    };

    this.loadCalls.push({
      ctx,
      slug,
      timestamp: new Date().toISOString(),
      result,
    });

    return result;
  }

  // ==================== Show ====================

  getShowCalls(): GraphShowCall[] {
    return [...this.showCalls];
  }

  getLastShowCall(): GraphShowCall | null {
    return this.showCalls.length > 0 ? this.showCalls[this.showCalls.length - 1] : null;
  }

  setPresetShowResult(ctx: WorkspaceContext, slug: string, result: GraphShowResult): void {
    this.presetShowResults.set(this.getKey(ctx, slug), result);
  }

  async show(ctx: WorkspaceContext, slug: string): Promise<GraphShowResult> {
    const key = this.getKey(ctx, slug);
    const result = this.presetShowResults.get(key) ?? {
      graphSlug: slug,
      tree: { id: 'start', children: [] },
      errors: [],
    };

    this.showCalls.push({
      ctx,
      slug,
      timestamp: new Date().toISOString(),
      result,
    });

    return result;
  }

  // ==================== Status ====================

  getStatusCalls(): GraphStatusCall[] {
    return [...this.statusCalls];
  }

  getLastStatusCall(): GraphStatusCall | null {
    return this.statusCalls.length > 0 ? this.statusCalls[this.statusCalls.length - 1] : null;
  }

  setPresetStatusResult(ctx: WorkspaceContext, slug: string, result: GraphStatusResult): void {
    this.presetStatusResults.set(this.getKey(ctx, slug), result);
  }

  async status(ctx: WorkspaceContext, slug: string): Promise<GraphStatusResult> {
    const key = this.getKey(ctx, slug);
    const result = this.presetStatusResults.get(key) ?? {
      graphSlug: slug,
      graphStatus: 'pending',
      nodes: [],
      errors: [],
    };

    this.statusCalls.push({
      ctx,
      slug,
      timestamp: new Date().toISOString(),
      result,
    });

    return result;
  }

  // ==================== AddNodeAfter ====================

  getAddNodeAfterCalls(): AddNodeAfterCall[] {
    return [...this.addNodeAfterCalls];
  }

  getLastAddNodeAfterCall(): AddNodeAfterCall | null {
    return this.addNodeAfterCalls.length > 0
      ? this.addNodeAfterCalls[this.addNodeAfterCalls.length - 1]
      : null;
  }

  setPresetAddNodeResult(
    ctx: WorkspaceContext,
    graphSlug: string,
    afterNodeId: string,
    unitSlug: string,
    result: AddNodeResult
  ): void {
    this.presetAddNodeResults.set(this.getKey(ctx, graphSlug, afterNodeId, unitSlug), result);
  }

  async addNodeAfter(
    ctx: WorkspaceContext,
    graphSlug: string,
    afterNodeId: string,
    unitSlug: string,
    options?: AddNodeOptions
  ): Promise<AddNodeResult> {
    const key = this.getKey(ctx, graphSlug, afterNodeId, unitSlug);
    const nodeId = `${unitSlug}-${Math.random().toString(16).slice(2, 5)}`;
    const inputs: Record<string, InputMapping> = {};

    const result = this.presetAddNodeResults.get(key) ?? {
      nodeId,
      inputs,
      errors: [],
    };

    this.addNodeAfterCalls.push({
      ctx,
      graphSlug,
      afterNodeId,
      unitSlug,
      options,
      timestamp: new Date().toISOString(),
      result,
    });

    return result;
  }

  // ==================== RemoveNode ====================

  getRemoveNodeCalls(): RemoveNodeCall[] {
    return [...this.removeNodeCalls];
  }

  getLastRemoveNodeCall(): RemoveNodeCall | null {
    return this.removeNodeCalls.length > 0
      ? this.removeNodeCalls[this.removeNodeCalls.length - 1]
      : null;
  }

  setPresetRemoveNodeResult(
    ctx: WorkspaceContext,
    graphSlug: string,
    nodeId: string,
    result: RemoveNodeResult
  ): void {
    this.presetRemoveNodeResults.set(this.getKey(ctx, graphSlug, nodeId), result);
  }

  async removeNode(
    ctx: WorkspaceContext,
    graphSlug: string,
    nodeId: string,
    options?: RemoveNodeOptions
  ): Promise<RemoveNodeResult> {
    const key = this.getKey(ctx, graphSlug, nodeId);

    const result = this.presetRemoveNodeResults.get(key) ?? {
      removedNodes: [nodeId],
      errors: [],
    };

    this.removeNodeCalls.push({
      ctx,
      graphSlug,
      nodeId,
      options,
      timestamp: new Date().toISOString(),
      result,
    });

    return result;
  }

  // ==================== CanConnect ====================

  getCanConnectCalls(): CanConnectCall[] {
    return [...this.canConnectCalls];
  }

  getLastCanConnectCall(): CanConnectCall | null {
    return this.canConnectCalls.length > 0
      ? this.canConnectCalls[this.canConnectCalls.length - 1]
      : null;
  }

  setPresetCanConnectResult(
    ctx: WorkspaceContext,
    graphSlug: string,
    sourceNodeId: string,
    targetNodeId: string,
    result: import('../interfaces/index.js').CanConnectResult
  ): void {
    this.presetCanConnectResults.set(
      this.getKey(ctx, graphSlug, sourceNodeId, targetNodeId),
      result
    );
  }

  async canConnect(
    ctx: WorkspaceContext,
    graphSlug: string,
    sourceNodeId: string,
    sourceOutput: string,
    targetNodeId: string,
    targetInput: string
  ): Promise<import('../interfaces/index.js').CanConnectResult> {
    const key = this.getKey(ctx, graphSlug, sourceNodeId, targetNodeId);

    const result = this.presetCanConnectResults.get(key) ?? {
      valid: true,
      errors: [],
    };

    this.canConnectCalls.push({
      ctx,
      graphSlug,
      sourceNodeId,
      sourceOutput,
      targetNodeId,
      targetInput,
      timestamp: new Date().toISOString(),
      result,
    });

    return result;
  }

  // ==================== addUnconnectedNode ====================

  async addUnconnectedNode(
    ctx: WorkspaceContext,
    graphSlug: string,
    unitSlug: string
  ): Promise<AddUnconnectedNodeResult> {
    // Generate a simple node ID for testing
    const nodeId = `${unitSlug}-${Date.now()}`;
    return {
      nodeId,
      errors: [],
    };
  }

  // ==================== Reset ====================

  reset(): void {
    this.createCalls = [];
    this.loadCalls = [];
    this.showCalls = [];
    this.statusCalls = [];
    this.addNodeAfterCalls = [];
    this.removeNodeCalls = [];
    this.canConnectCalls = [];
    this.presetCreateResults.clear();
    this.presetLoadResults.clear();
    this.presetShowResults.clear();
    this.presetStatusResults.clear();
    this.presetAddNodeResults.clear();
    this.presetRemoveNodeResults.clear();
    this.presetCanConnectResults.clear();
  }
}
