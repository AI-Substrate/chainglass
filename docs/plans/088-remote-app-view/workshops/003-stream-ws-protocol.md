# Workshop: Stream WS Protocol

**Type**: API Contract
**Plan**: 088-remote-app-view
**Spec**: [remote-app-view-spec.md](../remote-app-view-spec.md)
**Created**: 2026-06-13
**Status**: Approved

**Value Thesis**: Plan 064's control-message ambiguity (PL-03) cost real debugging time; this protocol is discriminated from byte zero. It is also the *interface between the two decoupled build tracks* (Swift daemon ↔ web feature) and the exact thing the frame-replay fake must speak — pinning it makes the fake, the TDD suite, and both implementations buildable in parallel without coordination meetings.
**Target Proof Level**: Contract Ready
**Current Proof Level**: Contract Ready

**Selected Value Axes**:
- **Cross-Domain Coordination**: one document both the Swift and TypeScript sides implement against; the fake is a third implementation of the same contract.
- **Proof Quality**: every message has a TypeScript type; the codec suite round-trips them.
- **Safety to Change**: explicit version field + documented evolution rules before v2 (WebRTC) ever lands.

**Related Documents**:
- [002-session-reattach-state-machine.md](./002-session-reattach-state-machine.md) — which transitions each message triggers
- [004-daemon-packaging-discovery.md](./004-daemon-packaging-discovery.md) — endpoint, port, and auth plumbing
- `external-research/streaming-stack.md` — encode/transport decisions this protocol carries

**Domain Context**:
- **Primary Domain**: remote-view — protocol types live in the feature (`features/088-remote-view/protocol/`), mirrored as Swift `Codable` structs in the daemon
- **Related Domains**: `_platform/auth` (token mint, consumed not modified)

---

## Purpose

Specify the WebSocket wire protocol between browser viewport and streamer daemon: framing, every message shape, keyframe semantics, backpressure on both sides, input event encoding, and versioning.

## Fresh Entrant Outcome

A fresh human or agent should be able to use this workshop to reach **Contract Ready** and:

- Implement the daemon side, the browser side, or the frame-replay fake from this document alone.
- Decode a captured binary frame by hand from the header table.
- Answer "what happens when the socket backs up?" for both directions without reading code.

## Key Questions Addressed

- Frame/control/input/stats message shapes
- Keyframe request semantics
- Backpressure signals
- Protocol version field and evolution rules

---

## Transport & Framing Decisions

| Decision | Choice | Rationale / rejected alternative |
|---|---|---|
| Endpoint | `ws(s)://<page-hostname>:<daemonPort>/stream?session=<id>&token=<jwt>` | Mirrors the terminal socket exactly (`use-terminal-socket.ts:96-103`: same hostname, token as query param) — AC-9 demands "same guarantees as the terminal socket", and parity makes the auth review one diff. *Rejected*: token in first message ("hello-auth") — marginally better log hygiene, but breaks parity and the JWT is short-lived anyway. Daemon must not log full URLs. |
| Framing | **Text frames = JSON control** (discriminated union on `t`) · **Binary frames = video only** | One byte of WS opcode already separates the two planes; no JSON parsing on the hot path; no base64 anywhere. *Rejected*: everything-binary with type bytes (control messages become un-greppable in devtools); everything-JSON (base64 video = +33% bitrate). |
| Video payload | H.264 **AVCC** access units; decoder config sent out-of-band in `video-config` | Matches WebCodecs `VideoDecoder` configure-then-chunks model directly. *Rejected*: Annex-B (needs client-side re-parse for WebCodecs). |
| Version | `v: 1` exchanged in `hello`/`hello-ok`; server rejects unknown major with `E_VERSION` | v2 (WebRTC/WHEP) is a *new transport*, not v1.x — this protocol only ever evolves additively (new optional fields, new `t` values clients must ignore-if-unknown). |

## Binary Video Frame (daemon → browser)

Fixed 16-byte header, big-endian, then payload:

| Offset | Size | Field | Notes |
|---|---|---|---|
| 0 | u8 | frame type | `0x01` = video. Other values reserved; receiver MUST drop unknown types silently |
| 1 | u8 | flags | bit0 = keyframe (IDR). bits1–7 reserved (0) |
| 2 | u16 | reserved | 0 |
| 4 | u32 | sequence | monotonic per session-attach; gaps = server-side drops (HUD counts them) |
| 8 | u64 | captureTimestampMicros | daemon monotonic clock at capture; latency math uses clock offset from ping/pong |
| 16 | … | payload | one AVCC access unit |

