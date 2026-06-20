# Code Review: Phase 4 — Native Daemon (Swift)

**Plan**: /Users/jordanknight/substrate/084-random-enhancements-3/docs/plans/088-remote-app-view/remote-app-view-plan.md
**Spec**: /Users/jordanknight/substrate/084-random-enhancements-3/docs/plans/088-remote-app-view/remote-app-view-plan.md § Business Specification
**Phase**: Phase 4: Native Daemon (Swift)
**Date**: 2026-06-20
**Reviewer**: Automated (the review verb) — re-review #2 (3rd pass)
**Testing Approach**: Hybrid (Full-TDD core + headless wire/lifecycle smoke + host-Mac live smoke)

> **Supersedes** the round-1 review (REQUEST_CHANGES — 5 HIGH) and round-2 review (REQUEST_CHANGES — 1 HIGH + 9 MEDIUM + 2 LOW). Both prior verdicts and their fix-tasks are preserved in git history and in the flight-plan nodes `rv4`/`rv4b`; fix batches landed as commits `6a2c41b3` (round 1) and `1f033d23` (round 2). This pass re-runs the 5 reviewers over the full Phase-4 diff (`b8e65d12..HEAD`) to confirm closure and hunt for regressions.

## A) Verdict

**APPROVE**

Zero HIGH/CRITICAL findings. All 5 round-1 HIGH and all round-2 (1 HIGH + 9 MEDIUM) findings are independently verified closed in the current source at the exact lines, with no regressions. Six LOW items remain — all either spec-conformance nits on a loopback-only, JWT-gated surface, by-design backpressure behaviour, or work explicitly deferred to the Phase-6 live sweep. None block.

**Key failure areas**: none. (Implementation ✅ · Domain compliance ✅ · Reinvention ✅ · Testing ✅ · Doctrine/Security ✅)

## B) Summary

The `streamd` native Swift daemon is in good shape: a hand-rolled RFC 6455 WebSocket + HKDF-SHA256/HS256 JWT verifier + ScreenCaptureKit→VideoToolbox H.264 pipeline + CGEvent input injector + session FSM + discovery registry, all behind a loopback-only, JWT-gated HTTP/WS control API. The independent re-review confirms `swift test` **75/75** and `just streamd-smoke` **40/40** (34 wire + 6 lifecycle) pass on this host, and that every prior finding is closed: loopback bind (`WSServer.swift:66`), REST JWT gate on every path bar `/health` (`WSServer.swift:198-203`), viewer-gated WS controls (`WSServer.swift:329-354`), Content-Length + frame/fragment caps before any `Int` conversion (`WSServer.swift:154-164`, `WebSocket.swift:107-126`), single-window `/windows` (`WSServer.swift:215-229`), and the round-2 `streamd-kill` PID-validation + `streamd`-identity gate (`justfile:149-158`), resume-on-attach, wheel clamp, truthful avcC codec string, env-port fail-fast, live-window-id guard, and `400 E_BAD_BODY`. Domain docs (domain.md History, registry, domain-map, the new C4 component diagram) are current; the protocol/codec/auth Swift files are a deliberate, shared-fixture-validated mirror of the web contract, not duplication; and no commit carries AI attribution. Security invariants (close codes, `aud`, no-`cwd`, exp enforcement, cert `chainglass-dev` / bundle `com.chainglass.streamd`, HKDF derivation) all hold verbatim.

## C) Checklist

**Testing Approach: Hybrid**

- [x] Core validation tests present — `swift test` 75/75 (Auth vectors, Protocol/BinaryFrame fixtures, SessionTable R1–R9, KeycodeMap, Registry, WebSocket bounds, Config, Bounds&Codec)
- [x] Critical paths covered — auth gate, handshake, displacement, backpressure, lifecycle all headless-verified via the FixtureFrameSource seam
- [x] Key verification points documented — execution.log.md records counts + host-Mac live smoke (T009)
- [x] Only in-scope files changed (native/streamd/ + justfile + docs)
- [x] Type/build checks clean — `swift build` clean; `swift test` green
- [x] Domain compliance checks pass (docs current; Swift is outside the TS domain graph)

## D) Findings Table

