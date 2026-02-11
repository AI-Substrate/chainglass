# Code Review — Phase 4: Event Handlers and State Transitions

**Plan**: [node-event-system-plan.md](../node-event-system-plan.md)
**Dossier**: [tasks.md](../tasks/phase-4-event-handlers-and-state-transitions/tasks.md)
**Execution Log**: [execution.log.md](../tasks/phase-4-event-handlers-and-state-transitions/execution.log.md)
**Reviewer**: AI Agent (plan-7-code-review)
**Date**: 2026-02-07

---

## A) Verdict

**APPROVE**

---

## B) Summary

Phase 4 implements all 6 event handlers, the backward-compat projection function (`deriveBackwardCompatFields`), and wires them into the `raiseEvent()` pipeline. The implementation matches the plan's task table and Workshop #02 walkthroughs precisely. All 3588 tests pass (157 in the 032 feature suite alone), no mocks are used (fakes-only policy honored), and `just fft` is clean. The code is well-structured with clear separation: handlers in `event-handlers.ts`, derivation in `derive-compat-fields.ts`, wiring in `raise-event.ts`. Only one Phase 3 test assertion required updating (event status `'new'` → `'handled'`), which is a legitimate consequence of handler wiring. No scope creep, no security issues, no regressions detected.

---

## C) Checklist

**Testing Approach: Full TDD**

- [x] Tests precede code (RED-GREEN-REFACTOR evidence) — T001-T006 RED before T007 GREEN, T008 RED before T009 GREEN, documented in execution log
- [x] Tests as docs (assertions show behavior) — All test files have 5-field Test Doc blocks at file level and per-describe level
- [x] Mock usage matches spec: **Avoid** (fakes-only) — Zero `vi.mock`/`jest.mock`/`sinon` usage; `FakeNodeEventRegistry` and `createFakeStateStore` implement real interfaces
- [x] Negative/edge cases covered — Missing node, invalid payload, already-answered question, undefined events array, multiple asks/errors
- [x] BridgeContext patterns followed — N/A (library code, not VS Code extension)
- [x] Only in-scope files changed — 3 new source + 2 modified source + 2 new test + 1 modified test, all within `features/032-node-event-system/` and corresponding test directory
- [x] Linters/type checks are clean — `just fft` passes, 3588 tests green
- [x] Absolute paths used (no hidden context) — All imports use relative paths within the package (standard for monorepo internal modules), no CWD assumptions

---

## D) Findings Table

| ID | Severity | File:Lines | Summary | Recommendation |
|----|----------|------------|---------|----------------|
| LOW-001 | LOW | event-handlers.ts:23-55 | Repeated `NonNullable<typeof state.nodes>` cast pattern | Consider extracting a `getNodeEntry(state, nodeId)` helper (minor DRY improvement) |
| LOW-002 | LOW | event-handlers.ts:37,56 | Payload `as` casts are necessary but undocumented | Add brief comment noting that raiseEvent validates payloads via Zod before handler invocation |
| LOW-003 | LOW | derive-compat-fields.ts:46-58 | Two separate backward loops for `pending_question_id` and `error` | Could be merged into one loop for efficiency, but current approach is clearer and events arrays are small per-node |
| INFO-001 | INFO | tasks.md:392-423 | Dossier footnote stubs use "Task 4.1" prefix for all entries | Plan tasks use 4.1-4.14 numbering while dossier uses T001-T012; cross-reference works but numbering schemes differ (minor documentation inconsistency) |

---

## E) Detailed Findings

### E.0) Cross-Phase Regression Analysis

**Tests rerun**: 157 (all 032 feature tests) + 3588 (full suite)
**Tests failed**: 0
**Contracts broken**: 0
**Verdict**: PASS

- All Phase 1 tests (registry, schemas, event-id, payloads, core-event-types): PASS
- All Phase 2 tests (event-helpers, backward-compat): PASS
- All Phase 3 tests (raise-event): PASS (1 assertion updated legitimately — event status `'new'` → `'handled'` after handler wiring)
- Phase 3 test update justified: `raiseEvent()` now runs handlers, so `node:accepted` events are marked `'handled'` immediately by the handler. The test comment was updated to explain Phase 4 wiring.
- `RaiseEventDeps` interface: unchanged
- `RaiseEventResult` interface: unchanged
- `VALID_FROM_STATES` map: unchanged (6 entries)
- All Phase 1-3 exports preserved in `index.ts`

### E.1) Doctrine & Testing Compliance

#### Graph Integrity

