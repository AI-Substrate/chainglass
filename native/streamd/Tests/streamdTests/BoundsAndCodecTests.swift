import XCTest
@testable import streamd

/// Test: Phase-4 re-review hardening — wheel-delta saturation (FT-004) and truthful live codec
/// metadata (FT-005).
/// Determinism: pure value math — no CGEvent post, no capture session, no clock.
/// Oracle: `Int32` domain bounds; ISO 14496-15 AVCDecoderConfigurationRecord byte layout.
final class BoundsAndCodecTests: XCTestCase {

    // MARK: FT-004 — unbounded wire wheel delta → safe Int32
    func testWheelClampSaturatesAndRejectsNonFinite() {
        XCTAssertEqual(Input.clampWheel(5), 5)
        XCTAssertEqual(Input.clampWheel(-5), -5)
        XCTAssertEqual(Input.clampWheel(0), 0)
        XCTAssertEqual(Input.clampWheel(1e30), Int32.max)       // would trap a direct Int32(_)
        XCTAssertEqual(Input.clampWheel(-1e30), Int32.min)
        XCTAssertEqual(Input.clampWheel(Double(Int32.max)), Int32.max)
        XCTAssertEqual(Input.clampWheel(Double(Int32.min)), Int32.min)
        XCTAssertEqual(Input.clampWheel(.infinity), 0)          // non-finite → no-op scroll
        XCTAssertEqual(Input.clampWheel(-.infinity), 0)
        XCTAssertEqual(Input.clampWheel(.nan), 0)
    }

    // MARK: FT-005 — codec string derived from the actual avcC, not hardcoded
    func testAvcCodecStringFromRecord() {
        // avcC = [configurationVersion, AVCProfileIndication, profile_compatibility, AVCLevelIndication, …].
        // High@3.2 → 0x64 0x00 0x20 → "avc1.640020".
        let high32 = Data([0x01, 0x64, 0x00, 0x20, 0xFF, 0xE1]).base64EncodedString()
        XCTAssertEqual(CaptureFrameSource.avcCodecString(fromAvcCBase64: high32), "avc1.640020")
        // High@4.0 (level 0x28) must advertise truthfully — not the fixture's High@3.2 string.
        let high40 = Data([0x01, 0x64, 0x00, 0x28]).base64EncodedString()
        XCTAssertEqual(CaptureFrameSource.avcCodecString(fromAvcCBase64: high40), "avc1.640028")
        // Unreadable / too-short record → safe fallback.
        XCTAssertEqual(CaptureFrameSource.avcCodecString(fromAvcCBase64: "AAA="), "avc1.640020")
        XCTAssertEqual(CaptureFrameSource.avcCodecString(fromAvcCBase64: "not base64!!!"), "avc1.640020")
    }
}
