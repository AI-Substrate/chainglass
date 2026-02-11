# Code Review: Phase 1 — Event Types, Schemas, and Registry

**Plan**: 032-node-event-system
**Phase**: Phase 1: Event Types, Schemas, and Registry
**Reviewer**: plan-7-code-review (automated)
**Date**: 2026-02-07
**Diff Range**: HEAD (ebc8c8e) → working tree (uncommitted)

---

## A) Verdict

**REQUEST_CHANGES**

4 HIGH findings on Test Doc compliance (R-TEST-002/R-TEST-003). Implementation code, architecture, mock policy, PlanPak, and safety are all solid. Remediation is mechanical (add per-test Test Doc blocks) and low-risk.

---

## B) Summary

Phase 1 delivers a well-structured, well-tested foundational data model for the Node Event System. All 12 tasks complete, 94 tests passing, `just fft` clean. The implementation correctly follows ADR-0008, PlanPak placement rules, and the fakes-over-mocks policy.

**Blocking issues**: Test Doc blocks are per-file instead of per-`it()` as required by R-TEST-002/R-TEST-003. The established project convention (Plan 029) achieves 1:1 ratio.

**Advisory**: `QuestionAskPayloadSchema` lacks cross-field validation for `options` when `type` is `'single'` or `'multi'`. This is a spec deviation but non-blocking for Phase 1 since no events are raised yet. Fix before Phase 3.

---

## C) Checklist

**Testing Approach: Full TDD**

- [x] Tests precede code (RED-GREEN-REFACTOR evidence) — T005 RED before T006 GREEN
- [ ] Tests as docs (per-test Test Doc blocks) — **FAIL**: file-level only, not per-`it()`
- [x] Mock usage matches spec: Fakes over mocks — no `vi.mock`/`jest.mock` found
- [x] Negative/edge cases covered — strict schema tests, unknown type, duplicate registration, extra fields
- [x] BridgeContext patterns followed — N/A (no VS Code extension code)
- [x] Only in-scope files changed — 12 new + 1 cross-plan-edit (positional-graph-errors.ts)
- [x] Linters/type checks are clean — `just fft`: 3523 tests, 0 failures
- [x] Absolute paths used (no hidden context) — all paths explicit

---

## D) Findings Table

| ID | Severity | File:Lines | Summary | Recommendation |
|----|----------|------------|---------|----------------|
| UNI-001 | HIGH | event-payloads.test.ts:1-8 | File-level Test Doc for 38 tests; per-`it()` required (R-TEST-002) | Add per-test Test Doc blocks |
| UNI-002 | HIGH | node-event-registry.test.ts:1-370 | 3 section-level Test Docs for 43 tests; per-`it()` required | Add per-test Test Doc blocks |
| UNI-003 | HIGH | event-id.test.ts:1-8 | File-level Test Doc for 5 tests; per-`it()` required | Add per-test Test Doc blocks |
| UNI-004 | HIGH | event-errors.test.ts:1-8 | File-level Test Doc for 8 tests; per-`it()` required | Add per-test Test Doc blocks |
| PLAN-001 | MEDIUM | event-type-registration.ts | Interface-only file lacks `.interface.ts` suffix (R-CODE-003) | Rename to `event-type-registration.interface.ts` |
| SEM-001 | MEDIUM | event-payloads.schema.ts:27-35 | QuestionAskPayloadSchema missing cross-field validation for `options` with `single`/`multi` | Add `.superRefine()` before Phase 3 |
| FN-01 | MEDIUM | tasks.md:414-416 | Dossier Phase Footnote Stubs table empty | Populate with `[^1]` mapping |
| FF-01 | LOW | tasks.md:250 | T011 lists `errors/index.ts` in paths but was not modified | Remove or annotate path |
| TDD-001 | LOW | execution.log.md | Date-only timestamps; no time-of-day for TDD cycle ordering | Use ISO-8601 in future logs |
| TDD-002 | LOW | execution.log.md:79-96 | T005 RED shows import error, not assertion failures | Acceptable for Phase 1 |
| QS-001 | LOW | node-event-registry.ts:37-60 | Inline E190/E191 instead of factories (documented tech debt) | Refactor in Phase 3 |
| QS-002 | LOW | event-id.ts:12 | `Math.random()` edge case for short hex (mitigated by padEnd) | No action needed |

---

## E) Detailed Findings

### E.0) Cross-Phase Regression Analysis

**Skipped**: Phase 1 is the first phase — no prior phases to regress against.

### E.1) Doctrine & Testing Compliance

#### Graph Integrity

**Verdict**: ⚠️ MINOR_ISSUES (1 MEDIUM, 2 LOW)

