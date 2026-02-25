# Phase Review — phase-2-deep-linking-url-state

## A) Verdict
**REQUEST_CHANGES**

## B) Summary
- Mode detected: **Full** (`file-browser-spec.md` line 3).
- Testing approach from plan/spec: **Full TDD**, mock policy **No mocks / fakes only**.
- Functional implementation for Phase 2 is largely present and tests pass.
- Cross-phase regression checks passed (targeted prior-phase tests + `just fft`).
- Graph integrity is **BROKEN** due to plan↔dossier and footnote authority drift.
- One functional edge-case bug found in `workspaceHref()` null handling.
- Scope drift detected (`docs/domains/*`) not listed in phase task paths.

## C) Checklist
**Testing Approach: Full TDD**

- [x] Tests precede code (RED/GREEN evidence in `execution.log.md`)
- [x] Tests as docs (behavioral test names + file-level AC annotations)
- [x] Mock usage matches spec (no mocks used)
- [x] Negative/edge cases covered (encoding/defaults/invalid mode)
- [ ] BridgeContext patterns followed (N/A to this phase’s runtime, but doctrine metadata gates failed)
- [ ] Only in-scope files changed
- [x] Linters/type checks are clean (`just fft` exit 0)
- [x] Absolute paths used (no hidden CWD assumptions in this phase’s code)

## D) Findings Table
| ID | Severity | File:Lines | Summary | Recommendation |
|----|----------|------------|---------|----------------|
| V1 | CRITICAL | `docs/plans/041-file-browser/file-browser-plan.md:286-299` vs `.../phase-2.../tasks.md:182-190` | Plan phase table still `[ ]` while dossier is `[x]` complete | Sync plan task table + AC checkboxes/log links via `plan-6a-update-progress` |
| V2 | CRITICAL | `.../phase-2.../tasks.md:353-360` | Phase Footnote Stubs table is empty | Populate phase footnote stubs and attach footnotes to completed tasks |
| V3 | HIGH | `file-browser-plan.md:566-579` | Change Footnotes Ledger has only Phase 1 entries; phase-2 diff files have no ledger entries | Add Phase 2 footnotes (sequential, unique) for each changed file/node |
| V4 | HIGH | `.../phase-2.../tasks.md:182-190`, `execution.log.md:12-188` | Task notes lack `log#anchor`; execution entries lack explicit Plan/Dossier backlink metadata | Add bidirectional task↔log links and metadata fields |
| V5 | HIGH | Diff file list (`docs/domains/_platform/workspace-url/domain.md`, `docs/domains/registry.md`) | Out-of-scope files changed without justification in phase alignment brief/execution log | Add explicit scope justification task or revert/move docs changes to dedicated task |
| V6 | MEDIUM | `apps/web/src/lib/workspace-url.ts:31-33` | `worktree: null` currently serializes to `worktree=null` instead of being omitted | Add null guard in worktree branch and test it first |
| V7 | MEDIUM | `test/unit/web/lib/params/workspace-params.test.ts:27-31` | “ignore non-string” test only asserts type, not default fallback behavior | Strengthen assertion to expected default result |

## E) Detailed Findings

### E.0 Cross-Phase Regression Analysis
- Prior phase identified: **Phase 1: Data Model & Infrastructure**.
- Re-run commands:
  - `pnpm vitest run test/unit/workflow/workspace-entity.test.ts test/contracts/workspace-registry-adapter.contract.ts test/unit/workflow/workspace-service.test.ts test/unit/web/lib/workspace-url.test.ts test/unit/web/lib/params/workspace-params.test.ts test/unit/web/features/041-file-browser/params.test.ts`
  - `just fft`
- Result: **PASS**.
  - Targeted suite: 5 files / 80 tests passed.
  - Full suite: 289 files (280 passed, 9 skipped), 4135 tests (4064 passed, 71 skipped).
- Tests failed: 0
- Contracts broken: 0
- Backward compatibility regressions observed: none.

### E.1 Doctrine & Testing Compliance

#### Graph integrity (Step 3a)
- **Verdict: ❌ BROKEN**
- Broken link types:
  - Plan↔Dossier: task statuses and structure diverged.
  - Task↔Footnote: no task-level footnote references.
  - Footnote↔File: no Phase 2 ledger entries in plan authority.
  - Task↔Log: missing notes-column log anchors and missing explicit backlink metadata in log entries.

#### Authority conflicts (Step 3c)
- Plan authority source: `file-browser-plan.md` § Change Footnotes Ledger.
- Conflict: dossier has no usable Phase 2 footnote stubs while plan has no Phase 2 entries.
- Resolution rule: Plan is canonical; dossier must be synchronized from plan.

#### Testing approach gates
- TDD order evidence exists (RED then GREEN sections for T002/T003, T004/T005/T006).
- Mock policy compliance: no mock framework usage found in changed tests.
- Coverage adequacy: partial gap for AC-19 (adapter wiring lacks direct test assertion).

