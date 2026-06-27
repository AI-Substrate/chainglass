import XCTest
@testable import streamd

/// Test: Plan 088 multi-target capture — `--list-displays` catalog mapping / encode.
/// Determinism: pure value math + Codable JSON — no `SCShareableContent`, no NSScreen, no TCC
/// (so it runs in `swift test` without Screen-Recording permission). Mirrors `WindowListTests`.
/// Oracle: `DisplayDescriptor` field math (pixel = points × scale, rounded) and the wire JSON
/// shape the web `/displays` route parses with the Zod `DisplayDescriptorSchema`.
final class DisplayListTests: XCTestCase {

    // MARK: mapping — points → pixels via the backing scale

    func testDescriptorMapsPointsToPixelsViaScale() {
        // 1512×982 pt @2x → 3024×1964 px (a built-in Retina display at native scale).
        let d = DisplayList.descriptor(displayID: 1, label: "Built-in Retina Display",
                                       widthPoints: 1512, heightPoints: 982, scale: 2, isPrimary: true)
        XCTAssertEqual(d.id, 1)
        XCTAssertEqual(d.label, "Built-in Retina Display")
        XCTAssertEqual(d.pixelWidth, 3024)
        XCTAssertEqual(d.pixelHeight, 1964)
        XCTAssertEqual(d.scale, 2)
        XCTAssertTrue(d.isPrimary)
    }

    func testDescriptorRoundsFractionalPixels() {
        // 1.5x external display: fractional pixels round (never truncate).
        let d = DisplayList.descriptor(displayID: 7, label: "DELL U2720Q",
                                       widthPoints: 1707, heightPoints: 960, scale: 1.5, isPrimary: false)
        XCTAssertEqual(d.pixelWidth, 2561)   // 1707 × 1.5 = 2560.5 → 2561 (would truncate to 2560)
        XCTAssertEqual(d.pixelHeight, 1440)
        XCTAssertFalse(d.isPrimary)
    }

    // MARK: encode — stable JSON the web /displays route parses into DisplayDescriptor[]

    func testEncodeIsStableJSONArrayTheRouteCanParse() throws {
        let displays = [
            DisplayList.descriptor(displayID: 1, label: "Built-in Retina Display",
                                   widthPoints: 1512, heightPoints: 982, scale: 2, isPrimary: true),
            DisplayList.descriptor(displayID: 2, label: "DELL U2720Q",
                                   widthPoints: 3840, heightPoints: 2160, scale: 1, isPrimary: false),
        ]
        let json = try DisplayList.encode(displays)

        XCTAssertTrue(json.contains("\"label\":\"DELL U2720Q\""), json)
        XCTAssertTrue(json.contains("\"pixelWidth\":3024"), json)
        XCTAssertTrue(json.contains("\"isPrimary\":true"), json)

        // Round-trips through the SAME Codable the wire uses → the route's parse is sound.
        let decoded = try JSONDecoder().decode([DisplayDescriptor].self, from: Data(json.utf8))
        XCTAssertEqual(decoded.count, 2)
        XCTAssertEqual(decoded[0].pixelWidth, 3024)
        XCTAssertEqual(decoded[1].label, "DELL U2720Q")
        XCTAssertEqual(decoded[1].pixelWidth, 3840) // 3840 × 1
    }

    func testEncodeEmptyCatalogIsAnEmptyJSONArray() throws {
        XCTAssertEqual(try DisplayList.encode([]), "[]")
    }
}
