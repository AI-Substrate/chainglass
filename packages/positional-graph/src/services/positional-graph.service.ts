import type { BaseResult, IFileSystem, IPathResolver, IYamlParser } from '@chainglass/shared';
import type { WorkspaceContext } from '@chainglass/workflow';
import type { PositionalGraphAdapter } from '../adapter/positional-graph.adapter.js';
import {
  cannotRemoveLastLineError,
  duplicateNodeError,
  fileNotFoundError,
  graphAlreadyExistsError,
  graphNotFoundError,
  inputNotAvailableError,
  inputNotDeclaredError,
  invalidLineIndexError,
  invalidNodePositionError,
  invalidStateTransitionError,
  lineNotEmptyError,
  lineNotFoundError,
  nodeNotFoundError,
  nodeNotRunningError,
  outputNotFoundError,
  unitNotFoundError,
} from '../errors/index.js';
import { canNodeDoWork, isNodeActive } from '../features/032-node-event-system/event-helpers.js';
import {
  NodeEventRegistry,
  NodeEventService,
  createEventHandlerRegistry,
  eventNotFoundError,
  registerCoreEventTypes,
} from '../features/032-node-event-system/index.js';
import type { EventSource, INodeEventService } from '../features/032-node-event-system/index.js';
import { buildInspectResult } from '../features/040-graph-inspect/index.js';
import type {
  AddLineOptions,
  AddLineResult,
  AddNodeOptions,
  AddNodeResult,
  CanEndResult,
  EndNodeResult,
  GetInputDataResult,
  GetInputFileResult,
  GetNodeEventsFilter,
  GetNodeEventsResult,
  GetOutputDataResult,
  GetOutputFileResult,
  GraphCreateResult,
  GraphStatusResult,
  IPositionalGraphService,
  IWorkUnitLoader,
  InputPack,
  LineStatusResult,
  MoveNodeOptions,
  NodeShowResult,
  NodeStatusResult,
  PGListResult,
  PGLoadResult,
  PGShowResult,
  RaiseNodeEventResult,
  SaveOutputDataResult,
  SaveOutputFileResult,
  StampNodeEventResult,
  StartNodeResult,
} from '../interfaces/index.js';
import {
  type LineDefinition,
  type PositionalGraphDefinition,
  PositionalGraphDefinitionSchema,
} from '../schemas/graph.schema.js';
import type {
  GraphOrchestratorSettings,
  GraphProperties,
  InputResolution,
  LineOrchestratorSettings,
  LineProperties,
  NodeConfig,
  NodeExecutionStatus,
  NodeOrchestratorSettings,
  NodeProperties,
  NodeStateEntry,
  Question,
  State,
} from '../schemas/index.js';
import {
  GraphOrchestratorSettingsSchema,
  LineOrchestratorSettingsSchema,
  NodeConfigSchema,
  NodeOrchestratorSettingsSchema,
  StateSchema,
} from '../schemas/index.js';
import { atomicWriteFile } from './atomic-file.js';
import { generateLineId, generateNodeId } from './id-generation.js';
import {
  canRun as canRunAlgorithm,
  collateInputs as collateInputsAlgorithm,
} from './input-resolution.js';

export class PositionalGraphService implements IPositionalGraphService {
  private readonly nodeEventRegistry;
  private readonly handlerRegistry;

  constructor(
    private readonly fs: IFileSystem,
    private readonly pathResolver: IPathResolver,
    private readonly yamlParser: IYamlParser,
    private readonly adapter: PositionalGraphAdapter,
    private readonly workUnitLoader: IWorkUnitLoader
  ) {
    this.nodeEventRegistry = new NodeEventRegistry();
    registerCoreEventTypes(this.nodeEventRegistry);
    this.handlerRegistry = createEventHandlerRegistry();
  }

  private createEventService(ctx: WorkspaceContext): INodeEventService {
    return new NodeEventService(
      {
        registry: this.nodeEventRegistry,
        loadState: (graphSlug) => this.loadState(ctx, graphSlug),
        persistState: (graphSlug, state) => this.persistState(ctx, graphSlug, state),
      },
      this.handlerRegistry
    );
  }

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

    // Backfill migration: move top-level transition into orchestratorSettings
    if (
      parsed &&
      typeof parsed === 'object' &&
      'lines' in parsed &&
      Array.isArray((parsed as Record<string, unknown>).lines)
    ) {
      const rawGraph = parsed as Record<string, unknown>;
      rawGraph.lines = (rawGraph.lines as Record<string, unknown>[]).map((line) => {
        if ('transition' in line && !('orchestratorSettings' in line)) {
          const { transition, ...rest } = line;
          return { ...rest, orchestratorSettings: { transition } };
        }
        return line;
      });
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

    // Backfill migration: move top-level execution into orchestratorSettings, drop dead 'config'
    let migrated = parsed;
    if (parsed && typeof parsed === 'object') {
      const raw = parsed as Record<string, unknown>;
      if ('execution' in raw && !('orchestratorSettings' in raw)) {
        const { execution, config: _config, ...rest } = raw;
        migrated = { ...rest, orchestratorSettings: { execution } };
      } else if ('config' in raw) {
        const { config: _config, ...rest } = raw;
        migrated = rest;
      }
    }

    const validated = NodeConfigSchema.safeParse(migrated);
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

  /**
   * Load state.json for a graph. Returns empty default state if not found.
   */
  private async loadState(ctx: WorkspaceContext, graphSlug: string): Promise<State> {
    const graphDir = this.adapter.getGraphDir(ctx, graphSlug);
    const statePath = this.pathResolver.join(graphDir, 'state.json');

    const exists = await this.fs.exists(statePath);
    if (!exists) {
      return {
        graph_status: 'pending',
        updated_at: new Date().toISOString(),
        nodes: {},
        transitions: {},
      };
    }

    const content = await this.fs.readFile(statePath);
    try {
      const parsed = JSON.parse(content);
      const validated = StateSchema.safeParse(parsed);
      if (validated.success) {
        return validated.data;
      }
    } catch {
      // Fall through to default
    }

    return {
      graph_status: 'pending',
      updated_at: new Date().toISOString(),
      nodes: {},
      transitions: {},
    };
  }

  /**
   * Persist state.json for a graph.
   */
  private async persistState(
    ctx: WorkspaceContext,
    graphSlug: string,
    state: State
  ): Promise<void> {
    const graphDir = this.adapter.getGraphDir(ctx, graphSlug);
    const statePath = this.pathResolver.join(graphDir, 'state.json');
    await atomicWriteFile(this.fs, statePath, JSON.stringify(state, null, 2));
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
      lines: [
        {
          id: lineId,
          nodes: [],
          properties: {},
          orchestratorSettings: { transition: 'auto', autoStartLine: true },
        },
      ],
      properties: {},
      orchestratorSettings: { agentType: 'copilot' },
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
        transition: line.orchestratorSettings.transition,
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
      nodes: [],
      properties: {},
      orchestratorSettings: {
        transition: options?.orchestratorSettings?.transition ?? 'auto',
        autoStartLine: options?.orchestratorSettings?.autoStartLine ?? true,
      },
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
      created_at: now,
      properties: {},
      orchestratorSettings: {
        execution: options?.orchestratorSettings?.execution ?? 'serial',
        waitForPrevious: options?.orchestratorSettings?.waitForPrevious ?? true,
        noContext: options?.orchestratorSettings?.noContext ?? false,
        contextFrom: options?.orchestratorSettings?.contextFrom,
      },
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
      execution: config.orchestratorSettings.execution,
      description: config.description,
      lineId: nodeLocation.line.id,
      position: nodeLocation.nodePositionInLine,
      inputs: config.inputs,
      errors: [],
    };
  }

  // ============================================
  // Input wiring — Phase 5
  // ============================================

