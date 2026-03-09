# Code Review: Phase 3: Harness CLI SDK

**Plan**: /Users/jordanknight/substrate/066-wf-real-agents/docs/plans/067-harness/harness-plan.md
**Spec**: /Users/jordanknight/substrate/066-wf-real-agents/docs/plans/067-harness/harness-spec.md
**Phase**: Phase 3: Harness CLI SDK
**Date**: 2026-03-07
**Reviewer**: Automated (plan-7-v2)
**Testing Approach**: Full TDD

## A) Verdict

**REQUEST_CHANGES**

Phase 3 is not review-ready because the published `harness` binary is broken, `harness health` can falsely report the terminal sidecar as healthy, `harness screenshot` can write outside `harness/results/`, and `harness test` can return a false green result from stale artifacts.

**Key failure areas**:
- **Implementation**: the shipped CLI surface has blocking correctness/security defects in binary publishing, terminal probing, screenshot path handling, and test execution.
- **Domain compliance**: new helper and unit-test files landed outside the current Phase 067 Domain Manifest coverage.
- **Testing**: the spec requires Full TDD, but T004-T010 do not have a runnable CLI integration suite or durable RED→GREEN evidence.
- **Doctrine**: the new unit tests use file-level metadata instead of the required per-test 5-field Test Doc blocks.

## B) Summary

Phase 3 lands the intended command surface and the helper extraction strategy is directionally sound. The biggest blocker is that the published `harness` binary points at a TypeScript entrypoint that only works under `tsx`, so an installed `node`-driven bin is dead on arrival. Health reporting is also unreliable because `probeTerminal()` always returns `up`, and the screenshot command trusts user-controlled path segments when building output filenames. The `harness test` command is not trustworthy: it ignores `--suite`, maps `desktop-lg` to a non-existent Playwright project, and can still return `status:"ok"` by reading an old `harness/results/test-results.json`. Domain boundaries remain mostly clean and no genuine concept reinvention was found, but the Domain Manifest and testing evidence both lag the delivered code.

## C) Checklist

**Testing Approach: Full TDD**

For Full TDD:
- [ ] RED evidence preserved for T004-T010 command behavior
- [ ] GREEN verification captured for AC-11, AC-12, AC-13, and AC-14
- [ ] Critical acceptance criteria backed by executable evidence rather than stale artifacts

Universal (all approaches):
- [x] Only in-scope files changed
- [ ] Linters/type checks clean (if applicable)
- [ ] Domain compliance checks pass

## D) Findings Table

| ID | Severity | File:Lines | Category | Summary | Recommendation |
|----|----------|------------|----------|---------|----------------|
| F001 | HIGH | /Users/jordanknight/substrate/066-wf-real-agents/harness/package.json:7-8 | correctness | Published `harness` bin points at a TypeScript entrypoint that plain `node` cannot execute. | Publish a real JavaScript entrypoint/wrapper and point `bin.harness` at it. |
| F002 | HIGH | /Users/jordanknight/substrate/066-wf-real-agents/harness/src/health/probe.ts:62-78 | correctness | `probeTerminal()` always reports `up`, so `health`/`dev` can claim success with no terminal sidecar. | Replace the fetch-based probe with a real TCP socket check. |
| F003 | HIGH | /Users/jordanknight/substrate/066-wf-real-agents/harness/src/cli/commands/screenshot.ts:14-18,47-50 | security | Screenshot names are unsanitized and can escape `harness/results/`. | Sanitize names and enforce that resolved output paths stay under `RESULTS_DIR`. |
| F004 | HIGH | /Users/jordanknight/substrate/066-wf-real-agents/harness/src/cli/commands/test.ts:19-49,68-95 | correctness | `harness test` can return false green results because `--suite` is ignored, `desktop-lg` is not a real Playwright project, and stale results are reused after failures. | Map suites/viewports to real Playwright targets and require a freshly written results artifact for each run. |
| F005 | HIGH | /Users/jordanknight/substrate/066-wf-real-agents/harness/package.json:10-13 | testing-evidence | The promised CLI integration gate is absent: `test:integration` points to a missing config and T004-T010 have no integration tests/evidence. | Add the missing integration suite/config and capture RED→GREEN evidence in the execution log. |
| F006 | MEDIUM | /Users/jordanknight/substrate/066-wf-real-agents/harness/tests/unit/cli/index.test.ts:15-35; /Users/jordanknight/substrate/066-wf-real-agents/harness/tests/unit/cli/output.test.ts:23-129 | doctrine | New unit tests omit the required per-test 5-field Test Doc blocks. | Add inline Test Doc blocks to each `it(...)` case. |
| F007 | LOW | /Users/jordanknight/substrate/066-wf-real-agents/docs/plans/067-harness/harness-plan.md:36-65 | domain-compliance | The Domain Manifest does not cover the new helper/unit-test files added for Phase 3. | Add manifest rows/globs for the helper modules and unit CLI tests. |

