/**
 * WorkGraphService - Real implementation of IWorkGraphService.
 *
 * Manages WorkGraphs stored in `<worktree>/.chainglass/data/work-graphs/`.
 * Per Phase 3: Implements create(), load(), show(), status() operations.
 * Per Phase 4: Implements addNodeAfter(), removeNode() operations.
 * Per Plan 021: All methods accept WorkspaceContext as first parameter.
 *
 * Per ADR-0004: Uses constructor injection with useFactory pattern.
 * Per Critical Discovery 02: All methods return results with errors array.
 * Per DYK#2: WorkUnitService is optional - if not provided, unit validation is skipped.
 */

import type { IFileSystem, IPathResolver, IYamlParser } from '@chainglass/shared';
import type { WorkspaceContext } from '@chainglass/workflow';

import { YamlParseError } from '@chainglass/shared';

import { atomicWriteFile, atomicWriteJson } from './atomic-file.js';
import { detectCycle } from './cycle-detection.js';
import { generateNodeId } from './node-id.js';

import {
  cannotRemoveWithDependentsError,
  cycleDetectedError,
  graphAlreadyExistsError,
  graphNotFoundError,
  invalidGraphSlugError,
  missingRequiredInputsError,
  nodeNotFoundError,
  schemaValidationError,
  unimplementedFeatureError,
  unitNotFoundError,
  yamlParseError,
} from '../errors/index.js';
import type {
  GraphStatus,
  IWorkUnitService,
  InputMapping,
  WorkGraphDefinition,
} from '../interfaces/index.js';
import type {
  AddNodeOptions,
  AddNodeResult,
  GraphCreateResult,
  GraphLoadResult,
  GraphShowResult,
  GraphStatusResult,
  IWorkGraphService,
  NodeStatus,
  NodeStatusEntry,
  RemoveNodeOptions,
  RemoveNodeResult,
  ShowTreeNode,
} from '../interfaces/index.js';
import { WorkGraphDefinitionSchema, WorkGraphStateSchema } from '../schemas/index.js';

/**
 * Real WorkGraph service implementation.
 *
 * Per spec AC-01: create() creates a new graph with start node.
 * Per spec AC-02: show() displays graph structure as tree.
 * Per spec AC-03: status() shows node execution states.
 */
export class WorkGraphService implements IWorkGraphService {
  // Note: graphsDir removed per Plan 021 Phase 2 T001
  // Path helpers added in T002-T003 derive from WorkspaceContext

  /**
   * @param fs - File system interface
   * @param pathResolver - Path resolution interface
   * @param yamlParser - YAML parsing interface
   * @param workUnitService - Optional WorkUnit service for unit validation (per DYK#2)
   */
  constructor(
    private readonly fs: IFileSystem,
    private readonly pathResolver: IPathResolver,
    private readonly yamlParser: IYamlParser,
    private readonly workUnitService?: IWorkUnitService
  ) {}

  // ============================================
  // Path Helpers (Plan 021 T002-T003)
  // ============================================

  /**
   * Get the work-graphs directory for a workspace.
   *
   * Per ADR-0008: Split storage model uses `<worktree>/.chainglass/data/work-graphs/`
   *
   * @param ctx - Workspace context
   * @returns Absolute path to work-graphs directory
   */
  protected getGraphsDir(ctx: WorkspaceContext): string {
    return this.pathResolver.join(ctx.worktreePath, '.chainglass/data/work-graphs');
  }

  /**
   * Get the path to a specific graph.
   *
   * @param ctx - Workspace context
   * @param slug - Graph identifier
   * @returns Absolute path to graph directory
   */
  protected getGraphPath(ctx: WorkspaceContext, slug: string): string {
    return this.pathResolver.join(this.getGraphsDir(ctx), slug);
  }

