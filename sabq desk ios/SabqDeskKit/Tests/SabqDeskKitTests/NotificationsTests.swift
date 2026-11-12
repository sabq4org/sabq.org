import XCTest
@testable import SabqDeskKit

final class NotificationsTests: XCTestCase {
    private let decoder = StaffJSON.makeDecoder()

    private let page = #"""
    {
      "items": [
        {"id":"e1","kind":"news_published","category":"news","label":"خبر جديد عبر بوت النشر","actionLabel":"فتح الخبر",
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

    // MARK: - 2026-11-10: bot drafts, reporter news, writer messages, clear

    private func row(kind: String, category: String, target: String, linkUrl: String? = nil) throws -> StaffNotification {
        let link = linkUrl.map { "\"\($0)\"" } ?? "null"
        let json = """
        {"id":"x","kind":"\(kind)","category":"\(category)","label":"l","actionLabel":"a","title":"t","detail":"",
         "targetId":"\(target)","linkUrl":\(link),"createdAt":"2026-11-10T09:00:00.000Z","isUnread":true}
        """
        return try decoder.decode(StaffNotification.self, from: json.data)
    }

    func testNewKindsOpenInsideTheApp() throws {
        XCTAssertEqual(try row(kind: "news_bot_draft", category: "news", target: "a1").link, .news(id: "a1"))
        XCTAssertEqual(try row(kind: "news_draft", category: "news", target: "a2").link, .news(id: "a2"))
        XCTAssertEqual(try row(kind: "news_edit_request", category: "news", target: "r1").link, .editRequest(id: "r1"))
        XCTAssertEqual(try row(kind: "ticket_message", category: "message", target: "t1").link, .ticket(id: "t1"))
        // Published news still opens the live page, not a screen in the app.
        let published = try row(kind: "news_published", category: "news", target: "a3", linkUrl: "https://sabq.org/article/x")
        XCTAssertNil(published.link)
        XCTAssertNotNil(published.articleURL)
        // A crafted id never becomes a link.
        XCTAssertNil(try row(kind: "news_bot_draft", category: "news", target: "a/../b").link)
    }

    func testMessagesTabAndCounts() throws {
        let json = #"{"items":[],"categories":["tweet","news","message"],"counts":{"all":5,"tweet":1,"opinion":0,"news":2,"message":2},"unreadCount":0}"#
        let decoded = try decoder.decode(StaffNotificationsPage.self, from: json.data)
        XCTAssertEqual(decoded.categories, [.tweet, .news, .message])
        XCTAssertEqual(decoded.counts.count(.message), 2)
        XCTAssertEqual(StaffNotificationCategory.message.title, "رسائل")
        // An older server sends no `message` count.
        let older = try decoder.decode(StaffNotificationCounts.self, from: #"{"all":1,"tweet":1,"opinion":0,"news":0}"#.data)
        XCTAssertEqual(older.message, 0)
    }

    func testBotDraftAndPublishedNewsPushes() {
        XCTAssertEqual(DeskDeepLink(pushPayload: ["type": "desk.bot_draft", "deeplink": "sabqdesk://news/a1", "articleId": "a1"]),
                       .news(id: "a1"))
        XCTAssertEqual(DeskDeepLink(pushPayload: ["type": "desk.bot_draft", "articleId": "a1"]), .news(id: "a1"))
        XCTAssertEqual(DeskDeepLink(pushPayload: ["type": "desk.tweet_published", "deeplink": "sabqdesk://social/p1", "postId": "p1"]),
                       .social(id: "p1"))

        let published: [AnyHashable: Any] = ["type": "desk.publisher_news", "deeplink": "sabqdesk://notifications",
                                             "linkUrl": "https://sabq.org/article/abc"]
        XCTAssertEqual(DeskDeepLink.publishedArticleURL(pushPayload: published)?.absoluteString, "https://sabq.org/article/abc")
        // Older server (no linkUrl), a foreign host, or another push type: no article.
        XCTAssertNil(DeskDeepLink.publishedArticleURL(pushPayload: ["type": "desk.publisher_news"]))
        XCTAssertNil(DeskDeepLink.publishedArticleURL(pushPayload: ["type": "desk.publisher_news", "linkUrl": "https://evil.example/a"]))
        XCTAssertNil(DeskDeepLink.publishedArticleURL(pushPayload: ["type": "desk.bot_draft", "linkUrl": "https://sabq.org/article/abc"]))
    }

    func testBotAndFollowPrefsDefaults() throws {
        let prefs = try decoder.decode(StaffAlertPrefs.self, from: "{}".data)
        XCTAssertTrue(prefs.botNews)
        XCTAssertFalse(prefs.publishFollow)
        XCTAssertFalse(StaffAlertPrefs().publishFollow)
        XCTAssertTrue(StaffAlertPrefsUpdate(publishFollow: true).applied(to: prefs).publishFollow)
        XCTAssertFalse(StaffAlertPrefsUpdate(botNews: false).applied(to: prefs).botNews)
        let body = try JSONSerialization.jsonObject(with: StaffJSON.makeEncoder().encode(StaffAlertPrefsUpdate(publishFollow: true)))
        XCTAssertEqual((body as? [String: Any])?["publishFollow"] as? Bool, true)
    }

    func testSourceFieldsDecodeAndFallBack() throws {
        let json = #"""
        [{"id":"a","kind":"news_bot_draft","category":"news","label":"l","actionLabel":"a","title":"t","detail":"من: قروك بوت",
          "targetId":"x","createdAt":"2026-11-12T08:10:00.000Z","isUnread":true,
          "actorKind":"bot","needsDecision":false,"source":"مسودة من بوت · قروك بوت",
          "actorAvatarUrl":"http://insecure.example/a.png"},
         {"id":"b","kind":"tweet_published","category":"tweet","label":"l","actionLabel":"a","title":"t","detail":"نُشرت تلقائيًا في موعدها",
          "targetId":"y","createdAt":"2026-11-12T08:00:00.000Z","isUnread":false,
          "actorKind":"robot-v2","needsDecision":false,"source":""},
         {"id":"c","kind":"news_bot_draft","category":"news","label":"l","actionLabel":"a","title":"t","detail":"من: قروك بوت",
          "targetId":"z","createdAt":"2026-11-12T07:00:00.000Z","isUnread":false},
         {"id":"d","kind":"news_published","category":"news","label":"l","actionLabel":"a","title":"t","detail":"الناشر: خالد",
          "targetId":"w","createdAt":"2026-11-11T07:00:00.000Z","isUnread":false,
          "actorKind":"agency","actorAvatarUrl":"https://media.sabq.org/logos/a.png"}]
        """#
        let items = try decoder.decode([StaffNotification].self, from: Data(json.utf8))
        // The server's verdict wins: a decided bot draft is no longer waiting.
        XCTAssertFalse(items[0].waitsForDecision)
        XCTAssertEqual(items[0].actor, .bot)
        XCTAssertEqual(items[0].sourceLine, "مسودة من بوت · قروك بوت")
        // An unknown actor kind and an empty source fall back quietly.
        XCTAssertEqual(items[1].actor, .person)
        XCTAssertEqual(items[1].sourceLine, "نُشرت تلقائيًا في موعدها")
        // An older server: the kind decides.
        XCTAssertTrue(items[2].waitsForDecision)
        XCTAssertEqual(items[2].actor, .bot)
        XCTAssertEqual(items[2].sourceLine, "من: قروك بوت")
        XCTAssertFalse(items[3].waitsForDecision)

        let split = StaffNotificationTimeline.split(items, now: try XCTUnwrap(StaffJSON.parseDate("2026-11-12T09:00:00.000Z")))
        XCTAssertEqual(split.decisions.map(\.id), ["c"])
        XCTAssertEqual(split.days.map { $0.items.map(\.id) }, [["a", "b"], ["d"]])
        XCTAssertEqual(StaffNotificationCategory.news.tag, "خبر")
        // Only https photos are loaded; an agency keeps its own kind.
        XCTAssertNil(items[0].actorAvatarURL)
        XCTAssertNil(items[2].actorAvatarURL)
        XCTAssertEqual(items[3].actor, .agency)
        XCTAssertEqual(items[3].actorAvatarURL?.host, "media.sabq.org")
    }
}
