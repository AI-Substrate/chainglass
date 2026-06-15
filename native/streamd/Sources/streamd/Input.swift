import Foundation
import CoreGraphics
import AppKit
import ApplicationServices   // AXUIElement — focus-follows-stream via the Accessibility grant

/// Input injection (dossier T007). This file owns the **pure, unit-testable** half (the DOM
/// `KeyboardEvent.code` → macOS virtual-keycode table + the modifier-flag mapping) **and**
/// the live `CGEventInputInjector` (mouse de-normalization via `kCGWindowBounds`,
/// `CGEventKeyboardSetUnicodeString` for `text`, focus-follows-stream, AC-10 auto-restore).
/// The live half compiles on-host but is exercised only at the host-Mac visit — posting
/// `CGEvent`s needs the Accessibility TCC grant and CG-init (`CoreGraphicsInit.ensure`).
///
/// Keycodes are the Carbon `kVK_ANSI_*` / `kVK_*` constants (HIToolbox `Events.h`); kept as
/// raw `UInt16` so the map has no CoreGraphics dependency and runs in CI. Unknown codes return
/// `nil` — the caller falls back to unicode `text` injection.
enum Input {
    /// DOM `code` → macOS virtual keycode (`CGKeyCode` is a `UInt16`).
    static let domCodeToKeyCode: [String: UInt16] = [
        // letters (ANSI)
        "KeyA": 0x00, "KeyS": 0x01, "KeyD": 0x02, "KeyF": 0x03, "KeyH": 0x04,
        "KeyG": 0x05, "KeyZ": 0x06, "KeyX": 0x07, "KeyC": 0x08, "KeyV": 0x09,
        "KeyB": 0x0B, "KeyQ": 0x0C, "KeyW": 0x0D, "KeyE": 0x0E, "KeyR": 0x0F,
        "KeyY": 0x10, "KeyT": 0x11, "KeyO": 0x1F, "KeyU": 0x20, "KeyI": 0x22,
        "KeyP": 0x23, "KeyL": 0x25, "KeyJ": 0x26, "KeyK": 0x28, "KeyN": 0x2D,
        "KeyM": 0x2E,
        // digits (top row)
        "Digit1": 0x12, "Digit2": 0x13, "Digit3": 0x14, "Digit4": 0x15, "Digit6": 0x16,
        "Digit5": 0x17, "Digit9": 0x19, "Digit7": 0x1A, "Digit8": 0x1C, "Digit0": 0x1D,
        // punctuation
        "Equal": 0x18, "Minus": 0x1B, "BracketRight": 0x1E, "BracketLeft": 0x21,
        "Quote": 0x27, "Semicolon": 0x29, "Backslash": 0x2A, "Comma": 0x2B,
        "Slash": 0x2C, "Period": 0x2F, "Backquote": 0x32,
        // control / whitespace
        "Return": 0x24, "Enter": 0x24, "Tab": 0x30, "Space": 0x31, "Backspace": 0x33,
        "Escape": 0x35, "Delete": 0x75, "Home": 0x73, "End": 0x77,
        "PageUp": 0x74, "PageDown": 0x79,
        // arrows
        "ArrowLeft": 0x7B, "ArrowRight": 0x7C, "ArrowDown": 0x7D, "ArrowUp": 0x7E,
        // modifiers
        "MetaLeft": 0x37, "MetaRight": 0x36, "ShiftLeft": 0x38, "ShiftRight": 0x3C,
        "CapsLock": 0x39, "AltLeft": 0x3A, "AltRight": 0x3D,
        "ControlLeft": 0x3B, "ControlRight": 0x3E,
        // function row
        "F1": 0x7A, "F2": 0x78, "F3": 0x63, "F4": 0x76, "F5": 0x60, "F6": 0x61,
        "F7": 0x62, "F8": 0x64, "F9": 0x65, "F10": 0x6D, "F11": 0x67, "F12": 0x6F,
    ]

    /// Resolve a DOM `code` to a virtual keycode, or `nil` if unmapped (→ fall back to
    /// unicode `text` injection in the live path).
    static func keyCode(for domCode: String) -> UInt16? {
        domCodeToKeyCode[domCode]
    }

