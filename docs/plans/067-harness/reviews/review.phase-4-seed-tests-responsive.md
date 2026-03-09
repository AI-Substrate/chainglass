# Code Review: Phase 4: Seed Scripts, Feature Tests & Responsive Viewports

**Plan**: /Users/jordanknight/substrate/066-wf-real-agents/docs/plans/067-harness/harness-plan.md
**Spec**: /Users/jordanknight/substrate/066-wf-real-agents/docs/plans/067-harness/harness-spec.md
**Phase**: Phase 4: Seed Scripts, Feature Tests & Responsive Viewports
**Date**: 2026-03-07
**Reviewer**: Automated (plan-7-v2)
**Testing Approach**: Full TDD

## A) Verdict

**REQUEST_CHANGES**

The phase is close — direct Vitest/Playwright reruns and live harness validation show the routes, MCP endpoint, seeded workspace, and responsive layouts all work today — but the seed path is not review-safe because it can overwrite the entire workspace registry and still return success when verification fails.

**Key failure areas**:
- **Implementation**: `harness seed` rewrites `workspaces.json` wholesale and the CLI reports success even when the post-write verification flag is false.
- **Domain compliance**: the plan's Domain Manifest lags the actual phase-4 file set, so traceability is incomplete.
- **Reinvention**: the seed helper forks workspace-registry behavior that already exists behind the workspace service/registry adapter contract.
- **Testing**: the seeded-data and MCP smoke coverage are shallower than the tasks dossier claims, and the phase artifacts do not preserve RED/GREEN evidence.
- **Doctrine**: the harness now relies on a `*.spec.ts` Playwright convention that is not explicitly ratified against the base project rules.

## B) Summary

Phase 4 is functionally close to done: the review reran `vitest` (5 tests passed), reran the new Playwright suites (24 passed, 3 skipped), and the live harness validator confirmed AC-15 through AC-19 against the running app on ports 3159/4659/9281. Domain boundaries are otherwise clean — the work stays in `harness/`, `docs/project-rules/`, and `CLAUDE.md`, with no cross-domain import leaks or map changes required. The main blocker is the new seed implementation: it bypasses the existing workspace-registration path by writing a hard-coded one-entry registry file, which can erase unrelated workspaces and drift from the app's registry contract. Review evidence is also not phase-ready: `seed-verification.spec.ts` does not assert the promised sidebar/worktree UI outcomes, MCP smoke is not wired into the advertised smoke CLI surface, and `execution.log.md`/`tasks.md` do not retain Full-TDD proof.

## C) Checklist

**Testing Approach: Full TDD**

For Full TDD:
- [ ] RED evidence preserved for the new seed, smoke, and responsive flows
- [x] GREEN verification exists during review (`vitest` rerun, Playwright rerun, and live harness validation)
- [ ] Critical acceptance criteria are encoded in durable automated checks (AC-16 and AC-19 still need stronger assertions)

Universal (all approaches):
- [x] Only in-scope files changed
- [ ] Linters/type checks clean (not re-run as part of this review)
- [ ] Domain compliance checks pass (Domain Manifest drift remains)

## D) Findings Table

