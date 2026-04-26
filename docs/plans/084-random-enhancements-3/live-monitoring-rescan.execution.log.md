# Execution Log — Live File Monitoring Rescan (Plan 084)

**Plan**: [live-monitoring-rescan-plan.md](./live-monitoring-rescan-plan.md)
**Spec**: [live-monitoring-rescan-spec.md](./live-monitoring-rescan-spec.md)
**Workshop**: [workshops/003-watcher-rescan-on-workspace-changes.md](./workshops/003-watcher-rescan-on-workspace-changes.md)
**Mode**: Simple (single-phase, 8 tasks)
**Started**: 2026-04-26

---

## Pre-Phase Harness Validation

| Stage | Status | Duration | Notes |
|-------|--------|----------|-------|
| Boot | ⚠️ degraded | n/a | App, MCP, terminal, CDP all `down` per `just harness health` |
| Interact | skipped | — | Harness not operational |
| Observe | skipped | — | Harness not operational |

**Verdict**: 🔴 UNAVAILABLE for harness-based smoke testing this session. Plan's testing approach is unit + integration with real fs (no harness dependency), so implementation proceeds. Harness can be brought up post-implementation if/when needed for AC-1/AC-2/AC-3 manual verification (already optional per the plan).

---

## Implementation Summary (all 8 tasks complete)

**Test results**: 5958 pass (5929 baseline + 29 new from this work), 80 skipped, 0 failed across 429 test files. Lint + format + build + typecheck clean. Security-audit unchanged (16 pre-existing vulns from FX002 baseline).

**Production files touched**: 4
- `packages/workflow/src/interfaces/workspace-service.interface.ts`
- `packages/workflow/src/interfaces/index.ts`
- `packages/workflow/src/index.ts`
- `packages/workflow/src/services/workspace.service.ts`
- `packages/workflow/src/features/023-central-watcher-notifications/central-watcher.service.ts`
- `apps/web/src/features/027-central-notify-events/start-central-notifications.ts`

**New test files**: 3
- `test/unit/workflow/workspace-service-mutation-emitter.test.ts` (17 tests)
- `test/unit/web/027-central-notify-events/start-central-notifications-mutation-listener.test.ts` (6 tests)
- `test/integration/workflow/features/023/rescan-on-workspace-mutation.integration.test.ts` (6 tests)

**Existing tests updated**: 1
- `test/unit/workflow/central-watcher.service.test.ts` — 2 assertions updated for parent-dir watch (T004)

**Domain.md updates**: 2
- `docs/domains/workspace/domain.md` (Composition, Contracts, Source Location, History rows added)
- `docs/domains/_platform/events/domain.md` (Composition, Source Location, Concepts, Dependencies, History rows added)

---

## T001 — Interface: WorkspaceMutationEvent + onMutation()

**Files touched**:
- `/Users/jordanknight/substrate/084-random-enhancements-3/packages/workflow/src/interfaces/workspace-service.interface.ts` — added `WorkspaceMutationEvent` discriminated union (5 variants) + `onMutation()` method signature on `IWorkspaceService`
- `/Users/jordanknight/substrate/084-random-enhancements-3/packages/workflow/src/interfaces/index.ts` — exported `WorkspaceMutationEvent` from interfaces barrel
- `/Users/jordanknight/substrate/084-random-enhancements-3/packages/workflow/src/index.ts` — re-exported `WorkspaceMutationEvent` from package root

**Outcome**: Interface compiles. The implementation `WorkspaceService` now fails typecheck (missing `onMutation`); T002 will fix that. This is expected per the plan's task ordering — T001 is interface-only.

---

## T002 — WorkspaceService EventEmitter + 4 emit points

**Files touched**: `packages/workflow/src/services/workspace.service.ts`

**Changes**:
- Added `import { EventEmitter } from 'node:events';`
- Added `private readonly mutationEmitter = new EventEmitter()` field
- Added `onMutation(listener)` method — returns idempotent unsubscribe via `let detached = false` flag
- Added private `emitMutation(event)` method — wraps `setImmediate` + try/catch around `emitter.emit('mutation', event)` so listener throws don't propagate
- Added emit calls at 4 success-exit points:
  - `add()` line 110 (`workspace:added`)
  - `remove()` line 133+ (`workspace:removed` — also added a best-effort load-before-remove to capture path)
  - `updatePreferences()` line 310+ (`workspace:updated`)
  - `executeCreate()` line 520+ (`worktree:created`)

