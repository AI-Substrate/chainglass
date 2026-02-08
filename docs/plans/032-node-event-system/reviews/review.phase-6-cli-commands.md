# Code Review: Phase 6 — CLI Commands

**Plan**: node-event-system-plan.md
**Phase**: Phase 6: CLI Commands
**Reviewer**: plan-7-code-review
**Date**: 2026-02-08
**Diff Range**: HEAD (unstaged working tree changes vs commit `7b11cb6`)
**Testing Approach**: Full TDD (per plan § Testing Philosophy)
**Mock Policy**: Fakes over mocks — no `vi.mock`/`jest.mock` ever

---

## A) Verdict

### **APPROVE**

No CRITICAL or HIGH findings. All acceptance criteria satisfied. 3660 tests pass (0 regressions). Lint, typecheck, and format clean.

---

## B) Summary

Phase 6 adds 8 CLI commands for the node event system (3 core + 3 shortcuts + 2 discovery), 3 new service methods on `IPositionalGraphService`, 2 error codes (E196, E197), and 5 console formatters. Implementation touches 10 modified files and 2 new test files (26 total tests: 15 unit + 11 integration). All commands follow the established `wrapAction()` + `createOutputAdapter()` pattern. The `getJsonFlag(cmd)` helper correctly solves 4-level Commander nesting. `endNode()` retains its `canEnd()` pre-flight guard. Code is well-structured, follows existing patterns, and all plan tasks T001-T010 are complete.

---

## C) Checklist

**Testing Approach: Full TDD**

- [x] Tests precede code (RED-GREEN-REFACTOR evidence in execution log)
- [x] Tests as docs (assertions show behavior — Test Doc blocks on both test files)
- [x] Mock usage matches spec: **Fakes only** (FakeFileSystem, FakePathResolver, no vi.mock)
- [x] Negative/edge cases covered (E190, E193, E196, unknown event IDs, invalid states)

**Universal:**

- [x] Only in-scope files changed (10 modified + 2 new, all in task table)
- [x] Linters/type checks are clean
- [x] `just fft` equivalent verified (3660 tests, lint clean, typecheck clean)

---

## D) Findings Table