  /**
   * Create a new empty WorkGraph.
   *
   * Per spec AC-01: Creates directory structure, work-graph.yaml, and state.json.
   * Per DYK#1: Start node is stored with status 'complete'.
   * Per Discovery 10: Rejects paths with '..' for security.
   * Per Plan 021: Accepts WorkspaceContext as first parameter.
   *
   * @param ctx - Workspace context for path resolution
   * @param slug - Unique identifier for the graph
   * @returns GraphCreateResult with path to created graph
   */
  async create(ctx: WorkspaceContext, slug: string): Promise<GraphCreateResult> {
    // Validate slug format and security (per Discovery 10)
    if (!this.isValidSlug(slug)) {
      return {
        graphSlug: slug,
        path: '',
        errors: [invalidGraphSlugError(slug)],
      };
    }

    // Check if graph already exists
    const graphPath = this.getGraphPath(ctx, slug);
    if (await this.fs.exists(graphPath)) {
      return {
        graphSlug: slug,
        path: graphPath,
        errors: [graphAlreadyExistsError(slug)],
      };
    }

    // Create graph directory
    await this.fs.mkdir(graphPath, { recursive: true });

    // Create work-graph.yaml with start node (per CD03: atomic write)
    const graphDefinition = {
      slug,
      version: '1.0.0',
      created_at: new Date().toISOString(),
      nodes: ['start'],
      edges: [],
    };
    const graphYaml = this.yamlParser.stringify(graphDefinition);
    await atomicWriteFile(this.fs, this.pathResolver.join(graphPath, 'work-graph.yaml'), graphYaml);

    // Create state.json with start node complete (per DYK#1, CD03: atomic write)
    const stateData = {
      graph_status: 'pending',
      updated_at: new Date().toISOString(),
      nodes: {
        start: {
          status: 'complete',
        },
      },
    };
    await atomicWriteJson(this.fs, this.pathResolver.join(graphPath, 'state.json'), stateData);

    return {
      graphSlug: slug,
      path: graphPath,
      errors: [],
    };
  }

  /**
   * Validate slug format.
   * Per spec: lowercase with hyphens (e.g., my-workflow)
   * Per Discovery 10: No '..' for path security
   */
  private isValidSlug(slug: string): boolean {
    // Reject path traversal attempts
    if (slug.includes('..') || slug.includes('/') || slug.includes('\\')) {
      return false;
    }
    return /^[a-z][a-z0-9-]*$/.test(slug);
  }

  /**
   * Load a WorkGraph by slug.
   *
   * Reads work-graph.yaml (structure) and state.json (runtime state).
   * Validates both files against Zod schemas.
   * Per Plan 021: Accepts WorkspaceContext as first parameter.
   *
   * @param ctx - Workspace context for path resolution
   * @param slug - Graph identifier to load
   * @returns GraphLoadResult with graph definition or E101/E130/E132 error
   */
  async load(ctx: WorkspaceContext, slug: string): Promise<GraphLoadResult> {
    // Validate slug format and security (per Discovery 10)
    if (!this.isValidSlug(slug)) {
      return {
        graph: undefined,
        status: undefined,
        errors: [invalidGraphSlugError(slug)],
      };
    }

    const graphPath = this.getGraphPath(ctx, slug);
    const yamlPath = this.pathResolver.join(graphPath, 'work-graph.yaml');

    // Check if graph exists
    if (!(await this.fs.exists(yamlPath))) {
      return {
        graph: undefined,
        status: undefined,
        errors: [graphNotFoundError(slug)],
      };
    }

    // Read and parse work-graph.yaml
    let yamlContent: string;
    let parsedYaml: unknown;
    try {
      yamlContent = await this.fs.readFile(yamlPath);
      parsedYaml = this.yamlParser.parse<unknown>(yamlContent, yamlPath);
    } catch (err) {
      // Check for YamlParseError (by instanceof or by name for cross-package compat)
      if (
        err instanceof YamlParseError ||
        (err instanceof Error && err.name === 'YamlParseError')
      ) {
        return {
          graph: undefined,
          status: undefined,
          errors: [yamlParseError(yamlPath, err.message)],
        };
      }
      throw err;
    }

    // Validate with Zod schema
    const schemaResult = WorkGraphDefinitionSchema.safeParse(parsedYaml);
    if (!schemaResult.success) {
      const firstError = schemaResult.error.issues[0];
      const path = `/${firstError.path.join('/')}`;
      return {
        graph: undefined,
        status: undefined,
        errors: [schemaValidationError(path, firstError.message)],
      };
    }

    // Convert snake_case to camelCase for interface
    const zodGraph = schemaResult.data;
    const graph: WorkGraphDefinition = {
      slug: zodGraph.slug,
      version: zodGraph.version,
      description: zodGraph.description,
      createdAt: zodGraph.created_at,
      nodes: zodGraph.nodes,
      edges: zodGraph.edges,
    };

    // Read state.json
    const statePath = this.pathResolver.join(graphPath, 'state.json');
    let graphStatus: GraphStatus = 'pending';

    if (await this.fs.exists(statePath)) {
      try {
        const stateContent = await this.fs.readFile(statePath);
        const stateData = JSON.parse(stateContent);
        const stateResult = WorkGraphStateSchema.safeParse(stateData);

        if (stateResult.success) {
          graphStatus = stateResult.data.graph_status;
        }
      } catch {
        // State file issues are non-fatal - default to pending
      }
    }

    return {
      graph,
      status: graphStatus,
      errors: [],
    };
  }

