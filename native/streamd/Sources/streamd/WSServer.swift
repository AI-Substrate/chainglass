import Foundation
import Network

/// The daemon's HTTP + WebSocket server (dossier T006) — the composition root.
///
/// Wires the auth gate (T004), the session machine (T005), and the frame source (T003)
/// into one `NWListener`. Plain `GET`/`POST` requests hit the REST endpoints
/// (`/health`, `/windows`, `/sessions`, `/shutdown`); a `GET /stream` upgrade becomes a
/// WebSocket carrying the Workshop-003 wire protocol (hand-rolled framing, `WebSocket.swift`).
///
/// **All** mutable state (the `SessionTable`, the connection map, the current stream) is
/// touched only on the single serial `queue` — every `NWConnection` callback and the
/// `FrameSource` delivery run there, so no extra locking is needed. This is the piece the
/// fixture frame source makes verifiable headless (no TCC grant): a real authenticated
/// socket streaming the recorded frames to a browser.
final class WSServer {
    private let port: UInt16
    private let signingKey: [UInt8]
    private let allowedOrigins: Set<String>
    private let frameSource: FrameSource
    private let sessions: SessionTable
    private let queue = DispatchQueue(label: "com.chainglass.streamd.ws")

    /// Live input is injected through this sink (wired to T007's CGEvent injector by `main`);
    /// nil → input events are accepted + dropped (headless).
    var onInput: (([InputEvent]) -> Void)?
    /// Called on `POST /shutdown` so `main` can run the graceful-close path (T008).
    var onShutdownRequest: (() -> Void)?

    private var listener: NWListener?
    private var connections: [ObjectIdentifier: ClientConnection] = [:]
    private var connByViewer: [String: ClientConnection] = [:]
    private var currentStreamSession: String?
    private var latestConfig: VideoConfig?
    private var statsTimer: DispatchSourceTimer?
    private var sweepTimer: DispatchSourceTimer?
    private var nextViewerSeq = 0

    private let backpressureLimit = 512 * 1024

    init(port: UInt16, signingKey: [UInt8], allowedOrigins: Set<String>,
         frameSource: FrameSource, sessions: SessionTable = SessionTable()) {
        self.port = port
        self.signingKey = signingKey
        self.allowedOrigins = allowedOrigins
        self.frameSource = frameSource
        self.sessions = sessions
        self.latestConfig = frameSource.config
    }

    // MARK: lifecycle

    func start() throws {
        let params = NWParameters.tcp
        params.allowLocalEndpointReuse = true
        let listener = try NWListener(using: params, on: NWEndpoint.Port(rawValue: port)!)
        listener.newConnectionHandler = { [weak self] conn in self?.accept(conn) }
        listener.stateUpdateHandler = { state in
            if case let .failed(error) = state {
                FileHandle.standardError.write(Data("streamd: listener failed: \(error)\n".utf8))
            }
        }
        self.listener = listener
        listener.start(queue: queue)
        frameSource.start(on: queue) { [weak self] event in self?.onSourceEvent(event) }
        startStatsTimer()
        startSweepTimer()
    }

    func stop() {
        queue.sync {
            statsTimer?.cancel(); sweepTimer?.cancel()
            frameSource.stop()
            for (_, c) in connections { c.conn.cancel() }
            connections.removeAll(); connByViewer.removeAll()
            listener?.cancel()
        }
    }

    /// Broadcast `bye{shutdown}` to the current viewer then close (SIGTERM path, T008).
    func broadcastByeAndClose(reason: ByeReason) {
        queue.sync {
            if let sid = currentStreamSession, let s = sessions.session(sid),
               let v = s.viewer, let c = connByViewer[v] {
                sendMessage(c, .bye(reason: reason))
                close(c, code: WebSocket.Close.normal, reason: reason.rawValue)
            }
        }
    }

    // MARK: connection acceptance

    private func accept(_ conn: NWConnection) {
        let client = ClientConnection(conn: conn)
        connections[ObjectIdentifier(client)] = client
        conn.stateUpdateHandler = { [weak self] state in
            guard let self else { return }
            if case .cancelled = state { self.cleanup(client) }
            if case .failed = state { self.cleanup(client) }
        }
        conn.start(queue: queue)
        receive(client)
    }

