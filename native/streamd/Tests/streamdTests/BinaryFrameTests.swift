import XCTest
@testable import streamd

/// Test: streamd binary frame-header codec vs the canonical fixtures (dossier T002).
/// Behaviour: each frame-header.json row encodes to byte-identical hex and decodes back.
/// Boundary: unknown frame type + short buffers → nil (never throws); u64 2^53+1 preserved.
/// Determinism: reads the SAME repo-root fixture file the TS suite uses (no copy).
/// Oracle: apps/web/.../protocol/fixtures/frame-header.json + protocol/binary.ts.
final class BinaryFrameTests: XCTestCase {

    private struct FrameHeaderFixture: Decodable {
        let version: Int
        let frames: [Row]
        struct Row: Decodable {
            let sequence: UInt32
            let keyframe: Bool
            let captureTimestampMicros: String   // decimal string (u64 exceeds JS safe int)
            let hex: String
        }
    }

    private func loadFixture() throws -> FrameHeaderFixture {
        let url = Fixtures.protocolFixturesDir.appendingPathComponent("frame-header.json")
        return try JSONDecoder().decode(FrameHeaderFixture.self, from: Data(contentsOf: url))
    }

    func testEncodeMatchesFixtureHexByteForByte() throws {
        let fx = try loadFixture()
        XCTAssertEqual(fx.frames.count, 4)
        for row in fx.frames {
            let ts = try XCTUnwrap(UInt64(row.captureTimestampMicros), "bad u64: \(row.captureTimestampMicros)")
            let header = BinaryFrame.Header.video(sequence: row.sequence, keyframe: row.keyframe,
                                                  captureTimestampMicros: ts)
            XCTAssertEqual(BinaryFrame.hex(BinaryFrame.encodeHeader(header)), row.hex,
                           "header bytes differ for seq \(row.sequence)")
        }
    }

    func testDecodeRoundTripsFixtureRows() throws {
        let fx = try loadFixture()
        for row in fx.frames {
            let bytes = try XCTUnwrap(BinaryFrame.bytes(fromHex: row.hex))
            let header = try XCTUnwrap(BinaryFrame.decodeHeader(bytes))
            XCTAssertEqual(header.sequence, row.sequence)
            XCTAssertEqual(header.keyframe, row.keyframe)
            XCTAssertEqual(header.captureTimestampMicros, UInt64(row.captureTimestampMicros))
            XCTAssertEqual(header.frameType, BinaryFrame.frameTypeVideo)
        }
    }

    func testU64BeyondJsSafeIntegerPreserved() {
        // 2^53 + 1 = 9007199254740993 — the row that proves the u64 path.
        let header = BinaryFrame.Header.video(sequence: 1000, keyframe: true,
                                              captureTimestampMicros: 9_007_199_254_740_993)
        let round = BinaryFrame.decodeHeader(BinaryFrame.encodeHeader(header))
        XCTAssertEqual(round?.captureTimestampMicros, 9_007_199_254_740_993)
    }

    func testUnknownFrameTypeDropsSilently() {
        var bytes = [UInt8](repeating: 0, count: 16)
        bytes[0] = 0x02  // unknown frame type → drop silently
        XCTAssertNil(BinaryFrame.decodeHeader(bytes))
    }

    func testShortBufferReturnsNil() {
        XCTAssertNil(BinaryFrame.decodeHeader([UInt8](repeating: 0, count: 15)))
    }

    func testEncodeDecodeFrameWithPayload() throws {
        let header = BinaryFrame.Header.video(sequence: 7, keyframe: false, captureTimestampMicros: 123_456)
        let payload: [UInt8] = [0xde, 0xad, 0xbe, 0xef]
        let frame = try XCTUnwrap(BinaryFrame.decodeFrame(BinaryFrame.encodeFrame(header, payload: payload)))
        XCTAssertEqual(frame.header, header)
        XCTAssertEqual(frame.payload, payload)
    }
}
