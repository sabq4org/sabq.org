// swift-tools-version: 5.10
import PackageDescription

let package = Package(
    name: "SabqDeskKit",
    defaultLocalization: "ar",
    platforms: [.iOS(.v17), .macOS(.v14)],
    products: [
        .library(name: "SabqDeskKit", targets: ["SabqDeskKit"]),
        .library(name: "SabqDeskDesign", targets: ["SabqDeskDesign"]),
    ],
    targets: [
        .target(name: "SabqDeskKit"),
        .target(name: "SabqDeskDesign"),
        .testTarget(name: "SabqDeskKitTests", dependencies: ["SabqDeskKit"]),
    ]
)