    /// De-normalize a `[0,1]` frame coordinate to a window-pixel offset. Pure helper for
    /// the live mouse path (T007/Batch B); kept here so it is unit-testable without CGEvent.
    /// `scale` is the Retina backing-scale; result is in backing pixels from the window origin.
    static func denormalize(_ value: Double, span: Int, scale: Double) -> Double {
        value * Double(span) * scale
    }

    /// Compose `CGEventFlags` from the DOM modifier state. Pure (no event posting) → unit-tested.
    static func cgEventFlags(for mods: Mods) -> CGEventFlags {
        var flags: CGEventFlags = []
        if mods.shift { flags.insert(.maskShift) }
        if mods.ctrl { flags.insert(.maskControl) }
        if mods.alt { flags.insert(.maskAlternate) }
        if mods.meta { flags.insert(.maskCommand) }
        return flags
    }

    /// Map the protocol mouse button (0/1/2) to a `CGMouseButton`.
    static func cgMouseButton(_ button: MouseButton) -> CGMouseButton {
        switch button {
        case .left: return .left
        case .middle: return .center
        case .right: return .right
        }
    }
}

// MARK: - Live injection (Batch B — needs the Accessibility grant + CG-init)

/// Translates parsed `input.events[]` into `CGEvent`s posted at the target window's app.
///
/// Coordinates arrive normalized `[0,1]` of the video frame; this de-normalizes to screen
/// points using the live window bounds (`kCGWindowBounds`, refreshed ~30Hz). Input is posted
/// only to the streamed window's app (the security boundary — no general desktop automation):
/// the window is raised + made key first (the spike's focus trap — keyboard silently drops if
/// focus changes between events), and a minimized window is auto-restored (AC-10).
///
/// Compile-verified on-host; live posting is exercised at the host-Mac visit (T009) — it needs
/// the Accessibility TCC grant.
final class CGEventInputInjector {
    private let targetWindowId: CGWindowID
    private let source = CGEventSource(stateID: .hidSystemState)
    private var cachedBounds: CGRect?
    private var cachedAtHostTime: TimeInterval = 0
    private var ownerPID: pid_t = 0
    private var heldButton: MouseButton?   // tracks a held button across event batches → drag vs move
    private var lastFocusAt: TimeInterval = 0
    private let focusDebounceSeconds: TimeInterval = 1.5   // raise once per burst, not per keystroke

    init(windowId: CGWindowID) {
        self.targetWindowId = windowId
    }

    /// Inject a batch of events in order (called on the WS queue).
    func inject(_ events: [InputEvent]) {
        guard let bounds = windowBounds() else { return }
        for event in events { inject(event, in: bounds) }
    }

    private func inject(_ event: InputEvent, in bounds: CGRect) {
        switch event {
        case let .mousemove(x, y):
            // While a button is held, motion MUST post as a drag (not .mouseMoved) or the target
            // sees only down→up and never the path — pans/swipes degrade to a tap (T009 finding).
            if let b = heldButton {
                post(mouse: dragType(b), at: screenPoint(x, y, bounds), button: Input.cgMouseButton(b))
            } else {
                post(mouse: .mouseMoved, at: screenPoint(x, y, bounds), button: .left)
            }
        case let .mousedown(x, y, button):
            ensureFocused()
            heldButton = button
            post(mouse: downType(button), at: screenPoint(x, y, bounds), button: Input.cgMouseButton(button))
        case let .mouseup(x, y, button):
            post(mouse: upType(button), at: screenPoint(x, y, bounds), button: Input.cgMouseButton(button))
            if heldButton == button { heldButton = nil }
        case let .wheel(_, _, dx, dy):
            if let e = CGEvent(scrollWheelEvent2Source: source, units: .pixel, wheelCount: 2,
                               wheel1: Int32(-dy), wheel2: Int32(-dx), wheel3: 0) {
                e.post(tap: .cgSessionEventTap)
            }
        case let .keydown(code, mods):
            ensureFocused()
            postKey(code: code, down: true, mods: mods)
        case let .keyup(code, mods):
            postKey(code: code, down: false, mods: mods)
        case let .text(text):
            ensureFocused()
            postText(text)
        }
    }

    // MARK: geometry

    /// De-normalize `[0,1]` → screen points within the window's bounds.
    private func screenPoint(_ x: Double, _ y: Double, _ bounds: CGRect) -> CGPoint {
        CGPoint(x: bounds.origin.x + x * bounds.width, y: bounds.origin.y + y * bounds.height)
    }

