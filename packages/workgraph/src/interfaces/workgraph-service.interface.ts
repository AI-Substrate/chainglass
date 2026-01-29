/**
 * IWorkGraphService interface for managing WorkGraphs.
 *
 * WorkGraphs are DAGs of WorkNodes stored in `<worktree>/.chainglass/data/work-graphs/`.
 * This service provides graph creation, loading, viewing, and node operations.
 *
 * Per spec AC-01 through AC-08: Graph and node management operations.
 * Per Critical Discovery 02: All methods return results with errors array.
 * Per Insight 5: addNodeAfter/removeNode moved here from IWorkNodeService.
 * Per Plan 021: All methods accept WorkspaceContext as first parameter.
 */

import type { BaseResult } from '@chainglass/shared';
import type { WorkspaceContext } from '@chainglass/workflow';

// ============================================
// Result Types
// ============================================

/**
 * Graph status values.
 */
export type GraphStatus = 'pending' | 'in_progress' | 'complete' | 'failed';

/**
 * Node status values.
 *
 * - pending: Computed - upstream not complete
 * - ready: Computed - can be started
 * - disconnected: Computed - node has no incoming edges (dropped from toolbox, not yet wired)
 * - running: Stored - work in progress
 * - waiting-question: Stored - agent asked question
 * - blocked-error: Stored - agent reported error
 * - complete: Stored - finished successfully
 */
export type NodeStatus =
  | 'pending'
  | 'ready'
  | 'disconnected'
  | 'running'
  | 'waiting-question'
  | 'blocked-error'
  | 'complete';

/**
 * Edge in the graph.
 */
export interface GraphEdge {
  /** Source node ID */
  from: string;
  /** Target node ID */
  to: string;
}

/**
 * Input mapping for a node.
 */
export interface InputMapping {
  /** Source node ID */
  from: string;
  /** Source node's output name */
  output: string;
}

/**
 * Node configuration summary for show/status.
 */
export interface NodeSummary {
  /** Node ID */
  id: string;
  /** Unit slug (undefined for start node) */
  unit?: string;
  /** Node type (only for start node) */
  type?: 'start';
  /** Current status */
  status: NodeStatus;
  /** Input mappings */
  inputs: Record<string, InputMapping>;
}

/**
 * Result of creating a new graph.
 */
export interface GraphCreateResult extends BaseResult {
  /** Created graph slug */
  graphSlug: string;
  /** Path to created graph directory */
  path: string;
}

/**
 * WorkGraph definition (from work-graph.yaml).
 */
export interface WorkGraphDefinition {
  /** Graph slug */
  slug: string;
  /** Semantic version */
  version: string;
  /** Human-readable description */
  description?: string;
  /** ISO timestamp of creation */
  createdAt: string;
  /** Node IDs in the graph */
  nodes: string[];
  /** Edges between nodes */
  edges: GraphEdge[];
}

/**
 * Result of loading a graph.
 */
export interface GraphLoadResult extends BaseResult {
  /** Graph definition (undefined if errors) */
  graph?: WorkGraphDefinition;
  /** Graph status */
  status?: GraphStatus;
}

/**
 * Tree node for show output.
 */
export interface ShowTreeNode {
  /** Node ID */
  id: string;
  /** Unit slug (undefined for start) */
  unit?: string;
  /** Node type (only for start) */
  type?: 'start';
  /** Child nodes in the tree */
  children: ShowTreeNode[];
}

/**
 * Result of showing graph structure.
 */
export interface GraphShowResult extends BaseResult {
  /** Graph slug */
  graphSlug: string;
  /** Tree representation of the graph */
  tree: ShowTreeNode;
}

/**
 * Node status entry for status output.
 */
export interface NodeStatusEntry {
  /** Node ID */
  id: string;
  /** Unit slug (undefined for start) */
  unit?: string;
  /** Current status */
  status: NodeStatus;
  /** ISO timestamp when started */
  startedAt?: string;
  /** ISO timestamp when completed */
  completedAt?: string;
  /** Pending question ID (when status is 'waiting-question') */
  questionId?: string;
}

/**
 * Result of getting graph status.
 */
export interface GraphStatusResult extends BaseResult {
  /** Graph slug */
  graphSlug: string;
  /** Overall graph status */
  graphStatus: GraphStatus;
  /** Status of each node */
  nodes: NodeStatusEntry[];
}

/**
 * Options for adding a node.
 */
export interface AddNodeOptions {
  /** Configuration values for {{config.X}} placeholders */
  config?: Record<string, unknown>;
}

/**
 * Result of adding a node to the graph.
 */
export interface AddNodeResult extends BaseResult {
  /** Created node ID */
  nodeId: string;
  /** Input mappings that were wired */
  inputs: Record<string, InputMapping>;
}

/**
 * Result of adding an unconnected node (UI drag-drop).
 */
export interface AddUnconnectedNodeResult extends BaseResult {
  /** Created node ID */
  nodeId: string;
}

/**
 * Options for removing a node.
 */
export interface RemoveNodeOptions {
  /** Remove dependent nodes as well */
  cascade?: boolean;
}

/**
 * Result of removing a node from the graph.
 */
export interface RemoveNodeResult extends BaseResult {
  /** Removed node IDs (includes cascaded nodes) */
  removedNodes: string[];
}

/**
 * Result of canConnect() validation.
 */
