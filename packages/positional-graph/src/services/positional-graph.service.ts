import type { BaseResult, IFileSystem, IPathResolver, IYamlParser } from '@chainglass/shared';
import type { WorkspaceContext } from '@chainglass/workflow';
import type { PositionalGraphAdapter } from '../adapter/positional-graph.adapter.js';
import {
  cannotRemoveLastLineError,
  duplicateNodeError,
  graphAlreadyExistsError,
  graphNotFoundError,
  invalidLineIndexError,
  invalidNodePositionError,
  lineNotEmptyError,
  lineNotFoundError,
  nodeNotFoundError,
  unitNotFoundError,
} from '../errors/index.js';
import type {
  AddLineOptions,
  AddLineResult,
  AddNodeOptions,
  AddNodeResult,
  GraphCreateResult,
  IPositionalGraphService,
  IWorkUnitLoader,
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
import type { Execution, InputResolution, NodeConfig } from '../schemas/index.js';
import { NodeConfigSchema } from '../schemas/index.js';
import { atomicWriteFile } from './atomic-file.js';
import { generateLineId, generateNodeId } from './id-generation.js';

export class PositionalGraphService implements IPositionalGraphService {
  constructor(
    private readonly fs: IFileSystem,
    private readonly pathResolver: IPathResolver,
    private readonly yamlParser: IYamlParser,
    private readonly adapter: PositionalGraphAdapter,
    private readonly workUnitLoader: IWorkUnitLoader
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

  /**
   * Per DYK-P4-I3: Rich return type — every node operation needs line context.
   * Searches all lines for a node ID and returns the line, line index, and node position.
   */
  private findNodeInGraph(
    definition: PositionalGraphDefinition,
    nodeId: string
  ): { lineIndex: number; line: LineDefinition; nodePositionInLine: number } | undefined {
    for (let lineIndex = 0; lineIndex < definition.lines.length; lineIndex++) {
      const line = definition.lines[lineIndex];
      const nodePositionInLine = line.nodes.indexOf(nodeId);
      if (nodePositionInLine !== -1) {
        return { lineIndex, line, nodePositionInLine };
      }
    }
    return undefined;
  }

  /**
   * Get the directory path for a node within a graph.
   * Convention: <graphDir>/nodes/<nodeId>/
   */
  private getNodeDir(ctx: WorkspaceContext, graphSlug: string, nodeId: string): string {
    const graphDir = this.adapter.getGraphDir(ctx, graphSlug);
    return this.pathResolver.join(graphDir, 'nodes', nodeId);
  }

  /**
   * Load and validate a node's configuration from node.yaml.
   * Returns discriminated union per Phase 3 pattern.
   */
  private async loadNodeConfig(
    ctx: WorkspaceContext,
    graphSlug: string,
    nodeId: string
  ): Promise<{ ok: true; config: NodeConfig } | { ok: false; errors: BaseResult['errors'] }> {
    const nodeDir = this.getNodeDir(ctx, graphSlug, nodeId);
    const nodePath = this.pathResolver.join(nodeDir, 'node.yaml');

    const exists = await this.fs.exists(nodePath);
    if (!exists) {
      return { ok: false, errors: [nodeNotFoundError(nodeId)] };
    }

    const content = await this.fs.readFile(nodePath);
    const parsed = this.yamlParser.parse(content, nodePath);
    const validated = NodeConfigSchema.safeParse(parsed);
    if (!validated.success) {
      return {
        ok: false,
        errors: [
          {
            code: 'E153',
            message: `Node '${nodeId}' has invalid config: ${validated.error.issues[0]?.message}`,
            action: 'Check the node.yaml file',
          },
        ],
      };
    }

    return { ok: true, config: validated.data };
  }

  /**
   * Persist a node's configuration to node.yaml.
   */
  private async persistNodeConfig(
    ctx: WorkspaceContext,
    graphSlug: string,
    nodeId: string,
    config: NodeConfig
  ): Promise<void> {
    const nodeDir = this.getNodeDir(ctx, graphSlug, nodeId);
    const nodePath = this.pathResolver.join(nodeDir, 'node.yaml');
    const yaml = this.yamlParser.stringify(config);
    await atomicWriteFile(this.fs, nodePath, yaml);
  }

  /**
   * Remove a node's directory and all its contents.
   */
  private async removeNodeDir(
    ctx: WorkspaceContext,
    graphSlug: string,
    nodeId: string
  ): Promise<void> {
    const nodeDir = this.getNodeDir(ctx, graphSlug, nodeId);
    const exists = await this.fs.exists(nodeDir);
    if (exists) {
      await this.fs.rmdir(nodeDir, { recursive: true });
    }
  }

  /**
   * Collect all node IDs across all lines in a graph definition.
   */
  private getAllNodeIds(definition: PositionalGraphDefinition): string[] {
    return definition.lines.flatMap((line) => line.nodes);
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
  // Node operations
  // ============================================

  async addNode(
    ctx: WorkspaceContext,
    graphSlug: string,
    lineId: string,
    unitSlug: string,
    options?: AddNodeOptions
  ): Promise<AddNodeResult> {
    const loaded = await this.loadGraphDefinition(ctx, graphSlug);
    if (!loaded.ok) {
      return { errors: loaded.errors };
    }

    const def = loaded.definition;
    const found = this.findLine(def, lineId);
    if (!found) {
      return { errors: [lineNotFoundError(lineId)] };
    }

    // Validate WorkUnit exists (invariant 7)
    const unitResult = await this.workUnitLoader.load(ctx, unitSlug);
    if (unitResult.errors.length > 0) {
      return { errors: [unitNotFoundError(unitSlug)] };
    }

    // Generate unique node ID
    const allNodeIds = this.getAllNodeIds(def);
    const nodeId = generateNodeId(unitSlug, allNodeIds);

    // Determine insertion position
    const position = options?.atPosition ?? found.line.nodes.length;
    if (position < 0 || position > found.line.nodes.length) {
      return { errors: [invalidNodePositionError(position, found.line.nodes.length)] };
    }

    // Create node directory and write node.yaml
    const nodeDir = this.getNodeDir(ctx, graphSlug, nodeId);
    await this.fs.mkdir(nodeDir, { recursive: true });

    const now = new Date().toISOString();
    const nodeConfig: import('../schemas/index.js').NodeConfig = {
      id: nodeId,
      unit_slug: unitSlug,
      execution: options?.execution ?? 'serial',
      created_at: now,
    };
    if (options?.description) {
      nodeConfig.description = options.description;
    }

    await this.persistNodeConfig(ctx, graphSlug, nodeId, nodeConfig);

    // Update graph.yaml — insert node ID into line's nodes array
    found.line.nodes.splice(position, 0, nodeId);
    await this.persistGraph(ctx, graphSlug, def);

    return { nodeId, lineId, position, errors: [] };
  }

  async removeNode(ctx: WorkspaceContext, graphSlug: string, nodeId: string): Promise<BaseResult> {
    const loaded = await this.loadGraphDefinition(ctx, graphSlug);
    if (!loaded.ok) {
      return { errors: loaded.errors };
    }

    const def = loaded.definition;
    const nodeLocation = this.findNodeInGraph(def, nodeId);
    if (!nodeLocation) {
      return { errors: [nodeNotFoundError(nodeId)] };
    }

    // Remove from line's nodes array
    nodeLocation.line.nodes.splice(nodeLocation.nodePositionInLine, 1);

    // Delete node directory
    await this.removeNodeDir(ctx, graphSlug, nodeId);

    // Persist updated graph
    await this.persistGraph(ctx, graphSlug, def);

    return { errors: [] };
  }

  async moveNode(
    ctx: WorkspaceContext,
    graphSlug: string,
    nodeId: string,
    options: MoveNodeOptions
  ): Promise<BaseResult> {
    const loaded = await this.loadGraphDefinition(ctx, graphSlug);
    if (!loaded.ok) {
      return { errors: loaded.errors };
    }

    const def = loaded.definition;
    const nodeLocation = this.findNodeInGraph(def, nodeId);
    if (!nodeLocation) {
      return { errors: [nodeNotFoundError(nodeId)] };
    }

    // Determine target line
    let targetLine: LineDefinition;
    if (options.toLineId) {
      const found = this.findLine(def, options.toLineId);
      if (!found) {
        return { errors: [lineNotFoundError(options.toLineId)] };
      }
      targetLine = found.line;
    } else {
      targetLine = nodeLocation.line;
    }

    // Remove from source line first
    nodeLocation.line.nodes.splice(nodeLocation.nodePositionInLine, 1);

    // Determine target position
    const targetPosition = options.toPosition ?? targetLine.nodes.length;
    if (targetPosition < 0 || targetPosition > targetLine.nodes.length) {
      return { errors: [invalidNodePositionError(targetPosition, targetLine.nodes.length)] };
    }

    // Insert into target line
    targetLine.nodes.splice(targetPosition, 0, nodeId);

    // Single persist
    await this.persistGraph(ctx, graphSlug, def);

    return { errors: [] };
  }

  async setNodeDescription(
    ctx: WorkspaceContext,
    graphSlug: string,
    nodeId: string,
    description: string
  ): Promise<BaseResult> {
    // Verify node exists in graph
    const loaded = await this.loadGraphDefinition(ctx, graphSlug);
    if (!loaded.ok) {
      return { errors: loaded.errors };
    }
    const nodeLocation = this.findNodeInGraph(loaded.definition, nodeId);
    if (!nodeLocation) {
      return { errors: [nodeNotFoundError(nodeId)] };
    }

    // Load, mutate, persist node config
    const nodeResult = await this.loadNodeConfig(ctx, graphSlug, nodeId);
    if (!nodeResult.ok) {
      return { errors: nodeResult.errors };
    }

    nodeResult.config.description = description;
    await this.persistNodeConfig(ctx, graphSlug, nodeId, nodeResult.config);

    return { errors: [] };
  }

  async setNodeExecution(
    ctx: WorkspaceContext,
    graphSlug: string,
    nodeId: string,
    execution: Execution
  ): Promise<BaseResult> {
    // Verify node exists in graph
    const loaded = await this.loadGraphDefinition(ctx, graphSlug);
    if (!loaded.ok) {
      return { errors: loaded.errors };
    }
    const nodeLocation = this.findNodeInGraph(loaded.definition, nodeId);
    if (!nodeLocation) {
      return { errors: [nodeNotFoundError(nodeId)] };
    }

    // Load, mutate, persist node config
    const nodeResult = await this.loadNodeConfig(ctx, graphSlug, nodeId);
    if (!nodeResult.ok) {
      return { errors: nodeResult.errors };
    }

    nodeResult.config.execution = execution;
    await this.persistNodeConfig(ctx, graphSlug, nodeId, nodeResult.config);

    return { errors: [] };
  }

  async showNode(
    ctx: WorkspaceContext,
    graphSlug: string,
    nodeId: string
  ): Promise<NodeShowResult> {
    // Find node in graph structure
    const loaded = await this.loadGraphDefinition(ctx, graphSlug);
    if (!loaded.ok) {
      return { errors: loaded.errors };
    }
    const nodeLocation = this.findNodeInGraph(loaded.definition, nodeId);
    if (!nodeLocation) {
      return { errors: [nodeNotFoundError(nodeId)] };
    }

    // Load node config
    const nodeResult = await this.loadNodeConfig(ctx, graphSlug, nodeId);
    if (!nodeResult.ok) {
      return { errors: nodeResult.errors };
    }

    const config = nodeResult.config;
    return {
      nodeId: config.id,
      unitSlug: config.unit_slug,
      execution: config.execution,
      description: config.description,
      lineId: nodeLocation.line.id,
      position: nodeLocation.nodePositionInLine,
      inputs: config.inputs,
      errors: [],
    };
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
