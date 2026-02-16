# Code Review: Phase 3 — CLI Command Update with TDD

**Plan**: 034-agentic-cli
**Phase**: Phase 3: CLI Command Update with TDD
**Reviewer**: plan-7-code-review (automated)
**Date**: 2026-02-16
**Diff Range**: `2a4f82e..c32544c`

---

## A) Verdict

**REQUEST_CHANGES**

The implementation is functionally correct and well-structured, but the plan/dossier graph integrity is **BROKEN** (critical status desync, empty footnotes) and two medium-severity code findings require attention before merge.

---

## B) Summary

Phase 3 successfully rewires `cg agent run` and `cg agent compact` to use `AgentManagerService` / `AgentInstance`. Terminal event handlers, meta option parser, and DI container updates are implemented correctly. 37 new tests pass (127 total in feature folder). All acceptance criteria (AC-29 through AC-34b, AC-47, AC-49) are functionally met. However: (1) the dossier task table was never updated from `[ ]` to `[x]`, creating a critical plan↔dossier status desync; (2) the entire change footnotes system is unpopulated; (3) `createCliTestContainer()` is missing the `AGENT_MANAGER` fake registration; and (4) `ndjsonEventHandler` and `--stream` mode lack behavioral test coverage.

---

## C) Checklist

**Testing Approach: Full TDD**
**Mock Usage: Fakes only (no vi.fn/jest.fn)**

- [x] Tests as docs (assertions show behavior)
- [x] Mock usage matches spec: Fakes only — zero vi.fn/jest.fn/vi.spyOn instances
- [x] Negative/edge cases covered (validation, mutual exclusivity, missing prompt)
- [ ] Tests precede code (RED-GREEN-REFACTOR evidence) — execution log groups RED+GREEN, no explicit RED phase captured
- [ ] `ndjsonEventHandler` has behavioral test coverage (structural only)
- [ ] `--stream` positive path tested (only mutual exclusivity rejection tested)
- [x] BridgeContext patterns followed (N/A — CLI, not VS Code)
- [ ] Only in-scope files changed — `packages/shared/src/index.ts` modified but not in task table
- [x] Linters/type checks are clean — `biome check`: 968 files, no issues
- [x] Absolute paths used (no hidden context)

---

## D) Findings Table

| ID | Severity | File:Lines | Summary | Recommendation |
|----|----------|------------|---------|----------------|
| V4.1 | CRITICAL | tasks.md:232-241 | Dossier task table shows `[ ]` for all 9 tasks; plan shows `[x]` — full status desync | Run `plan-6a` to sync statuses |
| V2.1 | HIGH | tasks.md (Notes) | No `[^N]` footnote references in task table Notes column | Add footnote refs via `plan-6a` |
| V2.2 | HIGH | tasks.md:393-397 | Phase Footnote Stubs table empty | Populate stubs for all modified files |
| V2.3 | HIGH | plan.md:736-740 | Change Footnotes Ledger has placeholder text for [^1]–[^5] | Populate with FlowSpace node IDs |
| V4.2 | HIGH | plan.md:470-480 | Plan Log column shows `-` for all tasks (no [📋] links) | Add execution log anchor links |
| F-01 | MEDIUM | container.ts:350-480 | `createCliTestContainer()` missing `AGENT_MANAGER` fake registration | Add `FakeAgentManagerService` registration |
| F-03 | MEDIUM | shared/index.ts | File modified but not in any task's Absolute Path(s); contradicts Non-Goals ("barrel exports → Phase 5") | Document in deviation ledger or add to task table |
| V1.2 | MEDIUM | tasks.md (Notes) | No `log#anchor` references in dossier task Notes column | Add log links to Notes |
| F-02 | LOW | terminal-event-handler.ts:22-25 | `truncate()` produces incorrect output when `maxLen < 3` | Add guard clause |
| F-06 | LOW | terminal-event-handler.test.ts:92-99 | `ndjsonEventHandler` test never calls the function | Add behavioral test calling the handler |
| F-07 | LOW | cli-agent-handlers.test.ts | No positive test for `--stream` alone (AC-32) | Add test verifying NDJSON handler attachment |
| F-05 | LOW | execution.log.md | Weak TDD evidence — RED+GREEN grouped, no explicit RED phase | Improve execution log detail |
| F-04 | LOW | agent-run-handler.ts:104,117 | Redundant `write`/`resultWrite` variable | Reuse `write` on L118 |
| F-08 | LOW | agent-run-handler.ts + agent-compact-handler.ts | `VALID_AGENT_TYPES` and `validateAgentType()` duplicated across files | Extract to shared validation module |

---

## E) Detailed Findings

### E.0) Cross-Phase Regression Analysis

