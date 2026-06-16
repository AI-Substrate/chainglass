# Code Review: Phase 4: Native Daemon (Swift)

**Plan**: `/Users/jordanknight/substrate/084-random-enhancements-3/docs/plans/088-remote-app-view/remote-app-view-plan.md`
**Spec**: `/Users/jordanknight/substrate/084-random-enhancements-3/docs/plans/088-remote-app-view/remote-app-view-spec.md`
**Phase**: Phase 4: Native Daemon (Swift)
**Date**: 2026-06-16
**Reviewer**: Automated (the review verb)
**Testing Approach**: Hybrid

## A) Verdict

**REQUEST_CHANGES**

The daemon implementation is substantial and the automated Swift/headless checks pass, but the phase has unmitigated HIGH findings in the daemon control surface: non-localhost listener exposure, unauthenticated REST endpoints, WebSocket control messages accepted before session ownership, a negative `Content-Length` crash, and an incomplete `/windows` contract.

**Key failure areas**:
- **Implementation**: Security and correctness gaps in `WSServer` let unauthenticated or pre-attach clients affect daemon state and can crash the daemon.
- **Domain compliance**: Domain concepts/map lag the new streamd control API and registry surfaces.
- **Testing**: Existing checks are green, but they do not cover the blocking auth/listener/pre-hello/negative-body cases, and live evidence overclaims some Phase 4 done-whens.
- **Doctrine**: `streamd-kill` still falls back to broad `pkill` despite the repo rule to kill exact PIDs.

## B) Summary

Phase 4 lands the first native daemon package under `native/streamd/`, with Swift protocol/auth/session/capture/input/registry code plus headless and live smoke scripts. The positive evidence is strong for fixture conformance, auth vectors, session table behavior, registry lifecycle, and the happy-path WebSocket stream: `swift test` passed 66/66 and `just streamd-smoke` passed 24/24 during this review. The review still requests changes because several externally reachable control paths are under-gated or incorrectly scoped, and one HTTP parsing path can trap on malformed unauthenticated input. Anti-reinvention found no genuine duplication that should block the phase; the Swift daemon is intentionally a native mirror of existing web contracts.

## C) Checklist

**Testing Approach: Hybrid**

- [x] Automated Swift fixture/auth/session/registry tests present
- [x] Headless live-daemon smoke present
- [x] Manual native smoke recorded
- [ ] Security-negative checks cover REST auth, listener binding, pre-hello WS controls, and malformed HTTP bodies
- [ ] Manual evidence aligns with every checked Phase 4 done-when
- [x] Only in-scope implementation surfaces changed
- [x] Linters/type checks relevant to streamd clean
- [ ] Domain compliance checks pass

## D) Findings Table

