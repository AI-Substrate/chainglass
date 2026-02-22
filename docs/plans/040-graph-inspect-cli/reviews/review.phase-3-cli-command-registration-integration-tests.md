# Phase Review — Phase 3: CLI Command Registration + Integration Tests

## A) Verdict
**REQUEST_CHANGES**

## B) Summary
- Workflow mode: **Full** (no `Mode: Simple` marker in plan).
- Diff audited: `ae7770d..2a79b9f`.
- Testing approach: **Full TDD**; mock usage policy interpreted as **Avoid mocks / real fixtures**.
- Core CLI wiring is implemented and integration tests exist.
- Graph integrity is **BROKEN** (Task↔Log and Task↔Footnote issues).
- Multiple HIGH/CRITICAL doctrine findings (missing RED/REFACTOR evidence, missing Test Doc blocks).
- Regression check: prior phase inspect unit tests pass; full `just fft` currently fails on unrelated flaky uniqueness test.

## C) Checklist
**Testing Approach: Full TDD**
- [ ] Tests precede code (RED-GREEN evidence)
- [ ] Tests as docs (required Test Doc blocks)
- [x] Mock usage matches spec preference
- [ ] Negative/edge cases covered

**Universal**
- [ ] BridgeContext/absolute-path hygiene fully compliant (relative deep import in test)
- [ ] Only in-scope files changed
- [ ] Linters/type checks are clean (`just fft` failed)
- [x] CLI handler follows thin-wrapper ADR pattern

## D) Findings Table
| ID | Severity | File:Lines | Summary | Recommendation |
|---|---|---|---|---|
| V1 | HIGH | tasks.md + execution.log.md | Completed tasks missing `log#anchor` notes and log metadata backlinks | Sync links with `plan-6a`; add Task↔Log backlinks |
| V2 | HIGH | tasks.md + plan.md §Change Footnotes Ledger | Plan ledger footnotes not mirrored in dossier stubs | Run `plan-6a --sync-footnotes` |
| V3 | CRITICAL | execution.log.md + git history | No demonstrable RED-before-GREEN order | Add explicit RED evidence and sequence in logs/commits |
| V4 | HIGH | execution.log.md | REFACTOR phase evidence missing | Add REFACTOR entries + rerun evidence |
| V5 | HIGH | test/.../inspect-cli.test.ts | Required Test Doc blocks missing on promoted tests | Add 5-field Test Doc blocks per test |
| V6 | HIGH | test/.../inspect-cli.test.ts | T007 does not verify required 40-char truncation | Add assertion with >40-char fixture output |
| V7 | HIGH | apps/cli/src/commands/positional-graph.command.ts | Inspect returns success exit code even when `result.errors` exists | Exit non-zero when errors are present |
| V8 | MEDIUM | test/.../inspect-cli.test.ts | T005 does not assert output values present in JSON payload | Assert output values for both nodes |
| V9 | MEDIUM | apps/cli/src/commands/positional-graph.command.ts | Unknown `--node` path not treated as failure | Validate node existence and fail explicitly |
| V10 | MEDIUM | packages/positional-graph/src/index.ts | Extra API surface exported beyond explicit phase paths | Justify in dossier or narrow exports |

## E) Detailed Findings
### E.0 Cross-Phase Regression Analysis
- Prior phases detected: Phase 1, Phase 2.
- Re-ran prior inspect command: `pnpm vitest run test/unit/positional-graph/features/040-graph-inspect/` → **PASS** (41/41).
- Contracts/integration: no direct break detected in inspect service/formatter consumption.
- Backward compatibility: no removal of prior inspect features observed.
- Additional suite run (`just fft`) failed on unrelated test: `test/unit/positional-graph/features/032-node-event-system/event-id.test.ts` uniqueness assertion.

### E.1 Doctrine & Testing Compliance
**Step 3a Graph Integrity**: **❌ BROKEN**
- Task↔Log: missing backlinks/anchors and missing Dossier/Plan task metadata in log entries.
- Task↔Footnote: plan footnotes `[^1]`, `[^2]` unresolved in dossier stubs.
- Footnote↔File: ledger still placeholder text; no valid node IDs.
- Plan↔Dossier sync: task status appears synchronized.
- Parent↔Subtask: no phase-3 subtasks found.

