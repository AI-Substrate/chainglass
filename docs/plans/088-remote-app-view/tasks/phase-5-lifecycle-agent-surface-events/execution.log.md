# Phase 5 — Execution Log

**Plan**: [`../../remote-app-view-plan.md`](../../remote-app-view-plan.md)
**Phase**: Phase 5 — Lifecycle, Agent Surface & Events
**Companion**: `code-review-companion` run `2026-06-21T08-27-24-946Z-f514` (Power-On mode, reviews every commit)

---

## T001 — daemon-manager (spawn / poll / version handshake) ✅

**Tests**: `test/unit/web/features/088-remote-view/daemon-manager.test.ts` — **7/7 green**
**Files**: `apps/web/src/features/088-remote-view/server/daemon-manager.ts` (+ test)

TDD RED→GREEN. `createDaemonManager(config, deps)` exposes `ensureDaemon()`:

- **spawn-on-demand** — inner binary, detached, absolute `--port`/`--registry`/`--bootstrap` argv (daemon never computes the offset);
- **readiness poll** — registry file appears **then** `GET /health` ok, bounded by `readinessTimeoutMs` (5s default);
- **version handshake** — reuse a healthy + protocol-matched daemon; respawn a crashed one (no graceful shutdown — it's already dead); on a protocol mismatch send `POST /shutdown` then respawn; if still mismatched after respawn throw an actionable `just streamd-install` error;
- **read-not-derive** — `daemonPort` is read from the registry `port` field (a test pins a registry port ≠ `webPort+1501` to prove it).

I/O is injected (`spawnDaemon` / `fetchHealth` / `shutdownDaemon` / `sleep` / `now`), so the whole lifecycle is unit-tested deterministically against a temp registry dir — no live daemon.

**Evidence (7 tests)**: spawn-on-demand + read-port · reuse-healthy (0 spawns) · crashed-respawn (0 shutdowns) · version-mismatch graceful-respawn (`shutdown` then respawn) · stale-install error · readiness-timeout · `CG_REMOTE_VIEW__DAEMON_PORT` override.

**Decision logged** (Discoveries): spawn the **inner binary directly** (spike §1.5b: TCC keys on bundle-id+cert, path-independent) rather than Workshop 004's `open -a <bundle>`; behind an injectable spawner. **Phase 6 must verify** the TCC grant persists live across this spawn path.

**Exposes** `ensureDaemon()` for the T004/T005 proxy routes to call before proxying.

---

## T002 — fail-closed daemon reaper ✅

**Tests**: `test/unit/web/features/088-remote-view/daemon-reaper.test.ts` — **7/7 green**
**Files**: `apps/web/src/features/088-remote-view/server/daemon-reaper.ts` (+ test)

TDD. `reapStreamdDaemon(root, webPort, deps)` mirrors `pty-registry.ts` semantics (copied, not imported — cross-domain). Kill gate is **fail-closed**: SIGTERM only a pid that is alive (`kill(pid,0)`, EPERM⇒alive) **AND** verifiably ours — the `ps -o command= -p` EXECUTABLE (first argv token) is exactly the signed inner binary `<bundlePath>/Contents/MacOS/streamd` (not a mere substring match). Outcomes: orphan (alive+ours) → graceful SIGTERM + delete registry; dead → delete stale entry, no signal; alive-but-mismatched (recycled pid) or unprobeable → **never signal**, leave the file. Per-webPort only, so concurrent worktree daemons never reap each other (Workshop 004 Q2).

**Evidence (7 tests)**: orphan reaped (SIGTERM + cleaned) · dead entry cleaned (no kill) · recycled-pid never killed · probe-failure never kills · no-registry no-op · `isProcessAlive` EPERM/ESRCH · `isStreamdProcess` match/reject/fail-closed.

**Decision logged** (Discoveries): corrected Workshop 004's "alive-but-mismatched → kill" to the fail-closed dossier/pty-registry rule (never kill a pid we can't prove is ours).

**Deferred** (Discoveries): the reaper isn't yet *called* at web-server boot — wire `reapStreamdDaemon` into the startup path at the first integration point (Phase-end rollup will surface this).

---

## Companion review loop — T001 + T002 (REQUEST_CHANGES → fixed)

`code-review-companion` returned **REQUEST_CHANGES** on both commits; all four findings fixed in one loop before T003:

