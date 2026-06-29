import Foundation
import CoreGraphics

/// Input injection for whole-*display* capture — the window sibling of `CGEventInputInjector`
/// (Plan 088 multi-target capture).
///
/// Differences from the window injector, both intrinsic to "drive the whole desktop":
///   - de-normalize against the display's **global** bounds (`CGDisplayBounds`, already in
///     CGEvent's top-left-origin coordinate space — no per-window `kCGWindowBounds` lookup);
///   - **no focus-follows / window-raise**: the target is the whole screen, so there is no single
///     app to bring frontmost; events post globally and land wherever the operator clicks. (This
///     is also why display capture is broader than window capture — it is general desktop control,
///     gated by the same Accessibility grant.)
///
/// Shares the pure `Input.*` statics (keycode map, modifier flags, wheel clamp, button map) with
/// the window path; only the thin CGEvent posting wrappers are restated here so the proven window
/// injector stays untouched. Compile-verified on-host; live posting needs the Accessibility grant.
final class DisplayInputInjector {
    private let displayID: CGDirectDisplayID
    private let source = CGEventSource(stateID: .hidSystemState)
    private var heldButton: MouseButton?   // held across batches → drag vs move (T009 finding)

    init(displayID: CGDirectDisplayID) {
        self.displayID = displayID
    }

    /// Inject a batch of events in order (called on the WS queue).
    func inject(_ events: [InputEvent]) {
        let bounds = CGDisplayBounds(displayID)   // global, top-left origin = CGEvent's space
        for event in events { inject(event, in: bounds) }
    }

    private func inject(_ event: InputEvent, in bounds: CGRect) {
        switch event {
        case let .mousemove(x, y):
            if let b = heldButton {
                post(mouse: dragType(b), at: screenPoint(x, y, bounds), button: Input.cgMouseButton(b))
            } else {
                post(mouse: .mouseMoved, at: screenPoint(x, y, bounds), button: .left)
            }
        case let .mousedown(x, y, button):
            heldButton = button
            post(mouse: downType(button), at: screenPoint(x, y, bounds), button: Input.cgMouseButton(button))
        case let .mouseup(x, y, button):
            post(mouse: upType(button), at: screenPoint(x, y, bounds), button: Input.cgMouseButton(button))
            if heldButton == button { heldButton = nil }
        case let .wheel(x, y, dx, dy):
            if let e = CGEvent(scrollWheelEvent2Source: source, units: .pixel, wheelCount: 2,
                               wheel1: Input.clampWheel(-dy), wheel2: Input.clampWheel(-dx), wheel3: 0) {
                e.location = screenPoint(x, y, bounds)
                e.post(tap: .cgSessionEventTap)
            }
        case let .keydown(code, mods):
            postKey(code: code, down: true, mods: mods)
        case let .keyup(code, mods):
            postKey(code: code, down: false, mods: mods)
        case let .text(text):
            postText(text)
        }
    }

    // MARK: geometry — de-normalize `[0,1]` → global screen points within the display bounds.

    private func screenPoint(_ x: Double, _ y: Double, _ bounds: CGRect) -> CGPoint {
        CGPoint(x: bounds.origin.x + CGFloat(x) * bounds.width,
                y: bounds.origin.y + CGFloat(y) * bounds.height)
    }

    // MARK: posting (parallels CGEventInputInjector; same pure Input.* statics)

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
        guard let down = CGEvent(keyboardEventSource: source, virtualKey: 0, keyDown: true),
              let up = CGEvent(keyboardEventSource: source, virtualKey: 0, keyDown: false) else { return }
        down.keyboardSetUnicodeString(stringLength: utf16.count, unicodeString: &utf16)
        up.keyboardSetUnicodeString(stringLength: utf16.count, unicodeString: &utf16)
        down.post(tap: .cgSessionEventTap)
        up.post(tap: .cgSessionEventTap)
    }
}