| ID | Severity | File:Lines | Category | Summary | Recommendation |
|----|----------|------------|----------|---------|----------------|
| F001 | HIGH | `/Users/jordanknight/substrate/084-random-enhancements-3/native/streamd/Sources/streamd/WSServer.swift:53-57` | security | Daemon listener is not constrained to loopback. | Bind explicitly to localhost/loopback and smoke-test that external interfaces cannot connect. |
| F002 | HIGH | `/Users/jordanknight/substrate/084-random-enhancements-3/native/streamd/Sources/streamd/WSServer.swift:165-203` | security | `/windows` and `/sessions` REST endpoints are unauthenticated. | Require a valid JWT for every REST endpoint except `/health`; add negative smoke/tests. |
| F003 | HIGH | `/Users/jordanknight/substrate/084-random-enhancements-3/native/streamd/Sources/streamd/WSServer.swift:261-277` | security | Pre-hello clients can send `input`, `pause`, `resume`, and `request-keyframe`. | Gate session-affecting controls on the current attached viewer/session. |
| F004 | HIGH | `/Users/jordanknight/substrate/084-random-enhancements-3/native/streamd/Sources/streamd/Endpoints.swift:20-22`, `/Users/jordanknight/substrate/084-random-enhancements-3/native/streamd/Sources/streamd/WSServer.swift:134-138` | error-handling | Negative `Content-Length` can make the body slice trap. | Reject negative/malformed lengths before slicing; cap header/body sizes. |
| F005 | HIGH | `/Users/jordanknight/substrate/084-random-enhancements-3/native/streamd/Sources/streamd/WSServer.swift:177-184` | scope/correctness | `/windows` returns only the current frame source window and no thumbnail/list catalog. | Implement the promised capturable-window catalog with thumbnail support, or formally narrow the contract before Phase 5. |
| F006 | MEDIUM | `/Users/jordanknight/substrate/084-random-enhancements-3/native/streamd/Sources/streamd/Capture.swift:62-95` | correctness | Live capture snapshots initial size and does not emit resize/minimize/restore config updates. | Detect window state/size changes, reconfigure encoder/stream, emit `window-state`, `video-config`, and a keyframe. |
| F007 | MEDIUM | `/Users/jordanknight/substrate/084-random-enhancements-3/native/streamd/Sources/streamd/Capture.swift:51-55`, `/Users/jordanknight/substrate/084-random-enhancements-3/native/streamd/Sources/streamd/Capture.swift:90-95` | error-handling | Capture startup/TCC failures collapse to `windowGone` rather than `E_PERMISSION` with a named grant. | Preflight Screen Recording/Accessibility and send `E_PERMISSION` with the missing grant name. |
| F008 | MEDIUM | `/Users/jordanknight/substrate/084-random-enhancements-3/native/streamd/Sources/streamd/Input.swift:130-134` | correctness | Wheel events ignore `x/y` and do not focus the target first. | Focus before wheel and set the event location from normalized coordinates. |
| F009 | MEDIUM | `/Users/jordanknight/substrate/084-random-enhancements-3/native/streamd/Sources/streamd/Input.swift:107-110`, `/Users/jordanknight/substrate/084-random-enhancements-3/native/streamd/Sources/streamd/Input.swift:167-187` | correctness | Minimized-window auto-restore is not actually implemented for minimized target windows. | Use Accessibility to find the target AX window, clear minimized state, then raise/focus before input. |
| F010 | MEDIUM | `/Users/jordanknight/substrate/084-random-enhancements-3/native/streamd/Sources/streamd/Capture.swift:62-69` | correctness | Window scale is hardcoded to `2`. | Resolve the target display backing scale at runtime. |
| F011 | MEDIUM | `/Users/jordanknight/substrate/084-random-enhancements-3/docs/plans/088-remote-app-view/tasks/phase-4-native-daemon-swift/execution.log.md:182-218` | testing | T003/T009 evidence does not show the required sustained Godot >=30fps run. | Add recorded Godot smoke output or downgrade/defer that done-when explicitly. |
| F012 | MEDIUM | `/Users/jordanknight/substrate/084-random-enhancements-3/docs/plans/088-remote-app-view/tasks/phase-4-native-daemon-swift/execution.log.md:186-195` | testing | Missing-grant `E_PERMISSION` behavior is not recorded. | Add denied-grant smoke evidence or explicitly defer to Phase 6. |
| F013 | MEDIUM | `/Users/jordanknight/substrate/084-random-enhancements-3/docs/domains/remote-view/domain.md:35-47`, `/Users/jordanknight/substrate/084-random-enhancements-3/docs/domains/domain-map.md:57-58`, `/Users/jordanknight/substrate/084-random-enhancements-3/docs/domains/domain-map.md:241` | domain-md/map-nodes | Domain concepts and map still describe Phase 2/3 remote-view surfaces and omit streamd control/registry contracts. | Add streamd/control API/registry concept rows and update the map node + health row. |
| F014 | MEDIUM | `/Users/jordanknight/substrate/084-random-enhancements-3/justfile:135-148` | doctrine | `streamd-kill` falls back to broad `pkill` by shared bundle path. | Remove the fallback or require an explicit PID/registry path. |

