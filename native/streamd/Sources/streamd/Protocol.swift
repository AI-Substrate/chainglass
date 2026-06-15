import Foundation

/// Remote-view WS wire protocol — control messages (Workshop 003).
///
/// Swift `Codable` mirror of `protocol/messages.ts`. Text frames carry JSON control
/// messages (this file); binary frames carry video only (`BinaryFrame`). Client and
/// server messages are each a discriminated union on `t`; input events discriminate
/// on `k`. The canonical fixture set (`fixtures/messages.json`) is the cross-language
/// drift guard — both the TS suite and `swift test` round-trip the same objects.
///
/// Forward-compat (Workshop 003): receivers MUST ignore unknown `t` — the `parse`
/// helpers return `nil`, never throw. The protocol evolves additively before v2.
///
/// Dossier T002 (Plan 088 Phase 4).
enum WireProtocol {
    /// Protocol major version, exchanged in hello / hello-ok.
    static let version = 1
}

// MARK: - Shared shapes

/// Keyboard modifier flags (DOM `KeyboardEvent` modifier state).
struct Mods: Codable, Equatable {
    var shift: Bool
    var ctrl: Bool
    var alt: Bool
    var meta: Bool
}

/// Mouse button index: 0 = left, 1 = middle, 2 = right.
enum MouseButton: Int, Codable, Equatable {
    case left = 0
    case middle = 1
    case right = 2
}

/// Window descriptor carried in `hello-ok`.
struct WindowDescriptor: Codable, Equatable {
    var id: Int
    var app: String
    var title: String
    var pixelWidth: Int
    var pixelHeight: Int
    var scale: Double
}

/// Protocol error codes (Workshop 003 §Error codes). Stable strings agents switch on.
enum ErrorCode: String, Codable, Equatable, CaseIterable {
    case eAuth = "E_AUTH"
    case eOrigin = "E_ORIGIN"
    case eVersion = "E_VERSION"
    case eSessionUnknown = "E_SESSION_UNKNOWN"
    case eWindowGone = "E_WINDOW_GONE"
    case ePermission = "E_PERMISSION"
    case eInternal = "E_INTERNAL"
}

/// Window-state transitions the daemon broadcasts.
enum WindowStateName: String, Codable, Equatable, CaseIterable {
    case minimized, restored, resized, moved, gone
}

/// `bye` reasons.
enum ByeReason: String, Codable, Equatable, CaseIterable {
    case detached
    case windowGone = "window-gone"
    case shutdown
}

// MARK: - Input events (discriminated on `k`)

/// One input event. Coordinates `x`,`y` are normalized `[0,1]` of the video frame —
/// the client never knows window points; the daemon owns the mapping (T007). Bounds
/// are enforced at decode so field-name compatibility is not mistaken for contract
/// compatibility (parity with the TS `NormalizedCoordinateSchema`).
enum InputEvent: Equatable {
    case mousemove(x: Double, y: Double)
    case mousedown(x: Double, y: Double, button: MouseButton)
    case mouseup(x: Double, y: Double, button: MouseButton)
    case wheel(x: Double, y: Double, dx: Double, dy: Double)
    case keydown(code: String, modifiers: Mods)
    case keyup(code: String, modifiers: Mods)
    case text(String)
}

extension InputEvent: Codable {
    private enum CodingKeys: String, CodingKey {
        case k, x, y, button, dx, dy, code, modifiers, text
    }

    private static func coord(_ c: KeyedDecodingContainer<CodingKeys>, _ key: CodingKeys) throws -> Double {
        let v = try c.decode(Double.self, forKey: key)
        guard (0.0...1.0).contains(v) else {
            throw DecodingError.dataCorruptedError(
                forKey: key, in: c,
                debugDescription: "normalized coordinate out of [0,1]: \(v)")
        }
        return v
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let k = try c.decode(String.self, forKey: .k)
        switch k {
        case "mousemove":
            self = .mousemove(x: try Self.coord(c, .x), y: try Self.coord(c, .y))
        case "mousedown":
            self = .mousedown(x: try Self.coord(c, .x), y: try Self.coord(c, .y),
                              button: try c.decode(MouseButton.self, forKey: .button))
        case "mouseup":
            self = .mouseup(x: try Self.coord(c, .x), y: try Self.coord(c, .y),
                            button: try c.decode(MouseButton.self, forKey: .button))
        case "wheel":
            self = .wheel(x: try Self.coord(c, .x), y: try Self.coord(c, .y),
                          dx: try c.decode(Double.self, forKey: .dx),
                          dy: try c.decode(Double.self, forKey: .dy))
        case "keydown":
            self = .keydown(code: try c.decode(String.self, forKey: .code),
                            modifiers: try c.decode(Mods.self, forKey: .modifiers))
        case "keyup":
            self = .keyup(code: try c.decode(String.self, forKey: .code),
                          modifiers: try c.decode(Mods.self, forKey: .modifiers))
        case "text":
            self = .text(try c.decode(String.self, forKey: .text))
        default:
            throw DecodingError.dataCorruptedError(
                forKey: .k, in: c, debugDescription: "unknown input event kind: \(k)")
        }
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        switch self {
        case let .mousemove(x, y):
            try c.encode("mousemove", forKey: .k); try c.encode(x, forKey: .x); try c.encode(y, forKey: .y)
        case let .mousedown(x, y, button):
            try c.encode("mousedown", forKey: .k); try c.encode(x, forKey: .x); try c.encode(y, forKey: .y)
            try c.encode(button, forKey: .button)
        case let .mouseup(x, y, button):
            try c.encode("mouseup", forKey: .k); try c.encode(x, forKey: .x); try c.encode(y, forKey: .y)
            try c.encode(button, forKey: .button)
        case let .wheel(x, y, dx, dy):
            try c.encode("wheel", forKey: .k); try c.encode(x, forKey: .x); try c.encode(y, forKey: .y)
            try c.encode(dx, forKey: .dx); try c.encode(dy, forKey: .dy)
        case let .keydown(code, modifiers):
            try c.encode("keydown", forKey: .k); try c.encode(code, forKey: .code)
            try c.encode(modifiers, forKey: .modifiers)
        case let .keyup(code, modifiers):
            try c.encode("keyup", forKey: .k); try c.encode(code, forKey: .code)
            try c.encode(modifiers, forKey: .modifiers)
        case let .text(text):
            try c.encode("text", forKey: .k); try c.encode(text, forKey: .text)
        }
    }
}