  async setInput(
    ctx: WorkspaceContext,
    graphSlug: string,
    nodeId: string,
    inputName: string,
    source: InputResolution
  ): Promise<BaseResult> {
    // Verify graph and node exist
    const loaded = await this.loadGraphDefinition(ctx, graphSlug);
    if (!loaded.ok) return { errors: loaded.errors };

    const nodeLocation = this.findNodeInGraph(loaded.definition, nodeId);
    if (!nodeLocation) return { errors: [nodeNotFoundError(nodeId)] };

    // Load node config
    const nodeResult = await this.loadNodeConfig(ctx, graphSlug, nodeId);
    if (!nodeResult.ok) return { errors: nodeResult.errors };

    // Validate input name is declared on the WorkUnit
    const unitResult = await this.workUnitLoader.load(ctx, nodeResult.config.unit_slug);
    if (unitResult.errors.length > 0 || !unitResult.unit) {
      return { errors: [unitNotFoundError(nodeResult.config.unit_slug)] };
    }

    const declaredInput = unitResult.unit.inputs.find((i) => i.name === inputName);
    if (!declaredInput) {
      return { errors: [inputNotDeclaredError(inputName, nodeId)] };
    }

    // Set the input wiring
    if (!nodeResult.config.inputs) {
      nodeResult.config.inputs = {};
    }
    nodeResult.config.inputs[inputName] = source;

    await this.persistNodeConfig(ctx, graphSlug, nodeId, nodeResult.config);

    return { errors: [] };
  }

  async removeInput(
    ctx: WorkspaceContext,
    graphSlug: string,
    nodeId: string,
    inputName: string
  ): Promise<BaseResult> {
    // Verify graph and node exist
    const loaded = await this.loadGraphDefinition(ctx, graphSlug);
    if (!loaded.ok) return { errors: loaded.errors };

    const nodeLocation = this.findNodeInGraph(loaded.definition, nodeId);
    if (!nodeLocation) return { errors: [nodeNotFoundError(nodeId)] };

    // Load node config
    const nodeResult = await this.loadNodeConfig(ctx, graphSlug, nodeId);
    if (!nodeResult.ok) return { errors: nodeResult.errors };

    // Remove the input wiring
    if (nodeResult.config.inputs) {
      delete nodeResult.config.inputs[inputName];
      // Clean up empty inputs object
      if (Object.keys(nodeResult.config.inputs).length === 0) {
        nodeResult.config.inputs = undefined;
      }
    }

    await this.persistNodeConfig(ctx, graphSlug, nodeId, nodeResult.config);

    return { errors: [] };
  }

  // ============================================
  // Input resolution — Phase 5
  // ============================================

  async collateInputs(
    ctx: WorkspaceContext,
    graphSlug: string,
    nodeId: string
  ): Promise<InputPack> {
    // Load graph definition
    const loaded = await this.loadGraphDefinition(ctx, graphSlug);
    if (!loaded.ok) return { inputs: {}, ok: false };

    // Find node and load its config
    const nodeLocation = this.findNodeInGraph(loaded.definition, nodeId);
    if (!nodeLocation) return { inputs: {}, ok: false };

    const nodeResult = await this.loadNodeConfig(ctx, graphSlug, nodeId);
    if (!nodeResult.ok) return { inputs: {}, ok: false };

    // Load WorkUnit
    const unitResult = await this.workUnitLoader.load(ctx, nodeResult.config.unit_slug);
    if (unitResult.errors.length > 0 || !unitResult.unit) {
      return { inputs: {}, ok: false };
    }

    // Load state
    const state = await this.loadState(ctx, graphSlug);

    return collateInputsAlgorithm(
      ctx,
      graphSlug,
      nodeId,
      loaded.definition,
      state,
      nodeResult.config,
      unitResult.unit,
      {
        fs: this.fs,
        pathResolver: this.pathResolver,
        yamlParser: this.yamlParser,
        adapter: this.adapter,
        workUnitLoader: this.workUnitLoader,
      }
    );
  }

  // ============================================
  // Status API — Phase 5
  // ============================================

  async getNodeStatus(
    ctx: WorkspaceContext,
    graphSlug: string,
    nodeId: string
  ): Promise<NodeStatusResult> {
    // Load graph definition
    const loaded = await this.loadGraphDefinition(ctx, graphSlug);
    if (!loaded.ok) {
      throw new Error(`Graph '${graphSlug}' not found`);
    }

    const def = loaded.definition;
    const nodeLocation = this.findNodeInGraph(def, nodeId);
    if (!nodeLocation) {
      throw new Error(`Node '${nodeId}' not found in graph`);
    }

    // Load node config
    const nodeResult = await this.loadNodeConfig(ctx, graphSlug, nodeId);
    if (!nodeResult.ok) {
      // Return a degraded status for orphaned nodes (config deleted but still in definition)
      return {
        nodeId,
        unitSlug: 'unknown',
        unitType: 'agent' as const,
        execution: 'serial' as const,
        noContext: false,
        lineId: nodeLocation.line.id,
        position: nodeLocation.nodePositionInLine,
        status: 'blocked-error' as import('../interfaces/index.js').ExecutionStatus,
        ready: false,
        readyDetail: {
          precedingLinesComplete: false,
          transitionOpen: false,
          serialNeighborComplete: false,
          inputsAvailable: false,
          unitFound: false,
          reason: `Node config missing — node '${nodeId}' may need to be removed or recreated`,
        },
        inputPack: { inputs: {}, ok: false },
        error: {
          code: 'E404',
          message: `Node config for '${nodeId}' could not be loaded`,
          occurredAt: new Date().toISOString(),
        },
      };
    }

    const nodeConfig = nodeResult.config;

    // Load WorkUnit
    const unitResult = await this.workUnitLoader.load(ctx, nodeConfig.unit_slug);
    const unitFound = !!(unitResult.unit && unitResult.errors.length === 0);

    // Load state
    const state = await this.loadState(ctx, graphSlug);

    // Collate inputs
    let inputPack: import('../interfaces/index.js').InputPack;
    if (unitFound && unitResult.unit) {
      inputPack = await collateInputsAlgorithm(
        ctx,
        graphSlug,
        nodeId,
        def,
        state,
        nodeConfig,
        unitResult.unit,
        {
          fs: this.fs,
          pathResolver: this.pathResolver,
          yamlParser: this.yamlParser,
          adapter: this.adapter,
          workUnitLoader: this.workUnitLoader,
        }
      );
    } else {
      inputPack = { inputs: {}, ok: false };
    }

    // Run canRun algorithm
    const canRunResult = canRunAlgorithm(nodeId, def, state, inputPack, nodeConfig);

    // Determine status
    const storedState = state.nodes?.[nodeId];
    let status: import('../interfaces/index.js').ExecutionStatus;

    if (storedState) {
      // Stored status takes precedence; restart-pending maps to ready
      // (convention-based contract: handler sets restart-pending, reality
      // builder exposes as ready, ONBAS returns start-node)
      status = storedState.status === 'restart-pending' ? 'ready' : storedState.status;
    } else {
      // Computed: pending or ready
      status = canRunResult.canRun ? 'ready' : 'pending';
    }

    // Build readyDetail (always computed)
    // Re-compute individual gates for the detail even if we short-circuited
    const precedingLinesComplete = (() => {
      for (let li = 0; li < nodeLocation.lineIndex; li++) {
        for (const nid of def.lines[li].nodes) {
          const ns = state.nodes?.[nid];
          if (!ns || ns.status !== 'complete') return false;
        }
      }
      return true;
    })();

    const transitionOpen = (() => {
      if (nodeLocation.lineIndex === 0) return true;
      const precedingLine = def.lines[nodeLocation.lineIndex - 1];
      if (precedingLine.orchestratorSettings.transition !== 'manual') return true;
      const trigger = state.transitions?.[precedingLine.id];
      return !!trigger?.triggered;
    })();

    const serialNeighborComplete = (() => {
      if (nodeConfig.orchestratorSettings.execution === 'parallel') return true;
      if (nodeLocation.nodePositionInLine === 0) return true;
      const leftId = nodeLocation.line.nodes[nodeLocation.nodePositionInLine - 1];
      const leftState = state.nodes?.[leftId];
      return leftState?.status === 'complete';
    })();

    const base = {
      nodeId,
      unitSlug: nodeConfig.unit_slug,
      execution: nodeConfig.orchestratorSettings.execution,
      noContext: nodeConfig.orchestratorSettings.noContext ?? false,
      contextFrom: nodeConfig.orchestratorSettings.contextFrom,
      lineId: nodeLocation.line.id,
      position: nodeLocation.nodePositionInLine,
      status,
      ready: canRunResult.canRun,
      readyDetail: {
        precedingLinesComplete,
        transitionOpen,
        serialNeighborComplete,
        contextFromReady: nodeConfig.orchestratorSettings.contextFrom
          ? state.nodes?.[nodeConfig.orchestratorSettings.contextFrom]?.status === 'complete'
          : true,
        inputsAvailable: inputPack.ok,
        unitFound,
        reason: canRunResult.reason,
      },
      inputPack,
      pendingQuestion: this.resolvePendingQuestion(storedState, state),
      startedAt: storedState?.started_at,
      completedAt: storedState?.completed_at,
    };

    const unitType = unitResult.unit?.type ?? 'agent';
    if (unitType === 'user-input' && unitResult.unit && 'userInput' in unitResult.unit) {
      return {
        ...base,
        unitType: 'user-input' as const,
        userInput: (unitResult.unit as import('../interfaces/index.js').NarrowUserInputWorkUnit)
          .userInput,
      };
    }
    if (unitType === 'code') {
      return { ...base, unitType: 'code' as const };
    }
    return { ...base, unitType: 'agent' as const };
  }

