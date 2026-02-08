import type { State } from '../../schemas/state.schema.js';

/**
 * Result of a processGraph() call.
 *
 * `nodesVisited` counts every node in the graph (including nodes with no events).
 * `eventsProcessed` counts unstamped events that were passed to handleEvents().
 * `handlerInvocations` is an approximation equal to `eventsProcessed` — true
 * per-handler counts are unavailable because handleEvents() returns void.
 */
export interface ProcessGraphResult {
  readonly nodesVisited: number;
  readonly eventsProcessed: number;
  readonly handlerInvocations: number;
}

/**
 * Graph-wide event processor — the "Settle" phase of Settle → Decide → Act.
 *
 * Iterates every node in a graph, finds unstamped events for the given subscriber,
 * delegates per-node handling to INodeEventService, and returns aggregate counts.
 *
 * Internal collaborator — not a public DI token.
 */
export interface IEventHandlerService {
  /**
   * Process all unstamped events across the entire graph.
   *
   * For each node: calls getUnstampedEvents() BEFORE handleEvents()
   * (critical — handlers stamp inside the loop, so counting must precede handling).
   *
   * Idempotent: a second call with the same subscriber returns eventsProcessed: 0
   * (all events now stamped from the first call).
   */
  processGraph(state: State, subscriber: string, context: 'cli' | 'web'): ProcessGraphResult;
}