**Outcome**: Workflow package typechecks clean (`pnpm --filter @chainglass/workflow exec tsc --noEmit`).

**Discovery**: `remove()` did not have access to the workspace path — only the slug. Modified to do a best-effort `load(slug)` before `remove(slug)` to capture the path for the event. Wrapped in try/catch so a missing workspace still proceeds to the remove call (which will report not-found). This keeps the event shape symmetric with `workspace:added`/`updated` (always has slug + path).

---

## T004 — Registry watcher: parent dir + path filter

**Files touched**: `packages/workflow/src/features/023-central-watcher-notifications/central-watcher.service.ts`

**Changes**:
- Added `import { dirname } from 'node:path';`
- Replaced `this.registryWatcher.add(this.registryPath)` with `this.registryWatcher.add(dirname(this.registryPath))`
- Both `change` and `add` event handlers wired (atomic rename can land as either)
- Both handlers use the same `onRegistryEvent` closure that filters by absolute-path equality with `this.registryPath`
- Existing `awaitWriteFinish` / `atomic: true` / coalescing logic preserved

**Outcome**: Workflow package typechecks clean. Existing `central-watcher.service.test.ts` had 2 tests asserting the watcher's watched paths include `REGISTRY_PATH` (the file). Updated those assertions to expect `REGISTRY_DIR` (the parent) per the new behavior. The simulateChange tests continue to pass — they pass `REGISTRY_PATH` as the path argument, which the filter accepts.

---

## T003 — start-central-notifications.ts subscription wire-up

**Files touched**: `apps/web/src/features/027-central-notify-events/start-central-notifications.ts`

**Changes**:
- Added `IWorkspaceService` to the existing `@chainglass/workflow` type imports
- Added `globalThis.__watcherMutationUnsubscribe__` declaration alongside `__centralNotificationsStarted`
- Added module-level `attachMutationListener()` helper that runs unconditionally:
  - Calls and clears any prior `globalThis.__watcherMutationUnsubscribe__`
  - Resolves `IWorkspaceService` and `ICentralWatcherService` from `getContainer()`
  - Subscribes via `workspaceService.onMutation(...)`, storing the unsubscribe handle on `globalThis`
  - Wraps everything in try/catch so failure to attach doesn't break the rest of bootstrap
- Modified `startCentralNotificationSystem()` so `attachMutationListener()` is the **first statement** — runs BEFORE the `__centralNotificationsStarted` flag guard. This is the validate-v2 fix F1 (HMR idempotency trap).

**Outcome**: Workspace-root `pnpm tsc --noEmit` clean. (Per-package `pnpm --filter @chainglass/web exec tsc` shows pre-existing errors from the FX001/FX002 work that don't appear at the workspace-root level — they're build-mode artifacts in `.next/standalone`.)

**Discovery**: Initial typecheck of `apps/web` failed with `Property 'onMutation' does not exist on type 'IWorkspaceService'`. Root cause: stale `.d.ts` files for the workflow package. Running `pnpm --filter @chainglass/workflow build` refreshed the declarations and resolved the error.

---

## T005 — Unit test: WorkspaceService emitter contract

**File created**: `test/unit/workflow/workspace-service-mutation-emitter.test.ts`

**Test count**: 17 tests, all passing.

**Coverage**:
- 3 tests: `add()` — emits on success, no-emit on duplicate, no-emit on validation failure
- 2 tests: `remove()` — emits on success, no-emit on not-found
- 3 tests: `updatePreferences()` — emits on success, no-emit on validation failure, no-emit on not-found
- 3 tests: `createWorktree()` — emits on success, no-emit on blocked (dirty main), no-emit on blocked (workspace not found)
- 2 tests: listener-error isolation — throwing listener does NOT cause mutation rejection
- 3 tests: unsubscribe — works, idempotent, multiple subscribers all receive
- 1 test: `setImmediate` ordering — caller's `await` resolves BEFORE listener fires

