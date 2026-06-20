# Fix Tasks: Phase 4: Native Daemon (Swift)

Apply in order. Re-run review after fixes.

## Critical / High Fixes

### FT-001: Validate `streamd-kill` registry PIDs before signaling
- **Severity**: HIGH
- **File(s)**: `/Users/jordanknight/substrate/084-random-enhancements-3/justfile`
- **Issue**: `streamd-kill` reads `.pid` from workspace-local registry JSON and passes it directly to `kill`. Values such as `0`, negative numbers, or option-shaped strings can signal process groups/all accessible processes or be parsed as signal options.
- **Fix**: Accept only positive nonzero decimal PIDs, verify the PID still belongs to the expected `streamd` instance from the registry (at minimum process exists and command/bundle/port matches), then call `kill -- "$pid"`. Refuse invalid registry files.
- **Patch hint**:
  ```diff
  - pid=$(jq -r '.pid // empty' "$f" 2>/dev/null)
  - if [ -n "$pid" ] && kill "$pid" 2>/dev/null; then echo "killed streamd pid $pid (from $f)"; killed=1; fi
  + pid=$(jq -r '.pid // empty' "$f" 2>/dev/null)
  + if [[ ! "$pid" =~ ^[1-9][0-9]*$ ]]; then
  +   echo "skipping invalid streamd pid in $f: ${pid:-<empty>}" >&2
  +   continue
  + fi
  + # Also verify command/port identity before killing.
  + if kill -- "$pid" 2>/dev/null; then echo "killed streamd pid $pid (from $f)"; killed=1; fi
  ```

## Medium / Low Fixes

### FT-002: Resume or reset `FrameSource` on viewer lifecycle transitions
- **Severity**: MEDIUM
- **File(s)**: `/Users/jordanknight/substrate/084-random-enhancements-3/native/streamd/Sources/streamd/WSServer.swift`
- **Issue**: A viewer can pause the global frame source, then disconnect/detach without resuming. A later viewer attaches but only requests a keyframe; the source can remain paused.
- **Fix**: Resume the frame source on every successful attach before requesting the keyframe, and make close/detach/timeout transitions explicit about source pause/resume state.
- **Patch hint**:
  ```diff
      currentStreamSession = sessionId
+     frameSource.resume()
      sendMessage(client, .helloOk(...))
      frameSource.requestKeyframe()
  ```

### FT-003: Cap WebSocket frame lengths and fragment buffers
- **Severity**: MEDIUM
- **File(s)**: `/Users/jordanknight/substrate/084-random-enhancements-3/native/streamd/Sources/streamd/WebSocket.swift`, `/Users/jordanknight/substrate/084-random-enhancements-3/native/streamd/Sources/streamd/WSServer.swift`
- **Issue**: 64-bit payload lengths are converted to `Int` before bounds checks, and fragment buffers can grow without a protocol-level cap.
- **Fix**: Reject lengths above `Int.max` and above a small control-frame limit before conversion; close malformed/oversized frames.

### FT-004: Clamp wheel deltas before `Int32` conversion
- **Severity**: MEDIUM
- **File(s)**: `/Users/jordanknight/substrate/084-random-enhancements-3/native/streamd/Sources/streamd/Input.swift`
- **Issue**: Protocol-unbounded `dx/dy` values are converted directly to `Int32`.
- **Fix**: Reject non-finite values and clamp/saturate to `Int32.min...Int32.max` before constructing the scroll event.

### FT-005: Make live H.264 codec metadata truthful
- **Severity**: MEDIUM
- **File(s)**: `/Users/jordanknight/substrate/084-random-enhancements-3/native/streamd/Sources/streamd/Capture.swift`, `/Users/jordanknight/substrate/084-random-enhancements-3/native/streamd/Sources/streamd/Encoder.swift`
- **Issue**: Live capture always advertises `avc1.640020`, but AutoLevel and arbitrary window dimensions can produce a different H.264 level.
- **Fix**: Derive the `avc1.*` codec string from the actual SPS/format description, or constrain encoder dimensions/level so High Profile Level 3.2 is guaranteed.