## E) Detailed Findings

### E.1) Implementation Quality

**F001 - HIGH - listener not constrained to loopback**

`WSServer.start()` creates `NWListener(using:on:)` with only a port. The control API is meant to be host-local and proxied by Next/Phase 5; binding all interfaces expands the attack surface even if some paths are token-gated.

**Fix**: bind explicitly to loopback (`127.0.0.1` and/or `::1`, depending on the Network.framework API shape used) and add a smoke assertion that an external interface cannot connect.

**F002 - HIGH - REST control endpoints lack auth**

`GET /windows`, `GET /sessions`, `POST /sessions`, and `DELETE /sessions/:id` are reachable without JWT verification. This lets any local web page/process create and close stream sessions and enumerate the target window.

**Fix**: centralize REST auth in `handleREST`: `/health` is public; every other route requires `RemoteViewAuth.verifyJWT` or the same upgrade authorization contract. Add unauthenticated negative tests/smoke for `/windows` and `/sessions`.

**F003 - HIGH - WebSocket controls accepted before ownership**

After upgrade, `handleText` processes `input`, `request-keyframe`, `pause`, and `resume` regardless of whether the client sent a valid `hello` and became the current attached viewer. A valid-token but unattached client can pause the global frame source or inject input.

**Fix**: require `client.sessionId`, `client.viewerId`, and `sessions.session(sessionId)?.viewer == viewerId` before honoring session-affecting controls. `ping` can remain harmless; unknown messages can remain ignored.

**F004 - HIGH - malformed `Content-Length` crash**

`HTTPRequest.contentLength` parses any integer, including negative values. `WSServer.tryHandshake()` then computes `needed = headEnd + req.contentLength` and slices `client.inBuffer[headEnd..<needed]`; for negative values this can form an invalid range and trap before any route-level auth.

**Fix**: make content length parsing validate non-negative decimal values, reject malformed values with `400`, and cap acceptable body/header sizes.

**F005 - HIGH - `/windows` contract incomplete**

Phase 4 T006 calls for `/windows` with capturable windows and one-shot thumbnails. The implementation returns only `frameSource.window` and no thumbnail. That blocks the Phase 5 picker/attach proxy from listing host windows before a session exists.

**Fix**: implement a ScreenCaptureKit shareable-content catalog and thumbnail output, or update the plan/spec/domain contracts before Phase 5 if the daemon is intentionally single-window-at-launch.

**F006 - MEDIUM - resize/minimize/restore handling missing**

`CaptureFrameSource` captures the initial `SCWindow` size once, hardcodes descriptor scale, and does not observe subsequent resize/move/minimize/restore state. The client contract expects `window-state{resized}` plus a fresh `video-config` and keyframe on resize.

**Fix**: detect size/state changes, reconfigure capture/encoder when dimensions change, and emit the required state/config/keyframe sequence.

**F007 - MEDIUM - permission failures mapped to window-gone**

Capture lookup/start errors are emitted as `.windowGone`. Missing Screen Recording should be a named `E_PERMISSION` path so AC-14 can tell the user exactly what to grant.

**Fix**: preflight grants before live capture and route denial through `error{E_PERMISSION,<grant>,fatal}` rather than `windowGone`.

**F008 - MEDIUM - wheel events do not target the streamed coordinate**

Wheel events discard normalized `x/y`, do not focus the target, and post a scroll event without a location. This can scroll wherever the host cursor/front app currently is.

**Fix**: call `ensureFocused()` for wheel events and set the CGEvent location to `screenPoint(x, y, bounds)`.

**F009 - MEDIUM - minimized auto-restore not implemented**

`inject()` returns immediately when `windowBounds()` is unavailable, which is likely for minimized windows. `ensureFocused()` un-hides the app but does not unminimize the target AX window.

**Fix**: use Accessibility to locate the target window, clear `kAXMinimized`, then refresh bounds and raise/focus before posting input.

