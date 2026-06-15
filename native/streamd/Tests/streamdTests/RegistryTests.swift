import XCTest
@testable import streamd

/// Test: streamd discovery-registry file I/O (dossier T008, automatable half).
/// Behaviour: write→read round-trips every field; atomic write creates the parent dir;
///   exists() flips false when the file is removed (the self-exit-on-vanish predicate).
/// Boundary: read of a missing/garbage file → nil (never throws).
/// Determinism: writes under a unique temp dir; no daemon process, no sockets.
/// Oracle: dossier T008 + § Control-API shapes (registry field is `port`, not `daemonPort`).
final class RegistryTests: XCTestCase {

    private func tempPath(_ name: String) -> String {
        let dir = (NSTemporaryDirectory() as NSString)
            .appendingPathComponent("streamd-registry-\(name)")
        return (dir as NSString).appendingPathComponent(".chainglass/streamd-4500.json")
    }

    private func sample() -> RegistryFile {
        RegistryFile(pid: 4242, port: 6001, protocolVersion: WireProtocol.version,
                     daemonVersion: Registry.daemonVersion,
                     bundleId: RegistryFile.bundleIdentifier,
                     bundlePath: "/Applications/ChainglassStreamd.app",
                     startedAt: "2026-06-15T08:00:00Z")
    }

    func testWriteReadRoundTripCreatesParentDir() throws {
        let path = tempPath("rt")
        defer { try? FileManager.default.removeItem(atPath: (path as NSString).deletingLastPathComponent) }
        let file = sample()
        try Registry.write(file, to: path)          // parent .chainglass/ does not exist yet
        XCTAssertTrue(Registry.exists(at: path))
        XCTAssertEqual(Registry.read(from: path), file)
    }

    func testFieldIsPortNotDaemonPort() throws {
        let path = tempPath("port")
        defer { try? FileManager.default.removeItem(atPath: (path as NSString).deletingLastPathComponent) }
        try Registry.write(sample(), to: path)
        let json = try String(contentsOfFile: path, encoding: .utf8)
        XCTAssertTrue(json.contains("\"port\""), "registry must write `port`")
        XCTAssertFalse(json.contains("daemonPort"), "daemon must NOT emit `daemonPort` (Phase 5 renames)")
    }

    func testVanishDetection() throws {
        let path = tempPath("vanish")
        defer { try? FileManager.default.removeItem(atPath: (path as NSString).deletingLastPathComponent) }
        try Registry.write(sample(), to: path)
        XCTAssertTrue(Registry.exists(at: path))
        Registry.remove(at: path)
        XCTAssertFalse(Registry.exists(at: path))   // → daemon self-exits
    }

    func testReadMissingOrGarbageReturnsNil() throws {
        XCTAssertNil(Registry.read(from: "/no/such/streamd-registry.json"))
        let path = tempPath("garbage")
        defer { try? FileManager.default.removeItem(atPath: (path as NSString).deletingLastPathComponent) }
        try FileManager.default.createDirectory(
            at: URL(fileURLWithPath: path).deletingLastPathComponent(), withIntermediateDirectories: true)
        try "not json".write(toFile: path, atomically: true, encoding: .utf8)
        XCTAssertNil(Registry.read(from: path))
    }
}
