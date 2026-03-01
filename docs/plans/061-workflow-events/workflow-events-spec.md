# WorkflowEvents — First-Class Convenience Domain for Workflow Event Interactions

**Mode**: Full

> This specification incorporates findings from research-dossier.md (78 findings, 9 subagents) and Workshop 001 (WorkflowEvents domain design).

---

## Research Context

The workflow event system (Plan 032) provides 7 core event types via a generic, schema-validated, registry-based infrastructure. QnA, progress, and error reporting are all built on top through convenience wrappers scattered across PositionalGraphService (3 methods), CLI commands (4 handlers), web actions (2 functions), and test helpers (3 functions). This diffusion means 88+ files reference `question:ask` and developers must understand the raw 5-step validation pipeline, VALID_FROM_STATES map, handler stamping model, and 3-event QnA handshake to do simple things. The test helpers in `dev/test-graphs/shared/helpers.ts` already embody the convenience pattern — this plan formalizes them into a first-class domain.

Key research findings:
- **QnA is layered on top of events, not baked in** — ONBAS doesn't know what a question is
- **Agents exit after asking questions** — orchestrator reinvokes them in new Pod sessions
- **Test helpers ARE the proto-WorkflowEvents** — `answerNodeQuestion()`, `completeUserInputNode()`, `clearErrorAndRestart()`
- **75% test coverage overall** — strong unit tests, gap in CLI QnA integration and full E2E cycle
- **15 prior learnings** from Plan 032 provide critical gotchas (stamp model, strict payload schemas, two-pass idempotency)

---

## Summary

Create a `workflow-events` domain that provides intent-based APIs for common workflow event patterns: asking questions, answering them, reporting progress, handling errors, and observing events. This convenience layer wraps the generic event system (Plan 032) so callers express intent ("answer this question") instead of orchestrating raw primitives ("raise question:answer event, then raise node:restart event with reason payload"). It also introduces server-side observer hooks so other domains (like agents and work-unit-state) can react to workflow events without coupling to the event infrastructure.

---

## Goals

- Developers can ask/answer questions with a single method call instead of understanding the 3-event handshake
- Typed event constants (`WorkflowEventType.QuestionAsk`) replace magic strings (`'question:ask'`) across the codebase
- Server-side observer hooks (`onQuestionAsked`, `onQuestionAnswered`, `onProgress`) enable cross-domain event consumption without coupling
- CLI commands, web actions, and test helpers all delegate to WorkflowEvents instead of calling PositionalGraphService directly
- All 9 E2E test/script files and test helpers updated to use the convenience API
- New domain documented with boundary, contracts, and domain.md
- Future event types (approvals, escalations, custom domain events) plug in through the same pattern

---

## Non-Goals

- Replacing the generic event system (Plan 032) — WorkflowEvents wraps it, doesn't replace it
- Changing the orchestration loop (ONBAS/ODS/Reality Builder) — those stay untouched
- Moving event type definitions out of positional-graph — they stay where they are
- Building UI components for QnA — that's Plan 054 / Plan 059 Phase 3
- Adding new event types — this plan formalizes access to the existing 7 types
- Cross-worktree event observation — scoped to single-graph observation for now

---

## Target Domains

| Domain | Status | Relationship | Role in This Feature |
|--------|--------|-------------|---------------------|
| workflow-events | **NEW** | **create** | First-class convenience domain: IWorkflowEvents interface, implementation, typed constants, observer hooks |
| _platform/positional-graph | existing | **consume** | Underlying event infrastructure: raiseEvent, handleEvents, PositionalGraphService Q&A methods |
| _platform/events | existing | **consume** | SSE transport: CentralEventNotifierService for broadcasting events to clients |
| agents | existing | **consume** | AgentWorkUnitBridge will subscribe to workflow events via observer hooks |
| work-unit-state | existing | **consume** | Status aggregator consumes workflow event observations indirectly via agents bridge |
| workflow-ui | existing | **modify** | Web server actions updated to delegate to WorkflowEvents |

### New Domain Sketches

