import Foundation
import AppKit
import ScreenCaptureKit
import CoreGraphics

/// `streamd --list-windows` — one-shot host-window catalog for the web picker (Plan 088
/// Phase 5, T004).
///
/// A Node web server cannot call ScreenCaptureKit, so the web `/windows` route spawns the
/// signed bundle in this mode and parses the JSON on stdout into `WindowDescriptor[]`. The
/// *streaming* daemon's surface stays single-window (F005/F006); THIS is the multi-window
/// discovery source the picker enumerates against.
///
/// Output contract: a JSON array on stdout, each element the SAME `WindowDescriptor` shape the
/// streamer reports (`id`, `app`, `title`, `pixelWidth`, `pixelHeight`, `scale`) — so the
/// picker's dimensions/scale agree with the live stream. Exit `0` on success; non-zero on a
/// missing Screen-Recording grant or enumeration failure (the route maps that to an
/// `E_PERMISSION` catalog error rather than a silent empty list).
enum WindowList {

    /// Pure mapping: `SCWindow` fields → the wire `WindowDescriptor`. Factored out (no SCK, no
    /// display lookup) so it is deterministically unit-testable. `scale` is resolved by the
    /// caller via `backingScale(forWindow:)`, mirroring `CaptureFrameSource.beginCapture` exactly
    /// so the catalog size == the streamed size.
    static func descriptor(windowID: UInt32, app: String?, title: String?,
                           frame: CGRect, scale: Double) -> WindowDescriptor {
        WindowDescriptor(
            id: Int(windowID),
            app: app ?? "",
            title: title ?? "",
            pixelWidth: Int((frame.width * scale).rounded()),
            pixelHeight: Int((frame.height * scale).rounded()),
            scale: scale)
    }

    /// Keep only windows a human would actually pick: a normal-level, on-screen window owned by a
    /// named app at a non-degenerate size. The `layer == 0` guard is load-bearing — it drops the
    /// menubar extras, Control-Centre status items, the dock, and other system chrome that
    /// `SCShareableContent` returns at higher `CGWindowLevel`s but that nobody wants to stream
    /// (caught by the live smoke). Pure → unit-tested.
    static func isPickable(app: String?, title: String?, frame: CGRect,
                           isOnScreen: Bool, layer: Int) -> Bool {
        guard isOnScreen else { return false }
        guard layer == 0 else { return false }   // normal window level only (kCGNormalWindowLevel)
        guard let app, !app.isEmpty else { return false }
        guard frame.width >= 1, frame.height >= 1 else { return false }
        return true
    }

    /// Stable JSON serialization of the catalog (`.sortedKeys` → deterministic for snapshot
    /// tests and diffing). The exact bytes the web `/windows` route parses with the Zod
    /// `WindowDescriptorSchema`. Pure → unit-tested.
    static func encode(_ windows: [WindowDescriptor]) throws -> String {
        let enc = JSONEncoder()
        enc.outputFormatting = [.sortedKeys]
        return String(decoding: try enc.encode(windows), as: UTF8.self)
    }

    /// Backing scale of the display the window sits on — copied from `CaptureFrameSource` (F010)
    /// so the catalog scale matches the streamed scale: most-horizontal-overlap screen, then the
    /// main screen, then 2.0.
    static func backingScale(forWindow frame: CGRect) -> Double {
        func xOverlap(_ a: CGRect, _ b: CGRect) -> CGFloat { max(0, min(a.maxX, b.maxX) - max(a.minX, b.minX)) }
        let best = NSScreen.screens.max { xOverlap(frame, $0.frame) < xOverlap(frame, $1.frame) }
        let screen = (xOverlap(frame, best?.frame ?? .zero) > 0 ? best : nil) ?? NSScreen.main
        return Double(screen?.backingScaleFactor ?? 2.0)
    }

    /// One-shot enumeration (manual-smoke: needs the Screen-Recording TCC grant + a live display,
    /// so it cannot run in CI — same constraint as the daemon's capture path). Prints the JSON
    /// catalog to stdout and exits. The pure `descriptor`/`isPickable`/`encode` above carry the
    /// deterministic proof; this shell only wires SCK to them.
    static func runAndExit() -> Never {
        guard CGPreflightScreenCaptureAccess() else {
            FileHandle.standardError.write(Data("streamd: screen-recording grant required for --list-windows\n".utf8))
            exit(3)
        }
        // A locked host returns a stale/empty SCK content set — report it distinctly (exit 4) so the
        // web picker can say "unlock the host" instead of "no windows" (Plan 088, host-locked guard).
        if SessionLock.isLocked() {
            FileHandle.standardError.write(Data("streamd: host is locked — cannot enumerate windows\n".utf8))
            exit(SessionLock.exitCode)
        }
        var windows: [SCWindow] = []
        var enumError: Error?
        let sem = DispatchSemaphore(value: 0)
        SCShareableContent.getExcludingDesktopWindows(false, onScreenWindowsOnly: true) { content, error in
            windows = content?.windows ?? []
            enumError = error
            sem.signal()
        }
        sem.wait()
        if let enumError {
            FileHandle.standardError.write(Data("streamd: window enumeration failed: \(enumError.localizedDescription)\n".utf8))
            exit(3)
        }
        let descriptors = windows.compactMap { w -> WindowDescriptor? in
            guard isPickable(app: w.owningApplication?.applicationName, title: w.title,
                             frame: w.frame, isOnScreen: w.isOnScreen, layer: w.windowLayer) else { return nil }
            return descriptor(windowID: w.windowID, app: w.owningApplication?.applicationName,
                              title: w.title, frame: w.frame,
                              scale: backingScale(forWindow: w.frame))
        }
        do {
            print(try encode(descriptors))
            exit(0)
        } catch {
            FileHandle.standardError.write(Data("streamd: failed to encode window list: \(error)\n".utf8))
            exit(3)
        }
    }
}
