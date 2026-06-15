# Phase 1 De-Risk Spike — Findings

**Plan**: [remote-app-view-plan.md](../remote-app-view-plan.md) · **Phase 1 of 6** · **Status**: ✅ COMPLETE — **GO**
**Run**: 2026-06-13 → 2026-06-15 (host: macOS 26.5, M4 Max, Swift 6.2.4, Xcode 26.3)

> **Go/no-go artifact** (plan § Phase 1). Each question has a verdict + evidence + the downstream task that consumes it. **Every verdict is GO** — no hard "no", so Phase 2+ may proceed. Operational caveats are noted per item and routed to their consuming task.

## Verdict summary

| # | Question | Verdict | Consumer |
|---|----------|---------|----------|
| 1.1 | SCK per-window capture fidelity (Godot + Simulator, occlusion) | ✅ **GO** — 45 fps sustained (occluded Godot, 60s) | Task 4.3 capture |
| 1.2 | VideoToolbox H.264 → replayable AVCC fixture set | ✅ **GO** — real captured fixture, 254 frames | Task 2.4 fake |
| 1.3 | CGEvent input injection (mouse + keyboard) | ✅ **GO** — mouse + text land in Godot (focus-sensitive) | Task 4.5 input |
| 1.4 | Browser WebCodecs decode (Chromium gating) | ✅ **GO** — 254/254 real frames, 0 errors; Safari deferred | Task 3.4 viewport |
| 1.5a | Stable-cert TCC persistence across rebuild | ✅ **GO** — grant survives rebuild+resign; ad-hoc re-prompts | Task 4.1 signing |
| 1.5b | Bundle TCC attribution (`open`/`open -g`) | ✅ **GO** — bundle gets its own grant by id+cert | Task 5.1 spawn |
| 1.5c | CGWindowID stability across daemon restart | ✅ **GO** — id stable across ~30min + dozens of restarts | Tasks 2.5 (R6) + 5.1 |
| — | **NEW: capture process must init CoreGraphics** | ⚠️ **carry-forward** — see § Cross-cutting finding | Tasks 4.1/4.3/5.1 |

---

## 1.1 — SCK per-window capture fidelity ✅ GO

**Godot game window (occluded, `onScreen=false`), 60s @60fps target:** sustained **45.0 fps avg (min 35, max 54, 2698 frames)** — comfortably clears the **AC-2 floor (≥30 fps sustained)** *even while backgrounded*. SCK `SCContentFilter(desktopIndependentWindow:)` captures an occluded window fine. Frontmost would be higher; the occluded number is the conservative case and it passes. Stills: `spike/captures/godot-sec*.png`.

**iOS Simulator (iPhone 17 Pro, on-screen), 60s:** 42 fps avg while content changed, then **collapsed to ~0 fps after sec 52 when the screen went static** (`min 0`). This is **not a failure** — SCK is a **deliver-on-change** pipeline: a static window emits almost no frames; an animating one (a game) sustains fps. Evidence log: `spike/captures/t001-t002.log`.

**Implications for Task 4.3 / Task 3.4 (carried forward):**
- Frame rate is **content-driven**, not fixed. The encoder/HUD must treat low fps on a static window as normal, and the keyframe-on-demand path must cover "no frames for a while → viewer attaches → needs a keyframe."
- A game (the primary target) animates continuously → sustained fps confirmed.

## 1.2 — VideoToolbox encode → replayable fixture set ✅ GO

