# WorkflowEvents — Implementation Plan

**Plan Version**: 1.0.0
**Created**: 2026-03-01
**Spec**: [workflow-events-spec.md](./workflow-events-spec.md)
**Status**: DRAFT
**Mode**: Full

## Summary

Workflow event interactions (QnA, progress, errors) are scattered across 88+ files using raw event primitives. Developers must understand the 5-step raiseEvent pipeline, VALID_FROM_STATES, handler stamping, and 3-event QnA handshakes to do simple things. This plan creates a `workflow-events` domain with intent-based APIs (`askQuestion`, `answerQuestion`, `reportProgress`, observer hooks), typed constants, and a Fake test double. Then migrates all CLI commands, web actions, test helpers, and E2E scripts to use the convenience layer. Four phases: interface + types, implementation + tests, consumer migration, E2E updates + docs.

## Target Domains

| Domain | Status | Relationship | Role |
|--------|--------|-------------|------|
| workflow-events | **NEW** | **create** | IWorkflowEvents interface, implementation, fake, typed constants, observer hooks |
| _platform/positional-graph | existing | **consume** | Underlying event infrastructure: IPositionalGraphService Q&A + raiseNodeEvent methods |
| _platform/events | existing | **consume** | SSE transport: CentralEventNotifierService for observer-triggered broadcasts |
| workflow-ui | existing | **modify** | Web server actions delegate to WorkflowEvents |
| agents | existing | **consume** | Future: AgentWorkUnitBridge subscribes to observer hooks |

## Domain Manifest

| File | Domain | Classification | Rationale |
|------|--------|---------------|-----------|
| `packages/shared/src/interfaces/workflow-events.interface.ts` | workflow-events | contract | IWorkflowEvents interface |
| `packages/shared/src/workflow-events/types.ts` | workflow-events | contract | QuestionInput, AnswerInput, AnswerResult, ProgressInput, ErrorInput, event types |
| `packages/shared/src/workflow-events/constants.ts` | workflow-events | contract | WorkflowEventType typed constants |
| `packages/shared/src/workflow-events/index.ts` | workflow-events | contract | Barrel exports |
| `packages/shared/src/di-tokens.ts` | workflow-events | cross-domain | Add WORKFLOW_EVENTS_SERVICE token |
| `packages/shared/src/fakes/fake-workflow-events.ts` | workflow-events | contract | FakeWorkflowEventsService with inspection methods |
| `packages/positional-graph/src/workflow-events/workflow-events.service.ts` | workflow-events | internal | WorkflowEventsService implementation wrapping PGService |
| `packages/positional-graph/src/workflow-events/observer-registry.ts` | workflow-events | internal | globalThis-backed observer registry |
| `packages/positional-graph/src/workflow-events/index.ts` | workflow-events | internal | Barrel exports |
| `packages/positional-graph/src/container.ts` | _platform/positional-graph | cross-domain | Register WorkflowEventsService in DI |
| `packages/positional-graph/src/index.ts` | _platform/positional-graph | cross-domain | Barrel export for WorkflowEventsService |
| `packages/positional-graph/src/interfaces/positional-graph-service.interface.ts` | _platform/positional-graph | contract | Add @deprecated to askQuestion, answerQuestion, getAnswer |
| `test/contracts/workflow-events.contract.ts` | workflow-events | contract | Contract test factory |
| `test/contracts/workflow-events.contract.test.ts` | workflow-events | contract | Contract test runner |
| `apps/cli/src/commands/positional-graph.command.ts` | _platform/positional-graph | cross-domain | Migrate handleNodeAsk/Answer/GetAnswer to WorkflowEvents |
| `apps/web/app/actions/workflow-actions.ts` | workflow-ui | internal | Migrate answerQuestion to WorkflowEvents |
| `dev/test-graphs/shared/helpers.ts` | workflow-events | cross-domain | Migrate answerNodeQuestion, completeUserInputNode, clearErrorAndRestart |
| `test/e2e/positional-graph-orchestration-e2e.ts` | workflow-events | cross-domain | Update to use WorkflowEvents convenience API |
| `test/e2e/node-event-system-visual-e2e.ts` | workflow-events | cross-domain | Update to use typed constants |
| `test/e2e/positional-graph-execution-e2e.test.ts` | workflow-events | cross-domain | Update to use WorkflowEvents convenience API |
| `test/integration/orchestration-drive.test.ts` | workflow-events | cross-domain | Update to use migrated test helpers |
| `test/integration/positional-graph/cli-event-commands.test.ts` | workflow-events | cross-domain | Add QnA CLI integration tests |
| `scripts/test-advanced-pipeline.ts` | workflow-events | cross-domain | Update to use migrated helpers |
| `scripts/drive-demo.ts` | workflow-events | cross-domain | Update to use migrated helpers |
| `docs/domains/workflow-events/domain.md` | workflow-events | contract | Domain documentation |
| `docs/domains/registry.md` | cross-domain | cross-domain | Register new domain |
| `docs/domains/domain-map.md` | cross-domain | cross-domain | Add workflow-events node + edges |
| `docs/how/workflow-events-integration.md` | workflow-events | contract | Integration guide |

