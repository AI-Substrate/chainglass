/*
Test Doc:
- Why: Contract tests ensure FakeEventHandlerService and EventHandlerService behave identically for structural invariants (Critical Insight #2)
- Contract: Both implementations return identical ProcessGraphResult for empty graphs and correct type shapes
- Usage Notes: Idempotency is NOT tested here (FakeNES doesn't stamp) — see T006/T007
- Quality Contribution: Catches fake drift — if real changes behavior, contract tests catch the mismatch
- Worked Example: Empty state → processGraph() → { 0, 0, 0 } for BOTH fake and real
*/

import { describe } from 'vitest';

import { FakeNodeEventService } from '@chainglass/positional-graph/features/032-node-event-system';
import { EventHandlerService } from '@chainglass/positional-graph/features/032-node-event-system/event-handler-service';
import { FakeEventHandlerService } from '@chainglass/positional-graph/features/032-node-event-system/fake-event-handler-service';

import { eventHandlerServiceContractTests } from './event-handler-service.contract.js';

describe('IEventHandlerService Contract', () => {
  eventHandlerServiceContractTests('FakeEventHandlerService', () => new FakeEventHandlerService());

  eventHandlerServiceContractTests(
    'EventHandlerService',
    () => new EventHandlerService(new FakeNodeEventService())
  );
});