#### workflow-events [NEW]
- **Purpose**: Intent-based convenience API for workflow event interactions. Wraps the generic event system (Plan 032) so callers express business intent (ask question, answer question, report progress) without understanding the underlying event machinery (raiseEvent pipeline, handler stamping, state transitions, 3-event handshakes).
- **Boundary Owns**: IWorkflowEvents interface, WorkflowEventsService implementation, FakeWorkflowEvents test double, typed event constants (WorkflowEventType), convenience input/output types (QuestionInput, AnswerInput, AnswerResult), server-side observer registry (onQuestionAsked, onQuestionAnswered, onProgress, onEvent)
- **Boundary Excludes**: Generic event infrastructure (raiseEvent, handleEvents, NodeEventRegistry, EventHandlerRegistry — owned by _platform/positional-graph). Event type definitions and Zod schemas (owned by positional-graph). CLI command definitions (consumer layer per ADR-0012). Web server actions (consumer layer). Orchestration logic (ONBAS/ODS — owned by positional-graph).

---

## Complexity

- **Score**: CS-3 (medium)
- **Breakdown**: S=2, I=1, D=0, N=1, F=0, T=2 (Total P=6)
  - **S=2**: Cross-cutting — touches packages/shared (interface), apps/web (impl), apps/cli (consumers), dev/test-graphs (helpers), 9 test/script files
  - **I=1**: Single external dependency (PositionalGraphService) — stable, well-tested
  - **D=0**: No schema changes — wraps existing data shapes
  - **N=1**: Some ambiguity — observer hook design needs validation; migration scope confirmed by research
  - **F=0**: Standard — no perf/security concerns
  - **T=2**: Comprehensive test updates — 9 E2E/integration files, 3 test helpers, CLI integration gap to fill
- **Confidence**: 0.85 — research dossier and workshop provide strong foundation; prior learnings de-risk implementation
- **Assumptions**: PositionalGraphService Q&A methods remain stable; no new event types needed; observer pattern is in-memory (no persistence)
- **Dependencies**: Plan 032 (complete), Plan 059 Phase 1 (complete)
- **Risks**: Test helper migration could break E2E scripts if not carefully sequenced; observer memory leaks if unsubscribe not called
- **Phases**: (1) Interface + types + constants, (2) Implementation + fake + contract tests, (3) CLI/web/helper migration, (4) E2E test updates + docs

---

## Acceptance Criteria

1. **AC-01**: `IWorkflowEvents` interface exists in `packages/shared` with methods: `askQuestion`, `answerQuestion`, `getAnswer`, `reportProgress`, `reportError`, `onQuestionAsked`, `onQuestionAnswered`, `onProgress`, `onEvent`
2. **AC-02**: `WorkflowEventsService` implementation delegates to `IPositionalGraphService` — no direct `raiseEvent()` calls from consumers
3. **AC-03**: `answerQuestion()` handles the 3-event handshake (question:answer + node:restart) in a single call
4. **AC-04**: `FakeWorkflowEventsService` test double exists with inspection methods (`getAskedQuestions`, `getAnswers`, `getProgressReports`, `getObserverCount`)
5. **AC-05**: Contract tests pass for both real and fake implementations
6. **AC-06**: `WorkflowEventType` typed constants exist for all 7 core event types — no magic strings in consumer code
7. **AC-07**: Typed input/output types exist: `QuestionInput`, `AnswerInput`, `AnswerResult`, `ProgressInput`, `ErrorInput`
8. **AC-08**: Server-side observers fire for question-asked, question-answered, and progress events
9. **AC-09**: Observer hooks return unsubscribe functions; calling unsubscribe removes the handler
10. **AC-10**: CLI handlers (`handleNodeAsk`, `handleNodeAnswer`, `handleNodeGetAnswer`) delegate to WorkflowEvents
11. **AC-11**: Web server action `answerQuestion()` in workflow-actions.ts delegates to WorkflowEvents
12. **AC-12**: Test helpers (`answerNodeQuestion`, `completeUserInputNode`, `clearErrorAndRestart`) delegate to WorkflowEvents
13. **AC-13**: All 7 E2E test/script files updated to use WorkflowEvents convenience API where applicable
14. **AC-14**: `docs/domains/workflow-events/domain.md` created with boundary, contracts, composition, source locations
15. **AC-15**: Domain registered in `docs/domains/registry.md` and `docs/domains/domain-map.md`
16. **AC-16**: `pnpm test` passes with no regressions (baseline: 334 files, 4705 tests)
17. **AC-17**: CLI QnA integration test gap filled — ask, answer, get-answer cycle tested end-to-end through WorkflowEvents

