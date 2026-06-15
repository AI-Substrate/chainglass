import Foundation
import CryptoKit

/// RFC 6455 WebSocket framing primitive (dossier T006).
///
/// Hand-rolled because Network.framework's built-in `NWProtocolWebSocket` server cannot
/// expose the upgrade request's path / query / `Origin` header — which the auth gate
/// (T004) needs — nor let us send the protocol's app-defined close codes (4401/4402/4002/
/// 4404) precisely. This file owns only the pure codec (frame encode/decode + the
/// handshake accept-key); the listener/connection lifecycle lives in `WSServer.swift`.
///
/// Server→client frames are unmasked; client→server frames are masked (unmasked here).
/// Pure + deterministic → unit-tested in `WebSocketTests.swift`.
enum WebSocket {
    /// RFC 6455 §1.3 magic GUID for the `Sec-WebSocket-Accept` digest.
    static let acceptGUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"

    /// `Sec-WebSocket-Accept` = base64(SHA1(Sec-WebSocket-Key + GUID)).
    static func acceptKey(for key: String) -> String {
        let digest = Insecure.SHA1.hash(data: Data((key + acceptGUID).utf8))
        return Data(digest).base64EncodedString()
    }

    enum Opcode: UInt8 {
        case continuation = 0x0, text = 0x1, binary = 0x2, close = 0x8, ping = 0x9, pong = 0xA
    }

    /// Standard + app-defined close codes used by the remote-view protocol.
    enum Close {
        static let normal: UInt16 = 1000
        static let unexpected: UInt16 = 1011
        static let displaced: UInt16 = 4002      // R2 latest-attach-wins
        static let auth: UInt16 = 4401           // E_AUTH
        static let origin: UInt16 = 4402         // E_ORIGIN
        static let sessionUnknown: UInt16 = 4404 // E_SESSION_UNKNOWN
    }

    struct Frame: Equatable {
        let fin: Bool
        let rawOpcode: UInt8
        let payload: [UInt8]
        var opcode: Opcode? { Opcode(rawValue: rawOpcode) }
    }

    // MARK: encode (server → client, unmasked)

    static func encode(opcode: Opcode, payload: [UInt8], fin: Bool = true) -> [UInt8] {
        var out = [UInt8]()
        out.append((fin ? 0x80 : 0x00) | opcode.rawValue)
        let len = payload.count
        if len < 126 {
            out.append(UInt8(len))               // mask bit 0 (server frames unmasked)
        } else if len <= 0xFFFF {
            out.append(126)
            out.append(UInt8((len >> 8) & 0xff))
            out.append(UInt8(len & 0xff))
        } else {
            out.append(127)
            for i in (0..<8).reversed() { out.append(UInt8((UInt64(len) >> (UInt64(i) * 8)) & 0xff)) }
        }
        out.append(contentsOf: payload)
        return out
    }

    static func text(_ s: String) -> [UInt8] { encode(opcode: .text, payload: Array(s.utf8)) }
    static func binary(_ bytes: [UInt8]) -> [UInt8] { encode(opcode: .binary, payload: bytes) }

    /// Close frame carrying a 2-byte big-endian code + UTF-8 reason.
    static func close(code: UInt16, reason: String = "") -> [UInt8] {
        var payload: [UInt8] = [UInt8((code >> 8) & 0xff), UInt8(code & 0xff)]
        payload.append(contentsOf: Array(reason.utf8))
        return encode(opcode: .close, payload: payload)
    }

    // MARK: decode (client → server, masked)

    /// Parse as many whole frames as `buffer` holds; returns the frames and how many bytes
    /// were consumed (the caller keeps the unconsumed tail for the next read). An incomplete
    /// trailing frame is left unconsumed (returned in neither). Never throws.
    static func parse(_ buffer: [UInt8]) -> (frames: [Frame], consumed: Int) {
        var frames: [Frame] = []
        var offset = 0
        while true {
            guard let (frame, next) = parseOne(buffer, at: offset) else { break }
            frames.append(frame)
            offset = next
        }
        return (frames, offset)
    }

    /// Parse a single frame starting at `offset`; `nil` if the buffer doesn't yet hold it all.
    private static func parseOne(_ b: [UInt8], at offset: Int) -> (Frame, Int)? {
        var i = offset
        guard b.count - i >= 2 else { return nil }
        let b0 = b[i]; let b1 = b[i + 1]; i += 2
        let fin = (b0 & 0x80) != 0
        let opcode = b0 & 0x0f
        let masked = (b1 & 0x80) != 0
        var len = Int(b1 & 0x7f)
        if len == 126 {
            guard b.count - i >= 2 else { return nil }
            len = (Int(b[i]) << 8) | Int(b[i + 1]); i += 2
        } else if len == 127 {
            guard b.count - i >= 8 else { return nil }
            var l: UInt64 = 0
            for k in 0..<8 { l = (l << 8) | UInt64(b[i + k]) }
            i += 8
            len = Int(l)
        }
        var maskKey: [UInt8] = []
        if masked {
            guard b.count - i >= 4 else { return nil }
            maskKey = Array(b[i..<i + 4]); i += 4
        }
        guard b.count - i >= len else { return nil }
        var payload = Array(b[i..<i + len]); i += len
        if masked {
            for k in 0..<payload.count { payload[k] ^= maskKey[k % 4] }
        }
        return (Frame(fin: fin, rawOpcode: opcode, payload: payload), i)
    }
}
