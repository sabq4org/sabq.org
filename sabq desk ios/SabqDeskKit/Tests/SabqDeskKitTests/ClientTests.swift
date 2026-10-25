import XCTest
@testable import SabqDeskKit

final class ClientTests: XCTestCase {
    private func makeClient(_ replies: [MockTransport.Reply], session: StaffSession? = nil)
        -> (StaffAPIClient, MockTransport, InMemorySessionStore) {
        let transport = MockTransport(replies)
        let store = InMemorySessionStore(session: session)
        let client = StaffAPIClient(configuration: .init(baseURL: URL(string: "https://api.example.test")!,
                                                         installationID: "install-1", appVersion: "1.0"),
                                    sessionStore: store, transport: transport)
        return (client, transport, store)
    }

    private let liveSession = StaffSession(token: "session-abc", expiresAt: Date().addingTimeInterval(3600), userId: "user-uuid")

    func testLoginThatNeedsTwoFactorReturnsChallengeWithoutSaving() async throws {
        let stale = StaffSession(token: "stale-token", expiresAt: Date().addingTimeInterval(3600), userId: "stale-user")
        let (client, transport, store) = makeClient([.init(status: 200, body: Fixtures.loginNeeds2FA)], session: stale)
        let result = try await client.login(identifier: " editor@sabq.org ", password: "pw")
        XCTAssertEqual(result, .needsTwoFactor(challengeToken: "challenge-xyz", message: "أدخل رمز التحقق"))
        XCTAssertNil(store.load(), "login must clear any pre-existing session before awaiting 2FA verification")

        let request = try XCTUnwrap(transport.lastRequest)
        XCTAssertEqual(request.url?.path, "/api/v1/auth/login")
        XCTAssertNil(request.value(forHTTPHeaderField: "Authorization"))
        let body = jsonObject(request.httpBody)
        XCTAssertEqual(body["email"] as? String, "editor@sabq.org")
        XCTAssertNil(body["phone"])
        XCTAssertEqual((body["deviceInfo"] as? [String: Any])?["app"] as? String, "com.sabq.desk")
    }

    func testLoginWithPhoneSendsPhone() async throws {
        let (client, transport, _) = makeClient([.init(status: 200, body: Fixtures.loginNeeds2FA)])
        _ = try await client.login(identifier: "0500000000", password: "pw")
        let body = jsonObject(transport.lastRequest?.httpBody)
        XCTAssertEqual(body["phone"] as? String, "0500000000")
        XCTAssertNil(body["email"])
    }

    func testVerifyTwoFactorSavesSession() async throws {
        let (client, transport, store) = makeClient([.init(status: 200, body: Fixtures.loginSuccess)])
        let session = try await client.verifyTwoFactor(challengeToken: "challenge-xyz", factor: .code("123 456"))
        XCTAssertEqual(session.token, "session-abc")
        XCTAssertEqual(session.userId, "user-uuid")
        XCTAssertEqual(store.load(), session)

        let body = jsonObject(transport.lastRequest?.httpBody)
        XCTAssertEqual(transport.lastRequest?.url?.path, "/api/v1/auth/verify-2fa")
        XCTAssertEqual(body["challengeToken"] as? String, "challenge-xyz")
        XCTAssertEqual(body["token"] as? String, "123456")
        XCTAssertNil(body["backupCode"])
    }

    func testVerifyWithBackupCode() async throws {
        let (client, transport, _) = makeClient([.init(status: 200, body: Fixtures.loginSuccess)])
        _ = try await client.verifyTwoFactor(challengeToken: "c", factor: .backupCode(" ABCD-1234 "))
        let body = jsonObject(transport.lastRequest?.httpBody)
        XCTAssertEqual(body["backupCode"] as? String, "ABCD-1234")
        XCTAssertNil(body["token"])
    }

