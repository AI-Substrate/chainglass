import Foundation
import AppKit
import CoreGraphics
import ApplicationServices

// CGEvent injection per Workshop 003's input model: focus-follows-stream
// (activate the target app first, as the daemon will), absolute screen
// coordinates from kCGWindowBounds (top-left origin global space).

func post(_ e: CGEvent?) {
    e?.post(tap: .cghidEventTap)
    usleep(30_000)
}

func doClick(at p: CGPoint) {
    print("click at (\(Int(p.x)), \(Int(p.y)))")
    post(CGEvent(mouseEventSource: nil, mouseType: .leftMouseDown, mouseCursorPosition: p, mouseButton: .left))
    post(CGEvent(mouseEventSource: nil, mouseType: .leftMouseUp, mouseCursorPosition: p, mouseButton: .left))
}

func doDrag(from a: CGPoint, to b: CGPoint) {
    print("drag (\(Int(a.x)), \(Int(a.y))) → (\(Int(b.x)), \(Int(b.y)))")
    post(CGEvent(mouseEventSource: nil, mouseType: .leftMouseDown, mouseCursorPosition: a, mouseButton: .left))
    let steps = 12
    for i in 1...steps {
        let t = Double(i) / Double(steps)
        let p = CGPoint(x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t)
        post(CGEvent(mouseEventSource: nil, mouseType: .leftMouseDragged, mouseCursorPosition: p, mouseButton: .left))
    }
    post(CGEvent(mouseEventSource: nil, mouseType: .leftMouseUp, mouseCursorPosition: b, mouseButton: .left))
}

func doScroll(at p: CGPoint, lines: Int32) {
    print("scroll \(lines) lines at (\(Int(p.x)), \(Int(p.y)))")
    post(CGEvent(mouseEventSource: nil, mouseType: .mouseMoved, mouseCursorPosition: p, mouseButton: .left))
    post(CGEvent(scrollWheelEvent2Source: nil, units: .line, wheelCount: 1, wheel1: lines, wheel2: 0, wheel3: 0))
}

func doTypeUnicode(_ s: String) {
    print("type \"\(s)\" via unicode-string injection (virtualKey 0)")
    for scalar in s.unicodeScalars {
        var ch = [UniChar(scalar.value)]
        let down = CGEvent(keyboardEventSource: nil, virtualKey: 0, keyDown: true)
        down?.keyboardSetUnicodeString(stringLength: 1, unicodeString: &ch)
        post(down)
        let up = CGEvent(keyboardEventSource: nil, virtualKey: 0, keyDown: false)
        up?.keyboardSetUnicodeString(stringLength: 1, unicodeString: &ch)
        post(up)
    }
}

func doTypeKeycodes() {
    // Hardware-style scancode taps — what raw-input games read: W A S D space.
    let keys: [(CGKeyCode, String)] = [(13, "w"), (0, "a"), (1, "s"), (2, "d"), (49, "space")]
    print("type via hardware keycodes: \(keys.map { $0.1 }.joined(separator: ","))")
    for (code, _) in keys {
        post(CGEvent(keyboardEventSource: nil, virtualKey: code, keyDown: true))
        post(CGEvent(keyboardEventSource: nil, virtualKey: code, keyDown: false))
        usleep(80_000)
    }
}

func runInject() {
    // Same CGS/WindowServer init the capture path needs (CGEvent/CGWindow calls
    // touch CoreGraphics); a bare CLI otherwise risks the CGS_REQUIRE_INIT abort.
    _ = NSApplication.shared
    NSApplication.shared.setActivationPolicy(.prohibited)
    guard AXIsProcessTrusted() else {
        let opts = [kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true] as CFDictionary
        _ = AXIsProcessTrustedWithOptions(opts)
        fail("Accessibility not granted — prompt requested on the host Mac. Grant in System Settings → Privacy & Security → Accessibility, then re-run.")
    }
    let w = resolveTargetWindow()
    let actions = (flagValue("--actions") ?? "click,drag,scroll,type").split(separator: ",").map(String.init)
    let text = flagValue("--text") ?? "hello"

    if let pid = w.owningApplication?.processID, let app = NSRunningApplication(processIdentifier: pid) {
        app.activate()
        Thread.sleep(forTimeInterval: 0.6)
    }

    guard let f = cgBounds(of: w.windowID) else { fail("no kCGWindowBounds for window \(w.windowID)") }
    print("target: \(w.owningApplication?.applicationName ?? "?") — \(w.title ?? "")")
    print("kCGWindowBounds=\(f) (top-left origin) vs SCWindow.frame=\(w.frame)")
    let center = CGPoint(x: f.midX, y: f.midY)

    for action in actions {
        switch action {
        case "click":
            doClick(at: center)
        case "drag":
            doDrag(from: CGPoint(x: f.midX - f.width * 0.25, y: f.midY),
                   to: CGPoint(x: f.midX + f.width * 0.25, y: f.midY + f.height * 0.15))
        case "scroll":
            doScroll(at: center, lines: -4)
            usleep(250_000)
            doScroll(at: center, lines: 4)
        case "type":
            doTypeUnicode(text)
            usleep(150_000)
            doTypeKeycodes()
        case "clickat":
            let dx = Double(flagValue("--dx") ?? "0") ?? 0
            let dy = Double(flagValue("--dy") ?? "0") ?? 0
            doClick(at: CGPoint(x: f.origin.x + dx, y: f.origin.y + dy))
        case "typeonly":
            doTypeUnicode(text)
        default:
            print("unknown action \(action)")
        }
        usleep(400_000)
    }
    print("inject sequence complete: \(actions.joined(separator: ","))")
}
