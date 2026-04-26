# Live File Monitoring After Workspace & Worktree Changes — Implementation Plan

**Mode**: Simple
**Plan Version**: 1.0.0
**Created**: 2026-04-26
**Spec**: [live-monitoring-rescan-spec.md](./live-monitoring-rescan-spec.md)
**Workshop**: [workshops/003-watcher-rescan-on-workspace-changes.md](./workshops/003-watcher-rescan-on-workspace-changes.md) — authoritative design
**Status**: COMPLETE — all 8 tasks landed; tests + lint + typecheck + build clean. Security-audit baseline unchanged (16 pre-existing vulns from FX002 — no new).

---

## Summary

When a user creates a worktree or registers a workspace, the dev server's file watcher never finds out — `WorkspaceService` returns success without notifying `CentralWatcherService`, and the registry-file watcher (the one signal that *should* fire) goes stale after the first atomic-rename write because `fs.watch` is bound to the inode. This plan fixes both: (1) `WorkspaceService` gains a small `EventEmitter`-backed mutation channel; `start-central-notifications.ts` subscribes and triggers `rescan()`; (2) the registry watcher switches from a single-file watch to a parent-directory watch with a path filter, so atomic renames are detected reliably. No frontend work — the SSE `file-changes` channel is already global and filters per-worktree client-side.

## Target Domains

| Domain | Status | Relationship | Role |
|--------|--------|-------------|------|
| `workspace` | existing | **modify** | Add internal mutation event channel to `WorkspaceService`; emit at all 4 success exits |
| `_platform/events` | existing | **modify** | `CentralWatcherService` registry watcher hardened (parent-dir + filter); `start-central-notifications.ts` subscribes to mutation events |
| `file-browser` | existing | **consume** | No code changes; verified via integration + manual smoke that `useFileChanges` picks up new worktrees |

## Domain Manifest

| File | Domain | Classification | Rationale |
|------|--------|---------------|-----------|
| `/Users/jordanknight/substrate/084-random-enhancements-3/packages/workflow/src/interfaces/workspace-service.interface.ts` | workspace | `internal` (interface-internal) | Add `WorkspaceMutationEvent` type + `onMutation()` method to `IWorkspaceService` |
| `/Users/jordanknight/substrate/084-random-enhancements-3/packages/workflow/src/services/workspace.service.ts` | workspace | `internal` | Implement `EventEmitter` + emit at 4 success exits |
| `/Users/jordanknight/substrate/084-random-enhancements-3/apps/web/src/features/027-central-notify-events/start-central-notifications.ts` | _platform/events | `internal` | Subscribe to `WorkspaceService.onMutation` → call `watcher.rescan()`; pin unsubscribe to `globalThis` |
| `/Users/jordanknight/substrate/084-random-enhancements-3/packages/workflow/src/features/023-central-watcher-notifications/central-watcher.service.ts` | _platform/events | `internal` | Replace single-file registry watch with parent-dir watch + path filter |
| `/Users/jordanknight/substrate/084-random-enhancements-3/test/unit/workflow/workspace-service-mutation-emitter.test.ts` | workspace | `internal` (test) | New: emitter contract — emit on success, no emit on blocked, listener errors don't propagate |
| `/Users/jordanknight/substrate/084-random-enhancements-3/test/unit/web/027-central-notify-events/start-central-notifications-mutation-listener.test.ts` | _platform/events | `internal` (test) | New: mutation event triggers `rescan()` on the watcher (no `features/` segment per existing test/unit/web layout) |
| `/Users/jordanknight/substrate/084-random-enhancements-3/test/integration/workflow/features/023/rescan-on-workspace-mutation.integration.test.ts` | _platform/events | `internal` (test) | New: real fs + temp dir; assert watchers grow on register-workspace, register-second-workspace (atomic-rename regression), create-worktree |
| `/Users/jordanknight/substrate/084-random-enhancements-3/docs/domains/workspace/domain.md` | workspace | `internal` (docs) | Source Location + Composition + History entries |
| `/Users/jordanknight/substrate/084-random-enhancements-3/docs/domains/_platform/events/domain.md` | _platform/events | `internal` (docs) | Source Location + Composition + History entries |

No public contracts change at the cross-domain boundary; the new emitter is package-internal until a second consumer appears (per spec § Open Questions Q2).

## Key Findings