**F010 - MEDIUM - hardcoded Retina scale**

`CaptureFrameSource` hardcodes `scale: 2` and multiplies dimensions by `2`, which is wrong for non-2x displays and can break coordinate mapping.

**Fix**: derive the actual display backing scale for the target window at runtime and carry it into `WindowDescriptor`.

### E.2) Domain Compliance

| Check | Status | Details |
|-------|--------|---------|
| File placement | ✅ | `native/streamd/` is the declared Phase 4 remote-view native location. |
| Contract-only imports | ✅ | Swift daemon mirrors contracts via fixtures/vectors; no cross-domain TypeScript internal import violation found. |
| Dependency direction | ✅ | `_platform` does not import `remote-view`; daemon is outside pnpm/turbo graph. |
| Domain.md updated | ❌ | History/source location updated, but Concepts still treats daemon/control surfaces as future work. |
| Registry current | ✅ | No new domain registration required beyond existing `remote-view`. |
| No orphan files | ✅ | Changed files map to Phase 4 native/docs/infra surfaces. |
| Map nodes current | ❌ | `remote-view` graph node and health row omit streamd REST/WS/registry lifecycle. |
| Map edges current | ⚠️ | Auth edge omits the Phase 4 Origin allowlist mirror. |
| No circular business deps | ✅ | No new business-domain cycles found. |
| Concepts documented | ❌ | Add concepts for native streamd daemon/control API and registry. |

### E.3) Anti-Reinvention

| New Component | Existing Match? | Domain | Status |
|--------------|----------------|--------|--------|
| Swift `streamd` daemon | None | remote-view | proceed |
| Swift protocol/auth mirrors | Existing terminal/web contracts intentionally mirrored | _platform/auth / remote-view | proceed |
| WebSocket server | No reusable Swift server in repo | remote-view | proceed |
| Session table | Web fake/session concepts exist but native session authority is required | remote-view | proceed |
| Registry lifecycle | Terminal sidecar pattern exists, but Swift daemon writer is native-specific | terminal/platform precedent | proceed |

No genuine duplication was found that should block the phase.

### E.4) Testing & Evidence

**Coverage confidence**: 78%

| AC | Confidence | Evidence |
|----|------------|----------|
| AC1 | 25% | Phase 4 exposes partial daemon `/windows`; browser picker and full catalog are incomplete/later. |
| AC2 | 45% | Live Simulator stream observed at 20-51fps; sustained Godot >=30fps and latency remain unproven. |
| AC3 | 78% | T009 verifies tap/drag/type into Simulator after fixes; wheel and first-click-after-raise remain weak spots. |
| AC4 | 86% | T009 verifies real iOS Simulator tap/drag/type text. |
| AC5 | 0% | Layout composition is Phase 3, not Phase 4. |
| AC6 | 35% | Session reattach primitives tested; browser refresh <=3s is Phase 6. |
| AC7 | 75% | Unit/headless/live evidence for latest-attach-wins displacement; UI reclaim later. |
| AC8 | 10% | Agent CLI/MCP/SDK and pushed events are Phase 5. |
| AC9 | 95% | Auth vectors + smoke verify bad token/origin and close codes. |
| AC10 | 55% | Window gone/minimized support exists in code claims, but direct minimized/closed-window smoke is missing. |
| AC11 | 72% | Registry write/remove, vanish self-exit, SIGTERM bye+close verified; web spawn/reaper later. |
| AC12 | 25% | Fixture `FrameSource` supports fake-first architecture; full web fake build was Phase 2/3. |
| AC13 | 0% | Bundle guard is Phase 3, not Phase 4. |
| AC14 | 55% | `/health` named grants shape observed as granted; denied-grant UX not recorded. |

### E.5) Doctrine Compliance

