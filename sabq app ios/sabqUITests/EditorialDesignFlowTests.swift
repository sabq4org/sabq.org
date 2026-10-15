import XCTest

/// Guest flows for the editorial redesign.  The tests intentionally use
/// accessibility labels/identifiers and wait for real content, so they remain
/// useful on both compact and regular-width simulators.
final class EditorialDesignFlowTests: XCTestCase {
    @MainActor
    func testGuestLaunchReachesArabicHomeWithoutBlockingPrompt() throws {
        let app = launchGuest()

        XCTAssertTrue(app.tabBars.buttons["الرئيسية"].waitForExistence(timeout: 25))
        XCTAssertTrue(app.staticTexts["آخر الأخبار"].waitForExistence(timeout: 20))
        attachScreenshot(app, named: "editorial-guest-home")
    }

    @MainActor
    func testSearchQuerySurvivesSwitchingTabs() throws {
        let app = launchGuest()
        let explore = app.tabBars.buttons["استكشف"]
        XCTAssertTrue(explore.waitForExistence(timeout: 25))
        explore.tap()

        let search = app.searchFields.firstMatch
        XCTAssertTrue(search.waitForExistence(timeout: 10))
        search.tap()
        search.typeText("الرياض\n")

        let bookmarksTab = app.tabBars.buttons["محفوظاتي"]
        XCTAssertTrue(bookmarksTab.waitForExistence(timeout: 10))
        bookmarksTab.tap()
        XCTAssertTrue(app.navigationBars["محفوظاتي"].waitForExistence(timeout: 8))

        explore.tap()
        XCTAssertEqual(search.value as? String, "الرياض")
        attachScreenshot(app, named: "editorial-search-preserved")
    }