## Key Findings

| # | Impact | Finding | Action |
|---|--------|---------|--------|
| 01 | Critical | PGService Q&A methods (askQuestion, answerQuestion, getAnswer) are already marked `@deprecated` — they're scaffolding per Plan 054. WorkflowEvents wraps `raiseNodeEvent()` directly where possible. | Phase 2: implementation uses raiseNodeEvent for answer handshake, delegates to deprecated methods only for backward compat state.questions[] writes |
| 02 | Critical | 3-event QnA handshake (question:answer + node:restart) is ONLY done in web action today — CLI answer doesn't raise node:restart. This is a correctness gap that WorkflowEvents.answerQuestion() should fix. | Phase 2: answerQuestion() always raises both events regardless of caller |
| 03 | High | Test helpers in dev/test-graphs/shared/helpers.ts already import from @chainglass/positional-graph — same import pattern WorkflowEvents uses. No new dependency paths needed. | Phase 3: migrate helpers as thin delegates |
| 04 | High | FakePositionalGraphService is missing QnA stubs (QT-09 from research). WorkflowEvents fake should NOT depend on FakePGService — it should be independent with its own in-memory state. | Phase 1: FakeWorkflowEventsService is self-contained |
| 05 | High | Zod payload schemas are .strict() — exact field names required (PL-12). WorkflowEvents types must align exactly: `percent` not `percentage`, `question_id` not `questionId`. | Phase 1: types use exact schema field names in mapping |
| 06 | High | Observer hooks are in-memory and must survive HMR. Use globalThis pattern consistent with other singletons (SSEManager, DI container). | Phase 2: observer registry stored on globalThis |
| 07 | High | positional-graph.command.ts is 2,358 lines. Target handlers (ask/answer/get-answer) are ~95 lines total in an isolated section. Safe to modify. | Phase 3: targeted modification only |
| 08 | Medium | No circular dep risk — packages/shared has no dependency on positional-graph, and WorkflowEventsService lives in packages/positional-graph wrapping its own PGService. | Phase 2: confirmed safe architecture |

## Phases

### Phase 1: Interface, Types, and Constants

**Objective**: Define the IWorkflowEvents contract, typed constants, convenience types, and Fake test double in packages/shared.
**Domain**: workflow-events (NEW)
**Delivers**:
- IWorkflowEvents interface with all 9 methods
- WorkflowEventType typed constants for all 7 core event types
- QuestionInput, AnswerInput, AnswerResult, ProgressInput, ErrorInput types
- QuestionAskedEvent, QuestionAnsweredEvent, ProgressEvent, WorkflowEvent observer types
- FakeWorkflowEventsService with inspection methods
- DI token
- Domain docs + registry + map updates

