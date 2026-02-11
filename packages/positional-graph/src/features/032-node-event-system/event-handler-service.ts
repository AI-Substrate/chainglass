import type { State } from '../../schemas/state.schema.js';
import type {
  IEventHandlerService,
  ProcessGraphResult,
} from './event-handler-service.interface.js';
import type { INodeEventService } from './node-event-service.interface.js';

/**
 * Graph-wide event processor — the "Settle" phase of Settle → Decide → Act.
 *
 * Single dependency: INodeEventService (Workshop 12 Part 6).
 * Iterates all nodes, counts unstamped events BEFORE calling handleEvents
 * (Critical Insight #1 — handlers stamp inside the loop).
 */
export class EventHandlerService implements IEventHandlerService {
  private readonly nodeEventService: INodeEventService;

  constructor(nodeEventService: INodeEventService) {
    this.nodeEventService = nodeEventService;
  }

  processGraph(state: State, subscriber: string, context: 'cli' | 'web'): ProcessGraphResult {
    const nodes = state.nodes ?? {};
    const nodeIds = Object.keys(nodes);

    let eventsProcessed = 0;
    let handlerInvocations = 0;

    for (const nodeId of nodeIds) {
      // Count BEFORE handling (Critical Insight #1)
      const unstamped = this.nodeEventService.getUnstampedEvents(state, nodeId, subscriber);

      if (unstamped.length > 0) {
        eventsProcessed += unstamped.length;
        handlerInvocations += unstamped.length; // Approximation (Critical Insight #3)
        this.nodeEventService.handleEvents(state, nodeId, subscriber, context);
      }
    }

    return {
      nodesVisited: nodeIds.length,
      eventsProcessed,
      handlerInvocations,
    };
  }
}
