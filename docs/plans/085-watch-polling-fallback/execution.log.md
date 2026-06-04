# Execution Log — Env-Forced File-Watch Polling Fallback (Plan 085)

**Mode**: Simple (single phase, T001–T006)
**Plan**: [watch-polling-fallback-plan.md](./watch-polling-fallback-plan.md)
**Build skill**: `/plan-6-v2-implement-phase-companion`
**Testing approach**: Lightweight — unit (diff/factory core) + one forcing-polling integration test, real fs, no mocks.

## Companion

- **Slug**: `code-review-companion` (read-only preset)
- **Run ID**: `2026-06-04T11-32-00-664Z-1fcb`
- **Mode**: Power-On / fire-and-forget; review-request ping per task commit; drain → `control:stop` at phase end.
- Briefed at session start with hazards (event parity, no-chokidar, prune-before-descend, scanning guard, ignoreInitial).

## Pre-Phase Agent Harness Validation

- Harness present: `docs/project-rules/harness.md` — **L3** (Docker + Playwright/CDP browser automation).
- **Initial call (WRONG): skipped the harness** as "not the relevant surface" for a non-UI adapter, validating only via `pnpm vitest` + `tsc` + `biome`. **This was a mistake.** Vitest aliases `@chainglass/workflow` → `src` (vitest.config.ts), so the unit/integration suites resolved the new exports from source and passed — masking that the **app/bundler resolves `@chainglass/workflow` → `dist/index.js`** (package `exports`), and the package's `dist` had not been rebuilt. The app threw `Export FileWatcherFactory doesn't exist in target module` at `di-container.ts` import time. A harness boot would have caught this immediately.
- **Correction**: rebuilt the package (`pnpm --filter @chainglass/workflow build` → `tsc --build`), so `dist/index.js` now exports `FileWatcherFactory` + `PollingFileWatcherAdapter`. Verified at runtime two ways:
  - Node package-exports resolution (same target as the bundler): `new FileWatcherFactory().create()` → `NativeFileWatcherAdapter` (unset) / `PollingFileWatcherAdapter` (forced).
  - **`just harness-verify "/workspaces/harness-test-workspace/browser"` → PASS** (HTTP 200, console clean, dev-server clean) — the workspaces route exercises the production DI container (`new FileWatcherFactory()`).
- **Note**: `dist/` is gitignored (a build artifact) — nothing to commit; the dev/CI flow rebuilds it via turbo. The lesson is to **rebuild + harness-verify after changing a package's public export surface**, not to rely on src-aliased vitest alone.

## Companion Findings Disposition

The `code-review-companion` reviewed T001–T005, then **self-terminated when its idle budget
elapsed** (run `completed`, durationMs ~875k) — before the T006 ping landed. So T006 (tests) and
the lifecycle FX were **self-reviewed + test-validated, not companion-reviewed** (deviation logged
below). Both companion findings were surfaced and resolved:

| Finding | ackOf | Severity | Disposition |
|---------|-------|----------|-------------|
| FileWatcherFactory imported from workflow root but not exported there → build-breaking | T004 | **HIGH** | **RESOLVED.** Independently caught while writing T006 (runtime `is not a constructor`); fixed by exporting `FileWatcherFactory` + `PollingFileWatcherAdapter` from `packages/workflow/src/index.ts` (commit `5ca08674`). The root barrel re-exports adapters by name, so the `adapters/index.ts` export alone (T003) was insufficient. Convergent with the companion's finding. |
| `unwatch()` during the pending initial baseline scan resurrects the watch | T002 | **MEDIUM** | **FIXED** (commit `38972ecf`). Track intended roots in a synchronous `watched` set; baseline callback bails if unwatched/closed mid-scan. Regression test added. |

**Companion farewell** (run `2026-06-04T11-32-00-664Z-1fcb`): "T001, T003, T005 had no issues;
T002 → one MEDIUM lifecycle finding; T004 → one HIGH build-breaking finding."
**magicWand** (coordination): expose a companion-runtime config dump (projectRoot, idleBudgetMs,
accepted state enum) before boot orientation. **Difficulties**: MH-001 `MINIH_PROJECT_ROOT`
resolved to the run folder (worked around via session env root); MH-002 non-idle `state_set`
rejected by the inside state schema (worked around via inbox messages). → follow-up candidates for
the minih harness, not this plan.

**Deviation — companion coverage**: the companion self-terminated after T005, so T006 + the FX
were not companion-reviewed. Mitigation: both were validated by `tsc --noEmit` (0 errors), `biome
check` (clean), and the full watcher test suite (unit 15 + integration 5 + regression 060/023 =
45 green). A fresh `/plan-7` or re-booted companion pass over commits `5ca08674`/`38972ecf` is
available if deeper review of the test+fix commits is wanted.

---

## Task Log

### T001 — Extract `compileIgnorePatterns` into shared module ✅ `d31288ee`

- Created `packages/workflow/src/adapters/ignore-patterns.ts` with `compileIgnorePatterns(patterns)` + an `IgnorePattern` type, moved verbatim from the native adapter.
- Native adapter now imports it; deleted the private method; `this.ignored = compileIgnorePatterns(...)`.
- **Evidence**: `features/060/native-file-watcher.integration.test.ts` → 13/13 pass (9.2s). No behavior change.
- 📡 Companion pinged: `review-request: T001 d31288ee`. No findings.

### T002 — `PollingFileWatcherAdapter` ✅ `90823ece`

- New `packages/workflow/src/adapters/polling-file-watcher.adapter.ts`, transcribed from workshop 001 (authoritative). Snapshot `(size,mtimeMs,isDir)` per root; diff→event parity table; prune-before-descend; `scanning` guard; `ignoreInitial` baseline; `awaitWriteFinish` debounce; AC6 startup log.
- **Gotcha (logged below)**: `Awaited<ReturnType<typeof readdir>>` annotation selected the Buffer overload → `Dirent<NonSharedBuffer>`; dropped the annotation and used `readdir(..., {withFileTypes:true}).catch(() => null)` so the `{withFileTypes:true}` literal infers `Dirent[]` (string names). Also removed a `biome-ignore noConsole` suppression — that rule isn't configured, so the suppression was itself an "unused suppression" error; plain `console.log` is allowed.
- **Evidence**: `biome check` clean; `tsc --noEmit` clean for the new files.
- 📡 Companion pinged: `review-request: T002 90823ece` (parity-critical). No findings yet.

### T003 — selecting `FileWatcherFactory` + barrel export ✅ `a133b6d2`

- New `packages/workflow/src/adapters/file-watcher.factory.ts`; reads `CHAINGLASS_WATCH_POLLING` + `CHAINGLASS_WATCH_POLL_INTERVAL` once at construction; `options.usePolling ?? forcePolling`; bad interval → 1000ms (AC5). `NativeFileWatcherFactory` untouched (D10).
- Exported `FileWatcherFactory` + `PollingFileWatcherAdapter` from `adapters/index.ts`.
- **Evidence**: biome + tsc clean.
- 📡 Companion pinged: `review-request: T003 a133b6d2`. No findings.

### T004 — DI swap ✅ `f598c04d`

- `apps/web/src/lib/di-container.ts`: `FILE_WATCHER_FACTORY` now `new FileWatcherFactory()` (was `NativeFileWatcherFactory`). Removed the now-unused `NativeFileWatcherFactory` import. Test-container Fake registration untouched.
- **Evidence**: `test/unit/web/di-container.test.ts` → 9/9 pass; production container builds.
- 📡 Companion pinged: `review-request: T004 f598c04d`. No findings.

### T005 — env-var docs ✅ (pending commit)

- `apps/web/.env.example`: documented `CHAINGLASS_WATCH_POLLING` + `CHAINGLASS_WATCH_POLL_INTERVAL` (commented, WSL/Windows-mount rationale, default 1000ms).
- `README.md`: new "File Watching on WSL / Network Filesystems" section with the when/why and the two env vars.
- 📡 Companion pinged: `review-request: T005 2a4e6a69`. No findings.

### T006 — tests + barrel-export fix ✅ `5ca08674`

- Unit `test/unit/workflow/polling-file-watcher.test.ts` (15 tests): factory selection (flag / explicit `usePolling` / non-"true" values / bad-interval AC5 / valid interval) + poller diff→event parity on real temp dirs (add/change/unlink/addDir, **removed-dir ⇒ unlink not unlinkDir**, ignoreInitial silence, awaitWriteFinish debounce) + the unwatch-during-pending-baseline regression.
- Integration `test/integration/workflow/features/085/polling-file-watcher.integration.test.ts` (5 tests): env-forced polling end-to-end via the selecting factory (AC2/AC3/AC4 incl. node_modules never surfacing) + **consumer ripple**: real `CentralWatcherService` wired to the polling factory still delivers notifications and stops cleanly.
- **Consumer-check deviation (logged)**: the plan said "run the feature-023 CentralWatcherService test with `CHAINGLASS_WATCH_POLLING=true`" — but that test hardcodes `new NativeFileWatcherFactory()` and bypasses the env/selecting factory, so the literal env-run proves nothing about polling. Substituted a faithful consumer-under-polling test in `features/085` that injects the polling factory into the real service.
- **Latent bug caught**: barrel-export gap (see disposition table, companion T004 HIGH) — fixed by exporting from the workflow root index.
- **Evidence**: unit 15/15, integration 5/5; regression 060 (13) + 023 (8) green; `tsc --noEmit` 0 errors; `biome check` clean.

### FX (companion T002) — cancel pending baseline on unwatch/close ✅ `38972ecf`

- See disposition table. `watched` Set tracks intended roots; baseline `.then()` bails if unwatched/closed mid-scan. Regression test green.

## Discoveries & Learnings

| # | Type | Discovery | Resolution |
|---|------|-----------|------------|
| D1 | gotcha | `Awaited<ReturnType<typeof readdir>>` selects the Buffer overload → `Dirent<NonSharedBuffer>` (name is Buffer, breaks `join`) | Drop the annotation; `readdir(dir, {withFileTypes:true}).catch(() => null)` lets the options literal infer `Dirent[]` (string names) |
| D2 | gotcha | A new symbol exported only from `adapters/index.ts` is invisible at the `@chainglass/workflow` import surface — the package **root** `index.ts` re-exports adapters **by name**, not `export *`. tsc still resolved it (path mapping) so the gap was runtime-only. | Always add the export to `packages/workflow/src/index.ts` too; an instantiation test (not just a type import) catches it |
| D3 | gotcha | `biome-ignore lint/suspicious/noConsole` is itself an "unused suppression" error here — `noConsole` isn't configured, so `console.log` needs no suppression | Remove the suppression; plain `console.log` passes |
| D4 | decision | Consumer-ripple proof can't reuse the feature-023 test (hardcodes native factory) | Wrote a dedicated `features/085` consumer test injecting the polling factory into the real `CentralWatcherService` |
| D5 | gotcha (high) | **src-aliased vitest masks dist/bundler resolution failures.** `vitest.config.ts` aliases `@chainglass/workflow` → `src`, so tests passed while the app (which resolves the package `exports` → `dist/index.js`) threw `Export FileWatcherFactory doesn't exist`. A new public export needs the package **rebuilt** (`dist`) before the app can see it. | After changing a package's public export surface: `pnpm --filter <pkg> build`, then `just harness-verify <route>` (or boot the app). Don't trust src-aliased unit tests alone for runtime/resolution. Mirrors the FX007 harness lesson. |
