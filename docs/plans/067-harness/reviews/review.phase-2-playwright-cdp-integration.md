# Code Review: Phase 2: Playwright & CDP Integration

**Plan**: /Users/jordanknight/substrate/066-wf-real-agents/docs/plans/067-harness/harness-plan.md
**Spec**: /Users/jordanknight/substrate/066-wf-real-agents/docs/plans/067-harness/harness-spec.md
**Phase**: Phase 2: Playwright & CDP Integration
**Date**: 2026-03-07
**Reviewer**: Automated (plan-7-v2)
**Testing Approach**: Full TDD

## A) Verdict

**REQUEST_CHANGES**

Phase 2 is not review-ready because the new `harness health` path is currently broken and still does not satisfy AC-04, the CDP integration suite never reaches GREEN, and the repo quality gate now excludes the new harness code instead of proving it type-checks cleanly.

**Key failure areas**:
- **Implementation**: `/Users/jordanknight/substrate/066-wf-real-agents/harness/justfile` adds a health command that prints shell PID literals instead of evaluated probe results, and `/Users/jordanknight/substrate/066-wf-real-agents/tsconfig.json` hides the new harness code from `just typecheck`.
- **Domain compliance**: `/Users/jordanknight/substrate/066-wf-real-agents/docs/plans/067-harness/harness-plan.md` no longer maps the full delivered Phase 2 file set, including the repo-root `tsconfig.json` change.
- **Testing**: `T009` remains unfinished, `/Users/jordanknight/substrate/066-wf-real-agents/harness/tests/smoke/cdp-integration.test.ts` is still skipped, and Phase 2 acceptance criteria are backed mostly by source claims rather than retained GREEN evidence.
- **Doctrine**: the new harness tests omit required Test Doc blocks and rely on fixed sleeps for console assertions.

## B) Summary

Phase 2 adds the right building blocks: Chromium startup, CDP-facing Playwright config, viewport definitions, and initial smoke/integration suites. The most immediate functional problem is `/Users/jordanknight/substrate/066-wf-real-agents/harness/justfile:27-31`: `just -f harness/justfile health` currently prints literal `42181(curl...)`-style fragments because the recipe uses `$$(` rather than a working command substitution, and the output is still plain text instead of the structured JSON required by AC-04. The second major gap is verification: `/Users/jordanknight/substrate/066-wf-real-agents/harness/tests/smoke/cdp-integration.test.ts` remains wrapped in `describe.skip`, `tasks.md` still leaves T009 open, and `execution.log.md` contains no GREEN command output or retained artifacts. Domain boundaries are mostly intact because the harness stays external tooling, but the plan manifest has drifted and the repo-root `tsconfig.json` exclusion now removes the new harness code from the normal typecheck gate.

## C) Checklist

**Testing Approach: Full TDD**

For Full TDD:
- [ ] RED evidence preserved in reviewable artifacts
- [ ] GREEN verification captured for AC-04, AC-05, AC-06, AC-07, and AC-10
- [ ] Critical acceptance criteria backed by executable or transcript-backed evidence

Universal (all approaches):
- [ ] Only in-scope files changed
- [ ] Linters/type checks clean (`pnpm --dir harness exec tsc --noEmit` and `pnpm --dir harness exec playwright ...` currently fail)
- [ ] Domain compliance checks pass

## D) Findings Table

