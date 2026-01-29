/**
 * WorkGraphUIInstance - Phase 1 (T010) + Phase 3 (T016)
 *
 * Real implementation of IWorkGraphUIInstance (extends IWorkGraphUIInstanceCore).
 *
 * Responsibilities:
 * - Hold canonical state for a single WorkGraph
 * - Compute node statuses from DAG structure (pending/ready/disconnected)
 * - Preserve stored statuses (running, waiting-question, blocked-error, complete)
 * - Emit events on state changes
 * - Provide refresh mechanism for external updates
 * - Phase 3: Mutation methods for graph editing (addUnconnectedNode, addNodeAfter, etc.)
 *
 * Per Critical Discovery 01: pending/ready are COMPUTED, others are STORED
 * Per DYK#1: Default positions via vertical cascade {x: 100, y: index * 150}
 * Per DYK#1 (Phase 3): Disconnected nodes (no incoming edges, not start) get 'disconnected' status
 * Per DYK#2: refresh() only emits 'changed' if data actually differs
 * Per DYK#5: isDisposed flag checked before AND after async operations
 */

import type { BaseResult } from '@chainglass/shared';
import type { WorkspaceContext } from '@chainglass/workflow';
import type {
  GraphStatusResult,
  IWorkGraphService,
  NodeStatus,
  WorkGraphDefinition,
} from '@chainglass/workgraph';

import type {
  AddUnconnectedNodeResult,
  ConnectNodesResult,
  IWorkGraphUIInstance,
  Position,
  StoredNodeState,
  UIEdge,
  UINodeState,
  Unsubscribe,
  WorkGraphState,
  WorkGraphUIEvent,
  WorkGraphUIEventCallback,
} from './workgraph-ui.types';

// ============================================
// Status Computation
// ============================================

/**
 * Compute the status of a node based on DAG structure and stored state.
 *
 * Per Critical Discovery 01:
 * - If node has stored status (running, waiting-question, blocked-error, complete): use it
 * - Otherwise, compute from DAG:
 *   - If no incoming edges AND is 'start' node: 'ready'
 *   - If no incoming edges AND is NOT 'start' node: 'disconnected' (DYK#1 Phase 3)
 *   - If all upstream nodes are 'complete': 'ready'
 *   - Otherwise: 'pending'
 *
 * @param nodeId - The node to compute status for
 * @param edges - Graph edges
 * @param storedStatuses - Map of nodeId -> stored status
 * @param computedStatuses - Map of already computed statuses (for recursion)
 */
function computeNodeStatus(
  nodeId: string,
  edges: { from: string; to: string }[],
  storedStatuses: Map<string, StoredNodeState>,
  computedStatuses: Map<string, NodeStatus>
): NodeStatus {
  // Check if already computed (for diamond dependencies)
  const alreadyComputed = computedStatuses.get(nodeId);
  if (alreadyComputed) {
    return alreadyComputed;
  }

  // Check for stored status (overrides computed)
  const stored = storedStatuses.get(nodeId);
  if (stored) {
    computedStatuses.set(nodeId, stored.status);
    return stored.status;
  }

  // Find incoming edges (upstream nodes)
  const incomingEdges = edges.filter((e) => e.to === nodeId);

  // No incoming edges:
  // - 'start' node: always 'ready'
  // - Other nodes: 'disconnected' (dropped from toolbox, not yet wired) per DYK#1
  if (incomingEdges.length === 0) {
    const status: NodeStatus = nodeId === 'start' ? 'ready' : 'disconnected';
    computedStatuses.set(nodeId, status);
    return status;
  }

  // Check all upstream nodes
  const upstreamNodes = incomingEdges.map((e) => e.from);
  const allUpstreamComplete = upstreamNodes.every((upstreamId) => {
    const upstreamStatus = computeNodeStatus(upstreamId, edges, storedStatuses, computedStatuses);
    return upstreamStatus === 'complete';
  });

  const status: NodeStatus = allUpstreamComplete ? 'ready' : 'pending';
  computedStatuses.set(nodeId, status);
  return status;
}

/**
 * Compute statuses for all nodes in the graph.
 *
 * @param nodeIds - All node IDs in the graph
 * @param edges - Graph edges
 * @param storedStatuses - Map of nodeId -> stored status
 * @returns Map of nodeId -> computed status
 */
