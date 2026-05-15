# Phase 2 — Boot Integration — Execution Log

**Plan**: [auth-bootstrap-code-plan.md](../../auth-bootstrap-code-plan.md)
**Phase Tasks**: [tasks.md](./tasks.md)
**Phase Flight Plan**: [tasks.fltplan.md](./tasks.fltplan.md)
**Started**: 2026-05-02
**Implementor**: Claude Opus 4.7 (1M context)
**Reviewer (companion)**: code-review-companion run `2026-05-02T12-27-45-639Z-92a4`

---

## Pre-Phase Harness Validation (2026-05-02)

| Stage | Status | Note |
|-------|--------|------|
| Boot | ✅ HEALTHY | `curl -fsS http://localhost:3000/api/health` → `{"status":"ok"}` (running on harness internal port 3107 per console-logs response) |
| Interact | ⚠️ PARTIAL | `just harness screenshot --url /workspaces` failed with `E106 page.goto: Cannot navigate to invalid URL` — looks like a harness CLI signature change since dossier was written; not blocking Phase 2. Captured as discovery D-PRE-1. |
| Observe | ✅ OK | `just harness console-logs --filter errors` returned (favicon 404 + HMR WebSocket noise; nothing related to Phase 2 work — harness is operational) |

**Verdict**: ✅ HEALTHY — proceed. Screenshot CLI signature is a harness regression to investigate later, not a Phase 2 blocker. The smoke test in T004 will use direct `pnpm dev` + curl rather than `just harness screenshot`.

---

## Setup Discoveries

| # | Discovery | Resolution |
|---|---|---|
| S-D1 | `just harness screenshot t002-pre-phase --url /workspaces` returned `E106 Cannot navigate to invalid URL`. Looks like the CLI no longer accepts a relative URL path as `--url` and now wants a full origin (`http://localhost:3000/workspaces`) or the option name has changed. | Recorded; T004 smoke test uses direct curl + log capture instead. Open as a tooling follow-up (out of Phase 2 scope). |
| S-D2 | `vite-tsconfig-paths` still emits noisy stale-tsconfig errors from `apps/cli/dist/web/standalone/apps/web/tsconfig.json` (same as Phase 1 D-T002-2). | Confirmed non-fatal; tests pass cleanly afterward. |

---

## Per-Task Log

### T001 — Pure helpers (completed 2026-05-02)

**Files created**:
- `apps/web/src/auth-bootstrap/boot.ts` (66 LOC) — `checkBootstrapMisconfiguration(env)` and `writeBootstrapCodeOnBoot(cwd, log?)` plus `MisconfigurationResult` type.
- `test/unit/web/auth-bootstrap/boot.test.ts` (147 LOC) — 14 cases (a–n).