---

## Risks & Assumptions

| Risk | Mitigation |
|------|-----------|
| E2E script migration breaks existing orchestration tests | Sequence: implement + test new layer first, then migrate scripts one at a time with parallel verification |
| Observer hooks leak memory if consumers don't unsubscribe | WeakRef-based cleanup or scope observers to graph lifecycle (cleared on graph unload) |
| PositionalGraphService Q&A methods change in future plans | IWorkflowEvents interface is the stable contract; implementation adapts internally |
| Circular dependency between workflow-events and positional-graph | Workshop confirmed: workflow-events WRAPS PG service, doesn't import event type internals |
| Magic string grep-and-replace misses some occurrences | Typed constants + biome lint rule or grep verification pass |

---

## Testing Strategy

- **Approach**: Hybrid
- **Rationale**: TDD for new logic (observer hooks, contract tests), lightweight for wrapper migration (CLI/web/test helper delegation swaps)
- **Focus Areas**: Observer hook lifecycle (subscribe/unsubscribe/fire), IWorkflowEvents contract parity (real vs fake), QnA 3-event handshake encapsulation, CLI integration gap (ask→answer→get-answer cycle)
- **Excluded**: Re-testing existing raiseEvent pipeline (already 95% covered by Plan 032), UI components
- **Mock Policy**: Avoid mocks entirely — use real implementations + Fake test doubles only (consistent with Plan 059 pattern). FakeWorkflowEventsService provides inspection methods. FakePositionalGraphService QnA stubs to be added as needed.

## Documentation Strategy

- **Location**: docs/how/ only
- **Rationale**: WorkflowEvents is a convenience layer consumed by other domains. Integration guide covers: how to ask/answer questions, how to observe events, how to migrate existing code, typed constants reference.
- **Deliverable**: `docs/how/workflow-events-integration.md`

---

## Open Questions

1. ~~Should WorkflowEvents be registered in DI?~~ **RESOLVED**: Yes — DI registration, consistent with PositionalGraphService pattern.
2. Should observer hooks support filtering by node ID in addition to graph slug?
3. ~~Should PGService Q&A methods be deprecated?~~ **RESOLVED**: Yes — mark with `@deprecated` JSDoc.
4. Should the WorkflowEvents observer registry persist across HMR? (likely yes — globalThis pattern)

---

## Clarifications

### Session 2026-03-01

| Q# | Question | Answer |
|----|----------|--------|
| Q1 | Workflow Mode | **Full** — CS-3, cross-cutting changes, new domain |
| Q2 | Testing Strategy | **Hybrid** — TDD for observer hooks + contract tests, lightweight for wrapper migration |
| Q3 | Mock Policy | **No mocks** — Fakes only, consistent with Plan 059 |
| Q4 | Documentation Strategy | **docs/how/ only** — integration guide for consuming domains |
| Q5 | Domain Review | **Approved as designed** — standalone `workflow-events` business domain |
| Q6 | PGService Q&A deprecation | **Deprecate with @deprecated JSDoc** — signals migration path |
| Q7 | DI registration | **Yes, DI (tsyringe)** — consistent with PositionalGraphService pattern |

---

## Workshop Opportunities

| Topic | Type | Why Workshop | Key Questions |
|-------|------|--------------|---------------|
| ~~WorkflowEvents Domain Design~~ | ~~Integration Pattern~~ | ~~Resolved~~ | Workshop 001 already completed — covers API shape, observer pattern, migration strategy |

All workshop opportunities resolved. Proceed to clarification.
