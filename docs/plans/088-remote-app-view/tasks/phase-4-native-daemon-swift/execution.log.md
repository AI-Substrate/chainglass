# Phase 4: Native Daemon (Swift) — Execution Log

> Plan: [remote-app-view-plan.md](../../remote-app-view-plan.md) · Phase 4 of 6 · Mode: Full · Testing: **Hybrid**
> Companion: `code-review-companion` run `2026-06-15T17-45-16-149Z-69f6` (Power-On-Mode, reviews every commit).
> Host: macOS 26.5 / Swift 6.2.4 — `swift test` automatable; capture/encode/input = manual recorded smoke.

## Execution order (host-Mac batching)

To keep the user's single host-Mac visit tight, the deterministic/automatable work runs first
(no permission prompts), then ONE visit batches every TCC/keychain moment:

- **Batch A (no host-Mac GUI)** — T000, T001 scaffold, T002 (Protocol+codec), T004 (auth), T005 (session table), the keycode-map unit of T007, and as much compile-clean code for T003/T006/T008 as possible.
- **Batch B (one host-Mac visit)** — `just streamd-setup` (cert) + `just streamd-install` (sign) + Screen-Recording grant + Accessibility grant, then live smoke (T003/T006/T007/T009).

---

## T000 — Harness pre-flight (seam) ✅

Fired `/eng-harness-flow --event pre-implement --phase "Phase 4: Native Daemon (Swift)" --plan-dir docs/plans/088-remote-app-view --prompt-optional=false --json`.

Derived signals: S0 CLI present (`~/.npm-global/bin/harness`); **S2 governance absent** (no `.harness/engineering-harness.md`). Decision `redirect` → adoption (governance owed). **Boot verdict: `UNAVAILABLE`** — repo never adopted the harness (same as Phases 1–3). Per procedure, `UNAVAILABLE` is not an error → fall back to the plan's Hybrid testing. No re-offer (`--prompt-optional=false`).

## T001 — Scaffold + signing + bundle + recipes (CS-4) — [~] in progress (host-Mac install deferred to Batch B)

**Landed (automatable, no permissions):**
- `native/streamd/Package.swift` — SwiftPM, `swift-tools-version:5.9`, macOS 14 floor, executable `streamd` + test target `streamdTests`. Zero external deps (system frameworks only → builds offline/deterministically).
- `Sources/streamd/Config.swift` — `DaemonConfig.parse(argv, env)`: `--port / --registry <abs> / --bootstrap <abs>`; port resolves `--port` → `CG_REMOTE_VIEW__DAEMON_PORT` env (ADR-0003) → dev default `6001`; rejects invalid/unknown/missing values. Daemon never derives the registry path or computes the `webPort+1501` offset (Phase 5 passes them).
- `Sources/streamd/CoreGraphicsInit.swift` — headless `NSApplication.shared` + `.prohibited` (CGS_REQUIRE_INIT mitigation), idempotent; to be called before any SCK/CGEvent (T003/T007).
- `Sources/streamd/main.swift` — entry point: parse → CG-init → report config (placeholder run loop; replaced by T004/T006/T008).
- `scripts/setup-cert.sh` + `scripts/make-bundle.sh` — ported from the Phase-1 spike; **cert `chainglass-dev` + bundle id `com.chainglass.streamd` reused exactly** (Finding 02); install path reconciled to **Workshop 004's** `~/Library/Application Support/chainglass/streamd/ChainglassStreamd.app`; `LSUIElement=true`, `LSMinimumSystemVersion=14.0`.
- `justfile` — recipes `streamd-setup`, `streamd-build`, `streamd-test`, `streamd-install` (deps `streamd-build`), `streamd-kill`.

**Evidence:**
- `just --list` shows all four named recipes (+ `streamd-test`). ✅
- `swift build` → "Build complete! (5.58s)". ✅
- `swift test` → `ConfigTests` 6/6 passed, 0 failures. ✅