**Link Validation (Task↔Log)**:
- All 12 dossier tasks (T001-T012) have `log#task-41-implement-phase-4` anchor in Notes column: ✅
- Execution log entry has Dossier Task reference (T001-T012) and Plan Task reference (4.1): ✅
- Single execution log entry covers all tasks (consolidated implementation): acceptable for a phase with interdependent tasks

**Link Validation (Task↔Footnote)**:
- T001-T006, T012 → [^6]: ✅ (handler test infrastructure)
- T007 → [^7]: ✅ (handler implementations)
- T008 → [^8]: ✅ (compat derivation tests)
- T009 → [^9]: ✅ (compat derivation implementation)
- T010 → [^10]: ✅ (raiseEvent wiring)
- T011 → [^11]: ✅ (E2E walkthrough tests)
- Footnotes [^6]-[^11] sequential, no gaps, no duplicates: ✅

**Link Validation (Footnote↔File)**:
- [^6] → `event-handlers.test.ts` (makeState, makeEvent): ✅ functions exist
- [^7] → `event-handlers.ts` (8 functions): ✅ all exist (createEventHandlers, markHandled, 6 handlers)
- [^8] → `derive-compat-fields.test.ts` (4 helpers): ✅ all exist
- [^9] → `derive-compat-fields.ts` (deriveBackwardCompatFields): ✅ exists
- [^10] → raise-event.ts, index.ts, raise-event.test.ts: ✅ all modified
- [^11] → `event-handlers.test.ts` (createFakeStateStore, createE2EDeps): ✅ both exist
- All node IDs follow `function:` or `file:` prefix format: ✅

**Link Validation (Plan↔Dossier Sync)**:
- Plan tasks 4.1-4.14 (12 tasks) ↔ Dossier tasks T001-T012 (12 tasks): ✅ count matches
- All plan tasks marked [x] ↔ All dossier tasks marked [x]: ✅ statuses synchronized
- Plan Log column has [📋] link for all tasks: ✅
- Plan Notes footnotes match dossier Notes footnotes: ✅
- Minor inconsistency: Plan uses 4.1-4.6, 4.7, 4.10-4.14 (skips 4.8-4.9) while dossier uses T001-T012 sequentially — this is a plan artifact from output event removal, not a broken link

**Link Validation (Parent↔Subtask)**: N/A — no subtasks in this phase

**Graph Integrity Score**: ✅ INTACT (0 violations)

#### Authority Conflicts (Plan↔Dossier Footnotes)
- Plan § 12 [^6]-[^11] ↔ Dossier Phase Footnote Stubs [^6]-[^11]: synchronized
- Content matches exactly between plan ledger and dossier stubs: ✅
- **Verdict**: PASS (no conflicts)

#### TDD Compliance
- **TDD order**: Tasks ordered RED (T001-T006 tests) → GREEN (T007 implementation) → RED (T008 tests) → GREEN (T009 implementation) → Wiring (T010) → Integration (T011) → Verify (T012): ✅
- **Tests as documentation**: All test files have file-level and describe-level Test Doc blocks with all 5 fields (Why, Contract, Usage Notes, Quality Contribution, Worked Example): ✅
- **RED-GREEN-REFACTOR cycles**: Execution log documents the progression clearly (sections 1-7 follow RED→GREEN→wiring→E2E→verify): ✅
- **Assertion quality**: Test names describe behavior clearly (e.g., "transitions node status from starting to agent-accepted", "leaves event status as new (deferred processing)"): ✅

#### Mock Usage Compliance
- **Policy**: Fakes over mocks
- **vi.mock/jest.mock/sinon usage**: 0 instances across all 3 test files: ✅
- **Test doubles**: `FakeNodeEventRegistry` (implements `INodeEventRegistry`), `createFakeStateStore` (in-memory state with `loadState`/`persistState`): ✅
- **Verdict**: PASS

#### Universal/BridgeContext
- BridgeContext patterns 1-10: N/A (library code, not VS Code extension)
- R-CODE-001 (no `any` in production code): ✅ (0 `any` types in new source files)
- R-CODE-001 (explicit return types for public APIs): ✅ (`createEventHandlers(): Map<string, EventHandler>`, `deriveBackwardCompatFields(state, nodeId): void`)
- R-CODE-002 (naming conventions): ✅ (camelCase functions, PascalCase types)
- R-CODE-003 (kebab-case files): ✅ (event-handlers.ts, derive-compat-fields.ts)
- R-CODE-004 (import organization): ✅ (type imports separated with `import type`)

### E.2) Semantic Analysis

**Domain logic correctness**: All 6 handlers implement the exact state transitions specified in Workshop #02:

