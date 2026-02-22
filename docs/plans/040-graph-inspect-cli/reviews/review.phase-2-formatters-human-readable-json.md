# Phase Review — Phase 2: Formatters (Human-Readable + JSON)

## A) Verdict
**REQUEST_CHANGES**

## B) Summary
- Workflow mode: **Full** (phase dossier + phase execution log present).
- Canonical diff range: `e38f7ce..2210ccc` (saved at `reviews/phase-2.diff`).
- Testing approach from plan: **Full TDD**; mock usage policy: **Avoid mocks**.
- Scope: only phase files changed (plus expected dossier/log updates).
- Major blockers: graph-link integrity metadata missing, plan↔dossier sync drift, and several acceptance-criteria mismatches in formatter behavior/tests.
- Cross-phase regression guard found a contract break in compact header progress rendering.

## C) Checklist
**Testing Approach: Full TDD**
- [ ] Tests precede code (RED-GREEN-REFACTOR evidence)
- [ ] Tests as docs (assertions show behavior)
- [x] Mock usage matches spec: Avoid
- [ ] Negative/edge cases covered

Universal:
- [x] BridgeContext patterns followed (not VS Code extension code)
- [x] Only in-scope files changed
- [x] Linters/type checks are clean (`just fft` passed; warnings noted)
- [x] Absolute paths used in dossiers/tasks

## D) Findings Table
| ID | Severity | File:Lines | Summary | Recommendation |
|----|----------|------------|---------|----------------|
| V1 | CRITICAL | tasks.md (Phase 2 table) | Completed tasks T001-T008 missing `log#anchor` links in Notes | Add per-task execution anchors and backlinks via `plan-6a` |
| V2 | HIGH | execution.log.md | Log entries missing explicit `Dossier Task` and `Plan Task` backlink metadata | Add metadata block to each execution-log entry |
| V3 | HIGH | plan.md + tasks.md | Plan↔Dossier status/log/notes are unsynchronized | Sync with `plan-6a --sync` |
| V4 | HIGH | inspect.format.ts:270 | Compact header shows `total/total` instead of `completed/total` | Use `result.completedNodes/result.totalNodes` |
| V5 | HIGH | inspect.format.ts:160-229 | `formatInspectNode()` omits required raw `node.yaml` section | Add raw node.yaml rendering + tests |
| V6 | HIGH | inspect.format.ts:120-141;401-440(test) | Running/pending rendering contract incomplete (`Running:` / `Waiting:` reason) | Implement required text and strengthen tests |
| V7 | MEDIUM | inspect.format.ts:10,59-85 | `isFileOutput()` imported but not used for detection; `(missing)` fallback not covered | Detect via helper and add missing-file case tests |
| V8 | MEDIUM | inspect-format.test.ts | Per-test Test Doc 5-field coverage is incomplete/ambiguous under R-TEST-002 | Add full per-test doc blocks or clarify policy |
| V9 | MEDIUM | inspect.format.ts:201-205 | `--node` file extract prints all lines (unbounded) | Bound extract lines in deep-dive output |

## E) Detailed Findings

### E.0 Cross-Phase Regression Analysis
- Prior phase checked: **Phase 1**.
- Tests rerun: **1**
- Tests failed: **0**
- Contracts broken: **1**

| ID | Severity | Prior Phase | Issue | Evidence | Fix |
|----|----------|-------------|-------|----------|-----|
| REG-001 | HIGH | Phase 1 | Compact formatter progress contract broken (`total/total`) | `inspect.format.ts` compact header | Switch numerator to `completedNodes`; add regression test |

Verdict: **FAIL** (regression guard)

### E.1 Doctrine & Testing Compliance

#### Graph Integrity (3a)
| ID | Severity | Link Type | Issue | Expected | Fix | Impact |
|----|----------|-----------|-------|----------|-----|--------|
| G1 | CRITICAL | Task↔Log | T001-T008 have no log anchors in Notes | `execution.log.md#...` per completed task | Add anchors via `plan-6a` | Breaks dossier→evidence traversal |
| G2 | HIGH | Task↔Log | execution entries lack dossier/plan backlink metadata | `Dossier Task` + `Plan Task` in each entry | Add backlinks per entry | Breaks reverse traversal |
| G3 | HIGH | Plan↔Dossier | Plan phase table/checklists/log links out of sync with dossier completed tasks | Synced statuses, `[📋]` links, footnotes | Run sync update (`plan-6a`) | Progress tracking unreliable |

Graph integrity score: **❌ BROKEN**

#### Authority Conflicts (3c)
| ID | Severity | Conflict | Issue | Resolution |
|----|----------|----------|-------|------------|
| AUTH-001 | HIGH | missing_in_dossier | Plan ledger has `[^1]`, `[^2]`; dossier stubs not populated | Plan is authority; sync stubs from plan |
| AUTH-002 | HIGH | task_footnote_missing | Modified tasks have no `[^N]` in Notes | Add task footnote references and sync ledger |