## E) Detailed Findings

### E.1) Implementation Quality

#### F001 — Published CLI binary is broken outside `tsx`
- **Severity**: HIGH
- **File**: `/Users/jordanknight/substrate/066-wf-real-agents/harness/package.json:7-8`
- **Issue**: The package publishes `"harness": "./src/cli/index.ts"` as its bin target. Package-manager bins run under plain `node`, but `/Users/jordanknight/substrate/066-wf-real-agents/harness/src/cli/index.ts` imports `./commands/*.js`, which do not exist until the TypeScript is transpiled. Reviewer spot checks showed the mismatch directly:
  - `pnpm --dir harness exec tsx src/cli/index.ts --help` succeeds.
  - `pnpm --dir harness exec node src/cli/index.ts --help` fails with `ERR_MODULE_NOT_FOUND` for `./commands/build.js`.
- **Recommendation**: Publish a compiled JavaScript CLI (for example `dist/cli/index.js`) or a small JavaScript wrapper that invokes `tsx`, then point `bin.harness` at that runtime-valid entrypoint.

#### F002 — Terminal health probe is a false positive
- **Severity**: HIGH
- **File**: `/Users/jordanknight/substrate/066-wf-real-agents/harness/src/health/probe.ts:62-78`
- **Issue**: `probeTerminal()` does `await fetch(...).catch(() => {})` and then always returns `{ status: 'up' }` if execution reaches the end of the `try` block. A reviewer spot check proved the false positive:
  - `cd harness && pnpm exec tsx -e "import { probeTerminal } from './src/health/probe.ts'; (async () => { console.log(JSON.stringify(await probeTerminal('127.0.0.1', 65534))); })();"`
  - Output: `{"status":"up"}`
  Port `65534` was intentionally closed, so `up` is wrong. That means `/Users/jordanknight/substrate/066-wf-real-agents/harness/src/cli/commands/health.ts` and `/Users/jordanknight/substrate/066-wf-real-agents/harness/src/cli/commands/dev.ts` can both report a healthy harness even when the terminal sidecar is absent.
- **Recommendation**: Use a real TCP socket probe (`node:net`) with explicit `connect`, `error`, and timeout handling, and only return `up` on a confirmed connection.

#### F003 — Screenshot command allows path traversal outside `harness/results/`
- **Severity**: HIGH
- **File**: `/Users/jordanknight/substrate/066-wf-real-agents/harness/src/cli/commands/screenshot.ts:14-18,47-50`
- **Issue**: The command interpolates the user-provided `<name>` directly into the output filename and then joins it with `RESULTS_DIR`. Because no sanitization or path-containment check is performed, path separators and `..` segments can escape the results directory. Reviewer normalization confirmed the escape path:
  - Resolved path for `../../tmp/harness-poc` becomes `/Users/jordanknight/substrate/066-wf-real-agents/tmp/harness-poc-mobile.png`
- **Recommendation**: Slugify/restrict screenshot names, reject path separators and `..`, resolve the final file path, and verify it still sits under `RESULTS_DIR` before writing.

