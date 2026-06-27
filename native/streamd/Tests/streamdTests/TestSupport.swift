import Foundation

/// Locates the repo-root fixtures so `swift test` round-trips the EXACT same files the
/// TS suite uses (no copy → no drift). Resolved from `#filePath` so it works regardless
/// of the working directory the tests are launched from.
enum Fixtures {
    /// `<root>/native/streamd/Tests/streamdTests/TestSupport.swift` → `<root>`.
    static let repoRoot: URL = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent()   // streamdTests
        .deletingLastPathComponent()   // Tests
        .deletingLastPathComponent()   // streamd
        .deletingLastPathComponent()   // native
        .deletingLastPathComponent()   // <repo root>

    static let protocolFixturesDir: URL =
        repoRoot.appendingPathComponent("apps/web/src/features/088-remote-view/protocol/fixtures")

    static let authVectors: URL =
        repoRoot.appendingPathComponent("test/contracts/remote-view-auth-vectors.json")
}
