# Execution Log — Phase 2: Implementation and Contract Tests

**Plan**: 061-workflow-events
**Phase**: Phase 2
**Started**: 2026-03-01

---

## T003: Observer Registry
- Created `packages/positional-graph/src/workflow-events/observer-registry.ts`
- globalThis-backed Map<string, Set<handler>> for HMR survival
- subscribe() returns unsubscribe closure, notify() has per-handler try/catch
- getObserverCount(), getObserverCountFor(), clear() for testing

## T001: WorkflowEventsService Core Methods
- Created `packages/positional-graph/src/workflow-events/workflow-events.service.ts`
- askQuestion: generates questionId → raiseNodeEvent('question:ask') → writes state.questions[] → notifies observers
- getAnswer: loads state, reads state.questions[], checks answered_at
- reportProgress: raiseNodeEvent('progress:update') → notifies progress + generic observers
- reportError: raiseNodeEvent('node:error') → notifies generic observers
- DYK-P2-02: accepts contextResolver in constructor (workspace-scoped)
- DYK-P2-03: NO CentralEventNotifier emission (deferred to Phase 3)
- Uses loadGraphState/persistGraphState (public PGService methods) for state access

## T002: answerQuestion 3-Event Handshake
- Finds ask event by scanning node event log (to get event_id for answer payload)
- Step 1: raiseNodeEvent('question:answer', {question_event_id, answer}, 'human')
- Updates state.questions[] with answer + timestamp
- Notifies observers after answer recorded (DYK-P2-04)
- Step 2: raiseNodeEvent('node:restart', {reason: 'question-answered'}, 'human')
- DYK-P2-04: If restart fails after answer succeeds, rethrows with descriptive message

## T004: Contract Tests
- Created `test/contracts/workflow-events.contract.ts` (factory pattern)
- Created `test/contracts/workflow-events.contract.test.ts` (runner)
- Split per DYK-P2-01: conformance tests (both impls) + behavioral tests (Fake only)
- Conformance: observer lifecycle (subscribe/unsubscribe), method existence — 10 tests x 2 impls
- Behavioral: askQuestion, answerQuestion, getAnswer, reportProgress, reportError, observer isolation, error isolation — 13 tests
- 33 tests total, all passing

## T005: DI Registration
- Added registerWorkflowEventsServices(container, contextResolver) to container.ts
- useFactory resolves PGService from container, creates ObserverRegistry
- contextResolver passed through (workspace-scoped, provided by caller)
- Exported from packages/positional-graph/src/index.ts barrel

## T006: MOVED TO PHASE 3
- PGService method deletion deferred until consumers migrated

## Verification
- `pnpm --filter @chainglass/positional-graph build`: compiles clean
- `pnpm test`: 335 files passed (+1), 4738 tests (+33), 0 failures
