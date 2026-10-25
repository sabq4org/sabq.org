import XCTest
@testable import SabqDeskKit

final class DeskBoardTests: XCTestCase {
    private func date(_ raw: String) throws -> Date {
        try XCTUnwrap(StaffJSON.parseDate(raw))
    }

    func testSocialSectionsMapToInboxQueries() {
        XCTAssertEqual(DeskSocialSection.allCases.map(\.title), ["بانتظارك", "مجدول", "منشور", "مرفوض"])
        let pending = DeskSocialSection.pending.query.queryItems
        XCTAssertTrue(pending.contains(URLQueryItem(name: "type", value: "social")))
        XCTAssertTrue(pending.contains(URLQueryItem(name: "status", value: "draft,processing,failed")))
        XCTAssertEqual(DeskSocialSection.rejected.statusQuery, "canceled")
        XCTAssertEqual(DeskTicketSection.awaiting.query(search: " خالد ").queryItems
            .first { $0.name == "q" }?.value, "خالد")
        XCTAssertEqual(DeskTicketSection.closed.status, .closed)
    }

    func testArabicCountsAgree() {
        XCTAssertEqual(DeskCount.tweets(1), "تغريدة واحدة")
        XCTAssertEqual(DeskCount.tweets(2), "تغريدتان")
        XCTAssertEqual(DeskCount.tweets(3), "3 تغريدات")
        XCTAssertEqual(DeskCount.tweets(11), "11 تغريدة")
        XCTAssertEqual(DeskCount.messages(2), "رسالتان")
        XCTAssertEqual(DeskCount.messages(7), "7 رسائل")
    }

    func testGreetingMentionsOnlyWhatTheMemberCanSee() {
        XCTAssertEqual(DeskCount.greeting(name: "علي الحازمي", pendingTweets: 3, openMessages: 2,
                                          showsTweets: true, showsMessages: true),
                       "أهلًا علي، عندك 3 تغريدات بانتظار قرارك ورسالتان من المساهمين.")
        XCTAssertEqual(DeskCount.greeting(name: nil, pendingTweets: 3, openMessages: 0,
                                          showsTweets: false, showsMessages: true),
                       "أهلًا، لا شيء ينتظرك الآن.")
    }

    func testDayTitlesAndCountdownUseRiyadhTime() throws {
        // 22:30 Riyadh on Sunday 25 October.
        let now = try date("2026-10-25T19:30:00Z")
        XCTAssertTrue(RiyadhTime.dayTitle(try date("2026-10-25T20:30:00Z"), now: now).hasPrefix("اليوم · "))
        // 00:30 Riyadh is already Monday.
        XCTAssertTrue(RiyadhTime.dayTitle(try date("2026-10-25T21:30:00Z"), now: now).hasPrefix("غدًا · "))
        XCTAssertEqual(RiyadhTime.countdown(to: try date("2026-10-25T19:42:00Z"), now: now), "بعد 12 د")
        XCTAssertEqual(RiyadhTime.countdown(to: try date("2026-10-25T20:55:00Z"), now: now), "بعد 1:25")
        XCTAssertNil(RiyadhTime.countdown(to: try date("2026-10-25T19:00:00Z"), now: now))
        XCTAssertNil(RiyadhTime.countdown(to: try date("2026-10-27T19:00:00Z"), now: now))
        XCTAssertEqual(RiyadhTime.ago(try date("2026-10-25T19:18:00Z"), now: now), "قبل 12 د")
        XCTAssertEqual(RiyadhTime.ago(try date("2026-10-25T16:00:00Z"), now: now), "قبل 3 س")
        XCTAssertEqual(RiyadhTime.ago(try date("2026-10-24T10:00:00Z"), now: now), "أمس")
    }

    func testSchedulePresetsFollowTheClock() throws {
        // 14:02 Riyadh: in an hour, tonight 21:00, tomorrow 07:00.
        let afternoon = try date("2026-10-25T11:02:00Z")
        let presets = SchedulePreset.defaults(now: afternoon)
        XCTAssertEqual(presets.map(\.id), ["hour", "tonight", "tomorrow-morning"])
        XCTAssertEqual(RiyadhTime.isoString(presets[1].date), "2026-10-25T21:00:00+03:00")
        XCTAssertEqual(RiyadhTime.isoString(presets[2].date), "2026-10-26T07:00:00+03:00")
        XCTAssertTrue(presets.allSatisfy { RiyadhTime.isSchedulable($0.date, now: afternoon) })

        // 21:30 Riyadh: tonight has passed, offer tomorrow evening instead.
        let late = try date("2026-10-25T18:30:00Z")
        XCTAssertEqual(SchedulePreset.defaults(now: late).map(\.id), ["hour", "tomorrow-evening", "tomorrow-morning"])
    }