| # | Impact | Finding | Action |
|---|--------|---------|--------|
| 01 | Critical | All workspace/worktree mutations route through `WorkspaceService` (grep audit: `registryAdapter.save\|remove\|update` and `gitManager.createWorktree` produce 4 hits, all in `workspace.service.ts:95, 124, 295, 470`). No bypass paths exist. | T002 emits at all 4 success points and that's the complete coverage. No defensive code for bypassed callers needed. |
| 02 | Critical | The registry-file watcher dies after one atomic-rename write — `WorkspaceRegistryAdapter.writeRegistry` (workspace-registry.adapter.ts:336-338) uses `writeFile(.tmp)` + `rename(.tmp, target)`, replacing the inode. `NativeFileWatcherAdapter` is `fs.watch`-based (inode-bound). | T004 replaces single-file watch with parent-directory watch + path filter. Defense in depth, but also fixes the second-registration failure mode. |
| 03 | High | The SSE `file-changes` channel is global. `MultiplexedSSEProvider` bakes `channels` into the URL at mount (multiplexed-sse-provider.tsx:74-75); `FileChangeProvider` filters client-side by `worktreePath` (file-change-provider.tsx:54-55). | No frontend changes. Confirmed in spec § Resolved Q3. AC-1/AC-2/AC-3 verifiable purely by triggering server-side rescans. |
| 04 | High | HMR survival pattern is proven in this codebase: `__centralNotificationsStarted` (start-central-notifications.ts:28) and `__FLOWSPACE_MCP_POOL__` (FlowSpace work). **Trap (caught by validate-v2 Agents 2 & 3)**: the existing function early-returns on the flag (line ~49: `if (globalThis.__centralNotificationsStarted) return;`), so naively splicing the listener subscription *after* that guard means HMR re-calls would skip re-subscribing — leaving the listener on a dead `WorkspaceService` instance. | T003 extracts an `attachMutationListener()` helper that runs *unconditionally* at the top of the function: it (a) calls and clears any prior `globalThis.__watcherMutationUnsubscribe__`, (b) re-resolves `IWorkspaceService` from DI, (c) subscribes and stores the new unsubscribe on `globalThis`. Only the rest of the wire-up (adapters, `watcher.start()`) is gated by the flag. T006 (d) regression-tests this by re-calling `startCentralNotificationSystem` and asserting the listener count remains 1. |
| 05 | Medium | `WorkspaceService` has no `removeWorktree` method today — grep confirms zero callers. AC-4 (worktree removal closes watcher) is satisfied by the existing rescan diff (`performRescan` at central-watcher.service.ts:401-414 closes watchers for absent paths) when the next deliberate mutation triggers a rescan. | The `WorkspaceMutationEvent` discriminated union includes `'worktree:removed'` for forward compatibility, but no emit point is wired today. AC-4 verified in integration test by deleting a worktree on disk + triggering an unrelated mutation + asserting watcher set shrinks. |
| 06 | Medium | `start-central-notifications.ts` is idempotent and runs once per server lifetime via `globalThis.__centralNotificationsStarted`. Steps 4-5 in that file are the natural splice point for the new subscription. | T003 inserts the subscription between step 4 (adapter wiring) and step 5 (`watcher.start()`), so the listener is active before any rescans are possible. |

## Constitution Gate

Constitution at `docs/project-rules/constitution.md` — no principles violated. The change is purely additive (new event channel, hardened registry watch); no contract breaks, no domain creation, no architectural shift.

## Architecture Gate

Architecture at `docs/project-rules/architecture.md` — no layer-boundary violations. `WorkspaceService` (in `workspace` domain) emits an event; `start-central-notifications.ts` (in `_platform/events`) subscribes. This is a *consume* relationship from `_platform/events` to `workspace`, which is permitted (events depends on workspace for boot-time enumeration already — line 47-50 of start-central-notifications.ts). No new circular dependency.

## Harness Strategy

- **Current Maturity**: L3 (per `docs/project-rules/harness.md`)
- **Target Maturity**: L3 (no harness changes)
- **Boot Command**: `just harness dev`
- **Health Check**: `just harness health`
- **Interaction Model**: Browser via Playwright/CDP + CLI SDK
- **Evidence Capture**: Structured JSON responses + screenshots
- **Pre-Phase Validation**: Required at start of implementation (Boot → Interact → Observe). Use harness to verify AC-1, AC-2, AC-3 manually post-implementation by booting the app, registering workspaces via the UI, and asserting file-changes events appear without restart.

---

## Implementation

**Objective**: Make `CentralWatcherService` rescan automatically after every successful workspace/worktree mutation, and harden the registry watcher against atomic-rename writes — no dev-server restart needed for live file monitoring on new directories.

**Testing Approach**: **Lightweight + Integration**.
- Unit tests cover the emitter contract (pure JS, real `EventEmitter`, no fs).
- Unit test covers the subscription wire (fake `CentralWatcherService` recording `rescan()` calls).
- Integration test covers the end-to-end behavior with **real `fs.watch`** in a temp directory — exercises atomic-rename detection and worktree-dir creation. No mocks of `fs.watch`. No mocks of registry writes. No mocks of git (uses pre-created bare worktree directories — see T007 Notes).

### Tasks

