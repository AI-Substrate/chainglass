import Foundation

// Entry point for the streamd native daemon (Plan 088, Phase 4).
//
// Scaffold stage (dossier T001): parse CLI args, bring up the headless CoreGraphics
// session (the CGS_REQUIRE_INIT mitigation), and report the resolved config. The
// capture/encode pipeline (T003), WebSocket + auth gate (T004/T006), session table
// (T005), input injection (T007) and registry/lifecycle (T008) land in later tasks
// and replace the placeholder below with the real listen/run loop.

let argv = Array(CommandLine.arguments.dropFirst())

let config: DaemonConfig
do {
    config = try DaemonConfig.parse(argv, env: ProcessInfo.processInfo.environment)
} catch {
    FileHandle.standardError.write(Data("streamd: \(error)\n".utf8))
    FileHandle.standardError.write(Data("\(DaemonConfig.usage)\n".utf8))
    exit(2)
}

// Required before any ScreenCaptureKit / CGEvent use (spike gotcha).
CoreGraphicsInit.ensure()

let registry = config.registryPath ?? "<none>"
let bootstrap = config.bootstrapPath ?? "<none>"
print("streamd scaffold up — port=\(config.port) registry=\(registry) bootstrap=\(bootstrap)")
// TODO(T004/T006/T008): replace with WS listen + capture run loop.