    func testClashFindsTheNearestSlotInsideTheWindow() throws {
        let target = try date("2026-10-25T18:00:00Z")
        let slots = [try date("2026-10-25T18:40:00Z"), try date("2026-10-25T17:50:00Z"), try date("2026-10-25T18:20:00Z")]
        XCTAssertEqual(ScheduleClash.nearest(to: target, among: slots), try date("2026-10-25T17:50:00Z"))
        XCTAssertNil(ScheduleClash.nearest(to: target, among: [try date("2026-10-25T19:00:00Z")]))
    }

    func testInitialsSkipTitles() {
        XCTAssertEqual(DeskInitials.of("د. خالد العتيبي"), "خ\u{200C}ع")
        XCTAssertEqual(DeskInitials.of("وكالة"), "و")
        XCTAssertEqual(DeskInitials.of("  "), "؟")
    }

    func testQuickRepliesAreCleanedAndCapped() throws {
        let suite = "desk.tests.quickReplies.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let store = QuickReplyStore(defaults: defaults)
        XCTAssertEqual(store.replies, QuickReplyStore.defaults)
        store.replies = ["  أهلًا  ", "", String(repeating: "ب", count: 300)] + Array(repeating: "ج", count: 10)
        XCTAssertEqual(store.replies.count, 8)
        XCTAssertEqual(store.replies.first, "أهلًا")
        XCTAssertEqual(store.replies[1].count, 200)
    }

    func testInboxItemDecodesTheRejectionReason() throws {
        let json = """
        {"id":"p1","kind":"social","title":"t","sender":{"name":"وكالة","kind":"agency"},
         "createdAt":"2026-10-25T10:00:00Z","updatedAt":"2026-10-25T10:00:00Z",
         "status":"canceled","hasUnread":false,"lastError":"مكرر"}
        """
        let item = try StaffJSON.makeDecoder().decode(StaffInboxItem.self, from: Data(json.utf8))
        XCTAssertEqual(item.lastError, "مكرر")
    }

    func testGreetingKeepsOrganisationNamesAndHonorifics() {
        XCTAssertEqual(DeskCount.greetingName("صحيفة سبق"), "صحيفة سبق")
        XCTAssertEqual(DeskCount.greetingName("وكالة الأنباء السعودية"), "وكالة الأنباء السعودية")
        XCTAssertEqual(DeskCount.greetingName("حساب النشر الآلي"), "حساب النشر الآلي")
        XCTAssertEqual(DeskCount.greetingName("د. خالد العتيبي"), "د. خالد")
        XCTAssertEqual(DeskCount.greetingName("أ.د. سارة الحربي"), "أ.د. سارة")
        XCTAssertEqual(DeskCount.greetingName("م. فهد"), "م. فهد")
        XCTAssertEqual(DeskCount.greetingName("د."), "د.")
        XCTAssertEqual(DeskCount.greetingName("علي الحازمي"), "علي")
        XCTAssertNil(DeskCount.greetingName("  "))
        XCTAssertNil(DeskCount.greetingName(nil))
        XCTAssertEqual(DeskCount.greeting(name: "صحيفة سبق", pendingTweets: 0, openMessages: 0,
                                          showsTweets: true, showsMessages: true),
                       "أهلًا صحيفة سبق، لا شيء ينتظرك الآن.")
    }

    func testInitialsSkipTheDefiniteArticle() {
        XCTAssertEqual(DeskInitials.of("إبراهيم الروساء"), "إ\u{200C}ر")
        XCTAssertEqual(DeskInitials.of("أ. نورة القحطاني"), "ن\u{200C}ق")
        XCTAssertEqual(DeskInitials.of("الهلال"), "ه")
        XCTAssertEqual(DeskInitials.of("صحيفة سبق"), "ص\u{200C}س")
    }

