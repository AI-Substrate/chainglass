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

**Status:** code-complete. Committed `8b60f2641` (+ companion `APPROVE`, 0 issues).

---

## T003 — Same-origin wss client url for LAN/HTTPS (INS-003, research-backed pivot)

**Why re-scoped:** the dossier specified *"add `app/api/remote-view/stream/route.ts` that upgrades the WS"* — **infeasible**. Next App-Router route handlers can't upgrade a WebSocket (no raw-socket/101 surface; Next's own server closes upgrade requests), and chainglass serves every socket via **sidecars** (`064-terminal/server/terminal-ws.ts`). Perplexity deep-research confirmed the canonical pattern: *"terminate TLS at a reverse proxy and forward the upgraded WebSocket to the internal `ws://127.0.0.1:<port>` service using same-origin, path-based routing … the de facto industry standard,"* with custom-server/sidecar as *secondary* fallbacks. This is exactly the user's existing Caddy + Porkbun DNS-01 pattern.

**What changed (the only product code — a client url builder):**

- New `apps/web/src/features/088-remote-view/components/stream-url.ts`:
  - `REMOTE_VIEW_WSS_PROXY_PATH = '/remote-view-ws'` (distinct from `/api/remote-view/*` so a proxy can route it to the daemon without shadowing the Next routes).
  - `buildStreamUrl({protocol, host, daemonPort})` — **HTTPS → same-origin `wss://${host}/remote-view-ws`** (the reverse proxy bridges it; no port needed, never a mixed-content `ws://`); **`http://localhost` → `ws://127.0.0.1:<daemonPort>`** direct (T001). A non-localhost http origin is already blocked by the T002 secure-context gate.