  /**
   * Show graph structure as a tree.
   *
   * Per DYK#3: Returns structured TreeNode, not pre-rendered string.
   * Builds tree by traversing edges from start node using DFS.
   * Per Plan 021: Accepts WorkspaceContext as first parameter.
   *
   * @param ctx - Workspace context for path resolution
   * @param slug - Graph identifier
   * @returns GraphShowResult with tree representation
   */
  async show(ctx: WorkspaceContext, slug: string): Promise<GraphShowResult> {
    // Validate slug format and security (per Discovery 10)
    if (!this.isValidSlug(slug)) {
      return {
        graphSlug: slug,
        tree: { id: 'start', type: 'start', children: [] },
        errors: [invalidGraphSlugError(slug)],
      };
    }

    // Load graph first
    const loadResult = await this.load(ctx, slug);
    if (loadResult.errors.length > 0 || !loadResult.graph) {
      return {
        graphSlug: slug,
        tree: { id: 'start', type: 'start', children: [] },
        errors: loadResult.errors,
      };
    }

    const graph = loadResult.graph;

    // Build adjacency map: node -> children
    const adjacency = new Map<string, string[]>();
    for (const node of graph.nodes) {
      adjacency.set(node, []);
    }
    for (const edge of graph.edges) {
      const children = adjacency.get(edge.from) ?? [];
      children.push(edge.to);
      adjacency.set(edge.from, children);
    }

    // Build tree from start node using DFS
    const buildTree = (nodeId: string): ShowTreeNode => {
      const children = adjacency.get(nodeId) ?? [];
      const node: ShowTreeNode = {
        id: nodeId,
        children: children.map((childId) => buildTree(childId)),
      };

      // Add type/unit info
      if (nodeId === 'start') {
        node.type = 'start';
      } else {
        // Extract unit slug from node ID format: <unit-slug>-<hex3>
        node.unit = this.extractUnitSlug(nodeId);
      }

      return node;
    };

    const tree = buildTree('start');

    return {
      graphSlug: slug,
      tree,
      errors: [],
    };
  }

  /**
   * Extract unit slug from node ID.
   * Node ID format: <unit-slug>-<hex3> (e.g., "write-poem-a1b" → "write-poem")
   */
  private extractUnitSlug(nodeId: string): string {
    // Find the last hyphen followed by 3 hex chars
    const match = nodeId.match(/^(.+)-[a-f0-9]{3}$/);
    return match ? match[1] : nodeId;
  }