    func testVerifyTwoFactorSendsArabicIndicCodeAsASCII() async throws {
        let (client, transport, _) = makeClient([.init(status: 200, body: Fixtures.loginSuccess)])
        _ = try await client.verifyTwoFactor(challengeToken: "c", factor: .code("١٢٣ ٤٥٦"))
        let body = jsonObject(transport.lastRequest?.httpBody)
        XCTAssertEqual(body["token"] as? String, "123456")
    }

    func testVerifyWithBackupCodeNormalizesDigitsAndCase() async throws {
        let (client, transport, _) = makeClient([.init(status: 200, body: Fixtures.loginSuccess)])
        _ = try await client.verifyTwoFactor(challengeToken: "c", factor: .backupCode(" abcd-١٢٣٤ "))
        let body = jsonObject(transport.lastRequest?.httpBody)
        XCTAssertEqual(body["backupCode"] as? String, "ABCD-1234")
    }

    func testLoginWithArabicIndicPhoneSendsASCIIPhone() async throws {
        let (client, transport, _) = makeClient([.init(status: 200, body: Fixtures.loginNeeds2FA)])
        _ = try await client.login(identifier: " ٠٥٠٠٠٠٠٠٠٠ ", password: "pw")
        let body = jsonObject(transport.lastRequest?.httpBody)
        XCTAssertEqual(body["phone"] as? String, "0500000000")
        XCTAssertNil(body["email"])
    }