#### F004 — `harness test` can return a false green result
- **Severity**: HIGH
- **File**: `/Users/jordanknight/substrate/066-wf-real-agents/harness/src/cli/commands/test.ts:19-49,68-95`
- **Issue**: Three correctness problems stack here:
  1. `--suite` is ignored because the command always runs `tests/smoke/**/*.spec.ts`.
  2. The CLI accepts `desktop-lg` and `desktop-md`, but `/Users/jordanknight/substrate/066-wf-real-agents/harness/playwright.config.ts` only defines `desktop`, `tablet`, and `mobile` projects.
  3. If Playwright fails but an old `/Users/jordanknight/substrate/066-wf-real-agents/harness/results/test-results.json` exists, the command reads the stale file and can still return `status:"ok"`.

  Reviewer spot checks reproduced the mismatch directly:
  - `cd harness && pnpm exec playwright test --config=playwright.config.ts --project=desktop-lg --list`
  - Output: `Project(s) "desktop-lg" not found. Available projects: "desktop", "tablet", "mobile"`

  Yet the CLI still reported success:
  - `cd harness && pnpm exec tsx src/cli/index.ts test --suite smoke --viewport desktop-lg`
  - Output: `{"command":"test","status":"ok",..."viewport":"desktop-lg",..."resultsFile":"/Users/jordanknight/substrate/066-wf-real-agents/harness/results/test-results.json"}`

  The referenced results artifact was stale:
  - `/Users/jordanknight/substrate/066-wf-real-agents/harness/results/test-results.json` mtime = `2026-03-07T03:02:39.005229+00:00`
  - CLI invocation above happened at `2026-03-07T04:53:56Z`
- **Recommendation**: Introduce explicit suite/project maps, reject unsupported values with `E108`, delete or timestamp-guard the results artifact before each run, and fail if the command did not write a fresh results file.

### E.2) Domain Compliance

| Check | Status | Details |
|-------|--------|---------|
| File placement | ✅ | Changed files stay within the external `harness/` tooling boundary or the already-declared repo-root `justfile`. |
| Contract-only imports | ✅ | No cross-domain internal imports were introduced; the new CLI helpers only consume local harness modules and external packages. |
| Dependency direction | ✅ | No business-domain or infrastructure-domain dependency-direction violations were introduced by the Phase 3 CLI surface. |
| Domain.md updated | ✅ | No registered domain contract changed in this phase, so no `docs/domains/<slug>/domain.md` update was required. |
| Registry current | ✅ | No new domain was created, so `/Users/jordanknight/substrate/066-wf-real-agents/docs/domains/registry.md` remains current. |
| No orphan files | ❌ | The Domain Manifest in `/Users/jordanknight/substrate/066-wf-real-agents/docs/plans/067-harness/harness-plan.md` does not list `/Users/jordanknight/substrate/066-wf-real-agents/harness/src/cdp/connect.ts`, `/Users/jordanknight/substrate/066-wf-real-agents/harness/src/docker/lifecycle.ts`, `/Users/jordanknight/substrate/066-wf-real-agents/harness/src/health/probe.ts`, or `/Users/jordanknight/substrate/066-wf-real-agents/harness/tests/unit/cli/*.test.ts`. |
| Map nodes current | ✅ | No domain topology changed, so `/Users/jordanknight/substrate/066-wf-real-agents/docs/domains/domain-map.md` does not need new nodes. |
| Map edges current | ✅ | No new domain-contract edges were added by this phase. |
| No circular business deps | ✅ | No new business-to-business edges were introduced. |
| Concepts documented | N/A | Phase 3 did not add or change registered domain contracts. |

#### F007 — Domain Manifest drifted behind the delivered Phase 3 file set
- **Severity**: LOW
- **File**: `/Users/jordanknight/substrate/066-wf-real-agents/docs/plans/067-harness/harness-plan.md:36-65`
- **Issue**: The plan manifest covers the core CLI entrypoints and command modules, but not the helper extractions or the new unit test files that actually shipped in this phase. That leaves file-to-domain traceability incomplete for review and future maintenance.
- **Recommendation**: Add explicit manifest rows or globs for `harness/src/cdp/*.ts`, `harness/src/docker/*.ts`, `harness/src/health/*.ts`, and `harness/tests/unit/cli/*.test.ts`.

### E.3) Anti-Reinvention

No blocking duplication was found.

