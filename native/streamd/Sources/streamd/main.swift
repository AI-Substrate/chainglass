import Foundation
import CoreGraphics

// Entry point for the streamd native daemon (Plan 088, Phase 4).
//
// Pipeline: parse CLI args (T001) → headless CoreGraphics init (T001) → resolve the JWT
// signing key + Origin allowlist (T004) → choose the frame source (T003: live capture, or
// the fixture replay for the headless smoke) → start the HTTP+WS server (T006). The
// registry write + SIGTERM/vanish lifecycle (T008) wrap the server below.

let env = ProcessInfo.processInfo.environment
let argv = Array(CommandLine.arguments.dropFirst())

let config: DaemonConfig
do {
    config = try DaemonConfig.parse(argv, env: env)
} catch {
    FileHandle.standardError.write(Data("streamd: \(error)\n".utf8))
    FileHandle.standardError.write(Data("\(DaemonConfig.usage)\n".utf8))
    exit(2)
}

// Required before any ScreenCaptureKit / CGEvent use (spike CGS_REQUIRE_INIT gotcha).
CoreGraphicsInit.ensure()

func fail(_ message: String) -> Never {
    FileHandle.standardError.write(Data("streamd: \(message)\n".utf8))
    exit(1)
}

// JWT signing key (T004) — AUTH_SECRET, else HKDF over the bootstrap code.
let signingKey: [UInt8]
do {
    signingKey = try RemoteViewAuth.signingKey(bootstrapPath: config.bootstrapPath, env: env)
} catch {
    fail("cannot resolve signing key (set AUTH_SECRET or pass --bootstrap): \(error)")
}

// Origin allowlist (T004) — env override, else the localhost web-port default.
let webPort = env["CG_REMOTE_VIEW__WEB_PORT"] ?? "3000"
let allowedOrigins = RemoteViewAuth.parseAllowedOrigins(env["CG_REMOTE_VIEW__ALLOWED_ORIGINS"])
    ?? RemoteViewAuth.buildDefaultAllowedOrigins(port: webPort, httpsEnabled: false)

// Frame source (T003): fixtures dir → headless replay (no TCC); else live window capture.
let frameSource: FrameSource
if let fixturesDir = env["CG_REMOTE_VIEW__FIXTURES_DIR"] {
    do {
        frameSource = try FixtureFrameSource(fixturesDir: fixturesDir)
        FileHandle.standardError.write(Data("streamd: fixture replay from \(fixturesDir)\n".utf8))
    } catch {
        fail("cannot load fixtures at \(fixturesDir): \(error)")
    }
} else {
    let windowId: CGWindowID = env["CG_REMOTE_VIEW__WINDOW_ID"].flatMap { UInt32($0) } ?? 0
    frameSource = CaptureFrameSource(windowId: windowId)
}

let server = WSServer(port: UInt16(config.port), signingKey: signingKey,
                      allowedOrigins: allowedOrigins, frameSource: frameSource)

do {
    try server.start()
} catch {
    fail("listener failed on port \(config.port): \(error)")
}

print("streamd up — port=\(config.port) origins=\(allowedOrigins.sorted().joined(separator: ",")) registry=\(config.registryPath ?? "<none>")")

// Keep the process alive on the dispatch main queue (T008 installs the registry +
// SIGTERM/vanish lifecycle around this).
dispatchMain()