    private func receive(_ client: ClientConnection) {
        client.conn.receive(minimumIncompleteLength: 1, maximumLength: 1 << 16) { [weak self] data, _, isComplete, error in
            guard let self else { return }
            if let data, !data.isEmpty {
                client.inBuffer.append(contentsOf: data)
                self.onBytes(client)
            }
            if isComplete || error != nil { self.cleanup(client); return }
            if client.mode != .closing { self.receive(client) }
        }
    }

    private func onBytes(_ client: ClientConnection) {
        switch client.mode {
        case .handshaking: tryHandshake(client)
        case .websocket: drainFrames(client)
        case .closing: break
        }
    }

    // MARK: HTTP head → REST or upgrade

    private func tryHandshake(_ client: ClientConnection) {
        guard let (req, headEnd) = HTTPParse.parseHead(client.inBuffer) else { return }   // wait for more
        if req.isWebSocketUpgrade && req.path == "/stream" {
            client.inBuffer.removeAll()
            upgrade(client, req)
            return
        }
        // REST: ensure the body is fully buffered before handling.
        let needed = headEnd + req.contentLength
        guard client.inBuffer.count >= needed else { return }
        let body = Array(client.inBuffer[headEnd..<needed])
        client.inBuffer.removeAll()
        handleREST(client, req, body: body)
    }

    private func upgrade(_ client: ClientConnection, _ req: HTTPRequest) {
        guard let key = req.secWebSocketKey else {
            respondAndClose(client, HTTPResponse.text(status: 400, "Bad Request", "missing Sec-WebSocket-Key"))
            return
        }
        // Complete the handshake first — the protocol's close codes (4401/4402) are only
        // expressible *after* upgrade (a pre-upgrade 401 would surface to the browser as 1006).
        rawSend(client, HTTPResponse.switchingProtocols(acceptKey: WebSocket.acceptKey(for: key)))
        client.mode = .websocket

        switch RemoteViewAuth.authorizeUpgrade(origin: req.origin, token: req.query["token"],
                                               allowedOrigins: allowedOrigins, key: signingKey) {
        case .ok(let username):
            client.username = username
            client.pendingSession = req.query["session"]
        case .rejected(let code, let errorCode, let reason):
            sendMessage(client, .error(code: errorCode, message: reason, fatal: true))
            close(client, code: UInt16(code), reason: reason)
        }
    }

    // MARK: REST

    private func handleREST(_ client: ClientConnection, _ req: HTTPRequest, body: [UInt8]) {
        switch (req.method, req.path) {
        case ("GET", "/health"):
            respondAndClose(client, HTTPResponse.json(status: 200, "OK", [
                "ok": true,
                "daemonVersion": Registry.daemonVersion,
                "protocolVersion": WireProtocol.version,
                "permissions": [
                    "screenRecording": Permissions.screenRecording().rawValue,
                    "accessibility": Permissions.accessibility().rawValue,
                ],
            ]))
        case ("GET", "/windows"):
            let w = frameSource.window
            respondAndClose(client, HTTPResponse.json(status: 200, "OK", [
                "windows": [[
                    "id": w.id, "app": w.app, "title": w.title,
                    "pixelWidth": w.pixelWidth, "pixelHeight": w.pixelHeight, "scale": w.scale,
                ]],
            ]))
        case ("GET", "/sessions"):
            let summaries = sessions.all.map { s -> [String: Any] in
                let w = frameSource.window
                return ["sessionId": s.id, "windowId": s.windowId, "app": w.app, "title": w.title, "state": s.state.rawValue]
            }
            respondAndClose(client, HTTPResponse.json(status: 200, "OK", ["sessions": summaries]))
        case ("POST", "/sessions"):
            let obj = (try? JSONSerialization.jsonObject(with: Data(body))) as? [String: Any]
            let windowId = (obj?["windowId"] as? Int) ?? frameSource.window.id
            let sessionId = (obj?["sessionId"] as? String) ?? newSessionId(forWindow: windowId)
            let s = sessions.create(sessionId: sessionId, windowId: windowId, now: nowSeconds())
            let w = frameSource.window
            respondAndClose(client, HTTPResponse.json(status: 200, "OK", [
                "sessionId": s.id, "windowId": s.windowId, "app": w.app, "title": w.title, "state": s.state.rawValue,
            ]))
        case ("DELETE", let p) where p.hasPrefix("/sessions/"):
            let sid = String(p.dropFirst("/sessions/".count))
            sessions.close(sessionId: sid, now: nowSeconds())
            respondAndClose(client, HTTPResponse.json(status: 200, "OK", ["ok": true]))
        case ("POST", "/shutdown"):
            // JWT-gated graceful shutdown (Phase 6 version-mismatch respawn reaches this).
            guard case .success = RemoteViewAuth.verifyJWT(req.query["token"] ?? "", key: signingKey) else {
                respondAndClose(client, HTTPResponse.json(status: 401, "Unauthorized", ["error": "E_AUTH"]))
                return
            }
            respondAndClose(client, HTTPResponse.json(status: 200, "OK", ["ok": true]))
            onShutdownRequest?()
        default:
            respondAndClose(client, HTTPResponse.json(status: 404, "Not Found", ["error": "not found"]))
        }
    }

