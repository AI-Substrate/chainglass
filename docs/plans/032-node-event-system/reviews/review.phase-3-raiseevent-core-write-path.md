# Code Review: Phase 3 — raiseEvent Core Write Path

**Plan**: [node-event-system-plan.md](../node-event-system-plan.md)
**Phase**: Phase 3: raiseEvent Core Write Path
**Dossier**: [tasks.md](../tasks/phase-3-raiseevent-core-write-path/tasks.md)
**Reviewer**: plan-7-code-review (automated)
**Date**: 2026-02-07

---

## A) Verdict

**APPROVE**

No CRITICAL or HIGH findings. All gates pass. Implementation is clean, well-tested, and matches the plan precisely.

---

## B) Summary

Phase 3 delivers the `raiseEvent()` core write path as a standalone async function with a 5-step validation pipeline (E190→E191→E192→E193→E194/E195), event creation, append-to-log, and atomic persistence. The implementation is contained in 2 source files (1 new, 1 modified barrel) and 1 test file (22 tests). All 3563 tests pass, Biome lint is clean, and the `VALID_FROM_STATES` map matches Workshop #02 exactly. No cross-plan edits, no scope creep. TDD evidence is clear: RED (T001-T006), GREEN (T007), safety tests (T008), refactor (T009).

---

## C) Checklist

**Testing Approach: Full TDD**

- [x] Tests precede code (RED-GREEN-REFACTOR evidence) — T001-T006 RED, T007 GREEN, T009 REFACTOR
- [x] Tests as docs (assertions show behavior) — All test blocks have 5-field Test Doc comment blocks
- [x] Mock usage matches spec: Fakes only — `createFakeStateStore()` and `FakeNodeEventRegistry` used; zero `vi.mock`/`vi.fn`/`vi.spyOn`
- [x] Negative/edge cases covered — E190-E195, implicit pending, undefined nodes, persistence safety
- [x] BridgeContext patterns followed — N/A (not VS Code extension)
- [x] Only in-scope files changed — raise-event.ts (new), index.ts (barrel), raise-event.test.ts (new), plan docs
- [x] Linters/type checks are clean — Biome clean, 3563 tests pass
- [x] Absolute paths used (no hidden context) — Function receives deps via parameter bag, no path assumptions

---

## D) Findings Table

| ID | Severity | File:Lines | Summary | Recommendation |
|----|----------|------------|---------|----------------|
| PERF-001 | LOW | raise-event.ts:65-78 | Minor redundant Zod parse in payload validation step | Accept: documented in Critical Insight #1, intentional for consistent factory errors |
| STYLE-001 | LOW | raise-event.test.ts:511-520 | Verbose `NonNullable<typeof x>` casts after `toBeDefined()` assertions | Accept: required by Biome `noNonNullAssertion` rule per T009 discovery |
| DOC-001 | LOW | raise-event.ts:141 | Payload cast `(payload ?? {}) as Record<string, unknown>` — type assertion on runtime value | Accept: payload already validated by Zod in Step 2; safe cast |
| DOCTRINE-REC-001 | ADVISORY | raise-event.ts:34-43 | `VALID_FROM_STATES` map is a strong candidate for an ADR (Events as Logged Facts / State Machine) | Consider `/plan-3a-adr` after Phase 4 when handlers are added |
| DOCTRINE-REC-002 | ADVISORY | raise-event.test.ts:26-50 | `createFakeStateStore()` pattern is reusable for Phase 4+ tests | Consider extracting to shared test helper before Phase 4 |

---

## E) Detailed Findings

### E.0) Cross-Phase Regression Analysis

**Prior phases**: Phase 1 (94 tests), Phase 2 (38 tests in 032-*)

| Check | Result |
|-------|--------|
| Phase 1+2 tests rerun | ✅ 132 tests pass (all 032-* tests) |
| Full test suite | ✅ 3563 passed, 41 skipped (unchanged from Phase 2 baseline) |
| Contract validation | ✅ No breaking changes to Phase 1/2 interfaces |
| Integration points | ✅ `index.ts` barrel additive only (+3 exports), no removals |
| Backward compatibility | ✅ No existing exports modified or removed |