#### Doctrine validators (4)
- **TDD validator**: FAIL (behavior-level RED evidence weak, incomplete T006 assertions, missing explicit REFACTOR record).
- **Mock validator**: PASS (0 mock instances).
- **Universal validator**: FAIL (R-TEST-002 granularity issue; acceptance drift on node.yaml/running/waiting).
- **Plan compliance validator**: FAIL (T002/T005/T006/T007 non-compliant).

#### Testing evidence + coverage (5)
- Evidence artifact existence: ✅ `tasks/phase-2-formatters-human-readable-json/execution.log.md` present.
- RED/GREEN evidence present but mostly module-missing RED, not behavior-level RED.
- Critical behavior coverage gaps remain for required strings/sections (node.yaml, waiting reason, missing-file fallback).

### E.2 Semantic Analysis
| ID | Severity | Issue | Spec requirement |
|----|----------|-------|------------------|
| SEM-001 | HIGH | `--node` output lacks raw node.yaml section | Phase 2 deliverable for `formatInspectNode()` |
| SEM-002 | HIGH | In-progress semantics drift (`Running:`/`Waiting:` not implemented) | T006 validation in phase dossier |
| SEM-003 | HIGH | Missing-file fallback behavior not implemented | T005 validation requires `(missing)` fallback |
| SEM-004 | MEDIUM | File-output detection based on metadata only, not helper/path signal | Finding #03 + T005 validation intent |

### E.3 Quality & Safety Analysis
**Safety Score: -20/100** (CRITICAL: 0, HIGH: 3, MEDIUM: 3, LOW: 0)  
**Verdict: REQUEST_CHANGES**

- Correctness:
  - HIGH: compact progress header incorrect (`total/total`).
- Security:
  - No direct vulnerabilities found in changed formatter/test code.
- Performance:
  - MEDIUM: unbounded deep-dive extract rendering can scale poorly on very large extracts.
- Observability:
  - No blocking observability issues for pure formatter layer.

### E.4 Doctrine Evolution Recommendations (Advisory)
- Candidate rule updates:
  1. Clarify R-TEST-002 scope (per-test vs file-level Test Doc).
  2. Require explicit AC→test mapping when task criteria are textual/format contracts.
- Candidate idioms:
  1. Standard formatter contract idiom (deterministic ordering + truncation policy + glyph conventions).
  2. Standard file-output rendering idiom (`→ filename (size)`, binary marker, missing fallback).
- Candidate ADR note:
  - ADR-0012 add implementation note: inspect formatter output remains Consumer-domain only.

## F) Coverage Map (AC ↔ tests)
| AC | Expected | Evidence | Confidence |
|----|----------|----------|------------|
| AC-1 | Header + node sections | `formatInspect (T001)` tests | 75% |
| AC-2 | 60-char truncation | T001 truncation assertion | 75% |
| AC-3 | file outputs (`→`, size, extract, missing) | Arrow/size tested; extract/missing incomplete | 50% |
| AC-4 | `--node` full values + events + raw node.yaml | values/events tested; raw node.yaml missing | 50% |
| AC-5 | `--outputs` mode 40-char truncation | T003 assertions | 75% |
| AC-6 | compact one line/node | T004 assertions | 75% |
| AC-8 | running + waiting reason | weak tests + missing behavior | 25% |
| AC-9 | failed node error display | T006 error assertion | 75% |

Overall coverage confidence: **62.5% (MEDIUM)**.  
Narrative/weakly-mapped tests: running/pending state assertions are too generic.

## G) Commands Executed
- `git --no-pager status --short`
- `git --no-pager log --oneline --decorate -n 12`
- `git --no-pager log --oneline --decorate -- <phase2 files>`
- `git --no-pager diff --name-only --no-renames e38f7ce..2210ccc`
- `git --no-pager diff --unified=3 --no-color e38f7ce..2210ccc > reviews/phase-2.diff`
- `pnpm --silent vitest run test/unit/positional-graph/features/040-graph-inspect/ && just fft`

## H) Decision & Next Steps
- Decision owner: plan reviewer/maintainer.
- Required before approval:
  1. Sync graph links/footnotes/plan↔dossier metadata.
  2. Fix formatter behavior gaps (compact progress, node.yaml deep dive, running/waiting semantics, missing-file fallback).
  3. Tighten tests to assert required behavior explicitly (test-first updates).
- After fixes: rerun `/plan-6` for fix phase, then rerun `/plan-7-code-review`.

## I) Footnotes Audit
| Diff-touched path | Footnote tag(s) in Phase Doc | Plan ledger node-ID links |
|-------------------|------------------------------|---------------------------|
| `packages/positional-graph/src/features/040-graph-inspect/inspect.format.ts` | None | None (ledger placeholders only) |
| `packages/positional-graph/src/features/040-graph-inspect/index.ts` | None | None |
| `test/unit/positional-graph/features/040-graph-inspect/inspect-format.test.ts` | None | None |
| `docs/plans/040-graph-inspect-cli/tasks/phase-2-formatters-human-readable-json/tasks.md` | None | None |
| `docs/plans/040-graph-inspect-cli/tasks/phase-2-formatters-human-readable-json/execution.log.md` | None | None |
