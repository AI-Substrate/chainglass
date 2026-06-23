import Foundation

/// Resolved runtime configuration for `streamd`.
///
/// Phase 5 spawns the daemon via `open -g … --args` and passes the port plus
/// absolute paths explicitly. The daemon never computes the `webPort + 1501`
/// offset and never derives the registry path — the web side owns both
/// (Workshop 004 / dossier T001, § Control-API shapes). Standalone/dev runs may
/// omit `--port` and fall back to the `CG_*` env var (ADR-0003) then a dev default.
struct DaemonConfig: Equatable {
    var port: Int
    /// Absolute path the daemon writes its discovery registry file to (T008).
    /// `nil` in dev when not passed; Phase 5 always supplies `--registry`.
    var registryPath: String?
    /// Absolute path to `bootstrap-code.json` for the HKDF JWT-verify key (T004).
    var bootstrapPath: String?

    /// Env override for the port when `--port` is absent (ADR-0003 `CG_*`).
    static let portEnvKey = "CG_REMOTE_VIEW__DAEMON_PORT"
    /// Dev fallback when neither `--port` nor the env var is set.
    static let defaultDevPort = 6001

    enum ParseError: Error, Equatable, CustomStringConvertible {
        case missingValue(flag: String)
        case invalidPort(String)
        case unknownFlag(String)
        case notAbsolutePath(flag: String, value: String)

        var description: String {
            switch self {
            case .missingValue(let flag): return "missing value for \(flag)"
            case .invalidPort(let v): return "invalid --port value: \(v)"
            case .unknownFlag(let f): return "unknown flag: \(f)"
            case .notAbsolutePath(let flag, let v): return "\(flag) must be an absolute path: \(v)"
            }
        }
    }

    /// Parse argv (excluding the executable name) against an environment lookup.
    static func parse(_ args: [String], env: [String: String] = [:]) throws -> DaemonConfig {
        var port: Int?
        var registry: String?
        var bootstrap: String?

        var i = 0
        func nextValue(for flag: String) throws -> String {
            i += 1
            guard i < args.count else { throw ParseError.missingValue(flag: flag) }
            return args[i]
        }
        // T001 documents `--registry`/`--bootstrap` as `<abs path>`; enforce it (F001) — Phase 5
        // always passes absolute paths via `open --args`, and the daemon never derives them.
        func absolutePath(_ value: String, flag: String) throws -> String {
            guard value.hasPrefix("/") else { throw ParseError.notAbsolutePath(flag: flag, value: value) }
            return value
        }

        while i < args.count {
            let arg = args[i]
            switch arg {
            case "--port":
                let raw = try nextValue(for: "--port")
                guard let p = Int(raw), (1..<65536).contains(p) else {
                    throw ParseError.invalidPort(raw)
                }
                port = p
            case "--registry":
                registry = try absolutePath(try nextValue(for: "--registry"), flag: "--registry")
            case "--bootstrap":
                bootstrap = try absolutePath(try nextValue(for: "--bootstrap"), flag: "--bootstrap")
            default:
                throw ParseError.unknownFlag(arg)
            }
            i += 1
        }

        let resolvedPort: Int
        if let port {
            resolvedPort = port
        } else if let envValue = env[portEnvKey] {
            // An explicit env port must be valid; a bad value is a configuration error, not a silent
            // fall-through to the dev default (F007/FT-007).
            guard let p = Int(envValue), (1..<65536).contains(p) else {
                throw ParseError.invalidPort(envValue)
            }
            resolvedPort = p
        } else {
            resolvedPort = defaultDevPort
        }

        return DaemonConfig(port: resolvedPort, registryPath: registry, bootstrapPath: bootstrap)
    }

    static let usage = "usage: streamd [--port <n>] [--registry <abs path>] [--bootstrap <abs path>]\n       streamd --list-windows   (one-shot host-window catalog as JSON, then exit)"
}