**Deferred to the single host-Mac visit (Batch B):** `just streamd-setup` (keychain cert — GUI auth), `just streamd-install` (signed bundle at the install path), and the rebuild-keeps-Screen-Recording-grant verification (spike 1.5). These cannot run remotely.

## T002 — Protocol.swift mirror + 16-byte binary codec (CS-3, automated) ✅

**Landed:**
- `Sources/streamd/BinaryFrame.swift` — 16-byte big-endian frame header (frameType / flags / reserved / u32 sequence / u64 captureTimestampMicros) encode+decode + hex helpers; unknown frameType / short buffer → `nil` (never throws); `UInt64` timestamps (handles 2^53+1, the JS-unsafe row).
- `Sources/streamd/Protocol.swift` — Codable mirror of every Workshop-003 control message: `ClientMessage` (8 cases) + `ServerMessage` (8 cases) discriminated on `t`, `InputEvent` (7 cases) on `k`, shared `WindowDescriptor`/`Mods`/`MouseButton`/`ErrorCode`/`WindowStateName`/`ByeReason`. `parse()` returns `nil` on unknown `t` / invalid JSON (forward-compat, never throws); coords bounded to `[0,1]` at decode (parity with the TS `NormalizedCoordinateSchema`); `client-stats.e2eLatencyMs` explicit-null preserved.
- `Tests/streamdTests/{TestSupport,BinaryFrameTests,ProtocolTests}.swift` — resolve the **same** repo-root fixtures via `#filePath` (no copy → no drift, cwd-independent).

**Evidence (`swift test`): 23/23 green** (6 Config + 11 Protocol + 6 BinaryFrame).
- Binary: every `frame-header.json` row encodes **byte-identical** to the fixture `hex`; decode round-trips; **u64 2^53+1 (9007199254740993) preserved**; unknown frame type + short buffer → nil.
- Control: all **9 client + 20 server** canonical messages decode into the Swift model and round-trip (encode→decode identity); all 7 error codes / 5 window-states / 3 bye reasons present; `client-stats` null latency preserved; `café` unicode preserved; unknown `t` → nil; out-of-[0,1] coord rejected.

Cross-language drift guard GREEN on both sides (vitest + `swift test`). Deterministic — no host-Mac dependency.

## T003 — Capture + encode pipeline + FrameSource seam (CS-5) ✅ (code; live capture → Batch B)

**Design pivot (the key Batch-A.2 enabler):** introduced a `FrameSource` seam so the WS server (T006) can be verified **headless, no TCC grant**.

**Landed:**
- `Sources/streamd/FrameSource.swift` — the seam:
  - `VideoFrame{isKeyframe, captureTimestampMicros, avcc}` + `VideoConfig{codec, description, width, height, fps}` value types; `FrameSourceEvent` (`.config`/`.frame`/`.windowState`/`.windowGone`) — the event stream a source emits.
  - `protocol FrameSource` — `window`, `config` (nil for live until first keyframe), `start(on:onEvent:)`, `requestKeyframe`/`pause`/`resume`/`stop`.
  - `FixtureFrameSource` — replays the recorded Phase-1 H.264 fixtures (`protocol/fixtures/video/manifest.json` + `frames/*.bin`) at the manifest fps via a `DispatchSourceTimer`, loops, forces a keyframe on start/resume/`requestKeyframe` (jump to nearest keyframe). Foundation-only (no SCK/VTB) → runs on any host. The **daemon-side analogue of `fake-streamd.ts`**; this is what makes the T006 smoke real without a window.
- `Sources/streamd/Encoder.swift` — `H264Encoder`: a `VTCompressionSession` wrapper. Recorded encode contract: H.264 High (AutoLevel; target High@3.2 = `avc1.640020`), `AllowFrameReordering=false` (P-frames only), `MaxKeyFrameInterval=60`, `ExpectedFrameRate`, force-keyframe on demand + frame 0. Emits one **AVCC** access unit per frame; lifts the base64 avcC (SPS/PPS) from the first keyframe's format-description atom for `video-config.description`; keyframe detected via `kCMSampleAttachmentKey_NotSync`.
- `Sources/streamd/Capture.swift` — `CaptureFrameSource` (live): `SCStream` + `SCContentFilter(desktopIndependentWindow:)` per target window → `H264Encoder`; `SCStreamOutput` feeds pixel buffers; `SCStreamDelegate.didStopWithError` → `.windowGone`; pause/resume (resume → keyframe). CG-init precedes it (main.swift).