**Verdict**: PASS — zero regressions.

### E.1) Doctrine & Testing Compliance

#### Graph Integrity (Step 3a)

| Validator | Result | Details |
|-----------|--------|---------|
| Task↔Log | ✅ PASS | All 9 tasks (T001-T009) have log anchors. T001-T006 batched into single log entry with correct anchor. T007, T008, T009 have individual entries with `Dossier Task` and `Plan Task` metadata. |
| Task↔Footnote | ✅ PASS | All 9 tasks reference `[^3]` in Notes column. Dossier § Phase Footnote Stubs has `[^3]` entry. Plan § 12 has matching `[^3]` with 2 FlowSpace node IDs. Sequential numbering: [^1], [^2], [^3]. |
| Footnote↔File | ✅ PASS | `function:packages/positional-graph/src/features/032-node-event-system/raise-event.ts:raiseEvent` — file exists, function `raiseEvent` exported. `file:packages/positional-graph/src/features/032-node-event-system/index.ts` — file exists, barrel exports present. |
| Plan↔Dossier Sync | ✅ PASS | Plan tasks 3.1-3.9 all `[x]`, dossier T001-T009 all `[x]`. Log links present in plan (📋). Footnote `[^3]` matches in both. |
| Parent↔Subtask | ✅ PASS | No subtasks (all "–" in Subtasks column). No registry entries. |

**Graph Integrity Score**: ✅ INTACT (0 violations)

#### Authority Conflicts (Step 3c)

| Check | Result |
|-------|--------|
| Plan vs dossier footnotes | ✅ Synchronized — [^3] content identical in both |
| Numbering | ✅ Sequential: [^1], [^2], [^3]; [^4], [^5] reserved |
| FlowSpace node IDs | ✅ Both valid format: `function:path:symbol` and `file:path` |

**Verdict**: PASS

#### TDD Compliance

| Check | Result | Evidence |
|-------|--------|---------|
| TDD order (tests before code) | ✅ PASS | Execution log: T001-T006 (RED — "Cannot find module"), T007 (GREEN — "22 passed"), T008 (more tests), T009 (refactor) |
| Tests as documentation | ✅ PASS | 8 Test Doc blocks (1 file-level + 7 per-describe), all with 5 required fields: Why, Contract, Usage Notes, Quality Contribution, Worked Example |
| RED-GREEN-REFACTOR cycles | ✅ PASS | Log documents RED (module not found), GREEN (22 passed), REFACTOR (Biome fixes, NonNullable pattern) |

#### Mock Usage

| Check | Result |
|-------|--------|
| `vi.mock` / `jest.mock` usage | ✅ 0 instances |
| `vi.fn` / `vi.spyOn` usage | ✅ 0 instances |
| Sinon stubs/spies | ✅ 0 instances |
| Fakes implement interfaces | ✅ `FakeNodeEventRegistry` implements `INodeEventRegistry`; `createFakeStateStore()` implements `loadState`/`persistState` signatures |

**Policy**: Fakes over mocks — **COMPLIANT**

#### Plan Compliance

| Task | Expected | Actual | Status |
|------|----------|--------|--------|
| T001 | E190 tests | 2 tests in "unknown type validation" describe | ✅ PASS |
| T002 | E191 tests | 3 tests in "invalid payload validation" describe | ✅ PASS |
| T003 | E192 tests | 2 tests in "source validation" describe | ✅ PASS |
| T004 | E193 tests | 5 tests in "node state validation" describe | ✅ PASS |
| T005 | E194/E195 tests | 3 tests in "question reference validation" describe | ✅ PASS |
| T006 | Success tests | 5 tests in "successful event creation" describe | ✅ PASS |
| T007 | Implement raiseEvent | raise-event.ts created, all tests GREEN | ✅ PASS |
| T008 | Persistence safety tests | 2 tests in "persistence safety" describe | ✅ PASS |
| T009 | Refactor + just fft | 3563 tests pass, Biome clean | ✅ PASS |

