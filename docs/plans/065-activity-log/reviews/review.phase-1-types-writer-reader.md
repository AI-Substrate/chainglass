# Code Review: Phase 1: Activity Log Domain — Types, Writer, Reader

**Plan**: /Users/jak/substrate/059-fix-agents-tmp/docs/plans/065-activity-log/activity-log-plan.md
**Spec**: /Users/jak/substrate/059-fix-agents-tmp/docs/plans/065-activity-log/activity-log-spec.md
**Phase**: Phase 1: Activity Log Domain — Types, Writer, Reader
**Date**: 2026-03-06
**Reviewer**: Automated (plan-7-v2)
**Testing Approach**: Hybrid

## A) Verdict

**REQUEST_CHANGES**

Phase 1 establishes the new domain cleanly, but `readActivityLog()` still diverges from AC-11 and the phase artifacts/evidence are not complete enough to sign off the contract as implemented.

**Key failure areas**:
- **Implementation**: `readActivityLog()` and its tests lock in oldest-first ordering even though AC-11 says the reader should return most recent first; `since` filtering also relies on unsafe lexical timestamp comparison.
- **Domain compliance**: `activity-log` documentation currently reverses the planned `terminal -> activity-log` dependency and leaves required composition / health-summary details incomplete.
- **Testing**: The expected `execution.log.md` is missing, so RED->GREEN evidence and task-level verification had to be reconstructed during review.
- **Doctrine**: The new tests omit required Test Doc blocks and currently fail `just lint` / `pnpm exec biome check`.

## B) Summary

Phase 1 adds the activity-log writer, reader, ignore list, domain registration, and targeted tests with solid baseline coverage; the reviewer re-ran the four changed Vitest suites successfully (30 tests passed) and `just typecheck` also passed. The main blocking issue is contract drift: `/Users/jak/substrate/059-fix-agents-tmp/apps/web/src/features/065-activity-log/lib/activity-log-reader.ts` and its tests return oldest-first results, while AC-11 in the spec still promises most-recent-first results and explicit default-200 behavior. Domain registration is mostly present, but `/Users/jak/substrate/059-fix-agents-tmp/docs/domains/activity-log/domain.md` and `/Users/jak/substrate/059-fix-agents-tmp/docs/domains/domain-map.md` currently misstate the terminal relationship and omit required supporting documentation details. Anti-reinvention came back clean: there is no existing activity-log domain or reusable contract being duplicated here, only pattern-level prior art for malformed-line parsing and regex ignore lists. Evidence quality remains below bar because `/Users/jak/substrate/059-fix-agents-tmp/docs/plans/065-activity-log/tasks/phase-1-types-writer-reader/execution.log.md` is missing and the new tests have not been brought to the repository's documentation/lint standard.

## C) Checklist

**Testing Approach: Hybrid**

For Hybrid:
- [ ] TDD tasks have RED->GREEN evidence recorded in `/Users/jak/substrate/059-fix-agents-tmp/docs/plans/065-activity-log/tasks/phase-1-types-writer-reader/execution.log.md`
- [x] Core validation tests exist (`pnpm exec vitest run ...` passed 30 tests during review)
- [ ] Non-test verification evidence is recorded for docs / gitignore work (the review reconstructed this instead)

Universal (all approaches):
- [x] Only in-scope files changed
- [ ] Linters/type checks clean (typecheck passed; `just lint` fails on the new test files)
- [ ] Domain compliance checks pass

## D) Findings Table