**Setup**: Mirrors `test/unit/workflow/workspace-service.test.ts` verbatim — real `EventEmitter`, real `WorkspaceService`, real fakes (`FakeWorkspaceRegistryAdapter`, `FakeGitWorktreeManager`, etc.). Per-instance emitter means no `globalThis` cleanup needed.

**Discovery**: First run failed on the `worktree:created` `worktreePath` assertion — I had hard-coded `/home/user/069-my-feature` but `WorkspaceService.executeCreate` allocates the ordinal itself based on existing branches/plan folders (none in test → starts at 001). Fixed by asserting equality with `result.worktreePath` from the service's return value, plus a regex match `/\/home\/user\/\d{3}-my-feature$/`.

---

## T006 — Unit test: subscription wire-up + HMR safety

**File created**: `test/unit/web/027-central-notify-events/start-central-notifications-mutation-listener.test.ts`

**Test count**: 6 tests, all passing.

**Coverage**:
- Listener attached after first call (1 listener registered)
- Firing a mutation triggers `watcher.rescan()` exactly once
- HMR regression: 2nd call detaches prior listener and re-attaches (count remains 1)
- HMR regression: 5 successive calls keep listener count at 1
- `rescan()` rejection is caught (does not crash listener path)
- The unsubscribe stored on globalThis works (listener count drops to 0)

**Pattern**: `vi.mock('.../bootstrap-singleton')` returns a fake `getContainer()` that resolves IWorkspaceService → real EventEmitter-backed fake, ICentralWatcherService → call-counting fake. `vi.hoisted` for the references that the mock factory needs at hoist time. Real fakes constructed in `beforeEach` because `EventEmitter` import isn't available in `vi.hoisted` block context.

**Discovery**: Initial run failed with `Cannot access '__vi_import_0__' before initialization`. Root cause: `vi.hoisted(() => makeFakeService())` tried to call a function that uses imported `EventEmitter`, but `vi.hoisted` runs before imports. Fixed by hoisting only the mutable holder objects (`{ current: null }`) and constructing the fakes in `beforeEach`.

---

## T007 — Integration test: real fs + temp dir

**File created**: `test/integration/workflow/features/023/rescan-on-workspace-mutation.integration.test.ts`

**Test count**: 6 tests, all passing.

**Coverage**:
- AC-1: `service.createWorktree()` → new path watched within ~1s
- AC-2: registering a workspace with pre-existing worktrees → all 3 watched
- AC-3: 2nd, 3rd workspace registration in succession → all 3 watched (atomic-rename regression via emit path)
- AC-4: deleting a worktree dir + triggering an unrelated mutation → watcher closed via rescan diff
- AC-6: out-of-band registry edit (atomic-rename write to temp registry path) → rescan within ~3s
- Coalescing: 5 rapid mutations → fewer than 25 detectWorktrees calls (vs 25 if no coalescing)

**Setup**: Real `CentralWatcherService`, real `NativeFileWatcherFactory`, real `WorkspaceService` with the production mutation emitter, fakes for registry/resolver/git-manager/context. Mutation listener wired manually in `buildHarness()` mirroring `start-central-notifications.ts`. Polling helper `waitFor(predicate, { timeoutMs: 5000, intervalMs: 50 })` for assertions — no fixed sleeps.

**Test seam choice**: `FakeGitWorktreeManager` (existing fake, no subprocess). Worktree directories pre-staged on disk via `mkdir -p {tempDir}/{branchName}/.chainglass/data` so the watcher's `createWatcherForWorktree` finds them.

---

## T008 — Domain.md updates + just fft

**Files touched**:
- `docs/domains/workspace/domain.md` — Composition (added EventEmitter to WorkspaceService row), Contracts (added `WorkspaceMutationEvent` row + extended `IWorkspaceService` description), Source Location (added test path), History (added 2026-04-26 row)
- `docs/domains/_platform/events/domain.md` — Composition (added Workspace mutation listener row + extended startCentralNotificationSystem description), Source Location (added 2 test paths), Concepts (added "React to Workspace Mutations"), Dependencies (added `workspace` to "Depends On"), History (added 2026-04-26 row)