  /**
   * Resolve pending question details from node state + state.questions[].
   * Returns the pendingQuestion shape expected by NodeStatusResult, or undefined.
   * @deprecated Q&A protocol is scaffolding — not integrated into real agent execution.
   */
  private resolvePendingQuestion(
    storedState: NodeStateEntry | undefined,
    state: State
  ): NodeStatusResult['pendingQuestion'] {
    const questionId = storedState?.pending_question_id;
    if (!questionId) return undefined;

    const question = state.questions?.find((q) => q.question_id === questionId);
    if (!question) return undefined;

    return {
      questionId: question.question_id,
      text: question.text,
      questionType: question.type,
      options: question.options?.map((opt) => ({ key: opt, label: opt })),
      askedAt: question.asked_at,
    };
  }

  async getLineStatus(
    ctx: WorkspaceContext,
    graphSlug: string,
    lineId: string
  ): Promise<LineStatusResult> {
    const loaded = await this.loadGraphDefinition(ctx, graphSlug);
    if (!loaded.ok) throw new Error(`Graph '${graphSlug}' not found`);

    const def = loaded.definition;
    const lineInfo = this.findLine(def, lineId);
    if (!lineInfo) throw new Error(`Line '${lineId}' not found`);

    const { line, index: lineIndex } = lineInfo;
    const state = await this.loadState(ctx, graphSlug);

    // Get status for all nodes on this line
    const nodes: NodeStatusResult[] = [];
    for (const nodeId of line.nodes) {
      const nodeStatus = await this.getNodeStatus(ctx, graphSlug, nodeId);
      nodes.push(nodeStatus);
    }

    // Determine transition state
    const transitionTriggered = (() => {
      if (lineIndex === 0) return false;
      const precedingLine = def.lines[lineIndex - 1];
      if (precedingLine.orchestratorSettings.transition !== 'manual') return false;
      const trigger = state.transitions?.[precedingLine.id];
      return !!trigger?.triggered;
    })();

    // Line-level readiness
    const precedingLinesComplete = (() => {
      for (let li = 0; li < lineIndex; li++) {
        for (const nid of def.lines[li].nodes) {
          const ns = state.nodes?.[nid];
          if (!ns || ns.status !== 'complete') return false;
        }
      }
      return true;
    })();

    const transitionOpen = (() => {
      if (lineIndex === 0) return true;
      const precedingLine = def.lines[lineIndex - 1];
      if (precedingLine.orchestratorSettings.transition !== 'manual') return true;
      const trigger = state.transitions?.[precedingLine.id];
      return !!trigger?.triggered;
    })();

    // Identify starter nodes: position 0 or any parallel node
    const starterNodes: import('../interfaces/index.js').StarterReadiness[] = [];
    for (let pos = 0; pos < line.nodes.length; pos++) {
      const nStatus = nodes[pos];
      if (pos === 0 || nStatus.execution === 'parallel') {
        starterNodes.push({
          nodeId: nStatus.nodeId,
          position: pos,
          ready: nStatus.ready,
          reason: nStatus.readyDetail.reason,
        });
      }
    }

    const empty = line.nodes.length === 0;
    const complete = empty || nodes.every((n) => n.status === 'complete');
    const canRun =
      precedingLinesComplete && transitionOpen && (empty || starterNodes.some((s) => s.ready));

    // Convenience buckets
    const readyNodes = nodes.filter((n) => n.status === 'ready').map((n) => n.nodeId);
    // runningNodes: includes both 'starting' and 'agent-accepted' (two-phase handshake)
    const runningNodes = nodes
      .filter((n) => n.status === 'starting' || n.status === 'agent-accepted')
      .map((n) => n.nodeId);
    const waitingQuestionNodes = nodes
      .filter((n) => n.status === 'waiting-question')
      .map((n) => n.nodeId);
    const blockedNodes = nodes.filter((n) => n.status === 'blocked-error').map((n) => n.nodeId);
    const completedNodes = nodes.filter((n) => n.status === 'complete').map((n) => n.nodeId);

    return {
      lineId,
      label: line.label,
      index: lineIndex,
      transition: line.orchestratorSettings.transition,
      transitionTriggered,
      complete,
      empty,
      canRun,
      precedingLinesComplete,
      transitionOpen,
      starterNodes,
      nodes,
      readyNodes,
      runningNodes,
      waitingQuestionNodes,
      blockedNodes,
      completedNodes,
    };
  }

  async getStatus(ctx: WorkspaceContext, graphSlug: string): Promise<GraphStatusResult> {
    const loaded = await this.loadGraphDefinition(ctx, graphSlug);
    if (!loaded.ok) throw new Error(`Graph '${graphSlug}' not found`);

    const def = loaded.definition;
    const state = await this.loadState(ctx, graphSlug);

    // Get line statuses
    const lines: LineStatusResult[] = [];
    for (const lineDef of def.lines) {
      const lineStatus = await this.getLineStatus(ctx, graphSlug, lineDef.id);
      lines.push(lineStatus);
    }

    // Flatten convenience lists
    const readyNodes: string[] = [];
    const runningNodes: string[] = [];
    const waitingQuestionNodes: string[] = [];
    const blockedNodes: string[] = [];
    const completedNodeIds: string[] = [];

    for (const ls of lines) {
      readyNodes.push(...ls.readyNodes);
      runningNodes.push(...ls.runningNodes);
      waitingQuestionNodes.push(...ls.waitingQuestionNodes);
      blockedNodes.push(...ls.blockedNodes);
      completedNodeIds.push(...ls.completedNodes);
    }

    // Total counts
    const totalNodes = lines.reduce((sum, ls) => sum + ls.nodes.length, 0);
    const completedCount = completedNodeIds.length;

    // Compute overall status
    let overallStatus: 'pending' | 'in_progress' | 'complete' | 'failed';
    if (totalNodes === 0) {
      overallStatus = state.graph_status as typeof overallStatus;
    } else if (completedCount === totalNodes) {
      overallStatus = 'complete';
    } else if (blockedNodes.length > 0 && runningNodes.length === 0 && readyNodes.length === 0) {
      overallStatus = 'failed';
    } else if (completedCount > 0 || runningNodes.length > 0) {
      overallStatus = 'in_progress';
    } else {
      overallStatus = 'pending';
    }

    return {
      graphSlug,
      version: def.version,
      description: def.description,
      status: overallStatus,
      totalNodes,
      completedNodes: completedCount,
      lines,
      readyNodes,
      runningNodes,
      waitingQuestionNodes,
      blockedNodes,
      completedNodeIds,
    };
  }

