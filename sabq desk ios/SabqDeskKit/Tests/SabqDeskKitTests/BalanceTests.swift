import XCTest
@testable import SabqDeskKit

/// «أرصدة النماذج»: decoding, the client paths, deep links and the copy.
final class BalanceTests: XCTestCase {
    static let list = """
    {
      "generatedAt": "2026-10-25T19:20:00.000Z",
      "summary": { "critical": 1, "low": 1, "notConfigured": 1, "attention": 3,
                   "text": "رصيد DeepSeek شبه نافد، وOpenAI تحت الحد. أنصح بشحن الاثنين اليوم." },
      "providers": [
        { "provider": "deepseek", "label": "DeepSeek", "kind": "actual", "unit": "usd", "state": "critical",
          "reason": null, "amount": 1.85, "total": null, "fraction": 0.09, "remaining": null,
          "threshold": { "low": 20, "critical": 5, "presets": [10, 20, 50], "isDefault": true },
          "todaySpend": 0.42, "monthSpend": 9.1, "spendUnit": "usd", "spentSinceBaseline": null,
          "daysLeft": 4.2, "resetsAt": null, "baseline": null, "lastTopup": null,
          "spendSource": "balance_snapshots", "canUpdateBalance": false,
          "fetchedAt": "2026-10-25T19:20:00.000Z", "error": null },
        { "provider": "openai", "label": "OpenAI", "kind": "estimated", "unit": "usd", "state": "low",
          "reason": null, "amount": 86.3, "total": 500, "fraction": 0.17, "remaining": null,
          "threshold": { "low": 100, "critical": 25, "presets": [50, 100, 200], "isDefault": false },
          "todaySpend": 14.2, "monthSpend": 421.5, "spendUnit": "usd", "spentSinceBaseline": 413.7,
          "daysLeft": 5, "resetsAt": null,
          "baseline": { "amount": 500, "at": "2026-10-02T09:00:00.000Z" },
          "lastTopup": { "mode": "add", "amount": 500, "topupAt": "2026-10-02T09:00:00.000Z", "byName": "علي" },
          "spendSource": "provider_admin_api", "canUpdateBalance": true,
          "fetchedAt": "2026-10-25T19:15:00.000Z", "error": null },
        { "provider": "anthropic", "label": "Anthropic", "kind": "estimated", "unit": "usd",
          "state": "not_configured", "reason": "no_topup", "amount": null, "total": null, "fraction": null,
          "remaining": null, "threshold": { "low": 100, "critical": 25, "presets": [50, 100, 200], "isDefault": true },
          "todaySpend": 3.1, "monthSpend": 40, "spendUnit": "usd", "spentSinceBaseline": null, "daysLeft": null,
          "resetsAt": null, "baseline": null, "lastTopup": null, "spendSource": "sabq_tracked",
          "canUpdateBalance": true, "fetchedAt": "2026-10-25T19:20:00.000Z", "error": null },
        { "provider": "gemini", "label": "Gemini", "kind": "budget", "unit": "usd", "state": "healthy",
          "amount": 46.2, "total": 120, "fraction": 0.385, "remaining": 73.8,
          "threshold": { "low": 24, "critical": 6, "presets": [10, 20, 50], "isDefault": true },
          "spendSource": "sabq_tracked", "canUpdateBalance": true, "fetchedAt": "2026-10-25T19:20:00.000Z" },
        { "provider": "elevenlabs", "label": "ElevenLabs", "kind": "actual", "unit": "characters",
          "state": "healthy", "amount": 182400, "total": 500000, "fraction": 0.36,
          "threshold": { "low": 50000, "critical": 12500, "presets": [25000, 50000, 100000], "isDefault": true },
          "resetsAt": "2026-11-03T00:00:00.000Z", "spendSource": "provider",
          "canUpdateBalance": false, "fetchedAt": "2026-10-25T19:20:00.000Z", "futureField": 1 },
        { "provider": "mistral", "kind": "loan", "unit": "eur", "state": "sleepy" }
      ]
    }
    """

    static let detail = """
    { "provider": "openai", "label": "OpenAI", "kind": "estimated", "unit": "usd", "state": "low",
      "amount": 86.3, "total": 500, "fraction": 0.17,
      "threshold": { "low": 100, "critical": 25, "presets": [50, 100, 200], "isDefault": false },
      "spentSinceBaseline": 413.7, "spendSource": "sabq_tracked", "canUpdateBalance": true,
      "series": [ { "date": "2026-10-24", "value": 16.4 }, { "date": "2026-10-25", "value": 14.2 } ],
      "topups": [ { "mode": "add", "amountUsd": 500, "topupAt": "2026-10-02T09:00:00.000Z",
                    "savedAt": "2026-10-02T09:01:00.000Z", "byUserId": "u1", "byName": "علي",
                    "balanceAfterUsd": 500 } ] }
    """