| ID | Severity | File:Lines | Category | Summary | Recommendation |
|----|----------|------------|----------|---------|----------------|
| F001 | HIGH | /Users/jordanknight/substrate/066-wf-real-agents/harness/justfile:27-31 | correctness | The Phase 2 health check is broken and still does not satisfy AC-04. | Replace the broken recipe with a working probe that emits structured JSON and capture a passing sample in the execution log. |
| F002 | HIGH | /Users/jordanknight/substrate/066-wf-real-agents/docs/plans/067-harness/tasks/phase-2-playwright-cdp-integration/tasks.md:114-122; /Users/jordanknight/substrate/066-wf-real-agents/harness/tests/smoke/cdp-integration.test.ts:19-84; /Users/jordanknight/substrate/066-wf-real-agents/docs/plans/067-harness/tasks/phase-2-playwright-cdp-integration/execution.log.md:23-64 | testing-evidence | Phase 2 never reaches GREEN: the core CDP integration suite is still skipped and no retained pass evidence exists. | Unskip/run the integration suite, preserve the command output and screenshot path, then update the phase docs only after GREEN is real. |
| F003 | HIGH | /Users/jordanknight/substrate/066-wf-real-agents/tsconfig.json:36-46 | quality-gate | Root typecheck now excludes `harness/`, which hides the new Phase 2 code from `just typecheck`/`just fft` without adding a replacement gate. | Remove the exclusion or add a documented harness-local install + typecheck path in the same phase so the new code is actually checked. |
| F004 | MEDIUM | /Users/jordanknight/substrate/066-wf-real-agents/docs/plans/067-harness/harness-plan.md:36-60 | domain-compliance | The Domain Manifest no longer maps the full delivered Phase 2 file set, so file-to-domain traceability is incomplete. | Add explicit rows/globs for the new harness runtime/test files and the repo-root config change, or keep the phase confined to already-declared paths. |
| F005 | MEDIUM | /Users/jordanknight/substrate/066-wf-real-agents/harness/tests/smoke/browser-smoke.spec.ts:36-40 | correctness | The smoke suite's title check only asserts a non-empty title, not the expected title text promised by the dossier/goals. | Assert a stable expected substring (or exact title) so the smoke test can catch wrong-title regressions. |
| F006 | MEDIUM | /Users/jordanknight/substrate/066-wf-real-agents/harness/tests/smoke/browser-smoke.spec.ts:24-182; /Users/jordanknight/substrate/066-wf-real-agents/harness/tests/smoke/cdp-integration.test.ts:20-84 | doctrine | The new harness tests omit required Test Doc blocks and use fixed sleeps for console assertions. | Add per-test Test Docs and replace `waitForTimeout(...)` with event-driven waits or `expect.poll`. |

## E) Detailed Findings

### E.1) Implementation Quality

#### F001 — `harness health` is broken and non-compliant with AC-04
- **Severity**: HIGH
- **File**: `/Users/jordanknight/substrate/066-wf-real-agents/harness/justfile:27-31`
- **Issue**: The new Phase 2 `health:` recipe uses `$$(` in each `echo` line. A spot check with `just -f harness/justfile health` produced PID-prefixed literals instead of evaluated probe results:
  - `App:      42181(curl -sf -o /dev/null -w '%{http_code}' http://localhost:3000 || echo 'DOWN')`
  - `Terminal: 42190(python3 -c "import socket; ...` 
  - `CDP:      42199(curl -sf http://localhost:9222/json/version ...`
  That means the command does not currently report real app/terminal/CDP status. Even after the shell substitution is repaired, the recipe would still fail AC-04 because the spec requires structured JSON for app, MCP, CDP, and terminal status, not three plain-text lines.
- **Recommendation**: Replace the recipe with a working JSON-producing probe (shell, Python, or Node), include MCP status if Phase 2 still owns AC-04, and capture a successful sample output in `/Users/jordanknight/substrate/066-wf-real-agents/docs/plans/067-harness/tasks/phase-2-playwright-cdp-integration/execution.log.md`.

#### F003 — The new harness code is hidden from the normal typecheck gate
- **Severity**: HIGH
- **File**: `/Users/jordanknight/substrate/066-wf-real-agents/tsconfig.json:36-46`
- **Issue**: Phase 2 adds `"harness"` to the root `exclude` array, while the repo's normal gate still runs `pnpm tsc --noEmit` via `/Users/jordanknight/substrate/066-wf-real-agents/justfile:108-109`. That means `just typecheck` and `just fft` no longer cover the Phase 2 harness code at all. A targeted check of the harness package (`pnpm --dir harness exec tsc --noEmit`) currently fails with missing Playwright module resolution (`@playwright/test`, `playwright-core`) and downstream implicit-any errors, so the new exclusion is masking unresolved phase issues instead of proving the code is clean.
- **Recommendation**: Do not rely on the exclusion as the quality-gate strategy. Either remove `harness` from the root exclusion once the harness package is truly installable/type-safe, or add a documented harness-local install + typecheck command in the same phase and make the execution log prove it passed.

#### F005 — The smoke title assertion is weaker than the phase goal
- **Severity**: MEDIUM
- **File**: `/Users/jordanknight/substrate/066-wf-real-agents/harness/tests/smoke/browser-smoke.spec.ts:36-40`
- **Issue**: The dossier goals and T006 promise a smoke check that verifies the page title is correct, but the current test only asserts `expect(title).toBeTruthy()`. Any non-empty but incorrect title would still pass, so the test does not actually protect the intended regression surface.
- **Recommendation**: Assert a stable expected substring or exact title derived from the real app so the smoke suite catches wrong-title regressions.