| ID | Severity | File:Lines | Category | Summary | Recommendation |
|----|----------|------------|----------|---------|----------------|
| F001 | LOW | native/streamd/Sources/streamd/WebSocket.swift:107-138 | correctness/spec | Client→server parser doesn't reject an unmasked client frame (RFC 6455 §5.1) or set RSV bits (§5.2). Browsers always mask + never set RSV; loopback-only + JWT-gated, so not exploitable. | Optional: close 1002 on unmasked/RSV-set client frames. |
| F002 | LOW | native/streamd/Sources/streamd/Endpoints.swift:69-75 | performance | `firstRange(of:)` re-scans the whole `inBuffer` per TCP chunk while the request head is incomplete (O(n·m), bounded by the 64 KiB head cap). | Optional: track a scan offset / use `Data.range(of:)`. |
| F003 | LOW | native/streamd/Sources/streamd/WSServer.swift:460-465,525-535 | correctness | On a backpressure drop, `needsKeyframeOnDrain` is set but `client.needsKeyframe` is not, so intervening delta frames are forwarded (undecodable) until the forced keyframe arrives. | Optional: set `client.needsKeyframe = true` on the drop, mirroring the late-join gate. |
| F004 | LOW | native/streamd/Sources/streamd/WSServer.swift:574 | scope | `ClientConnection.pendingSession` (set from the `?session=` upgrade query) is never read — session is taken from the `hello` message. Dead state. | Optional: remove, or wire as the `hello` default. |
| F005 | LOW | reviews/review.phase-4-native-daemon-swift.md | evidence | The on-disk review verdict read REQUEST_CHANGES (round 2) after fix batch 2 closed it — risk of being mistaken for an open HIGH. | Resolved by this re-stamp (APPROVE). |
| F006 | LOW | native/streamd/Sources/streamd/main.swift:58 | testing | F008 (live mode requires nonzero `CG_REMOTE_VIEW__WINDOW_ID`) is a startup `fail()` guard, compile-verified only (no unit test). Honestly labelled; guards the Phase-6 live path. | Optional: tiny env-parse unit test, or accept with the other live-path deferrals. |

## E) Detailed Findings

### E.1) Implementation Quality
Zero HIGH/CRITICAL. All round-1 + round-2 fixes confirmed at exact lines (see §B). The HKDF/HS256 verify uses constant-time HMAC, requires + enforces `exp`, asserts `aud`, carries no `cwd` claim; framing, session FSM, registry writes, and CGEvent bounds are free of force-unwraps, integer overflow, or unchecked indices reachable over the loopback API. Remaining: F001–F004 (all LOW).

### E.2) Domain Compliance

| Check | Status | Details |
|-------|--------|---------|
| File placement | N/A | `native/streamd/` is outside the pnpm/TS domain graph |
| Contract-only imports | N/A | Swift package, no cross-domain imports |
| Dependency direction | N/A | — |
| Domain.md updated | ✅ | History row 2026-06-20 records `swift test` 75 + `streamd-smoke` 40; Source-Location line matches |
| Registry current | ✅ | Remote View row + health-summary list streamd + loopback JWT-gated API + discovery registry |
| No orphan files | ✅ | All changed files map to the daemon / docs |
| Map nodes current | ✅ | `remoteView` node carries streamd daemon, control-API, `/windows[single]`, discovery registry |
| Map edges current | ✅ | auth edge notes Swift Origin-allowlist mirror + HKDF+HS256 verify |
| No circular business deps | ✅ | — |
| Concepts documented | ✅ | Streamer Daemon, Daemon Control API, Discovery Registry concepts; FT-011 registry shape + `<webPort>` filename vs daemon `port` (=`webPort+1501`) clarified |

C4: `docs/c4/components/remote-view.md` present, linked from `docs/c4/README.md`, diagram carries all 7 daemon components + the web side. `/windows` single-window contract consistent across plan.md (4.4/5.2), spec AC-1, and the domain Concepts/registry rows.

### E.3) Anti-Reinvention

| New Component | Existing Match? | Location | Status |
|--------------|----------------|----------|--------|
| Protocol.swift (control messages) | Intentional mirror | web `protocol/messages.ts` + shared `fixtures/messages.json` | proceed |
| BinaryFrame.swift (16-byte codec) | Intentional mirror | web `protocol/binary.ts` + shared `fixtures/frame-header.json` | proceed |
| Auth.swift (HKDF + HS256 + Origin) | Intentional mirror | web `remote-view-auth.ts` / `terminal-auth.ts` (oracle: `remote-view-auth-vectors.json`) | proceed |
| Capture/Encoder/Input/WebSocket/SessionTable/Registry | None / distinct concern | no pre-existing native impl; registry shares atomic-write *idiom* only (distinct file/key) | proceed |

Zero genuine duplication — the protocol/codec/auth files are the documented cross-language mirror validated against shared fixtures.

### E.4) Testing & Evidence

**Coverage confidence**: 90%