| Status | ID | Task | Domain | Path(s) | Done When | Notes |
|--------|-----|------|--------|---------|-----------|-------|
| [x] | T001 | Add `WorkspaceMutationEvent` discriminated union + `onMutation(listener)` signature to `IWorkspaceService` interface | workspace | `/Users/jordanknight/substrate/084-random-enhancements-3/packages/workflow/src/interfaces/workspace-service.interface.ts` | (a) Type compiles. (b) `WorkspaceMutationEvent` is exported as a discriminated union with these exact variants: `{ kind: 'workspace:added'; slug: string; path: string }`, `{ kind: 'workspace:updated'; slug: string; path: string }`, `{ kind: 'workspace:removed'; slug: string; path: string }`, `{ kind: 'worktree:created'; workspaceSlug: string; worktreePath: string }`, `{ kind: 'worktree:removed'; workspaceSlug: string; worktreePath: string }` (per Workshop § Interface Contract verbatim). (c) `IWorkspaceService.onMutation(listener: (event: WorkspaceMutationEvent) => void): () => void` added to the interface at line 167+. (d) The returned unsubscribe is **idempotent** — calling it multiple times is safe and a no-op after the first call. | Per Workshop § Interface Contract. `worktree:removed` defined now for forward-compat — see Finding 05. T002 will NOT emit `worktree:removed` today (no `removeWorktree` mutation method exists). |
| [x] | T002 | Implement `EventEmitter` + emit at all 4 mutation success exits in `WorkspaceService` | workspace | `/Users/jordanknight/substrate/084-random-enhancements-3/packages/workflow/src/services/workspace.service.ts` | (a) Class holds a single private `EventEmitter`; (b) `onMutation()` registers/unregisters listeners (returned unsubscribe is idempotent — see T001); (c) emits via `setImmediate(() => emitter.emit('mutation', event))` so the caller's `await mutation()` resolves **before** the listener fires (per Workshop); (d) listener throws are caught + logged inside the `setImmediate` body, never propagate; (e) emit immediately before each of these exact return statements: `add()` success — **line 110** (`return { success: true, workspace, errors: [] };`); `remove()` success — **line 133** (`return { success: true, removedSlug: slug, errors: [] };`); `updatePreferences()` success — **line 310** (`return { success: true, errors: [] };`); `executeCreate()` success — **line 520+** (the `status: 'created'` return); (f) **NO emit** on any failure / `blocked` path; (g) **NO emit** of `worktree:removed` today — `removeWorktree` mutation method does not exist; the kind is reserved in T001 for forward-compat only; (h) **Caller-contract note** (intentional design, per Workshop): with `setImmediate`, every existing caller (e.g., `apps/web/app/actions/workspace-actions.ts:665`) will see the action resolve **before** the watcher rescan completes. This is correct: listener errors must never break the user's mutation, and the rescan itself is fast (~100ms). T007 verifies the rescan latency window is acceptable. | Per Findings 01, 06. Tests (T005) verify emit-on-success, no-emit-on-blocked, listener-error isolation. Spec AC-7. |
| [x] | T003 | Subscribe to `workspaceService.onMutation` in `start-central-notifications.ts`; pin unsubscribe to `globalThis.__watcherMutationUnsubscribe__` with HMR-safe detach-then-resubscribe | _platform/events | `/Users/jordanknight/substrate/084-random-enhancements-3/apps/web/src/features/027-central-notify-events/start-central-notifications.ts` | **Refactor required (per Finding 04 trap caught by validate-v2):** the existing function early-returns on the `__centralNotificationsStarted` flag (line ~49), so listener wiring placed *after* that guard would be skipped on HMR. Implementation must follow this exact shape: (a) Add `declare global { var __watcherMutationUnsubscribe__: (() => void) \| undefined; }` next to the existing `__centralNotificationsStarted` declaration (line 28). (b) Extract a helper `function attachMutationListener(): void` that: (1) calls `globalThis.__watcherMutationUnsubscribe__?.()` and clears it; (2) resolves `IWorkspaceService` from `getContainer()` using `WORKSPACE_DI_TOKENS.WORKSPACE_SERVICE`; (3) resolves `ICentralWatcherService` similarly; (4) calls `globalThis.__watcherMutationUnsubscribe__ = workspaceService.onMutation((event) => { watcher.rescan().catch((err) => console.error('[central-notifications] rescan failed', err)); });`; (5) logs `[central-notifications] mutation listener attached`. (c) Call `attachMutationListener()` as the **first statement** inside `startCentralNotificationSystem()`, **before** the `__centralNotificationsStarted` guard — so detach-then-resubscribe runs unconditionally on every call, including HMR re-runs. (d) Leave the rest of the function (steps 1-5) gated by the existing flag. (e) Listener function uses the in-scope `watcher` reference resolved fresh inside `attachMutationListener` so it always points at the current DI instance. | Per Finding 04, 06. Spec AC-5. T006 (d) regression-tests this. The unconditional-attach pattern is the design fix. |
| [x] | T004 | Replace single-file registry watch with parent-directory watch + path filter in `CentralWatcherService.start()` | _platform/events | `/Users/jordanknight/substrate/084-random-enhancements-3/packages/workflow/src/features/023-central-watcher-notifications/central-watcher.service.ts` | **Splice point**: line 110 (`this.registryWatcher.add(this.registryPath);`). Implementation: (a) `import { dirname } from 'node:path';` at the top of the file; (b) Replace line 110 with `this.registryWatcher.add(dirname(this.registryPath));` (watch the parent directory `~/.config/chainglass/`); (c) Add an `add` event handler in addition to the existing `change` handler — atomic rename can land as either, depending on whether the inode existed prior; (d) Both handlers filter by **absolute-path equality**: `if (typeof path === 'string' && path === this.registryPath) { this.rescan().catch(...) }` — `NativeFileWatcherAdapter` always emits absolute paths (verified at native-file-watcher.adapter.ts via `resolve(watchPath)` in `add()`), so no normalization needed; (e) Preserve the existing `{ ignoreInitial: true, atomic: true, awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 100 } }` options — these debounce mid-rename `.tmp` events; (f) Rely on existing `isRescanning` / `rescanQueued` coalescing (central-watcher.service.ts:165-187) for any residual bursts; (g) Edge case: if a stale `.tmp` is left behind after a failed rename, the path filter rejects it (filter is exact-match, not prefix). | Per Finding 02. Spec AC-3, AC-6. T007 (c) is the regression test for the second-registration atomic-rename failure. |
| [x] | T005 | Unit test — `WorkspaceService` emitter contract | workspace | `/Users/jordanknight/substrate/084-random-enhancements-3/test/unit/workflow/workspace-service-mutation-emitter.test.ts` (new) | Tests pass: (a) `add()` success emits `{ kind: 'workspace:added', slug, path }`; (b) `add()` failure (duplicate slug) does NOT emit; (c) `remove()` success emits `workspace:removed`; (d) `updatePreferences()` success emits `workspace:updated`; (e) `createWorktree()` success emits `worktree:created` with `worktreePath`; (f) `createWorktree()` returning `blocked` does NOT emit; (g) Throwing listener does NOT propagate — assert by registering a throwing listener, then awaiting a successful mutation, then asserting the mutation result is still success (no rejected promise); (h) `onMutation()` returns a working unsubscribe — assert by subscribing, unsubscribing, then triggering a mutation and asserting the listener was NOT called; (i) Unsubscribe is idempotent — calling it twice does not throw or double-detach; (j) `setImmediate` ordering — emit fires in the next tick, not synchronously: assert via `await new Promise(setImmediate)` between the mutation `await` and the listener-called assertion. | Real `EventEmitter`, real `WorkspaceService` with fake adapters (`FakeWorkspaceRegistryAdapter`, `FakeGitWorktreeManager`, `FakeGitWorktreeResolver`, `FakeWorkspaceContextResolver`, `WorktreeBootstrapRunner` with fake fs/pm). Mirrors `test/unit/workflow/workspace-service.test.ts:13-48` setup verbatim. **No `globalThis` cleanup needed** — T005 instantiates fresh `WorkspaceService` per test (per-instance EventEmitter), so listeners are scoped to the test. |
| [x] | T006 | Unit test — `start-central-notifications.ts` subscription wires mutation → `rescan()` | _platform/events | `/Users/jordanknight/substrate/084-random-enhancements-3/test/unit/web/027-central-notify-events/start-central-notifications-mutation-listener.test.ts` (new) | Tests pass: (a) Boot wires the subscription — after `startCentralNotificationSystem()` resolves, the fake `IWorkspaceService` reports exactly one mutation listener registered; (b) Firing a mutation event on the fake service causes `watcher.rescan()` to be called exactly once; (c) `globalThis.__watcherMutationUnsubscribe__` is set to a function (`typeof === 'function'`); (d) **HMR regression test (Finding 04 trap)**: reset `__centralNotificationsStarted = false` is **NOT** required — the test instead calls `startCentralNotificationSystem()` a second time without resetting that flag, then asserts the listener was detached and re-attached (one listener registered, not two). This proves the `attachMutationListener()` helper runs unconditionally as required by T003 (c); (e) Failure path: a `rescan()` rejection is caught and logged, not propagated. | **Test isolation** (per validate-v2 finding): `beforeEach` resets `globalThis.__centralNotificationsStarted = undefined` and calls `globalThis.__watcherMutationUnsubscribe__?.()` then sets it to `undefined`. `afterEach` does the same to leave a clean state for the next test. Use a fake `IWorkspaceService` backed by a real `EventEmitter` (so `onMutation` returns a real unsubscribe), and a fake `ICentralWatcherService` recording `rescan()` calls (counter array). The DI container is mocked via the existing `getContainer` test pattern — register fakes for both `WORKSPACE_SERVICE` and `CENTRAL_WATCHER_SERVICE` tokens. |
| [x] | T007 | Integration test — end-to-end with real fs + temp dir | _platform/events | `/Users/jordanknight/substrate/084-random-enhancements-3/test/integration/workflow/features/023/rescan-on-workspace-mutation.integration.test.ts` (new) | Tests pass: (a) **Spec AC-1**: register a workspace via `service.add(...)`, then call `service.createWorktree()` → poll `centralWatcher` for the new worktree path with 5s ceiling / 50ms interval; assert it appears within 1s typical (allow up to 2s for slow CI). (b) **Spec AC-2**: register a workspace whose dir on disk already contains worktrees (pre-staged) → poll for all to be watched within 1s typical. (c) **Spec AC-3 — atomic-rename regression**: register a *second* workspace after the first → assert it is also watched within 1s. This is the regression test for the pre-fix stale-inode bug. (d) **Spec AC-6 — out-of-band edit**: directly call `registryAdapter.save(...)` from the test, bypassing the emit path, and assert the parent-dir watcher fires a rescan within 3s. (e) **Spec AC-4 — worktree removal via rescan diff**: delete a worktree directory on disk via `rm -rf`, trigger an unrelated mutation (e.g., `service.add(another)`), and assert the corresponding watcher is removed from `centralWatcher.dataWatchers`. (f) **Coalescing under burst** (per validate-v2 Agent 2): emit 5 mutations in rapid succession via `Promise.all([service.add(a), service.add(b), service.add(c), service.add(d), service.add(e)])` → instrument `performRescan` (via a wrapping spy or `centralWatcher` internal counter exposure for tests) and assert it was called **at most 2 times** (initial + one queued drain). | **Test seam — use existing `FakeGitWorktreeManager`** at `/Users/jordanknight/substrate/084-random-enhancements-3/packages/workflow/src/fakes/fake-git-worktree-manager.ts:91` (already used by `test/unit/workflow/workspace-service.test.ts:18-22, 37`). It implements `IGitWorktreeManager` and creates the worktree directory directly without invoking real `git` — avoids subprocess overhead, is deterministic, and exercises `WorkspaceService.executeCreate` honestly. **Real components**: `WorkspaceService`, `WorkspaceRegistryAdapter` (writes real atomic-rename to temp config dir), `CentralWatcherService`, `NativeFileWatcherAdapter` (real `fs.watch`). **Temp setup**: `mkdtempSync(join(tmpdir(), 'live-mon-'))` for both the registry config dir and workspace path. **Polling pattern**: helper `waitFor(cond, { timeout: 5000, interval: 50 })` returning when `cond()` truthy or rejecting. **No fixed sleeps.** Pattern reference: `/Users/jordanknight/substrate/084-random-enhancements-3/test/integration/workflow/features/023/central-watcher.integration.test.ts`. |
| [x] | T008 | Update domain.md files + run quality gates | workspace, _platform/events | `/Users/jordanknight/substrate/084-random-enhancements-3/docs/domains/workspace/domain.md`, `/Users/jordanknight/substrate/084-random-enhancements-3/docs/domains/_platform/events/domain.md` | **`workspace/domain.md`**: (a) § Source Location: add row for `test/unit/workflow/workspace-service-mutation-emitter.test.ts`. (b) § Composition: extend the existing `WorkspaceService` row with a note "+ EventEmitter-backed `onMutation` channel (Plan 084 — live-monitoring-rescan)" or add a sibling row "Mutation event channel — internal emitter on WorkspaceService, emits on add/remove/updatePreferences/createWorktree success." (c) § Concepts: add a new concept entry titled **"Observe workspace mutations"** — entry point: `IWorkspaceService.onMutation()` — narrative: "Subscribers (currently `_platform/events` central watcher) receive a `WorkspaceMutationEvent` after every successful workspace/worktree mutation. Used to trigger rescans and cache invalidation. Listener errors are isolated via `setImmediate`." Code example showing `service.onMutation(handler)` returning unsubscribe. (d) § History: add row "Plan 084 (live-monitoring-rescan): Internal mutation event channel added to WorkspaceService. — 2026-04-26". **`_platform/events/domain.md`**: (e) § Source Location: confirm existing rows for `central-watcher.service.ts` and `start-central-notifications.ts` are still accurate (no path changes); add row for new test `test/unit/web/027-central-notify-events/start-central-notifications-mutation-listener.test.ts` and `test/integration/workflow/features/023/rescan-on-workspace-mutation.integration.test.ts`. (f) § Composition: add a row or note "Workspace mutation listener (in `start-central-notifications.ts`) — wires `IWorkspaceService.onMutation` → `ICentralWatcherService.rescan()`; HMR-safe via `globalThis.__watcherMutationUnsubscribe__`." (g) § Concepts: extend the existing rescan-related concept (or add) "**React to workspace mutations**" — narrative on the wire-up. (h) § History: add row "Plan 084 (live-monitoring-rescan): Mutation-driven rescan signal + parent-dir registry watcher hardening. — 2026-04-26". **Quality gates**: (i) `just fft` passes: lint + format + typecheck + build + all tests (no new failures); (j) Pre-existing security-audit failures (16 from FX002 baseline) confirmed unchanged via `git stash` + audit-on-baseline pattern, no new vulns introduced. | Final task. Per the FX002 commit pattern: don't expand security-audit scope — only ensure no NEW vulns. |