  /**
   * Get execution status of all nodes.
   *
   * Per DYK#1: Read stored status first, only compute if absent.
   * Computes 'pending' or 'ready' based on upstream node completion.
   * Per Plan 021: Accepts WorkspaceContext as first parameter.
   *
   * @param ctx - Workspace context for path resolution
   * @param slug - Graph identifier
   * @returns GraphStatusResult with node statuses
   */
  async status(ctx: WorkspaceContext, slug: string): Promise<GraphStatusResult> {
    // Validate slug format and security (per Discovery 10)
    if (!this.isValidSlug(slug)) {
      return {
        graphSlug: slug,
        graphStatus: 'pending',
        nodes: [],
        errors: [invalidGraphSlugError(slug)],
      };
    }

    const graphPath = this.getGraphPath(ctx, slug);
    const yamlPath = this.pathResolver.join(graphPath, 'work-graph.yaml');

    // Check if graph exists
    if (!(await this.fs.exists(yamlPath))) {
      return {
        graphSlug: slug,
        graphStatus: 'pending',
        nodes: [],
        errors: [graphNotFoundError(slug)],
      };
    }

    // Load graph and state
    const loadResult = await this.load(ctx, slug);
    if (loadResult.errors.length > 0 || !loadResult.graph) {
      return {
        graphSlug: slug,
        graphStatus: 'pending',
        nodes: [],
        errors: loadResult.errors,
      };
    }

    const graph = loadResult.graph;

    // Load state for stored node statuses
    const statePath = this.pathResolver.join(graphPath, 'state.json');
    let storedNodes: Record<
      string,
      {
        status: string;
        started_at?: string;
        completed_at?: string;
      }
    > = {};
    let graphStatus: GraphStatus = 'pending';

    if (await this.fs.exists(statePath)) {
      try {
        const stateContent = await this.fs.readFile(statePath);
        const stateData = JSON.parse(stateContent);
        const stateResult = WorkGraphStateSchema.safeParse(stateData);

        if (stateResult.success) {
          storedNodes = stateResult.data.nodes;
          graphStatus = stateResult.data.graph_status;
        }
      } catch {
        // State file issues are non-fatal
      }
    }

    // Build upstream map for status computation
    const upstreamNodes = new Map<string, string[]>();
    for (const node of graph.nodes) {
      upstreamNodes.set(node, []);
    }
    for (const edge of graph.edges) {
      const upstream = upstreamNodes.get(edge.to) ?? [];
      upstream.push(edge.from);
      upstreamNodes.set(edge.to, upstream);
    }

    // Build node status entries
    const nodes: NodeStatusEntry[] = graph.nodes.map((nodeId) => {
      const storedNode = storedNodes[nodeId];

      // Use stored status if present, otherwise compute
      let nodeStatus: NodeStatus;
      if (nodeId === 'start') {
        // Start node is always complete (per DYK#1)
        nodeStatus = 'complete';
      } else if (storedNode) {
        nodeStatus = storedNode.status as NodeStatus;
      } else {
        // Compute: ready if all upstream complete, else pending
        const upstream = upstreamNodes.get(nodeId) ?? [];
        const allUpstreamComplete = upstream.every((upId) => {
          const upNode = storedNodes[upId];
          return upNode?.status === 'complete';
        });
        nodeStatus = allUpstreamComplete ? 'ready' : 'pending';
      }

      const entry: NodeStatusEntry = {
        id: nodeId,
        status: nodeStatus,
      };

      // Add timestamps if present
      if (storedNode?.started_at) {
        entry.startedAt = storedNode.started_at;
      }
      if (storedNode?.completed_at) {
        entry.completedAt = storedNode.completed_at;
      }

      // Add unit slug for non-start nodes
      if (nodeId !== 'start') {
        entry.unit = this.extractUnitSlug(nodeId);
      }

      // Add pending questionId when status is 'waiting-question'
      if (nodeStatus === 'waiting-question' && nodeId !== 'start') {
        const pendingQuestionId = this.findPendingQuestionId(graphPath, nodeId);
        if (pendingQuestionId) {
          entry.questionId = pendingQuestionId;
        }
      }

      return entry;
    });

    return {
      graphSlug: slug,
      graphStatus,
      nodes,
      errors: [],
    };
  }

