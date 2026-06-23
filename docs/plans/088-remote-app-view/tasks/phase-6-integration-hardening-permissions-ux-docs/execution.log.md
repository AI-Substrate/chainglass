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

**Status:** code-complete. Committed `d895912d9`. **Companion (run …-0ccc): APPROVE** (0 findings) — "a real accessible button with a clear label/title, wired into the same ExplorerPanel rightActions slot as the recent-feed precedent, closes the terminal overlay before opening `view=remote`, and leaves the existing `remote-view.attach` palette path intact."

---

## T008 — Reconcile `/health` ↔ `/windows` + verify auth gate (INS-001 + DL-002, security-relevant)

Three reconciliations across the two browser-picker routes.

**1. `E_BUNDLE_MISSING` — name the root cause, don't guess it.** A never-installed bundle surfaced two *different* opaque failures for one cause: `/windows` → 500 `E_INTERNAL` (non-zero `--list-windows` exit), `/health` → 503 readiness-timeout. Added the `E_BUNDLE_MISSING` code + an **injectable `bundleInstalled()` predicate** on `createRealDaemonControl` (kept pure over deps — production wires `() => existsSync(config.innerBinaryPath)`). `listWindows()`/`health()`/`daemonPort()` now `assertBundleInstalled()` **before any spawn/ensureDaemon**, so both routes return a named 503 prescribing `just streamd-install`. Omitting the predicate skips the check (pre-T008 back-compat).

**2. Same daemon-control instance.** The control was registered `useFactory: () => createProductionDaemonControl(...)` — **transient** in tsyringe (which *ignores `lifecycle` for factory providers*), so `/health` and `/windows` each built a fresh control + config + manager. Fix: a **closure-scoped memo cell** per `createProductionContainer` call (mirrored in `createTestContainer`), so both routes resolve **one** instance; the per-container scope keeps distinct containers isolated (no module-level global leak).

**3. Session-only auth gate — the "gap" was a false alarm.** The flagged concern (the live probe saw `/health` accept `X-Local-Token` alone) is **not a code gap**: `/health` + `/windows` export `GET()` with **zero parameters**, so they never receive a `NextRequest` and *cannot read a token header* — they are NextAuth-only **by construction** (unlike `/sessions`, which takes `(req)` and runs `requireRemoteViewAccess` = token OR session). The live-probe acceptance was `DISABLE_AUTH=true` faking a NextAuth session in dev. Pinned structurally (`expect(healthGET).toHaveLength(0)`) + the existing null-session 401-before-daemon assertion.

**Tests** — `daemon-control.test.ts` (+5: bundle guard fails fast on all three methods before spawn/ensureDaemon; runs normally when installed; omitting the predicate = back-compat); `remote-view-routes.test.ts` (+3: `E_BUNDLE_MISSING` → 503 named on both routes + a `session-only auth gate` describe with the zero-arg structural proof); `di-container.test.ts` (+2: two resolves → same instance; two containers → distinct). **Full 088 + di suite 201/201 (30 files).**

**Verification:** biome clean; `just typecheck` — no new errors (same pre-existing DL-006 set). Live auth-gate behaviour with `DISABLE_AUTH` off + the real `E_BUNDLE_MISSING` path (uninstall the bundle → 503 on both) are recorded in the T009 sweep.

**Status:** code-complete. Committed `3f38ce12a`. **Companion (run …-0ccc): APPROVE** (0 findings) — "both gate through `requireRemoteViewSession()` before container resolution, no `NextRequest`/`next/headers`/local-auth path for those routes, null-session test proves 401 before daemon work … bundle fail-fast is guarded before `runWindowList()`, `ensureDaemon()`, and `daemonPort()` … the per-container memo closes the `/health`↔`/windows` same-control gap without global leakage." **Noted caveat (accepted residual):** the zero-arg structural assertion is not a *universal* future-proof — a future edit could read headers via `next/headers` `headers()` without a `req` param. It is sufficient for *this* change (the routes have no local-auth import and gate session-only); a deeper guard would be an architecture test asserting `/health`+`/windows` never import `requireRemoteViewAccess`/`headers` — deferred to T011 if pursued.

