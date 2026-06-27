import XCTest
import CoreGraphics
@testable import streamd

/// Test: streamd DOM-code → virtual-keycode map (dossier T007, keycode-map unit).
/// Behaviour: representative DOM codes map to the documented Carbon kVK values; the table
///   covers all 26 letters + 10 digits; unmapped codes return nil (→ unicode fallback).
/// Boundary: unknown code → nil; no two distinct DOM codes collide on one keycode
///   (excluding the deliberate Return/Enter alias).
/// Determinism: pure static lookup — no CGEvent, no TCC.
/// Oracle: HIToolbox Events.h (kVK_ANSI_*/kVK_*); DOM KeyboardEvent.code names.
final class KeycodeMapTests: XCTestCase {

    func testRepresentativeMappings() {
        XCTAssertEqual(Input.keyCode(for: "KeyA"), 0x00)
        XCTAssertEqual(Input.keyCode(for: "KeyW"), 0x0D)
        XCTAssertEqual(Input.keyCode(for: "KeyZ"), 0x06)
        XCTAssertEqual(Input.keyCode(for: "Digit1"), 0x12)
        XCTAssertEqual(Input.keyCode(for: "Digit0"), 0x1D)
        XCTAssertEqual(Input.keyCode(for: "Enter"), 0x24)
        XCTAssertEqual(Input.keyCode(for: "Return"), 0x24)   // alias
        XCTAssertEqual(Input.keyCode(for: "Space"), 0x31)
        XCTAssertEqual(Input.keyCode(for: "Tab"), 0x30)
        XCTAssertEqual(Input.keyCode(for: "Backspace"), 0x33)
        XCTAssertEqual(Input.keyCode(for: "Escape"), 0x35)
        XCTAssertEqual(Input.keyCode(for: "ArrowLeft"), 0x7B)
        XCTAssertEqual(Input.keyCode(for: "ArrowUp"), 0x7E)
        XCTAssertEqual(Input.keyCode(for: "ShiftLeft"), 0x38)
        XCTAssertEqual(Input.keyCode(for: "MetaLeft"), 0x37)
    }

    func testAllLettersAndDigitsPresent() {
        for letter in "ABCDEFGHIJKLMNOPQRSTUVWXYZ" {
            XCTAssertNotNil(Input.keyCode(for: "Key\(letter)"), "missing Key\(letter)")
        }
        for d in 0...9 {
            XCTAssertNotNil(Input.keyCode(for: "Digit\(d)"), "missing Digit\(d)")
        }
    }

    func testUnknownCodeReturnsNil() {
        XCTAssertNil(Input.keyCode(for: "Frobnicate"))
        XCTAssertNil(Input.keyCode(for: ""))
    }

    func testNoUnintendedKeycodeCollisions() {
        // Group DOM codes by keycode; the only allowed >1 group is the Return/Enter alias.
        var byCode = [UInt16: [String]]()
        for (dom, code) in Input.domCodeToKeyCode { byCode[code, default: []].append(dom) }
        for (code, doms) in byCode where doms.count > 1 {
            XCTAssertEqual(Set(doms), Set(["Return", "Enter"]),
                           "unexpected keycode collision at 0x\(String(code, radix: 16)): \(doms)")
        }
    }

    func testDenormalizeAppliesSpanAndScale() {
        XCTAssertEqual(Input.denormalize(0.5, span: 800, scale: 2), 800, accuracy: 0.0001)
        XCTAssertEqual(Input.denormalize(0, span: 800, scale: 2), 0, accuracy: 0.0001)
        XCTAssertEqual(Input.denormalize(1, span: 656, scale: 1), 656, accuracy: 0.0001)
    }

    func testCgEventFlagsComposeFromMods() {
        XCTAssertEqual(Input.cgEventFlags(for: Mods(shift: false, ctrl: false, alt: false, meta: false)), [])
        XCTAssertEqual(Input.cgEventFlags(for: Mods(shift: true, ctrl: false, alt: false, meta: false)), .maskShift)
        XCTAssertEqual(Input.cgEventFlags(for: Mods(shift: false, ctrl: false, alt: false, meta: true)), .maskCommand)
        let all = Input.cgEventFlags(for: Mods(shift: true, ctrl: true, alt: true, meta: true))
        XCTAssertTrue(all.contains(.maskShift) && all.contains(.maskControl) && all.contains(.maskAlternate) && all.contains(.maskCommand))
    }

    func testCgMouseButtonMapping() {
        XCTAssertEqual(Input.cgMouseButton(.left), .left)
        XCTAssertEqual(Input.cgMouseButton(.middle), .center)
        XCTAssertEqual(Input.cgMouseButton(.right), .right)
    }
}