**TDD evidence (RED → GREEN)**:
- RED: vitest reported `Failed to resolve import "@/auth-bootstrap/boot"` (boot.ts didn't exist) → tests failed at module-load before any assertion.
- GREEN: `pnpm exec vitest run --root . test/unit/web/auth-bootstrap/boot.test.ts` → **14 passed in 7ms**.

**Decisions / discoveries**:
- **D-T001-1**: Used existing `@/` alias from `apps/web/tsconfig.json` for the production import; vitest resolves it via `vite-tsconfig-paths`. The shared-test fixture `mkTempCwd` is imported relatively (`../../shared/auth-bootstrap-code/test-fixtures`) per the dossier's L3 fix — fixtures are test-only and not part of the public package barrel.
- **D-T001-2**: EACCES test (case m) creates the parent `.chainglass/` dir as `0o555` (read-execute, no write), then asserts that `writeBootstrapCodeOnBoot` rejects with `EACCES|EROFS|EPERM`. macOS surfaces `EACCES`; Linux containers may surface `EROFS`. Restored to `0o755` in `finally` so `afterEach`'s `rmSync` succeeds.
- **D-T001-3**: Predicate uses `!== 'true'` against the literal string (case-sensitive) per validation fix C2/M3 — `'1'`, `'TRUE'`, `'false'`, `'1 '` are all "not disabled". The empty/whitespace AUTH_SECRET check uses `(env.AUTH_SECRET ?? '').trim().length > 0` so `''`, `'   '`, and `undefined` collapse uniformly.
- **D-T001-4**: Log line format hardcoded as a contract per validation fix M4: `[bootstrap-code] generated new code at <path>` and `[bootstrap-code] active code at <path>`. Test (l) asserts the code value is never present in any log line, and asserts the file *does* contain the code (so we know the test isn't trivially true via empty-string equality).

**Constitutional gates**:
- P2 (Interface-First): `MisconfigurationResult` discriminated union exported alongside the function signature. ✅
- P3 (TDD): RED → GREEN cycle complete within the same task. ✅
- P4 (Fakes Over Mocks): real `node:fs` (real temp dir + real `0o555` chmod), real `process.env`; zero `vi.mock` / `vi.spyOn`. ✅
- P5 (Fast Feedback): test suite is 7ms. ✅
- P7 (Shared by Default): the helper is web-only by design (calls `process.exit` only from `instrumentation.ts`); the shared lib stays in `@chainglass/shared/auth-bootstrap-code`. ✅

**Companion review**: msg id `01KQK8DNQV707WQP66BA2GEKEM` sent to companion run `2026-05-02T12-27-45-639Z-92a4` after T001 completion.

### T002 — Wire `instrumentation.ts` (completed 2026-05-02)

**Files modified**:
- `apps/web/instrumentation.ts` — added `globalForBootstrap` flag and a 14-line block at the top of the `NEXT_RUNTIME === 'nodejs'` branch (single dynamic import for both helpers; misconfig check + exit; HMR-safe write or container warn). All existing event-popper / workflow-execution code unchanged.

**Diff (additive only)**:
- Header docblock gained one Plan-084 line.
- New `globalForBootstrap` declaration mirroring the two existing `globalForX` flags.
- Inside `register()`, FIRST inside `nodejs` branch: dynamic-import both helpers in one statement, run misconfig check, on `{ ok: false }` log `[bootstrap-code] FATAL: <reason>` and `process.exit(1)`. Then HMR-safe gate; if `CHAINGLASS_CONTAINER === 'true'` emit the warn line, else `await writeBootstrapCodeOnBoot(process.cwd())`.
- Existing `console.log('[central-notifications] instrumentation.register() called')` preserved one line below.

**Decisions / discoveries**:
- **D-T002-1**: Single dynamic-import line for both helpers (`{ checkBootstrapMisconfiguration, writeBootstrapCodeOnBoot }`) avoids two awaits and keeps the boot-time footprint minimal. Misconfig check fires every register() call (cheap, defensive against env-flip-restart) but the file write is gated by the HMR flag.
- **D-T002-2**: Container-skip warn is INSIDE the HMR-flag gate so it fires once per process, not every restart loop. Inside the gate we branch on `CHAINGLASS_CONTAINER`: warn-and-skip vs. write.
- **D-T002-3**: Pre-existing `pnpm exec tsc --noEmit` typecheck noise (in `browser-client.tsx`, `useAgentInstance.ts`, `workflow-execution-manager.ts`, `mobile-search-overlay.tsx`, `flowspace-mcp-client.ts`) is not Phase 2's problem — none of those files are touched. Filtering for `instrumentation` and `auth-bootstrap` in tsc output returns zero new errors.

**Constitutional gates**:
- P1 (Clean Architecture): instrumentation.ts (web app) imports from `apps/web/src/auth-bootstrap/boot.ts` (web app). The boot helper imports from `@chainglass/shared/auth-bootstrap-code` (shared infrastructure). Direction: business → infrastructure. ✅
- P2 (Interface-First): `MisconfigurationResult` discriminated union from T001 is the contract instrumentation.ts depends on. ✅
- P3 (TDD): T002 has no dedicated unit test (Next.js boot integration is high-friction under vitest per dossier; smoke test in T004 is the integration evidence). T001 covers the helper logic. ✅
- P4 (Fakes Over Mocks): no new tests in this task; instrumentation.ts is exercised via T004 smoke. ✅
- P5 (Fast Feedback): T001's tests still pass in 7ms; instrumentation.ts changes are 14 lines additive. ✅

**Companion review**: msg id `01KQK8JY4XTXZK4AMDXVXVYD4Q` sent. Companion peer.verdict was `dead` at send time (no inbox_list calls observed in 6+ min) — message landed in inbox; will be acked on next poll. T003 proceeding regardless.

### T003 — Update root `.gitignore` (completed 2026-05-02)

**Files modified**:
- `.gitignore` — appended two explicit lines under the existing "Chainglass workflow runtime" section: `.chainglass/server.json` (line 160) and `.chainglass/bootstrap-code.json` (line 162). Each preceded by a Plan-tagged comment for grep-ability.

**Verification (4 cases, all pass)**:
```
$ git check-ignore -v .chainglass/bootstrap-code.json
.gitignore:162:.chainglass/bootstrap-code.json   .chainglass/bootstrap-code.json   ✅

$ git check-ignore -v .chainglass/server.json
.gitignore:160:.chainglass/server.json    .chainglass/server.json   ✅

$ git check-ignore -v .chainglass/workflows/foo/workflow.json
.gitignore:155:!.chainglass/workflows/*/workflow.json   .chainglass/workflows/foo/workflow.json   ✅ (negation rule still wins — workflow files NOT ignored, regression-safe)

$ echo '{}' > .chainglass/bootstrap-code.json && git status --short -- .chainglass/
(empty output — file is gitignored)   ✅
```

**Decisions / discoveries**:
- **D-T003-1**: Both new lines were grouped: `server.json` first (Plan 067 sidecar; never previously ignored at root) then `bootstrap-code.json` (Plan 084 — this phase). Adding `server.json` was a quiet bug-fix — event-popper has been writing it for several plans without explicit gitignore coverage. Captured here so future archaeologists know.
- **D-T003-2**: The dossier's M2 verification matrix (4 `git check-ignore` cases) caught the workflow-negation regression risk explicitly — running the negation check was the highest-value of the four. Pattern at line 155 (`!.chainglass/workflows/*/workflow.json`) wins over later patterns at lines 160/162 because gitignore precedence with negation only re-includes if the parent path was excluded by a wildcard parent dir match — not the case here. Workflow files remain trackable.

**Companion review**: msg id `01KQK8NC4E92YTCWTG0STDB56F` sent.

### T004 — Smoke test + harness validation (partial: scripted complete; live `pnpm dev` matrix deferred to operator)

**Pre-phase harness validation** — see § Pre-Phase Harness Validation table at top of this log. Verdict: ✅ HEALTHY.

**Scripted evidence captured at task close**:

```
$ pnpm exec vitest run --root . test/unit/web/auth-bootstrap/boot.test.ts test/unit/shared/auth-bootstrap-code/
 Test Files  6 passed (6)
      Tests  60 passed (60)
   Duration  1.32s
```

Full Phase 1 (46) + Phase 2 (14) regression sweep clean.

```
$ ls -la .chainglass/
(no bootstrap-code.json present — cold path will exercise on next pnpm dev boot)

$ git status --short -- .gitignore apps/web/ test/unit/web/ packages/shared/
 M .gitignore
 M apps/web/instrumentation.ts
?? apps/web/src/auth-bootstrap/
?? test/unit/web/auth-bootstrap/
```

Diff is exactly Phase 2's intended footprint. No collateral edits.

**Live `pnpm dev` matrix — DEFERRED to operator (intentional, recorded as discovery D-T004-1)**.

The dossier T004 specifies an 8-step matrix that requires (a) killing any running dev server, (b) re-booting `pnpm dev` with specific env vars, (c) observing exit codes, (d) editing a tracked file to trigger HMR, (e) restarting again to verify warm-path. The user's harness dev server was running during plan-6 execution (`http://localhost:3000/api/health` healthy at start). Killing it would be destructive — the user is actively using the harness, and the dossier explicitly notes "if `instrumentation.ts` is broken nothing about the harness works." plan-6 captured all evidence that does NOT require restart; the live matrix lands with the operator.

**Operator runbook (paste into a fresh terminal at repo root)**:

```bash
# Step 1: confirm starting state
ls .chainglass/bootstrap-code.json 2>/dev/null && rm .chainglass/bootstrap-code.json

# Step 2: cold boot, GitHub OAuth on, AUTH_SECRET set → expect "generated new code"
AUTH_SECRET=set DISABLE_AUTH=false DISABLE_GITHUB_OAUTH=false pnpm dev
# look for: [bootstrap-code] generated new code at /abs/.chainglass/bootstrap-code.json
# verify file exists, then Ctrl-C

# Step 3: HMR check — start fresh, edit a tracked file in apps/web/src/, observe NO new [bootstrap-code] line in stderr
pnpm dev   # then in another terminal: touch apps/web/src/lib/utils.ts (or any tracked .ts under apps/web/src/)
# expect: zero additional [bootstrap-code] lines

# Step 4: warm restart — kill, re-boot, expect "active code"
# Ctrl-C the dev server, then: pnpm dev
# look for: [bootstrap-code] active code at /abs/.chainglass/bootstrap-code.json (file mtime unchanged)

# Step 5: misconfig fail-fast (AUTH_SECRET unset, GitHub OAuth on)
unset AUTH_SECRET; DISABLE_AUTH=false DISABLE_GITHUB_OAUTH=false pnpm dev; echo "exit=$?"
# expect: stderr contains "[bootstrap-code] FATAL: GitHub OAuth is enabled but AUTH_SECRET is unset..." and exit code != 0

# Step 6: same env, but with DISABLE_AUTH=true → boot succeeds
DISABLE_AUTH=true pnpm dev
# expect: boot succeeds, [bootstrap-code] (generated|active) line printed, then Ctrl-C

# Step 7: gitignore check
git status --short -- .chainglass/   # expect: empty (no bootstrap-code.json or server.json listed)
git check-ignore -v .chainglass/bootstrap-code.json   # expect: .gitignore:162:.chainglass/bootstrap-code.json ...

# Step 8: whitespace AUTH_SECRET (validation fix C2)
AUTH_SECRET="   " DISABLE_AUTH=false DISABLE_GITHUB_OAUTH=false pnpm dev; echo "exit=$?"
# expect: stderr contains "[bootstrap-code] FATAL:" and non-zero exit
```

**Decisions / discoveries**:
- **D-T004-1**: Live-server `pnpm dev` matrix deferred to operator because the user's running harness was actively in use. plan-6 captured all non-destructive evidence (test sweep, gitignore check-ignore, working-tree audit, instrumentation.ts diff inspection). Mark T004 as `[~]` in the tasks table — fully complete only after operator runs the runbook above and pastes results back into this log under an "Operator smoke evidence (YYYY-MM-DD)" sub-section.
- **D-T004-2**: `.chainglass/auth.yaml`, `.chainglass/data/`, `.chainglass/instances/`, `.chainglass/units/`, `.chainglass/workflows/`, `.chainglass/templates/`, `.chainglass/new-worktree.sh` already exist at repo root — these belong to other plans (auth allowlist, workflow runtime, etc.) and are NOT touched by Phase 2.

**Constitutional gates**:
- P3 (TDD): T001 covered with full RED-GREEN cycle + 14 cases. T002/T003/T004 are integration glue + ops; the harness smoke is the test surface for those — partially-evidenced now, fully on operator. ✅ (with deferral)
- P4 (Fakes Over Mocks): zero `vi.mock` / `vi.spyOn` in any new test file (grep clean). ✅
- P5 (Fast Feedback): full Phase 1 + Phase 2 unit test sweep is 1.32s. ✅

**Companion review**: T004 task message will be sent for completeness.



