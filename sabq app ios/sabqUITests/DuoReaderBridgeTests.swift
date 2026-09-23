import XCTest

/// جسر الطي/الفتح على iPhone Duo (يُشغَّل يدويًا على محاكي Duo مفتوحًا).
///
/// لا يستطيع XCUITest تغيير وضعية الجهاز، لذا يفعل الاختبار ما يمكنه: يلمس
/// خبرًا في العمود الجانبي على العرض العريض ثم يترك التطبيق حيًا مدة كافية
/// لطيّ الجهاز وفتحه من Device Hub والتقاط اللقطات من الخارج. التحقق
/// البصري في `docs/reports/ios-duo-review-2026-09-19.md`. مُعطَّل في CI
/// (يُشغَّل بـ `-only-testing`) لأنه يتطلب Duo مفتوحًا ووقت انتظار طويلًا.
final class DuoReaderBridgeTests: XCTestCase {
    @MainActor
    func testSelectSecondSidebarRowThenHold() throws {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments = ["-sabqHasCompletedOnboardingV2", "YES", "-appAppearance", "system"]
        app.launch()

        // العمود الجانبي: عنوان القسم «أبرز الأخبار» يظهر على العرض العريض فقط.
        let sidebarHeading = app.staticTexts["أبرز الأخبار"]
        guard sidebarHeading.waitForExistence(timeout: 30) else {
            throw XCTSkip("العمود الجانبي لم يظهر — يلزم iPhone Duo مفتوحًا أو iPad (عرض ≥ 640 نقطة).")
        }

        // صفوف العمود تحمل المعرّف نفسه؛ الأول مفتوح تلقائيًا، فنلمس الثاني.
        // (مطابقة النص «قبل» كانت تلتقط رابط «مقالات ذات صلة» داخل القارئ
        // فتدفع صفحة بدل اختيار صف — الجولة الأولى 2026-09-19.)
        let rows = app.buttons.matching(identifier: "homeSidebarRow")
        XCTAssertTrue(rows.element(boundBy: 1).waitForExistence(timeout: 10))
        let second = rows.element(boundBy: 1)
        let secondLabel = second.label
        second.tap()

        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = "duo-row2-selected"
        attachment.lifetime = .keepAlways
        add(attachment)
        print("DUO_BRIDGE_SELECTED: \(secondLabel)")

        let env = ProcessInfo.processInfo.environment

        // اختياري: دفع «مقال ذو صلة» من داخل القارئ حتى يصير في المكدّس
        // (المسار الذي تنجو حالته مع الحاوية الثابتة).
        if env["DUO_BRIDGE_PUSH_RELATED"] == "1" {
            let related = app.buttons.matching(
                NSPredicate(format: "label CONTAINS[c] %@ AND identifier != %@", "قبل", "homeSidebarRow")
            ).firstMatch
            if related.waitForExistence(timeout: 15) {
                related.tap()
                print("DUO_BRIDGE_PUSHED: \(related.label)")
            } else {
                print("DUO_BRIDGE_PUSHED: none")
            }
            Thread.sleep(forTimeInterval: 3)
        }

        // اختياري: تمرير القارئ (النصف الأيسر في RTL) لأسفل حتى يُقاس بقاء
        // موضع التمرير بعد الطيّ. سحب بالإحداثيات لأن ScrollView القارئ لا
        // يُلتقط باسم موثوق.
        if env["DUO_BRIDGE_SCROLL"] == "1" {
            let scrollViews = app.scrollViews.allElementsBoundByIndex
            print("DUO_BRIDGE_SCROLLVIEWS: \(scrollViews.count)")
            for sv in scrollViews where sv.isHittable {
                for _ in 0..<3 { sv.swipeUp(velocity: .fast) }
            }
            print("DUO_BRIDGE_SCROLLED")
        }

        // نافذة لطيّ الجهاز وفتحه من الخارج (Device Hub) والتقاط اللقطات.
        let hold = ProcessInfo.processInfo.environment["DUO_BRIDGE_HOLD_SECONDS"].flatMap(Double.init) ?? 0
        if hold > 0 {
            print("DUO_BRIDGE_HOLD_START")
            Thread.sleep(forTimeInterval: hold)
        }
        print("DUO_BRIDGE_DONE")
    }
}
