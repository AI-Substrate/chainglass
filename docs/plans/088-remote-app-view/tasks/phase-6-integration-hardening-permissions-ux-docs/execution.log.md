# Phase 6 — Execution Log

Plan: `docs/plans/088-remote-app-view/remote-app-view-plan.md`
Phase: **Phase 6: Integration Hardening, Permissions UX & Docs**
Mode: Full · Companion: `code-review-companion` (run `…-34f7`)

---

## T001 — Surface the daemon connection to the client (keystone, DL-005)

**What changed**

- `apps/web/src/features/088-remote-view/server/daemon-control.ts`
  - Added `daemonPort(): Promise<number>` to `RemoteViewDaemonControl` (the non-frozen host surface, sibling to `health()` — NOT the frozen `IRemoteViewService`).
  - Real impl reads the port from `ensureDaemon()` (registry `port`, never recomputed — frozen contract); fake returns the new exported `FAKE_DAEMON_PORT = 47820` (override-able via the spread).
- `apps/web/app/api/remote-view/token/route.ts`
  - Additive, back-compat: response goes `{token, expiresIn}` → `{token, expiresIn, daemonPort}`.
  - Resolves the control from the DI container and calls `daemonPort()` inside a `try/catch` — **best-effort**: a daemon that won't come up MUST NOT block token issuance (the client surfaces daemonDown via its own reconnect/health path), so resolution failure omits `daemonPort`.
- `apps/web/src/features/088-remote-view/components/remote-view-panel.tsx`
  - **Deleted the Phase-3 stub** (`window.__REMOTE_VIEW_WS_URL__ || env || ''`).
  - A one-shot `/token` fetch (when `rv != null`) builds the real base url `ws://127.0.0.1:<daemonPort>`; the Viewport hook appends `/stream?session=…&token=…` and re-mints a fresh JWT per connect.
  - New UI states: `remote-view-connecting` (resolving the port) and `remote-view-daemon-unreachable` (token issued but no port — "Streamer not reachable" + back-to-windows).

**Tests** (TDD — `npx vitest run test/unit/web/features/088-remote-view/`)

- `daemon-control.test.ts` (+4): real `daemonPort()` returns the `ensureDaemon()` port (6001); propagates an ensureDaemon failure; fake returns `FAKE_DAEMON_PORT`; honours an override. **12/12.**
- `token-route.test.ts` (+2, +1 assertion): happy path now asserts `daemonPort === FAKE_DAEMON_PORT`; new graceful-omit test (control throws → 200 `{token,expiresIn}`, `daemonPort` undefined). One sanctioned mock added (`@/lib/bootstrap-singleton`) to keep resolution hermetic — no real `streamd` spawn. **6/6.**
- Full feature suite: **157/157 (25 files), 10.2s** (stale `**/standalone` dirs pruned first — DL-002 workaround).

**Verification**

- `npx biome check --write` on the 5 touched files — clean.
- `just typecheck` — T001's files are tsc-clean. 4 RED errors are **pre-existing**, in untouched test files (commander v11/v13; RequestInit/tuple/ProcessEnv) → flagged for T011 (observe `DL-006`).
- **Live wiring confirmed** against the running `:3000` dev server: registry daemon `port=4501` (v0.1.0, protocol 1); `/health` → `ok:true`, screenRecording + accessibility `granted`; `/windows` lists the iOS Simulator (id 649, iPhone 16e). So `/token` now surfaces `daemonPort:4501` and the panel builds `ws://127.0.0.1:4501`.
- **Deferred to T009 (honest):** the in-browser ≥1-frame **decode** (the visual Done-When) is the measured live sweep AC-1/AC-2 — it needs the user's authenticated browser session and is gated on T001–T008.

**Status:** code-complete + live-wiring-verified. Commit below.