**Evidence:**
- `swift build` → **Build complete!** (Encoder.swift + Capture.swift compile against VideoToolbox + ScreenCaptureKit on Swift 6.2.4); `swift test` → still **53/53** (no behavioural change to the tested core; FixtureFrameSource is exercised live by the T006 headless smoke, not a unit test).

**Deferred to the host-Mac visit (Batch B / T009):** live SCK capture (Screen-Recording grant), real VideoToolbox encode of a Godot window ≥30fps, resize→config+keyframe, window-gone. These need a GPU + a real window + the grant; the code is written and compiles.

> **Companion note:** from T003 onward this phase runs in **no-companion mode** — the `code-review-companion` boot didn't register a targetable run this session (minih coordination-state schema error; `minih runs list` → 0). Batch A was already companion-reviewed (run …69f6). Per the implement-verb fallback, a post-hoc `/the-flow 7 review` is the recovery path for T003/T006.

## T004 — WS auth + upgrade gate: JWT + Origin (CS-3) ✅ (vector suite + live WS wiring verified headless)

**Landed (automatable, no permissions):**
- `Sources/streamd/Auth.swift` — the frozen auth contract (Finding 03):
  - `deriveSigningKey(fromCode:)` HKDF-SHA256 (salt `chainglass.signing.salt.v1`, info `chainglass.signing.info.v1`, 32 bytes) — byte-identical to Node `hkdfSync`; `signingKey(bootstrapPath:env:)` mirrors `activeSigningSecret` (AUTH_SECRET UTF-8 path, else HKDF over `.chainglass/bootstrap-code.json` `code`).
  - `verifyJWT(_:key:now:)` HS256 via CryptoKit HMAC (constant-time `isValidAuthenticationCode`); base64url decode; asserts `iss=chainglass`, `aud=remote-view-ws`, `exp`, non-empty `sub`; **no `cwd`**. Never throws (typed `AuthError`).
  - Origin allowlist mirror of `terminal-auth.ts`: `parseAllowedOrigins`, `buildDefaultAllowedOrigins`, `authorizeUpgrade` — bad origin → close **4402 E_ORIGIN**, bad/missing token → close **4401 E_AUTH** (remote-view close codes, AC-9).
- `Tests/streamdTests/AuthVectorsTests.swift` — loads the SAME `test/contracts/remote-view-auth-vectors.json` (via `#filePath`).

**Evidence (`swift test`): 32/32 green** (+9 AuthVectorsTests).
- All 4 vectors verify byte-for-byte: `good` accepts (sub=remote-user); `expired`→`.expired`; `wrong-aud`→`.wrongAudience`; `wrong-key`→`.badSignature`.
- HKDF matches the Node oracle byte-for-byte (`test-bootstrap-code-123` → `23b5e58b…690273`); AUTH_SECRET + bootstrap-file key paths derive correctly.
- Origin gate: allowlist build/parse + `authorizeUpgrade` (happy / bad-origin / null-origin / missing-token / expired-token → correct 4401/4402 + error code).

**Live wiring DONE (T006, verified headless):** `authorizeUpgrade` is now wired into the live NWListener `/stream` upgrade. The `just streamd-smoke` run against the real daemon confirmed **bad token → `error{E_AUTH}` + close 4401**, **bad origin → `error{E_ORIGIN}` + close 4402**, and **`hello{v:2}` → `error{E_VERSION,fatal}`** — the AC-9 close-code observations, now automated (no TCC grant needed for this slice).

## T005 — Session table: Workshop-002 FSM (CS-3) ✅