### E.2 Semantic Analysis
- `workspaceHref()` null omission behavior is inconsistent with function contract/comments and general option filtering.
- `workspaceParams` non-string-array handling is weakly validated by tests (assertion insufficient to prove “ignored”).

### E.3 Quality & Safety Analysis
**Safety Score: 80/100** (CRITICAL: 0, HIGH: 0, MEDIUM: 2, LOW: 0)  
**Reviewer verdict (code safety only): APPROVE with fixes**

- **[MEDIUM]** `apps/web/src/lib/workspace-url.ts:31-33`
  - Issue: `null` worktree can leak as literal `worktree=null`.
  - Fix:
```diff
- if (options.worktree !== undefined && options.worktree !== '' && options.worktree !== false) {
+ if (options.worktree !== undefined && options.worktree !== null && options.worktree !== '' && options.worktree !== false) {
```
- **[MEDIUM]** `test/unit/web/lib/params/workspace-params.test.ts:27-31`
  - Issue: weak assertion for “ignore non-string”.
  - Fix:
```diff
- expect(typeof result.worktree).toBe('string');
+ expect(result.worktree).toBe('');
```

### E.4 Doctrine Evolution Recommendations (Advisory)
- No new ADR required from this phase’s code.
- Add a project-rules note: “Phase completion requires synchronized plan table + dossier + footnote ledger updates before review.”
- Positive alignment: PlanPak split (`lib/params` cross-cutting vs feature params) was followed in implementation code.

## F) Coverage Map
| Acceptance Criterion | Evidence | Mapping Confidence |
|---|---|---|
| AC-16 URL-encoded type-safe params | `workspace.params.ts`, `file-browser.params.ts`, related tests | 75% (behavioral match, no per-test AC ID naming) |
| AC-17 bookmark/restore state | cache parsing tests + parameter defaults/parse behavior | 75% |
| AC-18 `workspaceHref()` correctness | `workspace-url.test.ts` (13 tests), `workspace-url.ts` | 100% (explicit AC-18 mention in test header + direct assertions) |
| AC-19 NuqsAdapter wired app-wide | `providers.tsx` diff + execution log manual verification | 50% (inferred/manual evidence; no direct automated assertion) |

**Overall coverage confidence**: **75%** (MEDIUM).  
Narrative/weak mapping: AC-19 relies on manual evidence.

## G) Commands Executed
```bash
git --no-pager diff --name-only 819ae36..71d9e38
git --no-pager diff --unified=3 --no-color 819ae36..71d9e38 > /tmp/phase2.diff
pnpm --silent vitest run test/unit/workflow/workspace-entity.test.ts test/contracts/workspace-registry-adapter.contract.ts test/unit/workflow/workspace-service.test.ts test/unit/web/lib/workspace-url.test.ts test/unit/web/lib/params/workspace-params.test.ts test/unit/web/features/041-file-browser/params.test.ts
just fft
```

## H) Decision & Next Steps
- **Decision**: REQUEST_CHANGES (blocking due to graph integrity + scope-control violations).
- Required before approval:
  1. Run `plan-6a-update-progress` to sync Phase 2 plan table, log links, and statuses.
  2. Populate Phase 2 footnotes in plan ledger and dossier stubs; add task-level `[^N]` references.
  3. Resolve out-of-scope domain-doc edits by explicit justification task (or move to separate doc task/phase).
  4. Apply two MEDIUM code/test fixes (V6, V7) test-first.

## I) Footnotes Audit
| Diff-touched path | Footnote tag(s) in phase dossier | Node-ID link in plan ledger |
|---|---|---|
| `apps/web/package.json` | Missing | Missing |
| `apps/web/src/components/providers.tsx` | Missing | Missing |
| `apps/web/src/components/workspaces/workspace-nav.tsx` | Missing | Missing |
| `apps/web/src/features/041-file-browser/index.ts` | Missing | Missing |
| `apps/web/src/features/041-file-browser/params/file-browser.params.ts` | Missing | Missing |
| `apps/web/src/features/041-file-browser/params/index.ts` | Missing | Missing |
| `apps/web/src/lib/params/index.ts` | Missing | Missing |
| `apps/web/src/lib/params/workspace.params.ts` | Missing | Missing |
| `apps/web/src/lib/workspace-url.ts` | Missing | Missing |
| `test/unit/web/features/041-file-browser/params.test.ts` | Missing | Missing |
| `test/unit/web/lib/params/workspace-params.test.ts` | Missing | Missing |
| `test/unit/web/lib/workspace-url.test.ts` | Missing | Missing |
| `pnpm-lock.yaml` | Missing | Missing |
| `docs/domains/_platform/workspace-url/domain.md` | Missing | Missing |
| `docs/domains/registry.md` | Missing | Missing |
