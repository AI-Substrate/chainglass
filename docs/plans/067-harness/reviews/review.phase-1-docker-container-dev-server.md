# Code Review: Phase 1: Docker Container & Dev Server

**Plan**: /Users/jordanknight/substrate/066-wf-real-agents/docs/plans/067-harness/harness-plan.md
**Spec**: /Users/jordanknight/substrate/066-wf-real-agents/docs/plans/067-harness/harness-spec.md
**Phase**: Phase 1: Docker Container & Dev Server
**Date**: 2026-03-07
**Reviewer**: Automated (plan-7-v2)
**Testing Approach**: Full TDD

## A) Verdict

**REQUEST_CHANGES**

Phase 1 is not review-ready because container boot still depends on host-local environment state, the image does not yet satisfy the Chromium requirement from AC-01, and multiple critical acceptance criteria remain unverified beyond summary claims.

**Key failure areas**:
- **Implementation**: `/Users/jordanknight/substrate/066-wf-real-agents/harness/entrypoint.sh` loads the host's `apps/web/.env.local`, and `/Users/jordanknight/substrate/066-wf-real-agents/harness/Dockerfile` never installs Chromium.
- **Domain compliance**: `/Users/jordanknight/substrate/066-wf-real-agents/docs/plans/067-harness/harness-plan.md` does not match the delivered Phase 1 file set, and `/Users/jordanknight/substrate/066-wf-real-agents/docs/domains/_platform/auth/domain.md` was not updated for the new harness-specific `auth()` behavior.
- **Testing**: AC-08 and AC-09 are still assertion-by-log-entry rather than executable or transcript-backed evidence; AC-03 is only weakly evidenced.
- **Doctrine**: the new smoke tests violate the current per-test Test Doc requirement and the current centralized test-tree rule.

## B) Summary

Phase 1 establishes a strong harness scaffold: the repository now has a dedicated `harness/` workspace, root justfile integration, an ADR, and a focused smoke suite. The biggest functional problem is in container boot: the entrypoint re-imports `apps/web/.env.local`, which currently contains host-specific values and secrets-oriented keys, so the container is no longer fully self-contained. The second major implementation gap is that the Docker image does not install Playwright Chromium even though Phase 1 acceptance criteria require it. Domain compliance is mostly intact because the harness remains external tooling, but the plan manifest and `_platform/auth` docs have drifted. Anti-reinvention checks found no blocking duplication; the new work extends existing startup/auth-bypass patterns rather than inventing a parallel subsystem.

## C) Checklist

**Testing Approach: Full TDD**

For Full TDD:
- [ ] RED evidence preserved in reviewable artifacts
- [ ] GREEN verification captured for all Phase 1 acceptance criteria
- [ ] Critical acceptance criteria backed by executable or transcript-backed evidence

Universal (all approaches):
- [x] Only in-scope files changed
- [x] Linters/type checks clean (execution log records `just fft` passing)
- [ ] Domain compliance checks pass

## D) Findings Table

| ID | Severity | File:Lines | Category | Summary | Recommendation |
|----|----------|------------|----------|---------|----------------|
| F001 | HIGH | /Users/jordanknight/substrate/066-wf-real-agents/harness/entrypoint.sh:56-58 | correctness | Container boot imports `apps/web/.env.local`, overriding container-safe settings with host-local values. | Remove `--env-file=apps/web/.env.local` and rely on Dockerfile/docker-compose environment wiring. |
| F002 | HIGH | /Users/jordanknight/substrate/066-wf-real-agents/harness/Dockerfile:24-67 | correctness | The Phase 1 image never installs Playwright Chromium, so AC-01 is not met. | Install Chromium during image build and capture build evidence for the resulting image contents. |
| F003 | HIGH | /Users/jordanknight/substrate/066-wf-real-agents/docs/plans/067-harness/tasks/phase-1-docker-container-dev-server/execution.log.md:51-65; /Users/jordanknight/substrate/066-wf-real-agents/harness/tests/smoke/docker-boot.test.ts:16-72 | testing-evidence | AC-08 and AC-09 are claimed, but there is no executable or transcript-backed proof of HMR within 5 seconds or server-log access. | Add explicit verification steps/tests and preserve their outputs in `execution.log.md`. |
| F004 | MEDIUM | /Users/jordanknight/substrate/066-wf-real-agents/harness/justfile:28-30 | correctness | `just health` uses `curl -sf` against the terminal WebSocket sidecar, which can report DOWN on valid upgrade-required responses. | Use a TCP/open-port probe or accept non-2xx HTTP responses as healthy for the sidecar check. |
| F005 | MEDIUM | /Users/jordanknight/substrate/066-wf-real-agents/harness/tests/smoke/docker-boot.test.ts:17-72 | doctrine | The smoke suite omits the required 5-field Test Doc block in each `it(...)` case. | Add per-test Test Doc comments or explicitly revise the project rule if harness tests are exempt. |
| F006 | MEDIUM | /Users/jordanknight/substrate/066-wf-real-agents/harness/tests/smoke/docker-boot.test.ts:16-72 | doctrine | Harness tests are colocated under `harness/tests/`, which conflicts with the current centralized test-tree rule. | Either move the suite to `test/integration/` or amend the project rules to carve out an explicit harness exception. |
| F007 | MEDIUM | /Users/jordanknight/substrate/066-wf-real-agents/docs/plans/067-harness/harness-plan.md:40-58 | domain-compliance | The Domain Manifest names the wrong auth/test paths and omits `harness/vitest.config.ts`. | Sync the manifest to the actual Phase 1 file set or move files to match the manifest. |
| F008 | LOW | /Users/jordanknight/substrate/066-wf-real-agents/docs/domains/_platform/auth/domain.md:46-53; 113-123; 185-193 | domain-docs | `_platform/auth` docs do not record the new `DISABLE_AUTH` server-action behavior relied on by the harness. | Update History and Concepts/contract text for `auth()`. |

