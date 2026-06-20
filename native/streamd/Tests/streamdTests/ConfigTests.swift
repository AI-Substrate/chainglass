import XCTest
@testable import streamd

/// Test: streamd CLI-arg / env config parsing (dossier T001).
/// Behaviour: `--port/--registry/--bootstrap` parse; port falls back env → dev default.
/// Boundary: invalid/unknown flags and missing values are rejected (no silent defaults).
/// Determinism: pure function over (argv, env) — no I/O, runs in CI.
/// Oracle: dossier § Control-API shapes (CLI args) + § Pre-Implementation Check (port).
final class ConfigTests: XCTestCase {
    func testParsesAllFlags() throws {
        let c = try DaemonConfig.parse(
            ["--port", "6123", "--registry", "/tmp/r.json", "--bootstrap", "/tmp/b.json"]
        )
        XCTAssertEqual(c.port, 6123)
        XCTAssertEqual(c.registryPath, "/tmp/r.json")
        XCTAssertEqual(c.bootstrapPath, "/tmp/b.json")
    }

    func testPortFallsBackToEnvThenDefault() throws {
        let envOnly = try DaemonConfig.parse([], env: [DaemonConfig.portEnvKey: "7777"])
        XCTAssertEqual(envOnly.port, 7777)

        let dflt = try DaemonConfig.parse([])
        XCTAssertEqual(dflt.port, DaemonConfig.defaultDevPort)
    }

    func testExplicitPortBeatsEnv() throws {
        let c = try DaemonConfig.parse(["--port", "5005"], env: [DaemonConfig.portEnvKey: "7777"])
        XCTAssertEqual(c.port, 5005)
    }

    func testRejectsInvalidPort() {
        XCTAssertThrowsError(try DaemonConfig.parse(["--port", "nope"]))
        XCTAssertThrowsError(try DaemonConfig.parse(["--port", "99999"]))
        XCTAssertThrowsError(try DaemonConfig.parse(["--port", "0"]))
    }

    func testRejectsInvalidEnvPort() {
        // An explicit but invalid env port is a configuration error, not a silent dev-default (FT-007).
        XCTAssertThrowsError(try DaemonConfig.parse([], env: [DaemonConfig.portEnvKey: "not-a-port"]))
        XCTAssertThrowsError(try DaemonConfig.parse([], env: [DaemonConfig.portEnvKey: "99999"]))
        XCTAssertThrowsError(try DaemonConfig.parse([], env: [DaemonConfig.portEnvKey: "0"]))
        // Absent env still falls back to the dev default (no throw).
        XCTAssertEqual(try DaemonConfig.parse([]).port, DaemonConfig.defaultDevPort)
    }

    func testRejectsUnknownFlag() {
        XCTAssertThrowsError(try DaemonConfig.parse(["--frobnicate"]))
    }

    func testRejectsMissingValue() {
        XCTAssertThrowsError(try DaemonConfig.parse(["--port"]))
        XCTAssertThrowsError(try DaemonConfig.parse(["--registry"]))
    }

    func testRejectsRelativePaths() {
        // T001 documents `--registry`/`--bootstrap` as `<abs path>`; enforce it (F001).
        XCTAssertThrowsError(try DaemonConfig.parse(["--registry", "rel/r.json"]))
        XCTAssertThrowsError(try DaemonConfig.parse(["--bootstrap", "b.json"]))
        XCTAssertNoThrow(try DaemonConfig.parse(["--registry", "/tmp/r.json", "--bootstrap", "/tmp/b.json"]))
    }
}
