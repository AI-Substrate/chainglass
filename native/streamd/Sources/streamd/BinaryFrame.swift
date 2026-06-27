import Foundation

/// Remote-view WS wire protocol — binary video-frame codec (Workshop 003 §Binary).
///
/// Swift mirror of `protocol/binary.ts`. Binary frames carry video only: a fixed
/// 16-byte big-endian header, then one AVCC access unit.
///
///   offset 0  u8   frameType   0x01 = video (others reserved → dropped silently)
///   offset 1  u8   flags       bit0 = keyframe (IDR); bits1–7 reserved (0)
///   offset 2  u16  reserved    0
///   offset 4  u32  sequence    monotonic per session-attach (resets to 0 on attach)
///   offset 8  u64  captureTimestampMicros  daemon monotonic clock at capture
///   offset 16 …    payload     one AVCC access unit
///
/// `fixtures/frame-header.json` is the cross-language drift guard — the bytes this
/// emits must be byte-identical to the TS codec for every fixture row. `u64`
/// timestamps use `UInt64` (the canonical fixture exercises 2^53+1, beyond JS's
/// safe-integer range). Dossier T002 (Plan 088 Phase 4).
enum BinaryFrame {
    static let frameTypeVideo: UInt8 = 0x01
    static let headerBytes = 16
    static let flagKeyframe: UInt8 = 0x01

    struct Header: Equatable {
        var frameType: UInt8
        var keyframe: Bool
        var sequence: UInt32
        var captureTimestampMicros: UInt64

        /// Convenience for the common video case.
        static func video(sequence: UInt32, keyframe: Bool, captureTimestampMicros: UInt64) -> Header {
            Header(frameType: frameTypeVideo, keyframe: keyframe, sequence: sequence,
                   captureTimestampMicros: captureTimestampMicros)
        }
    }

    struct Frame: Equatable {
        var header: Header
        var payload: [UInt8]
    }

    // MARK: encode

    /// Encode the fixed 16-byte big-endian header. Big-endian is written via explicit
    /// shifts so the output is host-endianness-independent.
    static func encodeHeader(_ h: Header) -> [UInt8] {
        var out = [UInt8](repeating: 0, count: headerBytes)
        out[0] = h.frameType
        out[1] = h.keyframe ? flagKeyframe : 0
        // bytes 2–3 reserved = 0
        out[4] = UInt8((h.sequence >> 24) & 0xff)
        out[5] = UInt8((h.sequence >> 16) & 0xff)
        out[6] = UInt8((h.sequence >> 8) & 0xff)
        out[7] = UInt8(h.sequence & 0xff)
        for i in 0..<8 {
            let shift = UInt64(56 - i * 8)
            out[8 + i] = UInt8((h.captureTimestampMicros >> shift) & 0xff)
        }
        return out
    }

    /// Encode header + payload (one AVCC access unit) into a single frame buffer.
    static func encodeFrame(_ h: Header, payload: [UInt8]) -> [UInt8] {
        var out = encodeHeader(h)
        out.append(contentsOf: payload)
        return out
    }

    // MARK: decode

    /// Decode the 16-byte header. Returns `nil` for an unknown frame type (drop
    /// silently per Workshop 003) or a buffer shorter than the header — never throws.
    static func decodeHeader(_ bytes: [UInt8]) -> Header? {
        guard bytes.count >= headerBytes else { return nil }
        let frameType = bytes[0]
        guard frameType == frameTypeVideo else { return nil }
        let flags = bytes[1]
        let sequence =
            (UInt32(bytes[4]) << 24) | (UInt32(bytes[5]) << 16)
            | (UInt32(bytes[6]) << 8) | UInt32(bytes[7])
        var ts: UInt64 = 0
        for i in 0..<8 { ts = (ts << 8) | UInt64(bytes[8 + i]) }
        return Header(frameType: frameType, keyframe: (flags & flagKeyframe) != 0,
                      sequence: sequence, captureTimestampMicros: ts)
    }

    /// Decode header + payload. Returns `nil` for an undecodable header.
    static func decodeFrame(_ bytes: [UInt8]) -> Frame? {
        guard let header = decodeHeader(bytes) else { return nil }
        let payload = bytes.count > headerBytes ? Array(bytes[headerBytes...]) : []
        return Frame(header: header, payload: payload)
    }

    // MARK: hex helpers (cross-language fixture comparison)

    /// Lowercase hex of a byte buffer (matches the fixture's `hex` field).
    static func hex(_ bytes: [UInt8]) -> String {
        var s = ""
        s.reserveCapacity(bytes.count * 2)
        for b in bytes { s += String(format: "%02x", b) }
        return s
    }

    /// Parse a lowercase/uppercase hex string into bytes. `nil` on odd length or non-hex.
    static func bytes(fromHex hexString: String) -> [UInt8]? {
        guard hexString.count % 2 == 0 else { return nil }
        var result = [UInt8]()
        result.reserveCapacity(hexString.count / 2)
        var idx = hexString.startIndex
        while idx < hexString.endIndex {
            let next = hexString.index(idx, offsetBy: 2)
            guard let byte = UInt8(hexString[idx..<next], radix: 16) else { return nil }
            result.append(byte)
            idx = next
        }
        return result
    }
}
