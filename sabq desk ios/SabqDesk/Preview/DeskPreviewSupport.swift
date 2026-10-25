#if DEBUG
import Foundation
import SabqDeskDesign
import SabqDeskKit
import SwiftUI

// Fixtures for SwiftUI previews. Debug builds only; nothing here is reachable
// from the production app flow.

/// Answers the staff endpoints the previewed screens call with canned JSON.
struct DeskPreviewTransport: HTTPTransport {
    let emptyInbox: Bool

    nonisolated func send(_ request: URLRequest) async throws -> (Data, URLResponse) {
        let url = request.url ?? StaffAPIClient.productionBaseURL
        let body: String
        switch url.path {
        case "/api/v1/staff/inbox": body = emptyInbox ? Self.emptyInboxJSON : Self.inboxJSON
        case "/api/v1/staff/unread-counts": body = #"{"tickets":2,"social":3,"total":5}"#
        case "/api/v1/staff/system/health": body = Self.systemHealthJSON
        case "/api/v1/staff/alerts": body = Self.alertsJSON
        case "/api/v1/staff/me/alert-prefs": body = #"{"aiAlerts":true,"adminAlerts":true}"#
        case "/api/v1/staff/system/balances": body = Self.balancesJSON
        case let path where path.hasPrefix("/api/v1/staff/system/balances/"):
            // GET …/balances/<p>, POST …/<p>/topup and PUT …/<p>/threshold all answer the detail.
            let provider = path.dropFirst("/api/v1/staff/system/balances/".count).split(separator: "/").first
            body = Self.balanceDetailJSON(provider: provider.map(String.init) ?? "")
        default: body = "{}"
        }
        let response = HTTPURLResponse(url: url, statusCode: 200, httpVersion: "HTTP/1.1", headerFields: nil)!
        return (Data(body.utf8), response)
    }

    nonisolated static let emptyInboxJSON = #"{"items":[],"nextCursor":null,"hasMore":false}"#

    nonisolated static let inboxJSON = """
    {
      "items": [
        {
          "id": "preview-social-1", "kind": "social",
          "title": "انطلاق المؤتمر التقني بالرياض",
          "previewText": "تغريدة مقترحة حول افتتاح المؤتمر التقني اليوم",
          "sender": { "id": "agency-1", "name": "وكالة الأفق", "kind": "agency", "avatarUrl": null },
          "createdAt": "2026-10-25T06:00:00Z", "updatedAt": "2026-10-25T07:30:00Z",
          "status": "draft", "hasUnread": true
        },
        {
          "id": "preview-ticket-1", "kind": "ticket",
          "title": "استفسار عن موعد نشر المقال",
          "previewText": "هل يُنشر مقالي الأسبوعي غداً كالمعتاد؟",
          "sender": { "id": "writer-1", "name": "د. خالد العتيبي", "kind": "writer" },
          "createdAt": "2026-10-24T10:00:00Z", "updatedAt": "2026-10-25T06:10:00Z",
          "status": "open", "hasUnread": true
        },
        {
          "id": "preview-social-2", "kind": "social",
          "title": "تحديث حالة الطقس في المنطقة الشرقية",
          "sender": { "id": "reporter-1", "name": "مراسل الدمام", "kind": "reporter" },
          "createdAt": "2026-10-24T09:00:00Z", "updatedAt": "2026-10-24T12:00:00Z",
          "status": "scheduled", "hasUnread": false
        },
        {
          "id": "preview-ticket-2", "kind": "ticket",
          "title": "طلب تعديل عنوان مقال منشور",
          "previewText": "تم تعديل العنوان كما طلبت.",
          "sender": { "id": "writer-2", "name": "منى الشهري", "kind": "writer" },
          "createdAt": "2026-10-23T09:00:00Z", "updatedAt": "2026-10-23T15:00:00Z",
          "status": "answered", "hasUnread": false
        },
        {
          "id": "preview-social-4", "kind": "social",
          "title": "مقترح سُحب",
          "previewText": "@sabq\\nإبراهيم الروساء يكتب : نص تغريدة سحبها صاحبها",
          "sender": { "id": "org-1", "name": "صحيفة سبق", "kind": "organization" },
          "createdAt": "2026-10-11T08:00:00Z", "updatedAt": "2026-10-11T09:00:00Z",
          "status": "canceled", "hasUnread": false, "canceledBySelf": true
        },
        {
          "id": "preview-social-3", "kind": "social",
          "title": "نتائج مباراة الهلال والنصر",
          "sender": { "id": "agency-2", "name": "وكالة الأنباء", "kind": "agency" },
          "createdAt": "2026-10-22T19:00:00Z", "updatedAt": "2026-10-22T21:00:00Z",
          "status": "failed", "hasUnread": false
        }
      ],
      "nextCursor": null,
      "hasMore": false
    }
    """