### E.2) Domain Compliance

| Check | Status | Details |
|-------|--------|---------|
| File placement | ❌ | `/Users/jordanknight/substrate/066-wf-real-agents/tsconfig.json` was changed even though the plan says Phase 2 lives under external tooling in `harness/`. |
| Contract-only imports | ✅ | No cross-domain internal imports were introduced in the reviewed Phase 2 source files. |
| Dependency direction | ✅ | No new infrastructure → business or business → business dependency violations were introduced; the harness remains external tooling. |
| Domain.md updated | ✅ | No registered domain contract changed in this phase, so no domain.md update was required. |
| Registry current | ✅ | No new domain was created, so `/Users/jordanknight/substrate/066-wf-real-agents/docs/domains/registry.md` remains current. |
| No orphan files | ❌ | The Domain Manifest omits `/Users/jordanknight/substrate/066-wf-real-agents/harness/start-chromium.sh`, `/Users/jordanknight/substrate/066-wf-real-agents/harness/tests/fixtures/base-test.ts`, `/Users/jordanknight/substrate/066-wf-real-agents/harness/tests/smoke/browser-smoke.spec.ts`, `/Users/jordanknight/substrate/066-wf-real-agents/harness/tests/smoke/cdp-integration.test.ts`, and the repo-root `tsconfig.json` change. |
| Map nodes current | ✅ | No domain topology changed, so `/Users/jordanknight/substrate/066-wf-real-agents/docs/domains/domain-map.md` does not need new nodes. |
| Map edges current | ✅ | No new domain contract edges were added by Phase 2. |
| No circular business deps | ✅ | No new business-domain edges were introduced. |
| Concepts documented | N/A | Phase 2 did not add or change registered domain contracts. |

#### F004 — Phase 2 file-to-domain traceability drifted
- **Severity**: MEDIUM
- **File**: `/Users/jordanknight/substrate/066-wf-real-agents/docs/plans/067-harness/harness-plan.md:36-60`
- **Issue**: The plan's `## Domain Manifest` does not cover the full delivered Phase 2 file set. That leaves the review without a complete declared mapping for the new harness runtime/test files and the repo-root config change.
- **Recommendation**: Update the manifest with explicit rows/globs for the delivered files, or keep the phase constrained to already-declared paths so the manifest stays authoritative.

### E.3) Anti-Reinvention

No blocking duplication was found.

| New Component | Existing Match? | Domain | Status |
|--------------|----------------|--------|--------|
| Chromium startup/restart script | None | external | Proceed |
| Playwright CDP config | None | external | Proceed |
| Named viewport definitions | `/Users/jordanknight/substrate/066-wf-real-agents/apps/web/src/hooks/useResponsive.ts`; `/Users/jordanknight/substrate/066-wf-real-agents/docs/how/responsive-patterns.md` | external | Consider reuse/documenting divergence to avoid breakpoint drift |
| Custom CDP Playwright fixture | None | external | Proceed |
| Browser smoke suite | None | external | Proceed |
| CDP integration suite | None | external | Proceed |

### E.4) Testing & Evidence

#### F002 — The phase stops before GREEN
- **Severity**: HIGH
- **Files**:
  - `/Users/jordanknight/substrate/066-wf-real-agents/docs/plans/067-harness/tasks/phase-2-playwright-cdp-integration/tasks.md:114-122`
  - `/Users/jordanknight/substrate/066-wf-real-agents/harness/tests/smoke/cdp-integration.test.ts:19-84`
  - `/Users/jordanknight/substrate/066-wf-real-agents/docs/plans/067-harness/tasks/phase-2-playwright-cdp-integration/execution.log.md:23-64`
- **Issue**: The phase explicitly leaves `T009` unfinished, and the core CDP integration suite is still wrapped in `describe.skip`. A spot check with `pnpm --dir harness exec vitest run tests/smoke/cdp-integration.test.ts --reporter=dot` reports `1 skipped` file and `4 skipped` tests, which confirms the suite is still documentary rather than executable GREEN evidence. There is also no retained command output, screenshot path, or console transcript in `execution.log.md` proving that AC-05/06/07/10 passed in a real run.
- **Recommendation**: Unskip the integration suite, run it against the harness, preserve the exact command/output and artifact paths, then mark T009 and Stage 5 done only after GREEN is real.

