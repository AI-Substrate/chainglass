# Phase 3 — Execution Log

**Plan**: remote-app-view · **Phase**: 3 of 6 — Viewport UI & Content-Area Mode
**Mode**: Full · **Testing**: Hybrid (browser-smoke + guards, not unit-TDD — Constitution Deviation Ledger)
**Companion**: `code-review-companion` run `2026-06-15T15-09-19-025Z-f894` (Power-On-Mode; booted + briefed at phase start)

---

## Pre-flight

**Harness seam (`--event pre-implement`)** — router envelope `decision: noop`, `missing_rung: S2-governance`. The `harness` CLI is present (0.2.0) but the repo has **not adopted** it (no `.harness/`, no governance doc, no boot) — adoption was conversationally declined for this plan. Verdict treated as **UNAVAILABLE → proceed with standard testing** (Phase 3 is Hybrid anyway). `--prompt-optional=false`; no re-prompt (consistent with Phases 1–2).

**Companion boot** — no active run existed (latest was the completed Phase 1 run); booted a fresh `code-review-companion`, polled to `verdict: active`, sent the one-shot briefing (hazards: Finding 01 two-file containment, Finding 06 test infra, F003/F004/F005/F007 invariants, data-driven `video-config`, DI consumption).

---

## Tasks

_Per-task entries appended below as each task completes._

> **Worktree typecheck baseline (recorded before T001):** `apps/web/tsconfig.json` carries **12 pre-existing errors** unrelated to Plan 088 — `browser-client.tsx:614-615` (`ReadFileResult.content` narrowing), `019-agent-manager/useAgentInstance.ts:140`, `074-workflow-execution-manager.ts:250`, `_platform/panel-layout/mobile-search-overlay.tsx:103-104`, `lib/server/flowspace-mcp-client.ts:197-208` (×6). These predate this phase (other in-flight plans). **Acceptance bar for Phase 3: zero net-new errors.**

### T001 — URL contract (`view=remote` + `rv`)

**Done.** Added the remote-view content-area mode to the URL surface.
- **New** `apps/web/src/features/088-remote-view/params/remote-view.params.ts` — exports `remoteViewParams = { rv: parseAsString }` (nullable; inert without `view=remote`, Workshop 001).
- **Mod** `apps/web/src/features/041-file-browser/params/file-browser.params.ts` — extended the `view` literal `['recent-feed']` → `['recent-feed', 'remote']`; composed `...remoteViewParams` into `fileBrowserPageParamsCache` (business→business via the remote-view **contract**, the allowed cross-domain form; mirrors how `recent-feed` already lives here).
- **Mod** `browser-client.tsx` — imported `remoteViewParams`; `useQueryStates({ ...fileBrowserParams, ...remoteViewParams })` so `?view=remote&rv=…` hydrates client-side and `setParams({ rv })` is available.
- **Evidence**: biome clean on all 3 files; web typecheck = baseline 12 (0 net-new). `rv` is inert until T002 adds the render branch (nothing reads it yet).
- **Domain note**: file-browser→remote-view is the sanctioned business→business-via-contract direction; the dep guard only forbids `_platform`→remote-view (still green).

### T002 — RemoteViewPanel branch + switch-back

**Done.** The content-area mode now mounts and unmounts.
- **New** `apps/web/src/features/088-remote-view/components/remote-view-panel.tsx` — orchestrator shell: header + close button; body branches on `rv` (picker slot when `null` → T003; viewport slot when set → T004/T005). `data-testid="remote-view-panel"` + slot test-ids. F007 documented in-file (no windowId synthesis on deep-link; picker is the only windowId origin).
- **Mod** `browser-client.tsx` — lazy `dynamic()` `RemoteViewPanel` (ssr:false, copies the RecentFeedView shape — keeps WebCodecs out of the base bundle, AC-13); added `view === 'remote'` render branch ahead of the recent-feed branch (`onPickWindow` → `setParams({ rv })`, `onClose` → `setParams({ view:null, rv:null })`); extended `handleFileSelect` switch-back to clear `rv` too (AC-5).
- **Evidence**: biome clean (2 files); web typecheck = 12 (baseline, **0 net-new** — the pre-existing `ReadFileResult.content` errors shifted 614→631 from the added import block, same 2 errors). `rv` inert rule holds: the branch only renders when `view==='remote'`.
- **Containment (Finding 01)**: file-browser touch is exactly the two sanctioned files (params + browser-client.tsx); PanelShell/FileViewerPanel untouched.