### Acceptance Criteria

- [ ] **AC-1** (Spec): Creating a worktree via the UI causes file events for that worktree to flow within 1s without server restart — verified in T007 (a) + harness manual smoke
- [ ] **AC-2** (Spec): Registering a new workspace causes file events for all its worktrees to flow within 1s without server restart — verified in T007 (b) + harness manual smoke
- [ ] **AC-3** (Spec): Second/third/fourth workspace registration in succession all activate watching (atomic-rename regression test) — verified in T007 (c) + harness manual smoke
- [ ] **AC-4** (Spec): Removing a worktree directory closes the corresponding watcher — verified in T007 (e)
- [ ] **AC-5** (Spec): HMR-friendly; listener does not leak across HMR cycles — verified in T006 (d)
- [ ] **AC-6** (Spec): Out-of-band registry edit triggers rescan within ~3s — verified in T007 (d)
- [ ] **AC-7** (Spec): A throwing listener does not break the workspace/worktree creation operation — verified in T005 (g)
- [ ] **AC-8** (Spec): At least one unit test for emitter contract + at least one integration test with real fs — satisfied by T005 + T007
- [ ] **No regression**: All existing tests under `test/unit/workflow/`, `test/integration/workflow/features/023/`, and `test/integration/045-live-file-events/` continue to pass — verified by `just fft`
- [ ] **Lint + typecheck + build clean** — verified by `just fft`

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| **HMR-idempotency trap**: existing `if (globalThis.__centralNotificationsStarted) return;` short-circuits T003 if listener subscription is placed *after* the guard — listener never re-attaches on HMR, attached to dead `WorkspaceService` instance | Medium (would happen on first HMR cycle if naively spliced) | Silent feature failure post-HMR until manual restart | T003 mandates the `attachMutationListener()` helper run **unconditionally as the first statement** of `startCentralNotificationSystem`, *before* the flag guard. T006 (d) regression-tests by re-calling the function without resetting the flag and asserting one — not two — listener registrations. |
| Parent-dir registry watch fires on `.tmp` files mid-rename | High frequency, low impact | Spurious rescans (cheap; coalesced) | Path filter (exact equality with `this.registryPath`) inside event handler. Existing `awaitWriteFinish` debounces; `isRescanning`/`rescanQueued` (lines 165-187) coalesces. |
| Integration test flakes on slow CI due to fs.watch event timing | Medium | Test flakes blocking PRs | T007 uses polling-with-timeout via `waitFor(cond, { timeout: 5000, interval: 50 })` helper — **no fixed `setTimeout` sleeps**. |
| `setImmediate`-based emit decouples from caller, but caller's `await` resolves *before* the listener fires | Acknowledged design choice | The user is redirected to a new worktree before the watcher has rescanned | Rescan latency is ~100ms; first user interaction is navigation, not file write. Documented in T002 (h). T007 (a) measures and asserts the latency window stays under ~1s on real fs. |
| Race: a file is written to a new worktree *before* rescan completes | Low | Single missed event | Acceptable per spec § Risks A1. Typical user flow is "create worktree" → "navigate" → "interact", which gives rescan ~100ms head start. |
| `FakeGitWorktreeManager` doesn't exercise real `git worktree add` semantics | Low | T007 doesn't catch a regression in real git operations | Out of scope — git semantics are tested by `GitWorktreeManagerAdapter` contract tests at `test/contracts/git-worktree-manager.contract.test.ts`. T007 tests the *emit-and-rescan signal path*, not git correctness. The `FakeGitWorktreeManager` honestly exercises `executeCreate` (the emit point). |
| Listener-leak across test files due to shared `globalThis` state | Medium | Inter-test pollution → flaky tests | T006 explicitly resets `globalThis.__centralNotificationsStarted` and `globalThis.__watcherMutationUnsubscribe__` in both `beforeEach` and `afterEach`. T005 doesn't touch `globalThis` (per-instance EventEmitter). |
| Existing pre-existing security-audit failures (16 from FX002) cause `just fft` to fail | Confirmed (already happens) | None — not introduced by this work | Run `just fft` and confirm count is unchanged from `e98d0fe5` baseline (per FX002 precedent). |

