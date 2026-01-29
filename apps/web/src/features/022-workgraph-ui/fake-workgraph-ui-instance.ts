/**
 * FakeWorkGraphUIInstance - Phase 1 (T006)
 *
 * Fake implementation of IWorkGraphUIInstanceCore for testing.
 *
 * Per Constitution Principle 4: Fakes over Mocks
 * - Static factory methods for easy test setup
 * - Assertion helpers for verification
 * - Configurable state manipulation
 *
 * Per DYK#3 Naming Convention: Use as `fakeUIInstance` in tests
 */

import type { WorkGraphDefinition } from '@chainglass/workgraph';

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
// Factory Options
// ============================================

export interface FakeInstanceOptions {
  graphSlug?: string;
  nodes?: UINodeState[];
  edges?: UIEdge[];
  definition?: WorkGraphDefinition;
  state?: WorkGraphState;
}

// ============================================
// Fake Implementation
// ============================================

/**
 * Fake WorkGraphUIInstance for testing.
 *
 * Per DYK#3: Use as `fakeUIInstance` in tests.
 *
 * Usage:
 * ```typescript
 * // Simple factory
 * const fakeUIInstance = FakeWorkGraphUIInstance.withNodes([
 *   { id: 'start', status: 'complete', position: { x: 100, y: 0 } },
 *   { id: 'node-1', status: 'ready', position: { x: 100, y: 150 } },
 * ]);
 *
 * // Full factory
 * const fakeUIInstance = FakeWorkGraphUIInstance.withGraph('my-graph', {
 *   nodes: [...],
 *   edges: [...],
 * });
 *
 * // Trigger events for testing
 * fakeUIInstance.emitChanged();
 * expect(fakeUIInstance.wasRefreshCalled()).toBe(true);
 * ```
 */
export class FakeWorkGraphUIInstance implements IWorkGraphUIInstanceCore {
  readonly graphSlug: string;
  readonly definition: WorkGraphDefinition;
  readonly state: WorkGraphState;
  readonly nodes: Map<string, UINodeState>;
  readonly edges: UIEdge[];

  private subscribers: Set<WorkGraphUIEventCallback> = new Set();
  private refreshCalls: { timestamp: string }[] = [];
  private isDisposed = false;
  private disposeCalls: { timestamp: string }[] = [];

  // For testing: control refresh behavior
  private refreshDelay = 0;
  private dataChangedOnRefresh = true;

  constructor(options: FakeInstanceOptions = {}) {
    this.graphSlug = options.graphSlug ?? 'test-graph';

    // Build nodes Map
    this.nodes = new Map();
    if (options.nodes) {
      for (const node of options.nodes) {
        this.nodes.set(node.id, node);
      }
    } else {
      // Default: start node only
      this.nodes.set('start', {
        id: 'start',
        status: 'ready',
        position: { x: 100, y: 0 },
        type: 'start',
      });
    }

    // Build edges array
    this.edges = options.edges ?? [];

    // Build definition
    this.definition = options.definition ?? {
      slug: this.graphSlug,
      version: '1.0.0',
      createdAt: new Date().toISOString(),
      nodes: Array.from(this.nodes.keys()),
      edges: this.edges.map((e) => ({ from: e.source, to: e.target })),
    };

    // Build state
    this.state = options.state ?? {
      graph_status: 'pending',
      updated_at: new Date().toISOString(),
      nodes: {},
    };
  }

  // ==================== Static Factories ====================

  /**
   * Create instance with specific nodes.
   */
  static withNodes(nodes: UINodeState[]): FakeWorkGraphUIInstance {
    return new FakeWorkGraphUIInstance({ nodes });
  }

  /**
   * Create instance with graph slug and optional configuration.
   */
  static withGraph(
    graphSlug: string,
    options?: Omit<FakeInstanceOptions, 'graphSlug'>
  ): FakeWorkGraphUIInstance {
    return new FakeWorkGraphUIInstance({ ...options, graphSlug });
  }