    /// Stable per-window session id (HTTP attach is idempotent-per-window, dossier addenda).
    private func newSessionId(forWindow windowId: Int) -> String {
        if let existing = sessions.all.first(where: { $0.windowId == windowId && $0.state != .closed }) {
            return existing.id
        }
        nextViewerSeq += 1
        return "sess-\(windowId)-\(nextViewerSeq)"
    }

    // MARK: WebSocket frames

    private func drainFrames(_ client: ClientConnection) {
        let (frames, consumed) = WebSocket.parse(client.inBuffer)
        if consumed > 0 { client.inBuffer.removeFirst(consumed) }
        for frame in frames { handleFrame(client, frame) }
    }

    private func handleFrame(_ client: ClientConnection, _ frame: WebSocket.Frame) {
        switch frame.opcode {
        case .text, .continuation, .binary:
            // Reassemble fragments; control messages are text, video upload is unused.
            if frame.rawOpcode != WebSocket.Opcode.continuation.rawValue { client.fragOpcode = frame.rawOpcode }
            client.fragPayload.append(contentsOf: frame.payload)
            if frame.fin {
                let opcode = client.fragOpcode
                let payload = client.fragPayload
                client.fragOpcode = nil; client.fragPayload = []
                if opcode == WebSocket.Opcode.text.rawValue { handleText(client, payload) }
                // binary client→daemon frames are ignored (control is text-only)
            }
        case .ping:
            rawSend(client, WebSocket.encode(opcode: .pong, payload: frame.payload))
        case .pong:
            if let sid = client.sessionId, let v = client.viewerId, sessions.session(sid)?.viewer == v {
                sessions.recordHeartbeat(v, now: nowSeconds())
            }
        case .close:
            handleViewerClose(client)
            close(client, code: WebSocket.Close.normal, reason: "")
        case .none:
            break
        }
    }

    private func handleText(_ client: ClientConnection, _ payload: [UInt8]) {
        guard let msg = ClientMessage.parse(Data(payload)) else { return }   // unknown/garbage → ignore (fwd-compat)
        switch msg {
        case let .hello(v, session):
            handleHello(client, version: v, session: session)
        case let .input(events):
            onInput?(events)
        case .requestKeyframe:
            client.needsKeyframe = true
            frameSource.requestKeyframe()
        case .pause:
            client.paused = true
            frameSource.pause()
        case .resume:
            client.paused = false
            client.needsKeyframe = true
            frameSource.resume()
        case .clientStats:
            break   // decode + ignore (must not throw)
        case let .ping(sentAt):
            sendMessage(client, .pong(sentAt: sentAt, daemonAt: nowMillis()))
            if let v = client.viewerId { sessions.recordHeartbeat(v, now: nowSeconds()) }
        case .detach:
            if let sid = client.sessionId { sessions.close(sessionId: sid, now: nowSeconds()) }
            if currentStreamSession == client.sessionId { currentStreamSession = nil }
            sendMessage(client, .bye(reason: .detached))
            close(client, code: WebSocket.Close.normal, reason: "detached")
        }
    }

