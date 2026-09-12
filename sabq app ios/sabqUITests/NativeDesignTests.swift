import XCTest

final class NativeDesignTests: XCTestCase {
    @MainActor
    func testExploreQuerySurvivesTabSwitch() throws {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments = ["-sabqHasCompletedOnboardingV2", "YES", "-appAppearance", "system"]
        app.launch()
        let explore = app.tabBars.buttons["استكشف"]
        XCTAssertTrue(explore.waitForExistence(timeout: 25))
        explore.tap()
        let search = app.searchFields.firstMatch
        XCTAssertTrue(search.waitForExistence(timeout: 10))
        search.tap()
        search.typeText("الرياض\n")
        app.scrollViews.firstMatch.swipeUp()
        XCTAssertTrue(app.tabBars.buttons["محفوظاتي"].isHittable)
        app.tabBars.buttons["محفوظاتي"].tap()
        XCTAssertTrue(app.navigationBars["محفوظاتي"].waitForExistence(timeout: 5))
        explore.tap()
        XCTAssertEqual(search.value as? String, "الرياض")
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = "native-search-preserved"
        attachment.lifetime = .keepAlways
        add(attachment)
    }
    /// A synthetic slug exercises routing without depending on a changing news headline.
    /// This checks the reader route, not successful hydration of article content.
    @MainActor
    func testDeepLinkReaderSurvivesTabSwitch() throws {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments = ["-sabqHasCompletedOnboardingV2", "YES", "-appAppearance", "system"]
        app.launch()
        XCTAssertTrue(app.tabBars.buttons["استكشف"].waitForExistence(timeout: 25))
        app.tabBars.buttons["استكشف"].tap()
        app.open(URL(string: "sabq://article/design-navigation-test")!)
        let tools = app.buttons["article.tools"]
        XCTAssertTrue(tools.waitForExistence(timeout: 10))
        app.tabBars.buttons["محفوظاتي"].tap()
        XCTAssertTrue(app.navigationBars["محفوظاتي"].waitForExistence(timeout: 5))
        app.tabBars.buttons["الرئيسية"].tap()
        XCTAssertTrue(tools.waitForExistence(timeout: 5))
        tools.tap()
        app.buttons["إعدادات القراءة"].tap()
        XCTAssertTrue(app.staticTexts["تنسيق القراءة"].waitForExistence(timeout: 5))
        app.buttons["تم"].tap()
    }

}