| ID | Severity | File:Lines | Category | Summary | Recommendation |
|----|----------|------------|----------|---------|----------------|
| F001 | HIGH | `/Users/jak/substrate/059-fix-agents-tmp/apps/web/src/features/065-activity-log/lib/activity-log-reader.ts:56-61`; `/Users/jak/substrate/059-fix-agents-tmp/test/unit/web/features/065-activity-log/activity-log-reader.test.ts:72-83`; `/Users/jak/substrate/059-fix-agents-tmp/test/contracts/activity-log.contract.test.ts:68-81` | correctness | `readActivityLog()` returns oldest-first and the tests lock that in, but AC-11 still says the reader should return the most recent entries first and prove the default 200-entry behavior. | Pick one public contract, align spec/plan/tasks/code/tests, and add an explicit default-200 ordering test. |
| F002 | MEDIUM | `/Users/jak/substrate/059-fix-agents-tmp/docs/plans/065-activity-log/tasks/phase-1-types-writer-reader/execution.log.md` | testing | The phase execution log is missing, so there is no recorded RED->GREEN or command-output evidence for T002-T007. | Create the execution log with actual failing/passing commands, observed outputs, and verification steps. |
| F003 | MEDIUM | `/Users/jak/substrate/059-fix-agents-tmp/apps/web/src/features/065-activity-log/lib/activity-log-reader.ts:47-49` | correctness | `since` filtering compares timestamps as raw strings, which misorders valid ISO-8601 values that include offsets. | Parse timestamps to epoch values (for both `entry.timestamp` and `options.since`) and skip invalid values explicitly. |
| F004 | MEDIUM | `/Users/jak/substrate/059-fix-agents-tmp/apps/web/src/features/065-activity-log/lib/ignore-patterns.ts:14-25` | correctness | Bare hostnames such as `ubuntu` are still treated as valid activity labels, so the promised cross-OS noise filtering is incomplete. | Add host-name / short-host-name checks and prove them in unit tests. |
| F005 | MEDIUM | `/Users/jak/substrate/059-fix-agents-tmp/docs/domains/activity-log/domain.md:15-57`; `/Users/jak/substrate/059-fix-agents-tmp/docs/domains/domain-map.md:110-150` | domain-compliance | The activity-log docs reverse the planned `terminal -> activity-log` dependency and omit required composition / concepts / health-summary details. | Correct the consumer->provider relationship and complete the missing domain artifacts in the same patch. |
| F006 | MEDIUM | `/Users/jak/substrate/059-fix-agents-tmp/test/unit/web/features/065-activity-log/activity-log-writer.test.ts:1-120`; `/Users/jak/substrate/059-fix-agents-tmp/test/unit/web/features/065-activity-log/activity-log-reader.test.ts:1-146`; `/Users/jak/substrate/059-fix-agents-tmp/test/unit/web/features/065-activity-log/ignore-patterns.test.ts:1-44`; `/Users/jak/substrate/059-fix-agents-tmp/test/contracts/activity-log.contract.test.ts:1-114` | doctrine | The new tests omit required Test Doc blocks and the suite currently fails `just lint` / `pnpm exec biome check` for import-order / formatting issues. | Add Test Doc comments to each new test and apply Biome formatting / import-order fixes. |

## E) Detailed Findings

### E.1) Implementation Quality

- **F001 (HIGH)** — `/Users/jak/substrate/059-fix-agents-tmp/apps/web/src/features/065-activity-log/lib/activity-log-reader.ts:56-61` returns the limited slice in chronological order, and both `/Users/jak/substrate/059-fix-agents-tmp/test/unit/web/features/065-activity-log/activity-log-reader.test.ts:72-83` and `/Users/jak/substrate/059-fix-agents-tmp/test/contracts/activity-log.contract.test.ts:68-81` codify that oldest-first behavior. That matches the current plan/tasks text, but it does **not** match AC-11 in the spec, which still promises "most recent first" plus explicit default-200 behavior.
- **F003 (MEDIUM)** — `/Users/jak/substrate/059-fix-agents-tmp/apps/web/src/features/065-activity-log/lib/activity-log-reader.ts:47-49` filters `since` with `entry.timestamp <= options.since`. ISO-8601 strings only sort lexically when normalized to the same offset; offset-bearing values can be misclassified.
- **F004 (MEDIUM)** — `/Users/jak/substrate/059-fix-agents-tmp/apps/web/src/features/065-activity-log/lib/ignore-patterns.ts:14-25` exports a regex list for `.localdomain`, `.local`, empty strings, shells, and bare paths, but it never ignores bare hostnames. A reviewer spot-check (`shouldIgnorePaneTitle('ubuntu')`) returned `false`, so the non-macOS hostname case called out in Plan finding 07 is still uncovered.
- No security issues, secret exposure, or cross-domain import violations were found in the source files reviewed.