    private let liveSession = StaffSession(token: "session-abc", expiresAt: Date().addingTimeInterval(3600), userId: "user-uuid")

    private func makeClient(_ replies: [MockTransport.Reply]) -> (StaffAPIClient, MockTransport) {
        let transport = MockTransport(replies)
        let client = StaffAPIClient(configuration: .init(baseURL: URL(string: "https://api.example.test")!,
                                                         installationID: "install-1", appVersion: "1.0"),
                                    sessionStore: InMemorySessionStore(session: liveSession), transport: transport)
        return (client, transport)
    }

    // MARK: Decoding

    func testListDecodesAndToleratesUnknownValues() throws {
        let list = try StaffJSON.makeDecoder().decode(StaffAIBalances.self, from: Data(Self.list.utf8))
        XCTAssertEqual(list.items.count, 6)
        XCTAssertEqual(list.attentionCount, 3)
        XCTAssertEqual(list.mostUrgent?.provider, "deepseek")
        let deepseek = list.items[0]
        XCTAssertEqual(deepseek.effectiveKind, .actual)
        XCTAssertEqual(deepseek.effectiveState, .critical)
        XCTAssertEqual(deepseek.threshold?.effectiveCritical, 5)
        XCTAssertEqual(list.items[1].spendSource, .providerAdminAPI)
        XCTAssertEqual(list.items[1].baseline?.amount, 500)
        XCTAssertEqual(list.items[2].reason, .noTopup)
        XCTAssertEqual(list.items[3].measuredAmount, 73.8, "budget state is measured on what is left")
        XCTAssertEqual(list.items[4].effectiveUnit, .characters)
        let unknown = list.items[5]
        XCTAssertEqual(unknown.effectiveKind, .unknown)
        XCTAssertEqual(unknown.effectiveUnit, .unknown)
        XCTAssertEqual(unknown.effectiveState, .unknown)
        XCTAssertEqual(unknown.displayName, "mistral")
    }

    func testCountsFallBackWhenSummaryIsMissing() throws {
        let json = #"{"providers":[{"provider":"openai","state":"low"},{"provider":"gemini","state":"critical"}]}"#
        let list = try StaffJSON.makeDecoder().decode(StaffAIBalances.self, from: Data(json.utf8))
        XCTAssertEqual(list.criticalCount, 1)
        XCTAssertEqual(list.lowCount, 1)
        XCTAssertEqual(list.attentionCount, 2)
        XCTAssertEqual(list.mostUrgent?.provider, "gemini")
    }

    func testDetailDecodesSeriesAndTopups() throws {
        let detail = try StaffJSON.makeDecoder().decode(StaffAIBalance.self, from: Data(Self.detail.utf8))
        XCTAssertEqual(detail.series?.count, 2)
        XCTAssertEqual(detail.series?.last?.value, 14.2)
        XCTAssertNotNil(detail.series?.first?.day)
        XCTAssertEqual(detail.topups?.first?.byName, "علي")
        XCTAssertEqual(detail.topups?.first?.mode, .add)
    }

    func testEditingNeedsTheManageFlag() throws {
        // An older server sends no flag: read-only unless /me says otherwise.
        let list = try StaffJSON.makeDecoder().decode(StaffAIBalances.self, from: Data(Self.list.utf8))
        XCTAssertNil(list.canManage)
        XCTAssertFalse(list.allowsEditing(nil))
        XCTAssertFalse(list.allowsEditing(StaffCapabilities(canSystemHealth: true)))
        XCTAssertTrue(list.allowsEditing(StaffCapabilities(canSystemHealth: true, canManageBalances: true)))

        // The per-response flag wins over /me.
        let viewOnly = #"{"canManage":false,"providers":[{"provider":"openai","canUpdateBalance":true}]}"#
        let readOnly = try StaffJSON.makeDecoder().decode(StaffAIBalances.self, from: Data(viewOnly.utf8))
        let manager = StaffCapabilities(canSystemHealth: true, canManageBalances: true)
        XCTAssertEqual(readOnly.canManage, false)
        XCTAssertFalse(readOnly.allowsEditing(manager))

        var openai = readOnly.items[0]
        XCTAssertTrue(openai.allowsBalanceUpdate(manager), "no canManage on the row → falls back to /me")
        openai.canManage = false
        XCTAssertFalse(openai.allowsBalanceUpdate(manager))
        openai.canManage = true
        XCTAssertTrue(openai.allowsBalanceUpdate(nil))
        openai.canUpdateBalance = false
        XCTAssertFalse(openai.allowsBalanceUpdate(nil), "DeepSeek/ElevenLabs are never edited")
        XCTAssertTrue(openai.allowsEditing(nil), "but their threshold is")
    }