## E) Detailed Findings

### E.1) Implementation Quality

#### F001 — Container boot leaks host-local environment state
- **Severity**: HIGH
- **File**: `/Users/jordanknight/substrate/066-wf-real-agents/harness/entrypoint.sh:56-58`
- **Issue**: The entrypoint launches the terminal sidecar with `--env-file=apps/web/.env.local`. In this repository, `apps/web/.env.local` exists, sets `TERMINAL_ALLOWED_BASE` to a `/Users/...` path, and includes GitHub auth keys. That defeats the container boundary and can misconfigure the sidecar inside `/app`.
- **Recommendation**: Remove the env-file flag and keep all required container settings in `/Users/jordanknight/substrate/066-wf-real-agents/harness/docker-compose.yml` and `/Users/jordanknight/substrate/066-wf-real-agents/harness/Dockerfile`.

#### F002 — Chromium is missing from the image
- **Severity**: HIGH
- **File**: `/Users/jordanknight/substrate/066-wf-real-agents/harness/Dockerfile:24-67`
- **Issue**: The image installs build tooling and pnpm, but there is no Playwright browser install step. Phase 1 and AC-01 require the built image to contain Playwright Chromium.
- **Recommendation**: Add a deterministic browser install step during image build and record the resulting evidence in the execution log.

#### F004 — Terminal health probe can false-negative
- **Severity**: MEDIUM
- **File**: `/Users/jordanknight/substrate/066-wf-real-agents/harness/justfile:28-30`
- **Issue**: The terminal sidecar is a WebSocket server. The smoke test itself allows 400/426-style responses as evidence that the sidecar is alive, but `just health` currently uses `curl -sf`, which treats those responses as failures and can print `DOWN` for a healthy port.
- **Recommendation**: Use a TCP probe or drop `-f`/normalize non-connection responses into a healthy state.

### E.2) Domain Compliance

| Check | Status | Details |
|-------|--------|---------|
| File placement | ❌ | `/Users/jordanknight/substrate/066-wf-real-agents/docs/plans/067-harness/harness-plan.md` declares `apps/web/src/lib/auth.ts` and `harness/tests/smoke/health.spec.ts`, but the implementation changed `/Users/jordanknight/substrate/066-wf-real-agents/apps/web/src/auth.ts` and created `/Users/jordanknight/substrate/066-wf-real-agents/harness/tests/smoke/docker-boot.test.ts`. |
| Contract-only imports | ✅ | No new cross-domain internal imports were introduced in the reviewed source files. |
| Dependency direction | ✅ | No new business↔business or infrastructure→business violations were introduced; the harness remains external tooling. |
| Domain.md updated | ❌ | `/Users/jordanknight/substrate/066-wf-real-agents/docs/domains/_platform/auth/domain.md` was not updated for the new `auth()` bypass behavior. |
| Registry current | ✅ | No new domain was created, so `/Users/jordanknight/substrate/066-wf-real-agents/docs/domains/registry.md` remains current. |
| No orphan files | ❌ | `harness/vitest.config.ts` is part of the implementation but is not mapped in the Phase 1 Domain Manifest. |
| Map nodes current | ✅ | No registered domain topology changed, so `/Users/jordanknight/substrate/066-wf-real-agents/docs/domains/domain-map.md` does not need new nodes. |
| Map edges current | ✅ | No new domain contract edges were added by Phase 1. |
| No circular business deps | ✅ | No new business-domain edges were introduced. |
| Concepts documented | ⚠️ | The Auth Concepts table still describes `await auth()` only as returning the current session/null and omits the `DISABLE_AUTH=true` harness behavior. |