    nonisolated static let systemHealthJSON = """
    {
      "generatedAt": "2026-10-25T15:13:40Z", "lastCheckAt": "2026-10-25T15:13:00Z",
      "summary": { "status": "partial", "title": "تعطّل جزئي", "detail": "نموذج واحد متوقف ونموذج متدهور. التحويل التلقائي يعمل." },
      "aiAlertsEnabled": true,
      "models": [
        { "provider": "anthropic", "providerLabel": "Anthropic", "modelId": "claude-sonnet-4-6",
          "status": "down", "rawStatus": "quota_exceeded", "since": "2026-10-25T14:58:00Z",
          "lastError": { "code": "QUOTA_EXCEEDED", "message": "quota exceeded" },
          "requests24h": 120, "failures24h": 7 },
        { "provider": "google", "providerLabel": "Google", "modelId": "gemini-2.5-flash",
          "status": "degraded", "rawStatus": "degraded", "requests24h": 3, "failures24h": 1 },
        { "provider": "openai", "providerLabel": "OpenAI", "modelId": "gpt-5.1",
          "status": "up", "rawStatus": "healthy", "requests24h": 2471, "failures24h": 0 }
      ],
      "budgets": [
        { "id": "b1", "label": "OpenAI", "limitUsd": 500, "spentUsd": 410.2, "percent": 82, "period": "monthly" }
      ]
    }
    """

    nonisolated static let alertsJSON = """
    {
      "generatedAt": "2026-10-25T15:15:00Z",
      "counts": { "urgent": 1, "info": 2 },
      "items": [
        { "id": "social_failed:preview-social-3", "kind": "social_failed", "severity": "urgent",
          "title": "فشل نشر تغريدة", "body": "«نتائج مباراة الهلال والنصر» رفضتها منصة X بعد 3 محاولات.",
          "occurredAt": "2026-10-25T15:09:00Z", "deeplink": "sabqdesk://social/preview-social-3",
          "action": { "type": "retry_social", "postId": "preview-social-3" } },
        { "id": "agency_balance_low:1", "kind": "agency_balance_low", "severity": "info",
          "title": "رصيد وكالة منخفض", "body": "«شركة أفق للإعلام» بقي لها رصيد منشورين.",
          "occurredAt": "2026-10-25T06:00:00Z", "deeplink": null, "action": null },
        { "id": "ai_incident:gemini", "kind": "ai_incident", "severity": "info",
          "title": "نموذج متدهور", "body": "gemini-2.5-flash: فشل 1 من 3 طلبات.",
          "occurredAt": "2026-10-25T05:40:00Z", "deeplink": "sabqdesk://system",
          "action": { "type": "open_system" } }
      ]
    }
    """

