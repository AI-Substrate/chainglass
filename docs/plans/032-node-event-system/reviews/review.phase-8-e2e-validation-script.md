# Phase 8: E2E Validation Script — Code Review

**Plan**: [node-event-system-plan.md](../node-event-system-plan.md)
**Dossier**: [tasks.md](../tasks/phase-8-e2e-validation-script/tasks.md)
**Execution Log**: [execution.log.md](../tasks/phase-8-e2e-validation-script/execution.log.md)
**Reviewer**: plan-7-code-review
**Date**: 2026-02-09
**Diff Range**: HEAD (uncommitted working tree vs `3d592ba`)

---

## A) Verdict

**APPROVE** with advisory notes

No CRITICAL or HIGH findings. Two MEDIUM issues related to documentation hygiene (missing footnote [^16] and unsynced plan task checkboxes). Code quality is solid, implementation matches plan intent, all 3689 tests pass.

---

## B) Summary

Phase 8 delivers a 829-line standalone E2E validation script (`test/e2e/node-event-system-visual-e2e.ts`) exercising the full node event system lifecycle through 41 steps across 4 acts. Infrastructure includes shared E2E helpers (`test/helpers/positional-graph-e2e-helpers.ts`, 226 lines), public `loadGraphState`/`persistGraphState` methods on `IPositionalGraphService`, and refactoring of the existing `positional-graph-e2e.ts` to use shared helpers (also fixing 2 silently broken method calls).

The hybrid model (CLI subprocess for agent/human actions, in-process for orchestrator settlement) correctly mirrors ADR-0006's architectural intent. All 6 event types, 5 error codes, 10 CLI commands, and processGraph idempotency are demonstrated. The script exits 0 on success, 1 on failure. `just fft` passes (3689 tests, 0 failures). TypeScript type check clean.

The only findings are documentation hygiene: footnote [^16] was never created in the plan ledger, and the plan's Phase 8 individual task checkboxes (8.1-8.13) remain unchecked despite completion.

---

## C) Checklist

**Testing Approach: Full TDD (adapted for E2E script deliverable)**

Phase 8 is a special case: the deliverable IS the test (standalone `tsx` script, not a vitest test). TDD RED-GREEN-REFACTOR cycles don't apply traditionally since there are no separate test files. The script validates itself via assertions at every step.

- [x] Mock usage matches spec: Avoid mocks (✅ uses real services + real CLI + FakeNodeEventRegistry which is the approved fake pattern)
- [x] Negative/edge cases covered (5 error codes: E190, E191, E193, E196, E197)
- [N/A] Tests precede code (script IS the test — N/A for E2E script deliverable)
- [N/A] RED-GREEN-REFACTOR cycles (N/A for standalone script)

Universal:
- [x] Only in-scope files changed (all files map to tasks T001-T015)
- [x] Linters/type checks clean (`just fft` 3689 passed, `tsc --noEmit` clean)
- [x] Absolute paths used in dossier task table (all paths absolute)
- [x] BridgeContext patterns N/A (not a VS Code extension)

---

## D) Findings Table

| ID | Severity | File:Lines | Summary | Recommendation |
|----|----------|------------|---------|----------------|
| LINK-001 | MEDIUM | `node-event-system-plan.md:849` | Missing footnote [^16] on Phase 8 progress line and no [^16] entry in Change Footnotes Ledger | Run `plan-6a --sync-footnotes` to add [^16] with Phase 8 file changes |
| LINK-002 | MEDIUM | `node-event-system-plan.md:764-777` | Plan Phase 8 task checkboxes (8.1-8.13) remain `[ ]` despite all tasks completed | Update plan task statuses to `[x]` and add [📋] log links |
| LINK-003 | LOW | `tasks.md:496-501` | Dossier Phase Footnote Stubs table has placeholder `_(to be filled)_` for [^16] | Populate with actual file changes after plan-6a sync |
| PLAN-001 | LOW | `tasks.md:229-245` | Dossier expanded plan tasks 8.1-8.13 to T001-T015, adding T014+T015 (infrastructure). These are justified by DYK #1 and #3 decisions but weren't in original plan | Acceptable — documented in Critical Insights section |
| QUAL-001 | LOW | `positional-graph-e2e-helpers.ts:71-81` | JSON extraction from CLI output uses heuristic (scan for last line starting with `{` containing `"success"` or `"error"`). Fragile if CLI output format changes | Consider adding a delimiter/marker to CLI JSON output for reliable extraction |