| ID | Severity | File:Lines | Category | Summary | Recommendation |
|----|----------|------------|----------|---------|----------------|
| F001 | HIGH | /Users/jordanknight/substrate/066-wf-real-agents/harness/src/seed/seed-workspace.ts:76-115 | correctness | Seed helper rewrites `workspaces.json` with a one-entry payload, clobbering unrelated workspaces and preferences. | Merge/update a single harness workspace entry instead of replacing the full registry. |
| F002 | HIGH | /Users/jordanknight/substrate/066-wf-real-agents/harness/src/cli/commands/seed.ts:11-25 | correctness | The CLI returns success even when post-registration verification failed (`verified:false`). | Treat failed verification as an error or explicit degraded result, not a success envelope. |
| F003 | HIGH | /Users/jordanknight/substrate/066-wf-real-agents/harness/tests/smoke/seed-verification.spec.ts:13-50 | testing | Seed verification tests do not assert the promised UI outcomes (sidebar visibility and listed worktrees). | Add browser assertions for the sidebar label and visible worktree rows on the workspace page. |
| F004 | HIGH | /Users/jordanknight/substrate/066-wf-real-agents/docs/plans/067-harness/tasks/phase-4-seed-tests-responsive/execution.log.md:23-24; /Users/jordanknight/substrate/066-wf-real-agents/docs/plans/067-harness/tasks/phase-4-seed-tests-responsive/tasks.md:198-204 | testing-evidence | Phase artifacts do not preserve Full-TDD evidence or accurate completion status for delivered tasks. | Record RED/GREEN commands and outputs in `execution.log.md` and mark completed tasks in `tasks.md`. |
| F005 | MEDIUM | /Users/jordanknight/substrate/066-wf-real-agents/harness/src/cli/commands/test.ts:16-18; /Users/jordanknight/substrate/066-wf-real-agents/harness/tests/smoke/mcp-smoke.test.ts:15-53 | testing | `harness test --suite smoke` does not run the new MCP smoke check, and the MCP test does not lock in tool-name expectations. | Wire MCP coverage into the advertised smoke surface and assert the expected tool names in the response. |
| F006 | MEDIUM | /Users/jordanknight/substrate/066-wf-real-agents/harness/tests/responsive/sidebar-responsive.spec.ts:50-65 | pattern | The mobile sidebar test uses a visibility/bounding-box heuristic instead of the documented Sheet/data-state contract. | Assert the mobile Sheet closed/open state directly via the documented attributes or roles. |
| F007 | LOW | /Users/jordanknight/substrate/066-wf-real-agents/docs/plans/067-harness/harness-plan.md:36-74 | domain-compliance | The plan Domain Manifest does not list several phase-4 files, so file-to-domain traceability is incomplete. | Add manifest rows/globs for the phase-4 smoke specs, docs, and cross-domain updates. |
| F008 | LOW | /Users/jordanknight/substrate/066-wf-real-agents/harness/playwright.config.ts:21-24; /Users/jordanknight/substrate/066-wf-real-agents/docs/project-rules/harness.md:149-156 | doctrine | Harness now standardizes Playwright `*.spec.ts` suites, but the base rules still require `*.test.ts` and no harness-specific exception is documented. | Either document a Playwright-specific exception in `harness.md` or align the suite naming with the base rule set. |

## E) Detailed Findings

### E.1) Implementation Quality

#### F001 — Seed helper clobbers the entire registry instead of merging one workspace
- **Severity**: HIGH
- **File**: `/Users/jordanknight/substrate/066-wf-real-agents/harness/src/seed/seed-workspace.ts:76-115`
- **Issue**: `buildRegistryJson()` constructs a brand-new `{ version: 1, workspaces: [ ... ] }` payload and `registerInContainer()` writes it directly to `/root/.config/chainglass/workspaces.json`. That replaces the entire registry with a single hard-coded workspace entry, so running `harness seed` can silently discard unrelated workspaces and preference state already present in the container. The anti-reinvention check also found that this duplicates behavior already owned by `WorkspaceRegistryAdapter.save()` and `WorkspaceService.add()`.
- **Recommendation**: Reuse/extend the existing registration path, or at minimum perform a read-modify-write merge that preserves existing registry entries and only upserts the harness seed workspace.

#### F002 — Seed CLI reports success even when verification failed
- **Severity**: HIGH
- **File**: `/Users/jordanknight/substrate/066-wf-real-agents/harness/src/cli/commands/seed.ts:11-25`
- **Issue**: The command rejects only `!result.registered`. If registry writing succeeds but `result.verified` is false, the CLI still returns a success envelope, even though the seeded workspace is not yet proven visible in the app. That makes the command contract optimistic in exactly the failure mode AC-15/AC-16 are supposed to guard.
- **Recommendation**: Fail the command (or return an explicit degraded/error envelope) when `verified` is false, and include any verification details/worktree counts in the response payload so callers can reason about success.

### E.2) Domain Compliance

| Check | Status | Details |
|-------|--------|---------|
| File placement | ✅ | New code stays inside `harness/` or the declared cross-domain doc surfaces (`docs/project-rules/harness.md`, `CLAUDE.md`). |
| Contract-only imports | ✅ | No imports from another domain's internal files were introduced. |
| Dependency direction | ✅ | No infrastructure→business or business→business dependency violations were added. |
| Domain.md updated | ✅ | No registered domain contract changed in this phase, so no `docs/domains/<slug>/domain.md` update was required. |
| Registry current | ✅ | No new registered domains were created. |
| No orphan files | ❌ | The plan Domain Manifest does not list several delivered phase-4 files, so file→domain traceability is incomplete. |
| Map nodes current | ✅ | `docs/domains/domain-map.md` did not need new nodes for this external-tooling phase. |
| Map edges current | ✅ | No new cross-domain edges or labels were required. |
| No circular business deps | ✅ | No new business-domain cycles were introduced. |
| Concepts documented | N/A | No registered domain contracts changed in this phase. |

