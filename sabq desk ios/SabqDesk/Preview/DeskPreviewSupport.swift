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
}

enum DeskPreviewFixtures {
    static let me = StaffMe(id: "preview-user", email: "editor@sabq.org", name: "نورة القحطاني",
                            role: "editor", twoFactorEnabled: true, roles: ["editor"],
                            capabilities: StaffCapabilities(canTickets: true,
                                                            canSocial: .init(view: true, publish: true,
                                                                             schedule: true, reject: false),
                                                            canSystemHealth: true, canAdminAlerts: true),
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
#endif