export function computeAllNodeStatuses(
  nodeIds: string[],
  edges: { from: string; to: string }[],
  storedStatuses: Map<string, StoredNodeState>
): Map<string, NodeStatus> {
  const computedStatuses = new Map<string, NodeStatus>();

  for (const nodeId of nodeIds) {
    computeNodeStatus(nodeId, edges, storedStatuses, computedStatuses);
  }

  return computedStatuses;
}

// ============================================
// Instance Implementation
// ============================================

/**
 * Real implementation of WorkGraphUIInstance.
 *
 * Holds the canonical state for a single WorkGraph.
 * Phase 3 extends with mutation methods for graph editing.
 */
export class WorkGraphUIInstance implements IWorkGraphUIInstance {
  readonly graphSlug: string;
  private _definition: WorkGraphDefinition;
  private _state: WorkGraphState;
  private _nodes: Map<string, UINodeState>;
  private _edges: UIEdge[];

  private readonly backend: IWorkGraphService;
  private readonly ctx: WorkspaceContext;
  private subscribers: Set<WorkGraphUIEventCallback> = new Set();
  private _isDisposed = false;

  // For change detection (DYK#2)
  private lastStateHash = '';

  // For position tracking of nodes (Phase 3)
  private nodePositions: Map<string, Position> = new Map();

  // Counter for generating unique node IDs
  private static nodeIdCounter = 0;

  constructor(
    graphSlug: string,
    definition: WorkGraphDefinition,
    statusResult: GraphStatusResult,
    backend: IWorkGraphService,
    ctx: WorkspaceContext
  ) {
    this.graphSlug = graphSlug;
    this._definition = definition;
    this.backend = backend;
    this.ctx = ctx;

    // Convert status result to WorkGraphState
    this._state = this.statusResultToState(statusResult);

    // Build initial nodes and edges
    this._nodes = this.buildNodesMap();
    this._edges = this.buildEdgesArray();

    // Store initial state hash for change detection
    this.lastStateHash = this.computeStateHash();
  }

  // ==================== Readonly Getters ====================

  get definition(): WorkGraphDefinition {
    return this._definition;
  }

  get state(): WorkGraphState {
    return this._state;
  }

  get nodes(): Map<string, UINodeState> {
    return this._nodes;
  }

  get edges(): UIEdge[] {
    return this._edges;
  }

  get isDisposed(): boolean {
    return this._isDisposed;
  }

  // ==================== State Building ====================

  private statusResultToState(statusResult: GraphStatusResult): WorkGraphState {
    const nodes: Record<string, StoredNodeState> = {};

    for (const nodeStatus of statusResult.nodes) {
      // Only store non-computed statuses
      if (
        ['running', 'waiting-question', 'blocked-error', 'complete'].includes(nodeStatus.status)
      ) {
        nodes[nodeStatus.id] = {
          status: nodeStatus.status as StoredNodeState['status'],
          started_at: nodeStatus.startedAt,
          completed_at: nodeStatus.completedAt,
          question_id: nodeStatus.questionId,
        };
      }
    }

    return {
      graph_status: statusResult.graphStatus,
      updated_at: new Date().toISOString(),
      nodes,
    };
  }

  private buildNodesMap(): Map<string, UINodeState> {
    const nodesMap = new Map<string, UINodeState>();

    // Convert stored state to Map for lookup
    const storedStatuses = new Map<string, StoredNodeState>();
    for (const [nodeId, nodeState] of Object.entries(this._state.nodes)) {
      storedStatuses.set(nodeId, nodeState);
    }

    // Compute all node statuses
    const computedStatuses = computeAllNodeStatuses(
      this._definition.nodes,
      this._definition.edges,
      storedStatuses
    );

    // Build UINodeState for each node
    this._definition.nodes.forEach((nodeId, index) => {
      const storedState = storedStatuses.get(nodeId);
      const status = computedStatuses.get(nodeId) ?? 'pending';

      // Per DYK#1: Default positions via vertical cascade
      const position: Position = { x: 100, y: index * 150 };

      const nodeState: UINodeState = {
        id: nodeId,
        status,
        position,
        type: nodeId === 'start' ? 'start' : undefined,
        questionId: storedState?.question_id,
      };

      nodesMap.set(nodeId, nodeState);
    });

    return nodesMap;
  }

