import XCTest
@testable import SabqDeskKit

final class ErrorMappingTests: XCTestCase {
    func testTwoFactorRequiredIsItsOwnCase() {
        let body = #"{"code":"two_factor_required","message":"يلزم تفعيل المصادقة الثنائية (2FA) للوصول إلى تطبيق الديسك"}"#
        let error = StaffAPIError.from(status: 403, data: body.data)
        XCTAssertEqual(error, .twoFactorRequired(message: "يلزم تفعيل المصادقة الثنائية (2FA) للوصول إلى تطبيق الديسك"))
        XCTAssertFalse(error.requiresSignIn)
    }

    func testPlainForbiddenIsNotTwoFactor() {
        let error = StaffAPIError.from(status: 403, data: #"{"code":"forbidden","message":"x"}"#.data)
        XCTAssertEqual(error, .forbidden(message: "x"))
    }

    func testEveryDocumentedCodeMaps() {
        let cases: [(String, Int, StaffAPIError)] = [
            ("unauthorized", 401, .unauthorized(message: nil)),
            ("not_found", 404, .notFound(message: nil)),
            ("validation_error", 400, .validation(message: nil)),
            ("ticket_closed", 400, .ticketClosed(message: nil)),
            ("conflict", 409, .conflict(message: nil, post: nil)),
            ("rate_limited", 429, .rateLimited(message: nil)),
            ("publish_failed", 502, .publishFailed(message: nil, post: nil)),
            ("server_error", 500, .server(status: 500, message: nil)),
        ]
        for (code, status, expected) in cases {
            XCTAssertEqual(StaffAPIError.from(status: status, data: #"{"code":"\#(code)"}"#.data), expected, code)
        }
    }

    func testConflictAndPublishFailedCarryThePost() throws {
        let conflict = StaffAPIError.from(status: 409, data: #"{"code":"conflict","message":"busy","post":\#(Fixtures.socialPost)}"#.data)
        guard case .conflict(let message, let post) = conflict else { return XCTFail("expected conflict") }
        XCTAssertEqual(message, "busy")
        XCTAssertEqual(post?.id, "social-post-uuid")

        let failed = StaffAPIError.from(status: 502, data: #"{"code":"publish_failed","post":\#(Fixtures.socialPost)}"#.data)
        guard case .publishFailed(_, let failedPost) = failed else { return XCTFail("expected publish_failed") }
        XCTAssertEqual(failedPost?.status, .draft)
    }

    func testMemberAuthErrorsWithoutCodeFallBackToStatus() {
        XCTAssertEqual(StaffAPIError.from(status: 401, data: #"{"success":false,"message":"بيانات الدخول غير صحيحة"}"#.data),
                       .unauthorized(message: "بيانات الدخول غير صحيحة"))
        XCTAssertEqual(StaffAPIError.from(status: 429, data: Data()), .rateLimited(message: nil))
        XCTAssertEqual(StaffAPIError.from(status: 503, data: "<html>".data), .server(status: 503, message: nil))
    }

    func testUserMessagePrefersServerText() {
        XCTAssertEqual(StaffAPIError.ticketClosed(message: "مغلقة").userMessage, "مغلقة")
        XCTAssertEqual(StaffAPIError.ticketClosed(message: nil).userMessage, "التذكرة مغلقة ولا تقبل ردوداً جديدة")
        XCTAssertEqual(StaffAPIError.network(message: "offline").userMessage, "تعذر الاتصال بالخادم، تحقق من الشبكة")
    }
}