## Companion findings reconciliation

| ID | Sev | Task | Finding | Disposition |
|----|-----|------|---------|-------------|
| F001 | MEDIUM | T001 | URL param contract (`view='remote'` + `rv`) lacked regression coverage — protected only by typecheck | **Fixed inline** — added a focused assertion to `test/unit/web/features/041-file-browser/params.test.ts` (`view=remote`+`rv` parse, recent-feed preserved, unknown→null, rv standalone, rv absent→null) with a 5-field Test Doc. 9 tests green. Re-pinged → companion **F001 fix verified**. T001 verdict: APPROVE_WITH_NOTES. |
| F002 | MEDIUM | T003 | The dossier (`tasks.md`) still instructed `useInjection(DI_TOKENS.REMOTE_VIEW_SERVICE)` at 5 spots, contradicting the no-client-DI discovery and risking steering T004/T005/T007 wrong | **Fixed inline** — rewrote all 5 stale refs (Phase-2-deps service note, patterns-to-follow, pre-impl check, arch-map SVC node, T003 row, domain deps/constraints) to name the `useRemoteViewWindows` loader seam + server-only frozen `IRemoteViewService`; kept the Discovery rows. Re-pinged for verification. T003 verdict: APPROVE_WITH_NOTES (1 MEDIUM, 0 HIGH). |

### T003 — Window picker

**Done.** The picker renders against the fake (AC-1) and attaching transitions to the viewport slot.
- **New** `components/window-picker.tsx` — pure/presentational: loading / error (with Retry) / empty / grid states; one attach-able card per window (app, title, dims, placeholder thumbnail); `onAttach(windowId)`. `data-testid`s for each state + per-window.
- **New** `hooks/use-remote-view-windows.ts` — the window-list **loader** and single Phase-5 swap point. Phase 3 returns `[FAKE_WINDOW]` (the one the frame-replay fake can stream); Phase 5 replaces the body with `fetch('/api/remote-view/windows')`. `enabled` flag skips loading while a session is active.
- **Mod** `components/remote-view-panel.tsx` — wired the picker (rv==null); `handleAttach` mints a client-side session id, remembers the picked `windowId` (F007 — only origin of a windowId; deep-link re-enter stays null so the hook learns from hello-ok), and sets `rv` via `onPickWindow`.
- **Discovery (load-bearing)**: this app has **no client-side DI / `useInjection`** — `IRemoteViewService` is server-only. The dossier's "consume via `useInjection(DI_TOKENS.REMOTE_VIEW_SERVICE)`" was a recon inference; corrected to the loader-hook abstraction (see Discoveries table). `IRemoteViewService` left FROZEN (not extended with a window-list method).
- **Tests**: `test/unit/web/features/088-remote-view/window-picker.test.tsx` (RTL, **2 tests green** — grid + onAttach(windowId); loading/empty/error + Retry). The picker is pure (no canvas/WebCodecs) so it's unit-tested despite the Hybrid mode; the live attach→viewport path is still T007's smoke.
- **Evidence**: biome clean (4 files); web typecheck = 12 (**0 net-new**); picker test 2/2; params test still 9/9.

### T004 — Viewport decode core