#### F007 — Domain Manifest drifted behind the actual phase-4 file set
- **Severity**: LOW
- **File**: `/Users/jordanknight/substrate/066-wf-real-agents/docs/plans/067-harness/harness-plan.md:36-74`
- **Issue**: The plan manifest covers the broad harness surface, but it does not enumerate several delivered phase-4 files such as `docs/project-rules/harness.md`, `CLAUDE.md`, `harness/tests/smoke/routes-smoke.spec.ts`, `harness/tests/smoke/seed-verification.spec.ts`, `harness/tests/smoke/mcp-smoke.test.ts`, and the feature stub specs.
- **Recommendation**: Add explicit rows or globs for the phase-4 smoke specs and cross-domain docs so future reviews can map every changed file cleanly.

### E.3) Anti-Reinvention

| New Component | Existing Match? | Domain | Status |
|--------------|----------------|--------|--------|
| `harness/src/seed/seed-workspace.ts` | `apps/web/app/actions/workspace-actions.ts:addWorkspace`, `packages/workflow/src/services/workspace.service.ts:add`, `packages/workflow/src/adapters/workspace-registry.adapter.ts:save` | N/A | ❌ Extend existing registration logic — the current fork caused F001's registry-clobber risk. |
| `harness/src/cli/commands/seed.ts` | None | N/A | ✅ Proceed |
| `harness/tests/smoke/routes-smoke.spec.ts` | `harness/tests/smoke/browser-smoke.spec.ts` | N/A | ✅ Reasonable extension of existing smoke coverage |
| `harness/tests/smoke/mcp-smoke.test.ts` | None | N/A | ⚠️ Useful new coverage, but not yet wired into the advertised smoke CLI surface |
| `harness/tests/smoke/seed-verification.spec.ts` | `harness/src/seed/seed-workspace.ts:verifyRegistration()` | N/A | ⚠️ Extend with the promised UI assertions rather than duplicating only the API-level check |
| `harness/tests/responsive/sidebar-responsive.spec.ts` | None | N/A | ✅ Proceed |

### E.4) Testing & Evidence

**Spec approach**: Full TDD  
**Observed evidence quality during review**: Hybrid — the software works in review reruns/live validation, but the phase artifacts do not preserve RED→GREEN history.

#### F003 — Seed verification coverage is shallower than the task dossier claims
- **Severity**: HIGH
- **File**: `/Users/jordanknight/substrate/066-wf-real-agents/harness/tests/smoke/seed-verification.spec.ts:13-50`
- **Issue**: T007 promises that Playwright will see the seeded workspace name in `/workspaces` and will see worktrees listed on the workspace detail page. The current spec only asserts that the API response contains the slug and that `/workspaces/harness-test-workspace` returns a non-error response. It never checks the sidebar label, the visible workspace card, or the rendered worktree rows.
- **Recommendation**: Add explicit browser assertions for `Harness Test Workspace` on `/workspaces` and for the seeded worktree(s) — e.g. `main` — on `/workspaces/harness-test-workspace`.

#### F004 — The phase artifacts do not preserve Full-TDD evidence or real completion state
- **Severity**: HIGH
- **Files**:
  - `/Users/jordanknight/substrate/066-wf-real-agents/docs/plans/067-harness/tasks/phase-4-seed-tests-responsive/execution.log.md:23-24`
  - `/Users/jordanknight/substrate/066-wf-real-agents/docs/plans/067-harness/tasks/phase-4-seed-tests-responsive/tasks.md:198-204`
- **Issue**: `execution.log.md` stops at pre-phase harness validation and never records RED/GREEN commands, pass/fail output, or artifact paths for the delivered work. `tasks.md` still leaves T003-T009 unchecked even though the corresponding files exist. That makes the phase non-deterministic for the next agent and breaks the spec's Full-TDD proof requirement.
- **Recommendation**: Update the task table to reflect actual completion and append concrete command output to `execution.log.md` (seed run, Vitest, Playwright, screenshots/results) so the next reviewer does not need to reconstruct the phase from git state.

