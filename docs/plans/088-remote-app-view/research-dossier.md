# Research Report: Remote App View — single-window desktop streaming into the chainglass content area

**Generated**: 2026-06-12T23:30:21Z
**Research Query**: "Remote view mode for chainglass: stream a single desktop app window (Godot game, iOS Simulator) from the host Mac into the content area with mouse/keyboard input; terminal over/beside it; agent-controllable via CLI/URL endpoints"
**Mode**: Plan-Associated (docs/plans/088-remote-app-view)
**FlowSpace**: Available (used by subagents alongside standard tools)
**Findings**: ~75 across 8 parallel subagents (IA/DC/PS/QT/IC/DE/PL/DB), synthesized below
**Harness**: eng-harness router installed on machine; repo has not adopted a harness (`.harness/` absent) — proceeding without one; standard testing applies.

## Executive Summary

### What It Does (the existing system)

Chainglass is a Next.js 16.2.6 pnpm monorepo (apps/web, apps/cli, packages/shared + others) serving a remote-dev web UI: an xterm.js terminal backed by a **separate sidecar WebSocket process**, and a **content area** (FileViewerPanel) with switchable view modes (source/rich/preview/diff). The terminal can overlay the content area or sit beside it (PanelShell `rightPane`). Agents control the app through CLI commands + MCP tools registered via the USDK contribution pattern.

### Business Purpose of This Research

The Remote App View feature adds a fifth kind of content: a live, interactive video stream of ONE macOS app window (not remote desktop), so the user can see and click a running Godot game or iOS Simulator from the browser. This research maps every integration surface the feature must plug into and confirms the external streaming stack.

### Key Insights

1. **Everything web-side is precedented and additive.** Sidecar lifecycle (PID registry + reaper + JWT/HKDF auth), content view modes, overlay/beside layout, SDK command registration, SSE state events — all have proven templates from Plans 064/041/047/084/086. No breaking changes needed anywhere (IC-10).
2. **The genuinely new thing is the capture daemon.** Nothing in the monorepo touches video, encoding, or native macOS APIs. The streamer must be a native binary (Swift recommended — see external research) living outside the Node build system — the first non-Node sidecar in the repo (DC-05). This is the novelty and the risk; everything else is assembly.
3. **The viewer mode system is file-coupled — remote view is not a file.** FileViewerPanel dispatches on file path/MIME via nuqs URL params. A "remote-app" mode needs a non-file trigger for the content area — the cleanest read is a content-area-level mode (sibling of FileViewerPanel inside PanelShell), not a fifth ViewerMode button (DC-06, DB-04).

### Quick Stats

- **Components**: terminal feature (064), file-browser/viewer (041), panel-layout, SDK (047), auth (063/084), events/state platform domains
- **Dependencies**: ws + xterm.js (terminal), nuqs (URL state), Zod (SDK schemas), NextAuth + bootstrap-code JWT (auth); **no video/codec deps exist**
- **Test infrastructure**: vitest 3-tier + Playwright+CDP browser smoke + bundle guard + dependency-direction architecture tests
- **Prior Learnings**: 15 directly relevant discoveries, mostly from Plan 064's sidecar build
- **Domains**: 9 relevant; recommendation = **new business domain** `remote-view`, sibling of `terminal`
- **External research**: COMPLETE (pre-flow Perplexity deep research) — `external-research/streaming-stack.md`

## How It Currently Works

### Entry Points

