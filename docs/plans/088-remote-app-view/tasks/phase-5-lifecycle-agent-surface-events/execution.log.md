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
