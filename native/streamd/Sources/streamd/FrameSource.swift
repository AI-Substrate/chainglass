import Foundation

/// Encoded-video source abstraction (dossier T003) — the seam that lets the WS server
/// (T006) be exercised **headless, with no TCC grants**.
///
/// Two implementations satisfy `FrameSource`:
///  - `CaptureFrameSource` (`Capture.swift`) — live ScreenCaptureKit → VideoToolbox
///    H.264. Needs the Screen-Recording grant + a real window; verified at the host-Mac
///    visit (T009).
///  - `FixtureFrameSource` (below) — replays the recorded Phase-1 H.264 fixtures
///    (`protocol/fixtures/video/`, the same bytes the Phase-3 browser harness decoded).
///    Needs nothing but the filesystem, so the daemon can stream a *real* authenticated
///    socket to a browser on any Mac. It is the daemon-side analogue of `fake-streamd.ts`.
///
/// The WS layer is identical for both: it caches the latest `VideoConfig`, and wraps each
/// `VideoFrame` in a 16-byte binary header (`BinaryFrame`) with the session's sequence and
/// the frame's keyframe bit.

/// One encoded H.264 access unit (AVCC: 4-byte big-endian length-prefixed NALs).
struct VideoFrame: Equatable {
    /// IDR access unit — sets the binary header's keyframe flag and the decoder's `'key'` type.
    let isKeyframe: Bool
    /// Daemon capture clock (microseconds) → binary header `captureTimestampMicros`.
    let captureTimestampMicros: UInt64
    /// One AVCC access unit — the binary frame payload (bytes 16+).
    let avcc: [UInt8]
}

/// Static stream description → the `video-config` control message (sent before any frame,
/// resent on resize). `description` is the base64 avcC (SPS/PPS) the browser `VideoDecoder`
/// requires; without it `isConfigSupported` fails (spike finding).
struct VideoConfig: Equatable {
    let codec: String
    let description: String
    let width: Int
    let height: Int
    let fps: Double
}

/// Events a `FrameSource` emits on its delivery queue. `config` precedes the first `frame`
/// and is re-emitted on resize (the WS layer resends `video-config` then forces a keyframe).
/// `windowState`/`windowGone` drive the `window-state{…}` / `E_WINDOW_GONE` + `bye{window-gone}`
/// messages this task (T003) owns.
enum FrameSourceEvent: Equatable {
    case config(VideoConfig)
    case frame(VideoFrame)
    case windowState(WindowStateName, pixelWidth: Int?, pixelHeight: Int?)
    case windowGone
    /// Capture could not start because a TCC grant is missing. `grant` names the denied grant
    /// (e.g. `"screen-recording"`) so the WS layer can send `error{E_PERMISSION, message:<grant>}`
    /// instead of the generic `windowGone` (F007).
    case permissionDenied(grant: String)
}

/// Source of encoded frames for the one captured window.
protocol FrameSource: AnyObject {
    /// Window descriptor for the `hello-ok` handshake.
    var window: WindowDescriptor { get }
    /// Known upfront for fixtures; `nil` for live capture until the first encoded keyframe
    /// (avcC is only available once VideoToolbox produces a frame).
    var config: VideoConfig? { get }
    /// Begin producing events on `queue`. The first `frame` after `start`/`resume`/
    /// `requestKeyframe` is a keyframe.
    func start(on queue: DispatchQueue, onEvent: @escaping (FrameSourceEvent) -> Void)
    /// Force the *next* emitted frame to be a keyframe (late-join, drop-to-keyframe, resume).
    func requestKeyframe()
    func pause()
    func resume()
    func stop()
}

// MARK: - Fixture replay (headless; no TCC grant)

/// Replays the recorded Phase-1 H.264 fixtures at the manifest fps. Dependency-free
/// (Foundation only) so it runs on any host. Drives the T006 headless smoke and the live
/// fallback when no window is available. Mirrors `fake-streamd.ts`'s frame pacing.
final class FixtureFrameSource: FrameSource {
    let config: VideoConfig?
    let window: WindowDescriptor

    private let fixtureConfig: VideoConfig
    private let payloads: [[UInt8]]
    private let keyframes: [Bool]
    private let ptsMicros: [UInt64]

