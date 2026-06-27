import XCTest
@testable import streamd

/// Test: Plan 088 Phase 5 T004 — `--list-windows` catalog mapping / filter / encode.
/// Determinism: pure value math + Codable JSON — no `SCShareableContent`, no display, no TCC,
/// no clock (so it runs in `swift test` without Screen-Recording permission).
/// Oracle: `WindowDescriptor` field math (pixel = points × scale, rounded) and the wire JSON
/// shape the web `/windows` route parses with the Zod `WindowDescriptorSchema`.
final class WindowListTests: XCTestCase {

    // MARK: mapping — points → pixels via the display scale

    func testDescriptorMapsPointsToPixelsViaScale() {
        // 400×328 pt @2x → 800×656 px — matches FAKE_WINDOW so the picker and the live stream agree.
        let d = WindowList.descriptor(windowID: 34202, app: "Godot", title: "spike-target",
                                      frame: CGRect(x: 0, y: 0, width: 400, height: 328), scale: 2)
        XCTAssertEqual(d.id, 34202)
        XCTAssertEqual(d.app, "Godot")
        XCTAssertEqual(d.title, "spike-target")
        XCTAssertEqual(d.pixelWidth, 800)
        XCTAssertEqual(d.pixelHeight, 656)
        XCTAssertEqual(d.scale, 2)
    }

    func testDescriptorRoundsFractionalPixelsAndDefaultsNilStrings() {
        // Fractional pixels round (never truncate); nil app/title collapse to "".
        let d = WindowList.descriptor(windowID: 7, app: nil, title: nil,
                                      frame: CGRect(x: 0, y: 0, width: 101, height: 100), scale: 1.5)
        XCTAssertEqual(d.app, "")
        XCTAssertEqual(d.title, "")
        XCTAssertEqual(d.pixelWidth, 152)   // 101 × 1.5 = 151.5 → 152 (would truncate to 151)
        XCTAssertEqual(d.pixelHeight, 150)
    }

    // MARK: filter — only windows a human would pick

    func testIsPickableDropsOffscreenUnnamedDegenerateAndNonNormalLayer() {
        let f = CGRect(x: 0, y: 0, width: 100, height: 100)
        XCTAssertTrue(WindowList.isPickable(app: "Godot", title: "t", frame: f, isOnScreen: true, layer: 0))
        XCTAssertFalse(WindowList.isPickable(app: "Godot", title: "t", frame: f, isOnScreen: false, layer: 0)) // off-screen
        XCTAssertFalse(WindowList.isPickable(app: nil, title: "t", frame: f, isOnScreen: true, layer: 0))      // no app
        XCTAssertFalse(WindowList.isPickable(app: "", title: "t", frame: f, isOnScreen: true, layer: 0))       // empty app
        XCTAssertFalse(WindowList.isPickable(app: "Godot", title: "t",
                                             frame: CGRect(x: 0, y: 0, width: 0, height: 100),
                                             isOnScreen: true, layer: 0))                                      // degenerate
        // The defect the live smoke caught: menubar extras / Control-Centre items arrive on-screen
        // with a named app at a non-normal CGWindowLevel. Layer != 0 must drop them.
        XCTAssertFalse(WindowList.isPickable(app: "Control Centre", title: "com.apple.Spotlight",
                                             frame: CGRect(x: 0, y: 0, width: 64, height: 60),
                                             isOnScreen: true, layer: 25))                                     // menubar layer
    }

    // MARK: encode — stable JSON the web /windows route parses into WindowDescriptor[]

    func testEncodeIsStableJSONArrayTheRouteCanParse() throws {
        let windows = [
            WindowList.descriptor(windowID: 1, app: "Godot", title: "game",
                                  frame: CGRect(x: 0, y: 0, width: 400, height: 300), scale: 2),
            WindowList.descriptor(windowID: 2, app: "Simulator", title: "iPhone 15",
                                  frame: CGRect(x: 0, y: 0, width: 390, height: 844), scale: 3),
        ]
        let json = try WindowList.encode(windows)

        // Integer fields serialize exactly (sortedKeys, compact) — the picker's required shape.
        XCTAssertTrue(json.contains("\"app\":\"Godot\""), json)
        XCTAssertTrue(json.contains("\"pixelWidth\":800"), json)
        XCTAssertTrue(json.contains("\"id\":2"), json)

        // Round-trips through the SAME Codable the wire uses → the route's parse is sound.
        let decoded = try JSONDecoder().decode([WindowDescriptor].self, from: Data(json.utf8))
        XCTAssertEqual(decoded.count, 2)
        XCTAssertEqual(decoded[0].pixelWidth, 800)
        XCTAssertEqual(decoded[1].app, "Simulator")
        XCTAssertEqual(decoded[1].pixelHeight, 2532) // 844 × 3
    }

    func testEncodeEmptyCatalogIsAnEmptyJSONArray() throws {
        XCTAssertEqual(try WindowList.encode([]), "[]")
    }
}
