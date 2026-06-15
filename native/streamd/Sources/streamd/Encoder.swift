import Foundation
import VideoToolbox
import CoreMedia

/// Low-latency H.264 encoder (dossier T003) — a thin `VTCompressionSession` wrapper.
///
/// Matches the spike's recorded encode contract (`avc1.640020` = H.264 High @ L3.2,
/// **P-frames only** — `AllowFrameReordering=false`, no B-frames — `MaxKeyFrameInterval=60`,
/// forced keyframe on demand + on the first frame). Output is one **AVCC** access unit per
/// frame (length-prefixed NALs), exactly what the browser `VideoDecoder` + the recorded
/// fixtures expect. The avcC (SPS/PPS) is lifted from the first frame's format description
/// and base64-encoded for `video-config.description`.
///
/// Compile-verified on-host; exercised live (real pixel buffers) only at the host-Mac visit
/// (T009) — encoding needs a GPU + a capture session this CI can't provide.
final class H264Encoder {
    /// Width/height in pixels; the encoder is recreated if the source resizes.
    let width: Int32
    let height: Int32
    let fps: Double

    private var session: VTCompressionSession?
    private let lock = NSLock()
    private var description: String?          // base64 avcC, set on first keyframe
    private var forceKeyframeNext = false
    private var frameNumber: Int64 = 0

    enum EncoderError: Error { case sessionCreateFailed(OSStatus), encodeFailed(OSStatus) }

    init(width: Int32, height: Int32, fps: Double) {
        self.width = width
        self.height = height
        self.fps = fps
    }

