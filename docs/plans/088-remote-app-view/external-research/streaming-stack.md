# External research — macOS single-window streaming stack

**Captured**: 2026-06-12 · **Tool**: Perplexity (deep research, high effort) + landscape scan · **Raw output**: `perplexity-deep-research-raw.txt`
**Status**: COMPLETE — conducted pre-flow during the design conversation; distilled and corrected below.

## Question

Best 2025/2026 architecture for capturing a SINGLE macOS application window (Godot game, iOS Simulator) and streaming it to a web browser with interactive mouse/keyboard forwarding: <100ms glass-to-glass on LAN/tailnet, 60fps, single viewer, daemon co-located with the web server, possibly tunneled through one HTTPS origin.

## Conclusions (corrected against ScreenCaptureKit docs where the report erred)

| Stage | Recommendation | Key facts |
|---|---|---|
| Capture | **ScreenCaptureKit**, `SCContentFilter(desktopIndependentWindow:)` | Purpose-built per-window capture at up to 60fps; captures correctly while occluded/backgrounded (that is the mode's documented purpose — the raw report's claim that occluders composite in is WRONG for this mode). **Minimized windows stop delivering frames** — detect + auto-restore or show a "minimized" state. One-time Screen Recording TCC grant; TCC sticks to a signed .app bundle ID, so the daemon should ship as an app bundle, not a bare binary. |
| Encode | **VideoToolbox hardware H.264**, low-latency rate control | 3–8ms/frame on Apple Silicon, dedicated media engine (doesn't contend with Godot's GPU use). H.264 over HEVC: faster encode + universal browser decode. Low-latency P-frames + keyframe-on-(re)connect — NOT all-intra (the raw report's "intra-period 1" claim is overkill; real game streamers use long GOP). 8–20 Mbps for 1080p60 game/UI content. |
| Transport v1 | **WebCodecs over WebSocket** | Encoded H.264 frames over an authed WS riding the existing single HTTPS origin; browser `VideoDecoder` → canvas. No ICE/TURN/new ports; single viewer → drop frames on `bufferedAmount` backpressure instead of a jitter buffer. ~40–70ms glass-to-glass typical on LAN/tailnet. Chrome/Edge: H.264 WebCodecs solid; Safari supports H.264 decode (verify exact config string during spike). |
| Transport v2 (only if needed) | WebRTC via WHIP/WHEP (MediaMTX) | Worth it only on lossy links where TCP head-of-line blocking hurts. Defer. |
| Input | **CGEvent injection** + continuous window-frame tracking | Browser sends normalized coords/keys over the same WS; daemon maps via `kCGWindowBounds` (track ~30Hz; handle Retina points-vs-pixels and title-bar chrome offset). **Focus-follows-stream**: bring target window frontmost when the remote view has focus, then inject normal events — `CGEventPostToPid` to backgrounded apps is unreliable, and nobody is sitting at the dev box so focus-stealing is free. iOS Simulator: frontmost + synthetic mouse events translate to touches normally (idb/simctl as fallback). Godot windowed mode receives CGEvents fine; fullscreen-exclusive is a documented-not-solved edge case. Requires one-time Accessibility TCC grant. |
| Daemon language | **Swift** (signed .app bundle) | ScreenCaptureKit/VideoToolbox are native; Rust `screencapturekit` crate is early-maturity. Daemon stays small: capture + encode + WS server + input injection + tiny control API. |

## Latency budget (1080p60, LAN/tailnet)

capture 8–16ms + encode 3–8ms + WS 5–20ms + decode 2–5ms + render ≤16ms ≈ **35–65ms** typical.

## OSS landscape (why build, not adopt)

- **Sunshine/Moonlight**: display-level capture on macOS, no per-window; no production web client.
- **neko / Selkies-GStreamer**: Linux desktop-level; capture layer not portable to macOS per-window semantics.
- **screego / webwormhole**: browser-side `getDisplayMedia` capture — cannot do server-side per-window.
- **Verdict**: no maintained OSS does "one macOS window → browser with input". Compose it: SCK + VTB + WS/WebCodecs.

## Remaining unknowns → de-risk spike (recommended before/within Phase 1)

1. SCK capture of a live Godot window + iOS Simulator at 60fps (Metal content; minimize/space-switch behavior).
2. CGEvent injection fidelity into both (click/drag/scroll/keys; Simulator touch translation).
3. Safari/Chrome `VideoDecoder` H.264 config verification (`avc1.*` codec string, `optimizeForLatency`).

A half-day Swift spike covers 1–2; a one-hour browser harness covers 3.