Maps 1:1 to `new EncodedVideoChunk({ type: flags&1 ? 'key' : 'delta', timestamp: captureTimestampMicros, data: payload })`.

## Control Messages (text frames, JSON)

All messages: `{ "t": "<type>", ... }`. Receivers MUST ignore unknown `t` (forward compat) and unknown fields.

### Browser → daemon

```typescript
type ClientMessage =
  | { t: 'hello'; v: 1; session: string }            // token already validated at WS upgrade
  | { t: 'input'; events: InputEvent[] }              // batched per rAF tick
  | { t: 'request-keyframe' }                         // decoder reset / degraded entry / reclaim
  | { t: 'pause' } | { t: 'resume' }                  // tab visibility; resume implies keyframe
  | { t: 'client-stats'; decodeFps: number; queueDepth: number; e2eLatencyMs: number | null }
  | { t: 'ping'; sentAt: number }                     // client clock, ms
  | { t: 'detach' };                                  // explicit close → session closed (not unwatched)

type InputEvent =
  | { k: 'mousemove'; x: number; y: number }                       // x,y normalized [0,1] of video frame
  | { k: 'mousedown' | 'mouseup'; x: number; y: number; button: 0 | 1 | 2 }
  | { k: 'wheel'; x: number; y: number; dx: number; dy: number }   // pixel deltas
  | { k: 'keydown' | 'keyup'; code: string; modifiers: Mods }      // DOM KeyboardEvent.code ("KeyW")
  | { k: 'text'; text: string };                                   // committed IME/unicode input

type Mods = { shift: boolean; ctrl: boolean; alt: boolean; meta: boolean };
```

Input decisions:

- **Normalized coordinates** `[0,1]` relative to the video frame — client never knows window points; the daemon owns Retina scale + `kCGWindowBounds` + chrome-offset mapping (it tracks bounds ~30Hz, per external research). Letterboxing math stays client-side (canvas → frame rect), point math stays daemon-side. Clean split.
- **DOM `code`, not `key`**: physical-position semantics survive layouts; daemon maps `code → macOS virtual keycode` via a static table (~110 entries, generated once). `text` covers what keycodes can't (IME, dead keys) via `CGEventKeyboardSetUnicodeString`.
- **Batched per animation frame**: one `input` message per rAF with all events since the last — bounds message rate to display rate; mousemoves within a tick may be coalesced to the last position (plus all down/up events preserved in order).

### Daemon → browser

```typescript
type ServerMessage =
  | { t: 'hello-ok'; v: 1; session: string;
      window: { id: number; app: string; title: string;
                pixelWidth: number; pixelHeight: number; scale: number } }
  | { t: 'video-config'; codec: string;               // e.g. "avc1.640028"
      description: string;                            // base64 avcC box — VideoDecoder config
      width: number; height: number; fps: number }    // re-sent on window resize (followed by keyframe)
  | { t: 'window-state'; state: 'minimized' | 'restored' | 'resized' | 'moved' | 'gone';
      pixelWidth?: number; pixelHeight?: number }
  | { t: 'displaced' }                                 // viewer slot taken; server closes after sending
  | { t: 'stats'; captureFps: number; encodeFps: number; bitrateKbps: number;
      droppedFrames: number; bufferedAmount: number }  // 1Hz
  | { t: 'pong'; sentAt: number; daemonAt: number }    // clock-offset estimation for the HUD
  | { t: 'error'; code: ErrorCode; message: string; fatal: boolean }
  | { t: 'bye'; reason: 'detached' | 'window-gone' | 'shutdown' };
```

### Error codes

