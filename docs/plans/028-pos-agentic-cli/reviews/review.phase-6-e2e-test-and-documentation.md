# Phase 6: E2E Test and Documentation — Code Review

**Phase**: Phase 6: E2E Test and Documentation  
**Plan**: [../pos-agentic-cli-plan.md](../pos-agentic-cli-plan.md)  
**Dossier**: [../tasks/phase-6-e2e-test-and-documentation/tasks.md](../tasks/phase-6-e2e-test-and-documentation/tasks.md)  
**Reviewed**: 2026-02-04  
**Reviewer**: plan-7-code-review

---

## A) Verdict

**REQUEST_CHANGES**

Blocking issues: graph integrity links (Task↔Log, Task↔Footnote, Plan↔Dossier), rules violation for test filename, plan/implementation mismatch (3-node vs 7-node), and E2E flow using data output where file output is defined.

---

## B) Summary

Phase 6 implements a comprehensive 7-node E2E workflow and new docs/help text, but the dossier/plan linkage is broken, the plan still states a 3-node flow, and the E2E script does not exercise file output semantics for `code`. There are also scope/manifest gaps for unit YAML changes and missing footnote stubs. Tests: `just check` fails due to vitest/tsconfig parsing in `.next/standalone`, while the execution log shows E2E and full test suite passing.

---

## C) Checklist

**Testing Approach: Full TDD (from plan)**

- [ ] Tests precede code (RED-GREEN-REFACTOR evidence) — no RED/GREEN evidence in Phase 6 log for E2E script
- [ ] Tests as docs (assertions show behavior) — E2E script lacks Test Doc blocks per R-TEST-002
- [x] Mock usage matches spec: **Avoid mocks** (no mocks introduced)
- [ ] Negative/edge cases covered — E2E covers error codes, but not documented as TDD tests

**Universal:**
- [ ] BridgeContext patterns followed (N/A)
- [ ] Only in-scope files changed (unit YAML + review/workshop docs out of scope)
- [ ] Linters/type checks are clean (`just check` failed in vitest due to tsconfig parse)
- [x] Absolute paths used (temp workspace is explicitly resolved)

---

## D) Findings Table