**Coverage confidence**: 31%

**Evidence gaps**:
- **HIGH**: AC-04 is unverified and currently contradicted by a broken `harness health` recipe.
- **HIGH**: AC-05/06/07/10 are implemented in source but not backed by retained GREEN run evidence.
- **MEDIUM**: Tablet screenshot coverage is still missing from executable evidence.
- **MEDIUM**: `pnpm --dir harness exec playwright test --config=playwright.config.ts --list` currently fails with `Command "playwright" not found`, and `pnpm --dir harness exec node -e "console.log(require.resolve('@playwright/test'))"` currently raises `MODULE_NOT_FOUND`, so the phase does not yet prove a reproducible host-side Playwright run from the checked-out repo state.

| AC | Confidence | Evidence |
|----|------------|----------|
| AC-04 | 5 | `/Users/jordanknight/substrate/066-wf-real-agents/harness/justfile` adds a health recipe, but `just -f harness/justfile health` currently prints PID-literal fragments rather than evaluated statuses, and the output is not structured JSON. |
| AC-05 | 35 | `/Users/jordanknight/substrate/066-wf-real-agents/harness/tests/fixtures/base-test.ts` and `/Users/jordanknight/substrate/066-wf-real-agents/harness/tests/smoke/cdp-integration.test.ts` implement `connectOverCDP()` coverage, but the suite is still skipped and no passing run output is retained. |
| AC-06 | 20 | `/Users/jordanknight/substrate/066-wf-real-agents/harness/playwright.config.ts` and `/Users/jordanknight/substrate/066-wf-real-agents/harness/src/viewports/devices.ts` define desktop/tablet/mobile viewports, and `/Users/jordanknight/substrate/066-wf-real-agents/harness/tests/smoke/browser-smoke.spec.ts` saves desktop/mobile screenshots, but no tablet screenshot evidence or CLI-backed screenshot evidence is recorded. |
| AC-07 | 35 | `/Users/jordanknight/substrate/066-wf-real-agents/harness/tests/smoke/browser-smoke.spec.ts` contains a multi-context test for desktop + mobile contexts in one CDP browser, but no retained run output proves it actually passed. |
| AC-10 | 40 | `/Users/jordanknight/substrate/066-wf-real-agents/harness/tests/smoke/browser-smoke.spec.ts` contains console-capture assertions, but no transcript or test report is retained in the execution log. |

### E.5) Doctrine Compliance

#### F006 — Harness tests still violate published test rules
- **Severity**: MEDIUM
- **Files**:
  - `/Users/jordanknight/substrate/066-wf-real-agents/harness/tests/smoke/browser-smoke.spec.ts:24-182`
  - `/Users/jordanknight/substrate/066-wf-real-agents/harness/tests/smoke/cdp-integration.test.ts:20-84`
- **Rules**: `docs/project-rules/rules.md` R-TEST-002 / R-TEST-003 / R-TEST-005 and `docs/project-rules/constitution.md` §3.2
- **Issue**: The new durable harness tests omit the required five-field Test Doc blocks, and `/Users/jordanknight/substrate/066-wf-real-agents/harness/tests/smoke/browser-smoke.spec.ts` uses fixed `waitForTimeout(2000)` / `waitForTimeout(500)` sleeps for console assertions. That conflicts with the repository's published test documentation/determinism rules and makes the suite slower and more brittle than it needs to be.
- **Recommendation**: Add per-test Test Docs and replace the fixed sleeps with event-driven waits (`waitForEvent('console')`, `expect.poll`, or equivalent promise coordination). If harness-local browser suites are intentionally exempt, update the rules/constitution explicitly instead of silently diverging.

### E.6) Harness Live Validation

N/A — `/Users/jordanknight/substrate/066-wf-real-agents/docs/project-rules/harness.md` is not present, so the live harness validator was skipped per the review instructions.

## F) Coverage Map