| New Component | Existing Match? | Domain | Status |
|--------------|----------------|--------|--------|
| `/Users/jordanknight/substrate/066-wf-real-agents/harness/src/cli/output.ts` | `/Users/jordanknight/substrate/066-wf-real-agents/packages/shared/src/adapters/json-output.adapter.ts` and `/Users/jordanknight/substrate/066-wf-real-agents/apps/cli/src/commands/command-helpers.ts` | `_platform/sdk` pattern reference | ✅ Intentional local mirror per Phase 3 dossier — proceed |
| `/Users/jordanknight/substrate/066-wf-real-agents/harness/src/cdp/connect.ts` | `/Users/jordanknight/substrate/066-wf-real-agents/harness/tests/fixtures/base-test.ts` | external | ✅ Consolidates existing harness CDP logic — proceed |
| `/Users/jordanknight/substrate/066-wf-real-agents/harness/src/docker/lifecycle.ts` | None | external | ✅ Proceed |
| `/Users/jordanknight/substrate/066-wf-real-agents/harness/src/health/probe.ts` | Existing `just health` probe shape in `/Users/jordanknight/substrate/066-wf-real-agents/harness/justfile` | external | ✅ Reasonable extraction — proceed |

### E.4) Testing & Evidence

Spec intent is **Full TDD**, but the retained Phase 3 evidence is effectively hybrid: T001/T002 preserve RED→GREEN for the envelope layer, while T004-T010 rely on manual command samples and have no runnable CLI integration suite.

#### F005 — CLI integration coverage and Full TDD evidence are incomplete
- **Severity**: HIGH
- **Files**:
  - `/Users/jordanknight/substrate/066-wf-real-agents/harness/package.json:10-13`
  - `/Users/jordanknight/substrate/066-wf-real-agents/docs/plans/067-harness/tasks/phase-3-harness-cli-sdk/tasks.md:171-177`
  - `/Users/jordanknight/substrate/066-wf-real-agents/docs/plans/067-harness/tasks/phase-3-harness-cli-sdk/execution.log.md:32-39`
- **Issue**: The phase dossier expects CLI integration tests such as `/Users/jordanknight/substrate/066-wf-real-agents/harness/tests/integration/cli/build.test.ts`, `dev.test.ts`, `stop.test.ts`, `health.test.ts`, `test-command.test.ts`, `screenshot.test.ts`, and `results.test.ts`, but those files do not exist. The package script `test:integration` points to `/Users/jordanknight/substrate/066-wf-real-agents/harness/vitest.integration.config.ts`, which also does not exist. Meanwhile, the execution log only preserves unit-test success and manual command samples (`--help`, `health`, `screenshot`), so T004-T010 do not have durable RED→GREEN proof.
- **Recommendation**: Add the missing integration test/config files, wire them into `test:integration`, and capture concrete RED→GREEN evidence for each CLI command family in `/Users/jordanknight/substrate/066-wf-real-agents/docs/plans/067-harness/tasks/phase-3-harness-cli-sdk/execution.log.md`.

**Coverage confidence**: 40%

| AC | Confidence | Evidence |
|----|------------|----------|
| AC-11 | 45 | Unit tests cover the output schema and command registration, and manual spot checks show `tsx`-invoked commands emit JSON, but `build`/`dev`/`stop`/`health` lack integration proof and the published bin is broken. |
| AC-12 | 30 | `/Users/jordanknight/substrate/066-wf-real-agents/harness/tests/unit/cli/output.test.ts` validates the error-code map and error envelope shape, but no real command failure paths are exercised. |
| AC-13 | 5 | `harness test` currently gives a false green result for `desktop-lg` by reading a stale results file after Playwright project resolution fails. |
| AC-14 | 80 | The execution log records a saved screenshot and the command implementation clearly writes PNG artifacts, but the path traversal bug means the artifact path is not safely constrained to `harness/results/`. |

### E.5) Doctrine Compliance

#### F006 — Unit tests do not use the required per-test Test Doc format
- **Severity**: MEDIUM
- **Files**:
  - `/Users/jordanknight/substrate/066-wf-real-agents/harness/tests/unit/cli/index.test.ts:15-35`
  - `/Users/jordanknight/substrate/066-wf-real-agents/harness/tests/unit/cli/output.test.ts:23-129`