  /**
   * Add a node after an existing node.
   *
   * Per spec AC-04-06: Creates node with automatic input/output wiring.
   * Per DYK#1: Store unit_slug in node.yaml for parsing clarity.
   * Per DYK#3: Strict name matching for input wiring.
   * Per DYK#4: First node after start must have no required inputs.
   * Per Plan 021: Accepts WorkspaceContext as first parameter.
   *
   * @param ctx - Workspace context for path resolution
   * @param graphSlug - Graph to add node to
   * @param afterNodeId - Node to add after
   * @param unitSlug - Unit to instantiate
   * @param options - Optional node configuration
   * @returns AddNodeResult with new node ID and input mappings
   */
  async addNodeAfter(
    ctx: WorkspaceContext,
    graphSlug: string,
    afterNodeId: string,
    unitSlug: string,
    options?: AddNodeOptions
  ): Promise<AddNodeResult> {
    // 1. Validate slug format and security (per Discovery 10)
    if (!this.isValidSlug(graphSlug)) {
      return {
        nodeId: '',
        inputs: {},
        errors: [invalidGraphSlugError(graphSlug)],
      };
    }

    // 2. Load graph (returns E101 if not found)
    const loadResult = await this.load(ctx, graphSlug);
    if (loadResult.errors.length > 0 || !loadResult.graph) {
      return {
        nodeId: '',
        inputs: {},
        errors: loadResult.errors,
      };
    }

    const graph = loadResult.graph;

    // 3. Check afterNodeId exists in graph (E107)
    if (!graph.nodes.includes(afterNodeId)) {
      return {
        nodeId: '',
        inputs: {},
        errors: [nodeNotFoundError(graphSlug, afterNodeId)],
      };
    }

    // 4. Load unit to validate it exists and get input/output declarations (E120)
    if (this.workUnitService) {
      const unitResult = await this.workUnitService.load(ctx, unitSlug);
      if (unitResult.errors.length > 0 || !unitResult.unit) {
        return {
          nodeId: '',
          inputs: {},
          errors: unitResult.errors,
        };
      }

      const unit = unitResult.unit;

      // 5. Get available outputs from afterNode
      const availableOutputs = await this.getNodeOutputs(ctx, graphSlug, afterNodeId);

      // 6. Wire inputs (per DYK#3 - strict name matching)
      const inputs: Record<string, InputMapping> = {};
      const missingInputs: string[] = [];

      for (const input of unit.inputs) {
        if (input.required) {
          // Try to wire from afterNode's outputs (strict name match)
          if (availableOutputs.has(input.name)) {
            inputs[input.name] = {
              from: afterNodeId,
              output: input.name,
            };
          } else {
            missingInputs.push(input.name);
          }
        }
      }

      // 7. Return E103 if required inputs cannot be satisfied
      if (missingInputs.length > 0) {
        return {
          nodeId: '',
          inputs: {},
          errors: [missingRequiredInputsError(unitSlug, missingInputs)],
        };
      }

      // 8. Generate node ID
      const nodeId = generateNodeId(unitSlug, graph.nodes);

      // 9. Check for cycles (E108)
      const proposedEdge = { from: afterNodeId, to: nodeId };
      const allEdges = [...graph.edges, proposedEdge];
      const cycleResult = detectCycle(allEdges);

      if (cycleResult.hasCycle) {
        return {
          nodeId: '',
          inputs: {},
          errors: [cycleDetectedError(cycleResult.path ?? [])],
        };
      }

      // 10. Persist node.yaml with unit_slug (per DYK#1)
      const graphPath = this.getGraphPath(ctx, graphSlug);
      const nodePath = this.pathResolver.join(graphPath, 'nodes', nodeId);

      await this.fs.mkdir(nodePath, { recursive: true });

      const nodeConfig = {
        id: nodeId,
        unit_slug: unitSlug, // Per DYK#1: store explicitly
        created_at: new Date().toISOString(),
        config: options?.config ?? {},
        inputs,
      };

      const nodeYaml = this.yamlParser.stringify(nodeConfig);
      await atomicWriteFile(this.fs, this.pathResolver.join(nodePath, 'node.yaml'), nodeYaml);

      // 11. Update work-graph.yaml with new node and edge
      const updatedGraphDef = {
        slug: graph.slug,
        version: graph.version,
        description: graph.description,
        created_at: graph.createdAt,
        nodes: [...graph.nodes, nodeId],
        edges: allEdges,
      };

      const updatedYaml = this.yamlParser.stringify(updatedGraphDef);
      await atomicWriteFile(
        this.fs,
        this.pathResolver.join(graphPath, 'work-graph.yaml'),
        updatedYaml
      );

      // 12. Update state.json with new node (pending status)
      const statePath = this.pathResolver.join(graphPath, 'state.json');
      let stateData: Record<string, unknown> = {
        graph_status: 'pending',
        updated_at: new Date().toISOString(),
        nodes: {},
      };

      if (await this.fs.exists(statePath)) {
        try {
          const stateContent = await this.fs.readFile(statePath);
          stateData = JSON.parse(stateContent);
        } catch {
          // Use default state on error
        }
      }

      // Add new node to state (pending)
      const stateNodes = (stateData.nodes ?? {}) as Record<string, { status: string }>;
      stateNodes[nodeId] = { status: 'pending' };
      stateData.nodes = stateNodes;
      stateData.updated_at = new Date().toISOString();

      await atomicWriteJson(this.fs, statePath, stateData);

      return {
        nodeId,
        inputs,
        errors: [],
      };
    }

    // Without workUnitService, we can't validate units
    // Return unimplemented for now (tests should set up workUnitService)
    return {
      nodeId: '',
      inputs: {},
      errors: [unimplementedFeatureError('addNodeAfter without WorkUnitService', 'Phase 4')],
    };
  }