---

## T004 — Permissions UX (AC-14, plan 6.1)

**The gap:** a missing macOS TCC grant surfaced as a *silent black frame* or an opaque failure — the daemon's `/health.permissions` state and the WS `E_PERMISSION` close were never turned into an in-app fix path (the "no silent failure" requirement of AC-14). AC-14 is split: **T004 = the in-app UX** (this), **T010 = the how-to docs** the fix-path links point at.

**What changed**

- New `components/permissions-ux.ts` — **pure, jsdom-free** mapping (the `viewport-support.ts` pattern): `missingGrants(permissions)` returns the named grants the host Mac still owes, where **both `denied` AND `not-determined`** count as missing (a regression treating not-determined as "fine" would black-frame). `SETTINGS_URL` deep-links each grant to its exact System Settings → Privacy & Security pane via the macOS `x-apple.systempreferences:` scheme (`Privacy_ScreenCapture` / `Privacy_Accessibility`).
- New `components/permission-preflight-card.tsx` — presentational `PermissionPreflightCard`: renders **nothing** on the happy path (no nagging), else a named card per missing grant (label + why + a one-click "Open System Settings" deep-link) + a **Re-check** button so re-granting recovers without a reload.
- New `hooks/use-remote-view-health.ts` — `useRemoteViewHealth` reads `GET /api/remote-view/health` for the grant state while the picker is shown. **Permission-only + non-blocking**: a health failure leaves `permissions` null (the picker still loads), mirrors the `useRemoteViewWindows` fetch shape.
- `components/remote-view-panel.tsx` — wires the hook (enabled in picker mode) and renders the card **above** the picker; Re-check refreshes both health and the window list.
- `components/viewport.tsx` — the `E_PERMISSION` error card gains a one-click **Open Screen Recording settings** deep-link (the daemon's E_PERMISSION close = the capture grant), using the shared `SETTINGS_URL`.
- `apps/cli/.../remote-view.command.ts` — new pure `formatRemoteViewError(status, body)` maps the route's named code → an actionable message: **E_PERMISSION** names Screen Recording + Accessibility + the System-Settings path + `docs/how/remote-view.md`; **E_BUNDLE_MISSING** prescribes `just streamd-install`; an unnamed failure still reports the HTTP status (no silent swallow). Wired into `createRemoteViewRequest`'s `!res.ok` branch (which previously discarded the route body).

**Tests** — `permissions-ux.test.ts` (5: granted→[], denied/not-determined→named entry with the right deep-link, stable order, distinct panes); `permission-preflight-card.test.tsx` (3: renders nothing when empty, names each grant + correct href, fires Re-check once); `use-remote-view-health.test.tsx` (3: reads `/health` + surfaces grants when enabled, never fetches when disabled, non-blocking on failure); CLI `remote-view-command.test.ts` (+3: the three `formatRemoteViewError` branches); `remote-view-panel.test.tsx` (+ health-hook mock so the keystone url-composition assertions stay network-free). **Full 088 + CLI suite 208/208 (33 files).**

**Verification:** biome clean; `tsc` — no new errors on any touched file (same pre-existing DL-006 set elsewhere). The viewport `E_PERMISSION` deep-link render + the live revoke→card→re-grant→recover round-trip are owned by the T009 live sweep (the viewport itself is jsdom-untestable — WebCodecs); the pure helper + card + hook + CLI formatter unit-tests backstop the contract on this side.

**Status:** code-complete. Committed `1c5a38b93`. **Companion (run …-p6batch): review requested** — see verdict appended below.

**Companion (run …-4b08): T004 → APPROVE_WITH_NOTES** (0 CRITICAL / 0 HIGH / 1 MEDIUM / 0 LOW). Verified: `missingGrants()` correctly treats both `denied` and `not-determined` as actionable; the System-Settings pane IDs match the macOS Privacy panes; the CLI formatter preserves named route errors without double-reading the success body; the untested viewport `E_PERMISSION` link is acceptable (shared `SETTINGS_URL` is unit-tested, component is browser-smoke validated). **F001 (MEDIUM) — stale health refresh can override Re-check:** the manual Re-check path ignores `refresh()`'s cleanup, so a slow initial `/health` could resolve *after* a fast Re-check and overwrite the fresh grant state with stale denied data (the card reappearing after the user fixed the grant). **Fixed** (`239453d0e`): a monotonic `reqSeqRef` — only the latest refresh commits state (bumped on every refresh + on unmount); +1 test (two deferred fetches, the Re-check resolves first, the stale initial is dropped).

---

## T007 — Rebuild + smoke the CLI (AC-8 live, DL-001)

**The gap:** `apps/cli/dist/cli.cjs` was stale (21 Jun, pre-`remote-view` verbs), and the live CLI round-trip was never run.

**What changed**

- **Rebuilt** `apps/cli/dist/cli.cjs` (`pnpm -F build` → 24 Jun); `cg remote-view {list,attach,detach}` now ship (verified in the bundle + `remote-view --help`).
- New `just cli-build-check` (DL-001 **suggested encoding**): flags `dist/cli.cjs` older than any `apps/cli/src/**/*.ts` and exits non-zero (an agent/CI guard against shipping stale verbs) + a `just cli-build` convenience recipe.

**Live smoke vs the running `:3000` dev server** (real daemon, Screen Recording granted — `/windows` enumerated a live catalog):
- `cg remote-view list` → `[]` (authenticated via `X-Local-Token`, AC-8 read path round-trips). ✓
- `cg remote-view attach 26520` → POST `/sessions` → created `sess-26520-2` (a SessionSummary, state `idle`). ✓
- `cg remote-view detach <id>` → DELETE → idempotent (returns `{detached}`; route 204s). ✓

**The smoke caught a real production bug — DL-008 (the dogfood paying off again).** `list` returned `[]` *immediately after* a successful `attach`. Root cause: `REMOTE_VIEW_SERVICE` was registered as a **transient `useFactory`** (`di-container.ts:731`) — so every HTTP request built a *fresh* service with an empty in-memory session `Map`. `attach()` set instance A's map; the next request's `list()` read instance B's empty map → **GET /sessions is structurally always empty in production**. This is the *same* transient-`useFactory` class T008 fixed for the daemon-control but missed for the service; it breaks AC-8 ("list shows the active session") and undermines AC-7 session tracking.

**Fix:** memoize `REMOTE_VIEW_SERVICE` per-container (production + test) with a closure cell — the T008 pattern. `di-container.test.ts` (+3): two resolves → same instance; **cross-request `attach→list` visible** (the actual regression, would fail on a transient registration); per-container isolation. **222/222 (34 files).**

**Verification:** `tsc` + biome clean on touched files; `just cli-build-check` → ✓ up-to-date after the rebuild. The fix is **unit-proven** (the cross-request test passes with the memo, fails without). The *live* confirmation that `list` shows the session needs a **server restart** — the running dev server (pid 18250) built its DI container at boot (pre-fix), and the container is a boot-time singleton HMR won't rebuild → folds into the **T009** live sweep / the user's next `just dev`.

**Status:** code-complete. Committed `b5b64f4f3`. **Companion (run …-4b08): review requested** — see verdict below.

---

## T010 — Docs: how-to + domain.md + README (plan 6.3, AC-14)

**New `docs/how/remote-view.md`** — the fresh-reader setup + ops guide:
- **One-time setup** (`just streamd-setup` cert → `just streamd-install` bundle; why the stable cert+id keep TCC grants across rebuilds; `just streamd-kill`).
- **Secure-context story** — a table of the three origins (localhost = secure → direct `ws://`; HTTPS = secure → same-origin `wss://host/remote-view-ws` proxy; plain-http LAN = **not** secure → WebCodecs off, the overlay names it).
- **HTTPS / LAN access** — the **Caddy + Porkbun DNS-01** recipe with the load-bearing `handle_path /remote-view-ws/*` **prefix-strip** (the daemon upgrades ONLY `/stream`; a bare `reverse_proxy /remote-view-ws/*` → daemon 404s) + the env block (`CG_REMOTE_VIEW__ALLOWED_ORIGINS`, `AUTH_TRUST_HOST`, `AUTH_URL`, `CG_REMOTE_VIEW__DAEMON_PORT`).
- **Using it** (launch button / palette / `cg remote-view` + MCP) and **Permissions (AC-14)** — the three surfaces (preflight card / viewport deep-link / CLI message).
- **Troubleshooting table keyed by error code** — every user-facing code has a row: secure-context overlay, `E_BUNDLE_MISSING`, `E_PERMISSION`, `E_ORIGIN` (4402), `E_AUTH` (4401), `E_VERSION`, `E_WINDOW_GONE`, `E_SESSION_UNKNOWN`, `E_INTERNAL` — each with its fix; plus the "connects-but-black over HTTPS → check the prefix-strip" pointer.

**`docs/domains/remote-view/domain.md`** — § Concepts finalized: added the Phase-5 **Agent Surface + Lifecycle** row (routes/manager/reaper/SDK/CLI/MCP/SSE + the per-container singleton service) and the Phase-6 **Connection & Secure-Context Transport** + **Permissions UX** rows; updated the trailing note; added a Phase-6 History row.

**`README.md`** — new **## Remote View** section (what it is, the launch affordance, the one-time setup, a link to the how-to).

**Verification:** the how-to's internal anchors (`#https--lan-access`, `#permissions-ac-14`) resolve to real headers; referenced files (`domain.md`, `.env.example`) exist. AC-14 docs half complete (T004 = the in-app half).

**Status:** docs-complete. (No code; not sent for companion review — docs task.)

---

## T009 — LIVE AC sweep, measured (plan 6.2)

**Nature of this task:** the integration moment — it requires a **real browser on the host Mac** (authenticated NextAuth session) attaching real Godot / iOS-Simulator windows and **visually observing frame decode** + reading the HUD for fps/latency + exercising input fidelity. Those rows cannot be produced headless and must not be fabricated (harness invariant: never invent a measurement). Below: every row that IS verifiable from this (headless) session is recorded with its evidence; the visual/measured rows are scaffolded **PENDING-LIVE** with the exact step to run.

### Already-green substrate (gating tasks T001–T008, this session)

- **Daemon live + registered**: 1 `streamd` (pid 19367) ↔ exactly 1 registry file `.chainglass/streamd-3000.json` (web-port-keyed to the running :3000 server) — no unregistered process.
- **`/windows` enumerates a live catalog** (Screen Recording granted) — verified via the T007 smoke.
- **AC-8 CLI round-trip** (list/attach/detach) against :3000 — verified (T007), incl. the DL-008 fix.
- **Phase-4 host-Mac live smoke** (already on record, domain.md History): live Simulator capture id=649 904×1900 `avc1.640020@60`, displacement 4002, auth 4401/4402, the 4 live input bugs fixed — i.e. the daemon's capture/encode/input path is live-proven; T009 is the **browser-side** decode + end-to-end integration on top of the now-wired connection (T001).

### Measurement Sheet — `| AC | Measured value | Pass threshold | Verdict | Notes |`

| AC | Measured value | Pass threshold | Verdict | Notes |
|----|----------------|----------------|---------|-------|
| AC-1 (attach→frame) | _pending-live_ | ≥1 frame visible | **PENDING-LIVE** | Needs host-Mac browser. Substrate green: T001 wired the real `ws://` url; daemon decodes live (Phase-4). Run: open `http://localhost:3000` → Remote View → pick Simulator/Godot → expect canvas frames. |
| AC-2 fps | _pending-live_ | ≥30 fps sustained | **PENDING-LIVE** | Read HUD fps over ~30s of motion. |
| AC-2 latency | _pending-live_ | ≤150 ms | **PENDING-LIVE** | HUD rtt over ~30s; budget 35–65ms typical. |
| AC-3 (Godot click/drag/scroll/type) | _pending-live_ | lands at correct coord | **PENDING-LIVE** | Closes FT-008/009; daemon input live-fixed in Phase 4. |
| AC-4 (Simulator tap/type) | _pending-live_ | correct | **PENDING-LIVE** | |
| AC-6 (refresh reattach) | _pending-live_ | ≤3 s | **PENDING-LIVE** | `rv` persists in the URL; T001 rebuilds the url on reload. |
| AC-7 (two-tab displace/reclaim) | _pending-live_ | latest wins; reclaim; no wedge | **PENDING-LIVE** | FSM displacement is unit + daemon-smoke proven (4002); this is the browser pairing. |
| AC-10 (minimize/close) | _pending-live_ | auto-restore; "window gone" not black | **PENDING-LIVE** | |
| AC-11 (orphans) | **0 orphans (snapshot)** | 0 stale | **PARTIAL-PASS** | Current state: 1 daemon, registered to the live web server, no orphan. Cross-`just dev`-cycle (kill web mid-stream → restart → 0 orphan) is **PENDING-LIVE**; the reaper (T006, wired at boot) is the mechanism (unit-tested + boot breadcrumb). |
| Workshop-004 (version-mismatch respawn) | _pending-live_ | graceful shutdown + respawn | **PENDING-LIVE** | Run old daemon + new web build → attach. |

**To complete the live rows** (host-Mac session, authenticated browser): start `just dev`, ensure `just streamd-install` is current, open `http://localhost:3000`, and walk the sheet — recording each measured value + PASS/FAIL here. Any AC-2 miss: apply the Workshop-003 knob (frame-request rate first, then encode bitrate). **NOTE:** the `list`-shows-session live confirm (DL-008 fix) rides along — after this server restart the running web server will hold the post-fix DI container, so `cg remote-view list` will show a browser-attached session.

**Status:** headless-measurable rows recorded (AC-11 snapshot PASS; AC-8/daemon substrate green); the visual/measured rows are **PENDING the host-Mac live session** — the one genuinely un-headless-able part of Phase 6. Not code-blocking: T001–T008, T010, T011 are complete + green.

---

## Companion verdicts — T007 + T011 (run …-4b08)

**T007 + F001 → APPROVE** (0 findings). The companion confirmed: the per-container service memo closes the DL-008 `list`-always-empty gap without a global leak (distinct containers stay isolated), sharing one service instance across requests is correct (the session `Map` is the intended source of truth, synced by attach/detach), and the `reqSeqRef` latest-wins guard + the unmount bump fully close the F001 stale-overwrite race.

**T011 → APPROVE_WITH_NOTES** (0 CRITICAL / 0 HIGH / 0 MEDIUM / 1 LOW). Confirmed the 5 typecheck fixes weaken nothing: `Partial<NodeJS.ProcessEnv>` matches the fields actually read; the fetch-spy still asserts method + JSON body; the commander import from the CLI's own dependency is the right call for the monorepo type-identity mismatch; `.minih` belongs in the runtime ignore set alongside `.chainglass`/`.harness`/`agents/*/runs/**`; the arch guard correctly skips `requireRemoteViewSession` while catching `requireRemoteViewAccess`. **F002 (LOW) — the `next/headers` regex only caught static imports** (narrower than the guard's prose). **Fixed** (`0acb43925`): broadened to `/['"]next\/headers['"]/` so a dynamic `import()`/`require()` can't false-pass; whole-word `requireRemoteViewAccess` kept.

**Phase-6 companion tally:** every code task live-reviewed; verdicts T001/T002/T003/T005/T006/T008 APPROVE, T004 APPROVE_WITH_NOTES (F001 fixed), T007 APPROVE, T011 APPROVE_WITH_NOTES (F002 fixed). 2 real findings caught + fixed (F001 fetch-race, F002 guard-narrowness); 1 real defect caught by the live dogfood smoke (DL-008 service-transient).