// MARK: - Client → daemon

enum ClientMessage: Equatable {
    case hello(v: Int, session: String)
    case input(events: [InputEvent])
    case requestKeyframe
    case pause
    case resume
    case clientStats(decodeFps: Double, queueDepth: Double, e2eLatencyMs: Double?)
    case ping(sentAt: Double)
    case detach
}

extension ClientMessage: Codable {
    private enum CodingKeys: String, CodingKey {
        case t, v, session, events, decodeFps, queueDepth, e2eLatencyMs, sentAt
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let t = try c.decode(String.self, forKey: .t)
        switch t {
        case "hello":
            self = .hello(v: try c.decode(Int.self, forKey: .v),
                          session: try c.decode(String.self, forKey: .session))
        case "input":
            self = .input(events: try c.decode([InputEvent].self, forKey: .events))
        case "request-keyframe":
            self = .requestKeyframe
        case "pause":
            self = .pause
        case "resume":
            self = .resume
        case "client-stats":
            self = .clientStats(decodeFps: try c.decode(Double.self, forKey: .decodeFps),
                                queueDepth: try c.decode(Double.self, forKey: .queueDepth),
                                e2eLatencyMs: try c.decodeIfPresent(Double.self, forKey: .e2eLatencyMs))
        case "ping":
            self = .ping(sentAt: try c.decode(Double.self, forKey: .sentAt))
        case "detach":
            self = .detach
        default:
            throw DecodingError.dataCorruptedError(
                forKey: .t, in: c, debugDescription: "unknown client message t: \(t)")
        }
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        switch self {
        case let .hello(v, session):
            try c.encode("hello", forKey: .t); try c.encode(v, forKey: .v); try c.encode(session, forKey: .session)
        case let .input(events):
            try c.encode("input", forKey: .t); try c.encode(events, forKey: .events)
        case .requestKeyframe:
            try c.encode("request-keyframe", forKey: .t)
        case .pause:
            try c.encode("pause", forKey: .t)
        case .resume:
            try c.encode("resume", forKey: .t)
        case let .clientStats(decodeFps, queueDepth, e2eLatencyMs):
            try c.encode("client-stats", forKey: .t)
            try c.encode(decodeFps, forKey: .decodeFps)
            try c.encode(queueDepth, forKey: .queueDepth)
            if let v = e2eLatencyMs { try c.encode(v, forKey: .e2eLatencyMs) }
            else { try c.encodeNil(forKey: .e2eLatencyMs) }
        case let .ping(sentAt):
            try c.encode("ping", forKey: .t); try c.encode(sentAt, forKey: .sentAt)
        case .detach:
            try c.encode("detach", forKey: .t)
        }
    }

    /// Parse a browser→daemon message. Returns `nil` for invalid JSON or an unknown
    /// `t` (forward-compat: ignore, never throw).
    static func parse(_ data: Data) -> ClientMessage? {
        try? JSONDecoder().decode(ClientMessage.self, from: data)
    }

    static func parse(_ json: String) -> ClientMessage? {
        guard let data = json.data(using: .utf8) else { return nil }
        return parse(data)
    }

    func encoded() throws -> Data { try JSONEncoder().encode(self) }
}

// MARK: - Daemon → browser

enum ServerMessage: Equatable {
    case helloOk(v: Int, session: String, window: WindowDescriptor)
    case videoConfig(codec: String, description: String, width: Int, height: Int, fps: Double)
    case windowState(state: WindowStateName, pixelWidth: Int?, pixelHeight: Int?)
    case displaced
    case stats(captureFps: Double, encodeFps: Double, bitrateKbps: Double,
               droppedFrames: Double, bufferedAmount: Double)
    case pong(sentAt: Double, daemonAt: Double)
    case error(code: ErrorCode, message: String, fatal: Bool)
    case bye(reason: ByeReason)
}