    // MARK: Client

    func testBalanceEndpointsUseTheContractPaths() async throws {
        let (client, transport) = makeClient([
            .init(status: 200, body: Self.list),
            .init(status: 200, body: Self.detail),
            .init(status: 200, body: Self.detail),
            .init(status: 200, body: Self.detail),
        ])
        _ = try await client.systemBalances()
        XCTAssertEqual(transport.lastRequest?.url?.path, "/api/v1/staff/system/balances")
        XCTAssertEqual(transport.lastRequest?.httpMethod, "GET")

        _ = try await client.systemBalance(provider: "openai")
        XCTAssertEqual(transport.lastRequest?.url?.path, "/api/v1/staff/system/balances/openai")

        let topupAt = try XCTUnwrap(StaffJSON.parseDate("2026-10-25T19:24:00Z"))
        _ = try await client.topUpBalance(provider: "openai",
                                          StaffBalanceTopup(mode: .add, amountUsd: 500, topupAt: topupAt, threshold: 100))
        var request = try XCTUnwrap(transport.lastRequest)
        XCTAssertEqual(request.httpMethod, "POST")
        XCTAssertEqual(request.url?.path, "/api/v1/staff/system/balances/openai/topup")
        var body = jsonObject(request.httpBody)
        XCTAssertEqual(body["mode"] as? String, "add")
        XCTAssertEqual(body["amountUsd"] as? Double, 500)
        XCTAssertEqual(body["topupAt"] as? String, "2026-10-25T22:24:00+03:00")
        XCTAssertEqual(body["threshold"] as? Double, 100)

        _ = try await client.updateBalanceThreshold(provider: "gemini", threshold: 30)
        request = try XCTUnwrap(transport.lastRequest)
        XCTAssertEqual(request.httpMethod, "PUT")
        XCTAssertEqual(request.url?.path, "/api/v1/staff/system/balances/gemini/threshold")
        body = jsonObject(request.httpBody)
        XCTAssertEqual(body as NSDictionary, ["threshold": 30] as NSDictionary)
    }

    func testBudgetTopupOmitsEmptyFields() async throws {
        let (client, transport) = makeClient([.init(status: 200, body: Self.detail)])
        _ = try await client.topUpBalance(provider: "gemini", StaffBalanceTopup(mode: .budget, amountUsd: 120))
        let body = jsonObject(transport.lastRequest?.httpBody)
        XCTAssertEqual(Set(body.keys), ["mode", "amountUsd"])
    }

    func testUnknownProviderNeverReachesTheNetwork() async {
        let (client, transport) = makeClient([])
        for provider in ["mistral", "../alerts", "openai/topup", "OpenAI", ""] {
            do {
                _ = try await client.systemBalance(provider: provider)
                XCTFail("expected failure for \(provider)")
            } catch {
                XCTAssertEqual(error as? StaffAPIError, .notFound(message: nil))
            }
        }
        XCTAssertTrue(transport.requests.isEmpty)
    }

