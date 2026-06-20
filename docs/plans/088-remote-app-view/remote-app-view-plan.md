# Remote App View Implementation Plan

**Plan Version**: 1.0.0
**Created**: 2026-06-13
**Spec**: [remote-app-view-spec.md](./remote-app-view-spec.md)
**Status**: READY

## Gate Matrix

| Gate | Check | Status | Notes |
|------|-------|--------|-------|
| G1 | Clarify | PASS | No `[NEEDS CLARIFICATION]` markers; 8/8 clarifications resolved in spec |
| G2 | Constitution | PASS | One partial deviation from Principle 3 (TDD) recorded in the Deviation Ledger; all other principles complied |
| G3 | Architecture | PASS | No app→app imports; daemon lives outside the Node package graph (`native/`); services depend on interfaces only |
| G4 | ADR Compliance | PASS | 14 Accepted ADRs checked. Plan conforms: ADR-0001 (MCP tool shape), 0003 (config via `CG_*`), 0004 (useFactory DI), 0007/0010 (SSE envelope via central notifier), 0009 (registration functions), 0011 (§ Concepts for new domain), 0013 (USDK contribution) |
| G5 | Structure | PASS | All required sections present; cross-references resolve |
| G6 | Testing Alignment | PASS | Hybrid per spec: TDD phases order tests before impl; smoke phases carry validation tasks; manual phases carry verification steps; ACs measurable |
| G7 | Domain Completeness | PASS | All spec domains present (+ `file-browser`, surfaced by Workshop 001); NEW domain setup task in Phase 2; manifest covers task-table files |

## Summary

