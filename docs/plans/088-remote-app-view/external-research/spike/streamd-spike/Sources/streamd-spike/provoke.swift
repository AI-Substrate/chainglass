import Foundation
import AppKit
import ScreenCaptureKit
import ApplicationServices
import CoreGraphics

// `provoke` — the reliable TCC-prompt trigger. Run this from a SIGNED .app via
// `open` so LaunchServices places it in the GUI login session; then a real
// capture attempt + accessibility request raise the dialogs and create named
// Settings entries (the bare CLI, launched under the tmux server, can't).
// Stays alive while the human grants, logging the bundle's own grant state.
func runProvoke() {
    let seconds = Int(flagValue("--seconds") ?? "300") ?? 300
    let bundleId = Bundle.main.bundleIdentifier ?? "(none — running as bare binary; sign+bundle me)"
    func now() -> String { let d = ISO8601DateFormatter(); return d.string(from: Date()) }

    print("provoke start \(now()) — identity: \(bundleId)")
    print("path: \(Bundle.main.bundlePath)")

    // 1) Screen Recording — request triggers the prompt if state is not-determined.
    let screenBefore = CGPreflightScreenCaptureAccess()
    print("screen-recording before: \(screenBefore ? "granted" : "not granted") → requesting…")
    _ = CGRequestScreenCaptureAccess()

    // 2) Real capture attempt — also raises/refreshes the prompt and proves access.
    SCShareableContent.getExcludingDesktopWindows(false, onScreenWindowsOnly: false) { content, error in
        if let error {
            print("SCShareableContent error (expected until granted): \(error.localizedDescription)")
        } else {
            print("SCShareableContent OK — \(content?.windows.count ?? 0) windows visible (capture access live)")
        }
    }

    // 3) Accessibility — prompt + add an unchecked entry to the Accessibility list.
    let axBefore = AXIsProcessTrusted()
    print("accessibility before: \(axBefore ? "granted" : "not granted") → requesting…")
    let opts = [kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true] as CFDictionary
    _ = AXIsProcessTrustedWithOptions(opts)

    print("WAITING up to \(seconds)s — grant 'ChainglassSpike' under Screen Recording AND Accessibility in System Settings.")
    fflush(stdout)

    // 4) Stay alive; poll this BUNDLE's grant state (distinct from the CLI binary's).
    var elapsed = 0
    while elapsed < seconds {
        Thread.sleep(forTimeInterval: 5)
        elapsed += 5
        let sr = CGPreflightScreenCaptureAccess()
        let ax = AXIsProcessTrusted()
        print("[\(elapsed)s] screen-recording=\(sr ? "GRANTED" : "no")  accessibility=\(ax ? "GRANTED" : "no")")
        fflush(stdout)
        if sr && ax {
            print("BOTH GRANTED at \(now()) — provoke done.")
            fflush(stdout)
            return
        }
    }
    print("provoke timed out after \(seconds)s.")
    fflush(stdout)
}