---

## E) Detailed Findings

### E.0) Cross-Phase Regression Analysis

**Tests Rerun**: Full test suite (`pnpm test`) executed against current code state.
- **Result**: 247 test files passed, 5 skipped, 3689 tests passed, 41 skipped — identical to Phase 7 baseline.
- **Prior phase tests**: All 287+ event system tests from Phases 1-7 continue passing.
- **TypeScript type check**: `tsc --noEmit -p packages/positional-graph/tsconfig.json` — clean (exit 0).
- **Contracts broken**: 0 — `loadGraphState`/`persistGraphState` are additive (new interface methods, no existing methods changed).
- **Integration points**: The existing `positional-graph-e2e.ts` was refactored but still passes (verified in T015 execution log).

**Verdict**: ✅ PASS — no regressions detected.

### E.1) Doctrine & Testing Compliance

#### Graph Integrity — Link Validation

**LINK-001 (MEDIUM)**: Missing footnote [^16] in plan.

The plan's Change Footnotes Ledger ends at [^15] (Phase 7). Phase 8's progress tracking line lacks a `[^16]` tag. The dossier's Phase Footnote Stubs section has a placeholder row for [^16] but it was never populated.

For comparison, Phase 6 has `[^14]` and Phase 7 has `[^15]` on their progress lines.

**Impact**: Cannot traverse from Phase 8 progress line to detailed file change inventory. Graph link broken at Plan→Footnote edge.
**Fix**: Run `plan-6a --sync-footnotes` to create [^16] entry with files:
- `file:packages/positional-graph/src/interfaces/positional-graph-service.interface.ts` — added State import + 2 method signatures
- `file:packages/positional-graph/src/services/positional-graph.service.ts` — added 2 public delegating methods
- `file:test/helpers/positional-graph-e2e-helpers.ts` — NEW: shared E2E helpers
- `file:test/e2e/positional-graph-e2e.ts` — refactored imports, fixed 2 broken method calls
- `file:test/e2e/node-event-system-visual-e2e.ts` — NEW: complete E2E validation script

**LINK-002 (MEDIUM)**: Plan task checkboxes unsynced.

Plan § 6 Phase 8 task table rows 8.1-8.13 all show `[ ]` (unchecked) despite completion. The progress tracking checklist (§ 10) correctly shows `[x]`, but individual task rows within the phase section don't have updated statuses, log links, or footnote tags.

**Impact**: Minor — progress is trackable via § 10 checklist, but detailed task-level progress in § 6 is stale.
**Fix**: Update Phase 8 task table rows to `[x]` and add [📋] execution log links.

**LINK-003 (LOW)**: Dossier footnote stub unpopulated. Consequence of LINK-001 — once [^16] is created, the stub will auto-populate.

#### Mock Usage Compliance

✅ **PASS** — No `vi.mock`, `jest.mock`, or any mocking framework used. All test doubles follow the approved fake pattern:
- `FakeNodeEventRegistry` implements `INodeEventRegistry` interface
- Real `NodeEventService` and `EventHandlerService` used (not faked)
- Real filesystem adapters (NodeFileSystemAdapter, PathResolverAdapter)
- Real CLI subprocess (no mocking of CLI behavior)

#### TDD Discipline

**Assessment**: Phase 8 creates a standalone E2E script, not vitest tests. The plan labels it "Full TDD Approach" but the dossier's Non-Goals explicitly say "Not a vitest test — standalone tsx script" and "No Vitest test wrapper — the script IS the test."

For infrastructure tasks (T014, T015), traditional test evidence exists:
- T014: `tsc --noEmit` clean, 15 existing tests still pass
- T015: Existing E2E script still exits 0, `just fft` 3689 passed

For the script itself (T001-T012), assertions are embedded in the script at every step (41 assertions total). This is testing — just not TDD in the traditional RED-GREEN-REFACTOR sense. **No violation**: the plan's acceptance criteria and workshop design explicitly chose this approach.

