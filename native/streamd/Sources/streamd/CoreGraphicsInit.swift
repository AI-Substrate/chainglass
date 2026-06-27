import AppKit

/// Brings up a headless Aqua / CoreGraphics session **before** any ScreenCaptureKit
/// or CGEvent call.
///
/// A bare Swift CLI that touches `SCStream`/`CGEvent` aborts with `CGS_REQUIRE_INIT`;
/// instantiating the shared application and setting the activation policy to
/// `.prohibited` gives the process a window-server connection without a Dock icon or
/// menu bar (Phase 1 spike gotcha — dossier T001/T003/T007, § Oracle caveats).
///
/// Idempotent and main-thread-only (call from `main`); subsequent calls are no-ops.
enum CoreGraphicsInit {
    private static var initialized = false

    static func ensure() {
        guard !initialized else { return }
        let app = NSApplication.shared
        app.setActivationPolicy(.prohibited)
        initialized = true
    }
}