    private let lock = NSLock()
    private var timer: DispatchSourceTimer?
    private var onEvent: ((FrameSourceEvent) -> Void)?
    private var index = 0
    private var forceKeyframeNext = true
    private var paused = false
    private var emittedConfig = false

    /// Decode the manifest at `fixturesDir/manifest.json` and pre-load every frame file.
    init(fixturesDir: String,
         window: WindowDescriptor = WindowDescriptor(
            id: 34202, app: "Godot", title: "spike-target",
            pixelWidth: 800, pixelHeight: 656, scale: 2)) throws {
        let manifestURL = URL(fileURLWithPath: fixturesDir).appendingPathComponent("manifest.json")
        let manifest = try JSONDecoder().decode(Manifest.self, from: Data(contentsOf: manifestURL))
        let cfg = VideoConfig(codec: manifest.codec, description: manifest.description,
                              width: manifest.width, height: manifest.height, fps: manifest.fps)
        self.fixtureConfig = cfg
        self.config = cfg
        var payloads: [[UInt8]] = []
        var keyframes: [Bool] = []
        var pts: [UInt64] = []
        payloads.reserveCapacity(manifest.frames.count)
        for f in manifest.frames {
            let url = URL(fileURLWithPath: fixturesDir).appendingPathComponent(f.file)
            payloads.append(Array(try Data(contentsOf: url)))
            keyframes.append(f.keyframe)
            pts.append(UInt64(max(0, f.ptsMicros)))
        }
        self.payloads = payloads
        self.keyframes = keyframes
        self.ptsMicros = pts
        self.window = WindowDescriptor(id: window.id, app: window.app, title: window.title,
                                       pixelWidth: manifest.width, pixelHeight: manifest.height,
                                       scale: window.scale)
    }

    private struct Manifest: Decodable {
        let codec: String
        let description: String
        let fps: Double
        let width: Int
        let height: Int
        let frames: [Frame]
        struct Frame: Decodable { let file: String; let keyframe: Bool; let ptsMicros: Int }
    }

    func start(on queue: DispatchQueue, onEvent: @escaping (FrameSourceEvent) -> Void) {
        lock.lock()
        guard !payloads.isEmpty else { lock.unlock(); return }
        self.onEvent = onEvent
        self.index = 0
        self.forceKeyframeNext = true
        self.paused = false
        self.emittedConfig = false
        let interval = fixtureConfig.fps > 0 ? 1.0 / fixtureConfig.fps : 1.0 / 60.0
        let t = DispatchSource.makeTimerSource(queue: queue)
        t.schedule(deadline: .now(), repeating: interval, leeway: .milliseconds(2))
        t.setEventHandler { [weak self] in self?.tick() }
        self.timer = t
        lock.unlock()
        t.resume()
    }

    private func tick() {
        lock.lock()
        if paused || payloads.isEmpty { lock.unlock(); return }
        let cb = onEvent
        var emitConfig: VideoConfig?
        if !emittedConfig { emittedConfig = true; emitConfig = fixtureConfig }
        if forceKeyframeNext { index = nearestKeyframe(atOrAfter: 0); forceKeyframeNext = false }
        let i = index
        let isKey = keyframes.isEmpty ? true : (keyframes[i] || i == 0)
        let frame = VideoFrame(isKeyframe: isKey, captureTimestampMicros: ptsMicros[i], avcc: payloads[i])
        index = (i + 1) % payloads.count
        lock.unlock()
        if let c = emitConfig { cb?(.config(c)) }
        cb?(.frame(frame))
    }

    /// Index of the next keyframe at or after `start` (wraps); 0 if none flagged.
    private func nearestKeyframe(atOrAfter start: Int) -> Int {
        guard !keyframes.isEmpty else { return 0 }
        for offset in 0..<keyframes.count {
            let i = (start + offset) % keyframes.count
            if keyframes[i] { return i }
        }
        return 0
    }

    func requestKeyframe() { lock.lock(); forceKeyframeNext = true; lock.unlock() }
    func pause() { lock.lock(); paused = true; lock.unlock() }
    func resume() { lock.lock(); paused = false; forceKeyframeNext = true; lock.unlock() }

    func stop() {
        lock.lock()
        timer?.cancel(); timer = nil; onEvent = nil
        lock.unlock()
    }
}
