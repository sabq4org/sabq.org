import XCTest
@testable import SabqDeskKit

final class NotificationsTests: XCTestCase {
    private let decoder = StaffJSON.makeDecoder()

    private let page = #"""
    {
      "items": [
        {"id":"e1","kind":"news_published","category":"news","label":"خبر جديد عبر «نشر سبق»","actionLabel":"فتح الخبر",
         "title":"عنوان الخبر","detail":"الناشر: وكالة الأفق","actorName":"وكالة الأفق","targetId":"a1",
         "linkUrl":"https://sabq.org/article/abc","deeplink":"sabqdesk://notifications","scheduledAt":null,
         "createdAt":"2026-10-29T09:50:00.000Z","isUnread":true},
        {"id":"e2","kind":"tweet_scheduled","category":"tweet","label":"جُدولت تغريدة","actionLabel":"فتح التغريدة",
         "title":"نص التغريدة","detail":"جدولها: سارة","actorName":"سارة","targetId":"p1","linkUrl":null,
         "deeplink":"sabqdesk://social/p1","scheduledAt":"2026-10-29T12:00:00.000Z",
         "createdAt":"2026-10-29T08:10:00.000Z","isUnread":false},
        {"id":"e3","kind":"future_kind","category":"sports","label":"؟","actionLabel":"؟","title":"؟","detail":"",
         "targetId":"x","createdAt":"2026-10-28T08:10:00.000Z","isUnread":false},
        {"id":"e4","kind":"opinion_draft","category":"opinion","label":"مسودة مقال رأي جديدة","actionLabel":"مراجعة المقال",
         "title":"مقال","detail":"كاتب","targetId":"op1","createdAt":"2026-10-28T08:10:00.000Z","isUnread":false}
      ],
      "nextCursor": "abc",
      "categories": ["tweet","opinion","news","sports"],
      "counts": {"all": 3, "tweet": 1, "opinion": 1, "news": 1},
      "unreadCount": 1,
      "seenAt": null
    }
    """#

    func testPageDecodesAndSkipsUnknownCategories() throws {
        let decoded = try decoder.decode(StaffNotificationsPage.self, from: page.data)
        XCTAssertEqual(decoded.items.map(\.id), ["e1", "e2", "e4"])
        XCTAssertEqual(decoded.categories, [.tweet, .opinion, .news])
        XCTAssertEqual(decoded.counts.count(nil), 3)
        XCTAssertEqual(decoded.counts.count(.news), 1)
        XCTAssertEqual(decoded.unreadCount, 1)
        XCTAssertEqual(decoded.nextCursor, "abc")
    }

    func testRowLinks() throws {
        let items = try decoder.decode(StaffNotificationsPage.self, from: page.data).items
        XCTAssertNil(items[0].link)
        XCTAssertEqual(items[0].articleURL?.absoluteString, "https://sabq.org/article/abc")
        XCTAssertEqual(items[1].link, .social(id: "p1"))
        XCTAssertEqual(items[2].link, .opinion(id: "op1"))

        var foreign = items[0]
        foreign.linkUrl = "https://evil.example/article/abc"
        XCTAssertNil(foreign.articleURL)
        foreign.linkUrl = "http://sabq.org/article/abc"
        XCTAssertNil(foreign.articleURL)
    }

    func testUnreadDecodesWithoutLatest() throws {
        let unread = try decoder.decode(StaffNotificationsUnread.self, from: #"{"unreadCount":4,"latest":null}"#.data)
        XCTAssertEqual(unread.unreadCount, 4)
        XCTAssertNil(unread.latest)
    }

    func testTimelineGroupsByRiyadhDay() throws {
        let items = try decoder.decode(StaffNotificationsPage.self, from: page.data).items
        // 2026-10-29 13:00 Riyadh.
        let now = try XCTUnwrap(StaffJSON.parseDate("2026-10-29T10:00:00Z"))
        let days = StaffNotificationTimeline.days(items, now: now)
        XCTAssertEqual(days.map(\.title), ["اليوم", "أمس"])
        XCTAssertEqual(days[0].items.map(\.id), ["e1", "e2"])
        XCTAssertEqual(days[1].items.map(\.id), ["e4"])
    }

    func testNotificationsDeepLink() {
        XCTAssertEqual(DeskDeepLink(url: URL(string: "sabqdesk://notifications")!), .notifications)
        XCTAssertEqual(DeskDeepLink.notifications.url.absoluteString, "sabqdesk://notifications")
        XCTAssertEqual(DeskDeepLink(pushPayload: ["type": "desk.publisher_news", "articleId": "a1"]), .notifications)
    }

    func testCapabilitiesAndPrefsCarryPublisherNews() throws {
        let json = #"{"canTickets":false,"canSocial":{"view":true,"publish":false,"schedule":false,"reject":false},"canPublisherNews":true}"#
        XCTAssertTrue(try decoder.decode(StaffCapabilities.self, from: json.data).canPublisherNews)
        let older = #"{"canTickets":false,"canSocial":{"view":true,"publish":false,"schedule":false,"reject":false}}"#
        XCTAssertFalse(try decoder.decode(StaffCapabilities.self, from: older.data).canPublisherNews)

        XCTAssertTrue(try decoder.decode(StaffAlertPrefs.self, from: "{}".data).publisherNews)
        let update = StaffAlertPrefsUpdate(publisherNews: false)
        XCTAssertFalse(update.applied(to: StaffAlertPrefs()).publisherNews)
    }
}
