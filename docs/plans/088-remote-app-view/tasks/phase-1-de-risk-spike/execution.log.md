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

## T001 / T003 / T005 — ✅ COMPLETE (2026-06-15, after grants landed)

Grants were given to **Ghostty** (the controlling terminal — that's what TCC attributes CLI runs to, not "tmux") for Screen Recording + Accessibility, plus the **`chainglass-dev` cert** + **`Chainglass Streamer.app`** (`com.chainglass.streamd`) grant for the T005 stable-identity test.

**The unlock (cross-cutting):** SCStream needs CoreGraphics initialized. A bare CLI aborts `CGS_REQUIRE_INIT` even via `open`/`launchctl asuser`; `screencapture` works because it inits CG. Fix = headless `NSApplication` before SCStream/CGEvent. Diagnosis path: `launchctl managername` = `Background`; `screencapture` succeeded from the same context → isolated it to CG-init, not session/permission.

- **T001 ✅** Godot (occluded) **45.0 fps avg / 60s** (≥30 AC-2 floor); Simulator deliver-on-change (drops when static). Stills + fps logs in `spike/captures/`.
- **T002 ✅** real captured fixture (254 frames, `avc1.640020`, 800×656, `source: sck-capture`) → `external-research/fixtures/`.
- **T003 ✅** mouse click/drag + keyboard text both land in Godot (keyboard needs focus — click-first).
- **T004 ✅** real fixture decoded **254/254** on Chromium (`decode-report-real-capture.json`).
- **T005 ✅** (a) stable-cert grant persisted across rebuild+resign; ad-hoc re-prompted (Finding 02 live). (b) bundle TCC attribution by id+cert. (c) CGWindowID `34202` stable across ~30min + dozens of restarts.

## T006 — ✅ findings written; workshops updated

`spike-findings.md` = **GO** on all 7 questions (no hard "no" → Phase 2+ may proceed). Workshop dispositions: W004 Q1 RESOLVED-YES, W002 R6 CONFIRMED, W003 Q1 + W002 grace DEFERRED.

**Phase 1 complete — GO.** Outstanding for later phases (carried forward, not blockers): CG-init in the daemon (Task 4.3), reuse `chainglass-dev`+`com.chainglass.streamd` (Task 4.1), keyboard-focus handling (Task 4.5), Safari decode re-test (backlog).

## Companion reconciliation (honest)

`--companion` ran `code-review-companion` (run `2026-06-13T11-15-18-099Z-03a5`). It was booted + briefed at phase start, but the phase took an unusually long wall-clock time (multi-day, human-blocked on TCC grants at the remote Mac). The companion **idle-timed-out and shut down before the review-request pings arrived** — farewell summary: *"…found no incoming review requests before the idle shutdown."* So **0 findings = it did not review the commits** (not a clean-review verdict). The spike code is throwaway evidence (not production), so the missed live review is low-impact, but stated plainly rather than implied as a pass.
- Findings to reconcile: none (no review performed).
- magicWand (surfaced, not actioned — minih infra, unrelated to this plan): *"Expose a minih project-root helper / guarantee MINIH_PROJECT_ROOT in shell tool sessions; include expected schema/status in state_transition validation errors."*
- Follow-up option: a fresh post-hoc review pass over the spike code is available if desired (stage 7 review), though throwaway spike scratch is a low-value review target.

---