---

## Files NOT Modified (verified)

- `apps/web/src/features/045-live-file-events/file-change-provider.tsx` — no changes; client-side filter already handles new paths
- `apps/web/src/lib/sse/multiplexed-sse-provider.tsx` — no changes; channel `file-changes` is global
- `packages/workflow/src/adapters/native-file-watcher.adapter.ts` — no changes; bug is at the *caller* (single-file `add()`), not the adapter
- `packages/workflow/src/adapters/workspace-registry.adapter.ts` — no changes; atomic-rename pattern is correct for write durability, the watcher must adapt
- `apps/web/app/actions/workspace-actions.ts` — no changes; emit happens inside the service it calls

---

## Plan Validation Checklist

- [x] All phases (one) have task tables
- [x] Each task has Status, ID, Task, Domain, Path(s), Done When, Notes
- [x] Domain manifest covers all production + test files
- [x] Target domains from spec are all addressed (`workspace`, `_platform/events`, `file-browser`)
- [x] Key findings reference affected tasks (Finding 01 → T002; 02 → T004; 03 → no FE; 04 → T003; 05 → T007 (e); 06 → T003)
- [x] No time language present (CS only)
- [x] Absolute paths used throughout
- [x] Spec acceptance criteria mapped to tasks (AC-1..AC-8)