Real Godot capture → VideoToolbox low-latency H.264 (P-frames, `AllowFrameReordering=false`, `MaxKeyFrameInterval=60`, keyframe forced on frame 0) → committed fixture at **`external-research/fixtures/`**:
- **254 frames, 5 keyframes, codec `avc1.640020`** (H.264 High Profile L3.2), 800×656, 39-byte `avcC`, `source: sck-capture`.
- **Validated by round-trip decode** (the dossier's acceptance test): all 254 frames decoded clean in Chromium (§1.4).

**Manifest contract** (cross-phase artifact → Task 2.4):
```json
{ "codec": "avc1.<hex>", "description": "<base64 avcC>",
  "width": N, "height": N, "fps": N, "source": "sck-capture|synthetic-vt",
  "frames": [ { "file": "frames/frame-NNNN.bin", "keyframe": bool, "ptsMicros": N } ] }
```
Each `frame-NNNN.bin` is one AVCC access unit (length-prefixed NALs, as VideoToolbox emits) — replayable with no Node/Swift dependency (Finding 06). `source` is additive provenance. **Note**: a synthetic generator (`streamd-spike synth`, no Screen-Recording grant needed) drives the same encoder and was used to prove the pipeline before grants landed; the committed seed is now the real `sck-capture` set. Either is shape-identical for Task 2.4.

## 1.3 — CGEvent input injection ✅ GO (focus-sensitive)

Injected into the Godot game window (focus-follows-stream: activate app, post `CGEvent` at `kCGWindowBounds`-derived coords):
- **Mouse: ✅** click + drag registered in Godot (`[input] mouse btn=1 …`).
- **Keyboard: ✅** text via unicode-string injection arrived intact (`[input] key 'h','e','l','l','o'`) **once the game window had focus** (click immediately before typing).

**Operational finding for Task 4.5:** keyboard requires the target to be the **key window** at post time; an intervening focus-changing event (the first attempt did a drag/scroll between click and type) silently drops keys. The daemon's input path must keep the streamed window key/focused. Tested against an **editor-hosted debug** game window; a standalone exported game (production case) is the key window by default — Task 4.5 should re-verify text + hardware-keycode (WASD) paths there. Matrix recorded in `tasks/.../execution.log.md`.

## 1.4 — Browser WebCodecs decode ✅ GO (Chromium) · Safari deferred

Headless Chrome 149, `decode-harness/index.html`, fed the fixture paced at native fps:

| Fixture | isConfigSupported | decoded/submitted | errors | report |
|---------|-------------------|-------------------|--------|--------|
| real `sck-capture` (avc1.640020) | true | **254 / 254** | 0 | `spike/decode-harness/decode-report-real-capture.json` |
| synthetic (avc1.64001e) | true | 120 / 120 | 0 | `spike/decode-harness/decode-report-chromium.json` |

**Verified decoder config → Task 3.4:**
```js
const config = { codec: manifest.codec, codedWidth: manifest.width, codedHeight: manifest.height,
                 description: bytesFrom(manifest.description) /* avcC, base64→Uint8Array */, optimizeForLatency: true };
```
`description` (avcC) is **mandatory** for `avc1.*` — omitting it fails `isConfigSupported`. `EncodedVideoChunk.type` = `'key'`|`'delta'` from the manifest, `timestamp` = `ptsMicros`. (firstFrame/interval timings in the reports are harness-pacing artifacts, not glass-to-glass — AC-2 latency is measured live in Phase 6.)

**Safari (record-only, non-gating per spec Chromium-gating):** ⏳ deferred — `open -a Safari`/AppleScript didn't load the harness (0 requests, AppleEvent timeout). Re-test by hand on the host Mac; does not gate the spike.

## 1.5 — TCC + lifecycle assertions ✅ GO (all three)

**(a) Stable-cert persistence ✅** — created a stable self-signed codesigning cert **`chainglass-dev`** (`scripts/setup-cert.sh`; note the OpenSSL-3 `-legacy`/SHA1-PBE flags — Apple's `security import` rejects OpenSSL-3's default PKCS12 MAC). Built **`Chainglass Streamer.app`** (`com.chainglass.streamd`) signed with it; granted Screen Recording; **rebuilt + re-signed with the same cert → grant persisted, no re-prompt**. By contrast, the **ad-hoc-signed** throwaway bundle **re-prompted on every rebuild** (cdhash-based DR) — Finding 02's TCC trap, observed live. → **the stable cert is mandatory; Phase 4 (Task 4.1) MUST reuse this exact `chainglass-dev` cert + `com.chainglass.streamd` id, or the grant breaks.**

**(b) Bundle TCC attribution ✅** — launched via `open`/`launchctl asuser 501 open`; the grant attached to the **bundle identity** (`com.chainglass.streamd`), distinct from the controlling terminal — confirmed by a fresh process reading `screen-recording=GRANTED` for the bundle. TCC keys on (bundle id + cert leaf), so the grant is **path-independent and binary-independent** within that identity → carries to the Phase 4 daemon. → Task 5.1 spawn-on-demand.

**(c) CGWindowID stability ✅** — Godot window `34202` stayed a valid id across ~30 min and **dozens of separate capture-process launches** (`windowid --check 34202` → present in both CGWindowList and SCShareableContent). R6's "id stable across daemon restart" assumption **holds** → Task 2.5 reattach + Task 5.1. (Failure fallback — picker-with-toast — not needed.)

---

## Cross-cutting finding (NEW — carry-forward to Phase 4) ⚠️

**A capture process must initialize CoreGraphics, and must run in a GUI (Aqua) session.** A bare Swift CLI calling `SCStream` aborts with `Assertion failed: (did_initialize) … CGS_REQUIRE_INIT` — it never opens the WindowServer connection a GUI app makes at startup. Fix: bring up a headless `NSApplication` (`_ = NSApplication.shared; setActivationPolicy(.prohibited)`) before `SCStream`/`CGEvent` — this is what `screencapture` does internally (verified: `screencapture` works from the same context where bare-CLI `SCStream` failed). Additionally, a process spawned from a **Background launchd session** (SSH/tmux/agent) has `launchctl managername == "Background"`; capture works once CG is initialized and Screen Recording is granted to the controlling app, but a daemon should run from a GUI-session context.

**Routing:**
- **Task 4.3** (capture pipeline): the daemon must initialize CoreGraphics (NSApplication or equivalent) before `SCStream`. The production daemon is a `.app` launched via `open -g`, so it gets an Aqua session — good — but must still do the CG init explicitly.
- **Task 5.1** (spawn-on-demand): the web server spawns the daemon via `open -g` **from its own GUI session**; document that a headless/CI context cannot capture (matches the Constitution Deviation Ledger — capture isn't unit-testable in CI).
- **Task 4.1** (signing/bundle): reuse `chainglass-dev` + `com.chainglass.streamd` (per 1.5a).

---

## Workshop open-question dispositions (T006)

| Workshop | Question | Disposition |
|----------|----------|-------------|
| 004 Q1 (`open -g` TCC attribution, :155-156) | does TCC attribute to the bundle? | **RESOLVED — YES** (1.5b) |
| 002 §Validation (CGWindowID stability / R6, :163) | id stable across daemon restart? | **RESOLVED — YES** (1.5c) |
| 003 Q1 (pointer-lock relative mouse, :196-197) | — | **DEFERRED to v1.1** (out of spike scope; non-goal) |
| 002 grace-config (:171, default 300s) | — | **DEFERRED** (not a spike question) |

## Spike artifacts (committed under `external-research/`)

- `spike/streamd-spike/` — SwiftPM scratch (`capture`/`encode`/`synth`/`inject`/`windowid`/`preflight`/`provoke`); `scripts/setup-cert.sh` + `scripts/make-bundle.sh` (production identity, stable cert).
- `spike/decode-harness/` — static WebCodecs harness + `serve.mjs` collector + decode reports.
- `spike/godot-target/` — Godot scratch game (animated; logs received input).
- `spike/captures/` — fps logs + stills.
- `fixtures/` — the real captured H.264 fixture set (→ Task 2.4).
- Host artifacts (not in repo): `~/Applications/Chainglass Streamer.app` + the `chainglass-dev` keychain cert — **reused by Phase 4**.
