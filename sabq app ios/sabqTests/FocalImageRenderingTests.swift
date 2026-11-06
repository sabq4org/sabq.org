import XCTest
import SwiftUI
import UIKit
@testable import sabq

/// Render the real cached component: arithmetic-only tests miss SwiftUI's
/// additional alignment of an oversized child inside a smaller frame.
final class FocalImageRenderingTests: XCTestCase {
    @MainActor
    func testPortraitCropHonorsTopCenterBottomInBothLayoutDirections() async throws {
        for direction in [LayoutDirection.leftToRight, .rightToLeft] {
            for (y, first, last) in [(0.0, UIColor.red, UIColor.green),
                                     (50.0, UIColor.green, UIColor.green),
                                     (100.0, UIColor.green, UIColor.blue)] {
                let image = try await render(portrait: true, focal: ImageFocalPoint(x: 50, y: y), direction: direction)
                assertColor(image, x: 50, y: 5, equals: first)
                assertColor(image, x: 50, y: 95, equals: last)
            }
        }
    }

    @MainActor
    func testLandscapeCropHonorsLeftCenterRightInBothLayoutDirections() async throws {
        for direction in [LayoutDirection.leftToRight, .rightToLeft] {
            for (x, first, last) in [(0.0, UIColor.red, UIColor.green),
                                     (50.0, UIColor.green, UIColor.green),
                                     (100.0, UIColor.green, UIColor.blue)] {
                let image = try await render(portrait: false, focal: ImageFocalPoint(x: x, y: 50), direction: direction)
                assertColor(image, x: 5, y: 50, equals: first)
                assertColor(image, x: 95, y: 50, equals: last)
            }
        }
    }

    @MainActor
    func testMissingFocalPointCentersWithoutUncoveredEdges() async throws {
        for portrait in [true, false] {
            let image = try await render(portrait: portrait, focal: nil, direction: .rightToLeft)
            for (x, y) in [(5, 5), (95, 5), (5, 95), (95, 95)] {
                assertColor(image, x: x, y: y, equals: .green)
            }
        }
    }

    @MainActor
    func testMatchingAspectPreservesTheWholeImage() async throws {
        for direction in [LayoutDirection.leftToRight, .rightToLeft] {
            let image = try await render(portrait: false, focal: ImageFocalPoint(x: 100, y: 0),
                                         direction: direction, container: CGSize(width: 200, height: 100))
            assertColor(image, x: 5, y: 50, equals: .red)
            assertColor(image, x: 100, y: 50, equals: .green)
            assertColor(image, x: 195, y: 50, equals: .blue)
        }
    }

    @MainActor
    private func render(portrait: Bool, focal: ImageFocalPoint?, direction: LayoutDirection,
                        container: CGSize = CGSize(width: 100, height: 100)) async throws -> UIImage {
        // Three bands along the overflowing axis: 0–25% red, 25–75%
        // green, 75–100% blue. A centered square crop is entirely green.
        let size = portrait ? CGSize(width: 100, height: 200) : CGSize(width: 200, height: 100)
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        let source = UIGraphicsImageRenderer(size: size, format: format).image { context in
            UIColor.green.setFill()
            context.fill(CGRect(origin: .zero, size: size))
            UIColor.red.setFill()
            context.fill(portrait ? CGRect(x: 0, y: 0, width: 100, height: 50) : CGRect(x: 0, y: 0, width: 50, height: 100))
            UIColor.blue.setFill()
            context.fill(portrait ? CGRect(x: 0, y: 150, width: 100, height: 50) : CGRect(x: 150, y: 0, width: 50, height: 100))
        }
        let url = try XCTUnwrap(URL(string: "https://focal-render.invalid/\(UUID().uuidString).png"))
        ImageCache.store(source, for: url, budget: 1400)
        defer { ImageCache.shared.removeObject(forKey: url as NSURL) }
        let content = FocalCachedAsyncImage(url: url, focalPoint: focal) { Color(uiColor: .magenta) }
            .frame(width: container.width, height: container.height)
            .background(Color(uiColor: .magenta))
            .environment(\.layoutDirection, direction)
        let host = UIHostingController(rootView: content)
        host.safeAreaRegions = []
        let scene = try XCTUnwrap(UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first)
        let window = UIWindow(windowScene: scene)
        window.frame = CGRect(origin: .zero, size: container)
        window.rootViewController = host
        window.windowLevel = .alert + 1
        window.isHidden = false
        defer { window.isHidden = true }
        host.view.frame = window.bounds
        host.view.layoutIfNeeded()
        // Let the cached load start, then wait for stable rendered pixels.
        // A busy simulator can delay the opacity fade beyond a fixed sleep.
        try await Task.sleep(nanoseconds: 400_000_000)
        func snapshot() -> UIImage {
            UIGraphicsImageRenderer(size: container, format: format).image { _ in
                host.view.drawHierarchy(in: host.view.bounds, afterScreenUpdates: true)
            }
        }
        var image = snapshot()
        var stableFrames = 0
        for _ in 0..<20 {
            try await Task.sleep(nanoseconds: 100_000_000)
            let next = snapshot()
            stableFrames = next.pngData() == image.pngData() ? stableFrames + 1 : 0
            image = next
            if stableFrames >= 2 { break }
        }
        XCTAssertGreaterThanOrEqual(stableFrames, 2, "Image fade did not settle")
        let attachment = XCTAttachment(image: image)
        attachment.name = "\(portrait ? "portrait" : "landscape")-\(String(describing: focal))-\(direction)"
        attachment.lifetime = .keepAlways
        add(attachment)
        return image
    }

    private func assertColor(_ image: UIImage, x: Int, y: Int, equals expected: UIColor, file: StaticString = #filePath, line: UInt = #line) {
        guard let cg = image.cgImage else { return XCTFail("Missing rendered bitmap", file: file, line: line) }
        var bytes = [UInt8](repeating: 0, count: cg.width * cg.height * 4)
        let context = CGContext(data: &bytes, width: cg.width, height: cg.height, bitsPerComponent: 8,
                                bytesPerRow: cg.width * 4, space: CGColorSpaceCreateDeviceRGB(),
                                bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)
        context?.draw(cg, in: CGRect(x: 0, y: 0, width: cg.width, height: cg.height))
        let index = (y * cg.width + x) * 4
        var red: CGFloat = 0, green: CGFloat = 0, blue: CGFloat = 0, alpha: CGFloat = 0
        expected.getRed(&red, green: &green, blue: &blue, alpha: &alpha)
        for (offset, value) in [red, green, blue, alpha].enumerated() {
            XCTAssertEqual(Double(bytes[index + offset]) / 255, Double(value), accuracy: 0.06,
                           "Wrong crop at (\(x), \(y)), channel \(offset)", file: file, line: line)
        }
    }
}
