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
          "sender": { "id": "agency-1", "name": "وكالة الأفق", "kind": "agency" },
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
}

enum DeskPreviewFixtures {
    static let me = StaffMe(id: "preview-user", email: "editor@sabq.org", name: "نورة القحطاني",
                            role: "editor", twoFactorEnabled: true, roles: ["editor"],
                            capabilities: StaffCapabilities(canTickets: true,
                                                            canSocial: .init(view: true, publish: true,
                                                                             schedule: true, reject: false)))

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