  // ============================================
  // ============================================
  // Inspect (Plan 040)
  // ============================================

  async inspectGraph(
    ctx: WorkspaceContext,
    graphSlug: string
  ): Promise<import('../features/040-graph-inspect/index.js').InspectResult> {
    const result = await buildInspectResult(this, ctx, graphSlug);
    return this.enrichInspectResult(ctx, graphSlug, result);
  }

  /** Enrich InspectResult with file metadata and waitForPrevious (requires private service access). */
  private async enrichInspectResult(
    ctx: WorkspaceContext,
    graphSlug: string,
    result: import('../features/040-graph-inspect/index.js').InspectResult
  ): Promise<import('../features/040-graph-inspect/index.js').InspectResult> {
    const { isFileOutput } = await import('../features/040-graph-inspect/inspect.types.js');
    const enrichmentErrors: Array<{ code: string; message: string }> = [];
    const enrichedNodes = await Promise.all(
      result.nodes.map(async (node) => {
        // Enrich file metadata for file outputs
        const fileMetadata: Record<
          string,
          import('../features/040-graph-inspect/index.js').InspectFileMetadata
        > = {};
        for (const [name, value] of Object.entries(node.outputs)) {
          if (isFileOutput(value)) {
            const nodeDir = this.getNodeDir(ctx, graphSlug, node.nodeId);
            const outputsDir = this.pathResolver.join(nodeDir, 'data', 'outputs');
            const relPath = (value as string).slice('data/outputs/'.length);
            let filePath: string;
            try {
              filePath = this.pathResolver.resolvePath(outputsDir, relPath);
            } catch {
              // Path traversal attempt — skip this output
              enrichmentErrors.push({
                code: 'PATH_TRAVERSAL',
                message: `${node.nodeId}/${name}: blocked path "${value as string}"`,
              });
              continue;
            }
            try {
              const content = await this.fs.readFile(filePath);
              const filename = relPath.split('/').pop() ?? '';
              const sizeBytes = Buffer.byteLength(content, 'utf8');
              const isBinary = hasBinaryContent(content.slice(0, 512));
              const extract = isBinary ? undefined : content.split('\n').slice(0, 2).join('\n');
              fileMetadata[name] = { filename, sizeBytes, isBinary, extract };
            } catch (err) {
              enrichmentErrors.push({
                code: 'FILE_READ_FAILED',
                message: `${node.nodeId}/${name}: ${err instanceof Error ? err.message : String(err)}`,
              });
            }
          }
        }

        // Enrich waitForPrevious from node config (private access) — Fix #2: non-fatal
        // Also backfill inputs from node config when inputPack resolution failed (missing work units)
        let orchestratorSettings = node.orchestratorSettings;
        let inputs = node.inputs;
        try {
          const configResult = await this.loadNodeConfig(ctx, graphSlug, node.nodeId);
          if (configResult.ok) {
            if (configResult.config.orchestratorSettings) {
              orchestratorSettings = {
                ...orchestratorSettings,
                waitForPrevious: configResult.config.orchestratorSettings.waitForPrevious,
              };
            }
            // Backfill inputs from node.yaml when inputPack was empty
            if (Object.keys(inputs).length === 0 && configResult.config.inputs) {
              const configInputs = configResult.config.inputs as Record<
                string,
                { from_node: string; from_output: string }
              >;
              const backfilled: typeof inputs = {};
              for (const [name, src] of Object.entries(configInputs)) {
                if (src.from_node && src.from_output) {
                  backfilled[name] = {
                    fromNode: src.from_node,
                    fromOutput: src.from_output,
                    available: true,
                  };
                }
              }
              if (Object.keys(backfilled).length > 0) {
                inputs = backfilled;
                enrichmentErrors.push({
                  code: 'INPUT_RESOLUTION_FALLBACK',
                  message: `${node.nodeId}: inputs resolved from node.yaml (work unit not found for live resolution)`,
                });
              }
            }
          }
        } catch {
          enrichmentErrors.push({
            code: 'CONFIG_READ_FAILED',
            message: `${node.nodeId}: loadNodeConfig failed, using defaults`,
          });
        }

        return { ...node, inputs, fileMetadata, orchestratorSettings };
      })
    );
    return {
      ...result,
      nodes: enrichedNodes,
      errors: [...result.errors, ...enrichmentErrors],
    };
  }

  // ============================================
  // Transition control — Phase 5
  // ============================================

  async triggerTransition(
    ctx: WorkspaceContext,
    graphSlug: string,
    lineId: string
  ): Promise<BaseResult> {
    const loaded = await this.loadGraphDefinition(ctx, graphSlug);
    if (!loaded.ok) return { errors: loaded.errors };

    const found = this.findLine(loaded.definition, lineId);
    if (!found) return { errors: [lineNotFoundError(lineId)] };

    const state = await this.loadState(ctx, graphSlug);

    if (!state.transitions) {
      state.transitions = {};
    }

    state.transitions[lineId] = {
      triggered: true,
      triggered_at: new Date().toISOString(),
    };

    await this.persistState(ctx, graphSlug, state);

    return { errors: [] };
  }

  // ============================================
  // Properties & Orchestrator Settings (Subtask 001)
  // ============================================

  async updateGraphProperties(
    ctx: WorkspaceContext,
    graphSlug: string,
    properties: Partial<GraphProperties>
  ): Promise<BaseResult> {
    const loaded = await this.loadGraphDefinition(ctx, graphSlug);
    if (!loaded.ok) return { errors: loaded.errors };

    const def = loaded.definition;
    def.properties = { ...def.properties, ...properties };
    await this.persistGraph(ctx, graphSlug, def);

    return { errors: [] };
  }

  async updateLineProperties(
    ctx: WorkspaceContext,
    graphSlug: string,
    lineId: string,
    properties: Partial<LineProperties>
  ): Promise<BaseResult> {
    const loaded = await this.loadGraphDefinition(ctx, graphSlug);
    if (!loaded.ok) return { errors: loaded.errors };

    const found = this.findLine(loaded.definition, lineId);
    if (!found) return { errors: [lineNotFoundError(lineId)] };

    found.line.properties = { ...found.line.properties, ...properties };
    await this.persistGraph(ctx, graphSlug, loaded.definition);

    return { errors: [] };
  }

  async updateNodeProperties(
    ctx: WorkspaceContext,
    graphSlug: string,
    nodeId: string,
    properties: Partial<NodeProperties>
  ): Promise<BaseResult> {
    const loaded = await this.loadGraphDefinition(ctx, graphSlug);
    if (!loaded.ok) return { errors: loaded.errors };

    const nodeLocation = this.findNodeInGraph(loaded.definition, nodeId);
    if (!nodeLocation) return { errors: [nodeNotFoundError(nodeId)] };

    const nodeResult = await this.loadNodeConfig(ctx, graphSlug, nodeId);
    if (!nodeResult.ok) return { errors: nodeResult.errors };

    nodeResult.config.properties = { ...nodeResult.config.properties, ...properties };
    await this.persistNodeConfig(ctx, graphSlug, nodeId, nodeResult.config);

    return { errors: [] };
  }

  async updateGraphOrchestratorSettings(
    ctx: WorkspaceContext,
    graphSlug: string,
    settings: Partial<GraphOrchestratorSettings>
  ): Promise<BaseResult> {
    const validated = GraphOrchestratorSettingsSchema.partial().safeParse(settings);
    if (!validated.success) {
      return {
        errors: [
          {
            code: 'E170',
            message: `Invalid orchestrator settings: ${validated.error.issues[0]?.message}`,
            action: 'Check the orchestrator settings schema for valid keys',
          },
        ],
      };
    }

    const loaded = await this.loadGraphDefinition(ctx, graphSlug);
    if (!loaded.ok) return { errors: loaded.errors };

    const def = loaded.definition;
    def.orchestratorSettings = { ...def.orchestratorSettings, ...validated.data };
    await this.persistGraph(ctx, graphSlug, def);

    return { errors: [] };
  }