#### F005 — MCP smoke coverage is not part of the advertised smoke command surface
- **Severity**: MEDIUM
- **Files**:
  - `/Users/jordanknight/substrate/066-wf-real-agents/harness/src/cli/commands/test.ts:16-18`
  - `/Users/jordanknight/substrate/066-wf-real-agents/harness/tests/smoke/mcp-smoke.test.ts:15-53`
- **Issue**: The harness documents `just harness test --suite smoke` as the smoke entrypoint, but the CLI only routes that suite to Playwright `*.spec.ts` files. The new MCP smoke check is a Vitest `*.test.ts`, so it is not exercised by the advertised smoke command. Even when run directly, the test only checks for a parseable JSON-RPC shape, not the expected tool names called out in T004.
- **Recommendation**: Either add a Vitest-backed smoke suite to the CLI surface or move the MCP smoke to an invoked suite that `harness test --suite smoke` actually executes, and assert tool-name expectations (for example `get_routes` / `get_errors` or the current canonical tool list).

#### F006 — Mobile responsive assertion is weaker than the documented sidebar contract
- **Severity**: MEDIUM
- **File**: `/Users/jordanknight/substrate/066-wf-real-agents/harness/tests/responsive/sidebar-responsive.spec.ts:50-65`
- **Issue**: The phase's own critical insight says mobile should assert the Radix Sheet closed state, but the current test only checks visibility and bounding-box width. That can false-pass on partially visible or off-screen elements without proving the mobile sidebar state machine is correct.
- **Recommendation**: Assert the documented Sheet semantics directly (e.g. `data-state`, role/aria contract, or other stable state attribute from the rendered Sheet content).

**Coverage confidence**: 72%

| AC | Confidence | Evidence |
|----|------------|----------|
| AC-15 | 70 | Live harness validation confirmed `/Users/jordanknight/substrate/066-wf-real-agents/scratch/harness-test-workspace` exists with `.git`, and `GET http://127.0.0.1:3159/api/workspaces?include=worktrees` returned `harness-test-workspace` with one `main` worktree. Confidence is reduced because F001/F002 show the command contract is still unsafe. |
| AC-16 | 60 | Live validation confirmed the seeded workspace appears in the running UI and the workspace detail page shows `Worktrees` and `main`, but the durable Playwright spec does not encode those UI assertions yet (F003). |
| AC-17 | 85 | The review reran Playwright across desktop/tablet/mobile, and live validation also confirmed the 375×812 mobile viewport path. |
| AC-18 | 85 | The review reran Playwright across desktop/tablet/mobile, and live validation also confirmed the 768×1024 tablet viewport path. |
| AC-19 | 60 | Review reruns and live validation both observed desktop/tablet sidebar visibility and mobile hidden-by-default behavior, but the mobile assertion is still heuristic rather than explicit state-based coverage (F006). |

### E.5) Doctrine Compliance

#### F008 — Harness-specific Playwright test conventions are not fully ratified against the base rules
- **Severity**: LOW
- **Files**:
  - `/Users/jordanknight/substrate/066-wf-real-agents/harness/playwright.config.ts:21-24`
  - `/Users/jordanknight/substrate/066-wf-real-agents/docs/project-rules/harness.md:149-156`
- **Issue**: The harness now standardizes Playwright `*.spec.ts` suites and treats those as durable tests, while the base rules still say test files must use the `.test.ts` suffix. That conflict is survivable but undocumented, which leaves future reviewers to guess whether the harness is intentionally exempt.
- **Recommendation**: Document the Playwright-specific convention in `docs/project-rules/harness.md` (or rename the suites to `.test.ts` if the project wants one suffix everywhere).

### E.6) Harness Live Validation

Harness status: **HEALTHY**

| AC | Method | Result | Evidence |
|----|--------|--------|----------|
| AC-15 | Existing seed artifact + live API validation | PASS | `scratch/harness-test-workspace` existed with `.git`, and `GET http://127.0.0.1:3159/api/workspaces?include=worktrees` returned `harness-test-workspace` with one `main` worktree. |
| AC-16 | Live CDP browser validation | PASS | On `/workspaces`, the running UI included `Harness Test Workspace`; `/workspaces/harness-test-workspace` returned 200 and showed `Worktrees`, `1`, and `main`. |
| AC-17 | CLI/viewport audit + live mobile CDP context | PASS | `harness/src/cli/commands/test.ts` maps `mobile` to the mobile project, `HARNESS_VIEWPORTS.mobile` is 375×812, and the live 375×812 session loaded `/` and `/workspaces` successfully with no visible sidebar nodes. |
| AC-18 | CLI/viewport audit + live tablet CDP context | PASS | `harness/src/cli/commands/test.ts` maps `tablet` to the tablet project, `HARNESS_VIEWPORTS.tablet` is 768×1024, and the live 768×1024 session showed the sidebar at roughly 255px width. |
| AC-19 | Live responsive comparison across desktop/tablet/mobile | PASS | At 1440×900 and 768×1024, `[data-sidebar="sidebar"]` was visible; at 375×812 it was hidden by default. |

