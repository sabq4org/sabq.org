//
//  NewsTapNavigationTests.swift
//  sabqUITests
//
//  اختبار تشخيصي: هل النقر على خبر في الرئيسية يفتح صفحة التفاصيل؟
//  (بلاغ 2026-07-19: «عنوان الخبر لا يستجيب للنقر — صورة الخبر تستجيب»)
//

import XCTest

final class NewsTapNavigationTests: XCTestCase {

    @MainActor
    private func launchToFeed() -> XCUIApplication {
        let app = XCUIApplication()
        app.launch()
        _ = app.staticTexts["آخر الأخبار"].waitForExistence(timeout: 25)
        return app
    }

    /// نقرة على مركز عنصر البطاقة (المسار السابق — كان ينجح)
    @MainActor
    func testTappingNewsCardOpensArticleDetail() throws {
        let app = launchToFeed()

        let newsButtons = app.buttons.matching(
            NSPredicate(format: "label CONTAINS 'قبل' OR label CONTAINS 'دقيقة قراءة'")
        )
        XCTAssertTrue(newsButtons.firstMatch.waitForExistence(timeout: 10))
        newsButtons.firstMatch.tap()

        XCTAssertTrue(
            app.navigationBars.buttons.firstMatch.waitForExistence(timeout: 10),
            "نقرة مركز البطاقة لم تفتح التفاصيل"
        )
    }

    /// نقرة بإحداثيات فعلية فوق نص العنوان نفسه — تحاكي إصبع المستخدم على العنوان
    @MainActor
    func testTappingTitleTextOpensArticleDetail() throws {
        let app = launchToFeed()

        // أي عنوان خبر في قائمة «آخر الأخبار» — نمرر لأسفل حتى يصبح ظاهراً
        // وقابلاً للنقر فعلاً (النقر الإحداثي على عنصر خارج الشاشة يضيع)
        let title = app.staticTexts.matching(
            NSPredicate(format: "label CONTAINS 'شراكة' OR label CONTAINS 'بيان' OR label CONTAINS 'اتصال'")
        ).firstMatch
        XCTAssertTrue(title.waitForExistence(timeout: 10), "لم أجد نص عنوان في القائمة")

        var swipes = 0
        while (!title.isHittable || title.frame.minY > app.frame.maxY * 0.8) && swipes < 6 {
            app.swipeUp()
            swipes += 1
        }
        XCTAssertTrue(title.isHittable, "عنوان القائمة لم يصبح ظاهراً بعد التمرير")

        let before = XCUIScreen.main.screenshot()
        let beforeAtt = XCTAttachment(screenshot: before)
        beforeAtt.name = "title-before-tap"; beforeAtt.lifetime = .keepAlways
        add(beforeAtt)

        // نقرة إحداثية خام في منتصف نص العنوان (لا عبر resolution للعنصر)
        title.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()

        let opened = app.navigationBars.buttons.firstMatch.waitForExistence(timeout: 8)

        let after = XCUIScreen.main.screenshot()
        let afterAtt = XCTAttachment(screenshot: after)
        afterAtt.name = "title-after-tap"; afterAtt.lifetime = .keepAlways
        add(afterAtt)

        XCTAssertTrue(opened, "النقر على نص العنوان لا يفتح الخبر — UILabel يبتلع اللمسة")
    }
}