All critical graph links are intact. Task↔Log: all 12 tasks have corresponding log entries. Plan↔Dossier: perfect 1:1 mapping, statuses synchronized. Footnote [^1] correctly references all Phase 1 files.

| ID | Severity | Link Type | Issue | Fix |
|----|----------|-----------|-------|-----|
| FN-01 | MEDIUM | Task↔Footnote | Dossier Phase Footnote Stubs table empty | Populate with `[^1]` row |
| FN-02 | LOW | Task↔Footnote | All 12 tasks share [^1] (phase-level granularity) | Acceptable pattern |
| FF-01 | LOW | Footnote↔File | T011 lists errors/index.ts but was not modified | Remove or annotate |

#### Authority Conflicts

**N/A** — Only [^1] exists; plan § 12 content is consistent with execution log. No dossier↔plan conflicts.

#### TDD Compliance

- **TDD order**: PASS — T005 (RED) precedes T006 (GREEN) in execution log
- **RED-GREEN-REFACTOR cycles**: Documented in log (T005 failing, T006 passing, T012 refactor)
- **Timestamp granularity**: LOW finding — date-only timestamps, no time-of-day

#### Mock Usage

**PASS** — Zero instances of `vi.mock`, `jest.mock`, `vi.fn`, `vi.spyOn`, or `sinon` found. `FakeNodeEventRegistry` correctly implements `INodeEventRegistry`.

#### Test Doc Compliance (HIGH findings)

Rules authority (R-TEST-002/R-TEST-003) requires Test Doc **inside each `it()` block**. The plan says "every test file" — rules win per rubric.

Current state: 4 test files have file/section-level Test Docs but not per-`it()` blocks. The established convention (Plan 029 `workunit.schema.test.ts`) has 17 Test Docs for 17 `it()` blocks (1:1 ratio).

| File | Test Doc blocks | `it()` blocks | Ratio | Status |
|------|----------------|---------------|-------|--------|
| event-payloads.test.ts | 1 | 38 | 1:38 | ❌ |
| node-event-registry.test.ts | 3 | 43 | 3:43 | ❌ |
| event-id.test.ts | 1 | 5 | 1:5 | ❌ |
| event-errors.test.ts | 1 | 8 | 1:8 | ❌ |

**Fix**: Add 5-field Test Doc comment block inside each `it()`. For highly uniform schema tests (event-payloads.test.ts), per-`describe()` blocks are acceptable as a pragmatic compromise.

#### File Naming

| ID | Severity | Issue |
|----|----------|-------|
| PLAN-001 | MEDIUM | `event-type-registration.ts` contains only an interface but lacks `.interface.ts` suffix (R-CODE-003) |

**Fix**: `git mv event-type-registration.ts event-type-registration.interface.ts` and update 6 import paths.

### E.2) Semantic Analysis

All 8 event types correctly defined with metadata matching Workshop #01:

| Event Type | Display Name | Sources | Stops Exec | Domain | Status |
|------------|-------------|---------|------------|--------|--------|
| node:accepted | Accept Node | agent, executor | false | node | ✅ |
| node:completed | Complete Node | agent, executor | true | node | ✅ |
| node:error | Report Error | agent, executor, orchestrator | true | node | ✅ |
| question:ask | Ask Question | agent, executor | true | question | ⚠️ |
| question:answer | Answer Question | human, orchestrator | false | question | ✅ |
| output:save-data | Save Output Data | agent, executor | false | output | ✅ |
| output:save-file | Save Output File | agent, executor | false | output | ✅ |
| progress:update | Progress Update | agent, executor | false | progress | ✅ |

**SEM-001** (MEDIUM): `QuestionAskPayloadSchema` accepts `type:'single'` without `options`, which is semantically invalid per Workshop #01. The schema validates structurally but not semantically. Fix with `.superRefine()` before Phase 3.

### E.3) Quality & Safety Analysis

**Safety Score: 94/100** (CRITICAL: 0, HIGH: 0, MEDIUM: 1, LOW: 4)

**Correctness**: Sound. Registry CRUD, list/filter, validation all correct. Zod schemas enforce types, required fields, and `.strict()`. Error factories produce complete `ResultError` objects. Event ID generation handles edge cases via `padEnd`.

**Security**: Clean. All schemas use `.strict()`. No secrets, injection vectors, or credential exposure. Input validated at schema boundaries.

**Performance**: Clean. Map-based O(1) lookups. No unbounded operations. List spreads are O(n) with n=8.

**Observability**: Clean. Error messages include event type, available types, field paths, and actionable guidance. Pure data layer with no I/O to observe.

### E.4) Doctrine Evolution Recommendations

*Advisory — does not affect verdict.*

