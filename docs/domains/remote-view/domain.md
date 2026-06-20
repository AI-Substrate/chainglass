# Domain: Remote View

**Slug**: remote-view
**Type**: business
**Created**: 2026-06-15
**Created By**: Plan 088 — remote app view (stream one desktop app window into the browser)
**Status**: active

## Purpose

Stream a single desktop application window (e.g. a Godot game, the iOS Simulator) from
the host Mac into the browser content area, with live mouse/keyboard interaction. The
terminal keeps working over or beside it. Agents can list windows, attach, and detach
via chainglass commands. One session ↔ one target window ↔ **at most one viewer**
(single-viewer v1; latest-attach-wins).

## Boundary

**Owns**:
- Stream **session** model: attach / detach / reattach, single-viewer policy, the
  daemon-authoritative session table.
- Streamer **daemon** lifecycle + discovery (Phases 4/5).
- The **viewport UI**: canvas, stats HUD, window picker (Phase 3).
- **Input** capture + forwarding semantics (normalized `[0,1]` coords, DOM `code`, rAF batching).
- **Agent verbs** (CLI / MCP / SDK) and their routes (Phase 5).
- The **wire protocol** (JSON control + binary video) and its **frame-replay fake**.

**Excludes**:
- File viewing → `_platform/viewer`.
- Terminal anything → `terminal` (sibling; patterns copied, never shared).
- Auth / key material → `_platform/auth` (consumed verbatim — frozen bootstrap-code HKDF contract).
- Generic layout → `_platform/panel-layout` (content-area mode switch only).
- Video infrastructure for *other* consumers (none exist — stays in-domain until a second appears).

## Concepts (ADR-0011)

| Concept | What it is | Entry points |
|---|---|---|
| **Wire Protocol** | The WS contract between viewport and daemon — JSON control (discriminated on `t`) + a 16-byte-header binary video plane. Mirrored as Swift `Codable` in the daemon. | `protocol/messages.ts` (Zod), `protocol/binary.ts`, `protocol/fixtures/{messages,frame-header}.json` |
| **Frame-Replay Fake** | A Node `ws` server that *is* a third implementation of the protocol — replays recorded H.264 fixtures and scripts every race cue. The daemon-absent test substrate (AC-12). | `testing/fake-streamd.ts`, `protocol/fixtures/video/` |
| **Viewport Machine** | The client-side state machine the user sees: `picker → attaching → live → degraded/reconnecting/displaced/windowGone/sessionLost/daemonDown/error`. Pure transitions + a reconnect hook. | `server/session-machine.ts`, `hooks/use-remote-view-session.ts` |
| **Session** | The unit of "one window streamed to one viewer". Listed / attached / detached through a service interface (real adapter Phase 5). | `server/remote-view-service.ts` (`IRemoteViewService`, `SessionSummary`) |
| **Token Route** | A NextAuth-gated mint of a short-lived JWT for the stream socket — the same bar as the terminal socket (AC-9), `aud: remote-view-ws`. | `app/api/remote-view/token/route.ts` |
| **Content-Area Mode + Viewport** (Phase 3) | The user-visible remote view: `view=remote` + `rv` URL mode (content-area swap, no PanelShell change), lazy `RemoteViewPanel` → window picker → WebCodecs viewport (canvas decode, stats HUD, all 10 states, input capture). Daemon-absent vs the fake (AC-12); viewport code-split (AC-13). | `components/{remote-view-panel,window-picker,viewport}.tsx`, `hooks/{use-remote-view-windows,use-input-capture}.ts`, `params/remote-view.params.ts` |
| **Streamer Daemon `streamd`** (Phase 4) | The native Swift daemon that turns the frame-replay fake into a real streamer: captures one window (ScreenCaptureKit) → encodes low-latency H.264 (VideoToolbox) behind a `FrameSource` seam (fixture replay vs live capture), speaks the wire protocol, injects input (CGEvent), runs the session FSM. Outside the pnpm graph; signed `ChainglassStreamd.app` (stable cert+id so TCC grants persist). | `native/streamd/Sources/streamd/{main,WSServer,Capture,Encoder,FrameSource,Input,SessionTable}.swift` |
| **Daemon Control API** (Phase 4) | The daemon's host-local HTTP+WS surface, **bound to loopback only** and **JWT-gated except `GET /health`** (proxied by Next in Phase 5): `/health` (versions + named TCC grants), `/windows` (**narrowed: the single attached-window descriptor**, not a picker catalog — F005), `/sessions` CRUD → flat `SessionSummary`, `POST /shutdown` (graceful), `/stream` WS upgrade (`hello-ok`→`video-config`→keyframe→deltas). Session-affecting WS controls are gated on the attached viewer. | `WSServer.swift`, `Endpoints.swift` |
| **Discovery Registry** (Phase 4) | A **web-port-keyed** `.chainglass/streamd-<webPort>.json` file written on listen (atomic temp+rename), holding the full `RegistryFile{pid, port, protocolVersion, daemonVersion, bundleId, bundlePath, startedAt}` for Phase-5 discovery. **Filename vs field**: the filename key is the *web* port (`<webPort>`); the JSON `port` field is the daemon's own listen port (`webPort+1501`). Removed on graceful exit; the daemon self-exits (~30s poll) if its registry file vanishes. SIGTERM → `bye{shutdown}` → exit. | `Registry.swift` |