**Depends on**: None
**Key risks**: Type alignment with Zod schemas (Finding 05) — use exact field names

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 1.1 | Create `WorkflowEventType` typed constants for all 7 core event types | workflow-events | `WorkflowEventType.QuestionAsk === 'question:ask'` etc. | AC-06 |
| 1.2 | Create convenience types: QuestionInput, AnswerInput, AnswerResult, ProgressInput, ErrorInput | workflow-events | Types compile, align with Zod payload schemas | AC-07; Finding 05 |
| 1.3 | Create observer event types: QuestionAskedEvent, QuestionAnsweredEvent, ProgressEvent, WorkflowEvent | workflow-events | Types compile, contain graphSlug + nodeId + payload | AC-08 |
| 1.4 | Define IWorkflowEvents interface | workflow-events | Interface exported from @chainglass/shared with all 9 methods | AC-01 |
| 1.5 | Add WORKFLOW_EVENTS_SERVICE DI token | workflow-events | Token exists in di-tokens.ts | Q7 clarification |
| 1.6 | Create FakeWorkflowEventsService | workflow-events | Implements IWorkflowEvents with getAskedQuestions, getAnswers, getProgressReports, getObserverCount | AC-04 |
| 1.7 | Create barrel exports + package.json entry | workflow-events | Importable as `@chainglass/shared/workflow-events`; tree-shaking works | ADR-0009 |
| 1.8 | Create domain doc, update registry + map | workflow-events | docs/domains/workflow-events/domain.md exists with boundary, contracts, composition; registry.md has workflow-events row; domain-map.md has workflow-events node + edges | AC-14, AC-15; MUST complete before Phase 2 |

### Phase 2: Implementation and Contract Tests

**Objective**: Build WorkflowEventsService wrapping IPositionalGraphService, with observer hooks and contract tests.
**Domain**: workflow-events
**Delivers**:
- WorkflowEventsService implementation in packages/positional-graph
- Server-side observer registry with subscribe/unsubscribe
- Contract test factory + runner (real + fake parity)
- DI registration in container.ts
- @deprecated markers on PGService Q&A methods

**Depends on**: Phase 1
**Key risks**: Observer registry HMR survival (Finding 06); 3-event handshake correctness (Finding 02)

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 2.1 | Implement WorkflowEventsService: askQuestion, getAnswer, reportProgress, reportError | workflow-events | Delegates to PGService methods, returns typed results | AC-02 |
| 2.2 | Implement answerQuestion with 3-event handshake | workflow-events | Single call raises question:answer + node:restart | AC-03; Finding 02 |
| 2.3 | Implement observer registry: onQuestionAsked, onQuestionAnswered, onProgress, onEvent | workflow-events | Observers fire on relevant method calls; unsubscribe works | AC-08, AC-09; Finding 06 |
| 2.4 | Write contract test factory + runner | workflow-events | Tests cover: askQuestion, answerQuestion, getAnswer, reportProgress, reportError, observers, unsubscribe. Runs via parameterized factory against both real and fake per ADR-0011. | AC-05 |
| 2.5 | Register via registerWorkflowEventsServices() in DI container per ADR-0009 naming | _platform/positional-graph | Container resolves IWorkflowEvents via WORKFLOW_EVENTS_SERVICE token | Q7; ADR-0009 |
| 2.6 | Add @deprecated JSDoc to PGService askQuestion, answerQuestion, getAnswer | _platform/positional-graph | Methods have @deprecated with migration note | Q6 |

### Phase 3: Consumer Migration

**Objective**: Migrate CLI commands, web actions, and test helpers to delegate to WorkflowEvents.
**Domain**: workflow-events + consumers
**Delivers**:
- CLI handlers (ask/answer/get-answer) delegate to WorkflowEvents
- Web server action answerQuestion delegates to WorkflowEvents
- Test helpers (answerNodeQuestion, completeUserInputNode, clearErrorAndRestart) delegate to WorkflowEvents
- QnA CLI integration test filling the gap identified in research