    private func handleHello(_ client: ClientConnection, version: Int, session sessionId: String) {
        guard version == WireProtocol.version else {
            sendMessage(client, .error(code: .eVersion, message: "unsupported protocol version \(version)", fatal: true))
            close(client, code: WebSocket.Close.normal, reason: "version")
            return
        }
        // Auto-create an unknown session (matches fake-streamd's `existing ?? new`); a *closed*
        // session is terminal and `attach` rejects it (R6 → E_SESSION_UNKNOWN + 4404).
        if sessions.session(sessionId) == nil {
            sessions.create(sessionId: sessionId, windowId: frameSource.window.id, now: nowSeconds())
        }
        let viewer = nextViewerId()
        switch sessions.attach(sessionId: sessionId, viewer: viewer, now: nowSeconds()) {
        case .unknownSession:
            sendMessage(client, .error(code: .eSessionUnknown, message: "session closed", fatal: true))
            close(client, code: WebSocket.Close.sessionUnknown, reason: "session-unknown")
        case let .attached(displaced):
            if let displaced, let prior = connByViewer[displaced] {
                sendMessage(prior, .displaced)
                close(prior, code: WebSocket.Close.displaced, reason: "displaced")
            }
            client.sessionId = sessionId
            client.viewerId = viewer
            client.needsKeyframe = true
            client.paused = false
            connByViewer[viewer] = client
            currentStreamSession = sessionId

            sendMessage(client, .helloOk(v: WireProtocol.version, session: sessionId, window: frameSource.window))
            if let cfg = latestConfig { sendMessage(client, .videoConfig(codec: cfg.codec, description: cfg.description, width: cfg.width, height: cfg.height, fps: cfg.fps)) }
            frameSource.requestKeyframe()   // next emitted frame is the seq-0 keyframe
        }
    }

    private func handleViewerClose(_ client: ClientConnection) {
        guard let v = client.viewerId else { return }
        sessions.viewerClosed(v, now: nowSeconds())
        if let sid = client.sessionId, currentStreamSession == sid, sessions.session(sid)?.viewer == nil {
            currentStreamSession = nil
        }
    }

    // MARK: frame source → viewer

    private func onSourceEvent(_ event: FrameSourceEvent) {
        switch event {
        case let .config(cfg):
            latestConfig = cfg
            if let c = currentViewerConn() {
                sendMessage(c, .videoConfig(codec: cfg.codec, description: cfg.description, width: cfg.width, height: cfg.height, fps: cfg.fps))
                frameSource.requestKeyframe()
            }
        case let .frame(frame):
            forward(frame)
        case let .windowState(state, pw, ph):
            if let c = currentViewerConn() { sendMessage(c, .windowState(state: state, pixelWidth: pw, pixelHeight: ph)) }
        case .windowGone:
            if let c = currentViewerConn() {
                sendMessage(c, .windowState(state: .gone, pixelWidth: nil, pixelHeight: nil))
                sendMessage(c, .error(code: .eWindowGone, message: "window destroyed", fatal: true))
                sendMessage(c, .bye(reason: .windowGone))
                close(c, code: WebSocket.Close.normal, reason: "window-gone")
            }
            if let sid = currentStreamSession { sessions.close(sessionId: sid, now: nowSeconds()); currentStreamSession = nil }
        }
    }

    private func forward(_ frame: VideoFrame) {
        guard let sid = currentStreamSession, let s = sessions.session(sid), s.state == .streaming,
              let client = currentViewerConn(), !client.paused else { return }
        // First frame after attach must be the keyframe; drop deltas until then.
        if client.needsKeyframe && !frame.isKeyframe { return }
        // Backpressure: drop deltas while the socket is congested; force a keyframe on drain.
        if client.bufferedBytes > backpressureLimit && !frame.isKeyframe {
            client.droppedFrames += 1
            client.needsKeyframeOnDrain = true
            _ = sessions.takeSequence(sessionId: sid)   // advance sequence → observable gap
            return
        }
        guard let seq = sessions.takeSequence(sessionId: sid) else { return }
        if frame.isKeyframe { client.needsKeyframe = false }
        let header = BinaryFrame.Header.video(sequence: seq, keyframe: frame.isKeyframe,
                                              captureTimestampMicros: frame.captureTimestampMicros)
        let bytes = BinaryFrame.encodeFrame(header, payload: frame.avcc)
        rawSend(client, WebSocket.binary(bytes), accounting: client)
        client.framesSentWindow += 1
        client.bytesSentWindow += bytes.count
    }

    private func currentViewerConn() -> ClientConnection? {
        guard let sid = currentStreamSession, let v = sessions.session(sid)?.viewer else { return nil }
        return connByViewer[v]
    }

    // MARK: stats + sweep timers