- `streamd-kill` still has a broad `pkill -f` fallback by shared bundle path. Repository instructions require exact PID termination; the phase log says this was fixed, but the fallback remains. Remove it or make broad cleanup an explicit, human-supplied PID/registry operation.
- New Swift XCTest methods do not carry the web test suite's 5-field Test Doc comments. This is not blocking for the native package if recorded as a scoped Swift exception, but the dossier should not imply full compliance without that deviation.

## F) Coverage Map

| AC | Description | Evidence | Confidence |
|----|-------------|----------|------------|
| AC1 | Window picker lists capturable windows and attach target | `/windows` exists but only returns current frame source; no thumbnails/catalog | 25% |
| AC2 | Live Godot stream >=30fps, latency <=150ms | T009 Simulator stream 20-51fps; Godot sustained run and latency deferred | 45% |
| AC3 | Click/drag/scroll/type land correctly | T009 tap/drag/type verified; wheel targeting gap remains | 78% |
| AC4 | iOS Simulator tap/text | T009 real Simulator smoke verified "tacos" text and taps | 86% |
| AC5 | Terminal over/beside layout | Phase 3 evidence, not Phase 4 | 0% |
| AC6 | Refresh reattach within 3s | Session table primitives only | 35% |
| AC7 | Single viewer latest attach wins | Session tests and smoke displacement close 4002 | 75% |
| AC8 | CLI/MCP/SDK agent control | Phase 5 | 10% |
| AC9 | Auth rejects invalid token/origin | Auth vectors, headless and live smoke | 95% |
| AC10 | Minimized auto-restore and closed window state | Code paths claimed; direct minimized/closed smoke missing; implementation gaps found | 55% |
| AC11 | Daemon lifecycle hygiene | Registry/SIGTERM/vanish smoke | 72% |
| AC12 | Fake-first web build | Prior phases; daemon fixture source reinforces it | 25% |
| AC13 | Lazy bundle guard | Phase 3 | 0% |
| AC14 | Permission UX | `/health` named grants, but denied path missing | 55% |

**Overall coverage confidence**: 78%

## G) Commands Executed

```bash
git --no-pager status --short
git --no-pager diff --stat
git --no-pager log --oneline -20 --decorate
git --no-pager diff --name-status b8e65d12..HEAD
git --no-pager diff --stat b8e65d12..HEAD
git --no-pager diff b8e65d12..HEAD > docs/plans/088-remote-app-view/tasks/phase-4-native-daemon-swift/reviews/_computed.diff
just streamd-test
just streamd-smoke
```

## H) Handover Brief

> Copy this section to the implementing agent. It has no context on the review —
> only context on the work that was done before the review.

**Review result**: REQUEST_CHANGES

**Plan**: `/Users/jordanknight/substrate/084-random-enhancements-3/docs/plans/088-remote-app-view/remote-app-view-plan.md`
**Spec**: `/Users/jordanknight/substrate/084-random-enhancements-3/docs/plans/088-remote-app-view/remote-app-view-spec.md`
**Phase**: Phase 4: Native Daemon (Swift)
**Tasks dossier**: `/Users/jordanknight/substrate/084-random-enhancements-3/docs/plans/088-remote-app-view/tasks/phase-4-native-daemon-swift/tasks.md`
**Execution log**: `/Users/jordanknight/substrate/084-random-enhancements-3/docs/plans/088-remote-app-view/tasks/phase-4-native-daemon-swift/execution.log.md`
**Review file**: `/Users/jordanknight/substrate/084-random-enhancements-3/docs/plans/088-remote-app-view/tasks/phase-4-native-daemon-swift/reviews/review.phase-4-native-daemon-swift.md`

### Files Reviewed

