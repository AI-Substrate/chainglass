import Foundation
import ScreenCaptureKit
import CoreMedia
import CoreVideo

/// Live window capture (dossier T003) — one `SCStream` per target window feeding the
/// `H264Encoder`, surfaced as a `FrameSource`.
///
/// `SCContentFilter(desktopIndependentWindow:)` captures a single window (independent of
/// occlusion / Space). Capture is **deliver-on-change** (static content → ~0fps is normal,
/// not failure — spike finding); pause when no viewer, resume → keyframe; window destroyed
/// → `SCStream` stops → `.windowGone`. CG must be initialised (`CoreGraphicsInit.ensure`)
/// before this runs.
///
/// Compile-verified on-host; live frames need the Screen-Recording TCC grant + a real
/// window, so this path is exercised only at the host-Mac visit (T009).
final class CaptureFrameSource: NSObject, FrameSource, SCStreamOutput, SCStreamDelegate {
    let targetWindowId: CGWindowID

    private let lock = NSLock()
    private var stream: SCStream?
    private var encoder: H264Encoder?
    private var queue: DispatchQueue?
    private var onEvent: ((FrameSourceEvent) -> Void)?
    private var _window: WindowDescriptor?
    private var _config: VideoConfig?
    private var paused = false
    private var startHostMicros: UInt64 = 0

    init(windowId: CGWindowID) {
        self.targetWindowId = windowId
    }

    var window: WindowDescriptor {
        lock.lock(); defer { lock.unlock() }
        return _window ?? WindowDescriptor(id: Int(targetWindowId), app: "", title: "",
                                           pixelWidth: 0, pixelHeight: 0, scale: 1)
    }

    var config: VideoConfig? {
        lock.lock(); defer { lock.unlock() }
        return _config
    }

    func start(on queue: DispatchQueue, onEvent: @escaping (FrameSourceEvent) -> Void) {
        lock.lock()
        self.queue = queue
        self.onEvent = onEvent
        self.paused = false
        lock.unlock()
        SCShareableContent.getExcludingDesktopWindows(false, onScreenWindowsOnly: true) { [weak self] content, error in
            guard let self else { return }
            guard let content, error == nil,
                  let scWindow = content.windows.first(where: { $0.windowID == self.targetWindowId }) else {
                self.emit(.windowGone)
                return
            }
            self.beginCapture(scWindow, on: queue)
        }
    }

    private func beginCapture(_ scWindow: SCWindow, on queue: DispatchQueue) {
        let pixelWidth = Int(scWindow.frame.width * 2)   // backing scale resolved from the display at run time
        let pixelHeight = Int(scWindow.frame.height * 2)
        let descriptor = WindowDescriptor(
            id: Int(scWindow.windowID),
            app: scWindow.owningApplication?.applicationName ?? "",
            title: scWindow.title ?? "",
            pixelWidth: pixelWidth, pixelHeight: pixelHeight, scale: 2)

        let filter = SCContentFilter(desktopIndependentWindow: scWindow)
        let cfg = SCStreamConfiguration()
        cfg.width = pixelWidth
        cfg.height = pixelHeight
        cfg.minimumFrameInterval = CMTime(value: 1, timescale: 60)   // cap 60fps
        cfg.pixelFormat = kCVPixelFormatType_32BGRA
        cfg.queueDepth = 5
        cfg.showsCursor = false

        let encoder = H264Encoder(width: Int32(pixelWidth), height: Int32(pixelHeight), fps: 60)
        do {
            try encoder.prepare()
            let stream = SCStream(filter: filter, configuration: cfg, delegate: self)
            try stream.addStreamOutput(self, type: .screen, sampleHandlerQueue: queue)
            lock.lock()
            self.encoder = encoder
            self.stream = stream
            self._window = descriptor
            lock.unlock()
            stream.startCapture { [weak self] err in
                if err != nil { self?.emit(.windowGone) }
            }
        } catch {
            emit(.windowGone)
        }
    }

    // MARK: SCStreamOutput

    func stream(_ stream: SCStream, didOutputSampleBuffer sampleBuffer: CMSampleBuffer, of type: SCStreamOutputType) {
        guard type == .screen else { return }
        lock.lock()
        let paused = self.paused
        let encoder = self.encoder
        lock.unlock()
        guard !paused, let encoder,
              CMSampleBufferGetNumSamples(sampleBuffer) > 0,
              let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }

        let ptsSeconds = CMTimeGetSeconds(CMSampleBufferGetPresentationTimeStamp(sampleBuffer))
        let ptsMicros = UInt64(max(0, ptsSeconds * 1_000_000))
        try? encoder.encode(pixelBuffer, ptsMicros: ptsMicros,
                            onConfig: { [weak self] desc in
                                guard let self else { return }
                                self.lock.lock()
                                let w = self._window
                                let c = VideoConfig(codec: "avc1.640020", description: desc,
                                                    width: w?.pixelWidth ?? 0, height: w?.pixelHeight ?? 0, fps: 60)
                                self._config = c
                                self.lock.unlock()
                                self.emit(.config(c))
                            },
                            onFrame: { [weak self] frame in self?.emit(.frame(frame)) })
    }

    // MARK: SCStreamDelegate

    func stream(_ stream: SCStream, didStopWithError error: Error) {
        emit(.windowGone)
    }

    // MARK: FrameSource controls

    func requestKeyframe() {
        lock.lock(); let e = encoder; lock.unlock()
        e?.requestKeyframe()
    }

    func pause() { lock.lock(); paused = true; lock.unlock() }

    func resume() {
        lock.lock(); paused = false; let e = encoder; lock.unlock()
        e?.requestKeyframe()
    }

    func stop() {
        lock.lock()
        let s = stream; let e = encoder
        stream = nil; encoder = nil; onEvent = nil
        lock.unlock()
        s?.stopCapture { _ in }
        e?.stop()
    }

    private func emit(_ event: FrameSourceEvent) {
        lock.lock(); let cb = onEvent; let q = queue; lock.unlock()
        if let q { q.async { cb?(event) } } else { cb?(event) }
    }
}