(Agent verbs (CLI/MCP/SDK) + SSE/GlobalState publishing — designed in
Workshops 001/002/003/004; land in **Phase 5**. The daemon + control API + registry landed in **Phase 4**.)

## Dependencies

| Depends On | Contract Used | Wired |
|---|---|---|
| _platform/auth | `getBootstrapCodeAndKey`, `verifyCookieValue`, `findWorkspaceRoot`, `BOOTSTRAP_COOKIE_NAME`, `SignJWT` — frozen HKDF mint (Finding 03) | Phase 2 (token route) |
| _platform/auth (Origin allowlist) | `buildDefaultAllowedOrigins`, `parseAllowedOrigins` (mirrored in the Swift daemon) | Phase 4 |
| _platform/events | SSE envelope `remote-view.*` (attached / detached / daemon-state) | Phase 5 |
| _platform/state | GlobalState `remote-view:<session>:*` (connection + quality) | Phase 5 |
| _platform/sdk | `remote-view.list/attach/detach` commands + settings | Phase 5 |
| _platform/panel-layout | content-area mode switch `{file-viewer \| remote-view}` | Phase 3 |

**Dependency direction**: `_platform` must NEVER import `remote-view` (enforced by
`test/unit/web/architecture/platform-no-remote-view.test.ts`). `remote-view` consumes
`_platform/*` contracts only.

## Source Location

- `apps/web/src/features/088-remote-view/` — `protocol/`, `server/`, `hooks/`, `testing/`, `params/`, `sdk/`, `components/`
- `apps/web/app/api/remote-view/` — route handlers
- `native/streamd/` — **the native Swift daemon** (outside the pnpm/turbo graph): `Sources/streamd/{main,Config,CoreGraphicsInit,Protocol,BinaryFrame,Auth,SessionTable,FrameSource,Capture,Encoder,WebSocket,Endpoints,WSServer,Input,Registry}.swift`; `Tests/streamdTests/`; `scripts/{setup-cert,make-bundle,smoke-headless.mjs,lifecycle-headless.mjs,live-smoke.mjs}`. Recipes `streamd-{setup,build,test,smoke,install,kill}`.
- Tests: `test/unit/web/features/088-remote-view/`, `test/contracts/remote-view-*`, `test/unit/web/architecture/platform-no-remote-view.test.ts`; daemon-side `swift test` (75) + `just streamd-smoke` (40 live-socket checks: 34 wire incl. REST-auth/loopback/pre-hello/malformed-body/oversize-frame/session-body/pause-lifecycle negatives + 6 lifecycle) + `live-smoke.mjs` (12 host-Mac live-capture checks)

## History