- `remote-view-panel.tsx`: the resolver effect branches on `window.location.protocol` — HTTPS sets the same-origin wss url immediately (no `/token` fetch); localhost keeps the T001 `/token`→daemonPort path.
- `apps/web/.env.example`: documented `CG_REMOTE_VIEW__ALLOWED_ORIGINS` (the daemon's WS origin allowlist — **inherited by the spawned daemon via `process.env`**, since `spawn(...)` passes no `env` override), `AUTH_TRUST_HOST`/`AUTH_URL` (NextAuth behind the proxy), and a pointer to the Caddy recipe (→ T010).

**Tests** — new `stream-url.test.ts` (5): HTTPS → same-origin wss (ignores daemonPort, never `ws://`); localhost → loopback; no-port → null; proxy path not under `/api/remote-view`. Panel test (+1): HTTPS branch builds `wss://host/remote-view-ws` and does **not** fetch `/token`. **Full feature suite 173/173 (28 files).**

**Verification:** biome clean; `just typecheck` no new errors (same 3 pre-existing files). The Caddy reverse-proxy recipe + the live HTTPS frame are owned by T010 (docs) / T009 (live sweep). No Next route, no new sidecar — the frozen loopback daemon contract is untouched.

**Status:** code-complete. Committed `3bddc5a0e`. **Companion: APPROVE_WITH_NOTES** (0 HIGH/CRITICAL) — core code correct (HTTPS never `ws://`, same-origin, daemon untouched, env-inherit sound). **F001 (MEDIUM):** the hook appends `/stream` → `wss://host/remote-view-ws/stream`, but the daemon upgrades only **exact** `/stream`; my Caddy example `reverse_proxy /remote-view-ws/*` forwards the URI unstripped → daemon 404. **Resolved:** corrected the recipe to `handle_path /remote-view-ws/* { reverse_proxy 127.0.0.1:<port> }` (strips the prefix → daemon sees `/stream`) in `stream-url.ts` + pinned the contract with a `stream-url.test.ts` assertion (browser `/remote-view-ws/stream` → daemon `/stream`). The strip requirement carries into the T010 Caddy recipe.

---

## T006 — Wire the reaper at web boot (AC-11)

**The debt:** `reapStreamdDaemon()` has existed + been unit-tested since T002 but was **never invoked** — orphaned daemons from a SIGKILL'd `just dev` cycle survived. T006 adds the boot call site.

**What changed**

- `apps/web/src/features/088-remote-view/server/daemon-reaper.ts`: new `reapStreamdDaemonAtBoot({env, findRoot, exec, killer, logger, reap?})` — resolves the workspace root (`findWorkspaceRoot`, falls back to `cwd`) + THIS web port (`env.PORT ?? 3000`) and calls the reaper. **Non-throwing** (a reaper error returns null + logs, never crashes boot). Deps injected so the boot glue is unit-testable; `env` narrowed to `{PORT?}` (only field read).
- `apps/web/instrumentation.ts` `register()`: new HMR-safe guarded block (`__remoteViewReaperRan`, server-runtime + non-container only) that wires production deps (`findWorkspaceRoot`, `execFileSync`, `process.kill`, `console`) and logs the decision (`[remote-view] streamd reaper at boot: <reason>`).

**Tests** — `daemon-reaper.test.ts` (+4): the boot wrapper resolves root + webPort and calls reap with the passed exec/killer; defaults webPort 3000; `findRoot` throw → falls back to `process.cwd()`; reap throw → returns null + warns (boot never crashes). **12/12.** Directly backstops the "claimed-wired but never called" class (INS-001).

**Verification:** biome clean; `just typecheck` no new errors (after narrowing `env` to `{PORT?}` — the full `ProcessEnv` literal tripped the repo's required-`NODE_ENV` augmentation, the same class as the pre-existing test errors). The live AC-11 cross-cycle orphan check (kill web mid-stream → restart → no orphan) is owned by the T009 sweep; the boot log line is the live breadcrumb.

**Status:** code-complete. Committed `7e470a485`. **Companion (run …-e3c4): APPROVE** (0 findings) — boot wrapper non-throwing at both layers, `__remoteViewReaperRan` matches the existing HMR-safe pattern, fail-closed identity/kill logic stays delegated to the already-tested `reapStreamdDaemon()`, `env:{PORT?}` narrowing appropriate.

---

## T005 — Discoverable launch affordance (DL-003)

**The gap:** remote-view was reachable only via the command palette (`remote-view.attach`) or a hand-typed `?view=remote` URL — invisible to a first-time user (the "no button in UI" flag). The wiring already existed (the palette command does `setParams({view:'remote', rv:null})` at `browser-client.tsx:965`); T005 adds the **visible control**.

**What changed**

- New `apps/web/src/features/088-remote-view/components/remote-view-launch-button.tsx` — a small presentational `RemoteViewLaunchButton` (Monitor icon), extracted in the `SplitTerminalToggleButton` style so the discoverable+clickable contract is unit-testable. Accessible name "Open Remote View", a hover title, `data-testid="remote-view-launch"`. Purely presentational — the parent owns the action via `onLaunch`.
- `apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx` — import + render the button in the ExplorerPanel `rightActions` slot **beside the recent-feed `History` button** (`:1454`), mirroring that precedent: `onLaunch` dispatches `terminal:close` (same panel) then `setParams({view:'remote', rv:null}, {history:'push'})` → opens the window picker. The palette command stays registered (`:965`) — both paths reach the same place.

**Tests** — new `remote-view-launch-button.test.tsx` (3): renders a visible control with an accessible name + title (no palette/URL knowledge needed); fires `onLaunch` exactly once on click (parent → `setParams view=remote, rv=null`); is a real focusable `<button>` (keyboard-reachable). **Full 088 suite 181/181 (29 files).**

**Verification:** biome clean; `just typecheck` — no new errors (same pre-existing DL-006 set in untouched files). The button placement + the picker-open round-trip in a real browser are confirmed in the T009 live sweep; the unit test backstops the contract.

**Status:** code-complete. Committed `d895912d9`. **Companion (run …-0ccc):** review-request sent — verdict pending.