| AC | Description | Evidence | Confidence |
|----|-------------|----------|------------|
| AC-04 | `harness health` returns structured JSON with app, MCP, CDP, and terminal status | `harness/justfile` adds a `health` recipe, but the current shell expansion is broken and the output is still plain text rather than JSON. | 5 |
| AC-05 | Agent can connect to `http://localhost:9222` via CDP and open pages | `base-test.ts` and `cdp-integration.test.ts` implement CDP connection logic, but the integration suite remains skipped and no GREEN run output is recorded. | 35 |
| AC-06 | Screenshots are capturable at desktop, tablet, and mobile viewports | `playwright.config.ts` + `devices.ts` define the viewports, and `browser-smoke.spec.ts` captures desktop/mobile screenshots, but there is no tablet screenshot evidence or retained artifact log. | 20 |
| AC-07 | Multiple browser contexts can browse simultaneously within one Chromium instance | `browser-smoke.spec.ts` contains the parallel desktop/mobile context test, but no retained output proves a passing run. | 35 |
| AC-10 | Browser console output is accessible via CDP | `browser-smoke.spec.ts` contains console capture assertions for `log`, `warn`, and `error`, but no retained transcript or Playwright report proves they passed. | 40 |

**Overall coverage confidence**: 31%

## G) Commands Executed

```bash
git --no-pager diff --stat && printf '\n---STAGED---\n' && git --no-pager diff --staged --stat && printf '\n---STATUS---\n' && git --no-pager status --short && printf '\n---LOG---\n' && git --no-pager log --oneline -12

git --no-pager diff -- docs/plans/067-harness/tasks/phase-2-playwright-cdp-integration/tasks.fltplan.md

git --no-pager diff -- harness/Dockerfile harness/entrypoint.sh harness/justfile tsconfig.json harness/start-chromium.sh harness/playwright.config.ts harness/src/viewports/devices.ts harness/tests/fixtures/base-test.ts harness/tests/smoke/browser-smoke.spec.ts harness/tests/smoke/cdp-integration.test.ts docs/plans/067-harness/tasks/phase-2-playwright-cdp-integration/tasks.md docs/plans/067-harness/tasks/phase-2-playwright-cdp-integration/execution.log.md

python - <<'PY'
# Wrote /Users/jordanknight/substrate/066-wf-real-agents/docs/plans/067-harness/reviews/_computed.diff
# for the scoped Phase 2 file set
PY

pnpm --dir harness exec tsc --noEmit
pnpm --dir harness exec vitest run tests/smoke/cdp-integration.test.ts --reporter=dot
just -f harness/justfile health
just -f harness/justfile --show health
pnpm --dir harness exec playwright test --config=playwright.config.ts --list
pnpm --dir harness exec node -e "console.log(require.resolve('@playwright/test'))"
```

## H) Handover Brief

> Copy this section to the implementing agent. It has no context on the review —
> only context on the work that was done before the review.

**Review result**: REQUEST_CHANGES

**Plan**: /Users/jordanknight/substrate/066-wf-real-agents/docs/plans/067-harness/harness-plan.md
**Spec**: /Users/jordanknight/substrate/066-wf-real-agents/docs/plans/067-harness/harness-spec.md
**Phase**: Phase 2: Playwright & CDP Integration
**Tasks dossier**: /Users/jordanknight/substrate/066-wf-real-agents/docs/plans/067-harness/tasks/phase-2-playwright-cdp-integration/tasks.md
**Execution log**: /Users/jordanknight/substrate/066-wf-real-agents/docs/plans/067-harness/tasks/phase-2-playwright-cdp-integration/execution.log.md
**Review file**: /Users/jordanknight/substrate/066-wf-real-agents/docs/plans/067-harness/reviews/review.phase-2-playwright-cdp-integration.md

### Files Reviewed