    /// «أرصدة النماذج» with the concept's figures (22:20 Riyadh).
    nonisolated static let balancesJSON = """
    {
      "generatedAt": "2026-10-25T19:20:00.000Z",
      "canManage": true,
      "summary": { "critical": 1, "low": 1, "notConfigured": 1, "attention": 3,
                   "text": "رصيد DeepSeek شبه نافد، وOpenAI تحت حدّك. Anthropic لم يُضبط رصيده بعد." },
      "providers": [
        { "provider": "deepseek", "label": "DeepSeek", "kind": "actual", "unit": "usd", "state": "critical",
          "amount": 1.85, "fraction": 0.06,
          "threshold": { "low": 20, "critical": 5, "presets": [10, 20, 50], "isDefault": true },
          "todaySpend": 0.41, "monthSpend": 11.6, "spendUnit": "usd", "daysLeft": 4.2,
          "spendSource": "balance_snapshots", "canUpdateBalance": false,
          "fetchedAt": "2026-10-25T19:20:00.000Z" },
        { "provider": "openai", "label": "OpenAI", "kind": "estimated", "unit": "usd", "state": "low",
          "amount": 86.3, "total": 500, "fraction": 0.1726,
          "threshold": { "low": 100, "critical": 25, "presets": [50, 100, 200], "isDefault": true },
          "todaySpend": 14.2, "monthSpend": 413.7, "spendUnit": "usd", "spentSinceBaseline": 413.7,
          "daysLeft": 5.2, "baseline": { "amount": 500, "at": "2026-10-02T09:00:00.000Z" },
          "lastTopup": { "mode": "add", "amount": 500, "topupAt": "2026-10-02T09:00:00.000Z", "byName": "علي" },
          "spendSource": "provider_admin_api", "canUpdateBalance": true,
          "fetchedAt": "2026-10-25T19:15:00.000Z" },
        { "provider": "anthropic", "label": "Anthropic", "kind": "estimated", "unit": "usd",
          "state": "not_configured", "reason": "no_topup",
          "threshold": { "low": 100, "critical": 25, "presets": [50, 100, 200], "isDefault": true },
          "todaySpend": 3.1, "monthSpend": 40.2, "spendUnit": "usd", "spendSource": "sabq_tracked",
          "canUpdateBalance": true, "fetchedAt": "2026-10-25T19:20:00.000Z" },
        { "provider": "gemini", "label": "Gemini", "kind": "budget", "unit": "usd", "state": "healthy",
          "amount": 46.2, "total": 120, "fraction": 0.385, "remaining": 73.8,
          "threshold": { "low": 20, "critical": 5, "presets": [10, 20, 50], "isDefault": true },
          "todaySpend": 1.9, "monthSpend": 46.2, "spendUnit": "usd", "spendSource": "sabq_tracked",
          "canUpdateBalance": true, "fetchedAt": "2026-10-25T19:20:00.000Z" },
        { "provider": "elevenlabs", "label": "ElevenLabs", "kind": "actual", "unit": "characters",
          "state": "healthy", "amount": 182400, "total": 500000, "fraction": 0.3648,
          "threshold": { "low": 50000, "critical": 12500, "presets": [25000, 50000, 100000], "isDefault": true },
          "todaySpend": 6200, "monthSpend": 317600, "spendUnit": "characters",
          "resetsAt": "2026-11-03T00:00:00.000Z", "spendSource": "provider",
          "canUpdateBalance": false, "fetchedAt": "2026-10-25T19:20:00.000Z" }
      ]
    }
    """

    /// The list row plus 30 days of daily spend (26 Sep → today) and, for
    /// estimated providers, the top-up history.
    nonisolated static func balanceDetailJSON(provider: String) -> String {
        guard let list = try? JSONSerialization.jsonObject(with: Data(balancesJSON.utf8)) as? [String: Any],
              let providers = list["providers"] as? [[String: Any]],
              var detail = providers.first(where: { $0["provider"] as? String == provider }) else {
            return "{}"
        }
        let scale: Double
        switch provider {
        case "openai": scale = 1
        case "anthropic": scale = 0.15
        case "deepseek": scale = 0.03
        case "gemini": scale = 0.09
        default: scale = 450
        }
        let pattern: [Double] = [19, 22, 17, 24, 21, 15, 12, 20, 23, 18]
        var series: [[String: Any]] = []
        for offset in 0..<30 {
            // 2026-09-26 … 2026-10-25
            let day = offset < 5 ? String(format: "2026-09-%02d", 26 + offset) : String(format: "2026-10-%02d", offset - 4)
            let value = offset == 29 ? 14.2 : pattern[offset % pattern.count]
            series.append(["date": day, "value": (value * scale * 100).rounded() / 100])
        }
        detail["series"] = series
        detail["canManage"] = true
        if provider == "openai" {
            detail["topups"] = [
                ["mode": "add", "amountUsd": 500, "topupAt": "2026-10-02T09:00:00.000Z",
                 "savedAt": "2026-10-02T09:01:00.000Z", "byName": "علي", "balanceAfterUsd": 500],
                ["mode": "add", "amountUsd": 300, "topupAt": "2026-09-03T10:30:00.000Z",
                 "savedAt": "2026-09-03T10:31:00.000Z", "byName": "علي", "balanceAfterUsd": 312.4],
            ]
        } else if provider == "gemini" {
            detail["topups"] = [
                ["mode": "budget", "amountUsd": 120, "savedAt": "2026-10-01T08:00:00.000Z",
                 "byName": "علي", "balanceAfterUsd": 120],
            ]
        }
        guard let data = try? JSONSerialization.data(withJSONObject: detail) else { return "{}" }
        return String(decoding: data, as: UTF8.self)
    }
}