### E.2) Domain Compliance

| Check | Status | Details |
|-------|--------|---------|
| File placement | ✅ | New code lives under `apps/web/src/features/065-activity-log/` and `test/.../065-activity-log/`, matching the phase manifest. |
| Contract-only imports | ✅ | The new feature files only import Node built-ins and local activity-log modules; no foreign domain internals are imported. |
| Dependency direction | ❌ | `/Users/jak/substrate/059-fix-agents-tmp/docs/domains/activity-log/domain.md:37-44` and `/Users/jak/substrate/059-fix-agents-tmp/docs/domains/domain-map.md:110-112` show activity-log consuming terminal, but the planned Phase 2 integration is terminal consuming `appendActivityLogEntry()` / `shouldIgnorePaneTitle()`. |
| Domain.md updated | ❌ | `domain.md` has purpose/contracts/history, but it lacks a `## Composition` section and its `## Concepts` section is not in the required `Concept | Entry Point | What It Does` shape. |
| Registry current | ✅ | `/Users/jak/substrate/059-fix-agents-tmp/docs/domains/registry.md:23` adds the new `activity-log` row. |
| No orphan files | ✅ | Every changed file in the computed diff maps back to the phase manifest. |
| Map nodes current | ❌ | The Mermaid node exists, but `/Users/jak/substrate/059-fix-agents-tmp/docs/domains/domain-map.md:129-150` has no `activity-log` row in the Domain Health Summary. |
| Map edges current | ❌ | `/Users/jak/substrate/059-fix-agents-tmp/docs/domains/domain-map.md:110-112` uses implementation prose (`pane title source`) instead of a consumed contract and points in the wrong direction. |
| No circular business deps | ✅ | No new business-domain cycle is introduced by the current map. |
| Concepts documented | ⚠️ | A concepts section exists, but it is incomplete for review purposes until it names entry points and behaviors explicitly. |

**F005 (MEDIUM)** — Domain registration is close, but the final artifacts are not yet internally consistent. The terminal leaf-consumer status in `/Users/jak/substrate/059-fix-agents-tmp/docs/domains/terminal/domain.md:26-35` still contradicts the new `activity-log -> terminal` arrow, and the new domain doc needs composition / concepts detail before the architecture docs can be treated as current.

### E.3) Anti-Reinvention

No genuine duplication was found.

| New Component | Existing Match? | Domain | Status |
|--------------|----------------|--------|--------|
| `ActivityLogEntry` + `appendActivityLogEntry()` | None (pattern-only prior art in `packages/shared/src/adapters/events-jsonl-parser.ts`) | — | Proceed |
| `readActivityLog()` | None (pattern-only malformed-line skip prior art) | — | Proceed |
| `shouldIgnorePaneTitle()` | None (pattern-only ignore-list prior art in `packages/workflow/src/adapters/native-file-watcher.adapter.ts`) | — | Proceed |

### E.4) Testing & Evidence

**Coverage confidence**: 64%

Reviewer verification performed during review:
- `pnpm exec vitest run test/unit/web/features/065-activity-log/activity-log-writer.test.ts test/unit/web/features/065-activity-log/activity-log-reader.test.ts test/unit/web/features/065-activity-log/ignore-patterns.test.ts test/contracts/activity-log.contract.test.ts` -> **30 tests passed**
- `just typecheck` -> **passed**
- `just lint` / `pnpm exec biome check ...` -> **failed** on new test-file formatting / import-order issues
- `git check-ignore -v .chainglass/data/activity-log.jsonl` -> **matched existing `.chainglass/data/` ignore rule**