  async updateLineOrchestratorSettings(
    ctx: WorkspaceContext,
    graphSlug: string,
    lineId: string,
    settings: Partial<LineOrchestratorSettings>
  ): Promise<BaseResult> {
    const validated = LineOrchestratorSettingsSchema.partial().safeParse(settings);
    if (!validated.success) {
      return {
        errors: [
          {
            code: 'E170',
            message: `Invalid orchestrator settings: ${validated.error.issues[0]?.message}`,
            action: 'Check the orchestrator settings schema for valid keys',
          },
        ],
      };
    }

    const loaded = await this.loadGraphDefinition(ctx, graphSlug);
    if (!loaded.ok) return { errors: loaded.errors };

    const found = this.findLine(loaded.definition, lineId);
    if (!found) return { errors: [lineNotFoundError(lineId)] };

    found.line.orchestratorSettings = { ...found.line.orchestratorSettings, ...validated.data };
    await this.persistGraph(ctx, graphSlug, loaded.definition);

    return { errors: [] };
  }

  async updateNodeOrchestratorSettings(
    ctx: WorkspaceContext,
    graphSlug: string,
    nodeId: string,
    settings: Partial<NodeOrchestratorSettings>
  ): Promise<BaseResult> {
    const validated = NodeOrchestratorSettingsSchema.partial().safeParse(settings);
    if (!validated.success) {
      return {
        errors: [
          {
            code: 'E170',
            message: `Invalid orchestrator settings: ${validated.error.issues[0]?.message}`,
            action: 'Check the orchestrator settings schema for valid keys',
          },
        ],
      };
    }

    const loaded = await this.loadGraphDefinition(ctx, graphSlug);
    if (!loaded.ok) return { errors: loaded.errors };

    const nodeLocation = this.findNodeInGraph(loaded.definition, nodeId);
    if (!nodeLocation) return { errors: [nodeNotFoundError(nodeId)] };

    const nodeResult = await this.loadNodeConfig(ctx, graphSlug, nodeId);
    if (!nodeResult.ok) return { errors: nodeResult.errors };

    nodeResult.config.orchestratorSettings = {
      ...nodeResult.config.orchestratorSettings,
      ...validated.data,
    };
    await this.persistNodeConfig(ctx, graphSlug, nodeId, nodeResult.config);

    return { errors: [] };
  }

  // ============================================
  // Output Storage (Phase 2, Plan 028)
  // ============================================

  /**
   * Save an output data value to the node's data.json.
   * Directory structure: nodes/{nodeId}/data/data.json with { "outputs": {...} } wrapper.
   */
  async saveOutputData(
    ctx: WorkspaceContext,
    graphSlug: string,
    nodeId: string,
    outputName: string,
    value: unknown
  ): Promise<SaveOutputDataResult> {
    // Verify node exists
    const nodeResult = await this.loadNodeConfig(ctx, graphSlug, nodeId);
    if (!nodeResult.ok) {
      return { saved: false, errors: nodeResult.errors };
    }

    // Require agent-accepted state for output operations (two-phase handshake)
    const status = await this.getNodeExecutionStatus(ctx, graphSlug, nodeId);
    if (status === 'pending' || !canNodeDoWork(status)) {
      return { saved: false, errors: [nodeNotRunningError(nodeId)] };
    }

    const nodeDir = this.getNodeDir(ctx, graphSlug, nodeId);
    const dataDir = this.pathResolver.join(nodeDir, 'data');
    const dataPath = this.pathResolver.join(dataDir, 'data.json');

    // Ensure data directory exists
    const dirExists = await this.fs.exists(dataDir);
    if (!dirExists) {
      await this.fs.mkdir(dataDir, { recursive: true });
    }

    // Load existing data.json or create empty structure
    let data: { outputs: Record<string, unknown> } = { outputs: {} };
    const fileExists = await this.fs.exists(dataPath);
    if (fileExists) {
      const content = await this.fs.readFile(dataPath);
      data = JSON.parse(content) as { outputs: Record<string, unknown> };
    }

    // Merge new output
    data.outputs[outputName] = value;

    // Write atomically
    await atomicWriteFile(this.fs, dataPath, JSON.stringify(data, null, 2));

    return {
      nodeId,
      outputName,
      saved: true,
      errors: [],
    };
  }

  /**
   * Save an output file by copying it to the node's data/outputs/ directory.
   * Path traversal prevented via rejection of '..' and containment check.
   */
  async saveOutputFile(
    ctx: WorkspaceContext,
    graphSlug: string,
    nodeId: string,
    outputName: string,
    sourcePath: string
  ): Promise<SaveOutputFileResult> {
    // Security: reject path traversal patterns in output name
    if (outputName.includes('..') || outputName.includes('/') || outputName.includes('\\')) {
      return {
        saved: false,
        errors: [fileNotFoundError(outputName, 'Output name contains invalid characters')],
      };
    }

    // Security: reject path traversal in source path
    if (sourcePath.includes('..')) {
      return {
        saved: false,
        errors: [fileNotFoundError(sourcePath, 'Source path contains path traversal')],
      };
    }

    // Verify node exists
    const nodeResult = await this.loadNodeConfig(ctx, graphSlug, nodeId);
    if (!nodeResult.ok) {
      return { saved: false, errors: nodeResult.errors };
    }

    // Require agent-accepted state for output operations (two-phase handshake)
    const status = await this.getNodeExecutionStatus(ctx, graphSlug, nodeId);
    if (status === 'pending' || !canNodeDoWork(status)) {
      return { saved: false, errors: [nodeNotRunningError(nodeId)] };
    }

    // Verify source file exists
    const sourceExists = await this.fs.exists(sourcePath);
    if (!sourceExists) {
      return {
        saved: false,
        errors: [fileNotFoundError(sourcePath, 'Source file does not exist')],
      };
    }

    const nodeDir = this.getNodeDir(ctx, graphSlug, nodeId);
    const outputsDir = this.pathResolver.join(nodeDir, 'data', 'outputs');

    // Ensure outputs directory exists
    const dirExists = await this.fs.exists(outputsDir);
    if (!dirExists) {
      await this.fs.mkdir(outputsDir, { recursive: true });
    }

    // Extract filename from source and construct destination path
    const sourceFilename = this.pathResolver.basename(sourcePath);

    // Security: Use resolvePath for containment check
    // This throws PathSecurityError if the resolved path escapes outputsDir
    let destPath: string;
    try {
      destPath = this.pathResolver.resolvePath(outputsDir, sourceFilename);
    } catch {
      return {
        saved: false,
        errors: [fileNotFoundError(sourceFilename, 'Filename would escape output directory')],
      };
    }

    // Additional containment verification: destPath must start with outputsDir
    const normalizedDest = this.pathResolver.normalize(destPath);
    const normalizedBase = this.pathResolver.normalize(outputsDir);
    if (!normalizedDest.startsWith(normalizedBase)) {
      return {
        saved: false,
        errors: [fileNotFoundError(sourceFilename, 'Destination path escapes output directory')],
      };
    }

    // Copy file
    const content = await this.fs.readFile(sourcePath);
    await atomicWriteFile(this.fs, destPath, content);

    // Store relative path in data.json
    const dataDir = this.pathResolver.join(nodeDir, 'data');
    const dataPath = this.pathResolver.join(dataDir, 'data.json');

    let data: { outputs: Record<string, unknown> } = { outputs: {} };
    const fileExists = await this.fs.exists(dataPath);
    if (fileExists) {
      const dataContent = await this.fs.readFile(dataPath);
      data = JSON.parse(dataContent) as { outputs: Record<string, unknown> };
    }

    // Store relative path (relative to node dir)
    const relativePath = `data/outputs/${sourceFilename}`;
    data.outputs[outputName] = relativePath;

    await atomicWriteFile(this.fs, dataPath, JSON.stringify(data, null, 2));

    return {
      nodeId,
      outputName,
      saved: true,
      filePath: relativePath,
      errors: [],
    };
  }