  private buildEdgesArray(): UIEdge[] {
    return this._definition.edges.map((edge, index) => ({
      id: `edge-${index}`,
      source: edge.from,
      target: edge.to,
    }));
  }

  // ==================== Change Detection (DYK#2) ====================

  private computeStateHash(): string {
    // Simple JSON hash for change detection
    // In production, could use a more efficient algorithm
    return JSON.stringify({
      definition: this._definition,
      state: this._state,
    });
  }

  // ==================== Event System ====================

  subscribe(callback: WorkGraphUIEventCallback): Unsubscribe {
    if (this._isDisposed) {
      return () => {};
    }

    this.subscribers.add(callback);

    return () => {
      this.subscribers.delete(callback);
    };
  }

  private emit(event: WorkGraphUIEvent): void {
    if (this._isDisposed) {
      return;
    }

    for (const callback of this.subscribers) {
      callback(event);
    }
  }

  // ==================== Refresh (DYK#2, DYK#5) ====================

  async refresh(): Promise<void> {
    // Per DYK#5: Check disposed before async operation
    if (this._isDisposed) {
      return;
    }

    // Load fresh data from backend
    const [loadResult, statusResult] = await Promise.all([
      this.backend.load(this.ctx, this.graphSlug),
      this.backend.status(this.ctx, this.graphSlug),
    ]);

    // Per DYK#5: Check disposed AFTER async operation
    if (this._isDisposed) {
      return;
    }

    // Handle errors
    if (loadResult.errors.length > 0 || !loadResult.graph) {
      // Don't update on error, just return
      return;
    }

    // Update internal state
    this._definition = loadResult.graph;
    this._state = this.statusResultToState(statusResult);
    this._nodes = this.buildNodesMap();
    this._edges = this.buildEdgesArray();

    // Per DYK#2: Only emit if data changed
    const newHash = this.computeStateHash();
    if (newHash !== this.lastStateHash) {
      this.lastStateHash = newHash;
      this.emit({
        type: 'changed',
        graphSlug: this.graphSlug,
        timestamp: new Date().toISOString(),
      });
    }
  }

  // ==================== Dispose ====================

  dispose(): void {
    if (this._isDisposed) {
      return;
    }

    this._isDisposed = true;
    this.subscribers.clear();
  }

  // ==================== Phase 3: Mutation Methods ====================

  /**
   * Generate a unique temporary node ID for optimistic updates.
   * Will be replaced with real ID from backend.
   */
  private generateTempNodeId(): string {
    return `temp-node-${++WorkGraphUIInstance.nodeIdCounter}`;
  }

  /**
   * Add an unconnected node to the graph (UI drag-drop pattern).
   * Creates a node at the given position without any edges.
   * Node starts with 'disconnected' status per DYK#1.
   *
   * This is the UI pattern - node is dropped on canvas, user will wire it later.
   */
  async addUnconnectedNode(
    unitSlug: string,
    position: Position
  ): Promise<AddUnconnectedNodeResult> {
    if (this._isDisposed) {
      return { errors: [{ code: 'E999', message: 'Instance disposed' }] };
    }

    // Generate temp ID for optimistic update
    const tempNodeId = this.generateTempNodeId();

    // Optimistic update: add node to local state immediately
    const newNode: UINodeState = {
      id: tempNodeId,
      status: 'disconnected',
      position,
      unit: unitSlug,
    };
    this._nodes.set(tempNodeId, newNode);
    this.nodePositions.set(tempNodeId, position);

    // Emit change for UI update
    this.emitChanged();

    // TODO: T012 - Call API to persist node
    // For now, return success with temp ID
    // Real implementation will:
    // 1. Call POST /api/.../nodes with {unitSlug, position}
    // 2. On success: replace temp ID with real ID
    // 3. On failure: rollback (remove temp node, show error toast)

    return { errors: [], nodeId: tempNodeId };
  }