| AC | Confidence | Evidence |
|----|------------|----------|
| AC-03 | 45 | Ignore-pattern unit tests pass for `.localdomain`, `.local`, empty, shell, and bare-path cases, but reviewer spot-check shows bare hostnames still return `false`. |
| AC-04 | 90 | Writer and roundtrip tests cover duplicate skip, changed-label append, malformed-line tolerance, and interleaved IDs; reviewer rerun passed. |
| AC-05 | 75 | Roundtrip tests prove disk write/read behavior in temp dirs, but no restart-specific evidence is recorded in phase artifacts. |
| AC-10 | 60 | Types and tests show source-agnostic entries with `meta`, but the public contract still drifts between spec (`pane?`) and phase artifacts (`meta?`). |
| AC-11 | 20 | The code defines `DEFAULT_LIMIT = 200`, but there is no default-limit test and the returned order conflicts with the spec. |
| AC-12 | 75 | `TMUX_PANE_TITLE_IGNORE` is exported as a regex array and tested, but the cross-OS hostname case remains incomplete. |
| AC-14 | 85 | Reviewer verified the target path is ignored by git, though the new `**/activity-log.jsonl` rule is redundant with the existing `.chainglass/data/` rule. |

**F002 (MEDIUM)** — The missing `/Users/jak/substrate/059-fix-agents-tmp/docs/plans/065-activity-log/tasks/phase-1-types-writer-reader/execution.log.md` means the phase still lacks the plan-6 audit trail (RED->GREEN commands, observed outputs, and explicit verification steps) that should accompany this work.

### E.5) Doctrine Compliance

The documented P2 interface-first deviation in `/Users/jak/substrate/059-fix-agents-tmp/docs/plans/065-activity-log/activity-log-plan.md:167-172` was taken into account and is **not** counted as a failure in this review.

**F006 (MEDIUM)** — The new tests do not follow the repository's mandatory test-as-documentation format from `/Users/jak/substrate/059-fix-agents-tmp/docs/project-rules/constitution.md:133-168` and `/Users/jak/substrate/059-fix-agents-tmp/docs/project-rules/rules.md:100-157`: every new `it(...)` block is missing the five-field Test Doc comment, and Biome currently reports import-order / formatting failures in the same files.

## F) Coverage Map

Phase 1 only covers the persistence/domain-registration slice of the feature, so the map below includes the acceptance criteria relevant to this phase.

| AC | Description | Evidence | Confidence |
|----|-------------|----------|------------|
| AC-03 | Default/hostname pane titles are filtered before persistence | `ignore-patterns.test.ts` passes for `.localdomain`, `.local`, empty, shell, and path cases; reviewer spot-check still shows bare hostname gap | 45 |
| AC-04 | Consecutive identical labels for the same id are deduplicated | Writer + roundtrip tests passed during review and cover duplicate/no-duplicate branches | 90 |
| AC-05 | Entries persist on disk and remain readable | Writer + roundtrip tests persist and reload JSONL from temp dirs; no restart artifact recorded | 75 |
| AC-10 | Writer remains general-purpose across sources | `ActivityLogEntry` / tests show multiple sources + `meta`, but spec/phase contract wording is still inconsistent | 60 |
| AC-11 | Reader returns last 200 most-recent-first entries by default | `DEFAULT_LIMIT = 200` exists, but default-limit behavior is untested and ordering currently contradicts the spec | 20 |
| AC-12 | Ignore list is configurable via exported regex array | `TMUX_PANE_TITLE_IGNORE` is exported and exercised in unit tests | 75 |
| AC-14 | `activity-log.jsonl` is gitignored | Reviewer verified `git check-ignore -v .chainglass/data/activity-log.jsonl`; existing root ignore already covers the file | 85 |

**Overall coverage confidence**: 64%

## G) Commands Executed

