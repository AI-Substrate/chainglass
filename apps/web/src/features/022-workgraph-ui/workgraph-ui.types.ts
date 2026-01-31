/**
 * WorkGraph UI Types - Phase 1 (T004)
 *
 * TypeScript interfaces for the headless WorkGraph UI state management layer.
 *
 * Per DYK#4: Phased interfaces
 * - IWorkGraphUIInstanceCore: Phase 1 read-only operations
 * - IWorkGraphUIInstance: Phase 3+ adds mutations (addNode, removeNode, etc.)
 *
 * Per DYK#1: UINodeState.position required, using vertical cascade default
 */

import type { BaseResult } from '@chainglass/shared';
import type { WorkspaceContext } from '@chainglass/workflow';
import type { GraphEdge, NodeStatus, WorkGraphDefinition } from '@chainglass/workgraph';

// ============================================
// Node Status (re-export for convenience)
// ============================================

export type { NodeStatus } from '@chainglass/workgraph';

// ============================================
// UI-Specific Types
// ============================================

/**
 * Position for React Flow node rendering.
 */
export interface Position {
  x: number;
  y: number;
}

/**
 * UI state for a single node.
 * Contains everything React Flow needs to render a node.
 */
export interface UINodeState {
  /** Node identifier (matches definition) */
  id: string;
  /** Computed or stored status */
  status: NodeStatus;
  /** Position for React Flow (default: vertical cascade per DYK#1) */
  position: Position;
  /** Unit slug (undefined for start node) */
  unit?: string;
  /** Node type (only for start node) */
  type?: 'start';
  /** Question ID if status is 'waiting-question' */
  questionId?: string;
  /** Error message if status is 'blocked-error' */
  errorMessage?: string;
}

/**
 * UI edge for React Flow.
 * Transformed from definition edges.
 */
export interface UIEdge {
  /** Unique edge ID */
  id: string;
  /** Source node ID */
  source: string;
  /** Target node ID */
  target: string;
}

/**
 * Event types emitted by WorkGraphUIInstance.
 */
export type WorkGraphUIEventType = 'changed' | 'disposed';

/**
 * Event payload for instance events.
 */
export interface WorkGraphUIEvent {
  type: WorkGraphUIEventType;
  graphSlug: string;
  /** Timestamp of event */
  timestamp: string;
}

/**
 * Callback type for event subscriptions.
 */
export type WorkGraphUIEventCallback = (event: WorkGraphUIEvent) => void;

/**
 * Unsubscribe function returned by subscribe().
 */
export type Unsubscribe = () => void;

// ============================================
// WorkGraph State (from state.json)
// ============================================

/**
 * Stored node state (from state.json).
 * Note: Only stored statuses are in state.json; pending/ready are computed.
 */
export interface StoredNodeState {
  status: 'running' | 'waiting-question' | 'blocked-error' | 'complete';
  started_at?: string;
  completed_at?: string;
  question_id?: string;
}

/**
 * WorkGraph runtime state (state.json).
 */
export interface WorkGraphState {
  graph_status: 'pending' | 'in_progress' | 'complete' | 'failed';
  updated_at: string;
  nodes: Record<string, StoredNodeState>;
}

// ============================================
// Service Result Types
// ============================================

/**
 * Generic mutation result for API operations.
 * Success indicated by empty errors array.
 */
export interface MutationResult extends BaseResult {
  /** Whether the operation was successful (convenience check) */
  success: boolean;
}

/**
 * Result of listing graphs.
 */
export interface ListGraphsResult extends BaseResult {
  graphSlugs: string[];
}

/**
 * Result of creating a graph.
 */
export interface CreateGraphResult extends BaseResult {
  instance?: IWorkGraphUIInstanceCore;
  graphSlug?: string;
}

/**
 * Result of deleting a graph.
 */
export interface DeleteGraphResult extends BaseResult {
  deleted: boolean;
}

// ============================================
// Instance Interface - Core (Phase 1)
// ============================================

/**
 * Core read-only interface for WorkGraphUIInstance.
 *
 * Phase 1 scope: Read state, subscribe to changes, refresh from backend.
 * No mutations (addNode, removeNode, etc.) until Phase 3.
 *
 * Per DYK#4: This interface is extended by IWorkGraphUIInstance in Phase 3.
 */
export interface IWorkGraphUIInstanceCore {
  /** Graph slug (readonly identifier) */
  readonly graphSlug: string;

  /** Graph definition (from work-graph.yaml) */
  readonly definition: WorkGraphDefinition;

  /** Graph state (from state.json) */
  readonly state: WorkGraphState;

  /** Node states with computed statuses */
  readonly nodes: Map<string, UINodeState>;

  /** Edges for React Flow */
  readonly edges: UIEdge[];

  /**
   * Subscribe to instance events.
   *
   * @param callback - Function called on events
   * @returns Unsubscribe function
   */
  subscribe(callback: WorkGraphUIEventCallback): Unsubscribe;

  /**
   * Refresh state from backend.
   *
   * Per DYK#2: Only emits 'changed' if data actually differs.
   * Per DYK#5: Silently returns if disposed during async operation.
   *
   * @returns Promise that resolves when refresh complete
   */
  refresh(): Promise<void>;

  /**
   * Dispose the instance and release resources.
   *
   * Safe to call multiple times.
   */
  dispose(): void;
}

/**
 * Result of add unconnected node operation.
 */
