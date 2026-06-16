# Fix Tasks: Phase 4: Native Daemon (Swift)

Apply in order. Re-run review after fixes.

## Critical / High Fixes

### FT-001: Bind streamd to localhost only
- **Severity**: HIGH
- **File(s)**: `/Users/jordanknight/substrate/084-random-enhancements-3/native/streamd/Sources/streamd/WSServer.swift`, `/Users/jordanknight/substrate/084-random-enhancements-3/native/streamd/scripts/smoke-headless.mjs`
- **Issue**: `NWListener(using:on:)` binds the daemon control surface without an explicit loopback restriction.
- **Fix**: Bind explicitly to loopback and add a smoke assertion that non-loopback interfaces are not reachable.
- **Patch hint**:
  ```diff
  - let listener = try NWListener(using: params, on: NWEndpoint.Port(rawValue: port)!)
  + // Bind only to loopback; Phase 5 proxies daemon access through Next routes.
  + let listener = try makeLoopbackListener(params: params, port: port)
  ```

### FT-002: Require JWT for every REST endpoint except `/health`
- **Severity**: HIGH
- **File(s)**: `/Users/jordanknight/substrate/084-random-enhancements-3/native/streamd/Sources/streamd/WSServer.swift`, `/Users/jordanknight/substrate/084-random-enhancements-3/native/streamd/scripts/smoke-headless.mjs`
- **Issue**: `/windows` and `/sessions` can be read/mutated without a daemon JWT.
- **Fix**: Add a REST auth guard before the route switch. Keep `GET /health` public. Add negative checks for unauthenticated `/windows`, `/sessions`, `POST /sessions`, and `DELETE /sessions/:id`.
- **Patch hint**:
  ```diff
  + if req.path != "/health" {
  +   guard case .success = RemoteViewAuth.verifyJWT(req.query["token"] ?? "", key: signingKey) else {
  +     respondAndClose(client, HTTPResponse.json(status: 401, "Unauthorized", ["error": "E_AUTH"]))
  +     return
  +   }
  + }
    switch (req.method, req.path) {
  ```

### FT-003: Gate WebSocket controls on attached viewer ownership
- **Severity**: HIGH
- **File(s)**: `/Users/jordanknight/substrate/084-random-enhancements-3/native/streamd/Sources/streamd/WSServer.swift`, `/Users/jordanknight/substrate/084-random-enhancements-3/native/streamd/scripts/smoke-headless.mjs`
- **Issue**: A valid-token client can send `input`, `pause`, `resume`, or `request-keyframe` before `hello`/attach or after displacement.
- **Fix**: Add an ownership helper and require it for session-affecting controls; send `E_SESSION_UNKNOWN` or ignore consistently with the protocol.
- **Patch hint**:
  ```diff
  + private func isCurrentViewer(_ client: ClientConnection) -> Bool {
  +   guard let sid = client.sessionId, let viewer = client.viewerId else { return false }
  +   return currentStreamSession == sid && sessions.session(sid)?.viewer == viewer
  + }
  +
    case let .input(events):
  +   guard isCurrentViewer(client) else { return }
      onInput?(events)
  ```

### FT-004: Reject malformed or negative `Content-Length` before slicing
- **Severity**: HIGH
- **File(s)**: `/Users/jordanknight/substrate/084-random-enhancements-3/native/streamd/Sources/streamd/Endpoints.swift`, `/Users/jordanknight/substrate/084-random-enhancements-3/native/streamd/Sources/streamd/WSServer.swift`, `/Users/jordanknight/substrate/084-random-enhancements-3/native/streamd/Tests/streamdTests/WebSocketTests.swift`
- **Issue**: `Content-Length: -1` can create an invalid body slice and trap.
- **Fix**: Parse content length as a validated non-negative value, reject malformed/negative values with `400`, and cap maximum buffered body size.
- **Patch hint**:
  ```diff
  - var contentLength: Int { headers["content-length"].flatMap(Int.init) ?? 0 }
  + var contentLength: Int? {
  +   guard let raw = headers["content-length"] else { return 0 }
  +   guard let value = Int(raw), value >= 0 else { return nil }
  +   return value
  + }
  ```

### FT-005: Complete or formally narrow the `/windows` contract
- **Severity**: HIGH
- **File(s)**: `/Users/jordanknight/substrate/084-random-enhancements-3/native/streamd/Sources/streamd/WSServer.swift`, `/Users/jordanknight/substrate/084-random-enhancements-3/native/streamd/Sources/streamd/Endpoints.swift`, `/Users/jordanknight/substrate/084-random-enhancements-3/docs/plans/088-remote-app-view/tasks/phase-4-native-daemon-swift/tasks.md`
- **Issue**: `/windows` returns only `frameSource.window` and no thumbnail, but Phase 4 T006 says `/windows` lists capturable windows with thumbnails.
- **Fix**: Prefer implementing a ScreenCaptureKit shareable-content catalog with thumbnails. If the daemon is intentionally spawned for one selected window only, update the plan/spec/contracts before Phase 5 and move the picker catalog to the web-side daemon manager.
- **Patch hint**:
  ```diff
  - "windows": [[ "id": w.id, "app": w.app, "title": w.title, ... ]]
  + "windows": windows.map { descriptorWithThumbnail($0) }
  ```