  /**
   * Create instance from definition and state (like real implementation).
   */
  static fromDefinitionAndState(
    definition: WorkGraphDefinition,
    state: WorkGraphState
  ): FakeWorkGraphUIInstance {
    // Compute nodes from definition with vertical cascade positioning
    const nodes: UINodeState[] = definition.nodes.map((nodeId, index) => {
      const storedState = state.nodes[nodeId];
      return {
        id: nodeId,
        status: storedState?.status ?? 'pending',
        position: { x: 100, y: index * 150 },
        type: nodeId === 'start' ? 'start' : undefined,
      };
    });

    // Transform edges
    const edges: UIEdge[] = definition.edges.map((edge, index) => ({
      id: `edge-${index}`,
      source: edge.from,
      target: edge.to,
    }));

    return new FakeWorkGraphUIInstance({
      graphSlug: definition.slug,
      nodes,
      edges,
      definition,
      state,
    });
  }

  // ==================== IWorkGraphUIInstanceCore Implementation ====================

  subscribe(callback: WorkGraphUIEventCallback): Unsubscribe {
    if (this.isDisposed) {
      // Silently ignore subscriptions on disposed instance
      return () => {};
    }

    this.subscribers.add(callback);

    return () => {
      this.subscribers.delete(callback);
    };
  }

  async refresh(): Promise<void> {
    // Per DYK#5: Check disposed before async operation
    if (this.isDisposed) {
      return;
    }

    this.refreshCalls.push({ timestamp: new Date().toISOString() });

    // Simulate async delay if configured
    if (this.refreshDelay > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.refreshDelay));
    }

    // Per DYK#5: Check disposed AFTER async operation
    if (this.isDisposed) {
      return;
    }

    // Per DYK#2: Only emit if data changed
    if (this.dataChangedOnRefresh) {
      this.emitChanged();
    }
  }

  dispose(): void {
    if (this.isDisposed) {
      return; // Safe to call multiple times
    }

    this.disposeCalls.push({ timestamp: new Date().toISOString() });
    this.isDisposed = true;
    this.subscribers.clear();
  }

  // ==================== Test Helpers: Emitting Events ====================

  /**
   * Manually trigger 'changed' event for testing.
   */
  emitChanged(): void {
    if (this.isDisposed) {
      return;
    }

    const event: WorkGraphUIEvent = {
      type: 'changed',
      graphSlug: this.graphSlug,
      timestamp: new Date().toISOString(),
    };

    for (const callback of this.subscribers) {
      callback(event);
    }
  }

  /**
   * Manually trigger 'disposed' event for testing.
   */
  emitDisposed(): void {
    const event: WorkGraphUIEvent = {
      type: 'disposed',
      graphSlug: this.graphSlug,
      timestamp: new Date().toISOString(),
    };

    for (const callback of this.subscribers) {
      callback(event);
    }
  }

  // ==================== Test Helpers: Assertions ====================

  /**
   * Check if refresh() was called.
   */
  wasRefreshCalled(): boolean {
    return this.refreshCalls.length > 0;
  }

  /**
   * Get number of refresh() calls.
   */
  getRefreshCount(): number {
    return this.refreshCalls.length;
  }

  /**
   * Check if dispose() was called.
   */
  wasDisposed(): boolean {
    return this.isDisposed;
  }

  /**
   * Get current subscriber count.
   */
  getSubscriberCount(): number {
    return this.subscribers.size;
  }

  // ==================== Test Helpers: Configuration ====================

  /**
   * Configure refresh delay (ms) for async testing.
   */
  setRefreshDelay(delayMs: number): void {
    this.refreshDelay = delayMs;
  }

  /**
   * Configure whether refresh should emit 'changed'.
   * Per DYK#2: Use false to test no-change scenario.
   */
  setDataChangedOnRefresh(changed: boolean): void {
    this.dataChangedOnRefresh = changed;
  }

  /**
   * Update a node's status (for testing state changes).
   */
  updateNodeStatus(nodeId: string, status: UINodeState['status']): void {
    const node = this.nodes.get(nodeId);
    if (node) {
      // TypeScript won't let us mutate readonly, but for testing...
      (node as { status: UINodeState['status'] }).status = status;
    }
  }

  /**
   * Add a node (for testing dynamic graphs).
   */
  addNode(node: UINodeState): void {
    this.nodes.set(node.id, node);
  }

  /**
   * Reset call tracking for test isolation.
   */
  resetCalls(): void {
    this.refreshCalls = [];
    this.disposeCalls = [];
  }
}