**Landed:**
- `Sources/streamd/SessionTable.swift` — pure, time-injected daemon session machine. States `idle|streaming|unwatched|closed`; `create` (→idle, grace), `attach` (idle/unwatched→streaming; **R2** displace prior viewer; **R6** unknown/closed → `unknownSession`), `viewerClosed` (clean close → unwatched, **R1/R9**; displaced old socket = no-op), `close` (detach/window-gone/shutdown → closed terminal, **R9**), `recordHeartbeat`, `takeSequence` (**resets to 0 on each attach**), `sweep(now:)` → `heartbeatTimeout` (**R5**, 15s×2-miss → unwatched) + `graceExpired` (300s → closed).
- `Tests/streamdTests/SessionTableTests.swift` — 12 cases driving the FSM with injected `now` (no sockets, no wall clock).

**Evidence (`swift test`): 44/44 green** (+12 SessionTable).
- R1 reattach resumes; R2 second attach displaces prior viewer; displaced old socket close is a no-op; clean close → unwatched; detach/close → closed terminal; attach-to-closed/unknown → unknownSession (R6); sequence resets to 0 on reattach; R5 heartbeat timeout (29s ok, 31s → unwatched); heartbeat refresh keeps streaming; grace GC (290s ok, 301s → closed) for both idle and unwatched.

Matches `fake-streamd.ts` for displacement + terminal-closed; heartbeat/grace implemented from Workshop 002 directly (not in the fake). Deterministic. **Live two-client displacement re-confirmation rolls into the T009 smoke (Batch B).**

## T006 — Control endpoints + /stream WS server (CS-5) ✅ — verified headless (18/18)

The composition root: wires T004 auth + T005 sessions + T003 frame source into one `NWListener`. **Verified headless against a real `ws` client — no TCC grant, no window.**

**Landed:**
- `Sources/streamd/WebSocket.swift` — hand-rolled RFC 6455 codec (accept-key, frame encode/decode, mask/unmask, close codes 1000/1011/4002/4401/4402/4404). Hand-rolled because Network.framework's `NWProtocolWebSocket` server can't expose the upgrade path/query/`Origin` the auth gate needs, nor emit app-defined close codes precisely. Pure → unit-tested.
- `Sources/streamd/Endpoints.swift` — HTTP request parse + JSON response builders; `/health`/`/windows`/`/sessions`/`/shutdown` shapes; `SessionSummary` (flat, frozen Phase-2 contract); `Permissions` (named TCC grants for `/health` AC-14 + `E_PERMISSION`, via non-prompting `CGPreflightScreenCaptureAccess`/`AXIsProcessTrusted`).
- `Sources/streamd/WSServer.swift` — `NWListener`; HTTP-vs-WS routing; the upgrade gate (complete handshake → `authorizeUpgrade` → reject = `error` frame + close 4401/4402); the full control surface (`hello`/version-gate/create-or-attach/displace, `input`, `request-keyframe`, `pause`/`resume`, `client-stats` ignore, `ping`→`pong`, `detach`→`bye{detached}`+1000, **unknown `t` ignored**); the frame-forward loop (keyframe-gated first frame seq 0, backpressure drop-deltas + keyframe-on-drain); 1Hz `stats`; 5s session `sweep` (heartbeat/grace). All state serialized on one queue (the `SessionTable` is unlocked by design).
- `Sources/streamd/main.swift` — listen/serve wiring: config → CG-init → signing key (T004) → Origin allowlist → frame source (fixtures env → headless replay; else live capture) → `WSServer.start()` → `dispatchMain()`.
- `Tests/streamdTests/WebSocketTests.swift` — RFC 6455 accept-key worked example + framing (7 tests).
- `scripts/smoke-headless.mjs` + `just streamd-smoke` — the reproducible headless wire smoke.