**Tests rerun**: 127 Phase 2 + Phase 3 tests pass. Execution log reports 3857 total tests, 0 failures.
**Contract validation**: No breaking changes to `IAgentInstance` or `IAgentManagerService` interfaces.
**Integration points**: `AgentManagerService` constructed via `AdapterFactory` — same pattern as prior phase.
**Backward compatibility**: `AgentService` module unchanged (AC-49 satisfied). Only DI registration removed.

**Verdict**: PASS — no cross-phase regressions detected.

### E.1) Doctrine & Testing Compliance

#### Graph Integrity — BROKEN

| ID | Severity | Link Type | Issue | Fix |
|----|----------|-----------|-------|-----|
| V4.1 | CRITICAL | Plan↔Dossier | Plan marks all tasks `[x]`; dossier marks all `[ ]` | Run `plan-6a --sync-status` |
| V2.1 | HIGH | Task↔Footnote | Zero `[^N]` refs in dossier task Notes | Add footnote tags via `plan-6a` |
| V2.2 | HIGH | Task↔Footnote | Phase Footnote Stubs table empty | Populate stubs |
| V2.3 | HIGH | Footnote↔File | Plan § 12 has placeholder text, no FlowSpace node IDs | Populate ledger |
| V4.2 | HIGH | Task↔Log | Plan Log column all `-` (no [📋] links) | Add execution log links |
| V3.1 | HIGH | Footnote↔File | Cannot validate node IDs — none exist | Populate after V2.3 |
| V1.2 | MEDIUM | Task↔Log | Dossier Notes column has no `log#anchor` links | Add log anchors |
| V4.3 | MEDIUM | Task↔Footnote | Neither plan nor dossier Notes have `[^N]` refs | Add after V2.1 |
| V1.3 | LOW | Task↔Log | Execution log metadata is plain text, not clickable links | Convert to markdown links |

**Graph Integrity Score**: ❌ BROKEN (1 critical, 5 high)

#### TDD Compliance

- **Fakes only**: ✅ PASS — zero mock framework usage across all tests
- **TDD order**: ⚠️ WEAK — execution log groups T001+T002 (RED+GREEN) in 2 minutes without explicit RED evidence
- **RED-GREEN-REFACTOR cycles**: ⚠️ NOT DOCUMENTED — log shows outcomes but not intermediate states

#### Test Coverage Gaps

- **ndjsonEventHandler** (F-06): Test at L92-99 never calls the function — verifies JSON structure manually
- **--stream positive path** (F-07): No test verifies `ndjsonEventHandler` is attached when `--stream` is used alone

### E.2) Semantic Analysis

All acceptance criteria are functionally met:

| AC | Status | Evidence |
|----|--------|----------|
| AC-29 | ✅ | `agent-run-handler.ts:101` — `getNew()` when no `--session` |
| AC-30 | ✅ | `agent-run-handler.ts:100` — `getWithSessionId()` with `--session` |
| AC-31 | ✅ | `agent-run-handler.ts:108` — verbose handler attached |
| AC-32 | ⚠️ | `agent-run-handler.ts:106` — NDJSON handler attached, but test coverage weak |
| AC-33 | ✅ | Result JSON contains `sessionId` |
| AC-34 | ✅ | `agent-run-handler.ts:122-123` — exit code 0/1 |
| AC-34a | ✅ | `agent-compact-handler.ts:44` — `getWithSessionId()` |
| AC-34b | ✅ | `agent-compact-handler.ts:45` — `compact()` on instance |
| AC-47 | ✅ | 3857 tests pass |
| AC-49 | ✅ | `AgentService` module unchanged |
| DYK-P3#1 | ✅ | Default mode: no event handler, JSON result only |
| DYK-P3#2 | ✅ | `validateOutputMode()` rejects conflicting flags |
| DYK-P3#3 | ✅ | No timeout enforcement (intentional) |

### E.3) Quality & Safety Analysis

**Safety Score: 86/100** (CRITICAL: 0, HIGH: 0, MEDIUM: 2, LOW: 4)

#### Correctness
- F-02: `truncate()` edge case with `maxLen < 3` — no current callers pass small values, so safe in practice
- F-04: Redundant `write`/`resultWrite` variable — no functional impact

#### Security
- Path traversal in `--prompt-file`: Uses `pathResolver.resolvePath()` + `fileSystem.exists()`. CLI runs with user permissions — no elevation concern. **No issues found.**

#### Performance
- No unbounded operations, N+1 patterns, or memory leak risks detected. All operations are single-instance.

#### Observability
- Error messages are descriptive (`Invalid agent type`, `Cannot combine`, `Prompt file not found`)
- No structured logging in handlers — acceptable for CLI output

### E.4) Doctrine Evolution Recommendations (Advisory)