---

## Suggested Commit Message Template (post-implementation)

```
084: Live file monitoring rescan after workspace/worktree changes

Adds a mutation event channel to WorkspaceService and subscribes
CentralWatcherService to trigger rescan(). Hardens the registry
watcher against atomic-rename writes by switching from a single-
file watch to a parent-directory watch with a path filter.

Symptom: creating a new worktree, or registering a second workspace,
silently broke live file monitoring until a dev server restart.
Root cause: (1) WorkspaceService never notified the watcher, and
(2) fs.watch on a single file is bound to the inode, which the
atomic-rename writeRegistry() unlinks after the first write.

- T001: WorkspaceMutationEvent discriminated union + IWorkspaceService.onMutation
- T002: WorkspaceService EventEmitter + emit at 4 success exits
- T003: start-central-notifications.ts subscribes; HMR-safe via globalThis
- T004: CentralWatcherService registry watch on parent dir + path filter
- T005-T007: unit (emitter, subscription) + integration (real fs)
- T008: domain.md updates

No frontend changes — file-changes SSE channel is global; client-
side filter handles new worktree paths automatically.

Tests: <count> pass (+N new), 0 failures. just fft clean (security-
audit pre-existing baseline unchanged).
```

---

## Next Steps

✅ Plan created:
- **Location**: `docs/plans/084-random-enhancements-3/live-monitoring-rescan-plan.md`
- **Mode**: Simple (single-phase, 8 tasks)
- **Tasks**: 8 (T001–T008)
- **Domains**: 2 modify (`workspace`, `_platform/events`) + 1 consume (`file-browser`)
- **Tests**: 2 new unit files + 1 new integration file