```bash
git --no-pager diff --stat
git --no-pager diff --staged --stat
git --no-pager status --short
git --no-pager log --oneline -10
python <<'PY'  # generated /Users/jak/substrate/059-fix-agents-tmp/docs/plans/065-activity-log/reviews/_computed.diff from tracked + untracked phase files
...
PY
pnpm exec vitest run test/unit/web/features/065-activity-log/activity-log-writer.test.ts test/unit/web/features/065-activity-log/activity-log-reader.test.ts test/unit/web/features/065-activity-log/ignore-patterns.test.ts test/contracts/activity-log.contract.test.ts
just typecheck
just lint
pnpm exec biome check test/unit/web/features/065-activity-log/activity-log-writer.test.ts test/unit/web/features/065-activity-log/activity-log-reader.test.ts test/unit/web/features/065-activity-log/ignore-patterns.test.ts test/contracts/activity-log.contract.test.ts
git check-ignore -v .chainglass/data/activity-log.jsonl
node -e "const { shouldIgnorePaneTitle } = require('./apps/web/src/features/065-activity-log/lib/ignore-patterns.ts'); console.log('host', shouldIgnorePaneTitle('ubuntu')); console.log('local', shouldIgnorePaneTitle('Mac.localdomain'));"
ls -1 docs/plans/065-activity-log/tasks/phase-1-types-writer-reader
```

## H) Handover Brief

> Copy this section to the implementing agent. It has no context on the review —
> only context on the work that was done before the review.

**Review result**: REQUEST_CHANGES

**Plan**: /Users/jak/substrate/059-fix-agents-tmp/docs/plans/065-activity-log/activity-log-plan.md
**Spec**: /Users/jak/substrate/059-fix-agents-tmp/docs/plans/065-activity-log/activity-log-spec.md
**Phase**: Phase 1: Activity Log Domain — Types, Writer, Reader
**Tasks dossier**: /Users/jak/substrate/059-fix-agents-tmp/docs/plans/065-activity-log/tasks/phase-1-types-writer-reader/tasks.md
**Execution log**: /Users/jak/substrate/059-fix-agents-tmp/docs/plans/065-activity-log/tasks/phase-1-types-writer-reader/execution.log.md (missing at review time)
**Review file**: /Users/jak/substrate/059-fix-agents-tmp/docs/plans/065-activity-log/reviews/review.phase-1-types-writer-reader.md

### Files Reviewed

| File (absolute path) | Status | Domain | Action Needed |
|---------------------|--------|--------|---------------|
| /Users/jak/substrate/059-fix-agents-tmp/.gitignore | modified | root | None |
| /Users/jak/substrate/059-fix-agents-tmp/docs/domains/registry.md | modified | _platform | None |
| /Users/jak/substrate/059-fix-agents-tmp/docs/domains/domain-map.md | modified | _platform | F005 |
| /Users/jak/substrate/059-fix-agents-tmp/docs/domains/activity-log/domain.md | created | activity-log | F005 |
| /Users/jak/substrate/059-fix-agents-tmp/apps/web/src/features/065-activity-log/types.ts | created | activity-log | None |
| /Users/jak/substrate/059-fix-agents-tmp/apps/web/src/features/065-activity-log/lib/activity-log-writer.ts | created | activity-log | None |
| /Users/jak/substrate/059-fix-agents-tmp/apps/web/src/features/065-activity-log/lib/activity-log-reader.ts | created | activity-log | F001, F003 |
| /Users/jak/substrate/059-fix-agents-tmp/apps/web/src/features/065-activity-log/lib/ignore-patterns.ts | created | activity-log | F004 |
| /Users/jak/substrate/059-fix-agents-tmp/test/unit/web/features/065-activity-log/activity-log-writer.test.ts | created | activity-log | F006 |
| /Users/jak/substrate/059-fix-agents-tmp/test/unit/web/features/065-activity-log/activity-log-reader.test.ts | created | activity-log | F001, F006 |
| /Users/jak/substrate/059-fix-agents-tmp/test/unit/web/features/065-activity-log/ignore-patterns.test.ts | created | activity-log | F006 |
| /Users/jak/substrate/059-fix-agents-tmp/test/contracts/activity-log.contract.test.ts | created | activity-log | F001, F006 |

### Required Fixes (if REQUEST_CHANGES)

