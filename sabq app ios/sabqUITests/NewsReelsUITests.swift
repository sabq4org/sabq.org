import XCTest

/// Read-only guest flow on a normal portrait iPhone. Uses the current home
/// snapshot; never opens the article reader or submits a share/reaction.
final class NewsReelsUITests: XCTestCase {
    @MainActor
    func testHomeEntryPagingActiveActionAndExit() throws {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments = [
            "-sabqHasCompletedOnboardingV2", "YES",
            "-appAppearance", "light",
            "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryL",
            "-AppleLanguages", "(ar)", "-AppleLocale", "ar_SA"
        ]
        app.launch()
        dismissPrompts(in: app)
        XCTAssertTrue(app.tabBars.buttons["الرئيسية"].waitForExistence(timeout: 25))

        let entry = app.buttons["home.newsReels"]
        for _ in 0..<12 {
            if entry.exists && entry.isHittable { break }
            app.swipeUp()
        }
        XCTAssertTrue(entry.waitForExistence(timeout: 15), "Latest-news Reels entry is missing")
        XCTAssertTrue(entry.isHittable, "Reels entry cannot be reached from normal home")
        if entry.frame.midY > app.frame.height * 0.6 {
            app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.7))
                .press(forDuration: 0.05, thenDragTo:
                    app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.45)))
        }
        let heading = app.staticTexts["آخر الأخبار"].firstMatch
        XCTAssertTrue(heading.isHittable, "Latest-news heading must be visible with the entry")
        XCTAssertEqual(entry.frame.midY, heading.frame.midY, accuracy: 28,
                       "Reels must share the latest-news header row")
        attach(app, named: "reels-home-entry")
        entry.tap()

        let position = app.buttons["newsReels.index"]
        XCTAssertTrue(position.waitForExistence(timeout: 10))
        let firstID = try XCTUnwrap(position.value as? String)
        XCTAssertFalse(firstID.isEmpty)
        XCTAssertTrue(app.buttons["newsReels.close"].isHittable)
        attach(app, named: "reels-first-page")

        let feed = app.scrollViews["newsReels.feed"]
        XCTAssertTrue(feed.exists)
        feed.swipeUp()
        let moved = NSPredicate { _, _ in
            guard let articleID = position.value as? String else { return false }
            return !articleID.isEmpty && articleID != firstID
        }
        XCTAssertEqual(XCTWaiter.wait(for: [XCTNSPredicateExpectation(
            predicate: moved, object: nil
        )], timeout: 8), .completed, "Vertical swipe did not select another article")
        let secondID = try XCTUnwrap(position.value as? String)
        attach(app, named: "reels-after-vertical-swipe")

        // A live article can have no image. Find another eligible reel without
        // assuming a particular headline or opening the article reader.
        var activeID = secondID
        for _ in 0..<6 {
            if app.buttons["newsReels.image.\(activeID)"].exists { break }
            let previousID = activeID
            feed.swipeUp()
            let advanced = NSPredicate { _, _ in (position.value as? String) != previousID }
            let result = XCTWaiter.wait(for: [XCTNSPredicateExpectation(
                predicate: advanced, object: nil
            )], timeout: 3)
            if result != .completed { break }
            activeID = try XCTUnwrap(position.value as? String)
        }
        let imageAction = app.buttons["newsReels.image.\(activeID)"]
        if imageAction.exists {
            imageAction.tap()
            let viewer = app.descendants(matching: .any)["newsReels.imageViewer.\(activeID)"].firstMatch
            XCTAssertTrue(viewer.waitForExistence(timeout: 8), "Image action opened the wrong article or no viewer")
            attach(app, named: "reels-active-image")
            viewer.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
            let returned = NSPredicate { _, _ in
                app.buttons["newsReels.close"].isHittable && !viewer.exists
            }
            XCTAssertEqual(XCTWaiter.wait(for: [XCTNSPredicateExpectation(
                predicate: returned, object: nil
            )], timeout: 8), .completed)
        } else {
            // Image-free editions still exercise a real secondary surface.
            position.tap()
            XCTAssertTrue(app.navigationBars["أخبار Reels"].waitForExistence(timeout: 8))
            attach(app, named: "reels-news-index")
            app.buttons["تم"].tap()
            XCTAssertTrue(app.buttons["newsReels.close"].waitForExistence(timeout: 8))
        }
        XCTAssertEqual(position.value as? String, activeID, "Secondary action lost the selected article")

        app.buttons["newsReels.close"].tap()
        let homeVisible = NSPredicate { _, _ in entry.isHittable && !position.exists }
        XCTAssertEqual(XCTWaiter.wait(for: [XCTNSPredicateExpectation(
            predicate: homeVisible, object: nil
        )], timeout: 8), .completed, "Close did not return to the original home position")
        attach(app, named: "reels-returned-home")
    }

    @MainActor
    private func dismissPrompts(in app: XCUIApplication) {
        for _ in 0..<8 {
            for owner in [app, XCUIApplication(bundleIdentifier: "com.apple.springboard")] {
                for title in ["لا، شكرًا", "عدم السماح", "Don't Allow", "Don’t Allow"] {
                    let button = owner.alerts.buttons[title]
                    if button.exists { button.tap() }
                }
            }
            Thread.sleep(forTimeInterval: 0.5)
        }
    }

    @MainActor
    private func attach(_ app: XCUIApplication, named name: String) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
