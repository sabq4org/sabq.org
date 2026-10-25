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
        XCTAssertEqual(DeskInitials.of("د. خالد العتيبي"), "خ\u{200C}ا")
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
}