| ID | Severity | File:Lines | Summary | Recommendation |
|----|----------|------------|---------|----------------|
| V1 | CRITICAL | tasks.md / execution.log.md | Task↔Footnote links missing (no footnote tags or stubs) | Run `plan-6a --sync-footnotes` and add [^7]-[^9] tags to task Notes + populate Phase Footnote Stubs |
| V2 | HIGH | tasks.md / execution.log.md | Task↔Log links missing and log entries lack Plan/Dossier backlinks | Add log anchors to Notes column; update execution.log entries with Dossier Task + Plan Task metadata |
| V3 | HIGH | plan.md / execution.log.md | Plan↔Dossier log anchors mismatch (plan links #T001-#T012 not present) | Align execution.log headings to anchors or update plan log links |
| V4 | HIGH | plan.md / test/e2e/positional-graph-execution-e2e.ts | Plan still specifies 3-node E2E while implementation is 7-node | Update plan Phase 6 summary/metrics to 3-line, 7-node, or reduce script scope |
| V5 | HIGH | test/e2e/positional-graph-execution-e2e.ts | Test filename violates R-CODE-003 (`.test.ts` suffix required) | Rename to `positional-graph-execution-e2e.test.ts` and update references |
| V6 | HIGH | test/e2e/positional-graph-execution-e2e.ts | `code` output declared as file but saved as data | Use `save-output-file` for code and `get-input-file` downstream; update docs/examples |
| V7 | MEDIUM | plan.md / tasks.md | File Placement Manifest missing unit YAML + test-helpers changes | Add entries for unit YAML + test-helpers or revert changes |
| V8 | MEDIUM | docs/plans/.../workshops/e2e-workunits.md | Workshop doc edits not in phase scope | Add to phase scope or revert/move to owning phase |
| V9 | MEDIUM | docs/how/.../2-cli-reference.md | get-input-data response shape inconsistent with service | Update examples to use `sources[]` (and `complete`) structure |
| V10 | MEDIUM | apps/cli/src/commands/positional-graph.command.ts | `start` help text promises readiness/E170 not enforced | Adjust description to require `status --node` check |
| V11 | LOW | apps/cli/src/commands/positional-graph.command.ts | Status handlers force `errors: []` (lossy) | Preserve error metadata when available |
| V12 | LOW | docs/how/... diagrams | `pr_summary` referenced but not defined | Replace with `pr_title`/`pr_body` |

---

## E) Detailed Findings

### E.0) Cross-Phase Regression Analysis

**Tests rerun:** `just check` (biome + tsc + vitest)  
**Result:** ❌ FAIL (vitest tsconfig-paths error from `.next/standalone` paths)  
**Execution log evidence:** `npx tsx test/e2e/positional-graph-execution-e2e.ts` and `pnpm test` passed per `execution.log.md`.

**Contracts/Integration:** No breaking interface changes detected; modifications are additive (help text + E2E script + docs + unit YAML naming).

---

### E.1) Doctrine & Testing Compliance

#### Graph Integrity (Step 3a)

**Graph Integrity Verdict:** ❌ BROKEN

| ID | Severity | Link Type | Issue | Expected | Fix | Impact |
|----|----------|-----------|-------|----------|-----|--------|
| L1 | CRITICAL | Task↔Footnote | Tasks lack [^7]-[^9] tags and Phase Footnote Stubs are empty | Task Notes include footnote tags + stubs match ledger | Run `plan-6a --sync-footnotes`; add [^7]-[^9] in Notes | Breaks File→Task traversal |
| L2 | HIGH | Task↔Log | Notes column lacks `execution.log.md#...` anchors | Each completed task links to its log entry | Add anchors to Notes; align log headings | Cannot navigate evidence |
| L3 | HIGH | Plan↔Dossier | Plan Log links #T001-#T012 don’t exist in log (T003-6 combined) | Matching anchors per task | Split log headings or update plan links | Progress tracking unreliable |
| L4 | HIGH | Footnote↔File | Plan ledger uses `file:` entries without `:symbol` | Use `(file):path:symbol` format | Fix ledger entries | Broken provenance link |

#### Authority Conflicts (Step 3c)

Plan ledger is authoritative; dossier stubs are empty. **Resolution:** run `plan-6a --sync-footnotes` and update task Notes with [^7]-[^9].

#### Mock Usage

Policy **Avoid mocks** — ✅ PASS (no mock frameworks used).

#### Plan/Rules Compliance

- **R-CODE-003 violation:** `test/e2e/positional-graph-execution-e2e.ts` lacks `.test.ts` suffix. (HIGH)
- **Plan scope mismatch:** Phase 6 plan still states 3-node E2E while implementation is 7-node. (HIGH)
- **Manifest gaps:** unit YAML + test-helpers changes not listed in manifest. (MEDIUM)

---

### E.2) Semantic Analysis

**Finding:** `code` is defined as **file** output/input but E2E script uses `save-output-data`/`get-input-data` only.  
**Impact:** File output semantics are untested; future type enforcement could break E2E; doc examples drift.  
**Fix:** Use `save-output-file` for `code` and `get-input-file` for downstream nodes; update docs and flow.

---

### E.3) Quality & Safety Analysis

**Safety Score: 90/100** (CRITICAL: 0, HIGH: 1, MEDIUM: 0, LOW: 2)

#### test/e2e/positional-graph-execution-e2e.ts
- **[HIGH]** Code output treated as data (see E.2) — update to file I/O path.

#### apps/cli/src/commands/positional-graph.command.ts
- **[LOW]** Status handler wraps `errors: []` and may hide failure metadata; preserve error details.

#### test/e2e/positional-graph-execution-e2e.ts
- **[LOW]** CLI runner discards stdout/stderr on success; add failure-only debug output.

---

### E.4) Doctrine Evolution Recommendations (Advisory)

- **New Rule Candidate:** Require `JsonOutputAdapter` inputs to include `errors: []` (BaseResult contract).  
- **New Idioms:** (1) E2E execution fixtures in test-helpers with dedicated loader, (2) CLI E2E script structure with `runCli` + temp workspace isolation.  
- **Architecture Update:** Add execution lifecycle subsection in `docs/project-rules/architecture.md` linking to execution overview.

---

## F) Coverage Map (AC-14/AC-15)

**Approach (plan):** Full TDD  
**Observed (phase):** Lightweight E2E validation

| Acceptance Criterion | Evidence | Confidence | Status |
|---------------------|----------|------------|--------|
| AC-14: 3-line, 7-node E2E via CLI | `test/e2e/positional-graph-execution-e2e.ts` (53 steps), `execution.log.md` | 75% (behavioral match, no AC IDs) | ✅ |
| AC-15: JSON output valid | E2E script uses `--json` for all CLI calls; `execution.log.md` states pass | 75% | ✅ |

**Overall Coverage Confidence:** 75% (behavioral, not explicit IDs).  
**Recommendation:** Add AC identifiers in E2E section logs or comments.

---

## G) Commands Executed

```bash
# Diff (including untracked)
git diff --no-color --unified=3

# Quality gate
just check
```

**Note:** `just check` failed during vitest due to `.next/standalone` tsconfig resolution; unrelated to Phase 6 changes.

---

## H) Decision & Next Steps

**Decision:** REQUEST_CHANGES

**Fix order (high→low):**
1. Resolve plan/dossier/log/footnote linkage and ledger format (graph integrity).
2. Align Phase 6 scope (3-node vs 7-node) and rename E2E file to `.test.ts`.
3. Update E2E script to use file output semantics for `code` and align docs.
4. Address manifest scope gaps (unit YAML, test-helpers, workshop/review docs).

---

## I) Footnotes Audit

| Diff-Touched Path | Footnote Tag (tasks.md) | Node-ID (Plan Ledger) |
|------------------|--------------------------|------------------------|
| test/e2e/positional-graph-execution-e2e.ts | — | [^7] `file:test/e2e/positional-graph-execution-e2e.ts` |
| test/unit/positional-graph/test-helpers.ts | — | [^7] `file:test/unit/positional-graph/test-helpers.ts` |
| .chainglass/data/units/sample-coder/unit.yaml | — | [^7] `file:.chainglass/data/units/sample-coder/unit.yaml` |
| .chainglass/data/units/sample-tester/unit.yaml | — | [^7] `file:.chainglass/data/units/sample-tester/unit.yaml` |
| docs/how/positional-graph-execution/1-overview.md | — | [^8] `file:docs/how/positional-graph-execution/1-overview.md` |
| docs/how/positional-graph-execution/2-cli-reference.md | — | [^8] `file:docs/how/positional-graph-execution/2-cli-reference.md` |
| docs/how/positional-graph-execution/3-e2e-flow.md | — | [^8] `file:docs/how/positional-graph-execution/3-e2e-flow.md` |
| apps/cli/src/commands/positional-graph.command.ts | — | [^9] `function:apps/cli/src/commands/positional-graph.command.ts:handleWfStatus` |