    @MainActor
    func testGuestLoginShowsPhoneAndEmailLabelsWithoutSubmitting() throws {
        let app = launchGuest()
        let profile = app.tabBars.buttons["حسابي"]
        XCTAssertTrue(profile.waitForExistence(timeout: 25))
        profile.tap()

        XCTAssertTrue(app.staticTexts["حسابك في سبق"].waitForExistence(timeout: 10))
        let login = app.buttons["تسجيل الدخول"]
        XCTAssertTrue(login.waitForExistence(timeout: 10))
        login.tap()

        XCTAssertTrue(app.staticTexts["تسجيل الدخول"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.buttons["الجوال"].waitForExistence(timeout: 5))
        let emailMode = app.buttons["البريد الإلكتروني"]
        XCTAssertTrue(emailMode.waitForExistence(timeout: 5))
        emailMode.tap()
        XCTAssertTrue(app.textFields.firstMatch.waitForExistence(timeout: 5))
        XCTAssertTrue(app.secureTextFields.firstMatch.waitForExistence(timeout: 5))
        // Deliberately stop before tapping the credential submit button: this
        // verifies the guest surface without creating a login request.
        XCTAssertTrue(app.buttons["تسجيل الدخول"].exists)
        attachScreenshot(app, named: "editorial-guest-login-labels")
    }

    @MainActor
    func testRealHomeArticleSupportsGuestBookmarkAndReaderControls() throws {
        let app = launchGuest()
        XCTAssertTrue(app.staticTexts["آخر الأخبار"].waitForExistence(timeout: 25))

        let articleRows = app.buttons.matching(
            NSPredicate(format: "identifier BEGINSWITH 'home.article.'")
        )
        guard articleRows.firstMatch.waitForExistence(timeout: 20) else {
            throw XCTSkip("لم تصل بطاقة خبر حقيقية من الرئيسية ضمن مهلة الاختبار")
        }
        let homeCard = articleRows.firstMatch
        let articleID = String(homeCard.identifier.dropFirst("home.article.".count))
        homeCard.tap()

        // The native toolbar may expose the symbol identifier (bookmark or
        // bookmark.fill) instead of the SwiftUI identifier. Its action label
        // distinguishes it from the saved-items tab in either saved state.
        let bookmark = articleBookmark(in: app)
        guard bookmark.waitForExistence(timeout: 12) else {
            let hierarchy = XCTAttachment(string: app.debugDescription)
            hierarchy.lifetime = .keepAlways
            add(hierarchy)
            XCTFail("لم يظهر إجراء الحفظ في قارئ الخبر")
            return
        }
        // A previous run may have left the guest-local bookmark in place. Do
        // not toggle an already saved article back to the unsaved state.
        if !bookmark.label.contains("إزالة") {
            bookmark.tap()
        }
        XCTAssertTrue(
            articleBookmark(in: app).waitForExistence(timeout: 5),
            "قارئ الخبر فقد زر الحفظ بعد التبديل"
        )
        XCTAssertTrue(
            articleBookmark(in: app).label.contains("إزالة"),
            "زر الحفظ لم يتحول إلى حالة الحفظ المحلية"
        )

        let format = app.buttons.matching(NSPredicate(format: "label CONTAINS 'تنسيق'")).firstMatch
        XCTAssertTrue(format.waitForExistence(timeout: 12))
        // XCTest scrolls the actual ancestor of this control into view.
        // The first scroll view can belong to another navigation/tab stack.
        format.tap()
        XCTAssertTrue(app.navigationBars["تنسيق القراءة"].waitForExistence(timeout: 8))
        attachScreenshot(app, named: "editorial-reader-controls")
        app.buttons["تم"].tap()

        // The bookmark is guest-local. Returning to the saved tab must retain
        // the saved row without requiring credentials or a server response.
        let savedTab = app.tabBars.buttons["محفوظاتي"]
        XCTAssertTrue(savedTab.waitForExistence(timeout: 8))
        savedTab.tap()
        XCTAssertTrue(app.navigationBars["محفوظاتي"].waitForExistence(timeout: 8))
        // Wait for an actual compact article card. Checking only that the
        // empty state disappeared can pass during the store's sync window.
        let savedCard = app.buttons["saved.article.\(articleID)"]
        XCTAssertTrue(savedCard.waitForExistence(timeout: 12), "الخبر المحفوظ محليًا لم يظهر كبطاقة فعلية بعد المزامنة")
        attachScreenshot(app, named: "editorial-guest-bookmark")
    }

    @MainActor
    private func launchGuest() -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = [
            "-sabqHasCompletedOnboardingV2", "YES",
            "-appAppearance", "system",
            "-AppleLanguages", "(ar)",
            "-AppleLocale", "ar_SA"
        ]
        app.launch()
        dismissTransientPrompts(in: app)
        return app
    }

    @MainActor
    private func dismissTransientPrompts(in app: XCUIApplication) {
        // Auth/session bootstrap can delay the app-owned analytics alert, so
        // give it several short opportunities instead of assuming first-frame
        // timing. The same loop handles a system permission alert if present.
        for _ in 0..<8 {
            let analytics = app.alerts["تحليلات الاستخدام"]
            if analytics.exists {
                analytics.buttons["لا، شكرًا"].tap()
                continue
            }

            let alerts = app.alerts
            if alerts.firstMatch.exists {
                let denial = alerts.buttons["عدم السماح"]
                if denial.exists {
                    denial.tap()
                    continue
                }
                if alerts.buttons["لا، شكرًا"].exists {
                    alerts.buttons["لا، شكرًا"].tap()
                    continue
                }
            }

            // Permission alerts belong to SpringBoard, especially when the
            // simulator is configured with English system strings while the
            // app itself is Arabic.
            let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
            let springboardAlerts = springboard.alerts
            for title in ["Don't Allow", "Don’t Allow", "عدم السماح"] {
                let denial = springboardAlerts.buttons[title]
                if denial.exists {
                    denial.tap()
                    continue
                }
            }
            Thread.sleep(forTimeInterval: 0.5)
        }
    }

    private func attachScreenshot(_ app: XCUIApplication, named name: String) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    private func articleBookmark(in app: XCUIApplication) -> XCUIElement {
        app.buttons.matching(NSPredicate(
            format: "label == 'حفظ المقال' OR label == 'إزالة من المحفوظات'"
        )).firstMatch
    }
}
