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

    /// Largest client→server frame we accept. Inbound frames are small control messages (input /
    /// pause / resume / ping); video flows the other way. A declared 64-bit length above this (or
    /// above `Int.max`) is rejected as a protocol error *before* any `Int` conversion — an unchecked
    /// `Int(len)` could trap, and an honest-but-huge length could buffer unbounded (F003/FT-003).
    static let maxFrameLen = 1 << 20   // 1 MiB

    /// One decode step: the buffer doesn't yet hold a whole frame (`incomplete`), the next frame
    /// declares an illegal/oversized length so the caller must close (`oversize`), or a complete
    /// frame ending at a new offset (`frame`).
    private enum ParseStep { case incomplete; case oversize; case frame(Frame, Int) }

    /// Parse as many whole frames as `buffer` holds; returns the frames, how many bytes were
    /// consumed (the caller keeps the unconsumed tail), and whether an oversized/illegal frame was
    /// seen — in which case the caller drops the connection. An incomplete trailing frame is left
    /// unconsumed. Never throws.
    static func parse(_ buffer: [UInt8]) -> (frames: [Frame], consumed: Int, oversize: Bool) {
        var frames: [Frame] = []
        var offset = 0
        while true {
            switch parseOne(buffer, at: offset) {
            case .incomplete: return (frames, offset, false)
            case .oversize:   return (frames, offset, true)
            case let .frame(frame, next): frames.append(frame); offset = next
            }
        }
    }

    /// Parse a single frame starting at `offset`. `.incomplete` if the buffer doesn't yet hold it
    /// all; `.oversize` if the declared length exceeds `maxFrameLen`/`Int.max` (checked BEFORE the
    /// `Int` conversion so it can never trap).
    private static func parseOne(_ b: [UInt8], at offset: Int) -> ParseStep {
        var i = offset
        guard b.count - i >= 2 else { return .incomplete }
        let b0 = b[i]; let b1 = b[i + 1]; i += 2
        let fin = (b0 & 0x80) != 0
        let opcode = b0 & 0x0f
        let masked = (b1 & 0x80) != 0
        var len = Int(b1 & 0x7f)
        if len == 126 {
            guard b.count - i >= 2 else { return .incomplete }
            len = (Int(b[i]) << 8) | Int(b[i + 1]); i += 2
        } else if len == 127 {
            guard b.count - i >= 8 else { return .incomplete }
            var l: UInt64 = 0
            for k in 0..<8 { l = (l << 8) | UInt64(b[i + k]) }
            i += 8
            guard l <= UInt64(maxFrameLen) else { return .oversize }   // also keeps Int(l) from trapping
            len = Int(l)
        }
        guard len <= maxFrameLen else { return .oversize }
        var maskKey: [UInt8] = []
        if masked {
            guard b.count - i >= 4 else { return .incomplete }
            maskKey = Array(b[i..<i + 4]); i += 4
        }
        guard b.count - i >= len else { return .incomplete }
        var payload = Array(b[i..<i + len]); i += len
        if masked {
            for k in 0..<payload.count { payload[k] ^= maskKey[k % 4] }
        }
        return .frame(Frame(fin: fin, rawOpcode: opcode, payload: payload), i)
    }
}
