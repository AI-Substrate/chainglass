# Remote App View — single-window desktop streaming into the content area

**Mode**: Full
**Created**: 2026-06-12 · **Spec for**: docs/plans/088-remote-app-view

📚 Specification incorporates findings from research-dossier.md (8-subagent codebase research + completed external research in `external-research/streaming-stack.md`).

## Research Context

- Every web-side integration surface is **precedented and additive**: sidecar lifecycle (PID registry + reaper, Plan 064), auth (bootstrap-code JWT/HKDF + Origin allowlist, Plans 063/084 — frozen contracts, reused verbatim), layout (PanelShell rightPane + overlay events), SDK/CLI/MCP command registration (Plan 047), SSE domain envelopes (ADR-0007/0010).
- The **capture daemon is the only novel artifact**: a native macOS streamer (ScreenCaptureKit per-window capture + hardware H.264 + input injection), the repo's first non-Node sidecar, with its own build/signing/permission story.
- **Remote view is not a file**: the file viewer's mode system is file/MIME-coupled; remote view enters as a content-area-level mode beside the file viewer, inheriting terminal-over and terminal-beside for free.
- External research is complete; remaining unknowns are spike-shaped (capture fidelity for Godot/Simulator, input injection fidelity, browser decode config) — see Phase risks.

## Summary

Add a **remote view** mode to the chainglass content area: a live, interactive stream of ONE desktop app window (a running Godot game, the iOS Simulator) from the machine chainglass runs on, viewable and clickable from the browser. Not remote desktop — single-window only. The terminal keeps working over or beside it. Agents can list windows, attach, and detach via chainglass commands so they can hand the user a running app ("launched the game — it's in your remote view").

## Goals

- See and interact with one running desktop app from the browser with game-dev-usable latency and frame rate.
- Mouse (click/drag/scroll) and keyboard pass through to the target app, correctly mapped.
- Sessions survive browser refresh; attaching/detaching is cheap and repeatable.
- Agent-native control: list/attach/detach as CLI + MCP + SDK commands and URL-addressable state.
- Zero disturbance to existing flows: file viewing, terminal over/beside, in-flight Plans 085/087.
- Web feature fully buildable and testable without the native daemon (frame-replay fake).

## Non-Goals