#### Supporting domain findings
- **F007 — Manifest drift**: `/Users/jordanknight/substrate/066-wf-real-agents/docs/plans/067-harness/harness-plan.md:40-58`
- **F008 — Auth doc drift**: `/Users/jordanknight/substrate/066-wf-real-agents/docs/domains/_platform/auth/domain.md:46-53; 113-123; 185-193`

### E.3) Anti-Reinvention

No blocking duplication was found.

| New Component | Existing Match? | Domain | Status |
|--------------|----------------|--------|--------|
| Harness entrypoint boot/install/build/dev startup | `/Users/jordanknight/substrate/066-wf-real-agents/justfile` host `dev` orchestration already owns the same basic Next.js + terminal startup shape | external | Extend existing pattern; no blocking duplication |
| `DISABLE_AUTH` wrapper adjustment | Existing bypass path in `/Users/jordanknight/substrate/066-wf-real-agents/apps/web/proxy.ts` and `_platform/auth` auth flow | _platform/auth | Extend existing pattern; no blocking duplication |

### E.4) Testing & Evidence

**Coverage confidence**: 43%

**Evidence gaps**:
- **HIGH**: AC-01 is not credibly verified and is contradicted by the current Dockerfile (no Chromium install step).
- **HIGH**: AC-08 lacks proof that a host-side source change appears in-container within 5 seconds without rebuild.
- **HIGH**: AC-09 lacks proof that an agent can read server logs from the running container.
- **MEDIUM**: RED evidence is implied by task ordering/comments but no failing-test transcript is preserved.
- **MEDIUM**: AC-03 (`harness stop`) has implementation code but no concrete run evidence.

| AC | Confidence | Evidence |
|----|------------|----------|
| AC-01 | 10 | `/Users/jordanknight/substrate/066-wf-real-agents/harness/Dockerfile` pins Node 20.19 and installs git/pnpm tooling, but there is no Chromium install step or build transcript. |
| AC-02 | 58 | `/Users/jordanknight/substrate/066-wf-real-agents/harness/justfile` starts compose and polls port 3000; `/Users/jordanknight/substrate/066-wf-real-agents/docs/plans/067-harness/tasks/phase-1-docker-container-dev-server/execution.log.md` claims manual success for ports 3000/4500. |
| AC-03 | 35 | `/Users/jordanknight/substrate/066-wf-real-agents/harness/justfile` defines `stop`, but no run transcript or explicit observation shows the container being stopped/removed. |
| AC-08 | 15 | Bind mounts and dev-mode startup imply HMR intent, but no test or transcript demonstrates a host change propagating within 5 seconds. |
| AC-09 | 20 | `/Users/jordanknight/substrate/066-wf-real-agents/harness/justfile` defines `logs`, but no evidence shows the agent actually reading logs from the container. |
| AC-20 | 84 | `/Users/jordanknight/substrate/066-wf-real-agents/justfile` keeps `fft` unchanged and isolates harness work behind `test-harness` / `harness-*`; the execution log records `just fft` passing. |
| AC-21 | 80 | `/Users/jordanknight/substrate/066-wf-real-agents/harness/Dockerfile` and `/Users/jordanknight/substrate/066-wf-real-agents/harness/docker-compose.yml` set `DISABLE_AUTH=true`; `/Users/jordanknight/substrate/066-wf-real-agents/apps/web/src/auth.ts` now bypasses all call signatures. |

### E.5) Doctrine Compliance

#### F005 — Missing per-test Test Docs
- **Severity**: MEDIUM
- **File**: `/Users/jordanknight/substrate/066-wf-real-agents/harness/tests/smoke/docker-boot.test.ts:17-72`
- **Rule**: `docs/project-rules/rules.md` R-TEST-002 / R-TEST-003, and `docs/project-rules/constitution.md` §3.2
- **Issue**: The file header explains the suite, but the project rule requires a five-field Test Doc block inside each `it(...)` case.
- **Recommendation**: Add the required Test Doc block to every test case or explicitly amend the rule if harness-local tests are intentionally exempt.

