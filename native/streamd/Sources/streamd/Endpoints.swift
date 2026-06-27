import Foundation
import CoreGraphics
import ApplicationServices

/// HTTP plumbing + REST endpoint shapes (dossier T006).
///
/// The daemon's control surface (`/health`, `/windows`, `/sessions`, `POST /shutdown`) plus
/// the request/response primitives `WSServer` uses. The REST shapes are pinned here because
/// Phase 5 proxies them verbatim (`/health` version handshake; flat `SessionSummary`).

// MARK: - Request

/// A parsed HTTP request (request line + headers; body is read separately by `WSServer`).
struct HTTPRequest {
    let method: String
    let path: String                  // path without the query string
    let query: [String: String]
    let headers: [String: String]     // header names lowercased

    var origin: String? { headers["origin"] }
    /// Validated body length: absent header → `0`; a malformed or **negative** value → `nil`
    /// (the caller rejects with 400). A negative length previously flowed into a body slice and
    /// could trap the daemon on unauthenticated input (F004).
    var contentLength: Int? {
        guard let raw = headers["content-length"] else { return 0 }
        guard let value = Int(raw), value >= 0 else { return nil }
        return value
    }
    var isWebSocketUpgrade: Bool { (headers["upgrade"]?.lowercased()).map { $0.contains("websocket") } ?? false }
    var secWebSocketKey: String? { headers["sec-websocket-key"] }
}

enum HTTPParse {
    /// Parse the request head from a byte buffer. Returns the request and the index just past
    /// the `\r\n\r\n` header terminator, or `nil` if the head isn't fully buffered yet.
    static func parseHead(_ bytes: [UInt8]) -> (request: HTTPRequest, headerEnd: Int)? {
        let terminator: [UInt8] = [0x0d, 0x0a, 0x0d, 0x0a]   // \r\n\r\n
        guard let end = firstRange(of: terminator, in: bytes) else { return nil }
        let headBytes = Array(bytes[0..<end])
        guard let head = String(bytes: headBytes, encoding: .utf8) else { return nil }
        let lines = head.components(separatedBy: "\r\n")
        guard let requestLine = lines.first else { return nil }
        let parts = requestLine.split(separator: " ")
        guard parts.count >= 2 else { return nil }
        let method = String(parts[0])
        let target = String(parts[1])
        var path = target
        var query: [String: String] = [:]
        if let q = target.firstIndex(of: "?") {
            path = String(target[target.startIndex..<q])
            let qs = String(target[target.index(after: q)...])
            for pair in qs.split(separator: "&") {
                let kv = pair.split(separator: "=", maxSplits: 1, omittingEmptySubsequences: false)
                let key = String(kv[0]).removingPercentEncoding ?? String(kv[0])
                let value = kv.count > 1 ? (String(kv[1]).removingPercentEncoding ?? String(kv[1])) : ""
                query[key] = value
            }
        }
        var headers: [String: String] = [:]
        for line in lines.dropFirst() {
            guard let colon = line.firstIndex(of: ":") else { continue }
            let name = line[line.startIndex..<colon].trimmingCharacters(in: .whitespaces).lowercased()
            let value = line[line.index(after: colon)...].trimmingCharacters(in: .whitespaces)
            headers[name] = value
        }
        return (HTTPRequest(method: method, path: path, query: query, headers: headers), end + terminator.count)
    }

    private static func firstRange(of pattern: [UInt8], in bytes: [UInt8]) -> Int? {
        guard bytes.count >= pattern.count else { return nil }
        for i in 0...(bytes.count - pattern.count) where Array(bytes[i..<i + pattern.count]) == pattern {
            return i
        }
        return nil
    }
}

// MARK: - Response

enum HTTPResponse {
    static func json(status: Int, _ statusText: String, _ object: Any) -> [UInt8] {
        let data = (try? JSONSerialization.data(withJSONObject: object, options: [.sortedKeys])) ?? Data("{}".utf8)
        return raw(status: status, statusText, contentType: "application/json", body: Array(data))
    }

    static func text(status: Int, _ statusText: String, _ body: String) -> [UInt8] {
        raw(status: status, statusText, contentType: "text/plain", body: Array(body.utf8))
    }

    static func raw(status: Int, _ statusText: String, contentType: String, body: [UInt8]) -> [UInt8] {
        var head = "HTTP/1.1 \(status) \(statusText)\r\n"
        head += "Content-Type: \(contentType)\r\n"
        head += "Content-Length: \(body.count)\r\n"
        head += "Connection: close\r\n"
        head += "\r\n"
        return Array(head.utf8) + body
    }

    /// The 101 Switching Protocols upgrade response.
    static func switchingProtocols(acceptKey: String) -> [UInt8] {
        var head = "HTTP/1.1 101 Switching Protocols\r\n"
        head += "Upgrade: websocket\r\n"
        head += "Connection: Upgrade\r\n"
        head += "Sec-WebSocket-Accept: \(acceptKey)\r\n"
        head += "\r\n"
        return Array(head.utf8)
    }
}

// MARK: - REST shapes

/// Flat session projection for `GET /sessions` — the frozen Phase-2 contract shape
/// (`test/contracts/remote-view-service.contract.ts`). Phase 5 renames `port`→`daemonPort`
/// elsewhere, but `state` here is projected straight from the T005 session machine.
struct SessionSummary: Encodable {
    let sessionId: String
    let windowId: Int
    let app: String
    let title: String
    let state: String   // idle | streaming | unwatched | closed
}

// MARK: - Permissions (named grants for /health + E_PERMISSION)

/// TCC grant status, reported precisely by `/health` (AC-14) and used to surface the
/// **named** grant in `error{E_PERMISSION}` over WS. The preflight calls below never prompt.
enum Permissions {
    enum Grant: String { case granted, denied, notDetermined = "not-determined" }

    static func screenRecording() -> Grant {
        CGPreflightScreenCaptureAccess() ? .granted : .notDetermined
    }

    static func accessibility() -> Grant {
        AXIsProcessTrusted() ? .granted : .denied
    }
}