  /**
   * Retrieve an output data value from the node's data.json.
   */
  async getOutputData(
    ctx: WorkspaceContext,
    graphSlug: string,
    nodeId: string,
    outputName: string
  ): Promise<GetOutputDataResult> {
    // Verify node exists
    const nodeResult = await this.loadNodeConfig(ctx, graphSlug, nodeId);
    if (!nodeResult.ok) {
      return { errors: nodeResult.errors };
    }

    const nodeDir = this.getNodeDir(ctx, graphSlug, nodeId);
    const dataPath = this.pathResolver.join(nodeDir, 'data', 'data.json');

    // Check if data.json exists
    const fileExists = await this.fs.exists(dataPath);
    if (!fileExists) {
      return {
        errors: [outputNotFoundError(outputName, nodeId)],
      };
    }

    const content = await this.fs.readFile(dataPath);
    const data = JSON.parse(content) as { outputs: Record<string, unknown> };

    // Check if output exists
    if (!(outputName in data.outputs)) {
      return {
        errors: [outputNotFoundError(outputName, nodeId)],
      };
    }

    return {
      nodeId,
      outputName,
      value: data.outputs[outputName],
      errors: [],
    };
  }

  /**
   * Retrieve the absolute path to a saved output file.
   * Stored as relative path in data.json, returned as absolute path.
   */
  async getOutputFile(
    ctx: WorkspaceContext,
    graphSlug: string,
    nodeId: string,
    outputName: string
  ): Promise<GetOutputFileResult> {
    // Verify node exists
    const nodeResult = await this.loadNodeConfig(ctx, graphSlug, nodeId);
    if (!nodeResult.ok) {
      return { errors: nodeResult.errors };
    }

    const nodeDir = this.getNodeDir(ctx, graphSlug, nodeId);
    const dataPath = this.pathResolver.join(nodeDir, 'data', 'data.json');

    // Check if data.json exists
    const fileExists = await this.fs.exists(dataPath);
    if (!fileExists) {
      return {
        errors: [outputNotFoundError(outputName, nodeId)],
      };
    }

    const content = await this.fs.readFile(dataPath);
    const data = JSON.parse(content) as { outputs: Record<string, unknown> };

    // Check if output exists
    if (!(outputName in data.outputs)) {
      return {
        errors: [outputNotFoundError(outputName, nodeId)],
      };
    }

    // Convert relative path to absolute
    const relativePath = data.outputs[outputName] as string;
    const absolutePath = this.pathResolver.join(nodeDir, relativePath);

    return {
      nodeId,
      outputName,
      filePath: absolutePath,
      errors: [],
    };
  }

  // ============================================
  // Node Lifecycle (Phase 3, Plan 028)
  // ============================================

  /**
   * Private helper for atomic state transitions.
   * Validates from-state, writes atomically, handles missing entries as 'pending'.
   *
   * Per DYK #5: Missing state.json.nodes[nodeId] entry means implicit 'pending' status.
   * Per CF-08: Centralized state transition logic for consistent validation.
   */
  private async transitionNodeState(
    ctx: WorkspaceContext,
    graphSlug: string,
    nodeId: string,
    toStatus: NodeExecutionStatus,
    validFromStates: Array<NodeExecutionStatus | 'pending'>
  ): Promise<
    { ok: true; state: State; entry: NodeStateEntry } | { ok: false; errors: BaseResult['errors'] }
  > {
    const state = await this.loadState(ctx, graphSlug);

    // Get current status - missing entry means 'pending'
    const currentEntry = state.nodes?.[nodeId];
    const currentStatus: NodeExecutionStatus | 'pending' = currentEntry?.status ?? 'pending';

    // Validate transition
    if (!validFromStates.includes(currentStatus)) {
      return {
        ok: false,
        errors: [invalidStateTransitionError(nodeId, currentStatus, toStatus)],
      };
    }

    // Create or update entry
    const now = new Date().toISOString();
    const newEntry: NodeStateEntry = {
      ...currentEntry,
      status: toStatus,
    };

    // Set timestamps based on transition
    if (toStatus === 'starting' && !newEntry.started_at) {
      newEntry.started_at = now;
    }
    if (toStatus === 'complete') {
      newEntry.completed_at = now;
    }

    // Ensure nodes object exists
    if (!state.nodes) {
      state.nodes = {};
    }
    state.nodes[nodeId] = newEntry;
    state.updated_at = now;

    // Update graph status if needed
    if (toStatus === 'complete' && state.graph_status === 'pending') {
      state.graph_status = 'in_progress';
    }

    // Persist atomically
    await this.persistState(ctx, graphSlug, state);

    return { ok: true, state, entry: newEntry };
  }

  /**
   * Get the current execution status of a node.
   * Returns 'pending' for nodes without state entries.
   */
  private async getNodeExecutionStatus(
    ctx: WorkspaceContext,
    graphSlug: string,
    nodeId: string
  ): Promise<NodeExecutionStatus | 'pending'> {
    const state = await this.loadState(ctx, graphSlug);
    return state.nodes?.[nodeId]?.status ?? 'pending';
  }

  /**
   * Start a node, transitioning it from pending/ready to running.
   * Records started_at timestamp.
   *
   * Per DYK #1: startNode does NOT call canRun - nodes are dumb executors.
   * The orchestrator is responsible for checking readiness before calling start.
   */
  async startNode(
    ctx: WorkspaceContext,
    graphSlug: string,
    nodeId: string
  ): Promise<StartNodeResult> {
    // Verify node exists
    const nodeResult = await this.loadNodeConfig(ctx, graphSlug, nodeId);
    if (!nodeResult.ok) {
      return { errors: nodeResult.errors };
    }

    // Transition to starting (valid from pending or restart-pending - ready is computed, not stored)
    const transition = await this.transitionNodeState(
      ctx,
      graphSlug,
      nodeId,
      'starting',
      ['pending', 'restart-pending'] // pending (first start) or restart-pending (after node:restart)
    );

    if (!transition.ok) {
      return { errors: transition.errors };
    }

    return {
      nodeId,
      status: 'starting',
      startedAt: transition.entry.started_at,
      errors: [],
    };
  }

  /**
   * Check if a node can end (all required outputs are saved).
   * Returns structured result with saved and missing output lists.
   *
   * Per DYK #2: canEnd serves both CLI (display) and endNode (validation).
   * Per DYK #3: Assumes WorkUnit loader is always available.
   */
  async canEnd(ctx: WorkspaceContext, graphSlug: string, nodeId: string): Promise<CanEndResult> {
    // Verify node exists
    const nodeResult = await this.loadNodeConfig(ctx, graphSlug, nodeId);
    if (!nodeResult.ok) {
      return {
        canEnd: false,
        savedOutputs: [],
        missingOutputs: [],
        errors: nodeResult.errors,
      };
    }

    // Load WorkUnit to get output declarations
    const unitSlug = nodeResult.config.unit_slug;
    const unitResult = await this.workUnitLoader.load(ctx, unitSlug);
    if (unitResult.errors.length > 0) {
      return {
        canEnd: false,
        savedOutputs: [],
        missingOutputs: [],
        errors: unitResult.errors,
      };
    }

    // Get required outputs from WorkUnit
    const requiredOutputs = (unitResult.unit?.outputs ?? [])
      .filter((o) => o.required)
      .map((o) => o.name);

    // Check which outputs are saved
    const nodeDir = this.getNodeDir(ctx, graphSlug, nodeId);
    const dataPath = this.pathResolver.join(nodeDir, 'data', 'data.json');

    let savedOutputs: string[] = [];
    const fileExists = await this.fs.exists(dataPath);
    if (fileExists) {
      const content = await this.fs.readFile(dataPath);
      const data = JSON.parse(content) as { outputs: Record<string, unknown> };
      savedOutputs = Object.keys(data.outputs ?? {});
    }

    // Find missing required outputs
    const missingOutputs = requiredOutputs.filter((name) => !savedOutputs.includes(name));

    return {
      nodeId,
      canEnd: missingOutputs.length === 0,
      savedOutputs,
      missingOutputs,
      errors: [],
    };
  }