  /**
   * Add a node after an existing node (CLI/agent pattern).
   * Creates node with edge from predecessor and wires compatible inputs.
   */
  async addNodeAfter(afterNodeId: string, unitSlug: string): Promise<BaseResult> {
    if (this._isDisposed) {
      return { errors: [{ code: 'E999', message: 'Instance disposed' }] };
    }

    // Call backend to add node with edge
    const result = await this.backend.addNodeAfter(this.ctx, this.graphSlug, afterNodeId, unitSlug);

    if (result.errors.length === 0) {
      // Refresh to get updated graph state
      await this.refresh();
    }

    return result;
  }

  /**
   * Remove a node from the graph.
   * Single-node deletion only (no cascade) per Phase 3 scope.
   */
  async removeNode(nodeId: string): Promise<BaseResult> {
    if (this._isDisposed) {
      return { errors: [{ code: 'E999', message: 'Instance disposed' }] };
    }

    // Don't allow removing the start node
    if (nodeId === 'start') {
      return { errors: [{ code: 'E104', message: 'Cannot remove start node' }] };
    }

    // Call backend to remove node
    const result = await this.backend.removeNode(this.ctx, this.graphSlug, nodeId);

    if (result.errors.length === 0) {
      // Refresh to get updated graph state
      await this.refresh();
    }

    return result;
  }

  /**
   * Connect two nodes with an edge.
   * Validates type compatibility via backend.
   *
   * Note: T014a will add canConnect() to backend for validation.
   * For now, we attempt the connection and handle errors.
   */
  async connectNodes(
    sourceNodeId: string,
    sourceHandle: string,
    targetNodeId: string,
    targetHandle: string
  ): Promise<ConnectNodesResult> {
    if (this._isDisposed) {
      return { errors: [{ code: 'E999', message: 'Instance disposed' }], connected: false };
    }

    // TODO: T014 - Call POST /api/.../edges to create edge
    // For now, add edge optimistically to local state

    // Check if edge already exists
    const edgeExists = this._edges.some(
      (e) => e.source === sourceNodeId && e.target === targetNodeId
    );
    if (edgeExists) {
      return { errors: [{ code: 'E105', message: 'Edge already exists' }], connected: false };
    }

    // Optimistic update: add edge to local state
    const newEdge: UIEdge = {
      id: `edge-${crypto.randomUUID().slice(0, 8)}`,
      source: sourceNodeId,
      target: targetNodeId,
    };
    this._edges.push(newEdge);

    // Recompute node statuses (target node may now be ready/pending instead of disconnected)
    this._nodes = this.buildNodesMap();

    // Emit change for UI update
    this.emitChanged();

    return { errors: [], connected: true };
  }

  /**
   * Disconnect a node from its upstream connections.
   * Removes incoming edges, node becomes 'disconnected'.
   */
  async disconnectNode(nodeId: string): Promise<BaseResult> {
    if (this._isDisposed) {
      return { errors: [{ code: 'E999', message: 'Instance disposed' }] };
    }

    // Don't allow disconnecting the start node (it has no incoming edges anyway)
    if (nodeId === 'start') {
      return { errors: [{ code: 'E106', message: 'Cannot disconnect start node' }] };
    }

    // Remove all incoming edges to this node
    this._edges = this._edges.filter((e) => e.target !== nodeId);

    // Recompute node statuses
    this._nodes = this.buildNodesMap();

    // Emit change for UI update
    this.emitChanged();

    // TODO: T014 - Call API to persist edge removal
    return { errors: [] };
  }

  /**
   * Update a node's layout position.
   * Does not affect graph structure, only visual layout.
   */
  updateNodeLayout(nodeId: string, position: Position): void {
    if (this._isDisposed) {
      return;
    }

    const node = this._nodes.get(nodeId);
    if (node) {
      // Update position in the node state
      // Note: We need to create a new object to trigger React re-renders
      this._nodes.set(nodeId, {
        ...node,
        position,
      });
      this.nodePositions.set(nodeId, position);

      // Emit change for UI update
      this.emitChanged();
    }
  }

  /**
   * Helper to emit 'changed' event.
   */
  private emitChanged(): void {
    this.lastStateHash = this.computeStateHash();
    this.emit({
      type: 'changed',
      graphSlug: this.graphSlug,
      timestamp: new Date().toISOString(),
    });
  }
}