#### F006 — Harness-local test location conflicts with current rules
- **Severity**: MEDIUM
- **File**: `/Users/jordanknight/substrate/066-wf-real-agents/harness/tests/smoke/docker-boot.test.ts:16-72`
- **Rule**: `docs/project-rules/rules.md` R-TEST-006 and `docs/project-rules/architecture.md:113-117`
- **Issue**: Current project rules require integration tests under the centralized `/Users/jordanknight/substrate/066-wf-real-agents/test/` tree. Phase 1 places the smoke suite under `harness/tests/`.
- **Recommendation**: Either move the suite into `test/integration/` or update the architecture/rules docs to explicitly allow self-contained harness tests.

### E.6) Harness Live Validation

N/A — no `/Users/jordanknight/substrate/066-wf-real-agents/docs/project-rules/harness.md` was present, so harness live validation was skipped per the review instructions.

## F) Coverage Map

| AC | Description | Evidence | Confidence |
|----|-------------|----------|------------|
| AC-01 | `harness build` creates an image containing Node 20.19, pnpm, git ≥2.13, and Playwright Chromium | Dockerfile proves Node/pnpm/git, but no Chromium install or image-build evidence exists. | 10 |
| AC-02 | `harness dev` starts the container, runs Next.js on 3000 and terminal sidecar on 4500, and waits for health | `harness/justfile` implements compose-up + polling; execution log claims manual verification for ports 3000 and 4500. | 58 |
| AC-03 | `harness stop` stops and removes the container cleanly | `harness/justfile` implements `docker compose down`, but no run evidence was captured. | 35 |
| AC-08 | Host source changes appear in the container via HMR without rebuild | Bind mounts exist, but no timed HMR verification was captured. | 15 |
| AC-09 | Agent can read Next.js server logs from the container | `harness/justfile` exposes `logs`, but no transcript or test shows it being used successfully. | 20 |
| AC-20 | `just fft` is unaffected by the harness | Root `justfile` leaves `fft` unchanged; execution log states `just fft` passed after the auth change. | 84 |
| AC-21 | Harness container uses `DISABLE_AUTH=true` to bypass authentication | Dockerfile/compose set `DISABLE_AUTH=true`, auth wrapper now bypasses all call signatures, and smoke test intent matches that behavior. | 80 |

**Overall coverage confidence**: 43%

## G) Commands Executed

```bash
git --no-pager diff --stat
git --no-pager diff --staged --stat
git --no-pager status --short
git --no-pager log --oneline -10

python - <<'PY'
# Generated /Users/jordanknight/substrate/066-wf-real-agents/docs/plans/067-harness/reviews/_computed.diff
# and /Users/jordanknight/substrate/066-wf-real-agents/docs/plans/067-harness/reviews/_manifest.tsv
PY

python - <<'PY'
# Inspected /Users/jordanknight/substrate/066-wf-real-agents/apps/web/.env.local without printing secret values
PY
```

## H) Handover Brief

> Copy this section to the implementing agent. It has no context on the review —
> only context on the work that was done before the review.

**Review result**: REQUEST_CHANGES

**Plan**: /Users/jordanknight/substrate/066-wf-real-agents/docs/plans/067-harness/harness-plan.md
**Spec**: /Users/jordanknight/substrate/066-wf-real-agents/docs/plans/067-harness/harness-spec.md
**Phase**: Phase 1: Docker Container & Dev Server
**Tasks dossier**: inline in `/Users/jordanknight/substrate/066-wf-real-agents/docs/plans/067-harness/harness-plan.md` (Phase 1 section); `/Users/jordanknight/substrate/066-wf-real-agents/docs/plans/067-harness/tasks/phase-1-docker-container-dev-server/tasks.md` is absent
**Execution log**: /Users/jordanknight/substrate/066-wf-real-agents/docs/plans/067-harness/tasks/phase-1-docker-container-dev-server/execution.log.md
**Review file**: /Users/jordanknight/substrate/066-wf-real-agents/docs/plans/067-harness/reviews/review.phase-1-docker-container-dev-server.md

### Files Reviewed