    func testValidationErrorSurfacesServerMessage() async {
        let (client, _) = makeClient([.init(status: 400, body: #"{"code":"validation_error","message":"أدخل مبلغاً أكبر من صفر"}"#)])
        do {
            _ = try await client.topUpBalance(provider: "openai", StaffBalanceTopup(mode: .add, amountUsd: 1))
            XCTFail("expected failure")
        } catch {
            XCTAssertEqual(error as? StaffAPIError, .validation(message: "أدخل مبلغاً أكبر من صفر"))
        }
    }

    // MARK: Deep links

    func testBalanceDeepLinks() throws {
        XCTAssertEqual(DeskDeepLink(url: URL(string: "sabqdesk://balances")!), .balances)
        XCTAssertEqual(DeskDeepLink(url: URL(string: "sabqdesk://balances/deepseek")!), .balance(provider: "deepseek"))
        XCTAssertEqual(DeskDeepLink(url: URL(string: "sabqdesk://balances/OpenAI")!), .balance(provider: "openai"))
        XCTAssertNil(DeskDeepLink(url: URL(string: "sabqdesk://balances/mistral")!))
        XCTAssertNil(DeskDeepLink(url: URL(string: "sabqdesk://balances/openai/topup")!))
        XCTAssertEqual(DeskDeepLink.balance(provider: "gemini").url.absoluteString, "sabqdesk://balances/gemini")
        XCTAssertEqual(DeskDeepLink.balances.url.absoluteString, "sabqdesk://balances")
        let push: [AnyHashable: Any] = ["type": "ai_status", "deeplink": "sabqdesk://balances/deepseek"]
        XCTAssertEqual(DeskDeepLink(pushPayload: push), .balance(provider: "deepseek"))
    }

    // MARK: Copy

    func testAmountsAndDays() {
        XCTAssertEqual(DeskBalanceCopy.amount(1.85, unit: .usd), "$1.85")
        XCTAssertEqual(DeskBalanceCopy.amount(500, unit: .usd, whole: true), "$500")
        XCTAssertEqual(DeskBalanceCopy.amount(12.4, unit: .cny), "¥12.40")
        XCTAssertEqual(DeskBalanceCopy.amount(182_400, unit: .characters), "182.4K حرف")
        XCTAssertEqual(DeskBalanceCopy.compact(500_000), "500K")
        XCTAssertEqual(DeskBalanceCopy.compact(1_250_000), "1.3M")
        XCTAssertEqual(DeskBalanceCopy.days(0.4), "أقل من يوم")
        XCTAssertEqual(DeskBalanceCopy.days(1), "يوم واحد")
        XCTAssertEqual(DeskBalanceCopy.days(2), "يومين")
        XCTAssertEqual(DeskBalanceCopy.days(4.2), "4 أيام")
        XCTAssertEqual(DeskBalanceCopy.days(35), "35 يومًا")
        XCTAssertEqual(DeskBalanceCopy.parseAmount("٥٠٠"), 500)
        XCTAssertEqual(DeskBalanceCopy.parseAmount("1,250.50"), 1250.5)
        XCTAssertNil(DeskBalanceCopy.parseAmount("0"))
        XCTAssertNil(DeskBalanceCopy.parseAmount("abc"))
        XCTAssertEqual(DeskBalanceCopy.balanceAfter(current: 86.3, mode: .add, amount: 500), 586.3, accuracy: 0.001)
        XCTAssertEqual(DeskBalanceCopy.balanceAfter(current: 86.3, mode: .set, amount: 120), 120)
    }

    func testRowLinesMatchTheConcept() throws {
        let list = try StaffJSON.makeDecoder().decode(StaffAIBalances.self, from: Data(Self.list.utf8))
        let rows = list.items
        XCTAssertEqual(DeskBalanceCopy.rowDetail(rows[0]), "الحد $20 · يكفي نحو 4 أيام")
        XCTAssertEqual(DeskBalanceCopy.rowDetail(rows[1]), "من شحنة $500 · اليوم $14.20")
        XCTAssertEqual(DeskBalanceCopy.stateTitle(rows[2]), "لم يُضبط الرصيد بعد")
        XCTAssertEqual(DeskBalanceCopy.amountText(rows[2]), "—")
        XCTAssertEqual(DeskBalanceCopy.rowDetail(rows[3]), "صُرف من $120 هذا الشهر")
        XCTAssertTrue(DeskBalanceCopy.rowDetail(rows[4]).hasPrefix("من 500K · يتجدد 3 "))
        XCTAssertEqual(DeskBalanceCopy.thresholdLine(rows[1]), "نبّهني تحت $100 · حرج تحت $25")
        XCTAssertEqual(DeskBalanceCopy.countsLine(list), "حرج 1 · منخفض 1 · غير مضبوط 1")
        XCTAssertEqual(DeskBalanceCopy.bannerTitle(rows[0]), "رصيد DeepSeek حرج: $1.85")
        XCTAssertEqual(DeskBalanceCopy.bannerBody(rows[0]), "رصيد فعلي من المزوّد · أقل من ربع حدّك ($20) · يكفي نحو 4 أيام")
        XCTAssertTrue(DeskBalanceCopy.estimationNote(rows[1]).contains("($413.70)"))
        XCTAssertNotEqual(DeskBalanceCopy.bannerSignature(rows[0]), DeskBalanceCopy.bannerSignature(rows[1]))
    }
}
