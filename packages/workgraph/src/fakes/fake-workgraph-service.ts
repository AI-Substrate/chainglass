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
// Call Types
// ============================================

export interface GraphCreateCall {
  slug: string;
  timestamp: string;
  result: GraphCreateResult;
}

export interface GraphLoadCall {
  slug: string;
  timestamp: string;
  result: GraphLoadResult;
}

export interface GraphShowCall {
  slug: string;
  timestamp: string;
  result: GraphShowResult;
}

export interface GraphStatusCall {
  slug: string;
  timestamp: string;
  result: GraphStatusResult;
}

export interface AddNodeAfterCall {
  graphSlug: string;
  afterNodeId: string;
  unitSlug: string;
  options?: AddNodeOptions;
  timestamp: string;
  result: AddNodeResult;
}

export interface RemoveNodeCall {
  graphSlug: string;
  nodeId: string;
  options?: RemoveNodeOptions;
  timestamp: string;
  result: RemoveNodeResult;
}

// ============================================
// Fake Implementation
// ============================================

/**
 * Fake WorkGraph service for testing.
 */
export class FakeWorkGraphService implements IWorkGraphService {
  private createCalls: GraphCreateCall[] = [];
  private loadCalls: GraphLoadCall[] = [];
  private showCalls: GraphShowCall[] = [];
  private statusCalls: GraphStatusCall[] = [];
  private addNodeAfterCalls: AddNodeAfterCall[] = [];
  private removeNodeCalls: RemoveNodeCall[] = [];

  private presetCreateResults = new Map<string, GraphCreateResult>();
  private presetLoadResults = new Map<string, GraphLoadResult>();
  private presetShowResults = new Map<string, GraphShowResult>();
  private presetStatusResults = new Map<string, GraphStatusResult>();
  private presetAddNodeResults = new Map<string, AddNodeResult>();
  private presetRemoveNodeResults = new Map<string, RemoveNodeResult>();

  // ==================== Create ====================

  getCreateCalls(): GraphCreateCall[] {
    return [...this.createCalls];
  }

  getLastCreateCall(): GraphCreateCall | null {
    return this.createCalls.length > 0 ? this.createCalls[this.createCalls.length - 1] : null;
  }

  setPresetCreateResult(slug: string, result: GraphCreateResult): void {
    this.presetCreateResults.set(slug, result);
  }

  async create(_ctx: WorkspaceContext, slug: string): Promise<GraphCreateResult> {
    const result = this.presetCreateResults.get(slug) ?? {
      graphSlug: slug,
      path: `.chainglass/data/work-graphs/${slug}`,
      errors: [],
    };

    this.createCalls.push({
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

  setPresetLoadResult(slug: string, result: GraphLoadResult): void {
    this.presetLoadResults.set(slug, result);
  }

  async load(_ctx: WorkspaceContext, slug: string): Promise<GraphLoadResult> {
    const result = this.presetLoadResults.get(slug) ?? {
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

  setPresetShowResult(slug: string, result: GraphShowResult): void {
    this.presetShowResults.set(slug, result);
  }

  async show(_ctx: WorkspaceContext, slug: string): Promise<GraphShowResult> {
    const result = this.presetShowResults.get(slug) ?? {
      graphSlug: slug,
      tree: { id: 'start', children: [] },
      errors: [],
    };

    this.showCalls.push({
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

  setPresetStatusResult(slug: string, result: GraphStatusResult): void {
    this.presetStatusResults.set(slug, result);
  }

  async status(_ctx: WorkspaceContext, slug: string): Promise<GraphStatusResult> {
    const result = this.presetStatusResults.get(slug) ?? {
      graphSlug: slug,
      graphStatus: 'pending',
      nodes: [],
      errors: [],
    };

    this.statusCalls.push({
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

  setPresetAddNodeResult(key: string, result: AddNodeResult): void {
    this.presetAddNodeResults.set(key, result);
  }

  async addNodeAfter(
    _ctx: WorkspaceContext,
    graphSlug: string,
    afterNodeId: string,
    unitSlug: string,
    options?: AddNodeOptions
  ): Promise<AddNodeResult> {
    const key = `${graphSlug}:${afterNodeId}:${unitSlug}`;
    const nodeId = `${unitSlug}-${Math.random().toString(16).slice(2, 5)}`;
    const inputs: Record<string, InputMapping> = {};

    const result = this.presetAddNodeResults.get(key) ?? {
      nodeId,
      inputs,
      errors: [],
    };

    this.addNodeAfterCalls.push({
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

  setPresetRemoveNodeResult(key: string, result: RemoveNodeResult): void {
    this.presetRemoveNodeResults.set(key, result);
  }

  async removeNode(
    _ctx: WorkspaceContext,
    graphSlug: string,
    nodeId: string,
    options?: RemoveNodeOptions
  ): Promise<RemoveNodeResult> {
    const key = `${graphSlug}:${nodeId}`;

    const result = this.presetRemoveNodeResults.get(key) ?? {
      removedNodes: [nodeId],
      errors: [],
    };

    this.removeNodeCalls.push({
      graphSlug,
      nodeId,
      options,
      timestamp: new Date().toISOString(),
      result,
    });

    return result;
  }

  // ==================== Reset ====================

  reset(): void {
    this.createCalls = [];
    this.loadCalls = [];
    this.showCalls = [];
    this.statusCalls = [];
    this.addNodeAfterCalls = [];
    this.removeNodeCalls = [];
    this.presetCreateResults.clear();
    this.presetLoadResults.clear();
    this.presetShowResults.clear();
    this.presetStatusResults.clear();
    this.presetAddNodeResults.clear();
    this.presetRemoveNodeResults.clear();
  }
}