| File (absolute path) | Status | Domain | Action Needed |
|---------------------|--------|--------|---------------|
| /Users/jordanknight/substrate/066-wf-real-agents/.gitignore | modified | _platform | No |
| /Users/jordanknight/substrate/066-wf-real-agents/apps/web/src/auth.ts | modified | _platform/auth | No |
| /Users/jordanknight/substrate/066-wf-real-agents/docs/adr/README.md | modified | docs/adr | No |
| /Users/jordanknight/substrate/066-wf-real-agents/docs/adr/adr-0014-first-class-agentic-development-harness.md | created | docs/adr | No |
| /Users/jordanknight/substrate/066-wf-real-agents/docs/plans/067-harness/exploration.md | created | plan-docs | No |
| /Users/jordanknight/substrate/066-wf-real-agents/docs/plans/067-harness/harness-plan.md | created | plan-docs | Yes — sync Domain Manifest |
| /Users/jordanknight/substrate/066-wf-real-agents/docs/plans/067-harness/harness-spec.md | created | plan-docs | No |
| /Users/jordanknight/substrate/066-wf-real-agents/docs/plans/067-harness/tasks/phase-1-docker-container-dev-server/execution.log.md | created | plan-docs | Yes — add concrete evidence |
| /Users/jordanknight/substrate/066-wf-real-agents/docs/plans/067-harness/workshops/001-docker-container-setup.md | created | plan-docs | No |
| /Users/jordanknight/substrate/066-wf-real-agents/docs/plans/067-harness/workshops/002-harness-folder-and-agentic-prompts.md | created | plan-docs | No |
| /Users/jordanknight/substrate/066-wf-real-agents/harness/.dockerignore | created | external | No |
| /Users/jordanknight/substrate/066-wf-real-agents/harness/Dockerfile | created | external | Yes — install Chromium |
| /Users/jordanknight/substrate/066-wf-real-agents/harness/docker-compose.yml | created | external | No |
| /Users/jordanknight/substrate/066-wf-real-agents/harness/entrypoint.sh | created | external | Yes — stop loading host .env.local |
| /Users/jordanknight/substrate/066-wf-real-agents/harness/justfile | created | external | Yes — make terminal health probe reliable |
| /Users/jordanknight/substrate/066-wf-real-agents/harness/package.json | created | external | No |
| /Users/jordanknight/substrate/066-wf-real-agents/harness/tests/smoke/docker-boot.test.ts | created | external | Yes — evidence/Test Doc/rules alignment |
| /Users/jordanknight/substrate/066-wf-real-agents/harness/tsconfig.json | created | external | No |
| /Users/jordanknight/substrate/066-wf-real-agents/harness/vitest.config.ts | created | external | No |
| /Users/jordanknight/substrate/066-wf-real-agents/justfile | modified | _platform | No |

### Required Fixes (if REQUEST_CHANGES)

| # | File (absolute path) | What To Fix | Why |
|---|---------------------|-------------|-----|
| 1 | /Users/jordanknight/substrate/066-wf-real-agents/harness/entrypoint.sh | Remove `--env-file=apps/web/.env.local` from container startup and keep env wiring container-local. | The container currently re-imports host-local settings and can misconfigure the terminal sidecar. |
| 2 | /Users/jordanknight/substrate/066-wf-real-agents/harness/Dockerfile | Install Playwright Chromium during image build and capture the resulting evidence. | AC-01 explicitly requires Chromium in the image and the current Dockerfile does not provide it. |
| 3 | /Users/jordanknight/substrate/066-wf-real-agents/docs/plans/067-harness/tasks/phase-1-docker-container-dev-server/execution.log.md; /Users/jordanknight/substrate/066-wf-real-agents/harness/tests/smoke/docker-boot.test.ts | Add explicit, reviewable verification for AC-08 and AC-09 (and preferably AC-03). | Critical acceptance criteria are still supported only by summary claims, not durable evidence. |
| 4 | /Users/jordanknight/substrate/066-wf-real-agents/harness/justfile | Make the terminal health probe treat a listening WebSocket port as healthy. | `curl -sf` can report DOWN for a healthy sidecar that returns an upgrade-required response. |
| 5 | /Users/jordanknight/substrate/066-wf-real-agents/harness/tests/smoke/docker-boot.test.ts | Bring the smoke suite into alignment with project testing rules (Test Docs + location or documented exception). | The current suite conflicts with the per-test Test Doc rule and the centralized test-tree rule. |
| 6 | /Users/jordanknight/substrate/066-wf-real-agents/docs/plans/067-harness/harness-plan.md; /Users/jordanknight/substrate/066-wf-real-agents/docs/domains/_platform/auth/domain.md | Sync the Domain Manifest and auth domain docs to the delivered implementation. | The plan manifest and auth domain docs have drifted from the actual Phase 1 changes. |

### Domain Artifacts to Update (if any)

| File (absolute path) | What's Missing |
|---------------------|----------------|
| /Users/jordanknight/substrate/066-wf-real-agents/docs/domains/_platform/auth/domain.md | Add a Plan 067 history entry and update the `auth()` contract/Concepts text to document `DISABLE_AUTH=true` behavior for harness/server-action flows. |

### Next Step

/plan-6-v2-implement-phase --plan /Users/jordanknight/substrate/066-wf-real-agents/docs/plans/067-harness/harness-plan.md --phase 'Phase 1: Docker Container & Dev Server'