| Category | Recommendation | Priority | Evidence |
|----------|---------------|----------|----------|
| Idiom | Document "Contract Test Factory" pattern (parameterized test factory running same assertions on real + fake) | MEDIUM | `node-event-registry.test.ts` lines 155-224 |
| Rule | Consider per-`describe()` Test Doc as acceptable for uniform schema validation tests | LOW | 38 schema tests in `event-payloads.test.ts` — 1:1 would be noisy |

---

## F) Coverage Map

**Testing Approach**: Full TDD
**Overall Coverage Confidence**: 85%

| AC | Description | Test File(s) | Assertions | Confidence |
|----|-------------|-------------|------------|------------|
| AC-1 | All 8 event types registered | node-event-registry.test.ts:269-292 | `list().length === 8`, all names present | 100% (explicit) |
| AC-3 | Payload validation works | event-payloads.test.ts (38 tests), registry.test.ts:348-369 | safeParse valid/invalid per schema | 100% (explicit) |
| AC-4 | Registry rejects unauthorized sources | core-event-types.ts (allowedSources defined) | Not enforced at registry level (deferred to Phase 3 raiseEvent) | 50% (metadata defined, enforcement deferred) |
| Phase AC | Contract tests pass | node-event-registry.test.ts:155-224 | 8 shared assertions × 2 implementations | 100% (explicit) |
| Phase AC | Error codes E190-E195 | event-errors.test.ts (8 tests) | All 6 factories produce correct code/message/action | 100% (explicit) |
| Phase AC | `just fft` clean | execution.log.md T012 | 3523 tests, 0 failures | 100% (verified) |

**Narrative Tests**: None detected — all tests map to specific acceptance criteria or task success criteria.

---

## G) Commands Executed

```bash
# Diff generation
git diff --unified=3 --no-color HEAD -- packages/ test/
# + untracked files captured via sed

# Static checks
pnpm test
# Result: 232 test files passed | 5 skipped (237)
#         3523 tests passed | 41 skipped (3564)

# Mock scan
grep -r "vi.mock\|jest.mock\|vi.fn\|vi.spyOn\|sinon" test/unit/positional-graph/features/032-node-event-system/
# Result: 0 matches

# Convention check
grep -c "Test Doc:" test/unit/positional-graph/features/032-node-event-system/*.test.ts
# vs grep -c "it(" for same files
```

---

## H) Decision & Next Steps

**Verdict**: REQUEST_CHANGES

**Blocking items** (must fix before merge):
1. Add per-`it()` Test Doc blocks across all 4 test files per R-TEST-002/R-TEST-003
2. Rename `event-type-registration.ts` → `event-type-registration.interface.ts` per R-CODE-003

**Advisory items** (fix before Phase 3, not blocking):
3. Add `.superRefine()` to `QuestionAskPayloadSchema` for `options` cross-field validation
4. Populate Phase Footnote Stubs table in tasks.md

**After fixes**: Re-run `/plan-6-implement-phase` for the fixes, then re-run `/plan-7-code-review`. Expected outcome: APPROVE.

---

## I) Footnotes Audit

| Diff-Touched Path | Footnote Tag(s) | Plan Ledger Entry |
|-------------------|-----------------|-------------------|
| `features/032-node-event-system/index.ts` | [^1] | Phase 1 complete — 12 source files |
| `features/032-node-event-system/event-source.schema.ts` | [^1] | ↑ |
| `features/032-node-event-system/event-status.schema.ts` | [^1] | ↑ |
| `features/032-node-event-system/node-event.schema.ts` | [^1] | ↑ |
| `features/032-node-event-system/event-payloads.schema.ts` | [^1] | ↑ |
| `features/032-node-event-system/event-type-registration.ts` | [^1] | ↑ |
| `features/032-node-event-system/node-event-registry.interface.ts` | [^1] | ↑ |
| `features/032-node-event-system/node-event-registry.ts` | [^1] | ↑ |
| `features/032-node-event-system/fake-node-event-registry.ts` | [^1] | ↑ |
| `features/032-node-event-system/core-event-types.ts` | [^1] | ↑ |
| `features/032-node-event-system/event-id.ts` | [^1] | ↑ |
| `features/032-node-event-system/event-errors.ts` | [^1] | ↑ |
| `errors/positional-graph-errors.ts` | [^1] | 1 modified file (E190-E195) |
| `test/.../event-payloads.test.ts` | [^1] | 4 test files with 94 tests |
| `test/.../node-event-registry.test.ts` | [^1] | ↑ |
| `test/.../event-id.test.ts` | [^1] | ↑ |
| `test/.../event-errors.test.ts` | [^1] | ↑ |
