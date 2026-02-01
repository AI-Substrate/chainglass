import type { BaseResult, IFileSystem, IPathResolver, IYamlParser } from '@chainglass/shared';
import type { WorkspaceContext } from '@chainglass/workflow';
import type { PositionalGraphAdapter } from '../adapter/positional-graph.adapter.js';
import {
  cannotRemoveLastLineError,
  graphAlreadyExistsError,
  graphNotFoundError,
  invalidLineIndexError,
  lineNotEmptyError,
  lineNotFoundError,
} from '../errors/index.js';
import type {
  AddLineOptions,
  AddLineResult,
  AddNodeOptions,
  AddNodeResult,
  GraphCreateResult,
  IPositionalGraphService,
  MoveNodeOptions,
  NodeShowResult,
  PGListResult,
  PGLoadResult,
  PGShowResult,
} from '../interfaces/index.js';
import {
  type LineDefinition,
  type PositionalGraphDefinition,
  PositionalGraphDefinitionSchema,
  type TransitionMode,
} from '../schemas/graph.schema.js';
import type { Execution, InputResolution } from '../schemas/index.js';
import { atomicWriteFile } from './atomic-file.js';
import { generateLineId } from './id-generation.js';

export class PositionalGraphService implements IPositionalGraphService {
  constructor(
    private readonly fs: IFileSystem,
    private readonly pathResolver: IPathResolver,
    private readonly yamlParser: IYamlParser,
    private readonly adapter: PositionalGraphAdapter
  ) {}

  // ============================================
  // Private helpers
  // ============================================

  /**
   * Per DYK-P3-I1: Private helper that loads raw graph definition.
   * Returns the definition or an error result — used by all mutation methods.
   */
  private async loadGraphDefinition(
    ctx: WorkspaceContext,
    slug: string
  ): Promise<
    | { ok: true; definition: PositionalGraphDefinition }
    | { ok: false; errors: BaseResult['errors'] }
  > {
    const graphDir = this.adapter.getGraphDir(ctx, slug);
    const graphYamlPath = this.pathResolver.join(graphDir, 'graph.yaml');

    const exists = await this.fs.exists(graphYamlPath);
    if (!exists) {
      return { ok: false, errors: [graphNotFoundError(slug)] };
    }

    const content = await this.fs.readFile(graphYamlPath);
    let parsed: unknown;
    try {
      parsed = this.yamlParser.parse(content, graphYamlPath);
    } catch {
      return {
        ok: false,
        errors: [
          {
            code: 'E157',
            message: `Failed to parse graph.yaml for '${slug}': invalid YAML`,
            action: 'Check the graph.yaml file for syntax errors',
          },
        ],
      };
    }

    const validated = PositionalGraphDefinitionSchema.safeParse(parsed);
    if (!validated.success) {
      return {
        ok: false,
        errors: [
          {
            code: 'E157',
            message: `Graph '${slug}' has invalid schema: ${validated.error.issues[0]?.message}`,
            action: 'Fix the graph.yaml file or delete and recreate the graph',
          },
        ],
      };
    }

    return { ok: true, definition: validated.data };
  }

  private async persistGraph(
    ctx: WorkspaceContext,
    slug: string,
    definition: PositionalGraphDefinition
  ): Promise<void> {
    const graphDir = this.adapter.getGraphDir(ctx, slug);
    const graphYamlPath = this.pathResolver.join(graphDir, 'graph.yaml');
    const yaml = this.yamlParser.stringify(definition);
    await atomicWriteFile(this.fs, graphYamlPath, yaml);
  }

  private findLine(
    definition: PositionalGraphDefinition,
    lineId: string
  ): { line: LineDefinition; index: number } | undefined {
    const index = definition.lines.findIndex((l) => l.id === lineId);
    if (index === -1) return undefined;
    return { line: definition.lines[index], index };
  }

  // ============================================
  // Graph CRUD
  // ============================================

  async create(ctx: WorkspaceContext, slug: string): Promise<GraphCreateResult> {
    const exists = await this.adapter.graphExists(ctx, slug);
    if (exists) {
      return { graphSlug: '', lineId: '', errors: [graphAlreadyExistsError(slug)] };
    }

    await this.adapter.ensureGraphDir(ctx, slug);

    const lineId = generateLineId([]);
    const now = new Date().toISOString();

    const definition: PositionalGraphDefinition = {
      slug,
      version: '0.1.0',
      created_at: now,
      lines: [{ id: lineId, transition: 'auto', nodes: [] }],
    };

    await this.persistGraph(ctx, slug, definition);

    // Write state.json
    const graphDir = this.adapter.getGraphDir(ctx, slug);
    const statePath = this.pathResolver.join(graphDir, 'state.json');
    const state = {
      graph_status: 'pending',
      updated_at: now,
      nodes: {},
      transitions: {},
    };
    await atomicWriteFile(this.fs, statePath, JSON.stringify(state, null, 2));

    return { graphSlug: slug, lineId, errors: [] };
  }

