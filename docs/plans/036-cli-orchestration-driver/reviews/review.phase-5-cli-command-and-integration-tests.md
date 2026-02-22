# Code Review: Phase 5 — CLI Command and Integration Tests

**Plan**: 036-cli-orchestration-driver
**Phase**: Phase 5: CLI Command and Integration Tests
**Commit Range**: `50363d0..e3402b3`
**Testing Approach**: Full TDD (fakes over mocks)
**Mock Policy**: Fakes over mocks — no `vi.mock`/`jest.mock`
**Date**: 2026-02-17

---

## A) Verdict

**REQUEST_CHANGES**

6 CRITICAL findings. 4 of 9 tasks (T001-T004) are marked `[x]` complete in the plan but were never implemented — the execution log explicitly admits deferral. The footnotes/link graph is entirely unpopulated. DriveEvent mapping (the handler's core responsibility) has zero test coverage.

---

## B) Summary

The CLI command (`cg wf run <slug>`) and DI wiring (GAP-2 + GAP-3) are correctly implemented and all 3,991 tests pass. ADR-0012 domain boundary compliance is exemplary — the handler is a thin consumer-domain wrapper with no business logic. However, the integration tests that were the phase's primary validation layer (T001-T004, AC-INT-1/2/3) were deferred without updating task statuses, creating a false-complete plan state. The footnotes ledger and dossier link graph are placeholders. The unit test suite covers exit codes and options passthrough but misses DriveEvent→stdout mapping entirely. A NaN guard is missing on `--max-iterations` CLI input.

---

## C) Checklist

**Testing Approach: Full TDD**

- [ ] Tests precede code (RED-GREEN-REFACTOR evidence) — T006+T007 merged in 1 minute, no RED phase documented
- [x] Tests as docs (assertions show behavior) — Test Doc block present with all 5 fields
- [x] Mock usage matches spec: Fakes — FakeGraphOrchestration used; minor vi.spyOn on console
- [ ] Negative/edge cases covered — No DriveEvent mapping tests, no verbose flag tests, no error event→stderr test

**Universal (all approaches):**

- [x] BridgeContext patterns followed (N/A — no VS Code extension code)
- [ ] Only in-scope files changed — 4 cascade files not in task table (justified but undocumented)
- [x] Linters/type checks are clean — `just fft` passes (3929 tests, 0 failures)
- [x] Absolute paths used (no hidden context)

---

## D) Findings Table

| ID | Severity | File:Lines | Summary | Recommendation |
|----|----------|------------|---------|----------------|
| F001 | CRITICAL | plan:5.1 | T001 marked [x] but never implemented (no FakeAgentInstance) | Change status to [ ], create deferral ticket |
| F002 | CRITICAL | plan:5.2 | T002 marked [x] but no integration test for completion path | Change status to [ ], create deferral ticket |
| F003 | CRITICAL | plan:5.3 | T003 marked [x] but no integration test for failure path | Change status to [ ], create deferral ticket |
| F005 | CRITICAL | plan:AC-INT-1 | AC-INT-1 (full stack with fake agents) marked satisfied but not met | Uncheck acceptance criterion |
| F006 | CRITICAL | plan:AC-INT-2 | AC-INT-2 (graph failure) marked satisfied but not met | Uncheck acceptance criterion |
| F007 | CRITICAL | plan:AC-INT-3 | AC-INT-3 (max iterations) marked satisfied but not met | Uncheck acceptance criterion |
| F004 | HIGH | plan:5.4 | T004 marked [x], "covered by Phase 4" — but Phase 4 uses fakes, not real stack | Change status to [ ] |
| LINK-1 | HIGH | plan↔dossier | Dossier shows all [ ] pending; plan shows all [x] complete | Sync statuses |
| LINK-2 | HIGH | plan §12 | Change Footnotes Ledger has only placeholders — no real entries | Run plan-6a to populate |
| LINK-3 | HIGH | dossier:stubs | Phase Footnote Stubs section entirely empty | Populate with file→task mapping |
| P5-001 | MEDIUM | positional-graph.command.ts:1783 | No NaN guard on `--max-iterations` — `parseInt("abc")` → NaN → silent no-op | Add validation + error exit |
| MOCK-001 | MEDIUM | cli-drive-handler.test.ts:38-41 | `vi.spyOn(console, 'log').mockImplementation()` violates fakes-over-mocks spirit | Inject output writer interface |
| QUAL-001 | MEDIUM | cli-drive-handler.test.ts:84-94 | Test "logs status events" is a no-op duplicate (FakeGraphOrchestration doesn't emit events) | Add event emission to fake or remove test |
| QUAL-002 | MEDIUM | cli-drive-handler.test.ts | No tests for DriveEvent mapping (iteration, idle, error) or verbose flag | Add FakeGraphOrchestration.setDriveEvents() |
| TDD-001 | MEDIUM | execution.log.md:38-54 | T006+T007 merged — no explicit RED phase documented | Log RED→GREEN separately |
| LINK-4 | MEDIUM | plan:Log column | Plan Phase 5 Log column shows '-' — no [📋] links to execution log | Add log links |
| LINK-5 | MEDIUM | dossier:Notes | Dossier Notes column has no [^N] footnote references | Add footnotes after ledger populated |
| LINK-6 | MEDIUM | plan/dossier | No FlowSpace node IDs in footnotes ledger | Add node IDs for modified symbols |
| F008 | MEDIUM | T005 cascade | 4 files modified not in task table (index.ts, e2e, integration, unit) | Document in task table |
| P5-002 | LOW | cli-drive-handler.ts:30-47 | Switch on event.type lacks exhaustive `default` with `never` check | Add exhaustiveness guard |
| P5-003 | LOW | cli-drive-handler.ts:28-29 | Hardcoded actionDelayMs/idleDelayMs not exposed as CLI options | Document defaults or add options |
| TDD-002 | LOW | execution.log.md | No REFACTOR phase documented for any task | Add refactor note |
| F010 | LOW | cli-drive-handler.test.ts:84-94 | Redundant test (exit code 0 already covered by first test) | Remove or enhance |

---

## E) Detailed Findings

### E.0 Cross-Phase Regression Analysis

**Verdict: PASS**

- **Tests rerun**: 3,991 (270 files, 62 skipped)
- **Tests failed**: 0
- **Contracts broken**: 0
- Phase 1 types: unchanged
- Phase 2 prompts: unchanged
- Phase 3 formatGraphStatus(): unchanged
- Phase 4 drive(): unchanged
- Contract change (`podManager` added to `OrchestrationServiceDeps`): all 4 callers updated in same commit. No breaking change.

### E.1 Doctrine & Testing Compliance

#### Graph Integrity

**Graph Integrity Score: ❌ BROKEN**

| # | Severity | Link Type | Issue | Fix |
|---|----------|-----------|-------|-----|
| LINK-1 | HIGH | Plan↔Dossier | Status mismatch — dossier [ ] vs plan [x] for all tasks | Sync statuses (but first resolve T001-T004 deferral) |
| LINK-2 | HIGH | Task↔Footnote | Change Footnotes Ledger (§12) has only placeholder entries | Run plan-6a-update-progress |
| LINK-3 | HIGH | Task↔Footnote | Dossier Phase Footnote Stubs empty | Populate with per-task file mapping |
| LINK-4 | MEDIUM | Plan↔Dossier | Plan Log column '-' instead of [📋] links | Add execution log anchored links |
| LINK-5 | MEDIUM | Task↔Footnote | Dossier Notes column missing [^N] references | Add after ledger populated |
| LINK-6 | MEDIUM | Footnote↔File | No FlowSpace node IDs anywhere | Add node IDs for key symbols |

#### Authority Conflicts

Plan §12 has placeholder footnotes `[^1]` and `[^2]` with text "To be added during implementation via plan-6a". These were never populated. Dossier has no corresponding stubs. Resolution: run plan-6a to sync both ledgers.

#### TDD Compliance

- **RED-GREEN-REFACTOR**: T006+T007 merged in 1-minute window. No evidence of RED phase (failing tests) before GREEN.
- **REFACTOR**: Not documented for any task.
- **Test Doc**: Present with all 5 fields ✅
- **Mock usage**: FakeGraphOrchestration ✅; `vi.spyOn` on console.log/error ⚠️ (borderline)

#### Testing Evidence

- **Integration tests (T001-T004)**: Entirely deferred. Zero integration test code exists.
- **Unit tests (T006)**: 5 tests written but 1 is a no-op duplicate. Core behavior (DriveEvent→stdout mapping for all 4 event types, verbose flag gating) has zero test coverage.
- **DI wiring (T005)**: Verified by test suite passing (3,991 tests).

### E.2 Semantic Analysis

No domain logic or algorithm correctness issues found. The handler is a thin mapping layer — `event.type → console output` and `exitReason → exit code`. The mapping is correct for all 4 event types and 3 exit reasons.

**Specification drift**: The `onEvent` callback is declared `async` but the handler performs only synchronous console operations. Not a bug, but the async signature is unnecessary overhead per call.

### E.3 Quality & Safety Analysis

**Safety Score: 80/100** (CRITICAL: 0, HIGH: 0, MEDIUM: 1, LOW: 3)

#### Correctness

**[MEDIUM] P5-001** — `positional-graph.command.ts:1783`
- **Issue**: `Number.parseInt(options.maxIterations, 10)` returns NaN if user passes non-numeric `--max-iterations abc`. `drive()` comparison `iterations < NaN` is always false → exits immediately with 0 iterations, no error.
- **Impact**: User typo produces silent no-op instead of clear error.
- **Fix**:
```diff
+ const maxIterations = Number.parseInt(options.maxIterations, 10);
+ if (Number.isNaN(maxIterations) || maxIterations < 1) {
+   console.error(`Invalid --max-iterations value: ${options.maxIterations}`);
+   process.exit(1);
+ }
  const exitCode = await cliDriveGraph(handle, {
-   maxIterations: Number.parseInt(options.maxIterations, 10),
+   maxIterations,
    verbose: options.verbose,
  });
```

#### Security

No security findings. CLI input is validated by Commander.js for argument structure. No path traversal, injection, or secret exposure risks.

#### Performance

No performance findings. Container creation per command follows existing `getWorkUnitService()` pattern. DI factory creates objects lazily.

#### Observability

**[LOW] P5-002** — Missing exhaustive switch default in event handler. New DriveEvent types would be silently dropped.

**[LOW] P5-004** — `loadState`/`persistState` throw from anonymous lambdas; stack traces would be opaque if contract violated. Acceptable for Phase 5.

### E.4 Doctrine Evolution Recommendations (Advisory)

| Category | New | Updates | Priority HIGH |
|----------|-----|---------|---------------|
| ADRs | 0 | 0 | 0 |
| Rules | 0 | 0 | 0 |
| Idioms | 1 | 0 | 0 |
| Architecture | 1 | 0 | 0 |

**Idiom Candidate**: "Consumer Domain Event Handler" — the DriveEvent→switch/case mapping in cli-drive-handler.ts is the canonical consumer-domain pattern from ADR-0012. Worth codifying as other consumers (web SSE, MCP tool) will follow the same pattern.

**Architecture Update**: `@chainglass/positional-graph` is not listed in architecture.md's package table despite being a major package.

**Doctrine Gaps**:
1. No idiom for `registerXxxServices()` module registration pattern (ADR-0009)
2. No guidance on exporting domain-specific fakes from domain packages (R-ARCH-002 gap)
3. `wrapAction()` CLI command pattern undocumented

**Positive Alignment**:
- ADR-0012: cli-drive-handler is pure consumer-domain — zero business logic ✅
- ADR-0004: useFactory DI pattern followed correctly ✅
- ADR-0009: registerOrchestrationServices() called correctly ✅
- R-TEST-002: Test Doc block complete ✅
- R-CODE-002: Naming conventions followed ✅

---

## F) Coverage Map

| AC | Description | Test Coverage | Confidence | Notes |
|----|-------------|--------------|------------|-------|
| AC-21 | `cg wf run <slug>` exists | Command registered in diff | 75% | No CLI invocation test |
| AC-22 | Driver loop calls run() repeatedly | Phase 4 unit tests (drive.test.ts) | 75% | Covered by prior phase, not Phase 5 tests |
| AC-24 | Exit 0 complete, 1 failure | cli-drive-handler.test.ts (3 tests) | 100% | Explicit test-to-criterion mapping |
| AC-25 | --max-iterations flag | cli-drive-handler.test.ts (1 test) | 75% | Options passthrough tested; NaN not tested |
| AC-26 | Status output to terminal | cli-drive-handler.test.ts | 25% | Test is a no-op — FakeGraphOrchestration doesn't emit events |
| AC-INT-1 | Full stack with fake agents | **NONE** | 0% | Deferred — no integration test |
| AC-INT-2 | Graph failure exits correctly | **NONE** | 0% | Deferred — no integration test |
| AC-INT-3 | Max iterations exits correctly | **NONE** | 0% | Deferred — no integration test |

**Overall Coverage Confidence: 44%** (350/800 possible points)

---

## G) Commands Executed

```bash
# Diff generation
git diff --unified=3 --no-color 50363d0..e3402b3 -- ':(exclude)docs/plans/'

# Test verification (via cross-phase regression)
pnpm test -- --run
# Result: 270 files passed, 6 skipped, 3929 tests passed, 62 skipped
```

---

## H) Decision & Next Steps

**Verdict: REQUEST_CHANGES**

### Blocking Issues (must fix before merge)

1. **Task status integrity** (F001-F004): Change T001-T004 status from `[x]` to `[ ]` in both plan and dossier. Add deferral notes with follow-up tracking reference.
2. **Acceptance criteria integrity** (F005-F007): Uncheck AC-INT-1, AC-INT-2, AC-INT-3 in the plan. Document as deferred.
3. **Graph integrity** (LINK-1 through LINK-3): Run plan-6a-update-progress to populate footnotes ledger, sync plan↔dossier statuses, add execution log links.

### Recommended Fixes (should fix)

4. **NaN guard** (P5-001): Add input validation on `--max-iterations`.
5. **DriveEvent mapping tests** (QUAL-001, QUAL-002): Either enhance FakeGraphOrchestration to emit events during `drive()`, or remove the no-op test and document the gap.
6. **vi.spyOn replacement** (MOCK-001): Inject output writer interface for stricter fakes-over-mocks compliance.

### Advisory (nice to have)

7. Add exhaustive switch default (P5-002).
8. Document RED-GREEN-REFACTOR cycles in execution log (TDD-001, TDD-002).
9. Codify "Consumer Domain Event Handler" idiom.

**Who approves**: Plan author after blocking issues resolved.
**Next**: Follow `fix-tasks.phase-5-cli-command-and-integration-tests.md` → rerun plan-6 for fixes → rerun plan-7.

---

## I) Footnotes Audit

| Diff-Touched Path | Footnote Tag(s) | Node-ID Link(s) |
|-------------------|-----------------|-----------------|
| `apps/cli/src/features/036-cli-orchestration-driver/cli-drive-handler.ts` | _(none)_ | _(none)_ |
| `apps/cli/src/commands/positional-graph.command.ts` | _(none)_ | _(none)_ |
| `apps/cli/src/lib/container.ts` | _(none)_ | _(none)_ |
| `packages/positional-graph/src/features/030-orchestration/orchestration-service.ts` | _(none)_ | _(none)_ |
| `packages/positional-graph/src/container.ts` | _(none)_ | _(none)_ |
| `packages/positional-graph/src/index.ts` | _(none)_ | _(none)_ |
| `test/e2e/positional-graph-orchestration-e2e.ts` | _(none)_ | _(none)_ |
| `test/integration/orchestration-wiring-real.test.ts` | _(none)_ | _(none)_ |
| `test/unit/cli/features/036-cli-orchestration-driver/cli-drive-handler.test.ts` | _(none)_ | _(none)_ |
| `test/unit/.../orchestration-service.test.ts` | _(none)_ | _(none)_ |

**Status**: No footnotes populated for any modified file. Footnotes ledger and dossier stubs are both empty placeholders.
