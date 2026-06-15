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

(Daemon, agent verbs, SSE/GlobalState publishing — designed in
Workshops 001/002/003/004; land in Phases 4–5.)

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
- Tests: `test/unit/web/features/088-remote-view/`, `test/contracts/remote-view-*`, `test/unit/web/architecture/platform-no-remote-view.test.ts`

## History

| Plan | What Changed | Date |
|------|-------------|------|
| 088 Phase 2 | Domain created. Wire protocol (Zod messages + 16-byte binary codec) + cross-language fixtures; frame-replay fake (AC-12); session state machine (10 states, R1–R9) + reconnect hook; NextAuth token route (`aud=remote-view-ws`) + pinned auth vectors; `IRemoteViewService` + fake + DI + contract suite. All web-side, daemon-absent, TDD. | 2026-06-15 |
| 088 Phase 3 | Viewport UI & content-area mode (Hybrid). `view=remote` + `rv` params (extends the recent-feed precedent — no PanelShell change, Finding 01); lazy `RemoteViewPanel`; window picker (loader-hook seam — this app has **no client DI**, service is server-only); WebCodecs viewport decode core + HUD (fps/rtt/bitrate/dropped) + all 10 state-chrome (displaced reclaim card, named-grant error) + normalized rAF-batched input capture (focus-gated). Additive `useRemoteViewSession` extension (video + telemetry plane: `onVideoConfig/onFrame/onStats/onPong/requestKeyframe/ping/sendInput`, all 56 Phase-2 tests unchanged). Validation: 64 unit tests + host streaming smoke (real Chrome, 67 H.264 frames via WebCodecs) + bundle guard (AC-13, vs real build). Companion: 9 findings (2 HIGH) all resolved. | 2026-06-15 |
