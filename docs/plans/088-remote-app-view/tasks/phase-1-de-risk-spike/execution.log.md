# Phase 1: De-Risk Spike — Execution Log

**Plan**: [remote-app-view-plan.md](../../remote-app-view-plan.md) · **Phase**: 1 of 6
**Mode**: companion (`--companion`, slug `code-review-companion`)
**Started**: 2026-06-13
**Verification mode**: manual/spike (per plan Deviation Ledger — evidence is observed-behavior records + replayable fixtures, no unit tests this phase)

---

## T000 — Harness pre-flight seam

- **Fired**: `/eng-harness-flow --event pre-implement --phase "Phase 1: De-Risk Spike" --plan-dir docs/plans/088-remote-app-view --prompt-optional=false --json`
- **Envelope**: `decision: redirect` → adoption track (signal A miss: repo has no `.harness/`, no harness CLI). Offer suppressed per `--prompt-optional=false` → calm noop, consistent with the post-spec seam outcome recorded in `.the-flow-state.json`.
- **Boot verdict**: `UNAVAILABLE` — not an error; phase proceeds with standard testing (here: the plan's manual/spike verification mode).

### Environment pre-flight (host Mac)

| Prerequisite | Status |
|---|---|
| Swift toolchain | ✅ Swift 6.2.4 (swiftlang-6.2.4.1.4), arm64-apple-macosx26.0 |
| Xcode | ✅ Xcode 26.3 (17C529) |
| macOS | ✅ 26.5 (SCK `desktopIndependentWindow` needs 14+) |
| Godot | ✅ `/Applications/Godot.app` (4.5.1) — scratch project launched (pid running) |
| iOS Simulator | ✅ iPhone 17 Pro booted (`B54553DB-…`) |
| Chromium-family browser | ✅ Google Chrome + Microsoft Edge |
| Safari | ✅ present (26.5) — record-only |
| minih (companion) | ✅ 0.2.0 — run `2026-06-13T11-15-18-099Z-03a5` active, briefed |

---

## 🖐 Human-required moments — STATUS: BLOCKED (awaiting grants at host Mac)

The Screen Recording + Accessibility TCC prompts were triggered (`preflight --request`) and polled for ~45 min across four rounds; **neither grant has landed yet**. The requesting process resolves through **tmux** (`/opt/homebrew/bin/tmux`; ancestry `zsh ← claude ← zsh ← tmux`), so the System Settings entry to enable is *tmux*.

| Grant | For | State |
|---|---|---|
| Screen Recording → tmux | T001 capture, T005 window-id, T005 bundle | ❌ not granted |
| Accessibility → tmux | T003 input injection | ❌ not granted |
| Keychain admin auth | T005 cert create+trust | ⏳ not yet attempted (gated behind the above) |

**Decision**: rather than block the whole phase, the grant-free half of the spike was executed and proven (T002 encode, T004 decode — below). The grant-dependent half (T001/T003/T005) is staged and runs the instant the grants land. ⚠️ When granting in System Settings, if macOS offers **"Quit & Reopen"** for tmux, choose **Later** — quitting tmux kills the remote session; fresh spike processes pick up the grant without a relaunch.

---

## T004 — Browser WebCodecs decode harness ✅ COMPLETE (Chromium gating PASS)

- **Built**: `spike/decode-harness/index.html` (fetch manifest+frames → `VideoDecoder` → canvas, logs timings, POSTs results) + `serve.mjs` (static server + `/report` collector).
- **Run**: headless Chrome 149 against the synthetic fixture (paced 30fps).
- **Result**: `isConfigSupported: true`; **120/120 frames decoded, 0 drops, 0 errors**; first-frame 21.2ms; avg output interval 33.18ms. Report: `spike/decode-harness/decode-report-chromium.json`.
- **Artifact for Task 3.4**: verified decoder config `{ codec: "avc1.64001e", description: <avcC bytes>, optimizeForLatency: true }`. `description` (avcC) is mandatory for `avc1.*`.
- **Safari**: record-only, non-gating. `open -a Safari` + AppleScript both failed to load the harness (0 requests reached server; AppleEvent timeout). Deferred to backlog per spec's Chromium-gating clarification.

## T002 — VideoToolbox encode → fixture set 🟡 ENCODER PROVEN (captured fixture pending T001)

- **Built**: `encode` subcommand (SCK `CMSampleBuffer`s → VT low-latency H.264 → AVCC AUs + `avcC` + `manifest.json`).
- **Insight / decision**: VT encode needs **no** Screen Recording grant — only SCK capture does. Added a `synth` subcommand that drives the *same* `FixtureEncoder` from generated `CVPixelBuffer`s, so the encode + fixture contract + decode round-trip are validated independently of the grant-blocked capture.
- **Result**: `synth` produced `external-research/fixtures/` — 120 frames @30fps, 2 keyframes, 42 KiB, `codec=avc1.64001e`, 38-byte avcC. Decoded clean by T004 (round-trip = the manifest's acceptance test, per dossier).
- **Manifest** gained an additive `source` field (`synthetic-vt` | `sck-capture`) for honest provenance; shapes are identical so Task 2.4/3.4 consume either. The committed seed is `synthetic-vt`; a real captured-Godot set overwrites it when T001 unblocks.

## T001 / T003 / T005 — 🔴 BLOCKED on host-Mac grants

All code written + built; cannot execute without the TCC grants above. Resume steps are in [spike-findings.md](../../external-research/spike-findings.md) §§ 1.1, 1.3, 1.5.

---