  /**
   * Get available outputs from a node.
   *
   * For start node: returns empty set (start has no outputs per DYK#4)
   * For unit nodes: returns outputs declared in the unit
   * Per Plan 021: Accepts WorkspaceContext as first parameter.
   */
  private async getNodeOutputs(
    ctx: WorkspaceContext,
    graphSlug: string,
    nodeId: string
  ): Promise<Set<string>> {
    if (nodeId === 'start') {
      // Per DYK#4: Start node has no outputs
      return new Set<string>();
    }

    // For unit nodes, we need to load the unit to get outputs
    if (this.workUnitService) {
      const unitSlug = this.extractUnitSlug(nodeId);
      const unitResult = await this.workUnitService.load(ctx, unitSlug);

      if (unitResult.unit) {
        return new Set(unitResult.unit.outputs.map((o) => o.name));
      }
    }

    return new Set<string>();
  }

  /**
   * Remove a node from the graph.
   *
   * Per spec AC-07-08: Remove leaf nodes or cascade removal.
   * Returns E102 if node has dependents and cascade is not set.
   * Start node cannot be removed.
   * Per Plan 021: Accepts WorkspaceContext as first parameter.
   *
   * @param ctx - Workspace context for path resolution
   * @param graphSlug - Graph to remove node from
   * @param nodeId - Node to remove
   * @param options - Optional remove options (cascade)
   * @returns RemoveNodeResult with list of removed nodes
   */
  async removeNode(
    ctx: WorkspaceContext,
    graphSlug: string,
    nodeId: string,
    options?: RemoveNodeOptions
  ): Promise<RemoveNodeResult> {
    // 1. Validate slug format and security (per Discovery 10)
    if (!this.isValidSlug(graphSlug)) {
      return {
        removedNodes: [],
        errors: [invalidGraphSlugError(graphSlug)],
      };
    }

    // 2. Load graph (returns E101 if not found)
    const loadResult = await this.load(ctx, graphSlug);
    if (loadResult.errors.length > 0 || !loadResult.graph) {
      return {
        removedNodes: [],
        errors: loadResult.errors,
      };
    }

    const graph = loadResult.graph;

    // 3. Check node exists in graph (E107)
    if (!graph.nodes.includes(nodeId)) {
      return {
        removedNodes: [],
        errors: [nodeNotFoundError(graphSlug, nodeId)],
      };
    }

    // 4. Reject removal of start node
    if (nodeId === 'start') {
      return {
        removedNodes: [],
        errors: [
          {
            code: 'E102',
            message: "Cannot remove 'start' node - it is protected",
            action: 'The start node is required for all graphs',
          },
        ],
      };
    }

    // 5. Find dependent nodes (nodes that have edges FROM this node)
    const dependents = this.findDependentNodes(graph, nodeId);

    // 6. If has dependents and no cascade, return E102
    if (dependents.length > 0 && !options?.cascade) {
      return {
        removedNodes: [],
        errors: [cannotRemoveWithDependentsError(nodeId, dependents)],
      };
    }

    // 7. Determine nodes to remove (node + dependents if cascade)
    const nodesToRemove = options?.cascade ? this.collectDependentTree(graph, nodeId) : [nodeId];

    // 8. Remove nodes from graph definition
    const remainingNodes = graph.nodes.filter((n) => !nodesToRemove.includes(n));
    const remainingEdges = graph.edges.filter(
      (e) => !nodesToRemove.includes(e.from) && !nodesToRemove.includes(e.to)
    );

    const graphPath = this.getGraphPath(ctx, graphSlug);

    // 9. Update work-graph.yaml
    const updatedGraphDef = {
      slug: graph.slug,
      version: graph.version,
      description: graph.description,
      created_at: graph.createdAt,
      nodes: remainingNodes,
      edges: remainingEdges,
    };

    const updatedYaml = this.yamlParser.stringify(updatedGraphDef);
    await atomicWriteFile(
      this.fs,
      this.pathResolver.join(graphPath, 'work-graph.yaml'),
      updatedYaml
    );

    // 10. Update state.json
    const statePath = this.pathResolver.join(graphPath, 'state.json');
    if (await this.fs.exists(statePath)) {
      try {
        const stateContent = await this.fs.readFile(statePath);
        const stateData = JSON.parse(stateContent) as Record<string, unknown>;
        const stateNodes = (stateData.nodes ?? {}) as Record<string, unknown>;

        // Remove deleted nodes from state
        for (const removedNode of nodesToRemove) {
          delete stateNodes[removedNode];
        }

        stateData.nodes = stateNodes;
        stateData.updated_at = new Date().toISOString();

        await atomicWriteJson(this.fs, statePath, stateData);
      } catch {
        // State update failure is non-fatal
      }
    }

    // 11. Delete node directories
    for (const removedNode of nodesToRemove) {
      const nodePath = this.pathResolver.join(graphPath, 'nodes', removedNode);
      try {
        if (await this.fs.exists(nodePath)) {
          await this.fs.rmdir(nodePath, { recursive: true });
        }
      } catch {
        // Directory deletion failure is non-fatal
      }
    }

    return {
      removedNodes: nodesToRemove,
      errors: [],
    };
  }

