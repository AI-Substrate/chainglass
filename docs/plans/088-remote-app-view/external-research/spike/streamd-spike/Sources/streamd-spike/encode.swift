import Foundation
import ScreenCaptureKit
import CoreMedia
import VideoToolbox

struct EncodedFrame {
    let data: Data
    let keyframe: Bool
    let ptsMicros: Int64
}

/// VideoToolbox low-latency H.264 session (P-frames only, keyframe forced on
/// first frame, then every MaxKeyFrameInterval). Output is collected as AVCC
/// access units (length-prefixed NALs, exactly as VT emits them) and written as
/// the fixture set with the manifest contract from tasks.md § Fixture landing path.
final class FixtureEncoder {
    private var session: VTCompressionSession?
    private let lock = NSLock()
    private var frames: [EncodedFrame] = []
    private var avcc: Data?
    private var codecString: String?
    private var firstPTS: CMTime?
    private var submitted = 0
    let width: Int
    let height: Int

    init(width: Int, height: Int, fps: Int, bitrate: Int) {
        self.width = width
        self.height = height
        let spec = [kVTVideoEncoderSpecification_EnableLowLatencyRateControl: kCFBooleanTrue!] as CFDictionary
        var s: VTCompressionSession?
        let st = VTCompressionSessionCreate(
            allocator: nil, width: Int32(width), height: Int32(height),
            codecType: kCMVideoCodecType_H264, encoderSpecification: spec,
            imageBufferAttributes: nil, compressedDataAllocator: nil,
            outputCallback: nil, refcon: nil, compressionSessionOut: &s)
        guard st == noErr, let session = s else { fail("VTCompressionSessionCreate failed: \(st)") }
        self.session = session
        VTSessionSetProperty(session, key: kVTCompressionPropertyKey_RealTime, value: kCFBooleanTrue)
        VTSessionSetProperty(session, key: kVTCompressionPropertyKey_AllowFrameReordering, value: kCFBooleanFalse)
        VTSessionSetProperty(session, key: kVTCompressionPropertyKey_MaxKeyFrameInterval, value: 60 as CFNumber)
        VTSessionSetProperty(session, key: kVTCompressionPropertyKey_AverageBitRate, value: bitrate as CFNumber)
        VTSessionSetProperty(session, key: kVTCompressionPropertyKey_ExpectedFrameRate, value: fps as CFNumber)
        VTCompressionSessionPrepareToEncodeFrames(session)
    }

    func encode(_ pb: CVPixelBuffer, pts: CMTime) {
        guard let session else { return }
        lock.lock()
        if firstPTS == nil { firstPTS = pts }
        let isFirst = submitted == 0
        submitted += 1
        lock.unlock()
        let props: CFDictionary? = isFirst
            ? ([kVTEncodeFrameOptionKey_ForceKeyFrame: kCFBooleanTrue!] as CFDictionary)
            : nil
        VTCompressionSessionEncodeFrame(
            session, imageBuffer: pb, presentationTimeStamp: pts, duration: .invalid,
            frameProperties: props, infoFlagsOut: nil
        ) { [weak self] status, _, sb in
            self?.handleOutput(status: status, sb: sb)
        }
    }

    private func handleOutput(status: OSStatus, sb: CMSampleBuffer?) {
        guard status == noErr, let sb, CMSampleBufferDataIsReady(sb),
              let db = CMSampleBufferGetDataBuffer(sb) else { return }

        if avcc == nil, let fmt = CMSampleBufferGetFormatDescription(sb) {
            if let ext = CMFormatDescriptionGetExtension(
                   fmt, extensionKey: kCMFormatDescriptionExtension_SampleDescriptionExtensionAtoms) as? [String: Any],
               let av = ext["avcC"] as? Data {
                lock.lock(); avcc = av; lock.unlock()
            }
            var spsPtr: UnsafePointer<UInt8>? = nil
            var spsSize = 0
            if CMVideoFormatDescriptionGetH264ParameterSetAtIndex(
                   fmt, parameterSetIndex: 0, parameterSetPointerOut: &spsPtr,
                   parameterSetSizeOut: &spsSize, parameterSetCountOut: nil,
                   nalUnitHeaderLengthOut: nil) == noErr,
               let p = spsPtr, spsSize >= 4 {
                lock.lock()
                codecString = String(format: "avc1.%02x%02x%02x", p[1], p[2], p[3])
                lock.unlock()
            }
        }

        var totalLen = 0
        var ptr: UnsafeMutablePointer<CChar>?
        guard CMBlockBufferGetDataPointer(db, atOffset: 0, lengthAtOffsetOut: nil,
                                          totalLengthOut: &totalLen, dataPointerOut: &ptr) == kCMBlockBufferNoErr,
              let p = ptr else { return }
        let data = Data(bytes: p, count: totalLen)
        let attsArr = CMSampleBufferGetSampleAttachmentsArray(sb, createIfNecessary: true) as? [[CFString: Any]]
        let notSync = (attsArr?.first?[kCMSampleAttachmentKey_NotSync] as? Bool) ?? false
        let pts = CMSampleBufferGetPresentationTimeStamp(sb)
        lock.lock()
        let base = firstPTS ?? pts
        let micros = max(0, Int64(CMTimeSubtract(pts, base).seconds * 1_000_000))
        frames.append(EncodedFrame(data: data, keyframe: !notSync, ptsMicros: micros))
        lock.unlock()
    }

