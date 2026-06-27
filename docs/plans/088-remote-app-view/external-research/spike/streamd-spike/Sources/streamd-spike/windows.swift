import Foundation
import AppKit
import ScreenCaptureKit
import ApplicationServices
import CoreGraphics

func runPreflight() {
    let screen = CGPreflightScreenCaptureAccess()
    let ax = AXIsProcessTrusted()
    print("screen-recording: \(screen ? "granted" : "NOT granted")")
    print("accessibility:    \(ax ? "granted" : "NOT granted")")
    if hasFlag("--request") {
        if !screen {
            print("requesting Screen Recording (TCC prompt should appear on the host Mac)…")
            _ = CGRequestScreenCaptureAccess()
        }
        if !ax {
            print("requesting Accessibility (TCC prompt should appear on the host Mac)…")
            let opts = [kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true] as CFDictionary
            _ = AXIsProcessTrustedWithOptions(opts)
        }
    }
}

func fetchShareableWindows(onScreenOnly: Bool = false) -> [SCWindow] {
    var windows: [SCWindow] = []
    var err: Error?
    let sem = DispatchSemaphore(value: 0)
    SCShareableContent.getExcludingDesktopWindows(false, onScreenWindowsOnly: onScreenOnly) { content, error in
        windows = content?.windows ?? []
        err = error
        sem.signal()
    }
    sem.wait()
    if let e = err {
        fail("SCShareableContent failed: \(e.localizedDescription)\nIf this is a TCC denial, grant Screen Recording in System Settings → Privacy & Security → Screen Recording, then relaunch the invoking app.")
    }
    return windows
}

func resolveTargetWindow() -> SCWindow {
    let windows = fetchShareableWindows()
    if let idStr = flagValue("--window-id"), let wid = UInt32(idStr) {
        guard let w = windows.first(where: { $0.windowID == wid }) else { fail("no shareable window with id \(wid)") }
        return w
    }
    let app = flagValue("--app")?.lowercased()
    let title = flagValue("--title")?.lowercased()
    guard app != nil || title != nil else { fail("need --app, --title, or --window-id") }
    let candidates = windows.filter { w in
        let a = w.owningApplication?.applicationName.lowercased() ?? ""
        let t = (w.title ?? "").lowercased()
        if let app, !a.contains(app) { return false }
        if let title, !t.contains(title) { return false }
        return true
    }.sorted { $0.frame.width * $0.frame.height > $1.frame.width * $1.frame.height }
    guard let w = candidates.first else { fail("no window matched (try `list`)") }
    return w
}

func cgBounds(of windowID: CGWindowID) -> CGRect? {
    guard let infos = CGWindowListCopyWindowInfo(.optionIncludingWindow, windowID) as? [[String: Any]],
          let info = infos.first,
          let dictAny = info[kCGWindowBounds as String]
    else { return nil }
    return CGRect(dictionaryRepresentation: dictAny as! CFDictionary)
}

func runList() {
    for w in fetchShareableWindows() {
        let app = w.owningApplication?.applicationName ?? "?"
        let pid = w.owningApplication?.processID ?? 0
        let line = String(format: "id=%-7d pid=%-7d on=%d %5.0fx%-5.0f %@ — %@",
                          w.windowID, pid, w.isOnScreen ? 1 : 0,
                          w.frame.width, w.frame.height, app, w.title ?? "")
        print(line)
    }
}

func runWindowID() {
    if let checkStr = flagValue("--check"), let wid = UInt32(checkStr) {
        let cgList = (CGWindowListCopyWindowInfo(.optionAll, kCGNullWindowID) as? [[String: Any]]) ?? []
        let inCG = cgList.contains { ($0[kCGWindowNumber as String] as? Int) == Int(wid) }
        let scWindow = fetchShareableWindows().first(where: { $0.windowID == wid })
        print("CGWindowList contains \(wid): \(inCG)")
        if let w = scWindow {
            print("SCShareableContent contains \(wid): true — \(w.owningApplication?.applicationName ?? "?") — \(w.title ?? "")")
        } else {
            print("SCShareableContent contains \(wid): false")
        }
        exit(inCG && scWindow != nil ? 0 : 2)
    }
    let w = resolveTargetWindow()
    print("\(w.windowID)")
    let meta = "app=\(w.owningApplication?.applicationName ?? "?") title=\(w.title ?? "") frame=\(w.frame)\n"
    FileHandle.standardError.write(meta.data(using: .utf8)!)
}