export interface AddUnconnectedNodeResult extends BaseResult {
  /** Created node ID */
  nodeId?: string;
}

/**
 * Result of connect nodes operation.
 */
export interface ConnectNodesResult extends BaseResult {
  /** Whether connection was successful */
  connected: boolean;
}

/**
 * Full interface for WorkGraphUIInstance (Phase 3+).
 *
 * Extends core with mutation methods.
 * Per DYK#2: Two add-node patterns:
 * - addUnconnectedNode: For UI drag-drop (creates disconnected node at position)
 * - addNodeAfter: For CLI/agents (creates node with edge to predecessor)
 */
export interface IWorkGraphUIInstance extends IWorkGraphUIInstanceCore {
  /**
   * Add an unconnected node to the graph (UI pattern).
   * Creates a node at the given position without any edges.
   * Node starts with 'disconnected' status per DYK#1.
   *
   * @param unitSlug - Unit to instantiate
   * @param position - Position for the new node
   * @returns Result with new node ID
   */
  addUnconnectedNode(unitSlug: string, position: Position): Promise<AddUnconnectedNodeResult>;

  /**
   * Add a node after an existing node (CLI/agent pattern).
   * Creates node with edge from predecessor and wires compatible inputs.
   *
   * @param afterNodeId - Node to add after
   * @param unitSlug - Unit to instantiate
   * @returns Result with new node ID
   */
  addNodeAfter(afterNodeId: string, unitSlug: string): Promise<BaseResult>;

  /**
   * Remove a node from the graph.
   * Cleans up edges and recomputes downstream statuses.
   * Single-node deletion only (no cascade) per Phase 3 scope.
   *
   * @param nodeId - Node to remove
   * @returns Result indicating success/failure
   */
  removeNode(nodeId: string): Promise<BaseResult>;

  /**
   * Connect two nodes with an edge.
   * Validates type compatibility via backend canConnect().
   *
   * @param sourceNodeId - Source node
   * @param sourceHandle - Output handle name
   * @param targetNodeId - Target node
   * @param targetHandle - Input handle name
   * @returns Result indicating success/failure (E103 on type mismatch)
   */
  connectNodes(
    sourceNodeId: string,
    sourceHandle: string,
    targetNodeId: string,
    targetHandle: string
  ): Promise<ConnectNodesResult>;

  /**
   * Disconnect a node from its upstream connections.
   * Removes incoming edges, node becomes 'disconnected'.
   * Used for rewiring support per DYK#2.
   *
   * @param nodeId - Node to disconnect
   * @returns Result indicating success/failure
   */
  disconnectNode(nodeId: string): Promise<BaseResult>;

  /**
   * Update a node's layout position.
   * Does not affect graph structure, only visual layout.
   *
   * @param nodeId - Node to update
   * @param position - New position
   */
  updateNodeLayout(nodeId: string, position: Position): void;
}

/**
 * Minimal interface for mutation-only API hook usage.
 * Used when full IWorkGraphUIInstance isn't available (e.g., client-side API hook).
 */
export interface IWorkGraphMutationAPI {
  /** Graph slug identifier */
  graphSlug: string;
  /** Nodes map (may be empty for API-only usage) */
  nodes: Map<string, UINodeState>;
  /** Edges array (may be empty for API-only usage) */
  edges: UIEdge[];
  /** Add unconnected node */
  addUnconnectedNode(unitSlug: string, position: Position): Promise<AddUnconnectedNodeResult>;
  /** Connect two nodes */
  connectNodes(
    sourceNodeId: string,
    sourceHandle: string,
    targetNodeId: string,
    targetHandle: string
  ): Promise<ConnectNodesResult>;
  /** Remove a node */
  removeNode(nodeId: string): Promise<BaseResult>;
  /** Update node layout */
  updateNodeLayout(nodeId: string, position: Position): void;
}

// ============================================
// Service Interface
// ============================================

/**
 * Service for managing WorkGraph UI instances.
 *
 * Singleton factory that:
 * - Caches instances by (worktreePath, graphSlug) key
 * - Delegates to IWorkGraphService for backend operations
 * - Manages instance lifecycle
 */
export interface IWorkGraphUIService {
  /**
   * Get or create a WorkGraphUIInstance.
   *
   * Returns cached instance if available, otherwise creates new.
   * Cache key: `${ctx.worktreePath}|${graphSlug}`
   *
   * @param ctx - Workspace context
   * @param graphSlug - Graph identifier
   * @returns Cached or new instance
   */
  getInstance(ctx: WorkspaceContext, graphSlug: string): Promise<IWorkGraphUIInstanceCore>;

  /**
   * List available graphs in workspace.
   *
   * @param ctx - Workspace context
   * @returns List of graph slugs
   */
  listGraphs(ctx: WorkspaceContext): Promise<ListGraphsResult>;

  /**
   * Create a new graph.
   *
   * @param ctx - Workspace context
   * @param slug - Graph slug
   * @returns Created instance or error
   */
  createGraph(ctx: WorkspaceContext, slug: string): Promise<CreateGraphResult>;

  /**
   * Delete a graph.
   *
   * Disposes cached instance and removes from backend.
   *
   * @param ctx - Workspace context
   * @param slug - Graph slug
   * @returns Success/failure
   */
  deleteGraph(ctx: WorkspaceContext, slug: string): Promise<DeleteGraphResult>;

  /**
   * Dispose all cached instances.
   *
   * Call on page unmount for cleanup.
   */
  disposeAll(): void;
}
