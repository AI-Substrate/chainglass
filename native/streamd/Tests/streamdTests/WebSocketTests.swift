import XCTest
@testable import streamd

/// Test: RFC 6455 WebSocket framing primitive (dossier T006, automatable half).
/// Behaviour: the `Sec-WebSocket-Accept` digest matches the RFC example; server frames
///   encode unmasked with correct length framing; close frames carry the 2-byte code;
///   masked client frames decode (unmask) and round-trip; multi-frame buffers parse with
///   an incomplete trailing frame left unconsumed.
/// Determinism: pure byte math — no sockets, no daemon, no clock.
/// Oracle: RFC 6455 §1.3 (accept key) + §5.2 (framing).
final class WebSocketTests: XCTestCase {

    func testAcceptKeyMatchesRFCExample() {
        // RFC 6455 §1.3 worked example.
        XCTAssertEqual(WebSocket.acceptKey(for: "dGhlIHNhbXBsZSBub25jZQ=="),
                       "s3pPLMBiTxaQ9kYGzzhZRbK+xOo=")
    }

    func testEncodeSmallTextFrame() {
        // FIN+text (0x81), unmasked len 2, then payload.
        XCTAssertEqual(WebSocket.text("hi"), [0x81, 0x02, 0x68, 0x69])
    }

    func testEncodeMediumPayloadUses16BitLength() {
        let payload = [UInt8](repeating: 0x41, count: 200)
        let frame = WebSocket.binary(payload)
        XCTAssertEqual(frame[0], 0x82)           // FIN + binary
        XCTAssertEqual(frame[1], 126)            // 16-bit length marker
        XCTAssertEqual(Int(frame[2]) << 8 | Int(frame[3]), 200)
        XCTAssertEqual(frame.count, 4 + 200)
    }

    func testCloseFrameCarriesBigEndianCode() {
        // 4401 = 0x1131 → bytes 0x11, 0x31.
        let frame = WebSocket.close(code: WebSocket.Close.auth, reason: "auth")
        XCTAssertEqual(frame[0], 0x88)           // FIN + close
        XCTAssertEqual(frame[2], 0x11)
        XCTAssertEqual(frame[3], 0x31)
        XCTAssertEqual(Array(frame[4...]), Array("auth".utf8))
    }

    func testParseMaskedClientTextRoundTrips() {
        let json = #"{"t":"ping","sentAt":123}"#
        let buffer = maskedTextFrame(json, mask: [0x37, 0xfa, 0x21, 0x3d])
        let (frames, consumed) = WebSocket.parse(buffer)
        XCTAssertEqual(consumed, buffer.count)
        XCTAssertEqual(frames.count, 1)
        XCTAssertEqual(frames[0].opcode, .text)
        XCTAssertTrue(frames[0].fin)
        XCTAssertEqual(String(bytes: frames[0].payload, encoding: .utf8), json)
    }

    func testParseMultipleFramesLeavesIncompleteTailUnconsumed() {
        let a = maskedTextFrame("aa", mask: [1, 2, 3, 4])
        let b = maskedTextFrame("bb", mask: [9, 8, 7, 6])
        let partial = Array(maskedTextFrame("ccc", mask: [5, 5, 5, 5]).prefix(3))   // header only
        let (frames, consumed) = WebSocket.parse(a + b + partial)
        XCTAssertEqual(frames.count, 2)
        XCTAssertEqual(consumed, a.count + b.count)   // partial third frame untouched
        XCTAssertEqual(String(bytes: frames[1].payload, encoding: .utf8), "bb")
    }

    func testParseEmptyBufferConsumesNothing() {
        let (frames, consumed) = WebSocket.parse([])
        XCTAssertTrue(frames.isEmpty)
        XCTAssertEqual(consumed, 0)
    }

    // Build a masked client→server text frame (browsers always mask).
    private func maskedTextFrame(_ s: String, mask: [UInt8]) -> [UInt8] {
        let payload = Array(s.utf8)
        var out: [UInt8] = [0x81, 0x80 | UInt8(payload.count)]   // FIN+text, masked, len<126
        out.append(contentsOf: mask)
        for (i, byte) in payload.enumerated() { out.append(byte ^ mask[i % 4]) }
        return out
    }
}