| AC | Confidence | Evidence |
|----|------------|----------|
| AC-9 token/origin reject (daemon half) | 98% | AuthVectorsTests 9/9 byte-identical to TS vectors; smoke E_AUTH/4401, E_ORIGIN/4402; live T009 |
| Session FSM R1–R9 | 95% | SessionTableTests 13/13 time-injected; displacement 4002 in smoke + live |
| Protocol / 16-byte codec drift guard | 98% | ProtocolTests + BinaryFrameTests round-trip the shared fixtures byte-identically |
| Registry + lifecycle | 95% | RegistryTests 4/4 + lifecycle-headless 6/6; live ~6× at T009 |
| AC-14 `/health` named grants | 75% | shape verified headless + live; denied-grant `E_PERMISSION` path code-complete, Phase-6-deferred |
| AC-3/4 input fidelity | 55% | tap/drag/keyboard+unicode live at T009; wheel-fidelity sub-path Phase-6-deferred |
| AC-2 sustained fps / latency | 30% | Phase-1 spike + T009 sample; sustained Godot sweep Phase-6-deferred (overclaim corrected in round 2) |
| AC-10 minimize/window-gone live | 45% | plumbing compile-verified + fixture-exercised; live AX restore Phase-6-deferred |

Each round-2 fix has a backing test (F003 oversize-frame, F004 wheel-clamp, F005 codec-string, F007 env-port, F009 POST /sessions §16, F002 pause-lifecycle §17). The only un-tested fix is F008 (compile-verified startup guard — LOW F006 above). Deferred ACs are documented deferrals, not missing-evidence findings.

### E.5) Doctrine Compliance
Doctrine source = AGENTS.md + `docs/project-rules/{rules,idioms,architecture,constitution}.md` (all present) + plan frozen contracts. All frozen/security invariants hold verbatim: loopback-only bind; raw-key HS256 with `aud=remote-view-ws`, no `cwd`, exp required+enforced (matches the web token route minting 5m exp / no cwd); close codes 4401/4402/4404/4002; cert `chainglass-dev` + bundle `com.chainglass.streamd` reused verbatim; HKDF derivation byte-identical to web `signing-key.ts`; no secrets logged or written in cleartext. **No AI attribution** in any Phase-4/fix commit (1f033d23, 6a2c41b3, faca063e, 3b8d04cb, e3cf4a92, 598c6820, dfeb0146) — AGENTS.md:167 respected.

## F) Coverage Map

Acceptance criteria split cleanly into **headless-verified-now** (AC-9, session FSM, protocol/codec, registry/lifecycle, `/health` grant shape) vs **explicitly Phase-6-live-deferred** (sustained fps/latency, live input fidelity sub-paths, AX minimize/window-gone, denied-grant `E_PERMISSION`). Round-2 FT-010/FT-011 amended the task rows so no live verification is overstated. **Overall coverage confidence: 90%** for the Phase-4 scope (headless + the captured T009 host-Mac live smoke).

## G) Commands Executed

```bash
git diff b8e65d12..HEAD > reviews/_computed.diff   # 6387 lines, 46 files
git diff --stat b8e65d12..HEAD
cd native/streamd && swift test 2>&1 | tail -30      # 75/75 passed (Swift 6.2.4)
just streamd-smoke                                   # 34 wire + 6 lifecycle = 40/40
git log --format='%H%n%an%n%s%n%b%n----' -8          # AI-attribution scan — clean
```

## H) Handover Brief

> Copy this section to the implementing agent.

**Review result**: APPROVE

**Plan**: /Users/jordanknight/substrate/084-random-enhancements-3/docs/plans/088-remote-app-view/remote-app-view-plan.md
**Spec**: same file § Business Specification
**Phase**: Phase 4: Native Daemon (Swift)
**Tasks dossier**: /Users/jordanknight/substrate/084-random-enhancements-3/docs/plans/088-remote-app-view/tasks/phase-4-native-daemon-swift/tasks.md
**Execution log**: /Users/jordanknight/substrate/084-random-enhancements-3/docs/plans/088-remote-app-view/tasks/phase-4-native-daemon-swift/execution.log.md
**Review file**: /Users/jordanknight/substrate/084-random-enhancements-3/docs/plans/088-remote-app-view/tasks/phase-4-native-daemon-swift/reviews/review.phase-4-native-daemon-swift.md

### Files Reviewed (Phase-4 surface)

| File | Status | Action Needed |
|------|--------|---------------|
| native/streamd/Sources/streamd/*.swift (15) | reviewed | none (6 LOW optional) |
| native/streamd/Tests/streamdTests/*.swift (10) | reviewed | none |
| native/streamd/scripts/*.{mjs,sh} | reviewed | none |
| justfile (streamd-* recipes) | reviewed | none |
| docs/{domains,c4}/** + plan/spec/tasks | reviewed | current |

### Required Fixes

None (APPROVE). The six LOW items are optional / by-design / Phase-6-deferred and need not block.

### Handback

APPROVE, more phases remain (Full mode): Phase 4 is complete and reviewed clean. Next is the task expansion for **Phase 5: Lifecycle, Agent Surface & Events** (Mac-free), then implement. The LOW items (F001 RFC6455 conformance, F003 backpressure keyframe gate) can be folded into Phase 5/6 if desired.
