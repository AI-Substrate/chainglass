import Foundation
import AppKit
import ScreenCaptureKit
import CoreGraphics

/// `streamd --list-displays` — one-shot host-*display* catalog for the web picker (Plan 088,
/// multi-target capture).
///
/// The window sibling of `WindowList`: a Node web server cannot call ScreenCaptureKit, so the web
/// `/displays` route spawns the signed bundle in this mode and parses the JSON on stdout into
/// `DisplayDescriptor[]`. The picker offers each display as a "Whole Desktop" tile so a
/// multi-monitor host can choose WHICH screen before attaching. A chosen display then streams via
/// `DisplayCaptureFrameSource`, presenting on the wire AS a `WindowDescriptor` (id=displayID) — so
/// nothing downstream of enumeration changes.
///
/// Output contract: a JSON array on stdout, each element a `DisplayDescriptor`
/// (`id`, `label`, `pixelWidth`, `pixelHeight`, `scale`, `isPrimary`). Exit `0` on success; exit
/// `3` on a missing Screen-Recording grant or enumeration failure (the route maps that to an
/// `E_PERMISSION` catalog error, mirroring `--list-windows`).
enum DisplayList {

    /// Pure mapping: display points + scale → the wire `DisplayDescriptor`. Factored out (no SCK,
    /// no NSScreen lookup) so it is deterministically unit-testable. `pixelWidth/Height` = points ×
    /// backing scale, rounded — exactly the window path's math, so a display's streamed pixel size
    /// agrees with the catalog.
    static func descriptor(displayID: UInt32, label: String, widthPoints: Int, heightPoints: Int,
                           scale: Double, isPrimary: Bool) -> DisplayDescriptor {
        DisplayDescriptor(
            id: Int(displayID),
            label: label,
            pixelWidth: Int((Double(widthPoints) * scale).rounded()),
            pixelHeight: Int((Double(heightPoints) * scale).rounded()),
            scale: scale,
            isPrimary: isPrimary)
    }

    /// Stable JSON serialization (`.sortedKeys` → deterministic for snapshot tests). The exact
    /// bytes the web `/displays` route parses with the Zod `DisplayDescriptorSchema`. Pure.
    static func encode(_ displays: [DisplayDescriptor]) throws -> String {
        let enc = JSONEncoder()
        enc.outputFormatting = [.sortedKeys]
        return String(decoding: try enc.encode(displays), as: UTF8.self)
    }

    /// NSScreen backing a `CGDirectDisplayID` (for `backingScaleFactor` + `localizedName`), matched
    /// by the `NSScreenNumber` device-description key. `nil` if no live screen reports that id.
    static func screen(forDisplayID displayID: UInt32) -> NSScreen? {
        NSScreen.screens.first { screen in
            (screen.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? NSNumber)?
                .uint32Value == displayID
        }
    }

    /// Backing scale of a display — its NSScreen `backingScaleFactor`, else 2.0 (Retina default).
    static func backingScale(forDisplayID displayID: UInt32) -> Double {
        Double(screen(forDisplayID: displayID)?.backingScaleFactor ?? 2.0)
    }

    /// Human label for a display — the NSScreen `localizedName` (e.g. "Built-in Retina Display"),
    /// else a positional fallback so a screen without a resolvable name is still pickable.
    static func label(forDisplayID displayID: UInt32, index: Int) -> String {
        let name = screen(forDisplayID: displayID)?.localizedName
        if let name, !name.isEmpty { return name }
        return "Display \(index + 1)"
    }

    /// One-shot enumeration (manual-smoke: needs the Screen-Recording TCC grant + a live display, so
    /// it cannot run in CI — same constraint as `--list-windows`). Prints the JSON catalog to stdout
    /// and exits. The pure `descriptor`/`encode` above carry the deterministic proof; this shell
    /// only wires SCK + NSScreen to them.
    static func runAndExit() -> Never {
        guard CGPreflightScreenCaptureAccess() else {
            FileHandle.standardError.write(Data("streamd: screen-recording grant required for --list-displays\n".utf8))
            exit(3)
        }
        // A locked host returns a stale/empty SCK content set (displays come back []) — report it
        // distinctly (exit 4) so the picker says "unlock the host", not a silent empty screen list
        // (Plan 088, host-locked guard). This is the exact symptom seen behind the lock screen.
        if SessionLock.isLocked() {
            FileHandle.standardError.write(Data("streamd: host is locked — cannot enumerate displays\n".utf8))
            exit(SessionLock.exitCode)
        }
        var displays: [SCDisplay] = []
        var enumError: Error?
        let sem = DispatchSemaphore(value: 0)
        SCShareableContent.getExcludingDesktopWindows(false, onScreenWindowsOnly: true) { content, error in
            displays = content?.displays ?? []
            enumError = error
            sem.signal()
        }
        sem.wait()
        if let enumError {
            FileHandle.standardError.write(Data("streamd: display enumeration failed: \(enumError.localizedDescription)\n".utf8))
            exit(3)
        }
        let mainID = CGMainDisplayID()
        // Primary display first, then native order — the picker shows the "main" screen as the
        // obvious default tile.
        let descriptors = displays.enumerated()
            .map { (index, d) -> DisplayDescriptor in
                descriptor(displayID: d.displayID,
                           label: label(forDisplayID: d.displayID, index: index),
                           widthPoints: d.width, heightPoints: d.height,
                           scale: backingScale(forDisplayID: d.displayID),
                           isPrimary: d.displayID == mainID)
            }
            .sorted { ($0.isPrimary ? 0 : 1, $0.id) < ($1.isPrimary ? 0 : 1, $1.id) }
        do {
            print(try encode(descriptors))
            exit(0)
        } catch {
            FileHandle.standardError.write(Data("streamd: failed to encode display list: \(error)\n".utf8))
            exit(3)
        }
    }
}
