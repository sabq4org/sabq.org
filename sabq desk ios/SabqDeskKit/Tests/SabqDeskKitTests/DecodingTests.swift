import XCTest
@testable import SabqDeskKit

final class DecodingTests: XCTestCase {
    private let decoder = StaffJSON.makeDecoder()

    func testMeDecodesCapabilities() throws {
        let me = try decoder.decode(StaffMe.self, from: Fixtures.me.data)
        XCTAssertEqual(me.id, "user-uuid")
        XCTAssertEqual(me.displayName, "ماجد العتيبي")
        XCTAssertEqual(me.twoFactorEnabled, true)
        XCTAssertEqual(me.roles, ["editor"])
        XCTAssertTrue(me.capabilities.canTickets)
        XCTAssertEqual(me.capabilities.canSocial, .init(view: true, publish: true, schedule: false, reject: true))
    }

    func testInboxPageDecodesBothKindsAndDateForms() throws {
        let page = try decoder.decode(StaffInboxPage.self, from: Fixtures.inbox.data)
        XCTAssertEqual(page.items.count, 2)
        XCTAssertTrue(page.hasMore)
        XCTAssertEqual(page.nextCursor, "eyJ0IjoiMjAyNi0xMC0yNFQxNDowMDowMC4wMDBaIn0")

        let social = page.items[0]
        XCTAssertEqual(social.kind, .social)
        XCTAssertEqual(social.sender.kind, .agency)
        XCTAssertEqual(social.article?.id, "art-uuid")
        XCTAssertTrue(social.hasUnread)
        XCTAssertEqual(social.statusTitle, "بانتظار القرار")
        XCTAssertEqual(social.updatedAt, StaffJSON.parseDate("2026-10-24T15:00:00Z"))

        let ticket = page.items[1]
        XCTAssertEqual(ticket.kind, .ticket)
        XCTAssertNil(ticket.article)
        XCTAssertEqual(ticket.createdAt, StaffJSON.parseDate("2026-10-24T10:00:00.000Z"))
        XCTAssertNotEqual(ticket.listID, social.listID)
    }

    func testUnknownSenderKindDoesNotBreakDecoding() throws {
        let json = Fixtures.inbox.replacingOccurrences(of: "\"kind\": \"agency\"", with: "\"kind\": \"newsroom\"")
        let page = try decoder.decode(StaffInboxPage.self, from: json.data)
        XCTAssertEqual(page.items[0].sender.kind, .unknown)
    }

    func testUnreadCounts() throws {
        let counts = try decoder.decode(StaffUnreadCounts.self, from: #"{"tickets":3,"social":2,"total":5}"#.data)
        XCTAssertEqual(counts, StaffUnreadCounts(tickets: 3, social: 2, total: 5))
    }

    func testTicketDetailDecodesThread() throws {
        let detail = try decoder.decode(StaffTicketDetail.self, from: Fixtures.ticketDetail.data)
        XCTAssertEqual(detail.ticket.status, .open)
        XCTAssertEqual(detail.ticket.writerName, "د. خالد العتيبي")
        XCTAssertEqual(detail.messages.map(\.senderRole), [.writer, .admin])
        XCTAssertEqual(detail.messages[1].parentMessageId, "msg-1")
    }

    func testSocialDetailDecodesPreviewAndAttempts() throws {
        let detail = try decoder.decode(StaffSocialDetail.self, from: Fixtures.socialDetail.data)
        XCTAssertEqual(detail.post.status, .draft)
        XCTAssertNil(detail.post.scheduledAt)
        XCTAssertEqual(detail.preview.maxLength, 280)
        XCTAssertTrue(detail.preview.valid)
        XCTAssertNil(detail.author)
        XCTAssertEqual(detail.agency?.name, "وكالة الأفق")
        XCTAssertEqual(detail.attempts.first?.httpStatus, 503)
        XCTAssertEqual(detail.attempts.first?.retryable, true)
    }

    func testUnknownSocialStatusIsTolerated() throws {
        let json = Fixtures.socialPost.replacingOccurrences(of: "\"status\": \"draft\"", with: "\"status\": \"archived\"")
        let post = try decoder.decode(StaffSocialPost.self, from: json.data)
        XCTAssertEqual(post.status, .unknown)
    }
}
