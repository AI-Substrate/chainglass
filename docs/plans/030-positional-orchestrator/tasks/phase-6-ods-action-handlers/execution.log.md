# Execution Log: Phase 6 — ODS Action Handlers

**Plan**: positional-orchestrator-plan.md
**Phase**: Phase 6: ODS Action Handlers
**Started**: 2026-02-09
**Completed**: 2026-02-09
**Testing Approach**: Full TDD (RED-GREEN-REFACTOR)

---

## T001: Remove visitWaitingQuestion from ONBAS (CS-2)

**Status**: Complete

Simplified ONBAS per Workshop 11 Part 13 / Workshop 12 alignment:
- Updated docstring to remove `visitWaitingQuestion` from the function list
- Changed `case 'waiting-question'` from calling `visitWaitingQuestion(reality, node)` to `return null` (skip)
- Deleted entire `visitWaitingQuestion()` function (~45 lines, lines 109-155)
- File reduced from 206 to ~158 lines

**Verification**: 39 ONBAS tests pass, 6 question-production tests expected to fail (addressed in T002).

---

## T002: Update ONBAS tests for simplified walk (CS-2)

**Status**: Complete

Aligned test suite with ONBAS simplification:
- Updated Test Doc comment block: contract now mentions event-based question lifecycle
- Replaced `describe('question handling')` block (8 tests producing resume-node/question-pending) with `describe('waiting-question skip')` block (3 tests confirming skip behavior)
- Removed resume-node test from skip logic section
- Net: 39 tests pass (down from 45 — 6 question-production tests removed, 3 skip tests added)

**Verification**: 39 pass, 0 fail.

---

## T003: Define IODS interface and ODSDependencies (CS-1)

**Status**: Complete

Created `ods.types.ts` with:
- `IODS` interface: `execute(request: OrchestrationRequest, ctx: WorkspaceContext, reality: PositionalGraphReality): Promise<OrchestrationExecuteResult>`
- `ODSDependencies`: `graphService`, `podManager`, `contextService`, `agentAdapter`, `scriptRunner`

Note: ODSDependencies was initially created with only 3 deps per Workshop 12's "Three dependencies. That's all." — but `PodCreateParams` discriminated union requires `adapter: IAgentAdapter` for agent nodes and `runner: IScriptRunner` for code nodes. Added `agentAdapter` and `scriptRunner` during T008 implementation.

**Verification**: tsc clean.

---

## T004: Create FakeODS with test helpers (CS-2)

**Status**: Complete

Created `fake-ods.ts` implementing IODS with standard fake pattern:
- `FakeODSCallRecord` type for history tracking
- `setNextResult()`: single canned result for every call
- `setResults()`: queue of results, each call consumes next, last repeats
- `getHistory()`: returns call records (request, ctx, reality)
- `reset()`: clears all state
- Default behavior: returns `{ ok: true, request }` when no results configured

**Verification**: tsc clean.

---

## T005: Write start-node handler tests — RED (CS-3)

**Status**: Complete

Wrote 7 tests in `describe('ODS — start-node handler')`:
1. `agent node: creates pod and calls pod.execute (fire-and-forget)` — verifies pod creation and execution
2. `code node: creates pod with runner` — verifies code unit type path
3. `user-input node: returns ok without creating pod` — verifies no-op for user-input
4. `node not ready: returns NODE_NOT_READY error` — readiness validation
5. `startNode failure: returns START_NODE_FAILED error` — graphService error propagation
6. `node not found in reality: returns NODE_NOT_FOUND error` — missing node handling
7. `context inheritance: passes contextSessionId from prior node session` — context service integration

Test helpers: `makeCtx()`, `makeGraphServiceStub()`, `stubAdapter`, `stubRunner`.

**Verification**: All 7 tests RED (ODS class doesn't exist yet).

---

## T006: Write dispatch + edge case tests — RED (CS-2)

**Status**: Complete

Wrote 3 tests in `describe('ODS — dispatch table')`:
1. `no-action: returns ok with no side effects` — pass-through
2. `resume-node: returns defensive UNSUPPORTED_REQUEST_TYPE error`
3. `question-pending: returns defensive UNSUPPORTED_REQUEST_TYPE error`

**Verification**: All 3 tests RED.

---

## T007: Write input wiring tests — RED (CS-2)

**Status**: Complete

Wrote 2 tests in `describe('ODS — input wiring (AC-14)')`:
1. `request.inputs flow through to pod.execute() options` — verifies InputPack reaches pod
2. `graphSlug flows through to pod.execute() options` — verifies graphSlug wiring

**Verification**: All 2 tests RED.

---

## T008: Implement ODS with dispatch table — GREEN (CS-3)

**Status**: Complete

Created `ods.ts` implementing IODS with:
- `execute()`: dispatches on `request.type` with exhaustive switch (4 cases + default never)
- `handleStartNode()`: validates node exists → checks unitType (user-input → no-op) → checks readiness → delegates to `handleAgentOrCode()`
- `handleAgentOrCode()`: reserves node via `graphService.startNode()` → resolves context via `contextService.getContextSource()` → creates pod via `podManager.createPod()` → fires `pod.execute()` (NOT awaited) → returns `{ ok: true, newStatus: 'starting' }`
- `buildPodParams()`: discriminated by `node.unitType` — agent gets `adapter`, code gets `runner`
- Error codes: `NODE_NOT_FOUND`, `NODE_NOT_READY`, `START_NODE_FAILED`, `UNSUPPORTED_REQUEST_TYPE`, `UNKNOWN_REQUEST_TYPE`

**Discovery**: ODSDependencies needed `agentAdapter` and `scriptRunner` — Workshop 12's "Three dependencies" didn't account for `PodCreateParams` requiring adapter/runner. Updated `ods.types.ts` and all test dep constructions.

**Verification**: 12/12 ODS tests pass, 202 total across 030-orchestration.

---

## T009: Update barrel index with ODS exports (CS-1)

**Status**: Complete

Added to `index.ts`:
- Types: `IODS`, `ODSDependencies`, `FakeODSCallRecord`
- Classes: `ODS`, `FakeODS`

**Verification**: `just fft` — lint clean, format clean, build clean, all 030-orchestration tests pass. One unrelated flaky test in Plan 032 (`event-id.test.ts` uniqueness collision) — not caused by Phase 6 changes.

---

## Summary

- **9/9 tasks complete**
- **12 new ODS tests** + 39 ONBAS tests = 202 total across 030-orchestration feature
- **4 new files**: `ods.types.ts`, `fake-ods.ts`, `ods.test.ts`, `ods.ts`
- **2 modified files**: `onbas.ts` (simplified), `index.ts` (barrel exports)
- **1 modified test file**: `onbas.test.ts` (question tests → skip tests)
- **`just fft` clean** (excluding unrelated Plan 032 flaky test)

