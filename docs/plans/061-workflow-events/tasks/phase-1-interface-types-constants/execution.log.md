# Execution Log — Phase 1: Interface, Types, and Constants

**Plan**: 061-workflow-events
**Phase**: Phase 1
**Started**: 2026-03-01

---

## T001: WorkflowEventType Constants
- Created `packages/shared/src/workflow-events/constants.ts`
- 7 constants as `as const` object + `WorkflowEventTypeValue` union type
- Values aligned with core-event-types.ts registrations

## T002: Convenience Input/Output Types
- Created `packages/shared/src/workflow-events/types.ts`
- 5 types: QuestionInput, AnswerInput, AnswerResult, ProgressInput, ErrorInput
- Field alignment: `percent` (not percentage), `default` (not defaultValue), type values `'text'|'single'|'multi'|'confirm'` (not free_text etc.)
- AnswerInput uses structured fields (text?, selected?, confirmed?) rather than raw `unknown`

## T003: Observer Event Types
- Added to same `types.ts` file: QuestionAskedEvent, QuestionAnsweredEvent, ProgressEvent, WorkflowEvent
- All contain graphSlug + nodeId + typed payload
- WorkflowEvent uses WorkflowEventTypeValue for eventType field

## T004: IWorkflowEvents Interface
- Created `packages/shared/src/interfaces/workflow-events.interface.ts`
- 5 action methods: askQuestion, answerQuestion, getAnswer, reportProgress, reportError
- 4 observer methods: onQuestionAsked, onQuestionAnswered, onProgress, onEvent
- Rich JSDoc with usage examples
- Note: No WorkspaceContext param — WorkflowEventsService resolves it internally (Phase 2)

## T005: DI Token
- Added `WORKFLOW_EVENTS_SERVICE: 'IWorkflowEvents'` to POSITIONAL_GRAPH_DI_TOKENS
- Follows existing pattern: JSDoc comment, interface name as value

## T006: FakeWorkflowEventsService
- Created `packages/shared/src/fakes/fake-workflow-events.ts`
- Self-contained (Finding 04): own arrays, Map, counter — no FakePGService dep
- Implements full IWorkflowEvents: all 5 actions + all 4 observers
- Inspection methods: getAskedQuestions(), getAnswers(), getProgressReports(), getErrors(), getObserverCount(), getObserverCountFor(), reset()
- Fires observers on action calls (askQuestion → notifies question-asked observers)
- Generic event observer (onEvent) receives all events

## T007: Barrel Exports + Package.json
- Created `packages/shared/src/workflow-events/index.ts` barrel
- Updated `interfaces/index.ts`: added IWorkflowEvents export
- Updated `fakes/index.ts`: added FakeWorkflowEventsService export
- Updated `src/index.ts`: added all new exports (interface, types, constants, fake)
- Updated `package.json`: added `./workflow-events` sub-path export with dual import+types
- Note: ProgressEvent re-exported as WorkflowProgressEvent from index.ts to avoid collision with DOM ProgressEvent
- Build passes: `pnpm --filter @chainglass/shared build` ✅

## T008: Domain Doc + Registry + Map
- Created `docs/domains/workflow-events/domain.md` with full structure: boundary, contracts, composition, dependencies, source locations, concepts, history
- Updated `docs/domains/registry.md`: added workflow-events row (business, active)
- Updated `docs/domains/domain-map.md`: added workflow-events node + edges (→ posGraph, → events, ← agents, ← workflowUI), added to Health Summary

## Verification
- `pnpm --filter @chainglass/shared build`: ✅ compiles clean
- `pnpm test`: ✅ 334 files passed, 4705 tests, 0 failures (same baseline)