**Evidence:**
- `swift test` → **60/60** (53 + 7 WebSocket).
- `just streamd-smoke` → **18/18** against the live daemon binary (fixture replay over a real authenticated WS):
  - `/health` ok + `daemonVersion=0.1.0` + `protocolVersion=1` + **named grants** `{screenRecording, accessibility}`.
  - Handshake: `hello-ok{window.id=34202}` → `video-config{avc1.640020, 800×656@60, avcC present}` → **first frame keyframe seq 0** → **monotonic** deltas seq 0..9, avcC payloads non-empty.
  - `ping`→`pong{sentAt,daemonAt}`; `request-keyframe`→keyframe; **unknown `t` ignored** (socket stays alive).
  - **latest-attach-wins**: 2nd attach → 1st gets `displaced` + close **4002**; displacing viewer streams keyframe seq 0.
  - `detach`→`bye{detached}` + close **1000**; `hello{v:2}`→`error{E_VERSION,fatal}`.
  - bad token → `error{E_AUTH}` + close **4401**; bad origin → `error{E_ORIGIN}` + close **4402**.
  - `/sessions` → flat `SessionSummary[]` with `state` projected from T005 (`unwatched`/`closed`).

**Deferred to the host-Mac visit (Batch B / T009):** swapping the fixture source for live `CaptureFrameSource` (real frames), live input (T007), and the named-grant `E_PERMISSION` path when Screen-Recording is actually denied. The wire path itself is now proven.

## T007 — Input injection (CS-4) ✅ (keycode map + live injector code; live posting → host-Mac T009)

**Landed:** `Sources/streamd/Input.swift` —
- Pure half (unit-tested): DOM `code` → macOS virtual-keycode table (Carbon `kVK_*`, raw `UInt16`): 26 letters + 10 digits + punctuation + control/whitespace + arrows + modifiers + F1–F12; `keyCode(for:)` → nil on unknown (→ unicode fallback); `denormalize(_:span:scale:)`; **`cgEventFlags(for:)`** (Mods → `CGEventFlags`) + **`cgMouseButton(_:)`** (0/1/2 → `CGMouseButton`).
- Live half (`CGEventInputInjector`, compiles; posting needs the Accessibility grant): parse `input.events[]` → `CGEvent`; mouse de-normalize `[0,1]`→screen points via ~30Hz `kCGWindowBounds`; buttons 0/1/2; `scrollWheelEvent2`; `keyboardEvent` with mapped keycode + flags; `keyboardSetUnicodeString` for `text` and the unmapped-code fallback; **focus-follows-stream** (raise + `activate` the window's app — the spike's focus trap) + **AC-10** `unhide` of a minimized app. Wired in `main.swift` to `WSServer.onInput` on the live capture path only (headless = events accepted + dropped).

**Evidence (`swift test`): 62/62 green** (+2: `cgEventFlags` composes the 4 modifier masks; `cgMouseButton` maps left/middle→center/right). Plus the prior keycode/denormalize tests.

**Deferred to the host-Mac visit (T009, Accessibility TCC):** live click/drag/scroll/type landing in Godot, focus-follows correctness, AC-10 auto-restore. The injector code is written + compiles; only the live posting needs the grant.

## T008 — Registry + lifecycle (CS-2, automatable half) — [~] (file I/O ✅; live self-exit/SIGTERM → daemon loop)

**Landed:** `Sources/streamd/Registry.swift` — `RegistryFile{pid,port,protocolVersion,daemonVersion,bundleId,bundlePath,startedAt}` (field is **`port`**, never `daemonPort`); atomic write (temp+rename via `.atomic`, creates parent `.chainglass/`); `read` → nil on missing/garbage; `exists` (the self-exit-on-vanish predicate); `remove`. `Tests/streamdTests/RegistryTests.swift`.

**Evidence (`swift test`): 53/53 green** (+4). Write→read round-trips all fields + auto-creates parent dir; JSON writes `port` and NOT `daemonPort`; vanish detection (remove → exists=false); read of missing/garbage → nil.

**Deferred to the daemon run loop (lands with T006):** the ~30s vanish poll → self-exit and SIGTERM → `bye{shutdown}` (needs the live listen loop; path comes from `--registry`).

---

## Companion findings reconciliation

_Populated as the companion replies (ackOf → review-request)._

| Finding | Severity | Task | Disposition |
|---------|----------|------|-------------|
| _(none yet)_ | | | |