- Full remote desktop, multi-window mosaics, or screen-region capture.
- Multi-viewer / collaboration (single viewer per session in v1).
- Windows/Linux host capture (macOS-only v1; architecture shouldn't preclude later ports).
- Audio capture/streaming (v1 is video + input only).
- Low-latency competitive gameplay (this is dev iteration, not Moonlight).
- General-purpose desktop automation API (input goes only to the attached window's app).
- Safari as a gating target (v1 acceptance runs on Chromium; Safari is best-effort — spike still verifies decode support, issues go to backlog).

## Target Domains

| Domain | Status | Relationship | Role in This Feature |
|--------|--------|-------------|---------------------|
| remote-view | **NEW** | **create** | The feature domain: stream sessions, daemon lifecycle, viewport UI, input forwarding, agent verbs |
| _platform/auth | existing | **consume** | NextAuth route gating + bootstrap-code JWT/HKDF token minting for the stream socket (frozen contract, reused verbatim) |
| _platform/panel-layout | existing | **modify** | Small additive change: a content-area mode switch `{file-viewer \| remote-view}` so remote view composes with terminal over/beside |
| _platform/events | existing | **consume** | New domain envelope on the single SSE channel for session-state pushes (additive, within the events extension contract) |
| _platform/state | existing | **consume** | Publish connection/quality state under `remote-view:<session>:*` |
| _platform/sdk | existing | **consume** | Command/settings contributions (`remote-view.list/attach/detach`) |
| workspace / _platform/workspace-url | existing | **consume** | Workspace/worktree scoping of routes and URL state |

### New Domain Sketches

#### remote-view [NEW]
- **Purpose**: Stream a single host-machine app window into the browser content area with input forwarding, as an agent-controllable session.
- **Boundary Owns**: stream session model (attach/detach/reattach, single-viewer policy); streamer daemon lifecycle + discovery; the viewport UI (canvas, stats HUD, picker); input capture + forwarding semantics; agent verbs (CLI/MCP/SDK) and their routes.
- **Boundary Excludes**: file viewing (`_platform/viewer`); terminal anything (`terminal` — sibling, patterns copied not shared); auth/key material (`_platform/auth`); generic layout (`_platform/panel-layout`); video infrastructure for other consumers (none exist — stays in-domain until a second consumer appears).
- **Domain Review**: approved as sketched (Session 2026-06-12) — new business domain, leaf-like, dependency-direction guard required.

## Testing Strategy

- **Approach**: Hybrid (from clarifications)
- **Rationale**: Protocol/session logic has race-condition history (Plan 064 learnings) → TDD with fakes. Canvas/video UI proves better under browser smoke than unit assertions. Native daemon can't run in CI without macOS capture permissions → manual smoke + spike evidence.
- **Focus Areas (TDD, fakes-first)**: stream WS framing + control messages (discriminated unions from day one); session state machine (attach/detach/reattach/refresh races); token minting + origin/auth rejection paths; daemon registry/reaper logic; SDK/CLI/MCP command handlers.
- **Browser smoke (Playwright+CDP, frame-replay fake)**: frames render to canvas; mode switch composes with terminal over/beside; input events serialize correctly; bundle guard (viewport lazy-loaded, base bundle unchanged).
- **Manual/spike (native)**: live capture of Godot + iOS Simulator; input fidelity (click/drag/scroll/type, Simulator tap translation); minimized/closed window behavior; TCC permission flows.
- **Excluded**: load/perf benchmarking beyond the stats HUD; multi-viewer scenarios (non-goal); non-macOS hosts.
- **Mock Usage**: Fakes, no mocks (repo constitution). The **frame-replay fake** (recorded encoded frames served over a stub WS) is a first-class deliverable — the entire web feature builds against it.

## Documentation Strategy

- **Location**: Hybrid — README quick-start mention + `docs/how/remote-view.md` (daemon install, macOS Screen Recording + Accessibility permission grants, agent commands, troubleshooting) + `docs/domains/remote-view/domain.md`.
- **Rationale**: The TCC permission dance and daemon setup genuinely need a walkthrough; agent verbs need discoverable reference.

## Complexity

- **Score**: CS-5 (epic, low end)
- **Breakdown**: S=2 (two runtimes: native daemon + web feature + routes + CLI/MCP/SDK), I=2 (auth, layout, events, state, SDK, CLI — all additive but many), D=1 (ephemeral session state + registry files; no persistent schema), N=2 (native capture/encode + browser decode — nothing like it in repo), F=2 (latency targets; input injection is a real security surface; OS permissions), T=1 (frame-replay fake makes web side cheap; native side is manual)
- **Confidence**: 0.75
- **Assumptions**: host is macOS 14+ Apple Silicon with desktop access for one-time permission grants; single HTTPS origin reachable from browser (tunnel/tailnet); Godot runs windowed (not fullscreen-exclusive) during dev.
- **Dependencies**: frozen auth/discovery contracts (bootstrap-code.json, server.json); PanelShell content slot; in-flight Plans 085/087 (merge-order coordination, not code dependency).
- **Risks**: see Risks & Assumptions.
- **Phases (anticipated)**: ① de-risk spike (capture + input fidelity, decode config) → ② stream protocol + session service + fakes (web, TDD) → ③ viewport UI + content-area mode + layout composition → ④ native daemon (capture/encode/input/control API) → ⑤ agent surface (CLI/MCP/SDK/routes) + SSE state → ⑥ integration hardening + docs + permissions UX. (Architect owns final cut.)

## Acceptance Criteria

1. **Window picker**: from the browser, the user can list capturable windows on the host (app name, window title, live thumbnail) and attach to one. (Host enumeration + thumbnails are provided by the web-side daemon manager; a spawned daemon streams exactly one window — its `/windows` reports just that attached window.)
2. **Live stream**: attached to a running Godot game window, the content area shows live video ≥30fps sustained (60fps target) at the window's native resolution, with measured glass-to-glass latency ≤150ms on LAN/tailnet, readable from a stats HUD.
3. **Input round-trip**: clicking, dragging, scrolling, and typing in the viewport land in the target app at the correct coordinates (Retina scaling + window chrome accounted for) — verified live against Godot and a text field.
4. **iOS Simulator**: clicks translate to taps and typed text arrives — verified live against a booted Simulator.
5. **Layout composition**: with remote view active, terminal-over (overlay) and terminal-beside (right pane) both work unchanged; switching back to the file viewer restores prior file state.
6. **Reattach**: a browser refresh while attached resumes the same stream session automatically within 3s, without restarting the target app or daemon.
7. **Single viewer — latest attach wins**: a second browser context attaching to a live session takes it over deterministically; the displaced viewport shows "viewing elsewhere — click to reclaim" and reclaiming works. No frozen/split streams, no wedged locks after a crashed tab.
8. **Agent control**: `remote-view list|attach|detach` work via CLI and MCP; an agent-issued attach switches the user's content area via a pushed event; state is URL-addressable (refresh/deep-link restores).
9. **Auth**: the stream connection is rejected without a valid short-lived token minted through the existing session auth; cross-origin connects are rejected (origin allowlist) — same guarantees as the terminal socket.
10. **Window state handling — auto-restore**: attaching to (or interacting with) a minimized target window un-minimizes it automatically and the stream resumes; a closed window yields a clear "window gone" viewport state with a path back to the picker. Never a silent black frame.
11. **Lifecycle hygiene**: daemon is spawned/discovered/reaped through the established `.chainglass/` registry pattern; stale daemons from crashed sessions are reaped fail-closed on next boot; no orphaned processes after `just` dev cycles.
12. **Fake-first web build**: the full web feature (viewport, session logic, commands) runs and passes its tests against the frame-replay fake with no native daemon present.
13. **Bundle guard**: viewport/decoder code is lazy-loaded; base bundle size unchanged (existing AC-10 guard pattern extended).
14. **Permissions UX**: with Screen Recording or Accessibility not yet granted, the UI/CLI reports exactly which grant is missing and how to fix it (no silent failures); `docs/how/remote-view.md` documents the one-time setup.

## Risks & Assumptions

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Capture of Metal-rendered windows (Godot) or Simulator has fidelity gaps (black frames, minimize behavior) | Medium | High | Phase-① spike before web build commits; documented fallbacks (restore-on-attach) |
| Input injection unreliable for some apps (raw-input games, fullscreen-exclusive) | Medium | Medium | Focus-follows-stream model; document windowed-mode requirement; spike validates Godot + Simulator specifically |
| Browser decode support varies (Safari config) | Low-Med | Medium | Spike verifies decode config across target browsers; scope decision in clarifications |
| Native build/signing/TCC complicates dev setup | Medium | Medium | Daemon ships as signed app bundle; permissions UX (AC-14); how-to doc |
| Input forwarding = remote control of the host's apps (security surface) | Low | High | Same auth bar as terminal (which already grants shell access — equivalent trust); input only to attached window's app; no general automation API |
| Collision with in-flight Plans 085/087 around viewer/layout | Medium | Low-Med | Content-area switch touches PanelShell, not FileViewerPanel; coordinate merge order |
| TCP transport stalls on lossy links (head-of-line blocking) | Low (LAN/tailnet) | Medium | Drop-on-backpressure policy; v2 escape hatch to WebRTC documented, not built |

**Assumptions**: macOS 14+ Apple Silicon host; user has one-time desktop access for permission grants; dev-box trust model (focus-stealing acceptable; nobody is sitting at the host); single viewer is the real usage.

## Open Questions

(Resolved via Clarifications below; survivors tracked there.)

## Workshop Opportunities

| Topic | Type | Why Workshop | Key Questions |
|-------|------|--------------|---------------|
| Content-area mode mechanics | Integration Pattern | The `{file-viewer \| remote-view}` switch touches PanelShell, nuqs URL state, and overlay coexistence — and must dodge Plans 085/087 | Where does the mode live (URL param shape)? What restores on switch-back? How does the picker open? |
| Session & reattach state machine | State Machine | Refresh/second-tab/agent-attach races bit Plan 064; policy decided but transitions need drawing | Full state chart: attaching→live→degraded→detached; reattach token; daemon-side session GC |
| Stream WS protocol | API Contract | Discriminated message framing from day one (PL-03 lesson); versioning for v2 transport | Frame/control/input/stats message shapes; keyframe request; backpressure signals; protocol version field |
| Daemon packaging & discovery | Other | First non-Node artifact: build, signing, distribution, spawn-vs-preinstalled, registry shape | SwiftPM/Xcode build in repo? Prebuilt binary? Who spawns it? What's in its pids/server.json entries? |

## Clarifications

### Session 2026-06-12

- Q: Workflow Mode? → A: **Full** (CS-5 borderline, multi-domain, two runtimes)
- Q: Testing Strategy? → A: **Hybrid** — TDD via fakes for protocol/session/auth; Playwright+CDP smoke with frame-replay fake for UI; manual/spike for native capture+input
- Q: Mock Usage? → A: **Fakes, no mocks** — repo constitution; frame-replay fake is a first-class deliverable
- Q: Documentation Strategy? → A: **Hybrid** — README mention + `docs/how/remote-view.md` + domain.md
- Q: Domain Review — `remote-view` as a NEW business domain, sibling of terminal, consuming only _platform contracts? → A: **Approved as sketched** (leaf-like, dep-direction guard)
- Q: Single-viewer policy on second attach? → A: **Latest attach wins**; displaced viewport shows "viewing elsewhere — click to reclaim"
- Q: Minimized target window behavior? → A: **Auto-restore** on attach/interaction (dev-box trust model)
- Q: Browser scope v1? → A: **Chromium-gating, Safari best-effort** (spike still verifies Safari decode; issues → backlog)
