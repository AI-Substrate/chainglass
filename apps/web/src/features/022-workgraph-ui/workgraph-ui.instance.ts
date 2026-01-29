/**
 * WorkGraphUIInstance - Phase 1 (T010)
 *
 * Real implementation of IWorkGraphUIInstanceCore.
 *
 * Responsibilities:
 * - Hold canonical state for a single WorkGraph
 * - Compute node statuses from DAG structure (pending/ready)
 * - Preserve stored statuses (running, waiting-question, blocked-error, complete)
 * - Emit events on state changes
 * - Provide refresh mechanism for external updates
 *
 * Per Critical Discovery 01: pending/ready are COMPUTED, others are STORED
 * Per DYK#1: Default positions via vertical cascade {x: 100, y: index * 150}
 * Per DYK#2: refresh() only emits 'changed' if data actually differs
 * Per DYK#5: isDisposed flag checked before AND after async operations
 */

import type { WorkspaceContext } from '@chainglass/workflow';
import type {
  GraphStatusResult,
  IWorkGraphService,
  NodeStatus,
  WorkGraphDefinition,
} from '@chainglass/workgraph';

import type {
  IWorkGraphUIInstanceCore,
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
 *   - If no incoming edges (start node): 'ready'
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

  // No incoming edges = start node or orphan = ready
  if (incomingEdges.length === 0) {
    computedStatuses.set(nodeId, 'ready');
    return 'ready';
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
 */
export class WorkGraphUIInstance implements IWorkGraphUIInstanceCore {
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
}