    func testPreviewDropsHandleLineAndBylinePrefix() {
        XCTAssertEqual(DeskPreviewText.clean("@sabq_news\nسلمان الدوسري يكتب : الاقتصاد ينمو"), "الاقتصاد ينمو")
        XCTAssertEqual(DeskPreviewText.clean("يكتب: نص قصير"), "نص قصير")
        XCTAssertEqual(DeskPreviewText.clean("  نص عادي بلا مقدمة  "), "نص عادي بلا مقدمة")
        XCTAssertEqual(DeskPreviewText.clean("@sabq شكرًا للمتابعة"), "@sabq شكرًا للمتابعة", "a mention inside the text stays")
        XCTAssertEqual(DeskPreviewText.clean(nil), "")
    }

    func testRejectionNoteDistinguishesWithdrawalReasonAndNone() {
        XCTAssertEqual(DeskRejectionNote(canceledBySelf: true, reason: "مكرر"), .withdrawn)
        XCTAssertEqual(DeskRejectionNote(canceledBySelf: false, reason: " مكرر "), .reason("مكرر"))
        XCTAssertEqual(DeskRejectionNote(canceledBySelf: nil, reason: nil), .noReason)
        XCTAssertEqual(DeskRejectionNote.withdrawn.text, "سحبه صاحبه قبل النشر")
        XCTAssertEqual(DeskRejectionNote.reason("مكرر").text, "السبب: مكرر")
        XCTAssertEqual(DeskRejectionNote.noReason.text, "رُفض من لوحة التحرير · بلا سبب مسجّل")
        XCTAssertTrue(DeskRejectionNote.reason("x").isReason)
        XCTAssertFalse(DeskRejectionNote.noReason.isReason)
    }

    func testShortDatesPutTheDayFirstWithLatinDigits() throws {
        let now = try date("2026-10-25T19:30:00Z")
        let label = RiyadhTime.shortString(try date("2026-10-11T09:00:00Z"), relativeTo: now)
        XCTAssertTrue(label.hasPrefix("11 "), label)
        XCTAssertNil(label.rangeOfCharacter(from: CharacterSet(charactersIn: "٠١٢٣٤٥٦٧٨٩")), label)
    }

    func testSystemCopyUsesLatinDigitsAndPercent() {
        XCTAssertEqual(DeskSystemCopy.usageLine(requests: 2471, failures: 0), "2471 طلبًا خلال 24 ساعة · بلا أخطاء")
        XCTAssertEqual(DeskSystemCopy.usageLine(requests: 3, failures: 1), "1 فشل من 3 طلبات خلال 24 ساعة")
        XCTAssertNil(DeskSystemCopy.usageLine(requests: nil, failures: nil))
        XCTAssertEqual(DeskSystemCopy.budgetAmount(spent: 410.2, limit: 500), "410 من 500 دولار")
        XCTAssertEqual(DeskSystemCopy.budgetTitle(label: "OpenAI", percent: 82), "OpenAI · 82%")
        XCTAssertEqual(DeskSystemCopy.statusTitle(.down, quotaExceeded: true), "نفدت الحصة")
        XCTAssertEqual(DeskSystemCopy.statusTitle(.degraded, quotaExceeded: false), "متدهور")
    }

    func testAlertTimeIsRelativeThenClockThenDate() throws {
        let now = try date("2026-10-25T15:15:00Z") // 18:15 Riyadh
        XCTAssertEqual(RiyadhTime.alertLabel(try date("2026-10-25T15:09:00Z"), now: now), .phrase("قبل 6 د"))
        XCTAssertEqual(RiyadhTime.alertLabel(try date("2026-10-25T06:00:00Z"), now: now), .clock("09:00"))
        XCTAssertEqual(RiyadhTime.alertLabel(try date("2026-10-24T10:00:00Z"), now: now), .phrase("أمس"))
    }

    func testAvatarURLsMustBeHTTPS() {
        XCTAssertEqual(DeskAvatarURL.https("https://media.sabq.org/a.jpg")?.host, "media.sabq.org")
        XCTAssertNil(DeskAvatarURL.https("http://media.sabq.org/a.jpg"))
        XCTAssertNil(DeskAvatarURL.https("/uploads/a.jpg"))
        XCTAssertNil(DeskAvatarURL.https(""))
        XCTAssertNil(DeskAvatarURL.https(nil))
    }
}