Chainglass gets a **remote view** content-area mode: a live, interactive stream of one macOS app window (Godot game, iOS Simulator) viewable and clickable from the browser, with terminal-over/beside composition preserved. The approach is two decoupled tracks: the web feature is built TDD against a **frame-replay fake** speaking the workshop-pinned WS protocol, while the **Swift streamer daemon** (the repo's first non-Node artifact: ScreenCaptureKit capture + VideoToolbox H.264 + CGEvent input) is de-risked by a spike and built in parallel. Integration is a late, thin step. All four workshops (`workshops/001–004`) are authoritative design inputs: content-area mode mechanics, session state machine, stream protocol, and daemon packaging are already decided — this plan sequences them.

## Target Domains

| Domain | Status | Relationship | Role |
|--------|--------|-------------|------|
| remote-view | **NEW** | **create** | Feature domain: stream sessions, daemon + lifecycle, viewport UI, input forwarding, agent verbs (sketch approved in spec; Workshop boundaries apply) |
| _platform/auth | existing | consume | NextAuth gate + bootstrap-code HKDF JWT mint for the stream socket — frozen contract, copied from the terminal token route verbatim |
| _platform/panel-layout | existing | consume | **Softened from spec's "modify"** (Key Finding 01): PanelShell needs zero changes — the `main` slot and overlay anchor already compose |
| file-browser | existing | **modify (additive)** | Surfaced by Workshop 001: one-line `view` literal extension in `file-browser.params.ts` + a render branch in `browser-client.tsx` (the existing `recent-feed` switch precedent) |
| _platform/events | existing | consume | New `remote-view` domain envelope on the single SSE channel via `ICentralEventNotifier` (ADR-0007/0010) |
| _platform/state | existing | consume | `registerDomain` + publish `remote-view:<session>:*` runtime state |
| _platform/sdk | existing | consume | USDK contribution: commands `remote-view.list/attach/detach` |
| workspace / _platform/workspace-url | existing | consume | Workspace/worktree scoping of routes + URL params (existing `workspaceParams` composition) |

## Domain Manifest

| File | Domain | Classification | Rationale |
|------|--------|---------------|-----------|
| `apps/web/src/features/088-remote-view/protocol/messages.ts`, `protocol/binary.ts`, `protocol/fixtures/*.json` | remote-view | contract | Wire protocol (Workshop 003) — shared with fake + mirrored in Swift |
| `apps/web/src/features/088-remote-view/server/session-machine.ts`, `server/daemon-manager.ts`, `server/streamd-registry.ts` | remote-view | internal | Session FSM (Workshop 002), daemon lifecycle (Workshop 004) |
| `apps/web/src/features/088-remote-view/components/remote-view-panel.tsx`, `components/window-picker.tsx`, `components/viewport.tsx`, `hooks/use-remote-view-session.ts` | remote-view | internal | Viewport UI + client state machine |
| `apps/web/src/features/088-remote-view/params/remote-view.params.ts` | remote-view | contract | `rv` URL param (Workshop 001) |
| `apps/web/src/features/088-remote-view/sdk/contribution.ts`, `sdk/register.ts` | remote-view | contract | USDK two-file contribution |
| `apps/web/src/features/088-remote-view/testing/fake-streamd.ts` | remote-view | contract | Frame-replay fake — first-class deliverable (AC-12) |
| `apps/web/app/api/remote-view/token/route.ts`, `…/windows/route.ts`, `…/sessions/route.ts`, `…/health/route.ts` | remote-view | internal | NextAuth-gated routes; token route copies `apps/web/app/api/terminal/token/route.ts` |
| `apps/web/src/features/041-file-browser/params/file-browser.params.ts` | file-browser | cross-domain | One-line: `view` literal `['recent-feed','remote']` |
| `apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx` | file-browser | cross-domain | `dynamic()` RemoteViewPanel branch beside RecentFeedView; `{view:null, rv:null}` on file select |
| `apps/web/src/app-composition/sdk-domain-registrations.ts` | _platform/sdk | cross-domain | One-line `registerRemoteViewSDK(sdk)` |
| `apps/web/src/lib/di-container.ts` | (infra) | cross-domain | `DI_TOKENS.REMOTE_VIEW_SERVICE` + useFactory registrations (prod + test) |
| `apps/cli/src/bin/cg.ts`, `apps/cli/src/commands/remote-view.command.ts` | remote-view | cross-domain / internal | `registerRemoteViewCommands(program)`; web API via `readServerInfo` + `X-Local-Token` |
| `packages/mcp-server/src/server.ts`, `packages/mcp-server/src/tools/remote-view.tools.ts` | remote-view | cross-domain / internal | `registerRemoteViewTools(...)` per ADR-0001 |
| `native/streamd/Package.swift`, `native/streamd/Sources/streamd/*.swift`, `native/streamd/scripts/make-bundle.sh` | remote-view | internal | Swift daemon (Workshop 004); outside pnpm/turbo graph |
| `justfile` | (infra) | cross-domain | `streamd-setup/build/install/kill` recipes |
| `test/unit/web/architecture/platform-no-remote-view.test.ts` | (tests) | contract | Dep-direction guard (copies `viewer-no-file-browser.test.ts`) |
| `test/unit/web/features/088-remote-view/*.test.ts`, `test/contracts/remote-view-service.contract.ts` | (tests) | internal | TDD + contract suites |
| `test/unit/web/features/088-remote-view/bundle-guard.test.ts` | (tests) | contract | Lazy-chunk sentinel guard (copies `bundle-ac10.test.ts`) |
| `harness/src/remote-view-smoke.test.ts` | (tests) | internal | Playwright+CDP smoke vs fake |
| `docs/domains/remote-view/domain.md`, `docs/domains/registry.md`, `docs/domains/domain-map.md` | (docs) | cross-domain | Domain setup (ADR-0011 § Concepts included) |
| `docs/how/remote-view.md`, `README.md` | (docs) | cross-domain | Hybrid docs strategy |
| `docs/plans/088-remote-app-view/external-research/spike-findings.md` | (plan artifact) | internal | Phase 1 evidence |

## Key Findings

| # | Impact | Finding | Action |
|---|--------|---------|--------|
| 01 | Critical | The content-area mode switch **already exists**: `view: parseAsStringLiteral(['recent-feed'])` in `file-browser.params.ts:30`, dispatched in `browser-client.tsx` (lazy `dynamic()` at :95, branch at :226, switch-back at :721). PanelShell keeps the overlay anchor on the `main` wrapper (`panel-shell.tsx:88`) | Extend the literal + add `rv`; copy the RecentFeedView branch shape. **No PanelShell or FileViewerPanel changes** — Plans 085/087 collision surface shrinks to two small files (Workshop 001) |
| 02 | Critical | The daemon is the only novel artifact, and the **TCC trap is real**: ad-hoc signing re-prompts permissions every rebuild. Stable self-signed cert + LaunchServices spawn (`open -g`) + stable install path are the mitigation — all spike-verifiable | Phase 1 spike retires this before web code commits (Workshop 004); fallbacks documented |
| 03 | High | Auth is copy-not-design: `api/terminal/token/route.ts` shows the exact double gate (NextAuth `auth()` + bootstrap-cookie `verifyCookieValue`) and HKDF-key `SignJWT` (aud claim, 5m expiry, raw Buffer key — FX003). Origin allowlist helpers live in `features/064-terminal/server/terminal-auth.ts` (`buildDefaultAllowedOrigins`, `authorizeUpgrade`) | Token route: same shape, `aud: 'remote-view-ws'`. Daemon re-implements verify+allowlist in Swift against shared test vectors |
| 04 | High | Every agent/registration surface is a one-line function-registry addition: `sdk-domain-registrations.ts` (`registerAllDomains`), `cg.ts` (`registerXxxCommands`), `mcp-server/src/server.ts` (`registerXxxTools`), DI via `useFactory` (decorators banned, ADR-0004) | Phase 5 is assembly, not invention; each task names its registry file |
| 05 | High | SSE: domain name = channel id (no mapping table); emit via `ICentralEventNotifier.emit(domain, eventType, data)`; client subscribes with `useChannelEvents`. GlobalState: `registerDomain` then `publish('remote-view:<ses>:<prop>', v)`; client `useGlobalState` | Phase 5 wiring per these exact APIs (Workshop 002 § SSE) |
| 06 | High | Test infra constraints: vitest runs `fileParallelism: false`; bundle guard requires a `.next` build and uses a sentinel-in-lazy-chunk assertion (`bundle-ac10.test.ts`); browser smoke lives in `harness/` (Docker + CDP on :9222, `just test-harness`); every test needs the 5-field Test Doc comment; contract tests in `test/contracts/` | Phase task suites budget for these; fake-streamd must run inside the harness container |
| 07 | Medium | vitest aliases `@chainglass/*` to `src/` but the app resolves `dist/` (PL-08) — stale dist masks export changes | Any `packages/shared` touch (if protocol types ever move there) rebuilds before verify; v1 keeps protocol types in-feature (one consumer, Workshop 003) |
| 08 | Medium | CLI auth to web: `readServerInfo()` reads `.chainglass/server.json` (port + `localToken`) → `X-Local-Token` header (Plan 084 defense-in-depth) | CLI/MCP verbs call Next routes only — the daemon stays single-audience (Workshop 004) |

## Constitution Deviation Ledger

| Principle Violated | Why Needed | Simpler Alternative Rejected | Risk Mitigation |
|-------------------|------------|------------------------------|-----------------|
| Principle 3 (TDD for **all** implementation) — partial: Swift daemon internals, canvas/video rendering, the Phase 1 spike (throwaway evidence code), and Phase 6's live AC sweep are not unit-TDD'd | CI has no macOS capture permissions or GPU; pixel output and CGEvent side effects aren't unit-assertable; the Swift toolchain sits outside vitest | "TDD everything" would fake the exact native surfaces under test, proving nothing (spec clarification chose Hybrid deliberately) | Protocol fixtures tested on **both** sides (vitest + `swift test`); all session/auth/registry/manager logic strictly TDD with fakes; Playwright+CDP smoke for UI; Phase 6 manual AC sweep with recorded measurements |

## Phases

### Phase Index

| Phase | Title | Primary Domain | Objective (1 line) | Depends On |
|-------|-------|---------------|-------------------|------------|
| 1 | De-Risk Spike | remote-view (evidence) | Retire the three spike-shaped unknowns (capture, input, decode) + TCC/window-id assertions | None |
| 2 | Domain, Protocol & Session Core (TDD) | remote-view (create) | Domain setup; protocol schemas, frame-replay fake, session FSM, token route — green with no daemon | None (folds Phase 1 fixtures in when ready) |
| 3 | Viewport UI & Content-Area Mode | remote-view (+file-browser touch) | Picker, canvas viewport, input capture, layout composition — all against the fake | Phase 2 |
| 4 | Native Daemon (Swift) | remote-view (native) | streamd: capture/encode/WS/input/control API, packaged + signed per Workshop 004 | Phases 1, 2 |
| 5 | Lifecycle, Agent Surface & Events | remote-view (consumes platform) | Daemon manager + reaper; routes; SDK/CLI/MCP verbs; SSE + GlobalState | Phase 2 (Phase 4 for live verification only) |
| 6 | Integration Hardening, Permissions UX & Docs | remote-view | Real daemon + real apps end-to-end; AC sweep with measurements; how-to docs | Phases 3, 4, 5 |

---

#### Phase 1: De-Risk Spike

**Objective**: Produce go/no-go evidence for capture fidelity, input injection, browser decode, TCC persistence, and window-id stability — before web code commits.
**Domain**: remote-view (evidence artifacts only, no production code)
**Delivers**: `external-research/spike-findings.md`; recorded H.264 fixture set (seed for the frame-replay fake); workshop open-questions resolved
**Depends on**: None
**Key risks**: This phase exists to *find* the risks; a hard failure here (e.g. SCK can't capture the Simulator usably) re-scopes the plan before sunk cost.

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 1.0 | **Harness pre-flight** — `/eng-harness-flow --event pre-implement --phase "Phase 1" --plan-dir docs/plans/088-remote-app-view` | — | Router envelope handled; verdict narrated verbatim before any code | _Harness seam — advisory_ |
| 1.1 | Swift scratch: `SCContentFilter(desktopIndependentWindow:)` capture of a live Godot window + booted iOS Simulator at 60fps; document occluded + minimized + Space-switch behavior | remote-view | 60s capture of each target recorded; minimize behavior (frames stop) + restore path confirmed | external-research §capture |
| 1.2 | VideoToolbox low-latency H.264 encode of captured frames; dump AVCC access units + `avcC` description to `protocol/fixtures/` seed | remote-view | Replayable fixture set exists (config + numbered frames + keyframe markers) | Feeds Task 2.4 fake |
| 1.3 | CGEvent injection fidelity: click/drag/scroll/type into Godot + Simulator under focus-follows-stream; verify Simulator tap translation | remote-view | Per-app results documented (what lands, what doesn't, incl. Godot windowed vs fullscreen) | Workshop 003 input model |
| 1.4 | Browser decode harness: feed fixture into `VideoDecoder` on Chromium (gating) and Safari (record-only) | remote-view | Working `avc1.*` config string + `optimizeForLatency` verified on Chromium; Safari results recorded for backlog | Spec: Chromium-gating clarification |
| 1.5 | TCC + lifecycle assertions: stable self-signed cert → rebuild → grants persist; `open -g --args` TCC attribution; CGWindowID stability across daemon restart | remote-view | Each assertion answered yes/no with evidence; fallback selected if no (Workshop 004 Q1, Workshop 002 R6) | Load-bearing for Phase 4 |
| 1.6 | Write `external-research/spike-findings.md`; update Workshops 002–004 open-question statuses, mapping each answer to its consuming task (e.g. 1.5 verdicts → 4.1 signing / 5.1 spawn fallbacks) and explicitly deferring v1.1 items (pointer-lock, grace config) | remote-view | Findings doc committed; no stale OPEN markers that the spike answered; each answer names its consumer | |
| 1.z | **Harness phase-end** — `/eng-harness-flow --event phase-end --plan-dir docs/plans/088-remote-app-view` | — | Router envelope handled at phase end | _Harness seam — advisory_ |

**Verification (manual/spike per spec Testing Strategy)**: evidence = spike-findings.md + replayable fixture; each of 1.1–1.5 has a written observed-behavior record, not just a verdict.

#### Phase 2: Domain, Protocol & Session Core (TDD)

**Objective**: Stand up the remote-view domain web-side — protocol, fake, session state machine, token route — fully tested with no daemon present (AC-12 foundation).
**Domain**: remote-view (**create** — domain setup tasks here)
**Delivers**: registered domain; Zod protocol schemas + binary codec; frame-replay fake; session FSM passing the R1–R9 race matrix; token route
**Depends on**: None (Task 2.4 upgrades to spike fixtures when Phase 1 lands; synthetic ffmpeg H.264 until then)
**Key risks**: Race-matrix fidelity — mitigated by writing tests directly from Workshop 002's tables before implementation.

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 2.0 | **Harness pre-flight** — `/eng-harness-flow --event pre-implement --phase "Phase 2" --plan-dir docs/plans/088-remote-app-view` | — | Envelope handled | _Harness seam — advisory_ |
| 2.1 | Domain setup: `docs/domains/remote-view/domain.md` (incl. `§ Concepts` per ADR-0011), row in `docs/domains/registry.md` (`| Remote View | remote-view | business | — | Plan 088 | active |`), node + edges in `docs/domains/domain-map.md`, create `apps/web/src/features/088-remote-view/` | remote-view | Registry + map render; domain.md states Owns/Excludes from spec sketch | First task of first web phase |
| 2.2 | Dep-direction guard **test-first**: `test/unit/web/architecture/platform-no-remote-view.test.ts` scanning `_platform` for `remote-view` imports (copy `viewer-no-file-browser.test.ts` mechanism) | remote-view | Guard green (trivially now, forever after) | Spec Domain Review condition |
| 2.3 | Protocol TDD: round-trip tests for every Workshop 003 message + 16-byte binary header codec + canonical JSON fixture file → then implement `protocol/messages.ts` (Zod), `protocol/binary.ts` | remote-view | All round-trips green; fixtures file is the cross-language source of truth | Tests before impl (TDD order). Protocol JSON fixtures ≠ video fixtures (Task 1.2). Any post-2.3 protocol change regenerates fixtures and re-runs the 2.3 + 4.2 suites |
| 2.4 | Frame-replay fake: `testing/fake-streamd.ts` — `ws` server speaking the full protocol; replays fixture frames; scriptable cues (`displaced`, `window-state`, `error`, drop simulation); records received `input` messages | remote-view | Fake drives hello→config→keyframe→deltas; cue + input-log APIs covered by its own tests | **First-class deliverable** (AC-12); runs in harness container too (Finding 06). Synthetic ffmpeg H.264 fully satisfies Phase 2–3 SCs; Task 1.2 fixtures upgrade realism when available |
| 2.5 | Session FSM TDD: encode Workshop 002 race matrix **R1–R9 as failing tests first**, then implement client reducer + reconnect logic (`hooks/use-remote-view-session.ts`, `server/session-machine.ts` for shared pure logic) | remote-view | R1–R9 green against the fake; reconnect uses terminal's guard idiom (PL-03) | Workshop 002 is authoritative |
| 2.6 | Token route TDD: 401-without-session, 401-without-bootstrap-cookie, mint-shape tests → then `app/api/remote-view/token/route.ts` copying the terminal route (aud `remote-view-ws`, 5m, raw HKDF Buffer key) | remote-view | Route tests green; auth test vectors (signed JWTs + expected claims, good and bad) committed to `test/contracts/remote-view-auth-vectors.json` — Task 4.4 imports the same vectors | Finding 03 — frozen contract |
| 2.7 | `IRemoteViewService` interface + `FakeRemoteViewService` + DI registration (`DI_TOKENS.REMOTE_VIEW_SERVICE`, useFactory in prod + test containers) + contract tests in `test/contracts/remote-view-service.contract.ts` | remote-view | Contract suite passes for fake (real adapter joins in Phase 5) | Constitution P2 sequence |
| 2.z | **Harness phase-end** — `/eng-harness-flow --event phase-end --plan-dir docs/plans/088-remote-app-view` | — | Envelope handled | _Harness seam — advisory_ |

#### Phase 3: Viewport UI & Content-Area Mode

**Objective**: User-visible remote view against the fake: URL mode, picker, decoding viewport with HUD and all Workshop 002 UI states, input capture, layout composition proof.
**Domain**: remote-view (+ additive `file-browser` touch)
**Delivers**: `view=remote`/`rv` params; RemoteViewPanel (lazy); picker; viewport with stats HUD; browser smoke; bundle guard
**Depends on**: Phase 2
**Testing mode (Hybrid per spec)**: this phase is browser-smoke-validated, not unit-TDD'd — Task 3.6 is the validation task; guard tests (2.2 dep-direction, 3.7 bundle) backstop it. Covered by the Constitution Deviation Ledger.
**Key risks**: 085/087 merge adjacency — contained to two file-browser files (Finding 01); coordinate merge order, not code.

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 3.0 | **Harness pre-flight** — `/eng-harness-flow --event pre-implement --phase "Phase 3" --plan-dir docs/plans/088-remote-app-view` | — | Envelope handled | _Harness seam — advisory_ |
| 3.1 | URL contract: extend `view` literal in `file-browser.params.ts` to `['recent-feed','remote']`; add `params/remote-view.params.ts` (`rv`); compose into page params cache | file-browser / remote-view | Deep link `?view=remote&rv=x` hydrates; `rv` without `view=remote` inert (Workshop 001 rules) | AC-8 URL half |
| 3.2 | RemoteViewPanel branch: `dynamic()` import + `view==='remote'` branch in `browser-client.tsx` (copy RecentFeedView shape at :95/:226); extend file-select switch-back to `{view:null, rv:null}` | file-browser / remote-view | Mode swaps both ways; file state restores from untouched params | AC-5 logic; Finding 01 |
| 3.3 | Window picker: grid of windows (app, title, thumbnail) from `GET /api/remote-view/windows` (fake-backed until Phase 5 routes; component takes data via service interface) | remote-view | AC-1 renders against fake data; attach click → `rv` set → viewport | |
| 3.4 | Viewport: WebCodecs `VideoDecoder` + canvas + stats HUD (fps, latency, dropped, bitrate) + every Workshop 002 client state rendered (`degraded`, `displaced` reclaim card, `windowGone`, `error` with named TCC grant) | remote-view | Each state reachable via fake cues; HUD live with glass-to-glass latency from Workshop 003 ping/pong clock-offset, verified against the fake's synthetic timestamps (AC-2 measurement path proven pre-live); decoder drop-to-keyframe on queue >10 | Decode policy per Workshop 003 |
| 3.5 | Input capture: focus/capture rules (Workshop 001 §Focus), normalized coords, rAF batching, release chord; serialize per protocol | remote-view | Fake's input log matches expected serialization for click/drag/scroll/type script (AC-3 serialize half) | |
| 3.6 | Browser smoke `harness/src/remote-view-smoke.test.ts`: attach→frames render on canvas; terminal-over + terminal-beside live; switch-back restores file; refresh reattach; two-context displace/reclaim — all vs fake | remote-view | Green on desktop+tablet projects (AC-5, AC-6, AC-7, AC-12 smoke halves) | `just test-harness`; Finding 06 — fake-streamd runs **inside** the harness container (same network namespace as the headless Chromium), WS port/URL injected via test fixture |
| 3.7 | Bundle guard: sentinel `data-testid="remote-view-viewport"` in heavy component; `test/unit/web/features/088-remote-view/bundle-guard.test.ts` copying `bundle-ac10.test.ts` (lazy chunk has sentinel; initial chunks don't) | remote-view | Guard green after `pnpm turbo build` (AC-13) | |
| 3.z | **Harness phase-end** — `/eng-harness-flow --event phase-end --plan-dir docs/plans/088-remote-app-view` | — | Envelope handled | _Harness seam — advisory_ |

#### Phase 4: Native Daemon (Swift)

**Objective**: Build streamd per Workshops 003/004: capture→encode→WS pipeline, session table with latest-attach-wins + grace GC, input injection, control API, signed bundle + registry.
**Domain**: remote-view (native composition; outside pnpm graph)
**Delivers**: `native/streamd/` SwiftPM package; `just streamd-*` recipes; signed `ChainglassStreamd.app`; Swift protocol conformance tests
**Depends on**: Phase 1 (spike verdicts); Phase 2 (fixtures + protocol)
**Key risks**: Encode pipeline tuning (keyframe-on-demand, pause-when-unwatched) is the deepest new code; spike evidence bounds it.

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 4.0 | **Harness pre-flight** — `/eng-harness-flow --event pre-implement --phase "Phase 4" --plan-dir docs/plans/088-remote-app-view` | — | Envelope handled | _Harness seam — advisory_ |
| 4.1 | Scaffold `native/streamd/` (Package.swift, macOS 14 min) + `scripts/make-bundle.sh` (Info.plist: `com.chainglass.streamd`, `LSUIElement`) + justfile recipes `streamd-setup/build/install/kill` | remote-view | `just streamd-install` produces a signed bundle at the stable install path; rebuild keeps TCC grants (per 1.5 evidence); all four recipes appear in `just --list` | Workshop 004 — this task owns the justfile additions |
| 4.2 | `Protocol.swift` Codable mirror + binary header codec; `swift test` against the **same** canonical fixtures as Task 2.3 | remote-view | Cross-language fixture suite green on Swift side | Drift guard (Workshop 003) |
| 4.3 | Capture+encode pipeline: SCK per-window stream → VTB low-latency H.264 (P-frames, keyframe-on-demand); pause/resume on viewer presence; resize → new config + keyframe | remote-view | Manual: live Godot window streams to the Phase 1 browser harness ≥30fps sustained | external-research encode decisions |
| 4.4 | WS + control API: `/health` (permissions preflight via `CGPreflightScreenCaptureAccess`/`AXIsProcessTrusted`), `/windows` (**narrowed contract, F005**: the single attached-window descriptor only — a daemon serves ONE window, so no picker catalog and no thumbnail; enumerating all capturable windows for the picker is the web-side daemon manager's job in Phase 5), `/sessions` CRUD, `/stream` upgrade — JWT verify (HKDF, aud `remote-view-ws`) + Origin allowlist before upgrade; session table: latest-attach-wins displacement, 300s grace GC, heartbeat 15s | remote-view | Protocol conformance vs fixtures; manual two-client displacement check; bad-token/bad-origin rejected with `E_AUTH`/`E_ORIGIN`; Task 2.6 auth vectors verify against the Swift verifier (same HKDF bytes) | Workshops 002/004; Finding 03. Stage-5 expansion: split into (a) auth+upgrade gate, (b) session table, (c) control endpoints |
| 4.5 | Input injection: DOM `code`→virtual-keycode table, `text` via unicode injection, mouse mapping via ~30Hz `kCGWindowBounds` tracking (Retina + chrome offset), focus-follows-stream, auto-restore minimized | remote-view | Manual: click/drag/scroll/type land correctly in Godot + Simulator (AC-3/AC-4 live halves); minimized window auto-restores (AC-10) | Workshop 003 input model |
| 4.6 | Registry + lifecycle: write `.chainglass/streamd-<webPort>.json` (atomic temp+rename) on listen; self-exit when registry file vanishes; `SIGTERM` → `bye` then clean close | remote-view | Manual kill/registry-delete tests behave per Workshop 004 | |
| 4.z | **Harness phase-end** — `/eng-harness-flow --event phase-end --plan-dir docs/plans/088-remote-app-view` | — | Envelope handled | _Harness seam — advisory_ |

**Verification (Hybrid per spec)**: Swift-side fixture tests (automated) + a written manual smoke checklist executed and recorded in the execution log (capture, displacement, auth rejection, input fidelity, lifecycle).

#### Phase 5: Lifecycle, Agent Surface & Events

**Objective**: The web server owns daemon lifecycle; agents get `list/attach/detach` everywhere; session state flows to clients via SSE + GlobalState.
**Domain**: remote-view (consuming _platform/sdk, _platform/events, _platform/state)
**Delivers**: daemon manager + fail-closed reaper; API routes; SDK/CLI/MCP verbs; SSE envelope + GlobalState publishing; real `RemoteViewService` adapter joining the Phase 2 contract suite
**Depends on**: Phase 2 (interfaces, fake); Phase 4 only for live verification (all tests run against fakes/stubs)
**Key risks**: Reaper false-positives — mitigated by copying pty-registry's alive+path-match fail-closed semantics exactly.

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 5.0 | **Harness pre-flight** — `/eng-harness-flow --event pre-implement --phase "Phase 5" --plan-dir docs/plans/088-remote-app-view` | — | Envelope handled | _Harness seam — advisory_ |
| 5.1 | Daemon manager TDD: spawn-on-demand (`open -g … --args`), readiness poll (registry + `/health`), reaper (pid alive AND exec path matches `bundlePath`, else kill+clean), version handshake (`/health` daemonVersion/protocolVersion vs pinned; mismatch → graceful shutdown + respawn per Workshop 004), port default `webPort+1501` overridable via `CG_REMOTE_VIEW__DAEMON_PORT` (ADR-0003) — tests first with a stub executable + temp registry dir | remote-view | Reaper/spawn suite green incl. stale-pid, path-mismatch, crashed-daemon, and version-mismatch-respawn cases (AC-11 logic) | `server/daemon-manager.ts`; pty-registry semantics |
| 5.2 | Routes TDD: `…/windows`, `…/sessions`, `…/health` proxies (NextAuth-gated; server-side JWT mint; spawn-on-demand; responses include `daemonPort` from registry). The **picker catalog** (enumerate capturable windows + thumbnails) is owned **here, web-side** — the daemon `/windows` stays single-window-only (F005/F006) | remote-view | Route tests green with `FakeRemoteViewService`; real adapter passes Phase 2 contract suite | Finding 08: CLI hits these |
| 5.3 | SSE: emit `remote-view` envelopes (`attached`/`detached`/`daemon-state`) via `ICentralEventNotifier`; client `useChannelEvents('remote-view', …)` → `setParams({view:'remote', rv})` on agent attach | remote-view | Fake-notifier test: agent attach event switches an open client's params (AC-8 push half) | Finding 05; Workshop 002 R4 |
| 5.4 | GlobalState: `registerDomain('remote-view', …)`; publish `remote-view:<ses>:status/latency-ms/fps` (5s throttle per Workshop 003 Q2) | remote-view | `service.list('remote-view:')` shows live session entries; HUD unaffected | |
| 5.5 | SDK contribution: `sdk/contribution.ts` + `sdk/register.ts` (commands `remote-view.list/attach/detach`, Zod params) + one-line in `sdk-domain-registrations.ts` | remote-view | Commands appear in palette; attach with no args opens picker (Workshop 001 entry) | ADR-0013 |
| 5.6 | CLI + MCP: `remote-view.command.ts` (`registerRemoteViewCommands` in `cg.ts`; `readServerInfo` + `X-Local-Token`) and `remote-view.tools.ts` (`registerRemoteViewTools` in `server.ts`; verb_object names, four annotations per ADR-0001) | remote-view | `cg remote-view list|attach|detach` round-trip against dev server; MCP tools mirror (AC-8 CLI/MCP half) | Finding 04 |
| 5.z | **Harness phase-end** — `/eng-harness-flow --event phase-end --plan-dir docs/plans/088-remote-app-view` | — | Envelope handled | _Harness seam — advisory_ |

#### Phase 6: Integration Hardening, Permissions UX & Docs

**Objective**: Everything real, end-to-end: live AC sweep with recorded measurements, the permissions story (AC-14), documentation, and loose-end reconciliation.
**Domain**: remote-view
**Delivers**: live AC evidence; permissions UX; `docs/how/remote-view.md`; README mention; final domain.md § Concepts
**Depends on**: Phases 3, 4, 5
**Key risks**: Latency target (AC-2 ≤150ms) is first measured here end-to-end; external research budgets 35–65ms typical, leaving headroom — if exceeded, the backpressure/encode knobs from Workshop 003 are the tuning surface.

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 6.0 | **Harness pre-flight** — `/eng-harness-flow --event pre-implement --phase "Phase 6" --plan-dir docs/plans/088-remote-app-view` | — | Envelope handled | _Harness seam — advisory_ |
| 6.1 | Permissions UX: map `E_PERMISSION`/`/health.permissions` to picker preflight card + CLI message naming the exact missing grant + fix path (deep-link to System Settings pane) | remote-view | With a grant revoked, UI and CLI each name the missing grant and the fix; no silent failure (AC-14) | |
| 6.2 | Live AC sweep against real daemon + real Godot + booted Simulator: AC-2 (≥30fps sustained, HUD latency ≤150ms), AC-3/AC-4 (input fidelity), AC-6 (refresh ≤3s), AC-7 (two tabs), AC-10 (minimize/close), AC-11 (orphan check across `just dev` cycles), Workshop 004 version-mismatch respawn (old daemon running, new web build) | remote-view | Checklist executed with measured numbers recorded in `execution.log.md` | The integration moment |
| 6.3 | Docs: `docs/how/remote-view.md` (one-time setup incl. cert + TCC walkthrough, agent verbs, troubleshooting table keyed by error codes), README quick mention, finalize `domain.md` `§ Concepts` | remote-view | Docs build/links valid; a fresh reader can complete setup from the how-to alone | Hybrid docs strategy |
| 6.4 | Reconciliation: close/route Workshop open questions; record Safari decode results → backlog; verify dep-direction + bundle guards still green; `just check` clean | remote-view | No stale OPENs the work answered; quality gates pass (Constitution §3.4) | |
| 6.z | **Harness phase-end** — `/eng-harness-flow --event phase-end --plan-dir docs/plans/088-remote-app-view` | — | Envelope handled | _Harness seam — advisory_ |

## Acceptance Criteria

Derived from the spec (numbering preserved); each is testable as noted in its phase:

- [ ] **AC-1** Window picker lists capturable windows (app, title, thumbnail) and attach works — Phase 3 (fake) + Phase 6 (live)
- [ ] **AC-2** Live Godot stream ≥30fps sustained (60 target), glass-to-glass ≤150ms on LAN/tailnet, readable from stats HUD — Phase 6 measured
- [ ] **AC-3** Click/drag/scroll/type land at correct coordinates (Retina + chrome) — serialization Phase 3, live fidelity Phases 4/6
- [ ] **AC-4** iOS Simulator: clicks→taps, typed text arrives — Phases 4/6 live
- [ ] **AC-5** Terminal-over and terminal-beside work unchanged with remote view active; switch-back restores file state — Phase 3 smoke
- [ ] **AC-6** Browser refresh resumes the same session ≤3s — Phase 3 smoke (fake) + Phase 6 live
- [ ] **AC-7** Latest attach wins; displaced viewport shows reclaim; no wedged locks — Phase 3 smoke + Phase 6 live
- [ ] **AC-8** `remote-view list|attach|detach` via CLI + MCP; agent attach pushes the user's content area; URL-addressable state — Phases 3/5
- [ ] **AC-9** Stream connection rejected without valid token; cross-origin rejected — Phase 2 (route) + Phase 4 (daemon)
- [ ] **AC-10** Minimized target auto-restores; closed window → clear "window gone" state; never a silent black frame — Phases 3/4/6
- [ ] **AC-11** Daemon spawned/discovered/reaped via `.chainglass/` registry; stale daemons reaped fail-closed; no orphans — Phase 5 (logic) + Phase 6 (live)
- [ ] **AC-12** Full web feature runs + passes tests against the frame-replay fake with no daemon — Phases 2/3
- [ ] **AC-13** Viewport lazy-loaded; base bundle unchanged — Phase 3 guard
- [ ] **AC-14** Missing TCC grants reported precisely with fix path; how-to documents setup — Phase 6

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| SCK capture fidelity gaps for Metal/Simulator content (black frames, minimize quirks) | Medium | High | Phase 1 spike before web commitment; auto-restore + explicit UI states (AC-10) |
| TCC grants reset on rebuild (signing identity instability) | Medium | High | Stable self-signed cert + stable install path (Workshop 004); spike Task 1.5 verifies; documented fallback |
| Input injection unreliable (raw-input games, fullscreen-exclusive) | Medium | Medium | Focus-follows-stream; windowed-mode documented requirement; spike Task 1.3 validates the two target apps |
| Browser decode config variance (Safari) | Low-Med | Medium | Chromium-gating per clarification; spike Task 1.4 records Safari → backlog |
| Plans 085/087 merge adjacency | Medium | Low-Med | Touch surface reduced to two file-browser files (Finding 01); coordinate merge order |
| Latency exceeds 150ms end-to-end | Low | Medium | Budget says 35–65ms typical; Workshop 003 backpressure/encode knobs are the tuning surface; HUD makes it measurable |
| TCP head-of-line blocking on lossy links | Low (LAN/tailnet) | Medium | Drop-on-backpressure; WebRTC/WHEP documented as v2 escape hatch, not built |
| Daemon manager reaper false-positive kills | Low | Medium | Fail-closed alive+path-match semantics copied from pty-registry; TDD'd with stub executables (Task 5.1) |

## Harness Seams

- **Entry point**: `/eng-harness-flow --event <seam> [--phase <id>] [--plan-dir <p>] --json` — the single door to the engineering harness; child skills are private and never named in this plan.
- **Backpressure** (post-spec seam): **not run** — this repo has not adopted a harness, so the seam routes to adoption rather than a coverage survey. No Recommended Phase 0 exists; the plan uses the spec's standard Hybrid testing strategy.
- **Pre-implement** (`--event pre-implement`): fired by the implement verb at the start of each phase (the N.0 rows); verdicts narrated verbatim from the router's envelope (`healthy / SLOW / UNHEALTHY / UNAVAILABLE`). `UNAVAILABLE` is not an error — falls back to standard testing.
- **Phase end** (`--event phase-end`): fired at each phase seam (the N.z rows); `--event plan-complete` fires at merge (the merge verb).
- **Best-effort**: every item above is advisory and never blocks; the router decides what the harness does at each seam.

---

## Validation Record (2026-06-13)

### Validation Thesis

**Raison d'être**: Sequence the CS-5 remote-app-view spec (web feature + first native Swift daemon) into executable, correctly-ordered phases so downstream task-expansion/implementation proceeds without re-research, without contradicting the four authoritative workshops, with risk front-loaded into a spike.

**Value claim**: Implementation becomes cheaper and safer — phases name real files and copy-from precedents; the riskiest unknowns are retired before web code commits; race conditions are enumerated TDD targets.

**Artifact promise**: Any "Phase N: Title" block expands into a tasks dossier with minimal clarification; phases compose in the stated dependency order; the Gate Matrix (READY) is truthful.

**Intended beneficiaries**: stage-5 task-expansion and stage-6 implementation agents; the stage-7 reviewer; the user (game-dev iteration).

**Proof target**: Implementation

**Evidence standard**: cited paths/lines match the repo; workshop decisions carried without contradiction; every spec AC maps to ≥1 phase; testing matches spec Hybrid + constitution rules.

**Thesis source**: remote-app-view-spec.md + the-flow registry contract (plan → per-phase task expansion). Not inferred.

**Thesis verdict**: Advanced (structurally; empirical proof correctly deferred to Phase 1 spike + Phase 6 sweep)

**Main thesis risk**: Phase 1 spike is load-bearing — a hard capture/TCC failure re-scopes the plan; the spike is first and cheap by design.

---

| Agent | Lenses Covered | Thesis Axes Covered | Issues | Verdict |
|-------|---------------|---------------------|--------|---------|
| Coherence & Completeness | System Behavior, Integration & Ripple, Edge Cases | Implementation Readiness, Downstream Usefulness | 1 HIGH fixed, 2 MEDIUM fixed, 1 LOW accepted | ⚠ → ✅ |
| Source Truth | Evidence Sufficiency, Technical Constraints, Hidden Assumptions, Concept Documentation | Evidence Sufficiency | 0 (agent report truncated; all cited claims independently verified first-party in-session: params:30, browser-client:95/226/721, panel-shell:88, socket:96, token route, terminal-auth, ADR numbering, `just check`) | ✅ |
| Thesis Alignment | Thesis Alignment, Proof-Level Fit, Security & Privacy, Domain Boundaries | Thesis Alignment, Proof-Level Fit, Contract Integrity | 2 HIGH fixed (ledger scope, Phase 3 testing-mode clarity), 1 MEDIUM fixed (auth vectors) | ⚠ → ✅ |
| Forward-Compatibility | Forward-Compatibility, Deployment & Ops, Performance & Scale | Downstream Usefulness, Contract Integrity | 1 HIGH fixed (config naming vs ADR-0003), 1 HIGH fixed (version-mismatch untasked), 3 MEDIUM fixed (fixtures regen, Docker networking, AC-2 measurement path), 1 MEDIUM fixed (open-question routing) | ⚠ → ✅ |

### Forward-Compatibility Matrix

| Consumer | Requirement | Failure Mode | Verdict | Evidence |
|----------|-------------|--------------|---------|----------|
| Stage-5 task expansion | Stable unique phase titles; expandable task tables | encapsulation lockout | ✅ | 6 unique titles; tasks carry Domain/SC/Notes; manifest covers task files |
| Stage-6 implement | Honest dependency order; TDD ordering | shape mismatch | ✅ | Phase Index aligned to per-phase blocks (fixed); tests-before-impl in TDD phases |
| Stage-7/8 review & merge | Measurable ACs mapped to phases; quality gates tasked | encapsulation lockout | ✅ | All 14 ACs phase-mapped; 6.4 runs `just check` + guards |
| Workshop 001 validation | URL round-trip + composition smoke | contract drift | ✅ | Tasks 3.1/3.6 |
| Workshop 002 validation | R1–R9 TDD + smoke + window-id spike check | contract drift | ✅ | Tasks 2.5/3.6/1.5 |
| Workshop 003 validation | Cross-language fixtures + fake-to-live + Chromium decode | test boundary | ✅ | Tasks 2.3/4.2/3.6/1.4; fixture-regeneration rule added (fixed) |
| Workshop 004 validation | TCC persistence, orphan-free cycles, version-mismatch respawn | lifecycle ownership | ✅ (was ❌) | Tasks 1.5/5.1 (version handshake added)/6.2 (respawn check added) |
| Spec ACs (14) | Each reachable as sequenced | encapsulation lockout | ✅ | AC section cites building + verifying tasks; AC-2 measurement path now built in 3.4 (fixed) |

**Thesis alignment**: Value claim advanced (Yes, structurally — empirical proof correctly staged); proof level Target = Implementation, Actual = Implementation contingent on the Phase 1 spike verdict; main risk: the spike is load-bearing and deliberately first.

**Outcome alignment**: The plan, as written, advances the spec's Outcome verbatim: "a live, interactive stream of ONE desktop app window … viewable and clickable from the browser. … The terminal keeps working over or beside it. Agents can list windows, attach, and detach via chainglass commands so they can hand the user a running app."

**Standalone?**: No — downstream consumers are concrete (stage-5/6/7 verbs, workshop validation conditions, spec ACs).

Overall: VALIDATED WITH FIXES