**Evidence summary**: `just harness health` returned `ok` for app, MCP, terminal, and CDP on app `:3159`, terminal `:4659`, and CDP `:9281`. The live validator also confirmed `POST /_next/mcp` `tools/list` returned 200 with the current Next.js MCP tool list.

## F) Coverage Map

| AC | Description | Evidence | Confidence |
|----|-------------|----------|------------|
| AC-15 | `harness seed` creates a test workspace with at least one worktree, accessible in the running app | Live API validation plus existing seed artifacts proved the current seeded workspace works, but the implementation still overwrites the registry and can report success on failed verification. | 70 |
| AC-16 | Seeded data is visible when browsing the app | Live browser validation showed the workspace and `main` worktree in the running app, but the committed Playwright spec does not assert those UI outcomes. | 60 |
| AC-17 | `harness test --viewport mobile` runs tests at 375×812 | CLI mapping, viewport config, Playwright rerun, and live mobile validation all matched. | 85 |
| AC-18 | `harness test --viewport tablet` runs tests at 768×1024 | CLI mapping, viewport config, Playwright rerun, and live tablet validation all matched. | 85 |
| AC-19 | Responsive tests verify sidebar behavior changes between desktop and mobile | Review reruns and live validation both observed the behavior change, but the mobile assertion still needs an explicit Sheet-state check. | 60 |

**Overall coverage confidence**: 72%

## G) Commands Executed

```bash
git --no-pager status --short && printf '\n---DIFFSTAT---\n' && git --no-pager diff --stat && printf '\n---STAGEDSTAT---\n' && git --no-pager diff --staged --stat && printf '\n---LOG---\n' && git --no-pager log --oneline -12

python <<'PY'
# Recomputed docs/plans/067-harness/reviews/_computed.diff from
# git diff 9f1615c -- <phase-4 file set> for deterministic review input.
PY

cd /Users/jordanknight/substrate/066-wf-real-agents/harness && pnpm exec vitest run tests/smoke/mcp-smoke.test.ts tests/unit/cli/index.test.ts

cd /Users/jordanknight/substrate/066-wf-real-agents/harness && pnpm exec playwright test tests/smoke/routes-smoke.spec.ts tests/responsive/sidebar-responsive.spec.ts tests/smoke/seed-verification.spec.ts --config=playwright.config.ts --project=desktop --project=mobile --project=tablet
```

## H) Handover Brief

> Copy this section to the implementing agent. It has no context on the review —
> only context on the work that was done before the review.

**Review result**: REQUEST_CHANGES

**Plan**: /Users/jordanknight/substrate/066-wf-real-agents/docs/plans/067-harness/harness-plan.md
**Spec**: /Users/jordanknight/substrate/066-wf-real-agents/docs/plans/067-harness/harness-spec.md
**Phase**: Phase 4: Seed Scripts, Feature Tests & Responsive Viewports
**Tasks dossier**: /Users/jordanknight/substrate/066-wf-real-agents/docs/plans/067-harness/tasks/phase-4-seed-tests-responsive/tasks.md
**Execution log**: /Users/jordanknight/substrate/066-wf-real-agents/docs/plans/067-harness/tasks/phase-4-seed-tests-responsive/execution.log.md
**Review file**: /Users/jordanknight/substrate/066-wf-real-agents/docs/plans/067-harness/reviews/review.phase-4-seed-tests-responsive.md

### Files Reviewed