| Plan | What Changed | Date |
|------|-------------|------|
| 088 Phase 2 | Domain created. Wire protocol (Zod messages + 16-byte binary codec) + cross-language fixtures; frame-replay fake (AC-12); session state machine (10 states, R1–R9) + reconnect hook; NextAuth token route (`aud=remote-view-ws`) + pinned auth vectors; `IRemoteViewService` + fake + DI + contract suite. All web-side, daemon-absent, TDD. | 2026-06-15 |
| 088 Phase 4 | **Native daemon (`streamd`, Swift)** — turns the frame-replay fake into a real streamer. Codable protocol mirror + 16-byte binary codec (byte-identical to Phase-2 fixtures); HKDF+HS256 JWT verify + Origin gate (auth vectors); Workshop-002 session FSM (R1–R9 + grace + heartbeat); SCK→VideoToolbox capture/encode behind a `FrameSource` seam (fixture replay vs live capture); hand-rolled RFC 6455 WS server + REST (`/health`, `/windows`, `/sessions`, `/shutdown`) composing all of the above; CGEvent input injector; discovery registry + SIGTERM/vanish lifecycle. **Host-Mac visit COMPLETE (2026-06-16)** — signed install (T001) + live smoke against a real iOS Simulator stream (T009): `swift test` **66**, `just streamd-smoke` **24**, `live-smoke.mjs` **12/12** (live capture id=649 904×1900 avc1.640020@60, displacement 4002, auth 4401/4402, registry/SIGTERM). Both TCC grants carried over from the spike's cert+bundle (Finding 02 — no prompt). T009 found + fixed **4 live input bugs** in `Input.swift` (focus-follows no-op on macOS 14+, drag-as-tap, text stuck-key, multi-key focus churn). Batch A.2 + the host-Mac visit ran no-companion (minih targetable-run bug #47/#50). | 2026-06-15..16 |
| 088 Phase 4 (review fixes) | Stage-7 review → REQUEST_CHANGES (5 HIGH + 9 MEDIUM) addressed. **HIGH (verified headless):** loopback-only listener bind; JWT on every REST endpoint except `/health`; WS controls gated on the attached viewer (no pre-`hello`/displaced control); validated `Content-Length` (neg/malformed → 400, body/head caps); `/windows` formally **narrowed** to the single attached-window descriptor (picker catalog → Phase-5 web-side). **MEDIUM (code-complete, live deferred to Phase 6):** wheel focus+location, `E_PERMISSION` preflight routing, runtime display backing-scale, AX minimize-restore. Docs: evidence overclaims corrected, domain docs updated, `streamd-kill` no longer broad-`pkill`s the shared bundle path. `swift test` **70**, `just streamd-smoke` **35**. | 2026-06-16 |
| 088 Phase 4 (re-review fixes) | Stage-7 re-review → REQUEST_CHANGES (1 new HIGH + 9 MEDIUM + 2 LOW) addressed. **HIGH (verified headless):** `streamd-kill` now validates a positive-nonzero PID **and** confirms the live process is a `streamd` before `kill -- "$pid"` — a malformed/stale/foreign registry pid can no longer signal a process group or unrelated process. **MEDIUM (code + test):** resume the frame source on attach (orphaned-pause wedge); cap WS frame length + fragment buffer (no `Int` trap / unbounded buffer); clamp wheel `dx/dy` into `Int32`; derive a truthful `avc1.PPCCLL` from the actual avcC; fail-fast on invalid `CG_REMOTE_VIEW__DAEMON_PORT`; require a valid live `CG_REMOTE_VIEW__WINDOW_ID`; `400` on malformed `POST /sessions`. **Docs:** daemon `/windows` single-window contract aligned in plan/spec; Phase-4 task done-whens split code/headless vs Phase-6-live; registry concept completed; Remote View C4 component added. `swift test` **75**, `just streamd-smoke` **40**. | 2026-06-20 |
| 088 Phase 3 | Viewport UI & content-area mode (Hybrid). `view=remote` + `rv` params (extends the recent-feed precedent — no PanelShell change, Finding 01); lazy `RemoteViewPanel`; window picker (loader-hook seam — this app has **no client DI**, service is server-only); WebCodecs viewport decode core + HUD (fps/rtt/bitrate/dropped) + all 10 state-chrome (displaced reclaim card, named-grant error) + normalized rAF-batched input capture (focus-gated). Additive `useRemoteViewSession` extension (video + telemetry plane: `onVideoConfig/onFrame/onStats/onPong/requestKeyframe/ping/sendInput`, all 56 Phase-2 tests unchanged). Validation: 64 unit tests + host streaming smoke (real Chrome, 67 H.264 frames via WebCodecs) + bundle guard (AC-13, vs real build). Companion: 9 findings (2 HIGH) all resolved. | 2026-06-15 |
