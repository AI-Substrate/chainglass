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

// `--list-windows` (Plan 088 Phase 5, T004): one-shot host-window catalog for the web picker,
// then exit. Handled BEFORE config parse — this mode ignores --port/--registry/--bootstrap and
// never starts the server. The web `/windows` route spawns the bundle this way and parses the
// JSON catalog on stdout. Requires CoreGraphics init (SCK) just like the capture path.
if argv.contains("--list-windows") {
    CoreGraphicsInit.ensure()
    WindowList.runAndExit()
}

// `--list-displays` (Plan 088 multi-target capture): the display sibling of `--list-windows` —
// one-shot whole-desktop catalog for the picker's "Whole Desktop" / pick-a-screen section, then
// exit. Same SCK + TCC constraints; never starts the server.
if argv.contains("--list-displays") {
    CoreGraphicsInit.ensure()
    DisplayList.runAndExit()
}

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

// Frame source (T003): fixtures dir → headless replay (no TCC); else one of two live capture
// targets — a single window (CG_REMOTE_VIEW__WINDOW_ID) or a whole display
// (CG_REMOTE_VIEW__DISPLAY_ID, multi-target capture). Window takes precedence if both are set
// (the manager only ever sets one). The live path also wires the matching CGEvent input injector
// (T007): window-relative + focus-follows for a window, global desktop coords for a display.
let frameSource: FrameSource
var onInputEvents: (([InputEvent]) -> Void)?
if let fixturesDir = env["CG_REMOTE_VIEW__FIXTURES_DIR"] {
    do {
        frameSource = try FixtureFrameSource(fixturesDir: fixturesDir)
        FileHandle.standardError.write(Data("streamd: fixture replay from \(fixturesDir)\n".utf8))
    } catch {
        fail("cannot load fixtures at \(fixturesDir): \(error)")
    }
} else if let rawWindowId = env["CG_REMOTE_VIEW__WINDOW_ID"], !rawWindowId.isEmpty {
    // A set-but-invalid id must fail loudly at startup rather than surface later as a confusing
    // capture/window error (F008/FT-008).
    guard let windowId = UInt32(rawWindowId), windowId != 0 else {
        fail("CG_REMOTE_VIEW__WINDOW_ID must be a valid nonzero CGWindowID (got \(rawWindowId))")
    }
    frameSource = CaptureFrameSource(windowId: windowId)
    let injector = CGEventInputInjector(windowId: windowId)
    onInputEvents = { events in injector.inject(events) }
} else if let rawDisplayId = env["CG_REMOTE_VIEW__DISPLAY_ID"], !rawDisplayId.isEmpty {
    guard let displayId = UInt32(rawDisplayId), displayId != 0 else {
        fail("CG_REMOTE_VIEW__DISPLAY_ID must be a valid nonzero CGDirectDisplayID (got \(rawDisplayId))")
    }
    frameSource = DisplayCaptureFrameSource(displayId: displayId)
    let injector = DisplayInputInjector(displayID: displayId)
    onInputEvents = { events in injector.inject(events) }
} else {
    fail("live mode requires a valid nonzero CG_REMOTE_VIEW__WINDOW_ID or CG_REMOTE_VIEW__DISPLAY_ID (or set CG_REMOTE_VIEW__FIXTURES_DIR for headless replay)")
}

let server = WSServer(port: UInt16(config.port), signingKey: signingKey,
                      allowedOrigins: allowedOrigins, frameSource: frameSource)
if let onInputEvents {
    server.onInput = onInputEvents
}

do {
    try server.start()
} catch {
    fail("listener failed on port \(config.port): \(error)")
}

print("streamd up — port=\(config.port) origins=\(allowedOrigins.sorted().joined(separator: ",")) registry=\(config.registryPath ?? "<none>")")

// MARK: - Registry + lifecycle (T008)

var shuttingDown = false
func gracefulShutdown(_ reason: ByeReason) {
    if shuttingDown { return }
    shuttingDown = true
    server.broadcastByeAndClose(reason: reason)            // bye{reason} → viewer, then close
    if let rp = config.registryPath { Registry.remove(at: rp) }
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) { exit(0) }   // let the bye frame flush
}

var lifecycleTimer: DispatchSourceTimer?
var sigtermSource: DispatchSourceSignal?

// On listen, publish the discovery registry; poll it and self-exit when it vanishes (Phase 5
// owns the reaper that deletes it). The registry PATH is the `--registry` arg — never derived.
if let registryPath = config.registryPath {
    let file = RegistryFile(
        pid: Int(ProcessInfo.processInfo.processIdentifier),
        port: config.port,
        protocolVersion: WireProtocol.version,
        daemonVersion: Registry.daemonVersion,
        bundleId: RegistryFile.bundleIdentifier,
        bundlePath: Bundle.main.bundlePath,
        startedAt: ISO8601DateFormatter().string(from: Date()))
    do { try Registry.write(file, to: registryPath) }
    catch { fail("cannot write registry at \(registryPath): \(error)") }

    let pollSeconds = Double(env["CG_REMOTE_VIEW__VANISH_POLL_SECONDS"] ?? "") ?? 30.0
    let timer = DispatchSource.makeTimerSource(queue: .main)
    timer.schedule(deadline: .now() + pollSeconds, repeating: pollSeconds)
    timer.setEventHandler { if !Registry.exists(at: registryPath) { gracefulShutdown(.shutdown) } }
    lifecycleTimer = timer
    timer.resume()
}

// POST /shutdown (JWT-gated) and SIGTERM both run the graceful path. Hop to the main queue so
// `broadcastByeAndClose` (which `queue.sync`s onto the WS queue) can't deadlock the WS queue.
server.onShutdownRequest = { DispatchQueue.main.async { gracefulShutdown(.shutdown) } }
signal(SIGTERM, SIG_IGN)
let sigterm = DispatchSource.makeSignalSource(signal: SIGTERM, queue: .main)
sigterm.setEventHandler { gracefulShutdown(.shutdown) }
sigtermSource = sigterm
sigterm.resume()

// Keep the process alive on the dispatch main queue.
dispatchMain()