**Ready to implement**: `/plan-6-v2-implement-phase --plan "/Users/jordanknight/substrate/084-random-enhancements-3/docs/plans/084-random-enhancements-3/live-monitoring-rescan-plan.md"`

Optional: `/plan-4-complete-the-plan` for a final readiness gate.

---

## Validation Record (2026-04-26)

`/validate-v2` ran 3 parallel Explore agents against this plan immediately after authoring. 11 issues found (2 CRITICAL, 3 HIGH, 6 MEDIUM, 1 LOW dropped after fact-check). All applied as plan refinements pre-implementation.

| Agent | Lenses Covered | Issues | Verdict |
|-------|---------------|--------|---------|
| Coherence + Source Truth (Agent 1) | Technical Constraints, Hidden Assumptions, System Behavior, Domain Boundaries | 4 (1 HIGH globalThis-line drift, 1 HIGH success-return lines, 1 HIGH updatePreferences drift, 1 LOW test-path) — all fixed | ⚠️ → ✅ |
| Risk + Completeness (Agent 2) | Edge Cases, Deployment & Ops, Performance & Scale, Concept Documentation, Integration & Ripple | 6 (1 CRITICAL HMR-idempotency, 4 MEDIUM, 1 verified-OK coalescing) — CRITICAL+MEDIUMs fixed | ⚠️ → ✅ |
| Forward-Compatibility (Agent 3) | Forward-Compatibility, User Experience, Security & Privacy | 5 issues (3 raised CRITICAL, 1 HIGH, 1 MEDIUM); fact-check downgraded "FakeGitWorktreeManager doesn't exist" from CRITICAL to MEDIUM (it does exist at `packages/workflow/src/fakes/fake-git-worktree-manager.ts:91`) | ⚠️ → ✅ |