  async load(ctx: WorkspaceContext, slug: string): Promise<PGLoadResult> {
    const result = await this.loadGraphDefinition(ctx, slug);
    if (!result.ok) {
      return { errors: result.errors };
    }
    return { definition: result.definition, errors: [] };
  }

  async show(ctx: WorkspaceContext, slug: string): Promise<PGShowResult> {
    const result = await this.loadGraphDefinition(ctx, slug);
    if (!result.ok) {
      return { errors: result.errors };
    }

    const def = result.definition;
    let totalNodeCount = 0;
    const lines = def.lines.map((line) => {
      totalNodeCount += line.nodes.length;
      return {
        id: line.id,
        label: line.label,
        description: line.description,
        transition: line.transition,
        nodeCount: line.nodes.length,
      };
    });

    return {
      slug: def.slug,
      version: def.version,
      description: def.description,
      createdAt: def.created_at,
      lines,
      totalNodeCount,
      errors: [],
    };
  }

  async delete(ctx: WorkspaceContext, slug: string): Promise<BaseResult> {
    await this.adapter.removeGraph(ctx, slug);
    return { errors: [] };
  }

  async list(ctx: WorkspaceContext): Promise<PGListResult> {
    const slugs = await this.adapter.listGraphSlugs(ctx);
    return { slugs, errors: [] };
  }

  // ============================================
  // Line operations
  // ============================================

  async addLine(
    ctx: WorkspaceContext,
    graphSlug: string,
    options?: AddLineOptions
  ): Promise<AddLineResult> {
    // DYK-P3-I3: Mutual exclusivity guard
    const positioningOptions = [
      options?.afterLineId,
      options?.beforeLineId,
      options?.atIndex !== undefined ? options.atIndex : undefined,
    ].filter((v) => v !== undefined);
    if (positioningOptions.length > 1) {
      return {
        errors: [
          {
            code: 'E152',
            message:
              'Conflicting positioning options — provide at most one of afterLineId, beforeLineId, atIndex',
            action: 'Use only one positioning option',
          },
        ],
      };
    }

    const loaded = await this.loadGraphDefinition(ctx, graphSlug);
    if (!loaded.ok) {
      return { errors: loaded.errors };
    }

    const def = loaded.definition;
    const existingIds = def.lines.map((l) => l.id);
    const lineId = generateLineId(existingIds);

    const newLine: LineDefinition = {
      id: lineId,
      transition: options?.transition ?? 'auto',
      nodes: [],
    };
    if (options?.label) newLine.label = options.label;
    if (options?.description) newLine.description = options.description;

    // Determine insertion index
    let insertIndex = def.lines.length; // default: append

    if (options?.atIndex !== undefined) {
      if (options.atIndex < 0 || options.atIndex > def.lines.length) {
        return {
          errors: [invalidLineIndexError(options.atIndex, def.lines.length)],
        };
      }
      insertIndex = options.atIndex;
    } else if (options?.afterLineId) {
      const found = this.findLine(def, options.afterLineId);
      if (!found) {
        return { errors: [lineNotFoundError(options.afterLineId)] };
      }
      insertIndex = found.index + 1;
    } else if (options?.beforeLineId) {
      const found = this.findLine(def, options.beforeLineId);
      if (!found) {
        return { errors: [lineNotFoundError(options.beforeLineId)] };
      }
      insertIndex = found.index;
    }

    def.lines.splice(insertIndex, 0, newLine);
    await this.persistGraph(ctx, graphSlug, def);

    return { lineId, index: insertIndex, errors: [] };
  }

  async removeLine(ctx: WorkspaceContext, graphSlug: string, lineId: string): Promise<BaseResult> {
    const loaded = await this.loadGraphDefinition(ctx, graphSlug);
    if (!loaded.ok) {
      return { errors: loaded.errors };
    }

    const def = loaded.definition;
    const found = this.findLine(def, lineId);
    if (!found) {
      return { errors: [lineNotFoundError(lineId)] };
    }

    // E156: Cannot remove last line
    if (def.lines.length === 1) {
      return { errors: [cannotRemoveLastLineError()] };
    }

    // E151: Line must be empty (DYK-P3-I4: no cascade)
    if (found.line.nodes.length > 0) {
      return { errors: [lineNotEmptyError(lineId, found.line.nodes)] };
    }

    def.lines.splice(found.index, 1);
    await this.persistGraph(ctx, graphSlug, def);

    return { errors: [] };
  }