### E.2) Semantic Analysis

**Domain Logic Correctness**: The E2E script correctly exercises the two-phase handshake (pending → starting → agent-accepted), question lifecycle (agent-accepted → waiting-question → starting → agent-accepted → complete), and all 6 event types. DYK #1 (answerQuestion returns 'starting', not 'agent-accepted') is explicitly verified at line 600.

**Specification Drift**: None detected. The script exercises all items listed in the plan's Acceptance Criteria for AC-18:
- Schema self-discovery (list-types, schema) ✓
- Both generic raise-event and shortcuts (accept, end, error) ✓
- Event log inspection with stamp-event demo ✓
- processGraph settlement and idempotency proof ✓

### E.3) Quality & Safety Analysis

**Safety Score: 96/100** (CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 2)

#### Correctness

✅ `loadGraphState`/`persistGraphState` are correct thin delegations to existing private methods. No logic to get wrong.

✅ The `runCli` spawn implementation is correct:
- Uses `spawn` (not `exec`), avoiding shell injection
- Sets 30s timeout
- Handles stdout/stderr collection via event listeners
- Parses JSON from output
- Resolves on close, rejects on error

✅ The E2E script's assertion pattern (`assert(condition, message)`) throws descriptive errors, causing the main() catch to `process.exit(1)`.

✅ The existing `positional-graph-e2e.ts` refactor correctly fixes 2 silently broken method calls discovered during Phase 8 work.

#### Security

✅ No path traversal risks. Temp directories use `os.tmpdir()` with `fs.mkdtemp` (OS-managed). Work unit YAML files are written to the temp directory only.

✅ CLI subprocess uses `spawn` with array args (no shell expansion). `workspacePath` is OS-generated temp path.

✅ Temp directories cleaned up in finally block. Workspace registration removed before cleanup.

#### Performance

✅ No unbounded operations. The E2E script is linear (41 steps, each with bounded operations). CLI timeout is 30s (reasonable for subprocess invocations).

**QUAL-001 (LOW)**: The JSON extraction heuristic in `runCli` (scanning backwards for a line starting with `{` containing `"success"` or `"error"`) could break if CLI output format changes. However, this is test infrastructure, not production code, and the pattern matches the existing `positional-graph-e2e.ts` approach.

#### Observability

✅ Excellent diagnostic output. Every step prints its description, outcome, and relevant data. The event log table at Step 10 prints a formatted table of all events with stamps. Error messages include the full `rawOutput` from CLI for debugging. The banner system clearly delineates acts and the final summary lists all exercised capabilities.

### E.4) Doctrine Evolution Recommendations (Advisory — does not affect verdict)

#### New Rules Candidates

| ID | Rule Statement | Evidence | Priority |
|----|---------------|----------|----------|
| RULE-REC-001 | Standalone E2E scripts MUST exit 0 on success and 1 on failure | `node-event-system-visual-e2e.ts:820-828`, `positional-graph-e2e.ts` | MEDIUM |
| RULE-REC-002 | E2E scripts that test CLI behavior MUST rebuild CLI before running (`pnpm build --filter=@chainglass/cli`) | `tasks.md:458-459`, execution log | MEDIUM |

#### New Idioms Candidates

| ID | Pattern | Evidence | Priority |
|----|---------|----------|----------|
| IDIOM-REC-001 | Shared E2E helper pattern: `createTestServiceStack` + `runCli` + `createStepCounter` for CLI-based E2E scripts | `test/helpers/positional-graph-e2e-helpers.ts` | HIGH |
| IDIOM-REC-002 | Hybrid E2E model: CLI subprocess for agent actions, in-process for orchestrator settle | `node-event-system-visual-e2e.ts:1-17` (header comment) | MEDIUM |

#### Positive Alignment

| Doctrine Ref | Evidence | Note |
|-------------|----------|------|
| ADR-0006 (CLI-based agent orchestration) | All agent actions (accept, raise-event, end, error) go through CLI subprocess | Correct architectural boundary |
| ADR-0011 (First-class domain concepts) | Uses real `EventHandlerService` and `NodeEventService`, not fakes for orchestrator | Correct service usage |
| Constitution: Fakes over mocks | `FakeNodeEventRegistry` implements interface; no vi.mock anywhere | Fully compliant |