**Scope creep**: None. Files modified: `raise-event.ts` (new, in scope), `index.ts` (barrel export, in scope), `raise-event.test.ts` (new, in scope), plan docs (expected).

### E.2) Semantic Analysis

#### Domain Logic Correctness

| Rule | Implementation | Verdict |
|------|---------------|---------|
| 5-step validation order | Type → Payload → Source → State → Question refs | ✅ Matches spec |
| VALID_FROM_STATES map | 8 entries matching Workshop #02 exactly | ✅ Correct |
| Implicit pending handling | `currentStatus = nodeEntry?.status ?? 'pending'`; 'pending' not in any valid-from-states | ✅ Correct |
| Question ref validation (E194) | Finds `question:ask` by event_id in events array | ✅ Correct |
| Question ref validation (E195) | Finds existing `question:answer` with same `question_event_id` | ✅ Correct |
| Event creation fields | event_id (generateEventId), status 'new', stops_execution (from registry), created_at (ISO-8601) | ✅ Correct |
| Phase 3 scope boundary | No status transitions, no backward-compat, no handlers | ✅ Respected |

#### Specification Drift

None detected. Implementation precisely matches dossier design decisions.

### E.3) Quality & Safety Analysis

**Safety Score: 94/100** (CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 3)

#### Correctness

No logic defects found. The 5-step validation pipeline is correct and fail-fast. Null/undefined handling is defensive:
- `state.nodes?.[nodeId]` — safe optional chaining
- `nodeEntry?.status ?? 'pending'` — correct fallback for implicit pending
- `nodeEntry?.events ?? []` — handles legacy nodes without events
- `if (!state.nodes) state.nodes = {}` — defensive initialization

**[LOW] PERF-001** — Lines 65-78: `registry.validatePayload()` is called, and if it fails, `payloadSchema.safeParse()` is called again to get Zod issues. This is a minor redundancy (~microseconds) documented as intentional in Critical Insight #1. Not worth fixing — factory function needs Zod issues.

#### Security

No vulnerabilities found. The function:
- Validates all inputs through Zod schemas (Step 2)
- Validates source against allowlist (Step 3)
- Validates state transitions (Step 4)
- No user-controlled paths, no injection vectors
- No secrets, no information disclosure

#### Performance

No performance issues. Event operations are O(n) on the events array for `question:answer` validation (find existing ask/answer), but events arrays are expected to be small (dozens, not thousands). No unbounded operations.

#### Observability

**[LOW]** — No logging in `raiseEvent()`. This is acceptable for Phase 3 (infrastructure-only, no direct user interaction). Phase 4-6 will add CLI output and logging. The function returns structured errors with codes, messages, and action fields, which is sufficient for caller-level logging.

### E.4) Doctrine Evolution Recommendations

**ADVISORY — does not affect verdict**

| Category | ID | Title | Priority | Evidence |
|----------|----|-------|----------|----------|
| ADR Candidate | DOCTRINE-REC-001 | Events as Logged Facts — State Machine Rules | MEDIUM | `VALID_FROM_STATES` in raise-event.ts:34-43 encodes the first centralized state machine map. Previously, each caller passed its own `validFromStates` array. This is an architectural decision worth documenting. |
| Idiom Candidate | DOCTRINE-REC-002 | `createFakeStateStore()` for in-memory state testing | MEDIUM | raise-event.test.ts:26-50 — reusable pattern for Phase 4+ tests. Consider extracting to shared test helper before Phase 4. |
| Positive Alignment | — | ADR-0004 compliance | — | `raiseEvent` is a standalone function with deps bag, no DI token, no decorators — correctly follows ADR-0004 |
| Positive Alignment | — | ADR-0009 compliance | — | `registerCoreEventTypes()` used to populate registry in tests — follows module registration pattern |
| Positive Alignment | — | R-TEST-007 compliance | — | Zero mock framework usage; all test doubles implement real interfaces |

**Summary Table**:

| Category | New | Updates | Priority HIGH |
|----------|-----|---------|---------------|
| ADRs | 1 | 0 | 0 |
| Rules | 0 | 0 | 0 |
| Idioms | 1 | 0 | 0 |
| Architecture | 0 | 0 | 0 |