**Lens coverage**: 12/12 (above the 8-floor). Forward-Compatibility engaged (not STANDALONE — 5 named consumers).

### Forward-Compatibility Matrix

| Consumer | Requirement | Failure Mode | Verdict | Evidence |
|----------|-------------|--------------|---------|----------|
| plan-6-v2-implement-phase | Absolute paths, verifiable Done-When, named test seams | Test Boundary | ✅ (after fixes) | T001-T008 all carry exact line numbers, exact code patterns, named seam (`FakeGitWorktreeManager` at `packages/workflow/src/fakes/fake-git-worktree-manager.ts:91`). |
| plan-7-v2-code-review | ACs map to observable tests; Done-When is falsifiable | Contract Drift + Test Boundary | ✅ (after fixes) | AC↔Task matrix complete with all 8 ACs covered. T002 (h) explicitly documents the `setImmediate` caller-contract change so reviewer doesn't flag as race condition. |
| Integration test author (T007) | Clear git-seam choice + existing fixtures | Test Boundary | ✅ (after fixes) | T007 Notes explicitly references `FakeGitWorktreeManager` at known absolute path; mirrors `workspace-service.test.ts:18-22` setup pattern. Polling helper specified, no fixed sleeps. |
| Existing `WorkspaceService` callers (`workspace-actions.ts:660-712`) | Caller contract documented (`await` resolves before listener) | Contract Drift | ✅ (after fixes) | T002 (h) names this caller explicitly and documents that the action redirects before rescan completes — by design. |
| Future second consumer of mutation channel | Discriminated union extensible; multi-consumer safe; idempotent unsubscribe | Encapsulation Lockout + Shape Mismatch | ✅ (after fixes) | T001 enumerates the 5 variants verbatim and mandates idempotent unsubscribe. `EventEmitter.on` natively supports N subscribers. `worktree:removed` is reserved in the union but explicitly documented as "not emitted today" so future subscribers can safely add a handler now. |

**Outcome alignment**: This feature ensures live file monitoring activates within ~1 second of the mutation, with no restart required, for the lifetime of the dev server. The plan as refined advances this outcome — every signal-path failure mode (no emit on worktree creation, stale-inode registry watcher, HMR listener leak) has a named task with explicit Done-When that maps to a test in T005/T006/T007.

**Standalone?**: No — 5 downstream consumers named in the VPO Vector with concrete needs.

### Fixes Applied

| # | Severity | Issue | Fix Location |
|---|----------|-------|--------------|
| F1 | CRITICAL | HMR idempotency trap — `__centralNotificationsStarted` early-return short-circuits naive listener splice | T003 Done-When refactored: mandatory `attachMutationListener()` helper called unconditionally as first statement, before flag guard |
| F2 | CRITICAL | `setImmediate` caller contract change undocumented | T002 (h) added; new Risk row 4 documents the design |
| F3 | CRITICAL → downgraded MEDIUM | `FakeGitWorktreeManager` claimed missing (false positive — it exists) | T007 Notes names the exact path; fact-check evidence persisted in this record |
| F4 | HIGH | globalThis flag line drift (claimed 31, actual 28) | Finding 04 row updated |
| F5 | HIGH | Success-return line drift (claimed ~104/~131/after-295/~520, actual 110/133/310/520+) | T002 Done-When (e) updated with exact line numbers and return-statement quotes |
| F6 | HIGH | T004 path-filter implementation unclear | T004 Done-When expanded: explicit `dirname` import, exact-path equality filter, both `change` + `add` handlers, retain `awaitWriteFinish`, leftover-`.tmp` edge case noted |
| F7 | MEDIUM | Test path included extra `features/` segment | Domain Manifest + T006 path corrected to `test/unit/web/027-central-notify-events/` |
| F8 | MEDIUM | T005/T006 listener-leak across tests | T006 Notes mandates `globalThis` reset in `beforeEach`+`afterEach`; T005 noted as per-instance (no cleanup needed) |
| F9 | MEDIUM | T007 missing coalescing-burst scenario | T007 (f) added: 5 rapid mutations → `performRescan` called ≤2 times |
| F10 | MEDIUM | T008 lacks specifics for Composition + Concepts entries | T008 Done-When expanded with exact section instructions and a new Concepts entry "Observe workspace mutations" |
| F11 | MEDIUM | T001 missing explicit type definition + idempotency note | T001 Done-When (b/d) adds verbatim type variants and idempotency requirement |
| F12 | MEDIUM | T002 might emit `worktree:removed` accidentally | T002 (g) explicitly forbids — the kind is reserved in T001 for forward-compat only |

### Open (none)

All issues from validate-v2 were addressed pre-implementation.

**Overall**: ⚠️ VALIDATED WITH FIXES — ready for `/plan-6-v2-implement-phase`.
