import XCTest

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

        for page in 1...3 {
            for _ in 0..<25 {
                if more.isHittable && more.frame.maxY < app.frame.maxY - 100 { break }
                feed.swipeUp(velocity: .slow)
            }
            attach(app, "page-\(page)-footer")
            XCTAssertTrue(more.isHittable && more.frame.maxY < app.frame.maxY - 100,
                          "Could not reach Load more above the tab bar on page \(page)")
            let visibleRows = app.buttons.matching(NSPredicate(
                format: "identifier BEGINSWITH 'moments.article.'"
            )).allElementsBoundByIndex.filter {
                $0.isHittable && $0.frame.minY > 150 && $0.frame.maxY < app.frame.maxY - 120
            }
            let anchor = try XCTUnwrap(visibleRows.last, "No fully visible article before pagination")
            let anchorID = anchor.identifier
            let count = app.descendants(matching: .any)["moments.count"].firstMatch
            XCTAssertTrue(count.exists)
            let oldCount = count.label
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