| Entry Point | Type | Location | Purpose |
|------------|------|----------|---------|
| Terminal sidecar WS | WebSocket | `apps/web/src/features/064-terminal/server/` (sidecar spawn + `pty-registry.ts`) | Browser ↔ PTY data; port discovered via `.chainglass/server.json`, sessions registered in port-keyed `.chainglass/terminal-sidecar-<port>.pids.json` |
| Terminal token route | REST | terminal token API route (NextAuth-gated) | Mints short-lived JWT (HKDF-derived key from `bootstrap-code.json`) the browser presents to the sidecar |
| File viewer | URL params (nuqs) | `apps/web/src/features/041-file-browser/components/file-viewer-panel.tsx` (~line 60) | `ViewerMode = 'source' | 'rich' | 'preview' | 'diff'` — mode buttons + switch-dispatch to lazy-loaded components |
| Agent control | CLI + MCP | `apps/cli` (commander + DI tokens), `packages/mcp-server` (Zod-validated tools) | How an agent opens previews/navigates today; new commands register via SDK contributions |
| SSE channel | SSE | single multiplexed channel (ADR-0007) | All domain events ride one channel with domain-discriminated envelopes (ADR-0010) |

### Core Execution Flow — terminal (the template to copy)

1. **Spawn/discover**: web server boots → sidecar spawned if absent → port + pid recorded (`.chainglass/server.json`, port-keyed pids.json, atomic temp+rename). Startup reaper kills stale daemons fail-closed (verify pid alive AND cmdline matches before kill).
2. **Auth**: browser asks Next.js for a session-scoped JWT; both Next.js and sidecar derive the verification key via HKDF from the shared `bootstrap-code.json` → key convergence without key exchange. Sidecar also enforces an Origin allowlist (Plan 084).
3. **Connect**: browser opens WS to sidecar with token; binary/JSON framed terminal protocol (data, resize, control messages).
4. **Render**: singleton xterm instance (FX012) — ONE DOM node reparented via appendChild across three viewports (overlay/beside/full) so terminal state survives layout changes. Overlay panel: z-index 44, anchored to `[data-terminal-overlay-anchor]` via ResizeObserver; mutual exclusion via `overlay:close-all` CustomEvent.
5. **Layout**: PanelShell offers an optional generic `rightPane` — terminal-beside is just content in that slot; overlay floats above. **Remote view inherits both layouts for free if it is content-area content.**

### State Management

- **GlobalStateSystem** (Plan 053): worktree-scoped runtime state with colon-delimited namespacing — remote-view publishes connection/quality state under `remote-view:<session>:*` (DC-09, DB-06).
- **URL state**: nuqs params drive viewer mode/file — remote view needs its own param(s) so deep links and refresh restore the attached stream.

## Architecture & Design

### Component Map (what remote-view adds, where)

| New piece | Lives at | Copies pattern from |
|---|---|---|
| `chainglass-streamd` (Swift .app bundle: SCK capture + VTB encode + WS + CGEvent input + control API) | new top-level dir (e.g. `apps/streamd/` or `native/`), binary shipped/discovered like terminal sidecar | Terminal sidecar lifecycle (PS-01): pid registry, startup reaper, health check |
| Remote view content mode | `apps/web/src/features/088-remote-view/` (feature folder convention PS-08) | Content-area mode switch (DC-06); canvas + WebCodecs `VideoDecoder` component; overlay coexistence rules (PS-03) |
| Token + proxy routes | `apps/web/app/api/remote-view/…` | Terminal token route (IC-03); workspace/worktree-scoped route pattern (PS-05) |
| Service + DI | `IRemoteViewService` + Fake adapter, explicit `container.register()` (no decorators) | DI container pattern (PS-06), adapter-for-testing (PS-07/QT) |
| SDK contribution | `088-remote-view/sdk/contribution.ts` + `register.ts` | USDK two-file split (PS-04): commands `remote-view.list/attach/detach`, Zod params |
| CLI/MCP verbs | `apps/cli` command + `packages/mcp-server` tool | Commander + DI tokens (DC-08), MCP Zod tools (IC-07) |
| SSE/state events | new domain envelope on the single SSE channel | ADR-0007/0010 (IC-05) |

### Design Patterns to Follow (verified in code)