| File (absolute path) | Status | Domain | Action Needed |
|---------------------|--------|--------|---------------|
| `/Users/jordanknight/substrate/084-random-enhancements-3/native/streamd/Sources/streamd/WSServer.swift` | REQUEST_CHANGES | remote-view | Fix listener binding, REST auth, pre-hello controls, `/windows` catalog. |
| `/Users/jordanknight/substrate/084-random-enhancements-3/native/streamd/Sources/streamd/Endpoints.swift` | REQUEST_CHANGES | remote-view | Validate content length before body slicing. |
| `/Users/jordanknight/substrate/084-random-enhancements-3/native/streamd/Sources/streamd/Capture.swift` | REQUEST_CHANGES | remote-view | Fix permission errors, resize/state handling, runtime scale. |
| `/Users/jordanknight/substrate/084-random-enhancements-3/native/streamd/Sources/streamd/Input.swift` | REQUEST_CHANGES | remote-view | Fix wheel targeting and minimized restore. |
| `/Users/jordanknight/substrate/084-random-enhancements-3/justfile` | REQUEST_CHANGES | infra | Remove broad `pkill` fallback. |
| `/Users/jordanknight/substrate/084-random-enhancements-3/docs/domains/remote-view/domain.md` | REQUEST_CHANGES | remote-view | Update Concepts for streamd/control/registry. |
| `/Users/jordanknight/substrate/084-random-enhancements-3/docs/domains/domain-map.md` | REQUEST_CHANGES | docs/domains | Update remote-view node, edge labels, and health row. |
| `/Users/jordanknight/substrate/084-random-enhancements-3/docs/plans/088-remote-app-view/tasks/phase-4-native-daemon-swift/execution.log.md` | REQUEST_CHANGES | plan artifact | Correct or supplement overclaimed evidence. |
| `/Users/jordanknight/substrate/084-random-enhancements-3/native/streamd/Tests/streamdTests/*.swift` | REVIEWED | remote-view tests | Add/adjust tests for fixes; consider Swift Test Doc deviation. |
| `/Users/jordanknight/substrate/084-random-enhancements-3/native/streamd/scripts/*.mjs` | REVIEWED | remote-view tests | Extend smoke coverage for negative/control cases. |

### Required Fixes (if REQUEST_CHANGES)

| # | File (absolute path) | What To Fix | Why |
|---|---------------------|-------------|-----|
| 1 | `/Users/jordanknight/substrate/084-random-enhancements-3/native/streamd/Sources/streamd/WSServer.swift` | Bind to loopback only. | Avoid exposing daemon control surface beyond localhost. |
| 2 | `/Users/jordanknight/substrate/084-random-enhancements-3/native/streamd/Sources/streamd/WSServer.swift` | Require JWT for all REST routes except `/health`. | Prevent unauthenticated session/window manipulation. |
| 3 | `/Users/jordanknight/substrate/084-random-enhancements-3/native/streamd/Sources/streamd/WSServer.swift` | Gate `input`, `pause`, `resume`, `request-keyframe`, `detach` on current viewer ownership. | Prevent unattached clients affecting active streams/input. |
| 4 | `/Users/jordanknight/substrate/084-random-enhancements-3/native/streamd/Sources/streamd/Endpoints.swift`, `/Users/jordanknight/substrate/084-random-enhancements-3/native/streamd/Sources/streamd/WSServer.swift` | Reject negative/malformed/oversized content lengths before slicing. | Prevent unauthenticated daemon crash. |
| 5 | `/Users/jordanknight/substrate/084-random-enhancements-3/native/streamd/Sources/streamd/WSServer.swift` | Implement or formally narrow `/windows` catalog + thumbnails. | Phase 5 picker needs the promised contract. |

### Domain Artifacts to Update (if any)

| File (absolute path) | What's Missing |
|---------------------|----------------|
| `/Users/jordanknight/substrate/084-random-enhancements-3/docs/domains/remote-view/domain.md` | Concepts rows for streamd daemon/control API and registry. |
| `/Users/jordanknight/substrate/084-random-enhancements-3/docs/domains/domain-map.md` | Remote-view node/health row for streamd REST/WS/registry and auth Origin allowlist edge. |

### Handback

Fixes go back through the implement verb (same flags), then re-run this review.
