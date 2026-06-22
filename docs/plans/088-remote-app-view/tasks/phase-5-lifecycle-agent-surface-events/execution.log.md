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