  async moveLine(
    ctx: WorkspaceContext,
    graphSlug: string,
    lineId: string,
    toIndex: number
  ): Promise<BaseResult> {
    const loaded = await this.loadGraphDefinition(ctx, graphSlug);
    if (!loaded.ok) {
      return { errors: loaded.errors };
    }

    const def = loaded.definition;
    const found = this.findLine(def, lineId);
    if (!found) {
      return { errors: [lineNotFoundError(lineId)] };
    }

    if (toIndex < 0 || toIndex >= def.lines.length) {
      return { errors: [invalidLineIndexError(toIndex, def.lines.length - 1)] };
    }

    // Remove from current position and insert at new position
    def.lines.splice(found.index, 1);
    def.lines.splice(toIndex, 0, found.line);
    await this.persistGraph(ctx, graphSlug, def);

    return { errors: [] };
  }

  async setLineTransition(
    ctx: WorkspaceContext,
    graphSlug: string,
    lineId: string,
    transition: TransitionMode
  ): Promise<BaseResult> {
    const loaded = await this.loadGraphDefinition(ctx, graphSlug);
    if (!loaded.ok) {
      return { errors: loaded.errors };
    }

    const def = loaded.definition;
    const found = this.findLine(def, lineId);
    if (!found) {
      return { errors: [lineNotFoundError(lineId)] };
    }

    found.line.transition = transition;
    await this.persistGraph(ctx, graphSlug, def);

    return { errors: [] };
  }

  async setLineLabel(
    ctx: WorkspaceContext,
    graphSlug: string,
    lineId: string,
    label: string
  ): Promise<BaseResult> {
    const loaded = await this.loadGraphDefinition(ctx, graphSlug);
    if (!loaded.ok) {
      return { errors: loaded.errors };
    }

    const def = loaded.definition;
    const found = this.findLine(def, lineId);
    if (!found) {
      return { errors: [lineNotFoundError(lineId)] };
    }

    found.line.label = label;
    await this.persistGraph(ctx, graphSlug, def);

    return { errors: [] };
  }

  async setLineDescription(
    ctx: WorkspaceContext,
    graphSlug: string,
    lineId: string,
    description: string
  ): Promise<BaseResult> {
    const loaded = await this.loadGraphDefinition(ctx, graphSlug);
    if (!loaded.ok) {
      return { errors: loaded.errors };
    }

    const def = loaded.definition;
    const found = this.findLine(def, lineId);
    if (!found) {
      return { errors: [lineNotFoundError(lineId)] };
    }

    found.line.description = description;
    await this.persistGraph(ctx, graphSlug, def);

    return { errors: [] };
  }

  // ============================================
  // Node operations — Phase 4 stubs
  // ============================================

  async addNode(
    _ctx: WorkspaceContext,
    _graphSlug: string,
    _lineId: string,
    _unitSlug: string,
    _options?: AddNodeOptions
  ): Promise<AddNodeResult> {
    throw new Error('Not implemented — Phase 4');
  }

  async removeNode(
    _ctx: WorkspaceContext,
    _graphSlug: string,
    _nodeId: string
  ): Promise<BaseResult> {
    throw new Error('Not implemented — Phase 4');
  }

  async moveNode(
    _ctx: WorkspaceContext,
    _graphSlug: string,
    _nodeId: string,
    _options: MoveNodeOptions
  ): Promise<BaseResult> {
    throw new Error('Not implemented — Phase 4');
  }

  async setNodeDescription(
    _ctx: WorkspaceContext,
    _graphSlug: string,
    _nodeId: string,
    _description: string
  ): Promise<BaseResult> {
    throw new Error('Not implemented — Phase 4');
  }

  async setNodeExecution(
    _ctx: WorkspaceContext,
    _graphSlug: string,
    _nodeId: string,
    _execution: Execution
  ): Promise<BaseResult> {
    throw new Error('Not implemented — Phase 4');
  }

  async showNode(
    _ctx: WorkspaceContext,
    _graphSlug: string,
    _nodeId: string
  ): Promise<NodeShowResult> {
    throw new Error('Not implemented — Phase 4');
  }

  // ============================================
  // Input wiring — Phase 5 stubs
  // ============================================

  async setInput(
    _ctx: WorkspaceContext,
    _graphSlug: string,
    _nodeId: string,
    _inputName: string,
    _source: InputResolution
  ): Promise<BaseResult> {
    throw new Error('Not implemented — Phase 5');
  }

  async removeInput(
    _ctx: WorkspaceContext,
    _graphSlug: string,
    _nodeId: string,
    _inputName: string
  ): Promise<BaseResult> {
    throw new Error('Not implemented — Phase 5');
  }
}