export interface CanConnectResult extends BaseResult {
  /** Whether the connection is valid */
  valid: boolean;
}

/**
 * Result of connecting two nodes.
 */
export interface ConnectNodesResult extends BaseResult {
  /** Whether the connection was created */
  connected: boolean;
  /** The edge ID that was created (if successful) */
  edgeId?: string;
}

// ============================================
// Service Interface
// ============================================

/**
 * Service for managing WorkGraphs.
 *
 * Per spec AC-01: create() creates a new graph with start node.
 * Per spec AC-02: show() displays graph structure as tree.
 * Per spec AC-03: status() shows node execution states.
 * Per spec AC-04-06: addNodeAfter() adds nodes with validation.
 * Per spec AC-07-08: removeNode() removes nodes (with cascade option).
 */
export interface IWorkGraphService {
  /**
   * Create a new empty WorkGraph.
   *
   * @param ctx - Workspace context for path resolution
   * @param slug - Unique identifier for the graph
   * @returns GraphCreateResult with path to created graph
   */
  create(ctx: WorkspaceContext, slug: string): Promise<GraphCreateResult>;

  /**
   * Load a WorkGraph by slug.
   *
   * @param ctx - Workspace context for path resolution
   * @param slug - Graph identifier to load
   * @returns GraphLoadResult with graph definition or E101 error
   */
  load(ctx: WorkspaceContext, slug: string): Promise<GraphLoadResult>;

  /**
   * Show graph structure as a tree.
   *
   * @param ctx - Workspace context for path resolution
   * @param slug - Graph identifier
   * @returns GraphShowResult with tree representation
   */
  show(ctx: WorkspaceContext, slug: string): Promise<GraphShowResult>;

  /**
   * Get execution status of all nodes.
   *
   * @param ctx - Workspace context for path resolution
   * @param slug - Graph identifier
   * @returns GraphStatusResult with node statuses
   */
  status(ctx: WorkspaceContext, slug: string): Promise<GraphStatusResult>;

  /**
   * Add a node after an existing node.
   *
   * Validates that the unit's required inputs can be satisfied
   * by the predecessor's outputs. Returns E103 if inputs missing.
   * Returns E108 if adding would create a cycle.
   *
   * @param ctx - Workspace context for path resolution
   * @param graphSlug - Graph to add node to
   * @param afterNodeId - Node to add after
   * @param unitSlug - Unit to instantiate
   * @param options - Optional node configuration
   * @returns AddNodeResult with new node ID and input mappings
   */
  addNodeAfter(
    ctx: WorkspaceContext,
    graphSlug: string,
    afterNodeId: string,
    unitSlug: string,
    options?: AddNodeOptions
  ): Promise<AddNodeResult>;

  /**
   * Remove a node from the graph.
   *
   * Returns E102 if node has dependents (unless cascade=true).
   *
   * @param ctx - Workspace context for path resolution
   * @param graphSlug - Graph to remove node from
   * @param nodeId - Node to remove
   * @param options - Optional remove options (cascade)
   * @returns RemoveNodeResult with list of removed nodes
   */
  removeNode(
    ctx: WorkspaceContext,
    graphSlug: string,
    nodeId: string,
    options?: RemoveNodeOptions
  ): Promise<RemoveNodeResult>;

  /**
   * Check if two nodes can be connected.
   *
   * Supports two modes:
   * - **Auto-match mode**: When sourceOutput='' and targetInput='', checks if ANY
   *   source output name matches ANY target input name. Used by UI drag-drop.
   * - **Strict mode**: When specific port names provided, validates exact match.
   *   Used by CLI/programmatic access.
   *
   * @param ctx - Workspace context for path resolution
   * @param graphSlug - Graph containing the nodes
   * @param sourceNodeId - Node to connect from
   * @param sourceOutput - Output name ('' for auto-match mode)
   * @param targetNodeId - Node to connect to
   * @param targetInput - Input name ('' for auto-match mode)
   * @returns CanConnectResult with validation status and errors
   */
  canConnect(
    ctx: WorkspaceContext,
    graphSlug: string,
    sourceNodeId: string,
    sourceOutput: string,
    targetNodeId: string,
    targetInput: string
  ): Promise<CanConnectResult>;

  /**
   * Add an unconnected node (UI drag-drop pattern).
   *
   * Creates a node without any edges - used when dragging from toolbox.
   * The node starts with 'disconnected' status until wired.
   *
   * @param ctx - Workspace context for path resolution
   * @param graphSlug - Graph to add node to
   * @param unitSlug - Unit to instantiate
   * @returns AddUnconnectedNodeResult with new node ID
   */
  addUnconnectedNode(
    ctx: WorkspaceContext,
    graphSlug: string,
    unitSlug: string
  ): Promise<AddUnconnectedNodeResult>;

  /**
   * Connect two nodes by creating an edge.
   *
   * Per DYK#5: Uses canConnect() for type validation before creating edge.
   * Per DYK#1: Target node transitions from 'disconnected' to 'pending' when connected.
   *
   * @param ctx - Workspace context for path resolution
   * @param graphSlug - Graph to modify
   * @param sourceNodeId - Source node ID
   * @param targetNodeId - Target node ID
   * @returns ConnectNodesResult with success status and edge ID
   */
  connectNodes(
    ctx: WorkspaceContext,
    graphSlug: string,
    sourceNodeId: string,
    targetNodeId: string
  ): Promise<ConnectNodesResult>;
}