- **Rules**: `/Users/jordanknight/substrate/066-wf-real-agents/docs/project-rules/rules.md` R-TEST-002 / R-TEST-003 and `/Users/jordanknight/substrate/066-wf-real-agents/docs/project-rules/constitution.md` §3.2
- **Issue**: Both files add a file-level `@test-doc` header, but the project doctrine requires a five-field inline Test Doc inside every durable `it(...)` case. The current tests therefore diverge from the documented format even though they are otherwise valuable.
- **Recommendation**: Add inline Test Doc blocks to each test case (Why, Contract, Usage Notes, Quality Contribution, Worked Example).

### E.6) Harness Live Validation

N/A — `/Users/jordanknight/substrate/066-wf-real-agents/docs/project-rules/harness.md` does not exist, so the live harness validator was skipped per the review instructions. Manual CLI spot checks are captured under **Commands Executed**.

## F) Coverage Map

| AC | Description | Evidence | Confidence |
|----|-------------|----------|------------|
| AC-11 | All harness CLI commands return structured JSON to stdout with a consistent schema | Envelope/schema unit tests exist, but `build`/`dev`/`stop`/`health` lack integration proof and the published bin is not runnable under plain `node`. | 45 |
| AC-12 | Error conditions return JSON with E100-E110 codes and human-readable messages | Error-code/unit schema coverage exists, but failure-path command behavior is not exercised end-to-end. | 30 |
| AC-13 | `harness test --suite smoke` runs a minimal Playwright suite and returns pass/fail JSON | Reviewer proved the command can return `status:"ok"` for `desktop-lg` even though Playwright rejects that project and the results file is stale. | 5 |
| AC-14 | `harness screenshot <name>` captures and saves a screenshot to `harness/results/` | The command writes PNG artifacts and the execution log records success, but path handling is unsafe. | 80 |

**Overall coverage confidence**: 40%

## G) Commands Executed

```bash
git --no-pager diff --stat && printf '\n---STAGED---\n' && git --no-pager diff --staged --stat && printf '\n---STATUS---\n' && git --no-pager status --short && printf '\n---LOG---\n' && git --no-pager log --oneline -12

python - <<'PY'
# Recomputed /Users/jordanknight/substrate/066-wf-real-agents/docs/plans/067-harness/reviews/_computed.diff and
# /Users/jordanknight/substrate/066-wf-real-agents/docs/plans/067-harness/reviews/_manifest.tsv from
# git diff cfea8cd..a60c9f6 for the Phase 3 file set.
PY

pnpm --dir harness exec tsx src/cli/index.ts --help
pnpm --dir harness exec node src/cli/index.ts --help
cd harness && pnpm exec tsx -e "import { probeTerminal } from './src/health/probe.ts'; (async () => { console.log(JSON.stringify(await probeTerminal('127.0.0.1', 65534))); })();"
cd harness && pnpm exec playwright test --config=playwright.config.ts --project=desktop-lg --list
cd harness && pnpm exec tsx src/cli/index.ts test --suite smoke --viewport desktop-lg
python - <<'PY'
# Inspected mtime for /Users/jordanknight/substrate/066-wf-real-agents/harness/results/test-results.json
PY
```

## H) Handover Brief

> Copy this section to the implementing agent. It has no context on the review —
> only context on the work that was done before the review.

**Review result**: REQUEST_CHANGES

**Plan**: /Users/jordanknight/substrate/066-wf-real-agents/docs/plans/067-harness/harness-plan.md
**Spec**: /Users/jordanknight/substrate/066-wf-real-agents/docs/plans/067-harness/harness-spec.md
**Phase**: Phase 3: Harness CLI SDK
**Tasks dossier**: /Users/jordanknight/substrate/066-wf-real-agents/docs/plans/067-harness/tasks/phase-3-harness-cli-sdk/tasks.md
**Execution log**: /Users/jordanknight/substrate/066-wf-real-agents/docs/plans/067-harness/tasks/phase-3-harness-cli-sdk/execution.log.md
**Review file**: /Users/jordanknight/substrate/066-wf-real-agents/docs/plans/067-harness/reviews/review.phase-3-harness-cli-sdk.md

### Files Reviewed

