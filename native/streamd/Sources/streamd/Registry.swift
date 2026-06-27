import Foundation

/// Daemon discovery registry file (dossier T008).
///
/// On listen the daemon writes `.chainglass/streamd-<webPort>.json` atomically so Phase 5
/// can discover it; the daemon polls the file and self-exits when it vanishes; SIGTERM →
/// `bye{shutdown}` then a clean close. The registry PATH comes from the `--registry` CLI
/// arg (T001) — never derived here. The on-disk field is **`port`**; Phase 5 surfaces it as
/// `daemonPort` in API responses (the daemon never emits `daemonPort`).
struct RegistryFile: Codable, Equatable {
    var pid: Int
    var port: Int
    var protocolVersion: Int
    var daemonVersion: String
    var bundleId: String
    var bundlePath: String
    var startedAt: String   // ISO 8601

    static let bundleIdentifier = "com.chainglass.streamd"
}

enum Registry {
    /// Daemon build version (also surfaced via `/health` for Phase 5's version handshake).
    static let daemonVersion = "0.1.0"

    /// Atomic write: `Data.write(options:.atomic)` is a temp-file + rename under the hood
    /// (POSIX-atomic), matching the bootstrap/port-discovery idiom. Creates the parent dir.
    static func write(_ file: RegistryFile, to path: String) throws {
        let url = URL(fileURLWithPath: path)
        try FileManager.default.createDirectory(
            at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        try encoder.encode(file).write(to: url, options: .atomic)
    }

    /// Read + decode the registry file. `nil` if missing or malformed (never throws).
    static func read(from path: String) -> RegistryFile? {
        guard let data = try? Data(contentsOf: URL(fileURLWithPath: path)) else { return nil }
        return try? JSONDecoder().decode(RegistryFile.self, from: data)
    }

    /// Self-exit predicate: the daemon polls this (~30s) and exits when it returns false.
    static func exists(at path: String) -> Bool {
        FileManager.default.fileExists(atPath: path)
    }

    /// Best-effort removal (used on clean shutdown).
    static func remove(at path: String) {
        try? FileManager.default.removeItem(atPath: path)
    }
}