| File (absolute path) | Status | Domain | Action Needed |
|---------------------|--------|--------|---------------|
| /Users/jordanknight/substrate/066-wf-real-agents/CLAUDE.md | modified | cross-domain | No |
| /Users/jordanknight/substrate/066-wf-real-agents/docs/plans/067-harness/tasks/phase-4-seed-tests-responsive/execution.log.md | created | plan-doc | Yes — F004 |
| /Users/jordanknight/substrate/066-wf-real-agents/docs/plans/067-harness/tasks/phase-4-seed-tests-responsive/tasks.md | created | plan-doc | Yes — F004 |
| /Users/jordanknight/substrate/066-wf-real-agents/docs/project-rules/harness.md | created | cross-domain | Maybe — F008 |
| /Users/jordanknight/substrate/066-wf-real-agents/harness/docker-compose.yml | modified | external | No |
| /Users/jordanknight/substrate/066-wf-real-agents/harness/playwright.config.ts | modified | external | Maybe — F008 |
| /Users/jordanknight/substrate/066-wf-real-agents/harness/src/cli/commands/seed.ts | created | external | Yes — F002 |
| /Users/jordanknight/substrate/066-wf-real-agents/harness/src/cli/index.ts | modified | external | No |
| /Users/jordanknight/substrate/066-wf-real-agents/harness/src/seed/seed-workspace.ts | created | external | Yes — F001 |
| /Users/jordanknight/substrate/066-wf-real-agents/harness/tests/features/agents.spec.ts | created | external | No |
| /Users/jordanknight/substrate/066-wf-real-agents/harness/tests/features/browser.spec.ts | created | external | No |
| /Users/jordanknight/substrate/066-wf-real-agents/harness/tests/features/terminal.spec.ts | created | external | No |
| /Users/jordanknight/substrate/066-wf-real-agents/harness/tests/features/workflows.spec.ts | created | external | No |
| /Users/jordanknight/substrate/066-wf-real-agents/harness/tests/fixtures/base-test.ts | modified | external | No |
| /Users/jordanknight/substrate/066-wf-real-agents/harness/tests/responsive/sidebar-responsive.spec.ts | created | external | Yes — F006 |
| /Users/jordanknight/substrate/066-wf-real-agents/harness/tests/smoke/mcp-smoke.test.ts | created | external | Yes — F005 |
| /Users/jordanknight/substrate/066-wf-real-agents/harness/tests/smoke/routes-smoke.spec.ts | created | external | No |
| /Users/jordanknight/substrate/066-wf-real-agents/harness/tests/smoke/seed-verification.spec.ts | created | external | Yes — F003 |
| /Users/jordanknight/substrate/066-wf-real-agents/harness/tests/unit/cli/index.test.ts | modified | external | No |

### Required Fixes (if REQUEST_CHANGES)

| # | File (absolute path) | What To Fix | Why |
|---|---------------------|-------------|-----|
| 1 | /Users/jordanknight/substrate/066-wf-real-agents/harness/src/seed/seed-workspace.ts | Preserve existing registry entries when seeding; stop replacing the whole registry JSON. | Current seed can erase unrelated workspaces/preferences (F001). |
| 2 | /Users/jordanknight/substrate/066-wf-real-agents/harness/src/cli/commands/seed.ts | Fail or degrade the command when verification fails, and surface the verification details. | Current CLI can claim success while `verified` is false (F002). |
| 3 | /Users/jordanknight/substrate/066-wf-real-agents/harness/tests/smoke/seed-verification.spec.ts | Assert the promised UI outcomes: seeded workspace visible in `/workspaces` and worktree(s) listed on the workspace page. | Current test only checks API slug presence and route success (F003). |
| 4 | /Users/jordanknight/substrate/066-wf-real-agents/docs/plans/067-harness/tasks/phase-4-seed-tests-responsive/execution.log.md | Record RED/GREEN commands, outputs, and artifact paths for the delivered tasks. | Review evidence is incomplete and tasks remain unchecked (F004). |

### Domain Artifacts to Update (if any)

| File (absolute path) | What's Missing |
|---------------------|----------------|
| /Users/jordanknight/substrate/066-wf-real-agents/docs/plans/067-harness/harness-plan.md | Add phase-4 smoke/test/doc files to the Domain Manifest so every changed file maps cleanly to a domain. |
| /Users/jordanknight/substrate/066-wf-real-agents/docs/project-rules/harness.md | If `*.spec.ts` remains the Playwright convention, document the harness-specific exception against the base `.test.ts` rule. |

### Next Step

/plan-6-v2-implement-phase --plan /Users/jordanknight/substrate/066-wf-real-agents/docs/plans/067-harness/harness-plan.md --phase 'Phase 4: Seed Scripts, Feature Tests & Responsive Viewports'
