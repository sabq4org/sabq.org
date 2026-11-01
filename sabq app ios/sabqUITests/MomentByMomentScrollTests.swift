import XCTest
import UIKit

/// Read-only pagination regression: an increased count alone does not prove
/// that the reader kept their place when the next page arrived.
final class MomentByMomentScrollTests: XCTestCase {
    @MainActor
    func testLoadingMorePreservesVisibleArticleAcrossThreePages() throws {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments = [
            "-sabqHasCompletedOnboardingV2", "YES",
            "-appAppearance", "light",
            "-homeCardStyle", "classic",
            "-AppleLanguages", "(ar)", "-AppleLocale", "ar_SA"
        ]
        app.launch()
        let entry = app.buttons["لحظة بلحظة — التغطية المباشرة"]
        XCTAssertTrue(entry.waitForExistence(timeout: 30))
        dismissPrompts(app)
        entry.tap()

        let feed = app.scrollViews["moments.feed"]
        let more = app.buttons["moments.loadMore"]
        XCTAssertTrue(more.waitForExistence(timeout: 25))
        let count = app.descendants(matching: .any)["moments.count"].firstMatch
        XCTAssertTrue(count.exists)

        for page in 1...3 {
            revealFooter(in: app, feed: feed, more: more)
            attach(app, "page-\(page)-footer")
            let visibleRows = app.buttons.matching(NSPredicate(
                format: "identifier BEGINSWITH 'moments.article.'"
            )).allElementsBoundByIndex.filter {
                $0.isHittable && $0.frame.minY > 150 && $0.frame.maxY < app.frame.maxY - 120
            }
            let anchor = try XCTUnwrap(visibleRows.last, "No fully visible article before pagination")
            let anchorID = anchor.identifier
            let oldCount = count.label
            try assertIdleFooterIsStill(in: app, count: count, page: page)
            attach(app, "page-\(page)-before")
            let oldY = anchor.frame.minY

            more.tap()
            let loaded = NSPredicate { _, _ in count.label != oldCount && more.isEnabled }
            XCTAssertEqual(XCTWaiter.wait(for: [XCTNSPredicateExpectation(predicate: loaded, object: nil)], timeout: 25), .completed)
            let retained = app.buttons[anchorID]
            XCTAssertTrue(retained.exists, "The previously visible article disappeared")
            attach(app, "page-\(page)-after")
            XCTAssertEqual(retained.frame.minY, oldY, accuracy: 12,
                           "Pagination moved the reader away from \(anchorID)")
        }
        revealFooter(in: app, feed: feed, more: more)
        try assertIdleFooterIsStill(in: app, count: count, page: 4)
    }

    @MainActor
    private func revealFooter(in app: XCUIApplication, feed: XCUIElement, more: XCUIElement) {
        let bottom = app.frame.maxY - 100
        for _ in 0..<25 {
            if more.isHittable && more.frame.maxY < bottom { break }
            feed.swipeUp(velocity: .fast)
        }
        XCTAssertTrue(more.isHittable && more.frame.maxY < bottom,
                      "Could not reach Load more above the tab bar")
    }