**Done.** WebCodecs decode → canvas, fully data-driven from `video-config`.
- **New** `components/viewport.tsx` — `VideoDecoder` configured from the `video-config` message (codec / base64 avcC `description` / dims — **never hardcoded**, so Phase 4's real encoder params flow through, forward-compat); `toChunkInit` → `EncodedVideoChunk` → canvas `drawImage`; resync-on-keyframe after (re)config; **browser-side backpressure** (`decodeQueueSize > 10` → drop-to-keyframe + `requestKeyframe()`, Workshop 003); decoder torn down on unmount. `data-testid="remote-view-viewport"` is the **T008 bundle sentinel**.
- **Mod (additive)** `hooks/use-remote-view-session.ts` — forwards the video plane off the single socket: `onVideoConfig` / `onFrame` callbacks + `requestKeyframe()` (sends `{t:'request-keyframe'}`); binary branch now uses `decodeFrame` (full payload) vs `decodeFrameHeader`. **All 56 Phase 2 tests still green** (additive, optional).
- **Mod (additive)** `protocol/messages.ts` — `VideoConfigMessage` type export (no schema change).
- **Mod** `components/remote-view-panel.tsx` — renders `<Viewport url session windowId>`; `wsUrl` from `window.__REMOTE_VIEW_WS_URL__` (smoke-injected, Finding 06) / `NEXT_PUBLIC_*` (Phase 5 → daemon url from registry).
- **Tests**: added a node/jsdom hook video-plane test (onVideoConfig dims 800×656 avc1, onFrame keyframe, requestKeyframe → `fake.received`) → hook suite **10/10**. The viewport *component* is smoke-only (no WebCodecs in jsdom) per the Hybrid deviation.
- **Evidence**: web typecheck = 12 (**0 net-new** — WebCodecs types incl. `optimizeForLatency` resolve via lib.dom); remote-view unit suite **57** + hook **10** green. Biome clean on my code; `messages.ts` carries one **pre-existing** `InputEventSchema` format deviation (confirmed on HEAD via `git stash` — Phase 2 F003 baseline, not T004).

### T005 — HUD + Workshop 002 state chrome

**Done.** The viewport now renders a live HUD and every viewport state.
- **Mod** `components/viewport.tsx` — stats **HUD** (fps + latency + bitrate + dropped, sampled 1s); **per-state chrome** for all 10 states: `displaced` → reclaim card that **always shows Reclaim and never self-resolves** (F004 — the FSM traps it); `windowGone`/`daemonDown`/`error` → blocking cards + "Back to windows"; `attaching`/`reconnecting`/`degraded`/`sessionLost` → transient badges (canvas last-frame stays). The `error` card maps **every** `E_*` code (`E_PERMISSION` names the Screen Recording grant; the System-Settings fix-path + how-to are Phase 6 = AC-14). testids: `remote-view-hud`, `remote-view-reclaim`, `remote-view-state-<name>`.
- **Mod (additive)** `hooks/use-remote-view-session.ts` — telemetry plane: `onStats`/`onPong` callbacks + `ping()` (sends `{t:'ping',sentAt}`; pong → `onPong(RTT)`); `+StatsMessage` type. The viewport drives a 2s ping loop.
- **Latency** = the ping/pong **RTT measurement path** (proven vs the fake, which answers `ping→pong`); true capture→display glass-to-glass needs the real daemon's wall-clock frame stamps (Phase 6, AC-2). fps/bitrate/dropped are client-measured; daemon `stats` are forwarded for Phase 6.
- **onExit chain**: viewport "Back to windows" → `onExit` → panel `onReturnToPicker` → browser-client `setParams({rv:null})` (keeps `view=remote` → picker); Reclaim → `hook.reclaim()`. Added `onReturnToPicker` to the panel + browser-client (still the two Finding-01 files).
- Also corrected the panel doc comment's stale "IRemoteViewService via DI" (same drift as F002).
- **Evidence**: biome clean (after format wrap of viewport/panel — no pragmas); web typecheck = 12 (**0 net-new**; structural callback subtypes OK); hook **10/10**, all 56 Phase 2 tests green. Viewport remains smoke-only (no WebCodecs in jsdom) — T007.

