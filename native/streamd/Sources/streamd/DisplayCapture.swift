import Foundation
import ScreenCaptureKit
import CoreMedia
import CoreVideo
import CoreGraphics
import AppKit

/// Live whole-*display* capture — the window sibling of `CaptureFrameSource` for the
/// "stream the whole desktop" target (Plan 088 multi-target capture).
///
/// `SCContentFilter(display:excludingWindows:)` captures an entire screen (every window on it,
/// the wallpaper, the menu bar). The encode/keyframe/pause path is identical to the window source;
/// only the SCK filter + the target descriptor differ — a captured display presents on the wire AS
/// a `WindowDescriptor` (`id`=displayID, `app`="Desktop", `title`=screen label) so `hello-ok`, the
/// viewport, and the input plane are unchanged.
///
/// Deliberately parallel to `CaptureFrameSource` rather than a refactor of it: that path is proven
/// live, host-only-testable, and shares no mutable state — duplicating the ~30-line encode shell is
/// lower risk than threading a filter strategy through it. Compile-verified on-host; live frames
/// need the Screen-Recording TCC grant + a real display (exercised at the host-Mac visit).
final class DisplayCaptureFrameSource: NSObject, FrameSource, SCStreamOutput, SCStreamDelegate {
    let targetDisplayId: CGDirectDisplayID

    private let lock = NSLock()
    private var stream: SCStream?
    private var encoder: H264Encoder?
    private var queue: DispatchQueue?
    private var onEvent: ((FrameSourceEvent) -> Void)?
    private var _window: WindowDescriptor?
    private var _config: VideoConfig?
    private var paused = false

    init(displayId: CGDirectDisplayID) {
        self.targetDisplayId = displayId
    }

    var window: WindowDescriptor {
        lock.lock(); defer { lock.unlock() }
        return _window ?? WindowDescriptor(id: Int(targetDisplayId), app: "Desktop", title: "",
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
        guard CGPreflightScreenCaptureAccess() else {
            emit(.permissionDenied(grant: "screen-recording"))
            return
        }
        SCShareableContent.getExcludingDesktopWindows(false, onScreenWindowsOnly: true) { [weak self] content, error in
            guard let self else { return }
            guard let content, error == nil else {
                self.emit(.permissionDenied(grant: "screen-recording"))
                return
            }
            guard let scDisplay = content.displays.first(where: { $0.displayID == self.targetDisplayId }) else {
                // The chosen display is gone (unplugged / reconfigured) — same terminal signal a
                // vanished window gives, so the WS layer sends bye{window-gone}.
                self.emit(.windowGone)
                return
            }
            self.beginCapture(scDisplay, on: queue)
        }
    }

    private func beginCapture(_ scDisplay: SCDisplay, on queue: DispatchQueue) {
        let scale = DisplayList.backingScale(forDisplayID: scDisplay.displayID)
        let pixelWidth = Int((Double(scDisplay.width) * scale).rounded())
        let pixelHeight = Int((Double(scDisplay.height) * scale).rounded())
        let descriptor = WindowDescriptor(
            id: Int(scDisplay.displayID),
            app: "Desktop",
            title: DisplayList.label(forDisplayID: scDisplay.displayID, index: 0),
            pixelWidth: pixelWidth, pixelHeight: pixelHeight, scale: scale)

        let filter = SCContentFilter(display: scDisplay, excludingWindows: [])
        let cfg = SCStreamConfiguration()
        cfg.width = pixelWidth
        cfg.height = pixelHeight
        cfg.minimumFrameInterval = CMTime(value: 1, timescale: 60)   // cap 60fps
        cfg.pixelFormat = kCVPixelFormatType_32BGRA
        cfg.queueDepth = 5
        cfg.showsCursor = true   // whole-desktop: the operator wants to see the host cursor

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
                                let c = VideoConfig(codec: CaptureFrameSource.avcCodecString(fromAvcCBase64: desc),
                                                    description: desc,
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