  /**
   * End a node, transitioning it from agent-accepted to complete.
   * Validates that all required outputs are saved before completing.
   *
   * Pre-flight guards: node exists, state is agent-accepted (E172), outputs saved (E175).
   * State transition delegated to eventService.raise() + handleEvents().
   */
  async endNode(
    ctx: WorkspaceContext,
    graphSlug: string,
    nodeId: string,
    message?: string
  ): Promise<EndNodeResult> {
    // Verify node exists
    const nodeResult = await this.loadNodeConfig(ctx, graphSlug, nodeId);
    if (!nodeResult.ok) {
      return { errors: nodeResult.errors };
    }

    // Check state FIRST - must be agent-accepted (E172 takes precedence over E175)
    const status = await this.getNodeExecutionStatus(ctx, graphSlug, nodeId);
    if (status === 'pending' || !canNodeDoWork(status)) {
      return {
        errors: [invalidStateTransitionError(nodeId, status, 'complete')],
      };
    }

    // Check if all required outputs are saved (DYK #1: canEnd pre-flight guard)
    const canEndResult = await this.canEnd(ctx, graphSlug, nodeId);
    if (canEndResult.errors.length > 0) {
      return { errors: canEndResult.errors };
    }

    if (!canEndResult.canEnd) {
      return {
        errors: [
          {
            code: 'E175',
            message: `Cannot end node '${nodeId}': missing required outputs: ${canEndResult.missingOutputs.join(', ')}`,
            action: 'Save all required outputs before ending the node',
          },
        ],
      };
    }

    // Raise node:completed event (record-only: validate, create, append, persist)
    const payload = message ? { message } : {};
    const eventService = this.createEventService(ctx);
    const raiseResult = await eventService.raise(
      graphSlug,
      nodeId,
      'node:completed',
      payload,
      'agent'
    );
    if (!raiseResult.ok) {
      return { errors: raiseResult.errors };
    }

    // Process events: handler transitions status to 'complete' and sets completed_at
    const state = await this.loadState(ctx, graphSlug);
    eventService.handleEvents(state, nodeId, 'cli', 'cli');
    await this.persistState(ctx, graphSlug, state);

    const entry = state.nodes?.[nodeId];
    return {
      nodeId,
      status: 'complete',
      completedAt: entry?.completed_at,
      errors: [],
    };
  }

  // ============================================
  // Question/Answer Protocol (Phase 4, Plan 028)
  // ============================================

  // ============================================
  // Input Retrieval (Phase 5, Plan 028)
  // ============================================

  /**
   * Retrieve input data from completed upstream nodes.
   * Uses collateInputs for resolution, then calls getOutputData on each source.
   *
   * Per CF-07: Thin wrapper around collateInputs, not new resolution logic.
   * Per Critical Insight #4: Returns full sources[] array (from_unit collects all matches).
   * Per Critical Insight #5: Returns partial results with complete flag.
   *
   * Error codes:
   * - E153: Node not found
   * - E160: Input not wired
   * - E175: Source complete but output not saved
   * - E178: Source node not complete (waiting status)
   */
  async getInputData(
    ctx: WorkspaceContext,
    graphSlug: string,
    nodeId: string,
    inputName: string
  ): Promise<GetInputDataResult> {
    // Verify node exists
    const nodeResult = await this.loadNodeConfig(ctx, graphSlug, nodeId);
    if (!nodeResult.ok) {
      return { errors: nodeResult.errors };
    }

    // Resolve inputs using collateInputs
    const inputPack = await this.collateInputs(ctx, graphSlug, nodeId);

    // Check if input exists in InputPack
    const entry = inputPack.inputs[inputName];
    if (!entry) {
      // Input not wired (E160)
      return {
        errors: [
          {
            code: 'E160',
            message: `Input '${inputName}' is not wired on node '${nodeId}'`,
            action: 'Wire the input with: cg wf node set-input <slug> <nodeId> <inputName> ...',
          },
        ],
      };
    }

    // Handle based on input status
    if (entry.status === 'error') {
      // Resolution error (e.g., E163 output not declared)
      return {
        errors: [
          {
            code: entry.detail.code,
            message: entry.detail.message,
          },
        ],
      };
    }

    if (entry.status === 'waiting') {
      // Source not complete (E178)
      const waiting = entry.detail.waiting;
      const reason =
        waiting.length > 0
          ? `Source node(s) not complete: ${waiting.join(', ')}`
          : 'No matching source nodes found';
      return {
        errors: [inputNotAvailableError(inputName, reason)],
      };
    }

    // status === 'available' — all sources are complete
    // Get actual data values from source nodes
    const sources = [];
    for (const src of entry.detail.sources) {
      const outputResult = await this.getOutputData(
        ctx,
        graphSlug,
        src.sourceNodeId,
        src.sourceOutput
      );
      if (outputResult.errors.length > 0) {
        // E175: Output not saved on source node
        return { errors: outputResult.errors };
      }
      sources.push({
        sourceNodeId: src.sourceNodeId,
        sourceOutput: src.sourceOutput,
        value: outputResult.value,
      });
    }

    return {
      nodeId,
      inputName,
      sources,
      complete: true,
      errors: [],
    };
  }

  /**
   * Retrieve input file path from completed upstream nodes.
   * Uses collateInputs for resolution, then calls getOutputFile on each source.
   *
   * Per CF-07: Thin wrapper around collateInputs, not new resolution logic.
   * Per Critical Insight #3: Calls getOutputFile to convert relative → absolute paths.
   * Per Critical Insight #4: Returns full sources[] array.
   *
   * Error codes:
   * - E153: Node not found
   * - E160: Input not wired
   * - E175: Source complete but file output not saved
   * - E178: Source node not complete
   */
  async getInputFile(
    ctx: WorkspaceContext,
    graphSlug: string,
    nodeId: string,
    inputName: string
  ): Promise<GetInputFileResult> {
    // Verify node exists
    const nodeResult = await this.loadNodeConfig(ctx, graphSlug, nodeId);
    if (!nodeResult.ok) {
      return { errors: nodeResult.errors };
    }

    // Resolve inputs using collateInputs
    const inputPack = await this.collateInputs(ctx, graphSlug, nodeId);

    // Check if input exists in InputPack
    const entry = inputPack.inputs[inputName];
    if (!entry) {
      // Input not wired (E160)
      return {
        errors: [
          {
            code: 'E160',
            message: `Input '${inputName}' is not wired on node '${nodeId}'`,
            action: 'Wire the input with: cg wf node set-input <slug> <nodeId> <inputName> ...',
          },
        ],
      };
    }

    // Handle based on input status
    if (entry.status === 'error') {
      return {
        errors: [
          {
            code: entry.detail.code,
            message: entry.detail.message,
          },
        ],
      };
    }

    if (entry.status === 'waiting') {
      const waiting = entry.detail.waiting;
      const reason =
        waiting.length > 0
          ? `Source node(s) not complete: ${waiting.join(', ')}`
          : 'No matching source nodes found';
      return {
        errors: [inputNotAvailableError(inputName, reason)],
      };
    }

    // status === 'available' — get file paths from source nodes
    const sources = [];
    for (const src of entry.detail.sources) {
      // Use getOutputFile to get absolute path (handles relative → absolute conversion)
      const fileResult = await this.getOutputFile(
        ctx,
        graphSlug,
        src.sourceNodeId,
        src.sourceOutput
      );
      if (fileResult.errors.length > 0) {
        // E175: File output not saved on source node
        return { errors: fileResult.errors };
      }
      sources.push({
        sourceNodeId: src.sourceNodeId,
        sourceOutput: src.sourceOutput,
        filePath: fileResult.filePath ?? '', // Should always be present when no errors
      });
    }

    return {
      nodeId,
      inputName,
      sources,
      complete: true,
      errors: [],
    };
  }

