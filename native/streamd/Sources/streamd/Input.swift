import Foundation

/// Input injection (dossier T007). This file owns the **pure, unit-testable** half:
/// the DOM `KeyboardEvent.code` → macOS virtual-keycode table. The live CGEvent
/// injection (mouse de-normalization via `kCGWindowBounds`, `CGEventKeyboardSetUnicodeString`
/// for `text`, focus-follows-stream, AC-10 auto-restore) lands in Batch B — it needs the
/// Accessibility TCC grant and `CGEvent`, which require CG-init (`CoreGraphicsInit.ensure`).
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
}