| ID | Sev | Finding | Resolution |
|----|-----|---------|------------|
| F001 | HIGH | Respawn `pollUntilHealthy` returned the first `/health`-ok daemon regardless of protocol → the old daemon still gracefully exiting with the stale version could trigger a false `stale-install` error. | Respawn now polls for a **version-matched** health (`pollUntilHealthy(accept = versionOk)`); only after the full readiness window with no match does it diagnose stale-install vs readiness-timeout. Regression added (health lingers v99 then → v1). |
| F004 | HIGH | Reaper `isStreamdProcess` used `cmd.includes(bundlePath)` → a recycled pid whose **argv** merely mentioned the path (e.g. `python3 …/streamd`) could be SIGTERM'd — a fail-closed hole. | Now matches the **executable** (first argv token): `cmd === innerBinary || cmd.startsWith(innerBinary + ' ')`. Regression rejects `/usr/bin/python3 <innerBinary>`. |
| F002 | MED | `DaemonHealth.permissions.screenRecording` was `boolean`; the Phase 4 daemon returns the grant-string union for **both** permissions. | Changed to `PermissionGrant = 'granted' \| 'denied' \| 'not-determined'` for both; test fake updated — locks the frozen `/health` shape before T004 proxies it. |
| F003 | MED | Active Phase 5 task row + diagrams + plan row still said `open -g`, contradicting the inner-binary spawn decision. | Updated the T001 row, spawn-lifecycle + sequence diagrams, and plan 5.1 to "detached signed inner binary"; spike/Workshop refs left as superseded history. |
| F005 | MED | Re-review found residual reaper-contract drift: plan said `else kill+clean`, Workshop 004 still said `alive-but-mismatched → kill`, and this log described the old `contains bundlePath + streamd token` predicate. | Plan row now states mismatched/unprobeable pids are left alone; Workshop 004's old rule marked **[SUPERSEDED by T002]**; this log's predicate corrected to exact inner-binary executable match. |

**Re-review verdict (commit `f90104a6`)**: `code-review-companion` → **APPROVE_WITH_NOTES** — F001/F002/F004 closed in code+tests, F003 mostly closed; only F005 (doc drift) remained, now fixed. Tests after fixes: **16/16 green** (8 manager + 8 reaper).

**Companion lifecycle note**: the run idle-timed-out ("session idle / stopped for idle budget") during the post-checkpoint wait — the known structural gap (a companion booted for a phase with human-in-the-loop gaps dies in the gaps). Its findings + magicWand (state-vocabulary schema mismatch) are preserved under `agents/code-review-companion/runs/2026-06-21T08-27-24-946Z-f514/`. Remaining tasks (T003+) need a fresh `minih run` or a post-hoc review pass.

---

## T003 — real `RemoteViewService` adapter + prod DI swap ✅

**Tests**: `test/unit/web/features/088-remote-view/real-remote-view-service.test.ts` — **16/16 green** (12 adapter + 4 transport); full 088 suite **95/95**; web typecheck clean; biome clean.
**Files**: `server/remote-view-service.ts` (+`RealRemoteViewService`, `DaemonSessionsClient`, `createHttpDaemonSessionsClient`), `server/remote-view-service.production.ts` (new), `apps/web/src/lib/di-container.ts` (prod factory swap), + test.

TDD RED→GREEN. The adapter implements the **frozen** `IRemoteViewService` and passes the **same** Phase-2 contract suite the fake passes (`remoteViewServiceContractTests(makeRealService, 'RealRemoteViewService')`) — driven against a **daemon-double** so the whole adapter is unit-tested with no live daemon.