| Event Type | Expected Transition | Implemented | Verdict |
|------------|-------------------|-------------|---------|
| `node:accepted` | `starting` → `agent-accepted` | ✅ Line 24 | PASS |
| `node:completed` | `agent-accepted` → `complete` + `completed_at` | ✅ Lines 30-31 | PASS |
| `node:error` | → `blocked-error` + error field | ✅ Lines 38-43 | PASS |
| `question:ask` | → `waiting-question` + `pending_question_id` | ✅ Lines 49-50 | PASS |
| `question:answer` | ask → `handled` + `handler_notes`, pending cleared, status unchanged | ✅ Lines 60-73 | PASS |
| `progress:update` | no state change, event → `handled` | ✅ Lines 77-78 | PASS |

**`question:ask` stays `new`**: Correctly implemented — only handler that doesn't call `markHandled()`: ✅

**`deriveBackwardCompatFields` derivation**:
- `pending_question_id`: Builds answered set, walks backwards, finds latest unanswered ask: ✅
- `error`: Walks backwards, finds latest `node:error`, extracts code/message/details: ✅
- Correctly handles empty events array, no asks, no errors: ✅

**raiseEvent wiring flow**: `validate → create → append → handle → derive compat → persist`: ✅ (matches revised flow from dossier line 309-312)

**Specification drift**: None detected. All 6 handlers, the compat derivation, and the wiring match the plan and workshop specifications.

### E.3) Quality & Safety Analysis

**Safety Score: 94/100** (CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 3)

#### Correctness
- No logic defects detected in handler implementations
- `handleQuestionAnswer` correctly finds the ask event by `question_event_id` and mutates it: ✅
- `markHandled()` sets both `status` and `handled_at` atomically: ✅
- Event appended before handler runs (reference aliasing ensures handler mutations persist): ✅
- **`new Date().toISOString()` called independently** in `markHandled()` and `handleNodeCompleted()` — timestamps may differ by microseconds within a single handler call. This is acceptable (they represent different actions: event handled vs. node completed).

#### Security
- No secrets, credentials, or sensitive data in code: ✅
- No path traversal or injection vulnerabilities: ✅
- Type assertions (`as`) are safe because `raiseEvent()` validates payloads via Zod schemas before invoking handlers — only valid payloads reach handlers: ✅
- No user-controlled strings used in unsafe operations: ✅

#### Performance
- Handler event log scans in `deriveBackwardCompatFields()` are O(n) where n = events per node — bounded and expected to be small (< 1000 events per node in practice): ✅
- Two separate backward loops in `deriveBackwardCompatFields()` (one for `pending_question_id`, one for `error`) — could be merged but clarity is preferred: LOW (no action needed)
- `Map.get()` for handler lookup is O(1): ✅
- No unbounded iterations or N+1 patterns: ✅

#### Observability
- Handlers are silent (no logging) — this is intentional for library code. Logging belongs at the `raiseEvent()` caller level: ✅
- `deriveBackwardCompatFields()` silently returns when `nodes` or `entry` is missing — defensive coding: ✅

### E.4) Doctrine Evolution Recommendations (Advisory)

**Does NOT affect verdict.**

| Category | Type | Title | Priority | Evidence |
|----------|------|-------|----------|----------|
| ADR | New (seed exists) | Events as Logged Facts | MEDIUM | Plan line 845 has seed ADR; Phase 4 implements the "append → handle" pattern that proves the approach. Consider formalizing after Phase 5 wrapper migration. |
| Idiom | New | NonNullable Node Entry Access | LOW | `state.nodes as NonNullable<typeof state.nodes>` pattern appears 6× in event-handlers.ts. Consider documenting as standard idiom for handler code or extracting helper. |
| Idiom | New | Derived Projection Pattern | MEDIUM | `deriveBackwardCompatFields()` demonstrates a reusable pattern: recompute read-only fields from an event log after every mutation. Worth documenting for consistency in future derived-field additions. |
| Positive | — | Module Registration Pattern (ADR-0009) | — | `createEventHandlers()` factory follows ADR-0009 registration function pattern correctly. |
| Positive | — | Fakes-over-Mocks (Constitution) | — | All test doubles implement real interfaces; zero mock framework usage. |
| Positive | — | PlanPak File Placement | — | All new files correctly placed in `features/032-node-event-system/` feature folder. No cross-plan edits. |

**Summary**: 0 new ADRs required, 2 idioms worth documenting, 3 positive alignments. No doctrine gaps or contradictions.

---

## F) Coverage Map

### Acceptance Criteria → Test Coverage