**Step 3c Authority Conflicts**
- `AUTH-001` HIGH: plan has `[^1]` placeholder, dossier has no resolved entry.
- `AUTH-002` HIGH: plan has `[^2]` placeholder, dossier has no resolved entry.
- Resolution: Plan ledger authoritative; sync dossier via `plan-6a`.

**Step 4 Doctrine validators**
- TDD validator: FAIL (missing RED/REFACTOR evidence, missing Test Doc blocks).
- Mock validator: PASS (0 mock instances).
- Universal/rules validator: FAIL (missing Test Doc blocks, deep relative import).
- Plan compliance validator: FAIL (T005/T006/T007 partial validation + mild scope drift).

**Step 5 Testing evidence & coverage alignment**
- Evidence artifact exists: phase execution log present.
- Execution log is complete narrative, but does not include explicit RED/GREEN/REFACTOR cycles per task.
- Coverage confidence below target for criteria requiring truncation/value-level assertions.

### E.2 Semantic Analysis
1. **MEDIUM** `test/integration/.../inspect-cli.test.ts` (T005): JSON test validates envelope shape but not required output values.
2. **MEDIUM** `test/integration/.../inspect-cli.test.ts` (T007): outputs-mode test omits required truncation behavior validation.

### E.3 Quality & Safety Analysis
**Safety Score: -100/100** (CRITICAL: 1, HIGH: 5, MEDIUM: 4, LOW: 0)  
**Verdict: REQUEST_CHANGES**

- **HIGH** `apps/cli/src/commands/positional-graph.command.ts`: command does not fail when inspect returns domain errors.
- **HIGH** same file: invalid `--node` path can surface as successful command execution.
- **MEDIUM** test file: missing negative-path integration tests for error/exit behavior.
- **MEDIUM** perf: full graph snapshot computed even for targeted modes.
- **MEDIUM** security/observability hardening opportunity: sanitize control sequences before printing untrusted values.

### E.4 Doctrine Evolution Recommendations (Advisory)
- Clarify doctrine for CLI flag precedence/conflicts (`--node` vs `--outputs` vs `--compact` + `--json`).
- Clarify whether Test Doc requirement applies to all integration tests or only promoted high-value tests.
- Add a reusable CLI output-capture idiom/helper for integration tests.
- Positive alignment: ADR-0006 thin consumer CLI pattern followed; ADR-0012 boundaries preserved.

## F) Coverage Map
| Acceptance Criterion | Evidence | Confidence |
|---|---|---|
| AC-1 command works | integration default test + handler wiring | 75% |
| AC-2 `--json` parseable | JSON parse + envelope assertions | 75% |
| AC-3 all 4 modes output | default/node/outputs/compact tests | 75% |
| AC-4 wrapAction + adapter pattern | command registration + adapter usage in handler | 100% |
| AC-5 no pod/session internals | no such fields asserted/leaked in tests/diff | 75% |
| T007 truncation requirement | no explicit truncation assertion | 25% |
| T005 output values present | no explicit output-values assertion | 50% |

**Overall coverage confidence: 64% (MEDIUM).**
Narrative tests present where behavior is implied but criterion linkage is not explicit.

## G) Commands Executed
- `git --no-pager status --short`
- `git --no-pager log --oneline -n 20`
- `git --no-pager diff --unified=3 --no-color ae7770d..2a79b9f`
- `git --no-pager diff --name-only ae7770d..2a79b9f`
- `pnpm vitest run test/unit/positional-graph/features/040-graph-inspect/`
- `just fft`

## H) Decision & Next Steps
- Approval owner: reviewer after Phase 3 fix pass.
- Required: apply `fix-tasks.phase-3-cli-command-registration-integration-tests.md` and rerun `/plan-6` then `/plan-7`.
- Blocking gates: resolve all HIGH/CRITICAL findings, then clean quality gate run.

## I) Footnotes Audit
| Diff-touched Path | Footnote Tag(s) in Phase Doc | Plan Ledger Node-ID |
|---|---|---|
| apps/cli/package.json | none | unresolved placeholder |
| apps/cli/src/commands/positional-graph.command.ts | none | unresolved placeholder |
| packages/positional-graph/src/index.ts | none | unresolved placeholder |
| test/integration/positional-graph/features/040-graph-inspect/inspect-cli.test.ts | none | unresolved placeholder |
| pnpm-lock.yaml | none | unresolved placeholder |
| phase-3/tasks.md | none | unresolved placeholder |
| phase-3/execution.log.md | none | unresolved placeholder |