- **sync-read mirror** — `IRemoteViewService.list()`/`getSession()` are synchronous but the daemon is async HTTP; the adapter holds a **local session mirror** (sync source of truth) updated by the async `attach()`/`detach()` daemon round-trips (one session per window, single-viewer v1).
- **ensure-before-proxy** — `attach()` calls the T001 manager's `ensureDaemon()` (spawn/poll/version-handshake) **then** `POST /sessions` via the transport; local fast-path returns an existing live session with **no** second round-trip (idempotent per window).
- **fail-safe mirror** — the mirror is written only **after** a successful daemon create (a failure propagates and leaves no phantom session); `detach(unknown)` is a no-op (no spawn).
- **injectable transport** — `DaemonSessionsClient` (`create`/`remove`); `createHttpDaemonSessionsClient` is the live HTTP impl (JWT Bearer, 404-tolerant DELETE) tested over a `fetch` double.
- **DI swap** — prod factory (`di-container.ts` ~L719) now builds `createProductionRemoteViewService({ logger })` (real adapter) instead of `createUnimplementedRemoteViewService()`; **test factory stays the fake**. Decorator-free `useFactory` (ADR-0004). The placeholder fn is retained (Phase-2 contract test's negative case) but no longer used in prod.

**Decision/Debt logged** (Discoveries): the production daemon wiring (webPort/bundle-path/bootstrap-path resolution + manager spawn/fetch deps + JWT mint) is isolated in `remote-view-service.production.ts`, assembled but **not** unit-tested — construction does no I/O; the live spawn/proxy path is **Phase-6-verified** and **T004** finalizes the route integration that calls `ensureDaemon`. SSE (T006) + GlobalState (T007) attach at the marked `attach()`/`detach()` seams.

**Unblocks** T004 (routes `/health`+`/windows`) and T006 (SSE) — both keyed on the real adapter.

---

## Companion review loop — T003 (2 HIGH → fixed before T004)

`code-review-companion` run `2026-06-22T06-37-22-817Z-b7a1` reviewed the T003 commit (`1d032a89`) and returned **2 HIGH** findings — both fixed in one loop before T004 builds on the adapter (TDD RED→GREEN; the two F002 behavioural tests RED against the fast-path, F001 seam GREEN, then GREEN after the fix):

| ID | Sev | Finding | Resolution |
|----|-----|---------|------------|
| F001 | HIGH | `remote-view-service.production.ts` set `workspaceRoot = process.cwd()` for **both** the daemon `--bootstrap`/`--registry` paths and the manager root. Under `just dev`/Turbo, Next runs from `apps/web/` while `getBootstrapCodeAndKey()` mints from `findWorkspaceRoot(process.cwd())` (repo root) — the **Plan 084 FX003 cwd split**: the daemon would verify tokens against `apps/web/.chainglass/` while the server signs against `<repo>/.chainglass/`, so live `/sessions` auth/registry discovery fails on the first production attach. | Extracted `resolveProductionDaemonConfig({cwd,findRoot,env})` — resolves `workspaceRoot = findWorkspaceRoot(process.cwd())` (auth's canonical root) before building `bootstrapPath` + the manager. Injectable seam → 2 unit tests prove `cwd=<repo>/apps/web` ⇒ `<repo>/.chainglass/bootstrap-code.json` (no real FS walk). |
| F002 | HIGH | `RealRemoteViewService.attach()` returned an existing **mirror** entry with **no** `ensureDaemon()`/`POST /sessions`. If `streamd` crashes/restarts while Next keeps its mirror, a later attach hands back a **dead `sessionId`**, never triggers the T001 crashed-daemon respawn/handshake, and never creates the daemon-side session R6 expects (Workshop 002: the daemon table is authoritative; sessions don't survive restart). The test locked in the unsafe behaviour. | Dropped the local fast-path: every `attach()` now re-runs `ensureDaemon()` and lets the daemon's **idempotent** `POST /sessions` be the source of truth; the mirror is a **read-cache** reconciled after each create (evict any prior same-window entry, then record the authoritative summary). Daemon-double made idempotent-per-window + a `restart()` model; rewrote the fast-path test (asserts no **duplicate** session + ensureDaemon re-verified, not no-round-trip) and added a restart regression (stale entry evicted, fresh session returned). |

**Evidence after fixes**: target file **19/19** (was 16; +1 restart regression, +2 F001 seam, 1 rewritten); full 088 suite **98/98**; web typecheck **0 errors**; biome clean. Files: `server/remote-view-service.ts` (attach), `server/remote-view-service.production.ts` (`resolveProductionDaemonConfig` + `ProductionDaemonConfig`), `real-remote-view-service.test.ts`.

**Companion-mode footnote (dogfood)**: booting the companion on 0.2.3 took two fresh workarounds — `E205 COORDINATION_WRITE_DENIED` → `--permissions trusted`; `E170 multiple-active-runs` → `--run <id>` (stale runs never cleaned). Findings land on the **inside** lane (`runs/<id>/inbox/inside/messages.ndjson`), invisible to the documented read-path — recorded in memory [[minih-companion-discovery-workaround]].

---

## T004 — routes `/health` + `/windows` + native `--list-windows` ✅

Committed `c217a833` last session; this exec-log entry was **missed at the time** (friction: the per-task progress checklist's "append execution log" step was skipped for T004). Recorded here so the log isn't misleadingly absent. Summary: NextAuth-gated `/health` + `/windows` routes, a separate `RemoteViewDaemonControl` surface (windows/health kept off the frozen `IRemoteViewService`), native `streamd --list-windows` one-shot catalog (live-smoked: 34 real windows after a `layer==0` menubar-chrome fix), `use-remote-view-windows.ts` swapped fake→real. Deterministic NextAuth gate (`requireRemoteViewSession`) extracted with a negative-control test.

---

## T005 — routes `/sessions` CRUD + R6 createSession wiring ✅

**Tests**: `sessions-routes.test.ts` (9) + `default-create-session.test.ts` (3) — **12/12 green**; full 088 suite **123/123**; web typecheck **0 errors**.
**Files**: `app/api/remote-view/sessions/route.ts` (GET/POST, new), `app/api/remote-view/sessions/[sessionId]/route.ts` (DELETE, new), `server/remote-view-service.ts` (+`REMOTE_VIEW_SERVICE_TOKEN`), `hooks/use-remote-view-session.ts` (`defaultCreateSession` null→POST, exported), `lib/di-container.ts` (token single-source), + 2 tests.

TDD RED→GREEN (RED: route modules absent + `defaultCreateSession` not a function → GREEN). The routes proxy the **frozen** `IRemoteViewService` (DI-resolved; `FakeRemoteViewService` in tests, daemon-backed adapter in prod) behind the **shared `requireRemoteViewSession` gate** reused from T004.

- **gate-before-service ordering** — every handler returns 401 **before** resolving the container; a `resolveMock` not-called assertion locks the order (a route that skipped the gate fails the test).
- **idempotent attach per window** — POST `{ windowId }` delegates to the service's contract idempotency (same windowId → same `sessionId`); proven against the fake.
- **named errors, not opaque** — malformed body → 400 `E_BAD_BODY` (mirrors the daemon), attach/daemon failure → 500 `E_INTERNAL`; DELETE is terminal + idempotent → 204.
- **R6 wiring** — `defaultCreateSession` swapped from the Phase-2 `null` stub to `POST /api/remote-view/sessions`, returning the new `sessionId`; null-on-failure + never-throws. On failure the reducer maps `SESSION_RECREATE_FAIL` → **`picker`** (the daemon was just health-checked healthy, so the user re-picks; `daemonDown` is reserved for a dead daemon), never an unhandled rejection. Exported for a direct fetch-stub test; the healthy-daemon recreate-fail→picker path is also pinned end-to-end in the hook suite.

**Decision/Noteworthy logged** (Discoveries): (1) **bare DI token** — added `REMOTE_VIEW_SERVICE_TOKEN` to the service leaf and re-pointed `DI_TOKENS.REMOTE_VIEW_SERVICE` at it (single-source), so the routes resolve the service without importing the `di-container` module graph — same leaf-light pattern as `REMOTE_VIEW_DAEMON_CONTROL_TOKEN` (T004). (2) **response shapes** — GET wraps the list as `{ sessions }` (web convention, matches `/windows` `{ windows }`); POST returns the **flat** `SessionSummary` so `createSession` reads `.sessionId`; the T009/T010 agent surfaces will consume these shapes.

**Unblocks** T008 (SDK), T009 (CLI) — both hit these routes.

---

## Companion review loop — T005 (1 HIGH → fixed before phase continues)

`code-review-companion` run `2026-06-23T04-41-19-536Z-8ec5` reviewed the T005 commit (`11d7361a`) and returned **REQUEST_CHANGES** with **1 HIGH** — a genuine doc/contract drift I introduced (not a code-behaviour bug). Fixed in one loop:

| ID | Sev | Finding | Resolution |
|----|-----|---------|------------|
| F001 | HIGH | T005's `defaultCreateSession` doc + test wording (and the briefing) claimed a route failure falls through to **`daemonDown`**. But the reducer maps `SESSION_RECREATE_FAIL` (`sessionLost` →) to **`picker`** (`session-machine.ts:217`), and that is the *correct* UX: `recreateOnce` only runs after `healthCheck` returned **true**, so the daemon is healthy → re-pick a window; `daemonDown` is reserved for a dead daemon. My wording **overpromised**. There was also no hook-level test for "healthy daemon + createSession null → picker". | Kept the (correct) reducer transition; **corrected the wording** to `picker` in `use-remote-view-session.ts` (`defaultCreateSession` doc), `default-create-session.test.ts` (doc + the "never throws" test name), and this log. **Added the missing end-to-end test** in `use-remote-view-session.test.ts`: healthy daemon + `createSession→null` → asserts `picker`, `createSession` called exactly once, no unhandled rejection. |

**Evidence after fix**: hook suite green incl. the new R6 picker test; T005 units **12/12**; full 088 suite **124/124**; web typecheck **0 errors**; biome clean. The route CRUD shape, 401-before-service ordering, idempotent attach, DELETE 204, `E_BAD_BODY`/`E_INTERNAL` naming, and bare-token DI wiring all passed companion review unchanged.

---

## T006 — SSE envelopes (`attached`/`detached`/`daemon-state`) ✅

**Tests**: `remote-view-sse.test.ts` (4, adapter producer), `daemon-state-events.test.ts` (2, manager `daemon-state`), `use-remote-view-events.test.tsx` (3, client push half / AC-8) — **9/9 green**; full 088 suite **133/133**; web typecheck **0 errors**; biome clean. TDD RED→GREEN (tests referenced `WorkspaceDomain.RemoteView`, the adapter `notifier` dep, and the `useRemoteViewEvents` hook — all absent when written → compile-time RED).

**Files**:
- `packages/shared/.../workspace-domain.ts` — **registered `RemoteView: 'remote-view'`** in the `WorkspaceDomain` enum (the single-source-of-truth; domain value IS the channel id, DYK-03). Push-only domain (no filesystem watcher) — `start-central-notifications.ts` wires watcher adapters explicitly and does NOT iterate the enum, so the addition is safe. **packages/shared rebuilt** so the app (resolves `@chainglass/*` → dist) sees it; web tsc against dist = 0 errors confirms export coherence.
- `server/remote-view-service.ts` — adapter `attach()` emits `('remote-view','attached',{sessionId,windowId,app,title,state})` (full small summary so the push names the window, R4); `detach()` emits `('remote-view','detached',{sessionId})`. Optional `notifier?` dep (mirrors `logger?`) — guarded `?.`, so the frozen contract suite + T003 orchestration tests (no notifier) keep passing.
- `server/daemon-manager.ts` — optional `notifier?` dep; `ensureDaemon()` emits `('remote-view','daemon-state',{state:'ready',…})` on a healthy handshake (both already-running + freshly-spawned paths via a `ready()` helper) and `{state:'down',reason}` on the two throw paths (via a `down()` helper that emits-then-throws).
- `server/remote-view-service.production.ts` + `lib/di-container.ts` — thread the DI-resolved `CENTRAL_EVENT_NOTIFIER` into both the adapter and the **session-service** manager.
- `features/088-remote-view/hooks/use-remote-view-events.ts` (new) — `useRemoteViewEvents({onAttached,enabled})` subscribes `useChannelEvents('remote-view')`, fires `onAttached(sessionId)` once per `attached` envelope (drains processed messages, mirrors `use-workflow-sse`), ignores `detached`/`daemon-state`.
- `app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx` — wired `useRemoteViewEvents({ onAttached: setParams({view:'remote', rv}) })` (memoized) — the agent-attach content-area push (AC-8). 2-line touch (Finding 01 containment).

**Decision/Noteworthy logged** (Discoveries):
1. **Dossier↔source drift (Noteworthy)** — the dossier asserted "Phase 2 registered the remote-view domain", but `WorkspaceDomain` had **no** `RemoteView` entry, so `emit('remote-view',…)` would not typecheck. T006 added it (the proper single-source registration). Captured as harness observation `INS-002`.
2. **Single emit source for `daemon-state` (Noteworthy)** — the notifier is wired only to the **session-service** manager, not the `RemoteViewDaemonControl` manager (`createProductionDaemonControl` passes no notifier), so `/health` route handshakes don't double-emit. The meaningful client signal rides the attach path.
3. **`detached`/`daemon-state` have no client consumer yet (Deferred)** — the browser-client push only reacts to `attached`; `detached`/`daemon-state` are emitted (producer complete) but their consumers land with T007 (GlobalState) / the viewport / Phase 6.
4. **App-boot `harness-verify` deferred (Noteworthy)** — the `WorkspaceDomain` export change is additive and proven coherent by web tsc-against-dist (0 errors); the live app-boot smoke rides phase-end / Phase 6 (matching Phase 3's app-smoke deferral), not this unit task.
5. **Env friction (observation `DL-002`)** — vitest cold-start hung for minutes: `vite-tsconfig-paths` scanned stale `.next/standalone` + `apps/cli/dist/web/standalone` artifacts with broken `extends` (TSConfckParseError). Pruned the two untracked/gitignored standalone dirs → run dropped to ~1s.

**Unblocks** T007 (GlobalState publish rides the same `attach`/`detach`/stats seams).

## Companion review loop — T006 (deviation: companion died mid-phase)

The `code-review-companion` run `2026-06-23T04-41-19-536Z-8ec5` (booted last session) **self-terminated** (`run.json status: completed`, idle ~60 min) *during* the long T006 implementation. The per-task `review-request: T006 5a1d06f3` was delivered to the inside lane but **no live agent was alive to read it** — confirmed not the mid-tool false-positive (`currentlyRunningTool`/`selfReportedState` both null). Per companion-mode policy this is **best-effort and never blocks**: T006 is verified independently (9 new tests, full 088 **133/133**, web tsc **0**, biome clean). Recovery for T007+ is a fresh companion boot at the next per-task seam (C0). Captured as harness observation `DL-003` (companion longevity vs long tasks).

---

## T007 — GlobalState publish (`status` + 5s-throttled `latency-ms`/`fps`) ✅

**Tests**: `remote-view-state.test.ts` (7: domain reg + idempotency; stats-publisher publish/enumerate, 5s throttle, per-path independence; SSE status route channel + mapEvent) — **7/7 green**; full 088 suite **140/140**; web typecheck **0 errors**; biome clean. TDD RED→GREEN (the test referenced `registerRemoteViewState`, `createRemoteViewStatsPublisher`, `remoteViewStateRoute` — all absent → module-resolution RED, then GREEN).

**Architecture correction (key)**: the tasks-table named "publish sites in the real adapter" (server), but GlobalState is a **client** runtime store — `new GlobalStateSystem()` exists only in `state-provider.tsx`. The server reaches client state via **SSE → `ServerEventRoute` → client GlobalState**, never directly. T007 therefore publishes **client-side**, matching the canonical worktree/work-unit/workflow pattern. Captured as harness observation `INS-003`.

**Files** (all new under `features/088-remote-view/state/` unless noted):
- `register.ts` — `registerRemoteViewState(state)`: registers the `remote-view` **multiInstance** domain (`status`/`latency-ms`/`fps`), idempotent via `listDomains().some` (Strict Mode / HMR-safe). Pattern: `041-file-browser/state/register.ts`.
- `remote-view-stats-publisher.ts` — `createRemoteViewStatsPublisher(state,{now,throttleMs})`: leading-edge **per-path 5s throttle** (injectable clock, timer-free → unit-verifiable) publishing `remote-view:<ses>:latency-ms` + `:fps`. The two metrics throttle **independently** (different beats: onPong vs onStats).
- `remote-view-state-route.ts` — `remoteViewStateRoute` `ServerEventRouteDescriptor`: bridges the `remote-view` SSE channel → `remote-view:<ses>:status` (`attached`→`state`, `detached`→`closed`, `daemon-state`/unknown→ignored). Pattern: `lib/state/workflow-execution-route.ts`. domain name = channel id (`WorkspaceDomain.RemoteView`).
- `use-remote-view-stats-publisher.ts` — thin hook binding the publisher to the client GlobalState (`useStateSystem` + `useMemo`).
- `lib/state/state-connector.tsx` — `registerRemoteViewState(state)` in the init initializer + `remoteViewStateRoute` added to `SERVER_EVENT_ROUTES` (the loop's `registered.has` guard skips re-registering the now-registered domain).
- `components/viewport.tsx` — the HUD sampler now ALSO calls `publishFps`/`publishLatencyMs` (additive; the existing `setHud` path is unchanged → "HUD callback-driven unaffected").

**Decision/Deferred logged** (Discoveries):
1. **Client-side publish (Noteworthy)** — corrected the build-sheet's server-adapter wording; `INS-003`.
2. **Viewport stats tap verified in Phase 6 (Deferred)** — the throttle is unit-verified; the viewport call-site (`fps`/`latency-ms`) rides the Phase 6 browser smoke (viewport is jsdom-untestable; stats real only against the live daemon). `status` is live now via the SSE route. `INS-004`.

**Unblocks** T008 (SDK contribution) + T009/T010 (CLI/MCP) — independent of state; they ride the `/sessions` proxy.

---

## T008 — SDK contribution (`remote-view.list/attach/detach` palette verbs) ✅

**Tests**: `remote-view-sdk.test.ts` (5: manifest verb set + Zod params; `register.ts` binds list/detach; `list`→GET `/sessions` toast; `detach`→DELETE toast) — **5/5 green**; full 088 suite **145/145**; web tsc **0**; biome clean. Built against a **real `IUSDK`** assembled from the actual SDK services (`CommandRegistry`/`SettingsStore`/`KeybindingService`/`ContextKeyService`) + a spy toast — **no cast**, so `commands.list`/`execute` exercise the real registry. TDD RED→GREEN.

**Files**:
- `sdk/contribution.ts` (new) — `remoteViewContribution`: `remote-view.{attach,list,detach}` with Zod params (`attach {windowId?}`, `detach {sessionId}`), category 'Remote View'. Pattern: `041-file-browser/sdk/contribution.ts`. ADR-0013 / ADR-0009.
- `sdk/register.ts` (new) — `registerRemoteViewSDK(sdk)`: binds the **bootstrap-safe** `list` (GET `/api/remote-view/sessions` → toast; reads the `{sessions}` wrapper from T005) + `detach` (DELETE `/sessions/<id>` → toast) handlers; contributes settings/keybindings (none).
- `app-composition/sdk-domain-registrations.ts` — one line `registerRemoteViewSDK(sdk)` in `registerAllDomains` (Finding 04).
- `browser/browser-client.tsx` — `remote-view.attach` handler registered in the page useEffect (Workshop 001: no args → `setParams({view:'remote', rv:null})` opens the picker; a `windowId` POSTs `/sessions` and the T006 SSE pushes the view). Disposed in the effect cleanup.

**Decision logged** (Discoveries): `attach` is page-level (setParams) → registered in browser-client; `list`/`detach` bootstrap-safe → register.ts, mirroring file-browser's split. All 3 declared in the manifest so they surface in the palette.

**Unblocks** T009 (CLI verbs) + T010 (MCP tools) — both mirror these verbs against the same `/sessions` proxy.

---

## T009 — CLI verbs (`cg remote-view list|attach|detach`) ✅

**Tests**: `test/unit/cli/remote-view-command.test.ts` (4: verb tree; `list`→GET; `attach`→POST `{windowId}`; `detach`→DELETE) — **4/4 green**; full CLI unit suite **133/133** (cg.ts registration still parses — cli-parser + cg-binary-linkage green); CLI tsc **0**; biome clean. Handlers take an **injectable `request` seam** (typed fake in tests) — no live server. TDD RED→GREEN.

**Files**:
- `apps/cli/src/commands/remote-view.command.ts` (new) — `registerRemoteViewCommands(program)` + `handleRemoteView{List,Attach,Detach}` + `createRemoteViewRequest`. Server discovery via `readServerInfo` (cwd → workspace root → legacy `apps/web`) + `X-Local-Token` auth (Plan 084); `baseUrl = http://localhost:<port>`. DELETE tolerates a 204 (reads text, JSON.parse only if non-empty). Pattern: `agent.command.ts` (Commander group) + `event-popper-client.ts` (auth).
- `apps/cli/src/bin/cg.ts` — import + one-line `registerRemoteViewCommands(program)` (Finding 04).

**Verbs**: `cg remote-view list` (GET `/sessions`, prints rows) · `cg remote-view attach <windowId>` (POST `/sessions {windowId}`) · `cg remote-view detach <sessionId>` (DELETE `/sessions/<id>`). All accept `--workspace-path`.

**Decision logged** (Discoveries): injectable request seam + 204-tolerant DELETE.

**Unblocks** T010 (MCP tools) — mirrors these exact verbs (ADR-0001 annotations) against the same proxy.
