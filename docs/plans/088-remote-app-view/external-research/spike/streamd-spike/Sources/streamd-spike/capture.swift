import Foundation
import AppKit
import ScreenCaptureKit
import CoreMedia
import CoreVideo
import VideoToolbox
import ImageIO

final class CaptureOutput: NSObject, SCStreamOutput, SCStreamDelegate {
    private let lock = NSLock()
    private var secondCount = 0
    private(set) var totalCount = 0
    private var lastBuffer: CVPixelBuffer?
    var onFrame: ((CVPixelBuffer, CMTime) -> Void)?

    func stream(_ stream: SCStream, didOutputSampleBuffer sampleBuffer: CMSampleBuffer, of type: SCStreamOutputType) {
        guard type == .screen, CMSampleBufferIsValid(sampleBuffer) else { return }
        guard let atts = CMSampleBufferGetSampleAttachmentsArray(sampleBuffer, createIfNecessary: false) as? [[SCStreamFrameInfo: Any]],
              let statusRaw = atts.first?[.status] as? Int,
              statusRaw == SCFrameStatus.complete.rawValue,
              let pb = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }
        let pts = CMSampleBufferGetPresentationTimeStamp(sampleBuffer)
        lock.lock()
        secondCount += 1
        totalCount += 1
        lastBuffer = pb
        lock.unlock()
        onFrame?(pb, pts)
    }

    func stream(_ stream: SCStream, didStopWithError error: Error) {
        FileHandle.standardError.write("stream stopped: \(error.localizedDescription)\n".data(using: .utf8)!)
    }

    func takeSecondCount() -> Int {
        lock.lock(); defer { lock.unlock() }
        let c = secondCount
        secondCount = 0
        return c
    }

    func snapshotLast() -> CVPixelBuffer? {
        lock.lock(); defer { lock.unlock() }
        return lastBuffer
    }
}

/// Starts a per-window SCK stream. Dimensions are window points × screen scale,
/// rounded down to even (VideoToolbox requirement when the buffers feed encode).
func startStream(window: SCWindow, fps: Int, output: CaptureOutput) -> (SCStream, Int, Int) {
    let filter = SCContentFilter(desktopIndependentWindow: window)
    let cfg = SCStreamConfiguration()
    let scale = NSScreen.main?.backingScaleFactor ?? 2.0
    var width = max(16, Int(window.frame.width * scale))
    var height = max(16, Int(window.frame.height * scale))
    width -= width % 2
    height -= height % 2
    cfg.width = width
    cfg.height = height
    cfg.minimumFrameInterval = CMTime(value: 1, timescale: CMTimeScale(fps))
    cfg.pixelFormat = kCVPixelFormatType_32BGRA
    cfg.queueDepth = 5
    cfg.showsCursor = true
    let stream = SCStream(filter: filter, configuration: cfg, delegate: output)
    do {
        try stream.addStreamOutput(output, type: .screen, sampleHandlerQueue: DispatchQueue(label: "capture.frames"))
    } catch {
        fail("addStreamOutput: \(error.localizedDescription)")
    }
    var startErr: Error?
    let sem = DispatchSemaphore(value: 0)
    stream.startCapture { e in
        startErr = e
        sem.signal()
    }
    sem.wait()
    if let e = startErr {
        fail("startCapture: \(e.localizedDescription) (if TCC: grant Screen Recording and relaunch the invoking app)")
    }
    return (stream, width, height)
}

func writePNG(_ pb: CVPixelBuffer, to url: URL) {
    var cg: CGImage?
    VTCreateCGImageFromCVPixelBuffer(pb, options: nil, imageOut: &cg)
    guard let img = cg,
          let dest = CGImageDestinationCreateWithURL(url as CFURL, "public.png" as CFString, 1, nil) else { return }
    CGImageDestinationAddImage(dest, img, nil)
    CGImageDestinationFinalize(dest)
}

func runCapture() {
    let w = resolveTargetWindow()
    let duration = Int(flagValue("--duration") ?? "60") ?? 60
    let stillsEvery = Int(flagValue("--stills-every") ?? "10") ?? 10
    let outDir = URL(fileURLWithPath: flagValue("--out") ?? "captures")
    let defaultLabel = w.owningApplication?.applicationName.lowercased().replacingOccurrences(of: " ", with: "-") ?? "win"
    let label = flagValue("--label") ?? defaultLabel
    try? FileManager.default.createDirectory(at: outDir, withIntermediateDirectories: true)

    let appName = w.owningApplication?.applicationName ?? "?"
    print("target: id=\(w.windowID) \(appName) — \(w.title ?? "") frame=\(Int(w.frame.width))x\(Int(w.frame.height)) onScreen=\(w.isOnScreen)")
    let output = CaptureOutput()
    let (stream, width, height) = startStream(window: w, fps: 60, output: output)
    print("capturing \(duration)s @60fps target, \(width)x\(height) px…")
    var fpsLog: [Int] = []
    for sec in 1...duration {
        Thread.sleep(forTimeInterval: 1.0)
        let c = output.takeSecondCount()
        fpsLog.append(c)
        print("sec \(sec): \(c) fps")
        if sec % stillsEvery == 0, let pb = output.snapshotLast() {
            let url = outDir.appendingPathComponent("\(label)-sec\(String(format: "%02d", sec)).png")
            writePNG(pb, to: url)
            print("  still → \(url.lastPathComponent)")
        }
    }
    let sem = DispatchSemaphore(value: 0)
    stream.stopCapture { _ in sem.signal() }
    sem.wait()
    let avg = Double(fpsLog.reduce(0, +)) / Double(max(1, fpsLog.count))
    print(String(format: "done: total=%d frames, avg=%.1f fps, min=%d, max=%d over %ds",
                 output.totalCount, avg, fpsLog.min() ?? 0, fpsLog.max() ?? 0, duration))
}