## Medium / Low Fixes

### FT-006: Emit resize/state/config events from live capture
- **Severity**: MEDIUM
- **File(s)**: `/Users/jordanknight/substrate/084-random-enhancements-3/native/streamd/Sources/streamd/Capture.swift`
- **Issue**: Live capture snapshots initial size and does not emit resize/minimize/restore updates.
- **Fix**: Detect size/state changes, reconfigure capture/encoder when needed, emit `window-state{resized}` and a fresh `video-config`, then force a keyframe.

### FT-007: Route missing Screen Recording/Accessibility to `E_PERMISSION`
- **Severity**: MEDIUM
- **File(s)**: `/Users/jordanknight/substrate/084-random-enhancements-3/native/streamd/Sources/streamd/Capture.swift`, `/Users/jordanknight/substrate/084-random-enhancements-3/native/streamd/Sources/streamd/WSServer.swift`
- **Issue**: Capture startup/TCC failures currently become `windowGone`.
- **Fix**: Preflight named grants and send `error{code:E_PERMISSION,message:<grant>,fatal:true}`.

### FT-008: Fix wheel event targeting
- **Severity**: MEDIUM
- **File(s)**: `/Users/jordanknight/substrate/084-random-enhancements-3/native/streamd/Sources/streamd/Input.swift`
- **Issue**: Wheel events ignore normalized `x/y` and do not focus the target first.
- **Fix**: Focus before posting and set the scroll event location to `screenPoint(x, y, bounds)`.

### FT-009: Implement real minimized-window auto-restore
- **Severity**: MEDIUM
- **File(s)**: `/Users/jordanknight/substrate/084-random-enhancements-3/native/streamd/Sources/streamd/Input.swift`
- **Issue**: `inject()` returns before focus/restore when bounds are unavailable, and `ensureFocused()` does not unminimize the target AX window.
- **Fix**: Use Accessibility to locate the target window, clear `kAXMinimized`, refresh bounds, then raise/focus.

### FT-010: Use runtime display scale instead of hardcoded `2`
- **Severity**: MEDIUM
- **File(s)**: `/Users/jordanknight/substrate/084-random-enhancements-3/native/streamd/Sources/streamd/Capture.swift`
- **Issue**: Non-2x displays can get wrong dimensions and coordinate assumptions.
- **Fix**: Resolve the target display backing scale at runtime and carry it into `WindowDescriptor`.

### FT-011: Correct Phase 4 evidence overclaims
- **Severity**: MEDIUM
- **File(s)**: `/Users/jordanknight/substrate/084-random-enhancements-3/docs/plans/088-remote-app-view/tasks/phase-4-native-daemon-swift/tasks.md`, `/Users/jordanknight/substrate/084-random-enhancements-3/docs/plans/088-remote-app-view/tasks/phase-4-native-daemon-swift/execution.log.md`
- **Issue**: The dossier/log mark sustained Godot >=30fps, minimized restore, closed-window, and missing-grant evidence as done without matching recorded output.
- **Fix**: Add the missing smoke transcripts/artifacts or explicitly defer those checks to Phase 6.

### FT-012: Update remote-view domain docs
- **Severity**: MEDIUM
- **File(s)**: `/Users/jordanknight/substrate/084-random-enhancements-3/docs/domains/remote-view/domain.md`, `/Users/jordanknight/substrate/084-random-enhancements-3/docs/domains/domain-map.md`
- **Issue**: Concepts/map omit Phase 4 streamd control API and registry contracts.
- **Fix**: Add streamd daemon/control API/registry Concepts rows; update the domain-map node, auth edge, and health row.

### FT-013: Remove broad `streamd-kill` fallback
- **Severity**: MEDIUM
- **File(s)**: `/Users/jordanknight/substrate/084-random-enhancements-3/justfile`
- **Issue**: Fallback `pkill -f` can kill another worktree's daemon because the signed bundle path is shared.
- **Fix**: Only kill registry-backed PIDs, or require explicit PID/registry path for manual cleanup.

## Re-Review Checklist

- [ ] All critical/high fixes applied
- [ ] Negative tests/smoke cover listener binding, REST auth, pre-hello controls, and malformed content length
- [ ] `swift test` passes
- [ ] `just streamd-smoke` passes
- [ ] Review re-run achieves zero HIGH/CRITICAL findings