  /**
   * Check if two nodes can be connected.
   *
   * Validates that:
   * 1. Graph exists (E101)
   * 2. Both nodes exist in the graph (E107)
   * 3. Source output name matches target input name (E103)
   * 4. Connection wouldn't create a cycle (E108)
   *
   * Per DYK#5: Extracts validation logic from addNodeAfter for reuse.
   *
   * @param ctx - Workspace context for path resolution
   * @param graphSlug - Graph containing the nodes
   * @param sourceNodeId - Node to connect from
   * @param sourceOutput - Output name on source node
   * @param targetNodeId - Node to connect to
   * @param targetInput - Input name on target node
   * @returns CanConnectResult with validation status and errors
   */
  async canConnect(
    ctx: WorkspaceContext,
    graphSlug: string,
    sourceNodeId: string,
    sourceOutput: string,
    targetNodeId: string,
    targetInput: string
  ): Promise<import('../interfaces/index.js').CanConnectResult> {
    // 1. Validate slug format and security
    if (!this.isValidSlug(graphSlug)) {
      return {
        valid: false,
        errors: [invalidGraphSlugError(graphSlug)],
      };
    }

    // 2. Load graph (returns E101 if not found)
    const loadResult = await this.load(ctx, graphSlug);
    if (loadResult.errors.length > 0 || !loadResult.graph) {
      return {
        valid: false,
        errors: loadResult.errors,
      };
    }

    const graph = loadResult.graph;

    // 3. Check source node exists (E107)
    if (!graph.nodes.includes(sourceNodeId)) {
      return {
        valid: false,
        errors: [nodeNotFoundError(graphSlug, sourceNodeId)],
      };
    }

    // 4. Check target node exists (E107)
    if (!graph.nodes.includes(targetNodeId)) {
      return {
        valid: false,
        errors: [nodeNotFoundError(graphSlug, targetNodeId)],
      };
    }

    // 5. Validate output exists on source and input exists on target (E103)
    // Uses strict name matching per DYK#3
    const sourceOutputs = await this.getNodeOutputs(ctx, graphSlug, sourceNodeId);
    if (!sourceOutputs.has(sourceOutput)) {
      return {
        valid: false,
        errors: [
          {
            code: 'E103',
            message: `Source node '${sourceNodeId}' does not have output '${sourceOutput}'`,
            action: `Available outputs: ${[...sourceOutputs].join(', ') || 'none'}`,
          },
        ],
      };
    }

    // 6. Validate input exists on target
    if (this.workUnitService) {
      const targetUnit = this.extractUnitSlug(targetNodeId);
      const unitResult = await this.workUnitService.load(ctx, targetUnit);
      if (unitResult.unit) {
        const inputNames = new Set(unitResult.unit.inputs.map((i) => i.name));
        if (!inputNames.has(targetInput)) {
          return {
            valid: false,
            errors: [
              {
                code: 'E103',
                message: `Target node '${targetNodeId}' does not have input '${targetInput}'`,
                action: `Available inputs: ${[...inputNames].join(', ') || 'none'}`,
              },
            ],
          };
        }
      }
    }

    // 7. Strict name matching per DYK#3 - output name must match input name
    if (sourceOutput !== targetInput) {
      return {
        valid: false,
        errors: [missingRequiredInputsError(targetNodeId, [targetInput])],
      };
    }

    // 8. Check for cycles (E108)
    const proposedEdge = { from: sourceNodeId, to: targetNodeId };
    const allEdges = [...graph.edges, proposedEdge];
    const cycleResult = detectCycle(allEdges);

    if (cycleResult.hasCycle) {
      return {
        valid: false,
        errors: [cycleDetectedError(cycleResult.path ?? [])],
      };
    }

    return {
      valid: true,
      errors: [],
    };
  }

