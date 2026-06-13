// swift-tools-version: 5.9
// Plan 088 Phase 1 de-risk scratch — throwaway evidence code, never imported by
// production. The real daemon lives at native/streamd/ (Phase 4).
import PackageDescription

let package = Package(
    name: "streamd-spike",
    platforms: [.macOS(.v14)],
    targets: [
        .executableTarget(
            name: "streamd-spike",
            path: "Sources/streamd-spike"
        )
    ]
)