#### Rules Candidates
| ID | Rule | Evidence | Priority |
|----|------|----------|----------|
| RULE-REC-001 | Handler functions should be pure — accept deps as parameters, return exit code, never call `process.exit()` | `agent-run-handler.ts`, `agent-compact-handler.ts` both follow this pattern | MEDIUM |
| RULE-REC-002 | CLI command actions should resolve DI container once, pass deps to handler | `agent.command.ts:43-52` | LOW |

#### Idioms Candidates
| ID | Pattern | Evidence | Priority |
|----|---------|----------|----------|
| IDIOM-REC-001 | Output capture pattern: `write?: (s: string) => void` for testable CLI output | `TerminalEventHandlerOptions.write`, `AgentRunDeps.write` | MEDIUM |

#### Positive Alignment
- ADR-0004 (DI): `useFactory` pattern correctly applied in `container.ts:262-279`
- ADR-0009 (module registration): Registration follows existing module pattern
- PlanPak: All plan-scoped files correctly placed in `features/034-agentic-cli/`

---

## F) Coverage Map

| AC | Test File | Test Name | Confidence | Notes |
|----|-----------|-----------|------------|-------|
| AC-29 | cli-agent-handlers.test.ts | creates via getNew when no --session | 100% | Explicit AC-29 reference |
| AC-30 | cli-agent-handlers.test.ts | creates via getWithSessionId when --session | 100% | Explicit AC-30 reference |
| AC-31 | cli-agent-handlers.test.ts | attaches verbose handler when --verbose | 75% | Behavioral match, verifies `[agent-claude-code]` prefix |
| AC-32 | cli-agent-handlers.test.ts | (none) | 0% | **No positive `--stream` test** |
| AC-33 | cli-agent-handlers.test.ts | outputs result JSON containing sessionId | 100% | Explicit AC-33 reference |
| AC-34 | cli-agent-handlers.test.ts | returns exit code 0/1 | 100% | Explicit AC-34 reference |
| AC-34a | cli-agent-handlers.test.ts | uses getWithSessionId | 100% | Explicit AC-34a reference |
| AC-34b | cli-agent-handlers.test.ts | calls compact on instance | 100% | Explicit AC-34b reference |
| AC-47 | (regression) | just fft | 100% | 3857 tests, 0 failures |
| AC-49 | (no-change) | — | 100% | Module verified unchanged |

**Overall Coverage Confidence**: 87.5% (7/8 testable ACs at 75%+, AC-32 at 0%)

---

## G) Commands Executed

```bash
# Unit tests
pnpm exec vitest run test/unit/features/034-agentic-cli/ --reporter verbose
# Result: 7 files, 127 tests, 0 failures

# Linter
just lint
# Result: 968 files, no issues

# Diff
git diff --unified=3 --no-color --stat 2a4f82e..c32544c
# Result: 15 files changed, 1576 insertions, 237 deletions
```

---

## H) Decision & Next Steps

**Verdict**: REQUEST_CHANGES

### Blocking (must fix before merge)

1. **V4.1**: Sync dossier task statuses — update all 9 tasks from `[ ]` to `[x]`
2. **V2.1–V2.3, V3.1, V4.2**: Populate change footnotes and log links — run `plan-6a` to sync
3. **F-01**: Add `FakeAgentManagerService` registration to `createCliTestContainer()`

### Recommended (non-blocking)

4. **F-07**: Add positive `--stream` test for AC-32
5. **F-06**: Add behavioral `ndjsonEventHandler` test
6. **F-03**: Document `packages/shared/src/index.ts` barrel export pull-forward in deviation ledger

### Process

1. Fix items 1–3 (blocking)
2. Rerun `just fft` to verify
3. Rerun `/plan-7-code-review` for re-validation
4. On APPROVE → merge and advance to Phase 4

---

## I) Footnotes Audit

| Diff-Touched Path | Footnote Tag(s) | Node-ID Link(s) |
|--------------------|-----------------|-----------------|
| `apps/cli/src/features/034-agentic-cli/terminal-event-handler.ts` | (none) | (none) |
| `apps/cli/src/features/034-agentic-cli/parse-meta-options.ts` | (none) | (none) |
| `apps/cli/src/features/034-agentic-cli/agent-run-handler.ts` | (none) | (none) |
| `apps/cli/src/features/034-agentic-cli/agent-compact-handler.ts` | (none) | (none) |
| `apps/cli/src/commands/agent.command.ts` | (none) | (none) |
| `apps/cli/src/lib/container.ts` | (none) | (none) |
| `packages/shared/src/index.ts` | (none) | (none) |
| `test/unit/features/034-agentic-cli/terminal-event-handler.test.ts` | (none) | (none) |
| `test/unit/features/034-agentic-cli/parse-meta-options.test.ts` | (none) | (none) |
| `test/unit/features/034-agentic-cli/cli-agent-handlers.test.ts` | (none) | (none) |

**Status**: All 10 diff-touched files have **zero** footnote coverage. The entire footnote system was not populated during Phase 3 implementation.
