import XCTest
import SwiftUI
import UIKit
@testable import sabq

final class SpreadHeroRenderingTests: XCTestCase {
    @MainActor
    func testCaptionShadeFadesSmoothlyAndFollowsTitleHeight() async throws {
        let short = try await render(title: "خبر قصير")
        let long = try await render(title: "تفاصيل جديدة حول المشاريع التنموية والخدمات العامة في مناطق المملكة وخطط تطويرها خلال المرحلة المقبلة")
        let shortColumn = try luminanceColumn(short)
        let longColumn = try luminanceColumn(long)

        // The old fixed 220pt mask darkened this photo area even when
        // the caption was only one line, and began with a visible jump.
        XCTAssertGreaterThan(shortColumn[180], 0.97, "Shade must stay near the short caption")
        for column in [shortColumn, longColumn] {
            let largestStep = (41..<330).map { abs(column[$0] - column[$0 - 1]) }.max() ?? 0
            XCTAssertLessThan(largestStep, 0.04, "No hard upper edge in the caption shade")
            XCTAssertLessThan(column[330], 0.45, "Keep contrast behind the caption")
        }
        let shortStart = try XCTUnwrap((40..<330).first { shortColumn[$0] < 0.95 })
        let longStart = try XCTUnwrap((40..<330).first { longColumn[$0] < 0.95 })
        XCTAssertGreaterThan(shortStart - longStart, 15, "Shade height follows the rendered title")
    }

    @MainActor
    private func render(title: String) async throws -> UIImage {
        let size = CGSize(width: 640, height: 360)
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        let source = UIGraphicsImageRenderer(size: size, format: format).image { context in
            UIColor.white.setFill()
            context.fill(CGRect(origin: .zero, size: size))
        }
        let url = try XCTUnwrap(URL(string: "https://spread-render.invalid/\(UUID().uuidString).png"))
        ImageCache.store(source, for: url, budget: 1400)
        defer { ImageCache.shared.removeObject(forKey: url as NSURL) }
        let article = Article(
            id: UUID().uuidString, title: title, excerpt: "", aiSummary: "", body: "", bodyHTML: "",
            category: .saudi, author: "", publishDate: Date(), isBreaking: false, isFeatured: true,
            tags: [], imageURL: url.absoluteString, slug: nil, articleURL: nil
        )
        let content = SpreadHeroCard(article: article, onBookmark: {}, isBookmarked: false)
            .frame(width: size.width, height: size.height)
            .environment(\.layoutDirection, .rightToLeft)
            .environment(\.dynamicTypeSize, .large)
        let host = UIHostingController(rootView: content)
        host.safeAreaRegions = []
        let scene = try XCTUnwrap(UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first)
        let window = UIWindow(windowScene: scene)
        window.frame = CGRect(origin: .zero, size: size)
        window.rootViewController = host
        window.windowLevel = .alert + 1
        window.isHidden = false
        defer { window.isHidden = true }
        host.view.frame = window.bounds
        host.view.layoutIfNeeded()
        try await Task.sleep(nanoseconds: 400_000_000)
        let image = UIGraphicsImageRenderer(size: size, format: format).image { _ in
            host.view.drawHierarchy(in: host.view.bounds, afterScreenUpdates: true)
        }
        let attachment = XCTAttachment(image: image)
        attachment.name = "Duo caption shade — \(title)"
        attachment.lifetime = .keepAlways
        add(attachment)
        return image
    }

    private func luminanceColumn(_ image: UIImage) throws -> [Double] {
        let cg = try XCTUnwrap(image.cgImage)
        var bytes = [UInt8](repeating: 0, count: cg.width * cg.height * 4)
        let context = try XCTUnwrap(CGContext(
            data: &bytes, width: cg.width, height: cg.height, bitsPerComponent: 8,
            bytesPerRow: cg.width * 4, space: CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
        ))
        context.draw(cg, in: CGRect(x: 0, y: 0, width: cg.width, height: cg.height))
        // Caption padding is 16pt. Sample 8pt from the edge to avoid
        // glyphs and the category pill; skip rounded corners in assertions.
        return (0..<cg.height).map { Double(bytes[($0 * cg.width + 8) * 4]) / 255 }
    }
}
