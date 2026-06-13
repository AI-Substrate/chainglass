import Foundation
import CoreMedia
import CoreVideo
import CoreGraphics

// `synth` — generate animated CVPixelBuffers and run them through the SAME
// FixtureEncoder as `encode`. This needs NO Screen Recording grant, so it
// validates the T002 fixture manifest contract and the T004 browser-decode
// round-trip independently of SCK capture. The real captured-Godot fixture
// (when grants land) uses an identical manifest; downstream consumers (Task 2.4
// fake, Task 3.4 decoder config) can't tell them apart by shape.

private func makeBuffer(width: Int, height: Int) -> CVPixelBuffer {
    var pb: CVPixelBuffer?
    let attrs = [
        kCVPixelBufferCGImageCompatibilityKey: true,
        kCVPixelBufferCGBitmapContextCompatibilityKey: true,
        kCVPixelBufferIOSurfacePropertiesKey: [:] as CFDictionary,
    ] as CFDictionary
    CVPixelBufferCreate(nil, width, height, kCVPixelFormatType_32BGRA, attrs, &pb)
    guard let pb else { fail("CVPixelBufferCreate failed") }
    return pb
}

private func draw(into pb: CVPixelBuffer, frame i: Int, total: Int) {
    CVPixelBufferLockBaseAddress(pb, [])
    defer { CVPixelBufferUnlockBaseAddress(pb, []) }
    let w = CVPixelBufferGetWidth(pb)
    let h = CVPixelBufferGetHeight(pb)
    let base = CVPixelBufferGetBaseAddress(pb)
    let bpr = CVPixelBufferGetBytesPerRow(pb)
    let cs = CGColorSpace(name: CGColorSpace.sRGB)!
    let info = CGImageAlphaInfo.noneSkipFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue
    guard let ctx = CGContext(data: base, width: w, height: h, bitsPerComponent: 8,
                              bytesPerRow: bpr, space: cs, bitmapInfo: info) else {
        fail("CGContext over pixel buffer failed")
    }
    let t = Double(i) / Double(max(1, total))
    // moving gradient background (forces real inter-frame deltas → meaningful P-frames)
    ctx.setFillColor(CGColor(red: 0.05 + 0.1 * t, green: 0.07, blue: 0.12, alpha: 1))
    ctx.fill(CGRect(x: 0, y: 0, width: w, height: h))
    // bouncing box
    let bx = (Double(w) - 120) * (0.5 + 0.45 * sin(t * 2 * .pi * 2))
    let by = (Double(h) - 120) * (0.5 + 0.45 * sin(t * 2 * .pi * 3))
    ctx.setFillColor(CGColor(red: 1.0, green: 0.45 + 0.4 * sin(t * 6.28), blue: 0.2, alpha: 1))
    ctx.fill(CGRect(x: bx, y: by, width: 120, height: 120))
    // frame index bar (deterministic motion marker)
    ctx.setFillColor(CGColor(red: 0.3, green: 0.8, blue: 0.5, alpha: 1))
    ctx.fill(CGRect(x: 0, y: 0, width: Double(w) * t, height: 14))
}

func runSynth() {
    let width = Int(flagValue("--width") ?? "640") ?? 640
    let height = Int(flagValue("--height") ?? "480") ?? 480
    let fps = Int(flagValue("--fps") ?? "30") ?? 30
    let seconds = Int(flagValue("--duration") ?? "4") ?? 4
    let bitrate = Int(flagValue("--bitrate") ?? "2500000") ?? 2_500_000
    let outDir = URL(fileURLWithPath: flagValue("--out") ?? "fixtures")
    try? FileManager.default.createDirectory(at: outDir, withIntermediateDirectories: true)

    let totalFrames = fps * seconds
    let encoder = FixtureEncoder(width: width, height: height, fps: fps, bitrate: bitrate)
    print("synth: \(totalFrames) frames \(width)x\(height) @\(fps)fps, \(bitrate / 1000)kbps → \(outDir.path)")
    for i in 0..<totalFrames {
        let pb = makeBuffer(width: width, height: height)
        draw(into: pb, frame: i, total: totalFrames)
        let pts = CMTime(value: CMTimeValue(i), timescale: CMTimeScale(fps))
        encoder.encode(pb, pts: pts)
    }
    Thread.sleep(forTimeInterval: 0.5)
    encoder.finishAndWrite(outDir: outDir, fps: fps, source: "synthetic-vt")
}