  // ============================================
  // Node Event System (Phase 6, Plan 032)
  // ============================================

  /**
   * Raise an event on a node: validate, record, handle, persist.
   * Returns the event with stamps and whether execution should stop.
   */
  async raiseNodeEvent(
    ctx: WorkspaceContext,
    graphSlug: string,
    nodeId: string,
    eventType: string,
    payload: Record<string, unknown>,
    source: EventSource
  ): Promise<RaiseNodeEventResult> {
    // Verify node exists
    const nodeResult = await this.loadNodeConfig(ctx, graphSlug, nodeId);
    if (!nodeResult.ok) {
      return { errors: nodeResult.errors };
    }

    // Raise event (record-only: validate, create, append, persist)
    const eventService = this.createEventService(ctx);
    const raiseResult = await eventService.raise(graphSlug, nodeId, eventType, payload, source);
    if (!raiseResult.ok) {
      return { errors: raiseResult.errors };
    }

    // Process events: load fresh state (after raise persisted), run handlers, persist
    const state = await this.loadState(ctx, graphSlug);
    eventService.handleEvents(state, nodeId, 'cli', 'cli');
    await this.persistState(ctx, graphSlug, state);

    // Look up stopsExecution from registry
    const registration = this.nodeEventRegistry.get(eventType);
    const stopsExecution = registration?.stopsExecution ?? false;

    return {
      nodeId,
      event: raiseResult.event,
      stopsExecution,
      errors: [],
    };
  }

  /**
   * Get events for a node, optionally filtered by type, status, or single event ID.
   */
  async getNodeEvents(
    ctx: WorkspaceContext,
    graphSlug: string,
    nodeId: string,
    filter?: GetNodeEventsFilter
  ): Promise<GetNodeEventsResult> {
    // Verify node exists
    const nodeResult = await this.loadNodeConfig(ctx, graphSlug, nodeId);
    if (!nodeResult.ok) {
      return { errors: nodeResult.errors };
    }

    const state = await this.loadState(ctx, graphSlug);
    const eventService = this.createEventService(ctx);
    let events = [...eventService.getEventsForNode(state, nodeId)];

    // Single event lookup by ID
    if (filter?.eventId) {
      const event = events.find((e) => e.event_id === filter.eventId);
      if (!event) {
        return { errors: [eventNotFoundError(filter.eventId)] };
      }
      return { nodeId, events: [event], errors: [] };
    }

    // Filter by type(s)
    if (filter?.types && filter.types.length > 0) {
      events = events.filter((e) => filter.types?.includes(e.event_type));
    }

    // Filter by status
    if (filter?.status) {
      events = events.filter((e) => e.status === filter.status);
    }

    return { nodeId, events, errors: [] };
  }

  /**
   * Stamp an event as processed by a named subscriber.
   */
  async stampNodeEvent(
    ctx: WorkspaceContext,
    graphSlug: string,
    nodeId: string,
    eventId: string,
    subscriber: string,
    action: string,
    data?: Record<string, unknown>
  ): Promise<StampNodeEventResult> {
    // Verify node exists
    const nodeResult = await this.loadNodeConfig(ctx, graphSlug, nodeId);
    if (!nodeResult.ok) {
      return { errors: nodeResult.errors };
    }

    const state = await this.loadState(ctx, graphSlug);
    const eventService = this.createEventService(ctx);
    const events = eventService.getEventsForNode(state, nodeId);
    const event = events.find((e) => e.event_id === eventId);

    if (!event) {
      return { errors: [eventNotFoundError(eventId)] };
    }

    const stamp = eventService.stamp(event, subscriber, action, data);
    await this.persistState(ctx, graphSlug, state);

    return {
      nodeId,
      eventId,
      subscriber,
      stamp: {
        action: stamp.action,
        stamped_at: stamp.stamped_at,
        data: stamp.data,
      },
      errors: [],
    };
  }

  // ============================================
  // State Access (Phase 8, Plan 032 — E2E support)
  // ============================================

  async loadGraphState(ctx: WorkspaceContext, graphSlug: string): Promise<State> {
    return this.loadState(ctx, graphSlug);
  }

  async persistGraphState(ctx: WorkspaceContext, graphSlug: string, state: State): Promise<void> {
    return this.persistState(ctx, graphSlug, state);
  }

  async markNodesInterrupted(
    ctx: WorkspaceContext,
    graphSlug: string,
    nodeIds: string[]
  ): Promise<void> {
    const state = await this.loadState(ctx, graphSlug);
    const nodes = state.nodes ?? {};
    const activeStatuses = new Set(['starting', 'agent-accepted']);
    for (const nodeId of nodeIds) {
      const entry = nodes[nodeId];
      if (entry && activeStatuses.has(entry.status)) {
        entry.status = 'interrupted';
      }
    }
    await this.persistState(ctx, graphSlug, state);
  }

  async resetGraphState(ctx: WorkspaceContext, graphSlug: string): Promise<void> {
    const state = await this.loadState(ctx, graphSlug);
    state.graph_status = 'pending';
    state.updated_at = new Date().toISOString();
    // Clear all node entries — absent nodes are implicitly pending
    state.nodes = {};
    state.transitions = {};
    state.questions = [];
    await this.persistState(ctx, graphSlug, state);
  }

  async restoreSnapshot(
    ctx: WorkspaceContext,
    graphSlug: string,
    definition: PositionalGraphDefinition,
    nodeConfigs: Record<string, NodeConfig>
  ): Promise<import('@chainglass/shared').BaseResult> {
    try {
      // Write graph.yaml
      await this.persistGraph(ctx, graphSlug, definition);

      // Write all node configs (ensure directories exist for deleted nodes)
      for (const [nodeId, config] of Object.entries(nodeConfigs)) {
        const nodeDir = this.getNodeDir(ctx, graphSlug, nodeId);
        const exists = await this.fs.exists(nodeDir);
        if (!exists) {
          await this.fs.mkdir(nodeDir, { recursive: true });
        }
        await this.persistNodeConfig(ctx, graphSlug, nodeId, config);
      }

      return { errors: [] };
    } catch (err) {
      return {
        errors: [
          {
            code: 'E999',
            message: `Snapshot restore failed: ${err instanceof Error ? err.message : 'unknown error'}`,
            action: 'Check file permissions and disk space',
          },
        ],
      };
    }
  }

  async loadAllNodeConfigs(
    ctx: WorkspaceContext,
    graphSlug: string
  ): Promise<{
    nodeConfigs: Record<string, NodeConfig>;
    errors: import('@chainglass/shared').ResultError[];
  }> {
    const loaded = await this.loadGraphDefinition(ctx, graphSlug);
    if (!loaded.ok) return { nodeConfigs: {}, errors: loaded.errors };

    const nodeConfigs: Record<string, NodeConfig> = {};
    const allNodeIds = this.getAllNodeIds(loaded.definition);

    for (const nodeId of allNodeIds) {
      const result = await this.loadNodeConfig(ctx, graphSlug, nodeId);
      if (result.ok) {
        nodeConfigs[nodeId] = result.config;
      }
    }

    return { nodeConfigs, errors: [] };
  }
}

/** Detect binary content by checking for control characters (avoids regex control char lint). */
function hasBinaryContent(sample: string): boolean {
  for (let i = 0; i < sample.length; i++) {
    const code = sample.charCodeAt(i);
    if ((code >= 0 && code <= 8) || (code >= 14 && code <= 31)) return true;
  }
  return false;
}