1. **Sidecar lifecycle** (PS-01): port-keyed pid registry with atomic writes; startup reaper (alive + cmd-regex guard, fail-closed); globalThis-pinned pool for HMR persistence; idle reaper with `.unref()`.
2. **Mode dispatch + lazy load** (PS-02/QT-04): lazy-load the heavy viewport component; the AC-10 bundle guard pattern (Plan 086) should gate the decoder bundle the same way.
3. **Overlay coordination** (PS-03): if remote view is content (recommended), no new overlay needed — terminal-over-remote-view works exactly like terminal-over-file.
4. **Dependency direction** (PS-09): `test/unit/web/architecture/viewer-no-file-browser.test.ts` is the template — add a guard so platform code never imports from `088-remote-view`.

### System Boundaries

- **Browser ↔ web server**: one HTTPS origin; everything (including the stream WS) should ride or be proxied through it — remote access is via tunnel/tailnet (DE-10), so no second public port.
- **Web server ↔ streamd**: localhost control API + the JWT/HKDF trust derived from `bootstrap-code.json` (IC-02 — this is a frozen contract; reuse, don't fork).
- **streamd ↔ macOS**: Screen Recording + Accessibility TCC permissions, granted once interactively (user has desktop access); daemon must be a signed .app bundle for grants to stick.

## Dependencies & Integration

### What remote-view depends on

| Dependency | Type | Purpose | Risk if changed |
|------------|------|---------|-----------------|
| `bootstrap-code.json` HKDF key derivation | Internal, **frozen** | Token trust between web app and sidecars | Breaking it breaks terminal too — reuse exactly (IC-02/IC-10) |
| `.chainglass/server.json` + pids.json schemas | Internal | Port discovery + lifecycle | Additive entries only |
| PanelShell / rightPane + overlay events | Internal | over/beside layouts | Already generic (DB-03); no changes expected |
| SSE single channel + domain envelopes | Internal | Connection-state events to UI | Additive domain (IC-05) |
| USDK contribution registry | Internal | Agent commands | Additive (PS-04) |
| ScreenCaptureKit / VideoToolbox / CGEvent | External (macOS 14+) | capture/encode/input | OS-version coupling lives entirely inside streamd |
| WebCodecs `VideoDecoder` | External (browser) | H.264 decode | Chrome/Edge solid; verify Safari config in spike |

### What depends on remote-view

Nothing existing. New consumers: the agent (CLI/MCP verbs) and the user's browser session. Keep it leaf-like; the dep-direction guard enforces it.

## Quality & Testing

- **Three-tier vitest** + e2e config; `just harness-verify` is the proof gate. ⚠️ **Gotcha (PL/memory)**: vitest aliases `@chainglass/*` to `src/` but the app resolves `dist/` — rebuild packages before `just harness-verify` after changing public exports.
- **Terminal WS tests** exist (≈32 assertions incl. production-bug regressions) — template for streamd's control-protocol tests with a Fake daemon adapter (QT-02).
- **Playwright+CDP browser smoke** (Plan 086, commit 79cdc293) with `data-testid` affordances — the right harness for "stream renders frames + clicks round-trip" against a fake/replay daemon (QT-03/QT-09).
- **Gaps** (QT-06/QT-08): no canvas/video streaming tests exist; no throughput/perf fixtures. A **frame-replay fake** (recorded H.264 frames served by a stub WS) makes the whole web side testable without macOS APIs — strongly recommended as a first-class test asset.

### Known Issues & Technical Debt (relevant)

| Issue | Severity | Impact on remote-view |
|-------|----------|------------------------|
| Plans 085 (watch-polling) + 087 (auto-save) in flight, touching viewer/file areas | Medium | Coordinate merges; keep 088 leaf-like to minimize overlap (DE-08) |
| Native binary = new build/release surface | Medium | streamd needs its own build (Xcode/SwiftPM) + signing story outside turbo (DC-05) |
| Control-message ambiguity bit Plan 064 (PL) | Low | Design streamd's WS framing with explicit discriminated message types from day one |

## Modification Considerations

### ✅ Safe to Modify / Add
1. New feature folder `088-remote-view`, new routes, new SSE domain, new SDK/CLI/MCP commands — all additive with established patterns.
2. Content-area mode switch — PanelShell already supports alternate content (DB-03).

### ⚠️ Modify with Caution
1. **FileViewerPanel** — don't bolt a non-file mode into ViewerMode; add a content-area-level switch instead (DC-06). Touching FileViewerPanel also risks colliding with Plan 087.
2. **`.chainglass/` schemas** — additive fields/files only; terminal depends on them.

### 🚫 Danger Zones
1. **bootstrap-code.json / HKDF derivation** — frozen contract; reuse verbatim (IC-02).
2. **Terminal sidecar internals** — copy the pattern, never share the process (PL: sidecar isolation was a hard-won Plan 064 decision).

### Extension Points
1. PanelShell content slot; 2. USDK contributions; 3. SSE domain envelopes; 4. DI container tokens + Fake adapters.

## Prior Learnings (From Previous Implementations)

✓ 15 entries surfaced across Plan 064 phases, Workshop 002 (auth), Plans 041/063/083/086 logs, and docs/retros (2 legacy files). Highest-value:

| ID | Type | Source | Key Insight | Action for 088 |
|----|------|--------|-------------|----------------|
| PL-01 | decision | Plan 064 | Sidecar isolated in own process — crash/HMR isolation from Next.js | Same for streamd; never in-process |
| PL-02 | gotcha | Plan 064 | Native module (node-pty) rebuilds caused pain | streamd is a standalone binary — keep Node free of native deps |
| PL-03 | gotcha | Plan 064 | WS connect/teardown timing races; React cleanup order matters | Reuse terminal's connect/reconnect state machine for the stream socket |
| PL-04 | workaround | Plan 064 | Reconnection + session reattach logic was subtle | Streamd sessions must survive browser refresh; reattach by session id |
| PL-05 | decision | Workshop 002/Plan 084 | bootstrap-code + JWT + Origin allowlist auth shape | Reuse for stream WS auth verbatim |
| PL-06 | gotcha | Plan 064 | Multi-client dimension negotiation ambiguity | Single-viewer policy for v1: latest-attach wins, or explicit lock |
| PL-07 | insight | Plan 086 | Playwright+CDP smoke catches what unit tests can't | Plan a browser smoke with frame-replay fake from the start |
| PL-08 | gotcha | repo memory | vitest src-vs-dist alias — stale dist hides export changes | Rebuild packages before harness-verify |

(Full PL-01..PL-15 detail lives in the subagent outputs; the table above carries everything decision-relevant forward.)

## Domain Context

### Existing Domains Relevant to This Research

| Domain | Relationship | What remote-view consumes |
|--------|-------------|---------------------------|
| `terminal` (business) | sibling template | lifecycle + auth + layout patterns (copy, don't extend) |
| `_platform/auth` | depends on | NextAuth gate + bootstrap-code JWT/HKDF |
| `_platform/panel-layout` | depends on | content slot, rightPane, overlay coexistence |
| `_platform/events` / `_platform/state` | depends on | SSE envelopes + GlobalState publishing |
| `_platform/sdk` | depends on | command/settings contributions |
| `_platform/viewer` | boundary only | do NOT extend — remote view is not a file viewer (DB-04) |

### Domain Map Position & Action

**Extract new business domain `remote-view`** — sibling of `terminal`, consuming only `_platform/*` contracts; add a dependency-direction guard. The streaming daemon is part of this domain's composition (like the terminal sidecar is part of terminal's), not a shared platform service — until a second consumer exists.

## Critical Discoveries

### 🚨 Critical 01: The daemon is the only genuinely novel build artifact
**Source**: DC-05, IA, external research · **Impact**: Critical
No video/native code exists in the repo; streamd (Swift, ScreenCaptureKit + VideoToolbox + CGEvent + WS) is a new specie of artifact with its own build, signing, and TCC-permission story. **Required action**: treat the daemon spike (capture Godot + Simulator, inject input) as the first phase / Phase-0-style de-risk; design the web side against a frame-replay fake so it never blocks on the native work.

### 🚨 Critical 02: Remote view must be a content-area mode, not a ViewerMode
**Source**: DC-06, DB-04, IA · **Impact**: High
ViewerMode is file/MIME-coupled with nuqs file params. Bolting a non-file mode in distorts the viewer domain and collides with in-flight Plans 085/087. **Required action**: spec a content-area-level switch `{file-viewer | remote-view}` inside PanelShell so terminal-over and terminal-beside compose unchanged.

### 🚨 Critical 03: Auth/discovery contracts are frozen — reuse exactly
**Source**: IC-02/IC-03/IC-10, PL-05 · **Impact**: High
bootstrap-code.json HKDF key convergence + short-lived JWT + Origin allowlist + server.json discovery are proven and shared with terminal. **Required action**: the spec should name these as reused contracts, not design new auth.

### 🚨 Critical 04: Single-viewer and reattach semantics need an explicit decision
**Source**: PL-04/PL-06 · **Impact**: Medium
Browser refresh, second tab, and agent-triggered attach can race. **Required action**: spec the session model (one stream session per window; latest-attach wins vs lock) before architecture — good workshop candidate.

## Recommendations

### If Building This (feeds the spec)
1. **Two decoupled tracks**: (a) Swift streamd with control API + WS frame protocol; (b) web feature built against a frame-replay fake. Integration is a late, thin step.
2. **v1 transport: WebCodecs over authed WS through the existing origin** — no WebRTC/ICE; single viewer; drop-on-backpressure. v2 escape hatch: WHIP/WHEP if links get lossy.
3. **Input model: focus-follows-stream** (bring window frontmost on interaction) — document the Godot-fullscreen and minimized-window edge cases as known limitations.
4. **Agent surface from day one**: `remote-view list|attach|detach` as CLI + MCP + SDK commands — this is what makes it agent-native.
5. **Workshop candidates**: content-area mode mechanics (Critical 02); session/reattach semantics (Critical 04); streamd packaging/signing/discovery.

## External Research Opportunities

External research is **already complete** — see `external-research/streaming-stack.md` (decisions: SCK + VTB H.264 + WebCodecs/WS + CGEvent + Swift) and `external-research/perplexity-deep-research-raw.txt`. Remaining unknowns are **spike-shaped, not research-shaped**:

1. **De-risk spike** (half-day Swift + 1h browser): SCK capture of live Godot/Simulator @60fps; CGEvent fidelity into both; `VideoDecoder` H.264 config on Safari/Chrome. → Results to `external-research/spike-findings.md` if run before/within the plan.

No unresolved `/deepresearch` prompts outstanding.

## Appendix: Core File Inventory

| File | Purpose |
|------|---------|
| `apps/web/src/features/064-terminal/server/pty-registry.ts` | Sidecar pid registry + reaper (lifecycle template) |
| `apps/web/src/features/064-terminal/hooks/use-terminal-overlay.tsx` | Overlay provider/hook (layout + mutual exclusion) |
| `apps/web/src/features/041-file-browser/components/file-viewer-panel.tsx` | ViewerMode dispatch (~line 60) — the file-coupling to design around |
| `apps/web/src/lib/di-container.ts` | Explicit DI registration |
| `apps/web/src/features/041-file-browser/sdk/contribution.ts` + `sdk/register.ts` | USDK two-file contribution pattern |
| `test/unit/web/architecture/viewer-no-file-browser.test.ts` | Dependency-direction guard template |
| `.chainglass/server.json`, `.chainglass/terminal-sidecar-<port>.pids.json`, `bootstrap-code.json` | Discovery + lifecycle + key material (frozen/additive) |
| `docs/adr/` ADR-0007, ADR-0010 | SSE single-channel + domain event envelope contracts |

## Artifact Handoff

- External research: complete and saved in `external-research/` — travels with this dossier.
- The dossier is ready for the specify stage; the spike (above) can run any time and slot its findings in.

---

**Research Complete**: 2026-06-12T23:30:21Z
**Report Location**: docs/plans/088-remote-app-view/research-dossier.md