    private func startStatsTimer() {
        let t = DispatchSource.makeTimerSource(queue: queue)
        t.schedule(deadline: .now() + 1, repeating: 1.0)
        t.setEventHandler { [weak self] in self?.emitStats() }
        statsTimer = t; t.resume()
    }

    private func emitStats() {
        guard let c = currentViewerConn() else { return }
        let fps = Double(c.framesSentWindow)
        let bitrateKbps = Double(c.bytesSentWindow) * 8.0 / 1000.0
        c.framesSentWindow = 0; c.bytesSentWindow = 0
        sendMessage(c, .stats(captureFps: fps, encodeFps: fps, bitrateKbps: bitrateKbps,
                              droppedFrames: Double(c.droppedFrames), bufferedAmount: Double(c.bufferedBytes)))
    }

    private func startSweepTimer() {
        let t = DispatchSource.makeTimerSource(queue: queue)
        t.schedule(deadline: .now() + 5, repeating: 5.0)
        t.setEventHandler { [weak self] in self?.sweep() }
        sweepTimer = t; t.resume()
    }

    private func sweep() {
        for effect in sessions.sweep(now: nowSeconds()) {
            switch effect {
            case let .heartbeatTimeout(sid, viewer):
                if let c = connByViewer[viewer] { close(c, code: WebSocket.Close.unexpected, reason: "heartbeat-timeout") }
                if currentStreamSession == sid { currentStreamSession = nil }
            case .graceExpired:
                break   // session GC'd to closed; nothing to send (no viewer)
            }
        }
    }

    // MARK: send + close plumbing

    private func sendMessage(_ client: ClientConnection, _ msg: ServerMessage) {
        guard let data = try? msg.encoded() else { return }
        rawSend(client, WebSocket.encode(opcode: .text, payload: Array(data)))
    }

    private func rawSend(_ client: ClientConnection, _ bytes: [UInt8], accounting: ClientConnection? = nil) {
        if let acct = accounting { acct.bufferedBytes += bytes.count }
        client.conn.send(content: Data(bytes), completion: .contentProcessed { [weak self] _ in
            guard let self, let acct = accounting else { return }
            self.queue.async {
                acct.bufferedBytes = max(0, acct.bufferedBytes - bytes.count)
                if acct.bufferedBytes <= self.backpressureLimit / 2 && acct.needsKeyframeOnDrain {
                    acct.needsKeyframeOnDrain = false
                    self.frameSource.requestKeyframe()
                }
            }
        })
    }

    private func respondAndClose(_ client: ClientConnection, _ bytes: [UInt8]) {
        client.mode = .closing
        client.conn.send(content: Data(bytes), completion: .contentProcessed { [weak self] _ in
            self?.queue.async { client.conn.cancel() }
        })
    }

    private func close(_ client: ClientConnection, code: UInt16, reason: String) {
        client.mode = .closing
        client.conn.send(content: Data(WebSocket.close(code: code, reason: reason)), completion: .contentProcessed { [weak self] _ in
            self?.queue.async { client.conn.cancel() }
        })
    }

    private func cleanup(_ client: ClientConnection) {
        if client.mode != .closing { handleViewerClose(client) }
        if let v = client.viewerId, connByViewer[v] === client { connByViewer[v] = nil }
        connections[ObjectIdentifier(client)] = nil
    }

    // MARK: time + ids

    private func nowSeconds() -> TimeInterval { Date().timeIntervalSince1970 }
    private func nowMillis() -> Double { Date().timeIntervalSince1970 * 1000.0 }
    private func nextViewerId() -> String { nextViewerSeq += 1; return "viewer-\(nextViewerSeq)" }
}

/// Per-connection mutable state (touched only on `WSServer.queue`).
final class ClientConnection {
    enum Mode { case handshaking, websocket, closing }
    let conn: NWConnection
    var mode: Mode = .handshaking
    var inBuffer: [UInt8] = []
    var fragOpcode: UInt8?
    var fragPayload: [UInt8] = []
    var pendingSession: String?
    var sessionId: String?
    var viewerId: String?
    var username: String?
    var needsKeyframe = false
    var needsKeyframeOnDrain = false
    var paused = false
    var bufferedBytes = 0
    var droppedFrames = 0
    var framesSentWindow = 0
    var bytesSentWindow = 0
    init(conn: NWConnection) { self.conn = conn }
}
