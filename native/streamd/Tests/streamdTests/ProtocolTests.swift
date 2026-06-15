import XCTest
@testable import streamd

/// Test: streamd control-message Codable mirror vs the canonical fixtures (dossier T002).
/// Behaviour: every Workshop-003 client/server message in fixtures/messages.json decodes
///   into the Swift model and round-trips (encode → decode is identity).
/// Boundary: unknown `t` → parse returns nil; out-of-[0,1] coords are rejected.
/// Determinism: reads the SAME repo-root fixture file the TS suite uses (no copy).
/// Oracle: apps/web/.../protocol/fixtures/messages.json + protocol/messages.ts.
final class ProtocolTests: XCTestCase {

    private struct MessagesFixture: Decodable {
        let version: Int
        let client: [ClientMessage]
        let server: [ServerMessage]
    }

    private func loadFixture() throws -> MessagesFixture {
        let url = Fixtures.protocolFixturesDir.appendingPathComponent("messages.json")
        return try JSONDecoder().decode(MessagesFixture.self, from: Data(contentsOf: url))
    }

    func testDecodesCanonicalFixtureCounts() throws {
        let fx = try loadFixture()
        XCTAssertEqual(fx.version, WireProtocol.version)
        XCTAssertEqual(fx.client.count, 9)
        XCTAssertEqual(fx.server.count, 20)
    }

    func testClientMessagesRoundTrip() throws {
        for msg in try loadFixture().client {
            let again = try XCTUnwrap(ClientMessage.parse(try msg.encoded()))
            XCTAssertEqual(again, msg, "client message did not round-trip: \(msg)")
        }
    }

    func testServerMessagesRoundTrip() throws {
        for msg in try loadFixture().server {
            let again = try XCTUnwrap(ServerMessage.parse(try msg.encoded()))
            XCTAssertEqual(again, msg, "server message did not round-trip: \(msg)")
        }
    }

    func testInputEventShapes() throws {
        let input = try loadFixture().client.first { if case .input = $0 { return true }; return false }
        guard case let .input(events)? = input else { return XCTFail("no input message in fixture") }
        XCTAssertEqual(events.count, 7)
        XCTAssertEqual(events[0], .mousemove(x: 0.5, y: 0.25))
        XCTAssertEqual(events[1], .mousedown(x: 0.5, y: 0.25, button: .left))
        XCTAssertEqual(events[2], .mouseup(x: 0.5, y: 0.25, button: .right))
        XCTAssertEqual(events[3], .wheel(x: 0.5, y: 0.25, dx: 0, dy: -120))
        XCTAssertEqual(events[4], .keydown(code: "KeyW",
                                           modifiers: Mods(shift: false, ctrl: false, alt: false, meta: true)))
        XCTAssertEqual(events[6], .text("café"))   // unicode preserved
    }

    func testClientStatsNullableLatency() throws {
        var latencies = [Double?]()
        for msg in try loadFixture().client {
            if case let .clientStats(_, _, e2e) = msg { latencies.append(e2e) }
        }
        XCTAssertEqual(latencies.count, 2)
        XCTAssertTrue(latencies.contains { $0 == nil })   // explicit null variant
        XCTAssertTrue(latencies.contains { $0 == 42 })
    }

    func testAllErrorCodesStatesAndByeReasonsPresent() throws {
        var codes = Set<ErrorCode>(), reasons = Set<ByeReason>(), states = Set<WindowStateName>()
        for msg in try loadFixture().server {
            if case let .error(code, _, _) = msg { codes.insert(code) }
            if case let .bye(reason) = msg { reasons.insert(reason) }
            if case let .windowState(state, _, _) = msg { states.insert(state) }
        }
        XCTAssertEqual(codes, Set(ErrorCode.allCases))
        XCTAssertEqual(reasons, Set(ByeReason.allCases))
        XCTAssertEqual(states, Set(WindowStateName.allCases))
    }

    func testHelloOkWindowDescriptor() throws {
        let hello = try loadFixture().server.first { if case .helloOk = $0 { return true }; return false }
        guard case let .helloOk(v, session, window)? = hello else { return XCTFail("no hello-ok") }
        XCTAssertEqual(v, 1)
        XCTAssertEqual(session, "ses_abc123def456")
        XCTAssertEqual(window.id, 34202)
        XCTAssertEqual(window.scale, 2)
        XCTAssertEqual(window.pixelWidth, 800)
        XCTAssertEqual(window.pixelHeight, 656)
    }

    func testVideoConfigShape() throws {
        let vc = try loadFixture().server.first { if case .videoConfig = $0 { return true }; return false }
        guard case let .videoConfig(codec, description, width, height, fps)? = vc else {
            return XCTFail("no video-config")
        }
        XCTAssertEqual(codec, "avc1.640020")
        XCTAssertEqual(width, 800)
        XCTAssertEqual(height, 656)
        XCTAssertEqual(fps, 60)
        XCTAssertFalse(description.isEmpty)   // base64 avcC
    }

    func testWindowStateResizedCarriesDimensions() throws {
        var resized: (Int?, Int?)?
        for msg in try loadFixture().server {
            if case let .windowState(.resized, w, h) = msg { resized = (w, h) }
        }
        XCTAssertEqual(resized?.0, 1280)
        XCTAssertEqual(resized?.1, 1024)
    }

    func testForwardCompatUnknownTypeReturnsNil() {
        XCTAssertNil(ClientMessage.parse("{\"t\":\"bogus\"}"))
        XCTAssertNil(ServerMessage.parse("{\"t\":\"also-bogus\",\"x\":1}"))
        XCTAssertNil(ClientMessage.parse("not json"))
    }

    func testOutOfRangeCoordinateRejected() {
        XCTAssertNil(ClientMessage.parse("{\"t\":\"input\",\"events\":[{\"k\":\"mousemove\",\"x\":-1,\"y\":0.5}]}"))
        XCTAssertNil(ClientMessage.parse("{\"t\":\"input\",\"events\":[{\"k\":\"mousemove\",\"x\":0.5,\"y\":2}]}"))
    }
}
