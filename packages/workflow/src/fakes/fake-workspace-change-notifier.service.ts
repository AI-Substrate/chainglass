/**
 * Fake Workspace Change Notifier Service for unit testing.
 *
 * Per Subtask 001: WorkspaceChangeNotifierService - File Watching for CLI Changes
 * Per Constitution Principle 4: Use fakes over mocks for testing
 *
 * This fake provides:
 * - Programmatic event emission (emitGraphChanged)
 * - Call tracking for all methods
 * - Configurable behavior via stub methods
 *
 * Example usage in tests:
 * ```typescript
 * const fakeNotifier = new FakeWorkspaceChangeNotifierService();
 *
 * // Register callback
 * const events: GraphChangedEvent[] = [];
 * fakeNotifier.onGraphChanged(e => events.push(e));
 *
 * // Start and simulate event
 * await fakeNotifier.start();
 * fakeNotifier.emitGraphChanged({
 *   graphSlug: 'demo-graph',
 *   workspaceSlug: 'my-workspace',
 *   worktreePath: '/path/to/workspace',
 *   filePath: '/path/to/workspace/.chainglass/data/work-graphs/demo-graph/state.json',
 *   timestamp: new Date(),
 * });
 *
 * expect(events).toHaveLength(1);
 * expect(events[0].graphSlug).toBe('demo-graph');
 * ```
 */

import type {
  GraphChangedCallback,
  GraphChangedEvent,
  IWorkspaceChangeNotifierService,
} from '../interfaces/workspace-change-notifier.interface.js';

/**
 * Record of a start() call.
 */
export interface StartCall {
  timestamp: Date;
}

/**
 * Record of a stop() call.
 */
export interface StopCall {
  timestamp: Date;
}

/**
 * Record of an onGraphChanged() call.
 */
export interface OnGraphChangedCall {
  callback: GraphChangedCallback;
  timestamp: Date;
}

/**
 * Record of a rescan() call.
 */
export interface RescanCall {
  timestamp: Date;
}

/**
 * Fake implementation of IWorkspaceChangeNotifierService for unit testing.
 */
export class FakeWorkspaceChangeNotifierService implements IWorkspaceChangeNotifierService {
  // ═══════════════════════════════════════════════════════════════
  // Call tracking - record all method invocations
  // ═══════════════════════════════════════════════════════════════

  /** All start() calls */
  public readonly startCalls: StartCall[] = [];

  /** All stop() calls */
  public readonly stopCalls: StopCall[] = [];

  /** All onGraphChanged() calls */
  public readonly onGraphChangedCalls: OnGraphChangedCall[] = [];

  /** All rescan() calls */
  public readonly rescanCalls: RescanCall[] = [];

  // ═══════════════════════════════════════════════════════════════
  // Internal state
  // ═══════════════════════════════════════════════════════════════

  private callbacks = new Set<GraphChangedCallback>();
  private watching = false;

  // ═══════════════════════════════════════════════════════════════
  // Stub configuration - customize behavior for specific tests
  // ═══════════════════════════════════════════════════════════════

  /** If set, start() will throw this error */
  public startError: Error | null = null;

  /** If set, stop() will throw this error */
  public stopError: Error | null = null;

  /** If set, rescan() will throw this error */
  public rescanError: Error | null = null;

  // ═══════════════════════════════════════════════════════════════
  // IWorkspaceChangeNotifierService interface implementation
  // ═══════════════════════════════════════════════════════════════

  async start(): Promise<void> {
    this.startCalls.push({ timestamp: new Date() });

    if (this.startError) {
      throw this.startError;
    }

    if (this.watching) {
      throw new Error('WorkspaceChangeNotifierService is already watching');
    }

    this.watching = true;
  }

  async stop(): Promise<void> {
    this.stopCalls.push({ timestamp: new Date() });

    if (this.stopError) {
      throw this.stopError;
    }

    this.watching = false;
    this.callbacks.clear();
  }

  onGraphChanged(callback: GraphChangedCallback): () => void {
    this.onGraphChangedCalls.push({ callback, timestamp: new Date() });

    this.callbacks.add(callback);

    return () => {
      this.callbacks.delete(callback);
    };
  }

  isWatching(): boolean {
    return this.watching;
  }

  async rescan(): Promise<void> {
    this.rescanCalls.push({ timestamp: new Date() });

    if (this.rescanError) {
      throw this.rescanError;
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // TEST HOOKS - programmatic event emission for unit tests
  // ═══════════════════════════════════════════════════════════════

  /**
   * Emit a GraphChangedEvent to all registered callbacks.
   *
   * Use this in tests to simulate file changes without real filesystem.
   *
   * @param event - Event to emit
   */
  emitGraphChanged(event: GraphChangedEvent): void {
    for (const callback of this.callbacks) {
      try {
        callback(event);
      } catch (err) {
        console.error('Error in GraphChangedEvent callback:', err);
      }
    }
  }

  /**
   * Create a convenience GraphChangedEvent with defaults.
   *
   * @param overrides - Partial event data to override defaults
   * @returns Complete GraphChangedEvent
   */
  createEvent(overrides: Partial<GraphChangedEvent> = {}): GraphChangedEvent {
    const defaults: GraphChangedEvent = {
      graphSlug: 'test-graph',
      workspaceSlug: 'test-workspace',
      worktreePath: '/home/user/workspace',
      filePath: '/home/user/workspace/.chainglass/data/work-graphs/test-graph/state.json',
      timestamp: new Date(),
    };
    return { ...defaults, ...overrides };
  }

  /**
   * Get the number of currently registered callbacks.
   *
   * @returns Number of callbacks
   */
  getCallbackCount(): number {
    return this.callbacks.size;
  }

  /**
   * Set the watching state directly (for testing edge cases).
   *
   * @param watching - Whether service should report as watching
   */
  setWatching(watching: boolean): void {
    this.watching = watching;
  }

  /**
   * Reset all call tracking and state.
   *
   * Call this between tests to ensure isolation.
   */
  reset(): void {
    this.startCalls.length = 0;
    this.stopCalls.length = 0;
    this.onGraphChangedCalls.length = 0;
    this.rescanCalls.length = 0;
    this.callbacks.clear();
    this.watching = false;
    this.startError = null;
    this.stopError = null;
    this.rescanError = null;
  }
}
