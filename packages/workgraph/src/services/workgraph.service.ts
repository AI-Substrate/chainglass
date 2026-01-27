/**
 * WorkGraphService - Real implementation of IWorkGraphService.
 *
 * Manages WorkGraphs stored in `.chainglass/work-graphs/`.
 * Per Phase 3: Implements create(), load(), show(), status() operations.
 *
 * Per ADR-0004: Uses constructor injection with useFactory pattern.
 * Per Critical Discovery 02: All methods return results with errors array.
 */

import type { IFileSystem, IPathResolver, IYamlParser } from '@chainglass/shared';

import { YamlParseError } from '@chainglass/shared';

import { atomicWriteFile, atomicWriteJson } from './atomic-file.js';

import {
  graphAlreadyExistsError,
  graphNotFoundError,
  invalidGraphSlugError,
  schemaValidationError,
  unimplementedFeatureError,
  yamlParseError,
} from '../errors/index.js';
import type { GraphStatus, WorkGraphDefinition } from '../interfaces/index.js';
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
  /** Base directory for work-graphs */
  private readonly graphsDir = '.chainglass/work-graphs';

  constructor(
    private readonly fs: IFileSystem,
    private readonly pathResolver: IPathResolver,
    private readonly yamlParser: IYamlParser
  ) {}

  /**
   * Create a new empty WorkGraph.
   *
   * Per spec AC-01: Creates directory structure, work-graph.yaml, and state.json.
   * Per DYK#1: Start node is stored with status 'complete'.
   * Per Discovery 10: Rejects paths with '..' for security.
   *
   * @param slug - Unique identifier for the graph
   * @returns GraphCreateResult with path to created graph
   */
  async create(slug: string): Promise<GraphCreateResult> {
    // Validate slug format and security (per Discovery 10)
    if (!this.isValidSlug(slug)) {
      return {
        graphSlug: slug,
        path: '',
        errors: [invalidGraphSlugError(slug)],
      };
    }

    // Check if graph already exists
    const graphPath = this.pathResolver.join(this.graphsDir, slug);
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
   *
   * @param slug - Graph identifier to load
   * @returns GraphLoadResult with graph definition or E101/E130/E132 error
   */
  async load(slug: string): Promise<GraphLoadResult> {
    // Validate slug format and security (per Discovery 10)
    if (!this.isValidSlug(slug)) {
      return {
        graph: undefined,
        status: undefined,
        errors: [invalidGraphSlugError(slug)],
      };
    }

    const graphPath = this.pathResolver.join(this.graphsDir, slug);
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
   *
   * @param slug - Graph identifier
   * @returns GraphShowResult with tree representation
   */
  async show(slug: string): Promise<GraphShowResult> {
    // Validate slug format and security (per Discovery 10)
    if (!this.isValidSlug(slug)) {
      return {
        graphSlug: slug,
        tree: { id: 'start', type: 'start', children: [] },
        errors: [invalidGraphSlugError(slug)],
      };
    }

    // Load graph first
    const loadResult = await this.load(slug);
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
   *
   * @param slug - Graph identifier
   * @returns GraphStatusResult with node statuses
   */
  async status(slug: string): Promise<GraphStatusResult> {
    // Validate slug format and security (per Discovery 10)
    if (!this.isValidSlug(slug)) {
      return {
        graphSlug: slug,
        graphStatus: 'pending',
        nodes: [],
        errors: [invalidGraphSlugError(slug)],
      };
    }

    const graphPath = this.pathResolver.join(this.graphsDir, slug);
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
    const loadResult = await this.load(slug);
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
   * @param graphSlug - Graph to add node to
   * @param afterNodeId - Node to add after
   * @param unitSlug - Unit to instantiate
   * @param options - Optional node configuration
   * @returns AddNodeResult with new node ID and input mappings
   */
  async addNodeAfter(
    graphSlug: string,
    afterNodeId: string,
    unitSlug: string,
    options?: AddNodeOptions
  ): Promise<AddNodeResult> {
    // Per CD02: Return error result, not throw
    // TODO: Implement in Phase 4
    return {
      nodeId: '',
      inputs: {},
      errors: [unimplementedFeatureError('addNodeAfter', 'Phase 4')],
    };
  }

  /**
   * Remove a node from the graph.
   *
   * @param graphSlug - Graph to remove node from
   * @param nodeId - Node to remove
   * @param options - Optional remove options (cascade)
   * @returns RemoveNodeResult with list of removed nodes
   */
  async removeNode(
    graphSlug: string,
    nodeId: string,
    options?: RemoveNodeOptions
  ): Promise<RemoveNodeResult> {
    // Per CD02: Return error result, not throw
    // TODO: Implement in Phase 4
    return {
      removedNodes: [],
      errors: [unimplementedFeatureError('removeNode', 'Phase 4')],
    };
  }
}
