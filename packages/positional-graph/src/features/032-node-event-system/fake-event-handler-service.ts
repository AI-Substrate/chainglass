import type { State } from '../../schemas/state.schema.js';
import type {
  IEventHandlerService,
  ProcessGraphResult,
} from './event-handler-service.interface.js';

// ── History Entry Type ──────────────────────────────────

export interface ProcessGraphHistoryEntry {
  state: State;
  subscriber: string;
  context: 'cli' | 'web';
}

// ── FakeEventHandlerService ─────────────────────────────

/**
 * Test fake for IEventHandlerService.
 *
 * Records all processGraph() calls for assertion. Returns a pre-configured
 * ProcessGraphResult (default: all zeros). Follows FakeNodeEventService pattern.
 */
export class FakeEventHandlerService implements IEventHandlerService {
  private history: ProcessGraphHistoryEntry[] = [];
  private result: ProcessGraphResult = {
    nodesVisited: 0,
    eventsProcessed: 0,
    handlerInvocations: 0,
  };

  // ── IEventHandlerService implementation ────────────────

  processGraph(state: State, subscriber: string, context: 'cli' | 'web'): ProcessGraphResult {
    this.history.push({ state, subscriber, context });
    return this.result;
  }

  // ── Test helpers ───────────────────────────────────────

  /** Get all processGraph() calls */
  getHistory(): readonly ProcessGraphHistoryEntry[] {
    return this.history;
  }

  /** Pre-configure the result returned by processGraph() */
  setResult(result: ProcessGraphResult): void {
    this.result = result;
  }

  /** Reset all state and history */
  reset(): void {
    this.history = [];
    this.result = {
      nodesVisited: 0,
      eventsProcessed: 0,
      handlerInvocations: 0,
    };
  }
}