| File (absolute path) | Status | Domain | Action Needed |
|---------------------|--------|--------|---------------|
| /Users/jordanknight/substrate/066-wf-real-agents/docs/plans/067-harness/harness-plan.md | reference | plan-docs | Yes — sync Domain Manifest |
| /Users/jordanknight/substrate/066-wf-real-agents/docs/plans/067-harness/harness-spec.md | reference | plan-docs | No |
| /Users/jordanknight/substrate/066-wf-real-agents/docs/plans/067-harness/tasks/phase-2-playwright-cdp-integration/tasks.md | modified | plan-docs | Yes — close T009 only after GREEN evidence exists |
| /Users/jordanknight/substrate/066-wf-real-agents/docs/plans/067-harness/tasks/phase-2-playwright-cdp-integration/tasks.fltplan.md | modified | plan-docs | Yes — sync Stage 5 only after GREEN evidence exists |
| /Users/jordanknight/substrate/066-wf-real-agents/docs/plans/067-harness/tasks/phase-2-playwright-cdp-integration/execution.log.md | created | plan-docs | Yes — add concrete commands/output/artifact paths |
| /Users/jordanknight/substrate/066-wf-real-agents/harness/Dockerfile | modified | external | No |
| /Users/jordanknight/substrate/066-wf-real-agents/harness/entrypoint.sh | modified | external | No |
| /Users/jordanknight/substrate/066-wf-real-agents/harness/justfile | modified | external | Yes — repair health probe and JSON output |
| /Users/jordanknight/substrate/066-wf-real-agents/harness/start-chromium.sh | created | external | No |
| /Users/jordanknight/substrate/066-wf-real-agents/harness/playwright.config.ts | created | external | No |
| /Users/jordanknight/substrate/066-wf-real-agents/harness/src/viewports/devices.ts | created | external | No |
| /Users/jordanknight/substrate/066-wf-real-agents/harness/tests/fixtures/base-test.ts | created | external | No |
| /Users/jordanknight/substrate/066-wf-real-agents/harness/tests/smoke/browser-smoke.spec.ts | created | external | Yes — strengthen assertions and remove timer-based waits |
| /Users/jordanknight/substrate/066-wf-real-agents/harness/tests/smoke/cdp-integration.test.ts | created | external | Yes — unskip, run GREEN, add Test Docs |
| /Users/jordanknight/substrate/066-wf-real-agents/tsconfig.json | modified | repo-config | Yes — restore real typecheck coverage for harness |

### Required Fixes (if REQUEST_CHANGES)

| # | File (absolute path) | What To Fix | Why |
|---|---------------------|-------------|-----|
| 1 | /Users/jordanknight/substrate/066-wf-real-agents/harness/justfile | Replace the broken `health` recipe with a working JSON-producing health check and record a passing sample output. | AC-04 is currently unmet and the present recipe prints PID-literal fragments instead of evaluated probe results. |
| 2 | /Users/jordanknight/substrate/066-wf-real-agents/harness/tests/smoke/cdp-integration.test.ts; /Users/jordanknight/substrate/066-wf-real-agents/docs/plans/067-harness/tasks/phase-2-playwright-cdp-integration/tasks.md; /Users/jordanknight/substrate/066-wf-real-agents/docs/plans/067-harness/tasks/phase-2-playwright-cdp-integration/tasks.fltplan.md; /Users/jordanknight/substrate/066-wf-real-agents/docs/plans/067-harness/tasks/phase-2-playwright-cdp-integration/execution.log.md | Unskip the CDP integration suite, run it to GREEN, retain the actual output/artifact paths, and only then mark Stage 5 / T009 done. | The phase still stops before GREEN, so AC-05/06/07/10 remain only partially verified. |
| 3 | /Users/jordanknight/substrate/066-wf-real-agents/tsconfig.json | Stop masking the harness code from the repo typecheck gate, or add a replacement harness-local install + typecheck gate in the same phase and prove it passes. | The new exclusion removes the Phase 2 code from `just typecheck` / `just fft` coverage. |
| 4 | /Users/jordanknight/substrate/066-wf-real-agents/docs/plans/067-harness/harness-plan.md | Update the Domain Manifest to cover the delivered Phase 2 file set, including the repo-root config change if it remains intentional. | File-to-domain traceability is currently incomplete. |
| 5 | /Users/jordanknight/substrate/066-wf-real-agents/harness/tests/smoke/browser-smoke.spec.ts | Make the title assertion actually verify the expected title text and add missing tablet screenshot evidence if AC-06 stays in phase scope. | The current smoke suite can pass with a wrong title and still lacks durable tablet evidence. |
| 6 | /Users/jordanknight/substrate/066-wf-real-agents/harness/tests/smoke/browser-smoke.spec.ts; /Users/jordanknight/substrate/066-wf-real-agents/harness/tests/smoke/cdp-integration.test.ts | Add per-test Test Docs and replace timer-based waits with event-driven waits. | The current harness tests still diverge from the repository's published test standards. |

### Domain Artifacts to Update (if any)

| File (absolute path) | What's Missing |
|---------------------|----------------|
| /Users/jordanknight/substrate/066-wf-real-agents/docs/plans/067-harness/harness-plan.md | `## Domain Manifest` needs rows/globs for `start-chromium.sh`, `tests/fixtures/base-test.ts`, both Phase 2 test files, and the repo-root `tsconfig.json` change if it remains intentional. |

### Next Step

/plan-6-v2-implement-phase --plan /Users/jordanknight/substrate/066-wf-real-agents/docs/plans/067-harness/harness-plan.md --phase 'Phase 2: Playwright & CDP Integration'