    func testWrongCodeSurfacesServerMessage() async {
        let (client, _, store) = makeClient([.init(status: 401, body: #"{"success":false,"message":"رمز التحقق غير صحيح"}"#)])
        do {
            _ = try await client.verifyTwoFactor(challengeToken: "c", factor: .code("000000"))
            XCTFail("expected failure")
        } catch let error as StaffAPIError {
            XCTAssertEqual(error, .unauthorized(message: "رمز التحقق غير صحيح"))
            XCTAssertNil(store.load())
        } catch {
            XCTFail("unexpected \(error)")
        }
    }

    func testStaffRequestsCarryBearerAndInstallationID() async throws {
        let (client, transport, _) = makeClient([.init(status: 200, body: Fixtures.me)], session: liveSession)
        _ = try await client.me()
        let request = try XCTUnwrap(transport.lastRequest)
        XCTAssertEqual(request.url?.absoluteString, "https://api.example.test/api/v1/staff/me")
        XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer session-abc")
        XCTAssertEqual(request.value(forHTTPHeaderField: "X-Installation-Id"), "install-1")
    }

    func testTwoFactorRequiredKeepsTheSession() async {
        let body = #"{"code":"two_factor_required","message":"يلزم تفعيل المصادقة الثنائية"}"#
        let (client, _, store) = makeClient([.init(status: 403, body: body)], session: liveSession)
        do {
            _ = try await client.me()
            XCTFail("expected failure")
        } catch let error as StaffAPIError {
            XCTAssertEqual(error, .twoFactorRequired(message: "يلزم تفعيل المصادقة الثنائية"))
            XCTAssertNotNil(store.load(), "the user may enable 2FA on the web and retry without signing in again")
        } catch {
            XCTFail("unexpected \(error)")
        }
    }

    func testUnauthorizedClearsTheSession() async {
        let (client, _, store) = makeClient([.init(status: 401, body: #"{"code":"unauthorized","message":"x"}"#)], session: liveSession)
        do {
            _ = try await client.unreadCounts()
            XCTFail("expected failure")
        } catch {
            XCTAssertEqual(error as? StaffAPIError, .unauthorized(message: "x"))
        }
        XCTAssertNil(store.load())
    }

    func testExpiredSessionFailsWithoutNetwork() async {
        let expired = StaffSession(token: "old", expiresAt: Date().addingTimeInterval(-10), userId: "u")
        let (client, transport, store) = makeClient([], session: expired)
        do {
            _ = try await client.me()
            XCTFail("expected failure")
        } catch {
            XCTAssertEqual(error as? StaffAPIError, .unauthorized(message: nil))
        }
        XCTAssertTrue(transport.requests.isEmpty)
        XCTAssertNil(store.load())
    }

    func testInboxQueryItems() async throws {
        let (client, transport, _) = makeClient([.init(status: 200, body: Fixtures.inbox)], session: liveSession)
        _ = try await client.inbox(StaffInboxQuery(type: .social, unreadOnly: true, search: "  مؤتمر  ", cursor: "abc", limit: 500))
        let items = URLComponents(url: try XCTUnwrap(transport.lastRequest?.url), resolvingAgainstBaseURL: false)?.queryItems ?? []
        let query = Dictionary(uniqueKeysWithValues: items.map { ($0.name, $0.value ?? "") })
        XCTAssertEqual(query, ["type": "social", "limit": "50", "unread": "true", "q": "مؤتمر", "cursor": "abc"])
    }

    func testRejectSendsComposedReasonAndScheduleSendsRiyadhOffset() async throws {
        let envelope = #"{"post":\#(Fixtures.socialPost)}"#
        let (client, transport, _) = makeClient([.init(status: 200, body: envelope), .init(status: 200, body: envelope)],
                                                session: liveSession)
        let reason = try XCTUnwrap(SocialRejectionPreset.composeReason(preset: .duplicate, note: "نُشر أمس"))
        _ = try await client.rejectSocialPost(id: "social-post-uuid", reason: reason)
        XCTAssertEqual(transport.lastRequest?.url?.path, "/api/v1/staff/social/social-post-uuid/reject")
        XCTAssertEqual(jsonObject(transport.lastRequest?.httpBody)["reason"] as? String, "مكرر — نُشر أمس")

        let date = try XCTUnwrap(StaffJSON.parseDate("2026-10-25T16:30:00Z"))
        _ = try await client.scheduleSocialPost(id: "social-post-uuid", at: date)
        XCTAssertEqual(jsonObject(transport.lastRequest?.httpBody)["scheduledAt"] as? String, "2026-10-25T19:30:00+03:00")
    }

    func testRejectWithBlankReasonOmitsIt() async throws {
        let (client, transport, _) = makeClient([.init(status: 200, body: #"{"post":\#(Fixtures.socialPost)}"#)], session: liveSession)
        _ = try await client.rejectSocialPost(id: "social-post-uuid", reason: "   ")
        XCTAssertTrue(jsonObject(transport.lastRequest?.httpBody).isEmpty)
    }

    func testMaliciousIDNeverReachesThePath() async {
        let (client, transport, _) = makeClient([], session: liveSession)
        do {
            _ = try await client.ticket(id: "../admin?x=1")
            XCTFail("expected failure")
        } catch {
            XCTAssertEqual(error as? StaffAPIError, .notFound(message: nil))
        }
        XCTAssertTrue(transport.requests.isEmpty)
    }

    func testPushRegistrationTargetsDeskBundle() async throws {
        let (client, transport, _) = makeClient([.init(status: 200, body: #"{"success":true}"#)], session: liveSession)
        try await client.registerPushToken(String(repeating: "a", count: 64), deviceName: "iPhone", osVersion: "17.5")
        let body = jsonObject(transport.lastRequest?.httpBody)
        XCTAssertEqual(transport.lastRequest?.url?.path, "/api/v1/members/push-token")
        XCTAssertEqual(body["bundleId"] as? String, "com.sabq.desk")
        XCTAssertEqual(body["provider"] as? String, "apns")
        XCTAssertEqual(body["platform"] as? String, "ios")
        XCTAssertEqual(body["installationId"] as? String, "install-1")
    }

    func testLogoutClearsEvenWhenServerFails() async {
        let (client, _, store) = makeClient([.init(status: 500, body: "{}")], session: liveSession)
        await client.logout()
        XCTAssertNil(store.load())
    }

    func testLoginWith2FAEnabledThenMeSucceedsWithoutGate() async throws {
        let (client, _, store) = makeClient([
            .init(status: 200, body: Fixtures.loginNeeds2FA),
            .init(status: 200, body: Fixtures.loginSuccess),
            .init(status: 200, body: Fixtures.me),
        ])
        let step1 = try await client.login(identifier: "admin@sabq.sa", password: "pw")
        guard case .needsTwoFactor(let challenge, _) = step1 else {
            return XCTFail("expected 2FA challenge")
        }
        XCTAssertNil(store.load())
        _ = try await client.verifyTwoFactor(challengeToken: challenge, factor: .code("123456"))
        let me = try await client.me()
        XCTAssertEqual(me.twoFactorEnabled, true)
        XCTAssertNotNil(store.load())
    }

    func testLoginWithout2FAThenMeThrowsTwoFactorRequiredAndKeepsSessionForRetry() async throws {
        let gateBody = #"{"code":"two_factor_required","message":"يلزم تفعيل المصادقة الثنائية"}"#
        let (client, _, store) = makeClient([
            .init(status: 200, body: Fixtures.loginSuccess),
            .init(status: 403, body: gateBody),
            .init(status: 200, body: Fixtures.me),
        ])
        let step1 = try await client.login(identifier: "editor@sabq.org", password: "pw")
        guard case .signedIn = step1 else {
            return XCTFail("expected direct sign-in when 2FA is not enabled")
        }
        do {
            _ = try await client.me()
            XCTFail("expected twoFactorRequired error")
        } catch let error as StaffAPIError {
            XCTAssertEqual(error, .twoFactorRequired(message: "يلزم تفعيل المصادقة الثنائية"))
            XCTAssertNotNil(store.load())
        }
        // After enabling 2FA on the web, retrying me() with the kept session succeeds.
        let meAfterEnable = try await client.me()
        XCTAssertEqual(meAfterEnable.twoFactorEnabled, true)
    }

    func testSystemEndpointsUseTheContractPaths() async throws {
        let (client, transport, _) = makeClient([
            .init(status: 200, body: Fixtures.systemHealth),
            .init(status: 200, body: Fixtures.adminAlerts),
            .init(status: 200, body: #"{"aiAlerts":true,"adminAlerts":true}"#),
            .init(status: 200, body: #"{"aiAlerts":false,"adminAlerts":true}"#),
        ], session: liveSession)
        _ = try await client.systemHealth()
        XCTAssertEqual(transport.lastRequest?.url?.path, "/api/v1/staff/system/health")
        _ = try await client.adminAlerts()
        XCTAssertEqual(transport.lastRequest?.url?.path, "/api/v1/staff/alerts")
        _ = try await client.alertPrefs()
        XCTAssertEqual(transport.lastRequest?.url?.path, "/api/v1/staff/me/alert-prefs")
        XCTAssertEqual(transport.lastRequest?.httpMethod, "GET")
        let updated = try await client.updateAlertPrefs(StaffAlertPrefsUpdate(aiAlerts: false))
        let request = try XCTUnwrap(transport.lastRequest)
        XCTAssertEqual(request.httpMethod, "PUT")
        XCTAssertEqual(request.url?.path, "/api/v1/staff/me/alert-prefs")
        let body = jsonObject(request.httpBody)
        XCTAssertEqual(body["aiAlerts"] as? Bool, false)
        XCTAssertNil(body["adminAlerts"], "unchanged switches are not sent")
        XCTAssertEqual(updated, StaffAlertPrefs(aiAlerts: false, adminAlerts: true))
    }

    func testSystemHealthForbiddenSurfacesWithoutClearingTheSession() async {
        let (client, _, store) = makeClient([.init(status: 403, body: #"{"code":"forbidden","message":"x"}"#)],
                                            session: liveSession)
        do {
            _ = try await client.systemHealth()
            XCTFail("expected failure")
        } catch {
            XCTAssertEqual(error as? StaffAPIError, .forbidden(message: "x"))
        }
        XCTAssertNotNil(store.load())
    }
}