    func finishAndWrite(outDir: URL, fps: Int, source: String = "sck-capture") {
        if let session {
            VTCompressionSessionCompleteFrames(session, untilPresentationTimeStamp: .invalid)
            VTCompressionSessionInvalidate(session)
            self.session = nil
        }
        lock.lock()
        let frames = self.frames
        let avcc = self.avcc
        let codec = self.codecString
        lock.unlock()
        guard let avcc, let codec, !frames.isEmpty else {
            fail("no encoded output (avcC present: \(avcc != nil), frames: \(frames.count))")
        }
        let framesDir = outDir.appendingPathComponent("frames")
        try? FileManager.default.createDirectory(at: framesDir, withIntermediateDirectories: true)
        var manifestFrames: [[String: Any]] = []
        for (i, f) in frames.enumerated() {
            let name = String(format: "frame-%04d.bin", i + 1)
            do { try f.data.write(to: framesDir.appendingPathComponent(name)) }
            catch { fail("writing \(name): \(error.localizedDescription)") }
            manifestFrames.append(["file": "frames/\(name)", "keyframe": f.keyframe, "ptsMicros": f.ptsMicros])
        }
        let manifest: [String: Any] = [
            "codec": codec,
            "description": avcc.base64EncodedString(),
            "width": width,
            "height": height,
            "fps": fps,
            "source": source,
            "frames": manifestFrames,
        ]
        do {
            let json = try JSONSerialization.data(withJSONObject: manifest, options: [.prettyPrinted, .sortedKeys])
            try json.write(to: outDir.appendingPathComponent("manifest.json"))
        } catch { fail("writing manifest: \(error.localizedDescription)") }
        let keyCount = frames.filter(\.keyframe).count
        let bytes = frames.reduce(0) { $0 + $1.data.count }
        print("fixtures: \(frames.count) frames (\(keyCount) keyframes), \(bytes / 1024) KiB, codec=\(codec), avcC=\(avcc.count)B → \(outDir.path)")
    }
}

func runEncode() {
    let w = resolveTargetWindow()
    let duration = Int(flagValue("--duration") ?? "8") ?? 8
    let fps = 60
    let bitrate = Int(flagValue("--bitrate") ?? "3000000") ?? 3_000_000
    let outDir = URL(fileURLWithPath: flagValue("--out") ?? "fixtures")
    try? FileManager.default.createDirectory(at: outDir, withIntermediateDirectories: true)

    let output = CaptureOutput()
    var encoder: FixtureEncoder?
    let (stream, width, height) = startStream(window: w, fps: fps, output: output)
    encoder = FixtureEncoder(width: width, height: height, fps: fps, bitrate: bitrate)
    output.onFrame = { pb, pts in encoder?.encode(pb, pts: pts) }
    print("encoding \(duration)s of window \(w.windowID) (\(w.owningApplication?.applicationName ?? "?")) at \(width)x\(height), \(bitrate / 1000)kbps…")
    for sec in 1...duration {
        Thread.sleep(forTimeInterval: 1.0)
        print("sec \(sec): \(output.takeSecondCount()) fps captured")
    }
    let sem = DispatchSemaphore(value: 0)
    stream.stopCapture { _ in sem.signal() }
    sem.wait()
    Thread.sleep(forTimeInterval: 0.5)
    encoder?.finishAndWrite(outDir: outDir, fps: fps)
}