    /// Create + configure the compression session. Call once before `encode`.
    func prepare() throws {
        var out: VTCompressionSession?
        let status = VTCompressionSessionCreate(
            allocator: kCFAllocatorDefault,
            width: width, height: height,
            codecType: kCMVideoCodecType_H264,
            encoderSpecification: nil,
            imageBufferAttributes: nil,
            compressedDataAllocator: nil,
            outputCallback: nil,          // block-based per-frame handler used instead
            refcon: nil,
            compressionSessionOut: &out)
        guard status == noErr, let session = out else { throw EncoderError.sessionCreateFailed(status) }
        self.session = session

        // Low-latency, P-frames-only, keyframe cadence — the spike's recorded contract.
        VTSessionSetProperty(session, key: kVTCompressionPropertyKey_RealTime, value: kCFBooleanTrue)
        VTSessionSetProperty(session, key: kVTCompressionPropertyKey_AllowFrameReordering, value: kCFBooleanFalse)
        VTSessionSetProperty(session, key: kVTCompressionPropertyKey_ProfileLevel,
                             value: kVTProfileLevel_H264_High_AutoLevel)   // target High@3.2 (avc1.640020)
        VTSessionSetProperty(session, key: kVTCompressionPropertyKey_MaxKeyFrameInterval, value: 60 as CFNumber)
        VTSessionSetProperty(session, key: kVTCompressionPropertyKey_ExpectedFrameRate, value: fps as CFNumber)
        if #available(macOS 11.0, *) {
            VTSessionSetProperty(session, key: kVTCompressionPropertyKey_MaximizePowerEfficiency, value: kCFBooleanFalse)
        }
        VTCompressionSessionPrepareToEncodeFrames(session)
    }

    /// Make the next encoded frame an IDR (late-join / drop-to-keyframe / resume).
    func requestKeyframe() { lock.lock(); forceKeyframeNext = true; lock.unlock() }

    /// Encode one captured pixel buffer; `onFrame` fires with the AVCC access unit. The first
    /// keyframe also yields the base64 avcC via `onConfig` (so the WS layer can send
    /// `video-config` before forwarding the frame).
    func encode(_ pixelBuffer: CVPixelBuffer, ptsMicros: UInt64,
                onConfig: @escaping (String) -> Void,
                onFrame: @escaping (VideoFrame) -> Void) throws {
        guard let session else { throw EncoderError.encodeFailed(-1) }
        lock.lock()
        let force = forceKeyframeNext || frameNumber == 0
        forceKeyframeNext = false
        let pts = CMTime(value: frameNumber, timescale: Int32(max(1, fps)))
        frameNumber += 1
        lock.unlock()

        var frameProps: CFDictionary?
        if force {
            frameProps = [kVTEncodeFrameOptionKey_ForceKeyFrame as String: true] as CFDictionary
        }
        let status = VTCompressionSessionEncodeFrame(
            session, imageBuffer: pixelBuffer, presentationTimeStamp: pts, duration: .invalid,
            frameProperties: frameProps, infoFlagsOut: nil
        ) { [weak self] status, _, sampleBuffer in
            guard let self, status == noErr, let sampleBuffer,
                  let bytes = Self.avccBytes(sampleBuffer) else { return }
            if let desc = Self.avcCDescription(sampleBuffer), self.captureDescription(desc) {
                onConfig(desc)
            }
            let isKey = Self.isKeyframe(sampleBuffer)
            onFrame(VideoFrame(isKeyframe: isKey, captureTimestampMicros: ptsMicros, avcc: bytes))
        }
        guard status == noErr else { throw EncoderError.encodeFailed(status) }
    }

    func stop() {
        lock.lock(); defer { lock.unlock() }
        if let session {
            VTCompressionSessionCompleteFrames(session, untilPresentationTimeStamp: .invalid)
            VTCompressionSessionInvalidate(session)
        }
        session = nil
    }

    // MARK: sample-buffer helpers

    /// Record the avcC the first time; returns true only on the first set (so config is
    /// emitted once until a resize creates a new encoder).
    private func captureDescription(_ desc: String) -> Bool {
        lock.lock(); defer { lock.unlock() }
        guard description == nil else { return false }
        description = desc
        return true
    }

    /// A frame is a keyframe unless the sample attachments mark it NotSync.
    private static func isKeyframe(_ sb: CMSampleBuffer) -> Bool {
        guard let attachments = CMSampleBufferGetSampleAttachmentsArray(sb, createIfNecessary: false),
              CFArrayGetCount(attachments) > 0 else { return true }
        let dict = unsafeBitCast(CFArrayGetValueAtIndex(attachments, 0), to: CFDictionary.self)
        let key = Unmanaged.passUnretained(kCMSampleAttachmentKey_NotSync).toOpaque()
        var value: UnsafeRawPointer?
        if CFDictionaryGetValueIfPresent(dict, key, &value), let value {
            return !CFBooleanGetValue(unsafeBitCast(value, to: CFBoolean.self))
        }
        return true   // NotSync absent → sync sample → keyframe
    }

    /// Copy the (already AVCC) compressed bytes out of the sample buffer's block buffer.
    private static func avccBytes(_ sb: CMSampleBuffer) -> [UInt8]? {
        guard let bb = CMSampleBufferGetDataBuffer(sb) else { return nil }
        var length = 0
        var ptr: UnsafeMutablePointer<Int8>?
        guard CMBlockBufferGetDataPointer(bb, atOffset: 0, lengthAtOffsetOut: nil,
                                          totalLengthOut: &length, dataPointerOut: &ptr) == noErr,
              let ptr else { return nil }
        return [UInt8](UnsafeBufferPointer(start: UnsafeRawPointer(ptr).assumingMemoryBound(to: UInt8.self), count: length))
    }

    /// Build the base64 avcC (SPS/PPS) from the format description's sample-description atom.
    private static func avcCDescription(_ sb: CMSampleBuffer) -> String? {
        guard let fmt = CMSampleBufferGetFormatDescription(sb),
              let atoms = CMFormatDescriptionGetExtension(
                fmt, extensionKey: kCMFormatDescriptionExtension_SampleDescriptionExtensionAtoms) as? [String: Any],
              let avcc = atoms["avcC"] as? Data
        else { return nil }
        return avcc.base64EncodedString()
    }
}