### FT-006: Align `/windows` contract text after narrowing
- **Severity**: MEDIUM
- **File(s)**: `/Users/jordanknight/substrate/084-random-enhancements-3/docs/plans/088-remote-app-view/remote-app-view-plan.md`, `/Users/jordanknight/substrate/084-random-enhancements-3/docs/plans/088-remote-app-view/remote-app-view-spec.md`
- **Issue**: Phase 4 artifacts narrow daemon `/windows` to one selected window, but the authoritative plan still says Phase 4 daemon `/windows` lists capturable windows with thumbnails and Phase 5 routes proxy it.
- **Fix**: Update the plan/spec so the picker catalog and thumbnails are explicitly web-side daemon-manager responsibilities, while daemon `/windows` is single-window-only.

### FT-007: Fail invalid `CG_REMOTE_VIEW__DAEMON_PORT`
- **Severity**: MEDIUM
- **File(s)**: `/Users/jordanknight/substrate/084-random-enhancements-3/native/streamd/Sources/streamd/Config.swift`, `/Users/jordanknight/substrate/084-random-enhancements-3/native/streamd/Tests/streamdTests/ConfigTests.swift`
- **Issue**: An invalid explicit env port silently falls back to `6001`.
- **Fix**: If `CG_REMOTE_VIEW__DAEMON_PORT` is present, validate it and throw on invalid values; default only when absent.

### FT-008: Require a valid live window id
- **Severity**: MEDIUM
- **File(s)**: `/Users/jordanknight/substrate/084-random-enhancements-3/native/streamd/Sources/streamd/main.swift`
- **Issue**: Missing/non-numeric `CG_REMOTE_VIEW__WINDOW_ID` becomes `0` in live mode.
- **Fix**: In non-fixture mode, require a valid nonzero `CG_REMOTE_VIEW__WINDOW_ID` and fail startup with a clear error if absent/invalid.

### FT-009: Reject malformed `POST /sessions` bodies
- **Severity**: MEDIUM
- **File(s)**: `/Users/jordanknight/substrate/084-random-enhancements-3/native/streamd/Sources/streamd/WSServer.swift`, `/Users/jordanknight/substrate/084-random-enhancements-3/native/streamd/scripts/smoke-headless.mjs`
- **Issue**: Malformed non-empty session-create bodies default to a successful session create.
- **Fix**: Return `400` for non-empty malformed or non-object JSON; keep default fields only for empty body or valid object body.

### FT-010: Align Phase 4 task rows with recorded evidence
- **Severity**: MEDIUM
- **File(s)**: `/Users/jordanknight/substrate/084-random-enhancements-3/docs/plans/088-remote-app-view/tasks/phase-4-native-daemon-swift/tasks.md`, `/Users/jordanknight/substrate/084-random-enhancements-3/docs/plans/088-remote-app-view/tasks/phase-4-native-daemon-swift/execution.log.md`
- **Issue**: Some checked task rows still require live evidence that the execution log now honestly defers to Phase 6.
- **Fix**: Split each row into Phase 4 code/headless completion vs Phase 6 live verification, or add the missing host-Mac evidence.

### FT-011: Complete the Discovery Registry concept docs
- **Severity**: LOW
- **File(s)**: `/Users/jordanknight/substrate/084-random-enhancements-3/docs/domains/remote-view/domain.md`
- **Issue**: The registry concept omits `bundlePath` and `startedAt`, and is ambiguous about filename key vs JSON `port`.
- **Fix**: Document `RegistryFile{pid,port,protocolVersion,daemonVersion,bundleId,bundlePath,startedAt}` and clarify `streamd-<webPort>.json`.

### FT-012: Add/update Remote View C4 component docs
- **Severity**: LOW
- **File(s)**: `/Users/jordanknight/substrate/084-random-enhancements-3/docs/c4/README.md`, `/Users/jordanknight/substrate/084-random-enhancements-3/docs/c4/components/remote-view.md`
- **Issue**: C4 docs do not include Remote View or the new `streamd`/control API/registry components.
- **Fix**: Add a Remote View L3 component diagram and link it from the C4 README.

## Re-Review Checklist

- [ ] All critical/high fixes applied
- [ ] `streamd-kill` refuses invalid PID values and validates expected streamd identity
- [ ] FrameSource pause/resume lifecycle covered
- [ ] Oversized WebSocket/control inputs rejected without traps
- [ ] Config invalid-env and missing-window-id cases fail clearly
- [ ] Plan/task/domain/C4 docs aligned with final Phase 4 contract
- [ ] Relevant Swift tests/smoke updated and passing
- [ ] Re-run this review verb and achieve zero HIGH/CRITICAL