    /// Window bounds + owner PID from `kCGWindowBounds`, cached ~30Hz.
    private func windowBounds() -> CGRect? {
        let now = Date().timeIntervalSince1970
        if let b = cachedBounds, now - cachedAtHostTime < 0.033 { return b }
        guard let infoList = CGWindowListCopyWindowInfo([.optionIncludingWindow], targetWindowId) as? [[String: Any]],
              let info = infoList.first,
              let boundsDict = info[kCGWindowBounds as String] as? [String: Any],
              let rect = CGRect(dictionaryRepresentation: boundsDict as CFDictionary) else { return nil }
        if let pid = info[kCGWindowOwnerPID as String] as? pid_t { ownerPID = pid }
        cachedBounds = rect
        cachedAtHostTime = now
        return rect
    }

    // MARK: focus (spike 1.3 trap) + AC-10 restore

    private func ensureFocused() {
        guard ownerPID != 0 else { return }
        let now = Date().timeIntervalSince1970
        // Focus ONCE per interaction burst. Re-raising on every keystroke churns focus and drops
        // the following keys (the spike's keyboard trap — `NSWorkspace.frontmostApplication` also
        // lags, so a per-event "is it front?" check mis-fires mid-burst). The debounce raises on
        // the first event of a burst, then leaves focus alone for rapid follow-ups (T009 finding).
        if now - lastFocusAt < focusDebounceSeconds { return }
        lastFocusAt = now
        if let app = NSRunningApplication(processIdentifier: ownerPID), app.isHidden { app.unhide() }
        // Bring the streamed app to the front via the Accessibility API — the daemon holds that
        // grant. `activate(options: [.activateIgnoringOtherApps])` is a no-op on macOS 14+
        // (deprecated flag), and plain `activate()` is unreliable from a `.prohibited` background
        // daemon (async cooperative activation), so input lands on whatever overlaps the target.
        // Setting kAXFrontmost is synchronous-effective and is what assistive tools use (T009).
        let axApp = AXUIElementCreateApplication(ownerPID)
        AXUIElementSetAttributeValue(axApp, kAXFrontmostAttribute as CFString, kCFBooleanTrue)
        NSRunningApplication(processIdentifier: ownerPID)?.activate()
    }

    // MARK: posting

    private func post(mouse type: CGEventType, at point: CGPoint, button: CGMouseButton) {
        guard let e = CGEvent(mouseEventSource: source, mouseType: type, mouseCursorPosition: point, mouseButton: button) else { return }
        e.post(tap: .cgSessionEventTap)
    }

    private func downType(_ b: MouseButton) -> CGEventType {
        switch b { case .left: return .leftMouseDown; case .right: return .rightMouseDown; case .middle: return .otherMouseDown }
    }
    private func upType(_ b: MouseButton) -> CGEventType {
        switch b { case .left: return .leftMouseUp; case .right: return .rightMouseUp; case .middle: return .otherMouseUp }
    }
    private func dragType(_ b: MouseButton) -> CGEventType {
        switch b { case .left: return .leftMouseDragged; case .right: return .rightMouseDragged; case .middle: return .otherMouseDragged }
    }

    private func postKey(code: String, down: Bool, mods: Mods) {
        guard let keyCode = Input.keyCode(for: code) else {
            if down { postText(code) }   // unmapped → best-effort unicode fallback
            return
        }
        guard let e = CGEvent(keyboardEventSource: source, virtualKey: keyCode, keyDown: down) else { return }
        e.flags = Input.cgEventFlags(for: mods)
        e.post(tap: .cgSessionEventTap)
    }

    private func postText(_ text: String) {
        var utf16 = Array(text.utf16)
        // Post BOTH down and up carrying the unicode string. A down-only event leaves the key
        // "held" — iOS shows the accent/repeat popover and the text doesn't commit (T009 finding).
        guard let down = CGEvent(keyboardEventSource: source, virtualKey: 0, keyDown: true),
              let up = CGEvent(keyboardEventSource: source, virtualKey: 0, keyDown: false) else { return }
        down.keyboardSetUnicodeString(stringLength: utf16.count, unicodeString: &utf16)
        up.keyboardSetUnicodeString(stringLength: utf16.count, unicodeString: &utf16)
        down.post(tap: .cgSessionEventTap)
        up.post(tap: .cgSessionEventTap)
    }
}