#### Summary Table

| Category | New | Updates | Priority HIGH |
|----------|-----|---------|---------------|
| ADRs | 0 | 0 | 0 |
| Rules | 2 | 0 | 0 |
| Idioms | 2 | 0 | 1 |
| Architecture | 0 | 0 | 0 |

---

## F) Coverage Map

**Testing Approach**: Standalone E2E script (script IS the test)

| AC | Criterion | Steps/Assertions | Confidence |
|----|-----------|-----------------|------------|
| AC-18a | Script runs fully automatically with zero manual intervention | main() runs all 41 steps without user input; exit 0 verified in T013 | 100% |
| AC-18b | Every step prints human-readable output | All 41 steps use `step()` helper with descriptive text; ACT banners; event log table at Step 10 | 100% |
| AC-18c | Both shortcuts and generic event raise demonstrated | Shortcuts: `accept` (lines 369, 425, 624), `end` (lines 393, 666), `error` (lines 327-341). Generic: `raise-event progress:update` (lines 462-475), `raise-event question:ask` (lines 501-513), `raise-event question:answer` (lines 564-578) | 100% |
| AC-18d | Schema self-discovery shown | STEP 2: `event list-types` (lines 210-217), `event schema question:ask` (lines 219-227) | 100% |
| AC-18e | Event log inspected and displayed | STEP 10: `events` command (lines 689-714), formatted table with event_id/type/source/stops/stamps | 100% |
| AC-18f | Exit 0 on success, 1 on failure | `process.exit(0)` at line 822, `process.exit(1)` at line 827 | 100% |
| AC-18g | `just fft` clean | Execution log T013: 247 test files, 3689 tests passed | 100% |

**Overall Coverage Confidence**: 100% — All 7 acceptance criteria explicitly validated with explicit assertions and evidence.

---

## G) Commands Executed

```bash
# Type check
pnpm exec tsc --noEmit -p packages/positional-graph/tsconfig.json   # exit 0

# Full test suite
pnpm test   # 247 test files passed, 3689 tests, 0 failures

# Git status (scope check)
git status --short

# Git diff (diff analysis)
git diff HEAD --unified=3 --no-color --stat
```

---

## H) Decision & Next Steps

**Decision**: **APPROVE** — Phase 8 implementation is complete, correct, and fully exercises the node event system per AC-18. All tests pass. Code quality is solid with good error handling, clear output, and correct architectural boundaries.

**Advisory fixes (non-blocking)**:
1. Create footnote [^16] in plan Change Footnotes Ledger with Phase 8 file changes
2. Update plan Phase 8 task table rows (8.1-8.13) from `[ ]` to `[x]`
3. Add [^16] tag to Phase 8 progress line

**Next Steps**:
- Plan 032 is now complete (all 8 phases delivered)
- Commit Phase 8 changes
- Plan 030 Phase 6 (ODS) can resume, consuming the event system

---

## I) Footnotes Audit

| Diff-Touched Path | Footnote Tag(s) | Plan Ledger Entry |
|-------------------|-----------------|-------------------|
| `packages/positional-graph/src/interfaces/positional-graph-service.interface.ts` | [^16] (expected) | ❌ Missing — no [^16] in ledger |
| `packages/positional-graph/src/services/positional-graph.service.ts` | [^16] (expected) | ❌ Missing — no [^16] in ledger |
| `test/helpers/positional-graph-e2e-helpers.ts` (NEW) | [^16] (expected) | ❌ Missing — no [^16] in ledger |
| `test/e2e/positional-graph-e2e.ts` | [^16] (expected) | ❌ Missing — no [^16] in ledger |
| `test/e2e/node-event-system-visual-e2e.ts` (NEW) | [^16] (expected) | ❌ Missing — no [^16] in ledger |
| `docs/plans/032-node-event-system/node-event-system-plan.md` | N/A (plan doc) | N/A |

**Note**: All 5 code/test files lack footnote coverage. This is the single documentation gap (LINK-001). No code changes needed.
