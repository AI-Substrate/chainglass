import type {
  IEventHandlerService,
  ProcessGraphResult,
} from '@chainglass/positional-graph/features/032-node-event-system';
import type { State } from '@chainglass/positional-graph/schemas/state.schema';
import { describe, expect, it } from 'vitest';

/**
 * Contract tests for IEventHandlerService implementations.
 *
 * Per Critical Insight #2: contract tests are structural only.
 * FakeNES.handleEvents() is a no-op (no stamping), so idempotency
 * cannot be tested here — that's covered by T006 (dispatch) and T007 (integration).
 *
 * Usage:
 * ```typescript
 * eventHandlerServiceContractTests('FakeEventHandlerService', () => new FakeEventHandlerService());
 * eventHandlerServiceContractTests('EventHandlerService', () => new EventHandlerService(fakeNes));
 * ```
 */
export function eventHandlerServiceContractTests(
  name: string,
  createService: () => IEventHandlerService
) {
  describe(`${name} implements IEventHandlerService contract`, () => {
    it('should return all-zero ProcessGraphResult for empty graph', () => {
      /*
      Test Doc:
      - Why: Contract requires identical behavior for empty graphs
      - Contract: processGraph() on empty graph returns { nodesVisited: 0, eventsProcessed: 0, handlerInvocations: 0 }
      - Usage Notes: Run against both fake and real implementations
      - Quality Contribution: Ensures fake matches real for the degenerate case
      - Worked Example: empty state → processGraph() → all zeros
      */
      const service = createService();
      const state: State = {
        graph_slug: 'empty',
        version: '1.0.0',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const result = service.processGraph(state, 'test-subscriber', 'cli');

      expect(result).toEqual({
        nodesVisited: 0,
        eventsProcessed: 0,
        handlerInvocations: 0,
      });
    });

    it('should return ProcessGraphResult with correct type shape', () => {
      /*
      Test Doc:
      - Why: Contract requires return type has all three number fields
      - Contract: ProcessGraphResult has nodesVisited, eventsProcessed, handlerInvocations as numbers
      - Usage Notes: Run against both implementations
      - Quality Contribution: Catches missing/renamed fields in fake or real
      - Worked Example: any processGraph() call → result has three number fields
      */
      const service = createService();
      const state: State = {
        graph_slug: 'shape-test',
        version: '1.0.0',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        nodes: {},
      };

      const result: ProcessGraphResult = service.processGraph(state, 'sub', 'web');

      expect(typeof result.nodesVisited).toBe('number');
      expect(typeof result.eventsProcessed).toBe('number');
      expect(typeof result.handlerInvocations).toBe('number');
    });

    it('should handle undefined nodes gracefully', () => {
      /*
      Test Doc:
      - Why: Contract requires graceful handling of missing nodes
      - Contract: State without nodes property returns zero counts
      - Usage Notes: Old graph states may lack nodes
      - Quality Contribution: Prevents null reference errors
      - Worked Example: state with no nodes → all zeros
      */
      const service = createService();
      const state: State = {
        graph_slug: 'no-nodes',
        version: '1.0.0',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const result = service.processGraph(state, 'sub', 'cli');

      expect(result.nodesVisited).toBe(0);
      expect(result.eventsProcessed).toBe(0);
    });
  });
}
