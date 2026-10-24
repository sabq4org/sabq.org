import XCTest
@testable import SabqDeskKit

final class DeepLinkAndRulesTests: XCTestCase {
    func testParsesBothLinkKinds() {
        XCTAssertEqual(DeskDeepLink(url: URL(string: "sabqdesk://ticket/ticket-uuid")!), .ticket(id: "ticket-uuid"))
        XCTAssertEqual(DeskDeepLink(url: URL(string: "SABQDESK://social/abc_123")!), .social(id: "abc_123"))
        XCTAssertEqual(DeskDeepLink.social(id: "p1").url.absoluteString, "sabqdesk://social/p1")
    }

    func testRejectsForeignOrMalformedLinks() {
        for raw in ["https://sabq.org/ticket/1", "sabqdesk://article/1", "sabqdesk://ticket/", "sabqdesk://ticket/a/b",
                    "sabqdesk://ticket/%2E%2E", "sabqdesk://social/id%3Fx"] {
            XCTAssertNil(DeskDeepLink(url: URL(string: raw)!), raw)
        }
        XCTAssertFalse(DeskDeepLink.isValidID(String(repeating: "a", count: 129)))
        XCTAssertFalse(DeskDeepLink.isValidID("رقم"))
    }

    func testPushPayloadPrefersDeeplinkThenIDs() {
        XCTAssertEqual(DeskDeepLink(pushPayload: ["deeplink": "sabqdesk://social/p1", "ticketId": "t1"]), .social(id: "p1"))
        XCTAssertEqual(DeskDeepLink(pushPayload: ["ticketId": "t1", "kind": "new_ticket"]), .ticket(id: "t1"))
        XCTAssertEqual(DeskDeepLink(pushPayload: ["postId": "p2", "proposalKind": "agency"]), .social(id: "p2"))
        XCTAssertNil(DeskDeepLink(pushPayload: ["postId": "../x"]))
        XCTAssertNil(DeskDeepLink(pushPayload: ["aps": ["alert": "x"]]))
    }

    func testRejectionReasonComposition() {
        XCTAssertEqual(SocialRejectionPreset.allCases.map(\.title),
                       ["لا يناسب سياسة الحساب", "معلومة غير دقيقة", "مكرر", "يحتاج إعادة صياغة"])
        XCTAssertEqual(SocialRejectionPreset.composeReason(preset: .policy, note: ""), "لا يناسب سياسة الحساب")
        XCTAssertEqual(SocialRejectionPreset.composeReason(preset: nil, note: " ملاحظة "), "ملاحظة")
        XCTAssertNil(SocialRejectionPreset.composeReason(preset: nil, note: "  "))
        XCTAssertEqual(SocialRejectionPreset.composeReason(preset: nil, note: String(repeating: "ا", count: 1200))?.count, 1000)
    }

    func testCapabilitiesGateSocialActions() {
        let caps = StaffCapabilities(canTickets: false, canSocial: .init(view: true, publish: true, schedule: false, reject: true))
        XCTAssertEqual(caps.inboxFilters, [.social])
        XCTAssertEqual(caps.socialActions(for: .draft), SocialActionSet(publish: true, schedule: false, reject: true))
        XCTAssertEqual(caps.socialActions(for: .failed), SocialActionSet(publish: true, schedule: false, reject: false))
        XCTAssertTrue(caps.socialActions(for: .published).isEmpty)
        XCTAssertTrue(caps.socialActions(for: .canceled).isEmpty)
        XCTAssertFalse(StaffCapabilities.none.canOpenInbox)
        XCTAssertEqual(StaffCapabilities(canTickets: true, canSocial: .init(view: true)).inboxFilters, [.all, .ticket, .social])
    }

    func testRiyadhFormattingIgnoresDeviceZone() throws {
        let date = try XCTUnwrap(StaffJSON.parseDate("2026-10-25T21:05:00Z"))
        XCTAssertEqual(RiyadhTime.isoString(date), "2026-10-26T00:05:00+03:00")
        XCTAssertTrue(RiyadhTime.displayString(date).contains("00:05"))
    }

    func testEarliestSchedulableIsRoundedAndAhead() throws {
        let now = try XCTUnwrap(StaffJSON.parseDate("2026-10-25T10:02:37Z"))
        let earliest = RiyadhTime.earliestSchedulableDate(now: now)
        XCTAssertEqual(RiyadhTime.isoString(earliest), "2026-10-25T13:10:00+03:00")
        XCTAssertTrue(RiyadhTime.isSchedulable(earliest, now: now))
        XCTAssertFalse(RiyadhTime.isSchedulable(now, now: now))
    }
}