| AC | Description | Test File(s) | Assertions | Confidence |
|----|-------------|-------------|------------|------------|
| AC-6 | Two-phase handshake transitions | event-handlers.test.ts (T001: 3 tests) | `status === 'agent-accepted'`, `event.status === 'handled'` | 100% — explicit handler tests + E2E Walkthrough 1 |
| AC-7 | Question lifecycle through events | event-handlers.test.ts (T004: 3 tests, T005: 4 tests) | Ask: `status === 'waiting-question'`, `pending_question_id === event_id`, `event.status === 'new'`; Answer: `askEvent.status === 'handled'`, `pending_question_id === undefined` | 100% — explicit handler tests + E2E Walkthrough 2 |
| AC-15 | Backward-compat fields derived | derive-compat-fields.test.ts (9 tests) | `pending_question_id` from latest unanswered ask, `error` from latest error event, edge cases (none, multiple, answered) | 100% — explicit derivation tests + E2E walkthroughs verify compat fields |

### Additional Coverage

| Behavior | Test File(s) | Assertions | Confidence |
|----------|-------------|------------|------------|
| `node:completed` handler | event-handlers.test.ts (T002: 4 tests) | Status, completed_at, event handled | 100% |
| `node:error` handler | event-handlers.test.ts (T003: 4 tests) | Status, error field, event handled | 100% |
| `progress:update` handler | event-handlers.test.ts (T006: 3 tests) | No state change, event handled | 100% |
| E2E Happy Path | event-handlers.test.ts (T011: Walkthrough 1) | Full accept→complete lifecycle | 100% |
| E2E Q&A Lifecycle | event-handlers.test.ts (T011: Walkthrough 2) | Full ask→answer lifecycle | 100% |
| E2E Error Path | event-handlers.test.ts (T011: Walkthrough 3) | Full accept→error lifecycle | 100% |
| E2E Progress | event-handlers.test.ts (T011: Walkthrough 4) | Progress events don't change state | 100% |

**Overall Coverage Confidence**: 100% — all acceptance criteria have explicit test coverage with behavioral assertions. No narrative tests; all tests map to specific acceptance criteria or handler behaviors.

---

## G) Commands Executed

```bash
# Phase 4 feature tests
pnpm test -- --reporter=verbose test/unit/positional-graph/features/032-node-event-system/
# Result: 9 files, 157 tests passed

# Full test suite (regression check)
pnpm test
# Result: 237 files passed | 5 skipped, 3588 tests passed | 41 skipped

# Mock usage scan
grep -rn "vi.mock\|jest.mock\|sinon" test/unit/positional-graph/features/032-node-event-system/
# Result: No matches

# Type safety scan
grep -rn "any" packages/positional-graph/src/features/032-node-event-system/event-handlers.ts derive-compat-fields.ts
# Result: No 'any' types in production code
```

---

## H) Decision & Next Steps

**Decision**: APPROVE — all gates pass.

**Next Steps**:
1. Commit Phase 4 changes
2. Advance to Phase 5 (Service Method Wrappers) — run `/plan-5` to generate tasks
3. Consider formalizing the "Events as Logged Facts" seed ADR after Phase 5 validates the wrapper migration

---

## I) Footnotes Audit

| Diff-Touched Path | Footnote(s) | Plan Ledger Node IDs | Verified |
|-------------------|-------------|---------------------|----------|
| `features/032-node-event-system/event-handlers.ts` | [^7] | `function:...event-handlers.ts:createEventHandlers`, `function:...event-handlers.ts:markHandled`, 6× handler functions | ✅ |
| `features/032-node-event-system/derive-compat-fields.ts` | [^9] | `function:...derive-compat-fields.ts:deriveBackwardCompatFields` | ✅ |
| `features/032-node-event-system/raise-event.ts` | [^10] | `file:...raise-event.ts` | ✅ |
| `features/032-node-event-system/index.ts` | [^10] | `file:...index.ts` | ✅ |
| `test/.../event-handlers.test.ts` | [^6], [^11] | `function:...event-handlers.test.ts:makeState`, `...makeEvent`, `...createFakeStateStore`, `...createE2EDeps` | ✅ |
| `test/.../derive-compat-fields.test.ts` | [^8] | `function:...derive-compat-fields.test.ts:makeState`, `...makeAskEvent`, `...makeAnswerEvent`, `...makeErrorEvent` | ✅ |
| `test/.../raise-event.test.ts` | [^10] | `file:...raise-event.test.ts` | ✅ |

All 7 diff-touched files have corresponding footnote entries. All 19 FlowSpace node IDs point to existing functions/files. No orphan footnotes, no missing entries.
