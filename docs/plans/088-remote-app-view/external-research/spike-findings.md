# Phase 1 De-Risk Spike — Findings

**Plan**: [remote-app-view-plan.md](../remote-app-view-plan.md) · **Phase 1 of 6** · **Status**: 🟡 IN PROGRESS
**Updated**: 2026-06-13

> **This is the go/no-go artifact** (plan § Phase 1). Each question below gets a verdict + evidence + the downstream task that consumes it. **Hard-stop gate**: any **NO** verdict is surfaced to the user before any Phase 2+ work proceeds — the user makes the re-scope call.

## Verdict summary

| # | Question | Verdict | Consumer |
|---|----------|---------|----------|
| 1.1 | SCK per-window capture fidelity (Godot + Simulator, 60fps, occlusion/minimize) | ⏳ **PENDING** — code ready, blocked on Screen Recording grant at host Mac | Phase 4 (4.3 capture) |
| 1.2 | VideoToolbox H.264 encode → replayable AVCC fixture set | ✅ **YES** (encoder proven via synthetic frames; captured-Godot fixture pending 1.1) | Task 2.4 fake |
| 1.3 | CGEvent input injection fidelity (click/drag/scroll/type × Godot/Simulator) | ⏳ **PENDING** — code ready, blocked on Accessibility grant | Tasks 4.5 |
| 1.4 | Browser WebCodecs decode config (Chromium gating; Safari record-only) | ✅ **YES** on Chromium · Safari ⏳ deferred to backlog | Task 3.4 viewport |
| 1.5a | Stable-cert TCC persistence across rebuild | ⏳ **PENDING** — scripts ready, blocked on grants + keychain | Task 4.1 signing |
| 1.5b | `open -g … --args` TCC attribution to bundle | ⏳ **PENDING** — blocked on grants | Task 5.1 spawn fallback |
| 1.5c | CGWindowID stability across daemon restart | ⏳ **PENDING** — code ready, blocked on Screen Recording grant | Tasks 2.5 (R6) + 5.1 |

**The five grant-dependent verdicts (1.1, 1.3, 1.5a/b/c) require a person at the host Mac** to answer macOS TCC dialogs + Keychain prompts — they cannot be scripted (by design). All spike code is written, built, and staged; these run the moment the grants land. See [execution.log.md](../tasks/phase-1-de-risk-spike/execution.log.md) § Human-required moments.

---

## 1.2 — VideoToolbox encode → replayable fixture set ✅ YES

**Question**: Can captured frames be encoded to a low-latency H.264 fixture set that a browser replays? Is the manifest format a sound cross-phase contract?

**Evidence** (grant-free — VideoToolbox encode needs no Screen Recording):
- `streamd-spike encode` pipes `CMSampleBuffer`s through a VideoToolbox low-latency H.264 session (P-frames, `AllowFrameReordering=false`, `MaxKeyFrameInterval=60`, keyframe forced on frame 0).
- Because capture is grant-blocked, the **same `FixtureEncoder`** was driven by `streamd-spike synth` (animated `CVPixelBuffer`s — no capture) to prove the encode + fixture-write path independently. Output:
  - **120 frames @30fps, 2 keyframes** (frame 0 + the 60-interval), 42 KiB total
  - `codec = avc1.64001e` (H.264 High Profile, Level 3.0)
  - `description` = 38-byte `avcC` (base64 in manifest)