enum DeskPreviewFixtures {
    static let balances: StaffAIBalances = {
        (try? StaffJSON.makeDecoder().decode(StaffAIBalances.self, from: Data(DeskPreviewTransport.balancesJSON.utf8)))
            ?? StaffAIBalances(providers: [])
    }()

    static let openAIBalance = balances.items.first { $0.provider == "openai" } ?? StaffAIBalance(provider: "openai")
    static let geminiBalance = balances.items.first { $0.provider == "gemini" } ?? StaffAIBalance(provider: "gemini")

    static let me = StaffMe(id: "preview-user", email: "editor@sabq.org", name: "نورة القحطاني",
                            role: "editor", twoFactorEnabled: true, roles: ["editor"],
                            capabilities: StaffCapabilities(canTickets: true,
                                                            canSocial: .init(view: true, publish: true,
                                                                             schedule: true, reject: false),
                                                            canSystemHealth: true, canAdminAlerts: true,
                                                            canManageBalances: true),
                            alertPrefs: StaffAlertPrefs())

    static func client(emptyInbox: Bool) -> StaffAPIClient {
        StaffAPIClient(configuration: .init(installationID: "preview-installation", appVersion: "1.0.0"),
                       sessionStore: InMemorySessionStore(session: StaffSession(token: "preview", expiresAt: nil,
                                                                                userId: me.id)),
                       transport: DeskPreviewTransport(emptyInbox: emptyInbox))
    }
}

/// Holds the preview models in `@State` so they survive re-renders, and
/// applies the same environment as `SabqDeskApp` (RTL, Riyadh locale, tint).
@MainActor
struct DeskPreviewHost<Content: View>: View {
    @State private var model: AppModel
    @State private var appLock: AppLockController
    private let content: Content

    init(emptyInbox: Bool, content: Content) {
        DeskFonts.registerAll()
        _model = State(initialValue: AppModel.preview(me: DeskPreviewFixtures.me,
                                                      unread: StaffUnreadCounts(tickets: 2, social: 3, total: 5),
                                                      client: DeskPreviewFixtures.client(emptyInbox: emptyInbox)))
        let defaults = UserDefaults(suiteName: "com.sabq.desk.preview") ?? .standard
        _appLock = State(initialValue: AppLockController(preference: AppLockPreference(defaults: defaults),
                                                         hasSession: { true }))
        self.content = content
    }

    var body: some View {
        content
            .environment(model)
            .environment(appLock)
            .environment(\.layoutDirection, .rightToLeft)
            .environment(\.locale, RiyadhTime.locale)
            .tint(DeskTheme.primary)
    }
}

extension View {
    @MainActor
    func deskPreviewEnvironment(emptyInbox: Bool = false) -> some View {
        DeskPreviewHost(emptyInbox: emptyInbox, content: self)
    }
}

/// Simulator screenshots with the preview fixtures: launch a Debug build with
/// `SIMCTL_CHILD_DESK_SHOT=<scene>` and the app opens the tabs on canned data
/// instead of the real session. Release builds never compile this.
enum DeskScreenshotScene: String {
    case balances, openai, update, banner

    static let current = ProcessInfo.processInfo.environment["DESK_SHOT"].flatMap(Self.init(rawValue:))

    var link: DeskDeepLink {
        switch self {
        case .balances: return .balances
        case .openai, .update: return .balance(provider: "openai")
        case .banner: return .systemHealth
        }
    }
}

struct DeskScreenshotHost: View {
    let scene: DeskScreenshotScene

    var body: some View {
        DeskScreenshotRouter(scene: scene)
            .deskPreviewEnvironment()
            .preferredColorScheme(.light)
    }
}

private struct DeskScreenshotRouter: View {
    @Environment(AppModel.self) private var model
    let scene: DeskScreenshotScene

    var body: some View {
        MainTabView()
            .background(DeskTheme.background)
            .task { model.pendingLink = scene.link }
    }
}
#endif