extension ServerMessage: Codable {
    private enum CodingKeys: String, CodingKey {
        case t, v, session, window, codec, description, width, height, fps
        case state, pixelWidth, pixelHeight
        case captureFps, encodeFps, bitrateKbps, droppedFrames, bufferedAmount
        case sentAt, daemonAt, code, message, fatal, reason
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let t = try c.decode(String.self, forKey: .t)
        switch t {
        case "hello-ok":
            self = .helloOk(v: try c.decode(Int.self, forKey: .v),
                            session: try c.decode(String.self, forKey: .session),
                            window: try c.decode(WindowDescriptor.self, forKey: .window))
        case "video-config":
            self = .videoConfig(codec: try c.decode(String.self, forKey: .codec),
                                description: try c.decode(String.self, forKey: .description),
                                width: try c.decode(Int.self, forKey: .width),
                                height: try c.decode(Int.self, forKey: .height),
                                fps: try c.decode(Double.self, forKey: .fps))
        case "window-state":
            self = .windowState(state: try c.decode(WindowStateName.self, forKey: .state),
                                pixelWidth: try c.decodeIfPresent(Int.self, forKey: .pixelWidth),
                                pixelHeight: try c.decodeIfPresent(Int.self, forKey: .pixelHeight))
        case "displaced":
            self = .displaced
        case "stats":
            self = .stats(captureFps: try c.decode(Double.self, forKey: .captureFps),
                          encodeFps: try c.decode(Double.self, forKey: .encodeFps),
                          bitrateKbps: try c.decode(Double.self, forKey: .bitrateKbps),
                          droppedFrames: try c.decode(Double.self, forKey: .droppedFrames),
                          bufferedAmount: try c.decode(Double.self, forKey: .bufferedAmount))
        case "pong":
            self = .pong(sentAt: try c.decode(Double.self, forKey: .sentAt),
                         daemonAt: try c.decode(Double.self, forKey: .daemonAt))
        case "error":
            self = .error(code: try c.decode(ErrorCode.self, forKey: .code),
                          message: try c.decode(String.self, forKey: .message),
                          fatal: try c.decode(Bool.self, forKey: .fatal))
        case "bye":
            self = .bye(reason: try c.decode(ByeReason.self, forKey: .reason))
        default:
            throw DecodingError.dataCorruptedError(
                forKey: .t, in: c, debugDescription: "unknown server message t: \(t)")
        }
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        switch self {
        case let .helloOk(v, session, window):
            try c.encode("hello-ok", forKey: .t); try c.encode(v, forKey: .v)
            try c.encode(session, forKey: .session); try c.encode(window, forKey: .window)
        case let .videoConfig(codec, description, width, height, fps):
            try c.encode("video-config", forKey: .t); try c.encode(codec, forKey: .codec)
            try c.encode(description, forKey: .description); try c.encode(width, forKey: .width)
            try c.encode(height, forKey: .height); try c.encode(fps, forKey: .fps)
        case let .windowState(state, pixelWidth, pixelHeight):
            try c.encode("window-state", forKey: .t); try c.encode(state, forKey: .state)
            try c.encodeIfPresent(pixelWidth, forKey: .pixelWidth)
            try c.encodeIfPresent(pixelHeight, forKey: .pixelHeight)
        case .displaced:
            try c.encode("displaced", forKey: .t)
        case let .stats(captureFps, encodeFps, bitrateKbps, droppedFrames, bufferedAmount):
            try c.encode("stats", forKey: .t); try c.encode(captureFps, forKey: .captureFps)
            try c.encode(encodeFps, forKey: .encodeFps); try c.encode(bitrateKbps, forKey: .bitrateKbps)
            try c.encode(droppedFrames, forKey: .droppedFrames)
            try c.encode(bufferedAmount, forKey: .bufferedAmount)
        case let .pong(sentAt, daemonAt):
            try c.encode("pong", forKey: .t); try c.encode(sentAt, forKey: .sentAt)
            try c.encode(daemonAt, forKey: .daemonAt)
        case let .error(code, message, fatal):
            try c.encode("error", forKey: .t); try c.encode(code, forKey: .code)
            try c.encode(message, forKey: .message); try c.encode(fatal, forKey: .fatal)
        case let .bye(reason):
            try c.encode("bye", forKey: .t); try c.encode(reason, forKey: .reason)
        }
    }

    /// Parse a daemon→browser message. Returns `nil` for invalid JSON or an unknown
    /// `t` (forward-compat: ignore, never throw).
    static func parse(_ data: Data) -> ServerMessage? {
        try? JSONDecoder().decode(ServerMessage.self, from: data)
    }

    static func parse(_ json: String) -> ServerMessage? {
        guard let data = json.data(using: .utf8) else { return nil }
        return parse(data)
    }

    func encoded() throws -> Data { try JSONEncoder().encode(self) }
}
