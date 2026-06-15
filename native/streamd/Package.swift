// swift-tools-version: 5.9
import PackageDescription

// streamd — the Chainglass remote-view native daemon (Plan 088, Phase 4).
//
// Outside the pnpm/turbo graph: Swift toolchain only, no JS imports (dossier
// § Domain constraints). Zero external SwiftPM dependencies on purpose — the
// daemon leans on system frameworks (ScreenCaptureKit, VideoToolbox, CryptoKit,
// Network, AppKit) so `swift build`/`swift test` run offline and deterministically
// on the host (macOS 26.5 / Swift 6.2.4; deployment floor macOS 14).
let package = Package(
    name: "streamd",
    platforms: [
        .macOS(.v14)
    ],
    targets: [
        .executableTarget(
            name: "streamd",
            path: "Sources/streamd"
        ),
        .testTarget(
            name: "streamdTests",
            dependencies: ["streamd"],
            path: "Tests/streamdTests"
        ),
    ]
)