| # | File (absolute path) | What To Fix | Why |
|---|---------------------|-------------|-----|
| 1 | /Users/jak/substrate/059-fix-agents-tmp/apps/web/src/features/065-activity-log/lib/activity-log-reader.ts; /Users/jak/substrate/059-fix-agents-tmp/test/unit/web/features/065-activity-log/activity-log-reader.test.ts; /Users/jak/substrate/059-fix-agents-tmp/test/contracts/activity-log.contract.test.ts; /Users/jak/substrate/059-fix-agents-tmp/docs/plans/065-activity-log/activity-log-spec.md; /Users/jak/substrate/059-fix-agents-tmp/docs/plans/065-activity-log/activity-log-plan.md; /Users/jak/substrate/059-fix-agents-tmp/docs/plans/065-activity-log/tasks/phase-1-types-writer-reader/tasks.md | Resolve the reader ordering/default-limit contract so AC-11, the plan/tasks, the implementation, and the tests all say the same thing. | The current code and tests contradict the spec and leave the public API ambiguous for later phases. |
| 2 | /Users/jak/substrate/059-fix-agents-tmp/docs/plans/065-activity-log/tasks/phase-1-types-writer-reader/execution.log.md | Reconstruct the missing phase execution log with actual commands, outputs, and verification notes. | The phase currently lacks required RED->GREEN / verification evidence. |
| 3 | /Users/jak/substrate/059-fix-agents-tmp/apps/web/src/features/065-activity-log/lib/activity-log-reader.ts; /Users/jak/substrate/059-fix-agents-tmp/test/unit/web/features/065-activity-log/activity-log-reader.test.ts | Replace lexical timestamp comparison with parsed time comparison and add a regression test covering offset timestamps. | The current `since` filter can misclassify valid ISO-8601 timestamps. |
| 4 | /Users/jak/substrate/059-fix-agents-tmp/apps/web/src/features/065-activity-log/lib/ignore-patterns.ts; /Users/jak/substrate/059-fix-agents-tmp/test/unit/web/features/065-activity-log/ignore-patterns.test.ts | Extend ignore logic to cover bare hostnames / short hostnames. | Cross-OS pane-title noise filtering is still incomplete. |
| 5 | /Users/jak/substrate/059-fix-agents-tmp/docs/domains/activity-log/domain.md; /Users/jak/substrate/059-fix-agents-tmp/docs/domains/domain-map.md | Fix dependency direction, add composition details, reshape concepts, and add the missing health-summary row. | The architecture docs are not yet internally consistent or review-complete. |
| 6 | /Users/jak/substrate/059-fix-agents-tmp/test/unit/web/features/065-activity-log/activity-log-writer.test.ts; /Users/jak/substrate/059-fix-agents-tmp/test/unit/web/features/065-activity-log/activity-log-reader.test.ts; /Users/jak/substrate/059-fix-agents-tmp/test/unit/web/features/065-activity-log/ignore-patterns.test.ts; /Users/jak/substrate/059-fix-agents-tmp/test/contracts/activity-log.contract.test.ts | Add required Test Doc comments and fix Biome formatting / import order issues until `just lint` passes. | The new test suite is not yet compliant with project rules or lint-clean. |

### Domain Artifacts to Update (if any)

| File (absolute path) | What's Missing |
|---------------------|----------------|
| /Users/jak/substrate/059-fix-agents-tmp/docs/domains/activity-log/domain.md | Correct dependency direction; add `## Composition`; reshape `## Concepts` to `Concept | Entry Point | What It Does`. |
| /Users/jak/substrate/059-fix-agents-tmp/docs/domains/domain-map.md | Reverse/remove the terminal edge until Phase 2, use contract labels, and add an `activity-log` row to the Domain Health Summary. |

### Next Step

/plan-6-v2-implement-phase --plan /Users/jak/substrate/059-fix-agents-tmp/docs/plans/065-activity-log/activity-log-plan.md --phase 'Phase 1: Activity Log Domain — Types, Writer, Reader'