- Manifest validated by **round-trip decode** (the dossier's specified acceptance test — see 1.4): the browser decoded all 120 frames with zero errors.

**Manifest contract** (the cross-phase artifact → Task 2.4):
```json
{ "codec": "avc1.<hex>", "description": "<base64 avcC>",
  "width": N, "height": N, "fps": N, "source": "sck-capture|synthetic-vt",
  "frames": [ { "file": "frames/frame-NNNN.bin", "keyframe": bool, "ptsMicros": N } ] }
```
Each `frame-NNNN.bin` is **one AVCC access unit** (length-prefixed NALs, exactly as VideoToolbox emits) — replayable with no Node/Swift dependency (Finding 06). The `source` field is additive provenance: the committed fixture is `synthetic-vt` until 1.1 unblocks a real `sck-capture` set; both are byte-shape-identical, so Task 2.4 / Task 3.4 consume either transparently.

**Note for Task 2.4**: the committed `external-research/fixtures/` set is the *synthetic* seed (proves the pipeline + decode). When 1.1's Screen Recording grant lands, re-running `streamd-spike encode --app Godot` overwrites it with a real captured-Godot fixture (`source: sck-capture`). Either satisfies Phase 2–3 success criteria; the captured one upgrades realism (plan Task 2.4 note).

---

## 1.4 — Browser WebCodecs decode ✅ YES (Chromium) · Safari deferred

**Question**: Does a WebCodecs `VideoDecoder` config string decode the fixture on Chromium? Record Safari for backlog.

**Evidence — Chromium (gating, PASS)**: headless Chrome 149 against `decode-harness/index.html`, fed the synthetic fixture paced at 30fps:

| Metric | Result |
|--------|--------|
| `VideoDecoder.isConfigSupported` | **true** |
| frames submitted → decoded | **120 → 120** (zero drops) |
| decode errors | **0** |
| first-frame latency | **21.2 ms** |
| avg output interval | **33.18 ms** (matches 30fps = 33.3ms) |

Report: [`spike/decode-harness/decode-report-chromium.json`](spike/decode-harness/decode-report-chromium.json)

**The verified decoder config string** (the artifact → Task 3.4 viewport):
```js
const config = {
  codec: manifest.codec,            // "avc1.64001e"
  codedWidth: manifest.width,
  codedHeight: manifest.height,
  description: bytesFrom(manifest.description), // avcC, base64-decoded to Uint8Array
  optimizeForLatency: true,
};
```
`description` MUST be the `avcC` box (not Annex-B / not absent) for `avc1.*` — confirmed: omitting it fails `isConfigSupported`. `EncodedVideoChunk` type is `'key'` for keyframe frames else `'delta'`, `timestamp` = `ptsMicros`.

**Safari (record-only, non-gating per spec's Chromium-gating clarification)**: ⏳ not exercised in this run — `open -a Safari` / AppleScript navigation did not load the harness (zero requests reached the server; AppleEvent timed out). Safari 26.5 WebCodecs H.264 decode is **deferred to backlog**; re-test interactively on the host Mac when convenient (open the harness URL by hand). Does not gate the spike.

---

## 1.1 — SCK per-window capture fidelity ⏳ PENDING (grant-blocked)

**Status**: `streamd-spike capture` is written + built (per-window `SCContentFilter(desktopIndependentWindow:)`, 60fps `minimumFrameInterval`, per-second fps log, periodic stills). The Godot scratch target (`spike/godot-target/`) and a booted iPhone 17 Pro Simulator are staged. **Blocked**: the first `SCStream` start triggers the Screen Recording TCC prompt, which must be granted by a person at the host Mac. Once granted: run `capture --app Godot --duration 60` and `capture --title Simulator --duration 60`, record the fps logs + minimize/occlusion behavior here.

## 1.3 — CGEvent input injection ⏳ PENDING (grant-blocked)

**Status**: `streamd-spike inject` is written + built (focus-follows-stream activate; click/drag/scroll via `CGEventPost`; type via both unicode-string injection and hardware keycodes for raw-input games; `kCGWindowBounds` coordinate mapping). The Godot target shows injected input on-screen + stdout for verification. **Blocked**: `CGEventPost` silently no-ops without the Accessibility grant (the tool prompts for it). Once granted: run the matrix across {Godot windowed, Godot fullscreen, Simulator}.

## 1.5 — TCC + lifecycle assertions ⏳ PENDING (grant-blocked)

**Status**: `scripts/setup-cert.sh` (stable self-signed "chainglass-dev" cert) and `scripts/make-bundle.sh` (minimal signed `.app` shell around the capture scratch — a **throwaway codesign/TCC test shell**, not a Phase 4 daemon prototype) are written. `streamd-spike windowid` checks CGWindowID validity across process restart. **Blocked**: (a) needs the admin/keychain auth to create+trust the cert; (b)/(c) need Screen Recording grant on the bundle + deliberate re-grant rounds across rebuild — that grant/verify cycle *is* the test. Once unblocked: run setup-cert → make-bundle → grant → rebuild+resign → re-check (assertion a); `open -g` then inspect TCC attribution (assertion b); capture a windowID, kill+relaunch, `windowid --check` (assertion c).

---

## Workshop open-question dispositions

_Resolved in T006 once the grant-dependent verdicts land. Tracked here:_

- **Workshop 004 Q1** (`open -g` TCC attribution, :155-156) → resolved by **1.5b** (pending)
- **Workshop 002 §Validation :163** (CGWindowID stability / R6) → resolved by **1.5c** (pending)
- **Workshop 003 Q1** (pointer-lock relative mouse, :196-197) → **DEFERRED to v1.1** (out of spike scope; non-goal)
- **Workshop 002 grace-config** (:171) → **DEFERRED** (default 300s; not a spike question)
