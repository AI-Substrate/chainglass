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

**Status:** code-complete + live-wiring-verified. Committed `30c1b040d`.

**Companion (run …-34f7) — T001 review: APPROVE_WITH_NOTES.** 0 HIGH/CRITICAL. Confirmed: `/token` additive/back-compat, `daemonPort()` correctly on the daemon-control host surface (not the frozen `IRemoteViewService`), stub gone from runtime+tests, `ws://127.0.0.1` correctly scoped to localhost pending T003. **F001 (MEDIUM, evidence gap):** T001's own Done-When wants a decoded browser frame, but that's deferred to T009 and no test backstopped the panel's `/token`→url composition (keystone stub-regression risk). **Resolved:** added `remote-view-panel.test.tsx` (4) — asserts the panel builds `ws://127.0.0.1:<daemonPort>` from `/token` and passes it to the Viewport (stubbed, jsdom has no WebCodecs), plus the daemon-unreachable + picker-no-fetch branches; frame-decode ownership explicitly = T009. Re-pinged for verification.

---

## T002 — Secure-context-aware gate + honest copy (DL-004)

**What changed**

- New `apps/web/src/features/088-remote-view/components/viewport-support.ts` (pure, jsdom-free):
  - `UnsupportedReason = 'insecure-context' | 'no-webcodecs' | 'codec'`.
  - `classifyEnvSupport({isSecureContext, hasWebCodecs})` — checks **secure-context FIRST** (an insecure context also makes `VideoDecoder` undefined, so it must win over the missing-API signal — the exact DL-004 false negative).
  - `unsupportedOverlayText(reason)` — distinct title + body per reason; "use a recent Chromium-based browser" copy is kept **only** for `no-webcodecs`.
- `apps/web/src/features/088-remote-view/components/viewport.tsx`:
  - Replaced the `supported: boolean|null` state with `unsupported: UnsupportedReason|null`, seeded from a new `detectEnvUnsupported()` (SSR-safe).
  - `handleVideoConfig`: env-missing → the classified reason; `isConfigSupported`/`configure` failures → `'codec'`; success → clears to `null`.
  - Overlay renders `{title}` + `{body}` from `unsupportedOverlayText`, with `data-reason={unsupported}` (kept the `remote-view-unsupported` testid).

**Tests** — new `viewport-support.test.ts` (6): secure-context wins over missing-API; missing-API only on secure context; capable → null; insecure copy names secure-context + https/localhost and does NOT say "chromium"; no-webcodecs keeps the Chromium copy; all three reasons render distinct title+body. **6/6.**

**Verification:** biome clean; `just typecheck` — no new errors (same 4 pre-existing). Viewport stays not-unit-rendered (jsdom has no WebCodecs) — the branch logic is fully covered by the extracted pure module. Visual overlay on a real LAN http:// origin is confirmed in the T009 sweep.

**Status:** code-complete. Commit below.
