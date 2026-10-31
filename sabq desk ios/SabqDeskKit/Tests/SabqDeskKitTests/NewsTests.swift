import XCTest
@testable import SabqDeskKit

/// «الأخبار» (2026-10-31): decoding, deep links, capabilities and requests.
final class NewsTests: XCTestCase {
    private let decoder = StaffJSON.makeDecoder()

    private let board = #"""
    {
      "counts": {"all": 3, "reporters": 1, "editRequests": 1, "email": 1},
      "oldestAt": "2026-10-31T04:20:00.000Z",
      "editRequestsReady": true,
      "items": [
        {"kind":"draft","id":"a1","articleId":"a1","title":"خبر","subtitle":null,"channel":"app",
         "reporterName":"مراسل جدة","categoryName":"محليات","imageUrl":"https://media.sabq.org/x.webp",
         "thumbnailUrl":null,"albumCount":4,"isBreaking":true,"lockedBy":null,"submittedAt":"2026-10-31T07:40:00.000Z"},
        {"kind":"edit_request","id":"r1","articleId":"a9","title":"معرض","articleStatus":"published",
         "requesterName":"مراسل الرياض","urgent":false,"note":null,"fields":["title","content","futureField"],
         "label":"العنوان والنص","imageUrl":null,"submittedAt":"2026-10-31T05:40:00.000Z"},
        {"kind":"future_kind","id":"x"},
        {"kind":"draft","id":"a2","articleId":"a2","title":"بريد","channel":"fax","albumCount":0,
         "isBreaking":false,"submittedAt":"2026-10-31T04:20:00.000Z"}
      ]
    }
    """#

    func testBoardDecodesKnownKindsAndSkipsUnknown() throws {
        let decoded = try decoder.decode(StaffNewsBoard.self, from: board.data)
        XCTAssertEqual(decoded.items.map(\.id), ["draft-a1", "edit-r1", "draft-a2"])
        XCTAssertEqual(decoded.counts.count(for: .editRequests), 1)
        XCTAssertEqual(decoded.breakdown, "1 مراسل · 1 بريد · 1 طلب تعديل")
        guard case .draft(let first) = decoded.items[0] else { return XCTFail("expected a draft") }
        XCTAssertTrue(first.isBreaking)
        XCTAssertEqual(first.channel.title, "من التطبيق")
        XCTAssertEqual(first.thumbnailURL?.host, "media.sabq.org")
        guard case .editRequest(let request) = decoded.items[1] else { return XCTFail("expected a request") }
        XCTAssertEqual(request.fields, [.title, .content, .unknown])
        XCTAssertEqual(request.onWhat, "على خبر منشور")
        guard case .draft(let last) = decoded.items[2] else { return XCTFail("expected a draft") }
        XCTAssertEqual(last.channel, .unknown)
    }

    func testOlderServerWithoutNewsKeepsDefaults() throws {
        let decoded = try decoder.decode(StaffNewsBoard.self, from: "{}".data)
        XCTAssertEqual(decoded.counts.all, 0)
        XCTAssertTrue(decoded.editRequestsReady)
        XCTAssertTrue(decoded.items.isEmpty)
    }

    func testEditRequestDetailFlagsMovedParagraphs() throws {
        let json = #"""
        {"request":{"id":"r1","articleId":"a9","status":"pending","urgent":true,"note":"x","requesterName":"م",
          "proposed":{"title":"جديد","albumAdd":["https://media.sabq.org/1.webp"]},"createdAt":"2026-10-31T05:40:00.000Z"},
         "article":{"id":"a9","title":"قديم","status":"published"},
         "fields":["title","content","albumImages"],
         "contentEdits":[{"before":"أ","after":"ب","found":false}]}
        """#
        let detail = try decoder.decode(StaffEditRequestDetail.self, from: json.data)
        XCTAssertTrue(detail.request.isPending)
        XCTAssertTrue(detail.hasMissingParagraphs)
        XCTAssertEqual(detail.request.proposed.albumAdd?.count, 1)
        XCTAssertEqual(StaffEditRequestDetail.approveTitle(selected: 2, total: 3), "اعتمد وطبّق (2 من 3)")
        XCTAssertEqual(StaffEditRequestDetail.approveTitle(selected: 3, total: 3), "اعتمد وطبّق")
    }

    func testDeepLinksForNewsAndEditRequests() {
        XCTAssertEqual(DeskDeepLink(url: URL(string: "sabqdesk://news/art-1")!), .news(id: "art-1"))
        XCTAssertEqual(DeskDeepLink(url: URL(string: "sabqdesk://news/edit-request/req-9")!), .editRequest(id: "req-9"))
        XCTAssertNil(DeskDeepLink(url: URL(string: "sabqdesk://news/edit-request/bad%2Fid")!))
        XCTAssertNil(DeskDeepLink(url: URL(string: "sabqdesk://news/other/req-9")!))
        XCTAssertEqual(DeskDeepLink.editRequest(id: "r1").url.absoluteString, "sabqdesk://news/edit-request/r1")
        XCTAssertEqual(DeskDeepLink(pushPayload: ["type": "desk.news_draft", "articleId": "a1"]), .news(id: "a1"))
        XCTAssertEqual(DeskDeepLink(pushPayload: ["type": "desk.edit_request", "editRequestId": "r1"]), .editRequest(id: "r1"))
        XCTAssertEqual(DeskDeepLink(pushPayload: ["deeplink": "sabqdesk://news/edit-request/r2"]), .editRequest(id: "r2"))
    }

    func testAccountMovesToHeaderWithFiveWorkTabs() throws {
        var caps = StaffCapabilities(canTickets: true, canSocial: .init(view: true), canSystemHealth: true,
                                     canOpinion: .init(view: true))
        XCTAssertEqual(caps.workTabCount, 4)
        XCTAssertFalse(caps.accountInHeader)
        caps.canNews = true
        XCTAssertTrue(caps.accountInHeader)
        XCTAssertTrue(StaffCapabilities(canNews: true).canOpenApp)
        let decoded = try decoder.decode(StaffCapabilities.self,
                                         from: #"{"canTickets":false,"canSocial":{"view":false,"publish":false,"schedule":false,"reject":false}}"#.data)
        XCTAssertFalse(decoded.canNews)
    }

    func testNewsDraftsPreferenceDefaultsOn() throws {
        XCTAssertTrue(try decoder.decode(StaffAlertPrefs.self, from: "{}".data).newsDrafts)
        XCTAssertFalse(StaffAlertPrefsUpdate(newsDrafts: false).applied(to: StaffAlertPrefs()).newsDrafts)
    }

    private func makeClient(_ replies: [MockTransport.Reply]) -> (StaffAPIClient, MockTransport) {
        let transport = MockTransport(replies)
        let store = InMemorySessionStore(session: StaffSession(token: "t", expiresAt: Date().addingTimeInterval(3600), userId: "u"))
        let client = StaffAPIClient(configuration: .init(baseURL: URL(string: "https://api.example.test")!,
                                                         installationID: "install-1", appVersion: "1.0"),
                                    sessionStore: store, transport: transport)
        return (client, transport)
    }

    func testPublishSendsVersionGuardAndCategory() async throws {
        let reply = #"{"article":{"id":"a1","status":"published","publishedAt":"2026-10-31T08:00:00.000Z","url":"https://sabq.org/article/x"}}"#
        let (client, transport) = makeClient([.init(status: 200, body: reply)])
        let result = try await client.publishNews(id: "a1", expectedUpdatedAt: "2026-10-31T07:40:00.123Z", categoryID: "c2")
        XCTAssertEqual(result.article.status, "published")
        let request = try XCTUnwrap(transport.lastRequest)
        XCTAssertEqual(request.url?.path, "/api/v1/staff/news/a1/publish")
        XCTAssertEqual(request.httpMethod, "POST")
        let body = jsonObject(request.httpBody)
        XCTAssertEqual(body["expectedUpdatedAt"] as? String, "2026-10-31T07:40:00.123Z")
        XCTAssertEqual(body["categoryId"] as? String, "c2")
        XCTAssertNil(body["scheduledAt"])
    }

    func testApproveSendsOnlyKnownFieldsAndTrimsUpdateLine() async throws {
        let (client, transport) = makeClient([.init(status: 200, body: #"{"ok":true,"appliedFields":["title"],"regenerating":false}"#)])
        let result = try await client.approveEditRequest(id: "r1", fields: [.title, .unknown], updateLine: "  ", regenerate: true)
        XCTAssertEqual(result.appliedFields, [.title])
        let body = jsonObject(transport.lastRequest?.httpBody)
        XCTAssertEqual(transport.lastRequest?.url?.path, "/api/v1/staff/news/edit-requests/r1/approve")
        XCTAssertEqual(body["fields"] as? [String], ["title"])
        XCTAssertNil(body["updateLine"])
        XCTAssertEqual(body["regenerate"] as? Bool, true)
    }

    func testRejectAndReturnRequireAReason() async {
        let (client, transport) = makeClient([])
        do {
            try await client.rejectEditRequest(id: "r1", reason: " ")
            XCTFail("expected validation")
        } catch {}
        do {
            _ = try await client.returnNewsToReporter(id: "a1", note: "ok")
            XCTFail("expected validation")
        } catch {}
        XCTAssertTrue(transport.requests.isEmpty)
    }
}