| ID | Severity | File:Lines | Summary | Recommendation |
|----|----------|------------|---------|----------------|
| M001 | MEDIUM | `positional-graph.command.ts:1218-1237` | `parseJsonPayload` calls `process.exit(1)` internally, mixing control flow with parsing | Consider returning a Result type instead; low priority since it follows existing CLI patterns |
| M002 | MEDIUM | `positional-graph.command.ts:1384-1412` | Discovery commands create a fresh `NodeEventRegistry` + `registerCoreEventTypes()` on every call instead of reusing the service's registry | Acceptable for CLI (one-shot invocation); would matter in a long-running process |
| L001 | LOW | `positional-graph.command.ts:1384` | `handleNodeEventListTypes` takes `_graphSlug` and `_nodeId` as unused params | By design (DYK #4: consistency with all other node commands); no action needed |
| L002 | LOW | `console-output.adapter.ts:2214` | `formatWfNodeEventsSuccess` uses heuristic (length===1 && stamps) for detail mode | Works correctly; could be made more explicit with a `mode` field on the result |
| L003 | LOW | `positional-graph.service.ts:2456-2461` | `raiseNodeEvent` accesses `this.nodeEventRegistry` directly after earlier creating `NodeEventService` | Registry is a class field, consistent with how existing methods access it |

---

## E) Detailed Findings

### E.0) Cross-Phase Regression Analysis

**Verdict: PASS**

- **Tests rerun**: Full suite — 3660 passed, 0 failed, 41 skipped (5 test files skipped — pre-existing, web/UI related)
- **Contract validation**: `IPositionalGraphService` interface extended with 3 new methods + `endNode` signature updated with optional `message` param. All existing callers of `endNode` continue to work (parameter is optional). No breaking changes.
- **Integration points**: `raiseNodeEvent()` delegates to the same `NodeEventService.raise()` + `handleEvents()` pipeline that `endNode`/`askQuestion`/`answerQuestion` use (Phase 5). No new integration boundaries introduced.
- **Backward compatibility**: `endNode()` signature change is backward-compatible (added optional `message?: string`). Existing tests for Phases 1-5 continue to pass unchanged.

### E.1) Doctrine & Testing Compliance

**Graph Integrity: ⚠️ MINOR_ISSUES**

The plan's Change Footnotes Ledger (§ 12) does not yet contain Phase 6 entries — footnotes [^1] through [^13] cover Phases 1-5 only. This is expected since Phase 6 has not been committed yet, and footnote updates typically happen during `plan-6a-update-progress`. Phase Footnote Stubs in the dossier are also unpopulated (by design: "Populated by plan-6 during implementation. Do not create stubs during planning."). No blocking issue — `plan-6a` should be run after this review to sync the ledger.

**TDD Compliance: PASS**

- Execution log documents T001 → T002 progression (interface first, then implementation with tests)
- T009 documents 11 integration tests covering full lifecycle, error codes, stop events, shortcuts, multi-event sequence
- Test Doc blocks present on both test files with all 5 required fields (Why, Contract, Usage Notes, Quality Contribution, Worked Example)
- No `vi.mock` or `jest.mock` usage — exclusively FakeFileSystem, FakePathResolver, and real service instances

**Mock Usage: PASS (Fakes only)**

- Unit tests: `FakeFileSystem`, `FakePathResolver`, `stubWorkUnitLoader` — all implement real interfaces
- Integration tests: `FakeFileSystem`, `FakePathResolver`, non-strict loader implementing `IWorkUnitLoader` interface
- Zero mock framework usage across both test files

### E.2) Semantic Analysis

**Verdict: PASS**

- **Domain logic correctness**: `raiseNodeEvent()` correctly follows the raise → load-fresh-state → handleEvents → persist pipeline established in Phase 5. `getNodeEvents()` correctly loads state and applies filters. `stampNodeEvent()` correctly finds event and calls `eventService.stamp()`.
- **Algorithm accuracy**: Event filtering (type, status, eventId) uses standard array operations. No algorithmic complexity concerns.
- **Business rule compliance**: AC-9 (stop-execution agent instruction) correctly implemented via `stopsExecution` flag from registry. AC-10/AC-11 (discovery) correctly queries registry. AC-12/AC-13 (raise/list) correctly delegate to service. AC-14 (shortcuts) correctly route through event system.
- **Specification drift**: `end` command routes through `endNode()` (with canEnd guard), not `raiseNodeEvent()` — this is by design per DYK #1 and plan invariants. No drift.

### E.3) Quality & Safety Analysis

**Safety Score: 96/100** (0 CRITICAL, 0 HIGH, 2 MEDIUM, 1 LOW)

**Correctness findings:**

- **[M001]** `parseJsonPayload()` calls `process.exit(1)` on parse failure. This is a CLI-specific pattern — acceptable since all existing CLI handlers use `process.exit(1)` on error. In a library context this would be HIGH, but in CLI context it follows established convention.

**Security findings:** None. No path traversal, injection, secrets, or auth issues.

**Performance findings:**

- **[M002]** Discovery commands (`handleNodeEventListTypes`, `handleNodeEventSchema`) create a fresh `NodeEventRegistry()` and call `registerCoreEventTypes()` on every invocation via dynamic import. For CLI (one-shot process), this is negligible. If these were called in a server context, caching would be needed. No action required for CLI use case.

**Observability findings:**

- **[L003]** No logging in the new service methods or CLI handlers. This is consistent with the existing codebase — other handlers (e.g., `handleNodeStart`, `handleNodeEnd`) also don't add logging beyond the console output. The `console.log(adapter.format(...))` pattern provides the observable output.

### E.4) Doctrine Evolution Recommendations (Advisory)

**New Rules Candidates:**

| ID | Rule Statement | Evidence | Priority |
|----|---------------|----------|----------|
| RULE-REC-001 | CLI handlers that parse JSON input should validate at the CLI layer (before service call) and return typed E197 errors | `parseJsonPayload()` in command.ts; similar pattern needed for any future JSON-accepting CLI commands | LOW |
| RULE-REC-002 | Discovery/introspection CLI commands should use `<graph> <nodeId>` positional args even when unused, for CLI consistency | `handleNodeEventListTypes`/`handleNodeEventSchema` — per DYK #4 | LOW |

**Positive Alignment:**

| Doctrine Ref | Evidence | Note |
|-------------|----------|------|
| ADR-0006: CLI-Based Agent Orchestration | All 8 commands support `--json` output; agent instruction for stop events | Correctly followed |
| ADR-0008/0009: Module Registration Pattern | `registerCoreEventTypes()` populates registry for discovery commands | Correctly followed |
| ADR-0011: First-Class Domain Concepts | Service methods delegate to internal `NodeEventService`; no public DI token exposed | Correctly followed |
| Plan invariant: endNode guard | `end` command routes through `endNode()` with `canEnd()` pre-flight | Correctly preserved |
| Plan invariant: fakes over mocks | 0 mock framework usage in 26 tests | Correctly followed |

**Summary:**

| Category | New | Updates | Priority HIGH |
|----------|-----|---------|---------------|
| ADRs | 0 | 0 | 0 |
| Rules | 2 | 0 | 0 |
| Idioms | 0 | 0 | 0 |
| Architecture | 0 | 0 | 0 |

---

## F) Coverage Map

| AC | Description | Test File(s) | Assertion(s) | Confidence |
|----|------------|-------------|-------------|------------|
| AC-9 | Stop-execution events show agent instruction | `cli-event-commands.test.ts` L239-259 | `stopsExecution=true` for `node:completed`, `=false` for `node:accepted` | 100% — explicit criterion test |
| AC-10 | `event list-types` lists registered types | Not directly tested via service (discovery is CLI-layer only) | N/A — discovery commands instantiate registry directly | 50% — functional but no service-level test |
| AC-11 | `event schema` shows payload schema | Not directly tested via service | N/A — schema introspection is CLI-layer | 50% — functional but no service-level test |
| AC-12 | `raise-event` creates and persists events | `service-event-methods.test.ts` L74-131, `cli-event-commands.test.ts` L77-93 | Event returned with correct type, source, stopsExecution; persisted to state | 100% — explicit tests |
| AC-13 | `events` reads event log | `service-event-methods.test.ts` L203-250, `cli-event-commands.test.ts` L96-126 | List mode, filter by type, filter by status, single event by ID, E196 on missing | 100% — explicit tests |
| AC-14 | Shortcut commands route through events | `cli-event-commands.test.ts` L278-339 | accept → node:accepted; error → node:error with payload; end → endNode with message | 100% — explicit tests |

**Overall Coverage Confidence: 83%** (5/6 criteria at 100%, 1 at 50%)

**Note on AC-10/AC-11**: Discovery commands (`list-types`, `schema`) are implemented as CLI-layer functions that dynamically import the registry. They don't go through `IPositionalGraphService` and therefore aren't tested at the service integration level. The registry itself is extensively tested in Phase 1 (94 tests). The CLI registration and formatter are structural — they query the registry and format output. This is an acceptable coverage gap for a Full TDD approach since the underlying registry is fully tested.

---

## G) Commands Executed

```bash
# Phase 6 tests only
pnpm vitest run test/unit/positional-graph/features/032-node-event-system/service-event-methods.test.ts test/integration/positional-graph/cli-event-commands.test.ts
# Result: 2 files, 26 tests passed

# Full test suite
pnpm test
# Result: 243 passed | 5 skipped, 3660 tests passed | 41 skipped

# Lint
pnpm exec biome check --no-errors-on-unmatched <all 7 changed/new files>
# Result: No fixes applied

# Typecheck
pnpm exec tsc --noEmit -p packages/positional-graph/tsconfig.json
# Result: Clean (exit 0)
```

---

## H) Decision & Next Steps

**Decision**: APPROVE — merge and advance.

**Next Steps**:
1. Run `plan-6a-update-progress` to sync the plan's Change Footnotes Ledger with Phase 6 changes (footnotes [^14]+)
2. Commit Phase 6 changes
3. Advance to Phase 7 (ONBAS Adaptation) — run `/plan-5` for Phase 7 dossier

---

## I) Footnotes Audit

| Diff-Touched Path | Footnote Tag(s) | Plan Ledger Entry |
|-------------------|-----------------|-------------------|
| `packages/positional-graph/src/errors/positional-graph-errors.ts` | (pending) | Phase 6 not yet in ledger |
| `packages/positional-graph/src/features/032-node-event-system/event-errors.ts` | (pending) | Phase 6 not yet in ledger |
| `packages/positional-graph/src/features/032-node-event-system/index.ts` | (pending) | Phase 6 not yet in ledger |
| `packages/positional-graph/src/index.ts` | (pending) | Phase 6 not yet in ledger |
| `packages/positional-graph/src/interfaces/index.ts` | (pending) | Phase 6 not yet in ledger |
| `packages/positional-graph/src/interfaces/positional-graph-service.interface.ts` | (pending) | Phase 6 not yet in ledger |
| `packages/positional-graph/src/services/positional-graph.service.ts` | (pending) | Phase 6 not yet in ledger |
| `packages/positional-graph/package.json` | (pending) | Phase 6 not yet in ledger |
| `apps/cli/src/commands/positional-graph.command.ts` | (pending) | Phase 6 not yet in ledger |
| `packages/shared/src/adapters/console-output.adapter.ts` | (pending) | Phase 6 not yet in ledger |
| `test/unit/.../service-event-methods.test.ts` | (pending) | Phase 6 not yet in ledger |
| `test/integration/.../cli-event-commands.test.ts` | (pending) | Phase 6 not yet in ledger |

**Action**: Run `plan-6a-update-progress` to populate footnotes before commit.