  /**
   * Find nodes that directly depend on a given node.
   * A node B depends on node A if there's an edge A→B.
   */
  private findDependentNodes(graph: WorkGraphDefinition, nodeId: string): string[] {
    return graph.edges.filter((e) => e.from === nodeId).map((e) => e.to);
  }

  /**
   * Collect all nodes in the dependent tree (BFS).
   * Returns the node itself plus all transitive dependents.
   */
  private collectDependentTree(graph: WorkGraphDefinition, nodeId: string): string[] {
    const result: string[] = [];
    const visited = new Set<string>();
    const queue = [nodeId];

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) continue;
      if (visited.has(current)) continue;

      visited.add(current);
      result.push(current);

      // Add dependents to queue
      const dependents = this.findDependentNodes(graph, current);
      for (const dep of dependents) {
        if (!visited.has(dep)) {
          queue.push(dep);
        }
      }
    }

    return result;
  }

  /**
   * Find the pending question ID for a node in waiting-question state.
   *
   * A pending question is one that exists in data.questions but not in data.answers.
   * Returns the first (most recent) pending question ID, or undefined if none found.
   */
  private findPendingQuestionId(graphPath: string, nodeId: string): string | undefined {
    try {
      const dataPath = this.pathResolver.join(graphPath, 'nodes', nodeId, 'data', 'data.json');

      // Use sync read since getStatus is sync (returns Promise but builds data synchronously)
      // This is a limitation - ideally we'd refactor getStatus to be fully async
      const fs = require('node:fs');
      if (!fs.existsSync(dataPath)) {
        return undefined;
      }

      const content = fs.readFileSync(dataPath, 'utf-8');
      const data = JSON.parse(content) as {
        questions?: Record<string, unknown>;
        answers?: Record<string, unknown>;
      };

      const questions = data.questions ?? {};
      const answers = data.answers ?? {};

      // Find question IDs that don't have answers
      const pendingIds = Object.keys(questions).filter((qId) => !(qId in answers));

      // Return the most recent (last in list since questions are added chronologically)
      return pendingIds.length > 0 ? pendingIds[pendingIds.length - 1] : undefined;
    } catch {
      return undefined;
    }
  }
}