| Code | Meaning | Client lands in (Workshop 002) |
|---|---|---|
| `E_AUTH` | bad/expired token at upgrade or hello | `error` |
| `E_ORIGIN` | Origin not in allowlist | `error` |
| `E_VERSION` | unsupported protocol major | `error` |
| `E_SESSION_UNKNOWN` | session id not in table (expired/GC'd/daemon restarted) | `sessionLost` |
| `E_WINDOW_GONE` | window disappeared during attach | `windowGone` |
| `E_PERMISSION` | TCC grant missing; `message` names which (Screen Recording vs Accessibility) | `error` (AC-14 UX) |
| `E_INTERNAL` | daemon-side failure | `error` |

## Handshake Sequences

```
Attach / reattach (R1):                      Displacement (R2):
  client → WS upgrade (?session&token)         tab B → upgrade + hello
  daemon: verify JWT + Origin allowlist        daemon → A: {t:'displaced'} ; close(4002)
  client → {t:'hello', v:1, session}           daemon → B: hello-ok, video-config, keyframe…
  daemon → {t:'hello-ok', window:{…}}
  daemon → {t:'video-config', …}             Resize:
  daemon → binary keyframe                     daemon → {t:'window-state', state:'resized', …}
  daemon → binary deltas…                      daemon → {t:'video-config', …}   // new dims
                                               daemon → binary keyframe
```

**Keyframe rule**: the daemon sends an IDR as the first frame after — attach, reattach, reclaim, `resume`, `request-keyframe`, resize, and backpressure-drop recovery. The client never has to decode from a delta cold.

## Backpressure

| Side | Signal | Policy |
|---|---|---|
| Daemon (send) | `ws.bufferedAmount` checked before each frame send | `> 512 KB`: drop delta frames (count them; surfaced in `stats.droppedFrames`); on drain below threshold, send keyframe and resume. `> 4 MB` sustained 5s: `error {code:E_INTERNAL, fatal:false}` + bitrate step-down is **v1.1** (note only — v1 just keeps dropping, honest about it in the HUD) |
| Browser (decode) | `VideoDecoder.decodeQueueSize` | `> 10` chunks: drop deltas until next keyframe (decoder stays coherent — only whole GOP-tails are skipped); on decoder `error` event: `decoder.reset()` + `request-keyframe` |
| Browser (input) | rAF batching (above) | inherently rate-bound; no further policy |

Frames are *dropped, never queued* on both sides — single-viewer dev iteration wants freshness over completeness (drop-on-backpressure decision from external research).

## Frame-Replay Fake (the contract's third implementation)

The fake (first-class deliverable, AC-12) is a Node `ws` server speaking exactly this protocol:

- Fixture: a recorded session — `video-config` JSON + a directory of numbered AVCC access units with their headers (captured once from the real daemon during the spike; until then, generated H.264 from ffmpeg with synthetic content).
- Replays at recorded timestamps; honours `request-keyframe` (seeks to next keyframe in fixture); scriptable to emit `displaced` / `window-state` / `error` on cue — that's how the R1–R9 races and AC-10/AC-7 UI states get browser-smoke coverage without macOS.
- Records received `input` messages to an inspectable log — browser smoke asserts serialization correctness (AC-3's "events serialize correctly" half; coordinate *fidelity* stays a live-spike concern).

## Type Ownership

- TypeScript: `features/088-remote-view/protocol/messages.ts` (Zod schemas + inferred types — Zod parse at the boundary, matching repo convention). The fake and the viewport both import these.
- Swift: `Sources/streamd/Protocol.swift` `Codable` structs, hand-mirrored. Drift guard: a fixture file of canonical JSON messages checked by tests **on both sides** (same fixtures, two runners).

## Attention Reduction

| Future Loop | Before Workshop | After Workshop |
|-------------|-----------------|----------------|
| Implementation | Two teams negotiate framing ad hoc (Plan 064 redux) | Both sides + fake implement one written contract |
| Testing | "Test the protocol" (unbounded) | Codec round-trip per message + fixture-driven cross-language check |
| Review | Reconstruct backpressure intent from code | Thresholds and drop policies are named constants traceable here |
| Agent execution | — | Error codes are stable strings agents/CLI can switch on |

## Validation / Acceptance

This workshop reaches Validated when:

- Zod schemas + Swift Codable round-trip the shared fixture set.
- The frame-replay fake drives the viewport to `live` in browser smoke (AC-12).
- Spike confirms `avc1.*` config strings decode on Chromium (gating) and records Safari behavior (best-effort, AC scope per clarifications).

## Open Questions

### Q1: Mouse capture for pointer-lock games (relative movement)?
**DEFERRED to v1.1** (confirmed out of Phase 1 spike scope, [spike-findings.md](../external-research/spike-findings.md)): v1 sends absolute normalized positions only; Godot camera-look via pointer-lock needs relative deltas (`movementX/Y` + a `pointerlock` mode flag). Additive message evolution covers it; not in v1 ACs. (Spike 1.3 confirmed absolute mouse + keyboard injection land; relative-delta capture is the v1.1 addition.)

### Q2: Should `stats` ride GlobalState instead of the WS?
**RESOLVED**: WS for the live HUD (1Hz, viewer-only), GlobalState gets a 5s-throttled copy for agents (`remote-view:<session>:quality`). Both, different cadences, one source.
