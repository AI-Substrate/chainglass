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

---

## Companion findings reconciliation

_Populated as the companion replies (ackOf → review-request)._

| Finding | Severity | Task | Disposition |
|---------|----------|------|-------------|
| _(none yet)_ | | | |