---

## F) Coverage Map

### Acceptance Criteria → Test Mapping

| AC | Description | Test(s) | Confidence | Notes |
|----|-------------|---------|------------|-------|
| AC-2 | NodeEvent created with correct lifecycle state | T006: 5 tests (event fields, stops_execution, append, updated_at, init array) | 100% | Explicit behavioral assertions on all event fields |
| AC-3 (E190) | Unknown event type rejected | T001: 2 tests (E190 error, available types listed) | 100% | Error code and message content validated |
| AC-3 (E191) | Invalid payload rejected with field-level errors | T002: 3 tests (missing fields, extra fields, schema hint) | 100% | Zod field-level errors + action field checked |
| AC-4 (E192) | Unauthorized source rejected | T003: 2 tests (unauthorized source, valid source acceptance) | 100% | Both rejection and acceptance paths tested |
| AC-5 (E193) | Wrong node state rejected | T004: 5 tests (complete, starting, waiting-question, implicit pending, undefined nodes) | 100% | All VALID_FROM_STATES edge cases covered |
| AC-5 (E194) | Question not found | T005: 2 tests (nonexistent ask, undefined events) | 100% | Legacy node path tested |
| AC-5 (E195) | Already answered | T005: 1 test (already answered question) | 100% | Finds existing answer event |
| AC-3 safety | Invalid events never persisted | T008: 2 tests (no persistState call, events unchanged) | 100% | Explicit persistence safety proof |
| `just fft` | Quality gate clean | T009 log evidence | 100% | 3563 tests pass, Biome clean |

**Overall Coverage Confidence**: 100% (all criteria have explicit test assertions with criterion-specific behavior)

**Narrative Tests**: 0 (all tests map directly to acceptance criteria)

---

## G) Commands Executed

```bash
# Phase 3 tests only
pnpm vitest run test/unit/positional-graph/features/032-node-event-system/raise-event.test.ts
# Result: 22 passed (22)

# All 032 tests (Phase 1+2+3 regression check)
pnpm vitest run test/unit/positional-graph/features/032-node-event-system/
# Result: 7 files, 132 passed

# Full test suite (cross-phase regression)
pnpm vitest run
# Result: 235 passed | 5 skipped (240 files), 3563 passed | 41 skipped (3604 tests)

# Lint check on Phase 3 files
pnpm biome check packages/positional-graph/src/features/032-node-event-system/raise-event.ts test/unit/positional-graph/features/032-node-event-system/raise-event.test.ts
# Result: Checked 2 files. No fixes applied.
```

---

## H) Decision & Next Steps

**Decision**: APPROVE — Phase 3 is complete, well-tested, and compliant with all doctrine gates.

**Next Steps**:
1. Commit Phase 3 changes
2. Advance to Phase 4: Event Handlers and State Transitions
3. Run `/plan-5-phase-tasks-and-brief --phase "Phase 4: Event Handlers and State Transitions"` to generate Phase 4 dossier
4. Consider extracting `createFakeStateStore()` to shared test helper before Phase 4 (DOCTRINE-REC-002)
5. Consider `/plan-3a-adr` for Events as Logged Facts after Phase 4 (DOCTRINE-REC-001)

---

## I) Footnotes Audit

| Diff-Touched Path | Footnote Tag(s) | Plan Ledger Node ID(s) |
|-------------------|-----------------|----------------------|
| `packages/positional-graph/src/features/032-node-event-system/raise-event.ts` (new) | [^3] | `function:packages/positional-graph/src/features/032-node-event-system/raise-event.ts:raiseEvent` |
| `packages/positional-graph/src/features/032-node-event-system/index.ts` (modified) | [^3] | `file:packages/positional-graph/src/features/032-node-event-system/index.ts` |
| `test/unit/positional-graph/features/032-node-event-system/raise-event.test.ts` (new) | [^3] | (test file — not tracked in plan ledger per convention) |

All diff-touched source files have corresponding footnote entries in plan § 12.