**Depends on**: Phase 2
**Key risks**: CLI file is 2,358 lines — targeted modification only (Finding 07)

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 3.1 | Migrate CLI handleNodeAsk to WorkflowEvents.askQuestion() | _platform/positional-graph | CLI `cg wf node ask` works identically | AC-10; Finding 07 |
| 3.2 | Migrate CLI handleNodeAnswer to WorkflowEvents.answerQuestion() | _platform/positional-graph | CLI `cg wf node answer` works identically + now raises node:restart | AC-10; Finding 02 |
| 3.3 | Migrate CLI handleNodeGetAnswer to WorkflowEvents.getAnswer() | _platform/positional-graph | CLI `cg wf node get-answer` works identically | AC-10 |
| 3.4 | Migrate web answerQuestion action to WorkflowEvents | workflow-ui | Server action delegates single call, removes manual node:restart | AC-11 |
| 3.5 | Migrate test helpers to WorkflowEvents | workflow-events | answerNodeQuestion, completeUserInputNode, clearErrorAndRestart delegate | AC-12; Finding 03 |
| 3.6 | Add QnA CLI integration test: ask → answer → get-answer cycle | workflow-events | Full cycle tested through WorkflowEvents | AC-17 |

### Phase 4: E2E Test Updates and Documentation

**Objective**: Update all E2E scripts and integration tests to use the convenience API, write integration guide.
**Domain**: workflow-events
**Delivers**:
- 7 E2E/script files updated to use WorkflowEvents and typed constants
- docs/how/workflow-events-integration.md guide
- All tests pass with no regressions

**Depends on**: Phase 3
**Key risks**: E2E script migration — verify each script still passes after changes

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 4.1 | Update positional-graph-orchestration-e2e.ts | workflow-events | Script runs identically with WorkflowEvents API | AC-13 |
| 4.2 | Update node-event-system-visual-e2e.ts with typed constants | workflow-events | Script uses WorkflowEventType constants | AC-13 |
| 4.3 | Update positional-graph-execution-e2e.test.ts | workflow-events | Test runs identically with WorkflowEvents API | AC-13 |
| 4.4 | Update orchestration-drive.test.ts (uses migrated helpers) | workflow-events | Tests pass through updated helpers | AC-13 |
| 4.5 | Update scripts/test-advanced-pipeline.ts | workflow-events | Script uses updated helpers | AC-13 |
| 4.6 | Update scripts/drive-demo.ts | workflow-events | Script uses updated helpers | AC-13 |
| 4.7 | Replace magic event strings with WorkflowEventType constants across codebase | workflow-events | grep for 'question:ask' etc. in source (not docs) returns 0 hits outside positional-graph internals | AC-06 |
| 4.8 | Write docs/how/workflow-events-integration.md | workflow-events | Guide covers: asking questions, answering, observers, migration, constants reference | AC-17 docs |
| 4.9 | Final regression check: `pnpm test` | workflow-events | 334+ files pass, 4705+ tests, 0 failures | AC-16 |

## Acceptance Criteria

- [ ] AC-01: IWorkflowEvents interface in packages/shared with 9 methods
- [ ] AC-02: WorkflowEventsService delegates to IPositionalGraphService
- [ ] AC-03: answerQuestion() handles 3-event handshake in single call
- [ ] AC-04: FakeWorkflowEventsService with inspection methods
- [ ] AC-05: Contract tests pass for real + fake parity
- [ ] AC-06: WorkflowEventType typed constants for all 7 event types
- [ ] AC-07: Typed input/output types exist
- [ ] AC-08: Server-side observers fire correctly
- [ ] AC-09: Observer unsubscribe works
- [ ] AC-10: CLI handlers delegate to WorkflowEvents
- [ ] AC-11: Web server action delegates to WorkflowEvents
- [ ] AC-12: Test helpers delegate to WorkflowEvents
- [ ] AC-13: 7 E2E files updated
- [ ] AC-14: Domain doc created
- [ ] AC-15: Domain registered in registry + map
- [ ] AC-16: pnpm test passes (no regressions)
- [ ] AC-17: CLI QnA integration test gap filled

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| E2E script migration breaks tests | Medium | High | Migrate one at a time with verification; Phase 4 is last |
| Observer memory leaks | Low | Medium | Unsubscribe pattern + globalThis scoping |
| Deprecated PGService methods removed before migration complete | Low | High | @deprecated JSDoc with "use WorkflowEvents instead" message |
| Magic string replacement misses occurrences | Low | Low | grep verification pass in Phase 4.7 |
| CLI file modification scope creep | Low | Medium | Isolated 95-line section (Finding 07) |