**Quality gate**: `just fft`
- ✅ lint: clean (after Biome auto-fix for import ordering on the 3 new test files)
- ✅ format: clean
- ✅ build: clean
- ✅ typecheck: clean
- ✅ test: 5958 pass, 80 skipped, 0 failed (419 test files passed, 10 skipped, 429 total)
- ⚠️ security-audit: 16 vulnerabilities (14 moderate, 2 high) — same count as the FX002 baseline (commit `c96cba1e`); no new vulns introduced (this work added zero dependencies)

---

## Discoveries Table

| # | Discovery | Resolution |
|---|-----------|-----------|
| 1 | `WorkspaceService.remove()` has only the slug, not the path. To emit `workspace:removed` with a `path` field symmetric to `workspace:added`, need to load the workspace before removing. | Best-effort `try { load(slug) } catch {}` to capture path; falls through to `remove()` which reports the actual not-found error. Tradeoff: one extra registry read per remove, but keeps the event shape consistent. |
| 2 | After T001 added `onMutation` to `IWorkspaceService`, the web app's per-package typecheck failed with stale `.d.ts`. The workspace-root `pnpm tsc --noEmit` was fine. | Ran `pnpm --filter @chainglass/workflow build` to refresh `.d.ts` declarations. The discrepancy between `pnpm tsc --noEmit` (workspace-root) and `pnpm --filter <pkg> exec tsc --noEmit` (per-package) is worth knowing: just fft uses the workspace-root variant. |
| 3 | `vi.hoisted(() => makeFake())` failed because the factory used `EventEmitter` from a normal import. `vi.hoisted` runs before imports. | Hoist only mutable holder objects (`{ current: null }`); construct fakes in `beforeEach` after imports are available. |
| 4 | Initial T005 worktreePath assertion was hardcoded to `/home/user/069-my-feature`. `WorkspaceService.executeCreate` allocates the ordinal itself based on existing branches and plan folders. With empty fakes, ordinal starts at 001. | Asserted equality with `result.worktreePath` (the service's actual return) plus a regex pattern match. The service's logic, not the fake's `setCreateResult`, owns the path computation. |
| 5 | Existing `central-watcher.service.test.ts` had 2 tests asserting the registry watcher's watched paths included `REGISTRY_PATH`. After T004, the watcher watches the parent dir. | Updated 2 assertions to use new `REGISTRY_DIR` constant. The simulateChange tests still pass because they pass `REGISTRY_PATH` as the path argument to the change handler, which the filter accepts. |
| 6 | Harness was degraded (app/mcp/terminal/cdp all `down` per `just harness health` at session start). | Plan's testing approach is unit + integration with real fs (no harness dependency). Standard testing proceeded; harness manual smoke can be done post-implementation if/when the harness comes back up. |

---

## Suggested Commit Message

```
084: Live file monitoring after workspace/worktree changes

When a user creates a worktree or registers a new workspace, file
monitoring now activates within ~1s without a dev server restart.

Root causes fixed:
1. WorkspaceService never notified the watcher → added an internal
   EventEmitter-backed mutation channel emitting on all 4 success exits
   (add/remove/updatePreferences/createWorktree), deferred via
   setImmediate so caller's await resolves before listener fires.
2. fs.watch on a single registry file went stale after the first
   atomic-rename write (the inode was unlinked) → switched the registry
   watcher to the parent directory with an absolute-path filter.

HMR-safe wire-up: start-central-notifications.ts uses an unconditional
attachMutationListener() helper called before the __centralNotificationsStarted
flag guard, with detach-then-resubscribe semantics on globalThis. Caught
by validate-v2 as a CRITICAL trap before implementation.

- T001: WorkspaceMutationEvent discriminated union + IWorkspaceService.onMutation
- T002: WorkspaceService EventEmitter + emit at 4 success exits
- T003: start-central-notifications.ts subscription with HMR safety
- T004: Registry watcher → parent-dir + exact-path filter
- T005-T007: 29 new tests (17 unit + 6 unit + 6 integration with real fs)
- T008: domain.md updates for workspace + _platform/events

No frontend changes — file-changes SSE channel is global; client-side
filter handles new paths automatically.

Tests: 5958 pass (+29 new), 0 failures, 80 skipped. Lint+format+build+
typecheck clean. security-audit baseline unchanged from FX002 (16 pre-
existing vulnerabilities; this work added zero dependencies).
```