    /// AX frames can expose the final layout while Core Animation repeatedly
    /// moves the rendered footer. Sample actual blue title pixels for more
    /// than four 1.4-second pulse cycles, with no gesture or network request.
    @MainActor
    private func assertIdleFooterIsStill(in app: XCUIApplication, count: XCUIElement, page: Int) throws {
        let initialCount = count.label
        let screenWidth = app.frame.width
        let started = Date()
        var samples: [CGFloat] = []
        var measurements: [String] = ["elapsed_seconds,title_center_y_points"]
        var lowest: (CGFloat, XCUIScreenshot)?
        var highest: (CGFloat, XCUIScreenshot)?
        repeat {
            let screenshot = app.screenshot()
            let y = try renderedFooterCenter(screenshot, screenWidth: screenWidth)
            samples.append(y)
            measurements.append("\(Date().timeIntervalSince(started)),\(y)")
            if lowest == nil || y < lowest!.0 { lowest = (y, screenshot) }
            if highest == nil || y > highest!.0 { highest = (y, screenshot) }
            Thread.sleep(forTimeInterval: 0.23)
        } while (Date().timeIntervalSince(started) < 6.2 || samples.count < 10)
                    && Date().timeIntervalSince(started) < 15

        for (name, sample) in [("top", lowest), ("bottom", highest)] {
            let attachment = XCTAttachment(screenshot: try XCTUnwrap(sample).1)
            attachment.name = "moments-page-\(page)-idle-\(name)"
            attachment.lifetime = .keepAlways
            add(attachment)
        }
        let values = XCTAttachment(string: measurements.joined(separator: "\n"))
        values.name = "moments-page-\(page)-idle-positions.csv"
        values.lifetime = .keepAlways
        add(values)
        XCTAssertEqual(count.label, initialCount, "News changed during the idle measurement")
        XCTAssertGreaterThanOrEqual(samples.count, 10, "Too few presentation samples to detect the repeating animation")
        let spread = try XCTUnwrap(samples.max()) - XCTUnwrap(samples.min())
        XCTAssertLessThanOrEqual(spread, 2, "Load more oscillated by \(spread) points without interaction")
    }

    /// In the light/classic fixture, the centered blue footer title is the only
    /// blue content in this band: images are left, category pills are right,
    /// and the tab bar is below it. This measures presentation, not AX layout.
    private func renderedFooterCenter(_ screenshot: XCUIScreenshot, screenWidth: CGFloat) throws -> CGFloat {
        let image = try XCTUnwrap(screenshot.image.cgImage)
        let width = image.width
        let height = image.height
        var pixels = [UInt8](repeating: 0, count: width * height * 4)
        var rows: [Int] = []
        try pixels.withUnsafeMutableBytes { bytes in
            let context = try XCTUnwrap(CGContext(
                data: bytes.baseAddress, width: width, height: height,
                bitsPerComponent: 8, bytesPerRow: width * 4,
                space: CGColorSpaceCreateDeviceRGB(),
                bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue | CGBitmapInfo.byteOrder32Big.rawValue
            ))
            context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
            let rgba = bytes.bindMemory(to: UInt8.self)
            for y in Int(Double(height) * 0.5)..<Int(Double(height) * 0.9) {
                var matches = 0
                for x in Int(Double(width) * 0.38)..<Int(Double(width) * 0.62) {
                    let offset = (y * width + x) * 4
                    let r = Int(rgba[offset]), g = Int(rgba[offset + 1]), b = Int(rgba[offset + 2])
                    if r < 90 && g > 70 && g < 210 && b > 130 && b > r * 3 / 2 && g > r + 30 {
                        matches += 1
                    }
                }
                if matches >= 5 { rows.append(y) }
            }
        }
        let top = try XCTUnwrap(rows.first, "No rendered Load more title in the visible footer")
        let bottom = try XCTUnwrap(rows.last)
        let pointsPerPixel = screenWidth / CGFloat(width)
        XCTAssertGreaterThanOrEqual(CGFloat(bottom - top) * pointsPerPixel, 8)
        XCTAssertLessThanOrEqual(CGFloat(bottom - top) * pointsPerPixel, 28,
                                "More than one blue text band detected in the footer")
        for (previous, next) in zip(rows, rows.dropFirst()) {
            XCTAssertLessThanOrEqual(CGFloat(next - previous) * pointsPerPixel, 4,
                                    "Disconnected blue content could mask footer movement")
        }
        return CGFloat(top + bottom) / 2 * pointsPerPixel
    }

    @MainActor
    private func dismissPrompts(_ app: XCUIApplication) {
        for owner in [app, XCUIApplication(bundleIdentifier: "com.apple.springboard")] {
            for title in ["لا، شكرًا", "عدم السماح", "Don't Allow", "Don’t Allow"] {
                let button = owner.alerts.buttons[title]
                if button.waitForExistence(timeout: 1) { button.tap() }
            }
        }
    }

    @MainActor
    private func attach(_ app: XCUIApplication, _ name: String) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = "moments-\(name)"
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
