import CoreGraphics
import Foundation

/// Host login-session lock state (Plan 088).
///
/// When the Mac is locked (or this isn't the foreground console session — fast user switching /
/// the login window), ScreenCaptureKit can only see the secure/login screen: `SCShareableContent`
/// returns a stale or EMPTY `displays`/`windows` set and live capture would stream the lock screen.
/// The one-shot catalog modes (`--list-windows` / `--list-displays`) check this so the web picker
/// can flip to an explicit "host is locked" message instead of a confusing empty grid — the symptom
/// that looks identical to "no windows" but has a completely different fix (unlock the host).
///
/// Uses `CGSessionCopyCurrentDictionary`'s documented `CGSSessionScreenIsLocked` flag (present +
/// truthy only while locked) plus `kCGSSessionOnConsoleKey` (false when another session owns the
/// console). The pure detection has no SCK dependency, but its result is environment-driven (the
/// live lock state), so it is exercised by the host-Mac smoke, not CI — same constraint as the
/// grant check it sits beside.
enum SessionLock {
    /// Exit code the one-shot catalog modes return when the host is locked — DISTINCT from the
    /// exit-3 missing-grant code so the web daemon-control can map it to a separate `E_LOCKED`
    /// catalog error (and a separate, actionable UI message) rather than a silent empty list.
    static let exitCode: Int32 = 4

    /// True when the host screen is locked or this process can't reach the foreground GUI session.
    static func isLocked() -> Bool {
        guard let dict = CGSessionCopyCurrentDictionary() as? [String: Any] else {
            // No console-session dictionary at all (e.g. no window-server session) — nothing
            // capturable. Treat as locked: enumeration/capture cannot produce a real result.
            return true
        }
        // The screen is locked. The key is absent when unlocked, so only its truthy presence counts.
        if let v = dict["CGSSessionScreenIsLocked"] as? Bool, v { return true }
        if let v = dict["CGSSessionScreenIsLocked"] as? Int, v != 0 { return true }
        // Not the foreground console session (fast user switching / login window) — also uncapturable.
        if let onConsole = dict["kCGSSessionOnConsoleKey"] as? Bool, !onConsole { return true }
        if let onConsole = dict["kCGSSessionOnConsoleKey"] as? Int, onConsole == 0 { return true }
        return false
    }
}