| File (absolute path) | Status | Domain | Action Needed |
|---------------------|--------|--------|---------------|
| /Users/jordanknight/substrate/066-wf-real-agents/harness/justfile | modified | external | No |
| /Users/jordanknight/substrate/066-wf-real-agents/harness/package.json | modified | external | FT-001, FT-005 |
| /Users/jordanknight/substrate/066-wf-real-agents/justfile | modified | external | No |
| /Users/jordanknight/substrate/066-wf-real-agents/harness/src/cli/index.ts | created | external | No |
| /Users/jordanknight/substrate/066-wf-real-agents/harness/src/cli/output.ts | created | external | No |
| /Users/jordanknight/substrate/066-wf-real-agents/harness/src/cli/commands/build.ts | created | external | No |
| /Users/jordanknight/substrate/066-wf-real-agents/harness/src/cli/commands/dev.ts | created | external | No |
| /Users/jordanknight/substrate/066-wf-real-agents/harness/src/cli/commands/stop.ts | created | external | No |
| /Users/jordanknight/substrate/066-wf-real-agents/harness/src/cli/commands/health.ts | created | external | No |
| /Users/jordanknight/substrate/066-wf-real-agents/harness/src/cli/commands/test.ts | created | external | FT-004 |
| /Users/jordanknight/substrate/066-wf-real-agents/harness/src/cli/commands/screenshot.ts | created | external | FT-003 |
| /Users/jordanknight/substrate/066-wf-real-agents/harness/src/cli/commands/results.ts | created | external | No |
| /Users/jordanknight/substrate/066-wf-real-agents/harness/src/cdp/connect.ts | created | external | No |
| /Users/jordanknight/substrate/066-wf-real-agents/harness/src/health/probe.ts | created | external | FT-002 |
| /Users/jordanknight/substrate/066-wf-real-agents/harness/src/docker/lifecycle.ts | created | external | No |
| /Users/jordanknight/substrate/066-wf-real-agents/harness/tests/unit/cli/output.test.ts | created | external | FT-006 |
| /Users/jordanknight/substrate/066-wf-real-agents/harness/tests/unit/cli/index.test.ts | created | external | FT-006 |

### Required Fixes (if REQUEST_CHANGES)

| # | File (absolute path) | What To Fix | Why |
|---|---------------------|-------------|-----|
| 1 | /Users/jordanknight/substrate/066-wf-real-agents/harness/package.json | Publish a runtime-valid CLI bin target | Installed `harness` binary fails under plain `node` |
| 2 | /Users/jordanknight/substrate/066-wf-real-agents/harness/src/health/probe.ts | Make terminal health probing real and falsifiable | `health` and `dev` can report success when the sidecar is down |
| 3 | /Users/jordanknight/substrate/066-wf-real-agents/harness/src/cli/commands/screenshot.ts | Sanitize screenshot names and enforce output containment | Current code allows writes outside `harness/results/` |
| 4 | /Users/jordanknight/substrate/066-wf-real-agents/harness/src/cli/commands/test.ts | Honor `--suite`, map viewports to valid Playwright projects, and reject stale results | Current command can return false green results |
| 5 | /Users/jordanknight/substrate/066-wf-real-agents/harness/package.json | Add/fix the CLI integration test gate and missing evidence | Phase 3 does not meet the spec's Full TDD bar |
| 6 | /Users/jordanknight/substrate/066-wf-real-agents/harness/tests/unit/cli/output.test.ts | Add inline Test Doc blocks | Required by project rules |
| 7 | /Users/jordanknight/substrate/066-wf-real-agents/harness/tests/unit/cli/index.test.ts | Add inline Test Doc blocks | Required by project rules |

### Domain Artifacts to Update (if any)

| File (absolute path) | What's Missing |
|---------------------|----------------|
| /Users/jordanknight/substrate/066-wf-real-agents/docs/plans/067-harness/harness-plan.md | Domain Manifest rows/globs for `harness/src/cdp/*.ts`, `harness/src/docker/*.ts`, `harness/src/health/*.ts`, and `harness/tests/unit/cli/*.test.ts` |

### Next Step

/plan-6-v2-implement-phase --plan /Users/jordanknight/substrate/066-wf-real-agents/docs/plans/067-harness/harness-plan.md --phase 'Phase 3: Harness CLI SDK'
