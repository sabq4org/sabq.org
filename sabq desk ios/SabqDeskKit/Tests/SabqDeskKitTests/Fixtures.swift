import Foundation
@testable import SabqDeskKit

/// Payloads copied from docs/systems/editorial/STAFF_APP_API.md and the
/// server serialisers (dates carry milliseconds, as `Date#toJSON` emits).
enum Fixtures {
    static let me = """
    {
      "id": "user-uuid",
      "email": "editor@sabq.org",
      "name": "ماجد العتيبي",
      "firstName": "ماجد",
      "lastName": "العتيبي",
      "profileImageUrl": null,
      "role": "editor",
      "twoFactorEnabled": true,
      "user": { "id": "user-uuid", "email": "editor@sabq.org", "role": "editor", "twoFactorEnabled": true },
      "roles": ["editor"],
      "capabilities": {
        "canTickets": true,
        "canSocial": { "view": true, "publish": true, "schedule": false, "reject": true }
      }
    }
    """

    static let inboxScheduled = """
    {
      "items": [
        {
          "id": "social-scheduled",
          "kind": "social",
          "title": "مقترح مجدول",
          "previewText": "نص التغريدة",
          "preview": "نص التغريدة",
          "sender": { "id": "pub-uuid", "name": "وكالة الأفق", "kind": "agency", "roleKind": "agency" },
          "createdAt": "2026-10-25T10:49:11.123Z",
          "updatedAt": "2026-10-25T10:51:17.759Z",
          "status": "scheduled",
          "hasUnread": false,
          "deeplink": "sabqdesk://social/social-scheduled",
          "scheduledAt": "2026-10-25T11:05:00.000Z",
          "publishedAt": null,
          "article": null
        },
        {
          "id": "social-published",
          "kind": "social",
          "title": "مقترح منشور",
          "previewText": "نص منشور",
          "preview": "نص منشور",
          "sender": { "id": "writer-uuid", "name": "أ. نورة القحطاني", "kind": "writer", "roleKind": "opinion_author" },
          "createdAt": "2026-10-25T08:00:00.000Z",
          "updatedAt": "2026-10-25T09:00:03.000Z",
          "status": "published",
          "hasUnread": false,
          "deeplink": "sabqdesk://social/social-published",
          "scheduledAt": "2026-10-25T09:00:00.000Z",
          "publishedAt": "2026-10-25T09:00:03.000Z"
        }
      ],
      "nextCursor": null,
      "hasMore": false
    }
    """

    static let inbox = """
    {
      "items": [
        {
          "id": "social-post-uuid",
          "kind": "social",
          "title": "انطلاق المؤتمر التقني بالرياض",
          "previewText": "تغريدة وكالة الأنباء حول المؤتمر التقني",
          "preview": "تغريدة وكالة الأنباء حول المؤتمر التقني",
          "sender": { "id": "pub-uuid", "name": "وكالة الأفق", "kind": "agency", "roleKind": "agency" },
          "createdAt": "2026-10-24T13:00:00.000Z",
          "updatedAt": "2026-10-24T15:00:00.000Z",
          "status": "draft",
          "hasUnread": true,
          "deeplink": "sabqdesk://social/social-post-uuid",
          "article": { "id": "art-uuid", "title": "انطلاق المؤتمر", "url": "https://sabq.org/article/tech-conf", "imageUrl": null }
        },
        {
          "id": "ticket-uuid",
          "kind": "ticket",
          "title": "استفسار عن موعد المقال",
          "previewText": "هل ينشر مقالي غداً؟",
          "preview": "هل ينشر مقالي غداً؟",
          "sender": { "id": "writer-uuid", "name": "د. خالد العتيبي", "kind": "writer", "roleKind": "opinion_author" },
          "createdAt": "2026-10-24T10:00:00Z",
          "updatedAt": "2026-10-24T14:00:00.000Z",
          "status": "open",
          "hasUnread": false,
          "deeplink": "sabqdesk://ticket/ticket-uuid"
        }
      ],
      "nextCursor": "eyJ0IjoiMjAyNi0xMC0yNFQxNDowMDowMC4wMDBaIn0",
      "hasMore": true
    }
    """

    static let ticketDetail = """
    {
      "ticket": {
        "id": "ticket-uuid",
        "writerId": "writer-uuid",
        "title": "استفسار عن موعد المقال",
        "status": "open",
        "lastMessageAt": "2026-10-24T14:00:00.000Z",
        "lastReadByAdminAt": null,
        "createdAt": "2026-10-24T10:00:00.000Z",
        "updatedAt": "2026-10-24T14:00:00.000Z",
        "writerFirstName": "خالد",
        "writerLastName": "العتيبي",
        "writerEmail": "writer@example.com",
        "authorKind": "writer",
        "sender": { "id": "writer-uuid", "name": "د. خالد العتيبي", "kind": "writer", "roleKind": "opinion_author",
                    "avatarUrl": "https://media.sabq.org/avatars/writer-uuid.jpg" },
        "deeplink": "sabqdesk://ticket/ticket-uuid"
      },
      "messages": [
        {
          "id": "msg-1", "ticketId": "ticket-uuid", "senderId": "writer-uuid",
          "senderRole": "writer", "role": "writer",
          "message": "هل ينشر مقالي غداً؟", "text": "هل ينشر مقالي غداً؟",
          "parentMessageId": null,
          "createdAt": "2026-10-24T10:00:00.000Z", "created_at": "2026-10-24T10:00:00.000Z",
          "senderName": "د. خالد العتيبي"
        },
        {
          "id": "msg-2", "ticketId": "ticket-uuid", "senderId": "user-uuid",
          "senderRole": "admin", "role": "admin",
          "message": "نعم، الساعة 9 صباحاً", "text": "نعم، الساعة 9 صباحاً",
          "parentMessageId": "msg-1",
          "createdAt": "2026-10-24T14:00:00.000Z", "created_at": "2026-10-24T14:00:00.000Z",
          "senderName": "ماجد العتيبي"
        }
      ]
    }
    """

    static let socialPost = """
    {
      "id": "social-post-uuid", "articleId": "art-uuid", "platform": "x",
      "text": "انطلاق المؤتمر التقني بالرياض", "linkUrl": "https://sabq.org/article/tech-conf",
      "imageUrl": null, "mediaKind": "none", "mediaUrls": [], "publisherId": "pub-uuid",
      "status": "draft", "scheduledAt": null, "publishedAt": null, "externalPostUrl": null,
      "createdByUserId": "agency-user", "attempts": 1, "lastError": null,
      "createdAt": "2026-10-24T13:00:00.000Z", "updatedAt": "2026-10-24T15:00:00.000Z"
    }
    """

    static let socialDetail = """
    {
      "post": \(socialPost),
      "preview": {
        "text": "انطلاق المؤتمر التقني بالرياض", "linkUrl": "https://sabq.org/article/tech-conf",
        "composedText": "انطلاق المؤتمر التقني بالرياض https://sabq.org/article/tech-conf",
        "weightedLength": 81, "maxLength": 280, "valid": true, "overStandard": false,
        "imageUrl": null, "imageSource": "none", "mediaKind": "none", "mediaUrls": []
      },
      "author": null,
      "agency": { "id": "pub-uuid", "name": "وكالة الأفق" },
      "article": { "id": "art-uuid", "title": "انطلاق المؤتمر", "url": "https://sabq.org/article/tech-conf", "imageUrl": null },
      "sender": { "id": "pub-uuid", "name": "وكالة الأفق", "kind": "agency" },
      "attempts": [
        {
          "id": "att-1", "postId": "social-post-uuid", "phase": "publish", "outcome": "failed",
          "httpStatus": 503, "errorCode": "x_unavailable", "errorMessage": "Service Unavailable",
          "retryable": true, "durationMs": 1200, "createdAt": "2026-10-24T14:30:00.000Z"
        }
      ],
      "deeplink": "sabqdesk://social/social-post-uuid"
    }
    """

    static let meAdmin = """
    {
      "id": "admin-uuid", "email": "admin@sabq.org", "name": "صحيفة سبق", "role": "system_admin",
      "profileImageUrl": "https://media.sabq.org/avatars/admin.jpg", "twoFactorEnabled": true,
      "roles": ["system_admin"],
      "capabilities": {
        "canTickets": true,
        "canSocial": { "view": true, "publish": true, "schedule": true, "reject": true },
        "canSystemHealth": true, "canAdminAlerts": true
      },
      "alertPrefs": { "aiAlerts": true, "adminAlerts": false }
    }
    """

    static let inboxV2 = """
    {
      "items": [
        {
          "id": "social-org", "kind": "social", "title": "مقترح من حساب المؤسسة",
          "previewText": "@sabq\\nسلمان الدوسري يكتب : نص التغريدة",
          "sender": { "id": "u-1", "name": "صحيفة سبق", "kind": "organization", "roleKind": "system_admin",
                      "avatarUrl": "https://media.sabq.org/avatars/u-1.jpg" },
          "createdAt": "2026-10-25T10:00:00.000Z", "updatedAt": "2026-10-25T11:00:00.000Z",
          "status": "canceled", "hasUnread": false, "lastError": null, "canceledBySelf": true
        }
      ],
      "nextCursor": null,
      "hasMore": false
    }
    """

    static let systemHealth = """
    {
      "generatedAt": "2026-10-25T15:13:40.000Z",
      "lastCheckAt": "2026-10-25T15:13:00.000Z",
      "summary": { "status": "partial", "title": "تعطّل جزئي", "detail": "نموذج واحد متوقف." },
      "aiAlertsEnabled": true,
      "models": [
        { "provider": "anthropic", "providerLabel": "Anthropic", "modelId": "claude-sonnet-4-6",
          "status": "down", "rawStatus": "quota_exceeded", "lastCheckAt": "2026-10-25T15:13:00.000Z",
          "since": "2026-10-25T14:58:00.000Z", "cooldownUntil": "2026-10-25T15:40:00.000Z",
          "lastError": { "code": "QUOTA_EXCEEDED", "message": "quota exceeded" },
          "requests24h": 120, "failures24h": 7 },
        { "provider": "openai", "providerLabel": "OpenAI", "modelId": "gpt-5.1",
          "status": "up", "rawStatus": "healthy", "lastCheckAt": null, "since": null, "cooldownUntil": null,
          "lastError": null, "requests24h": 2471, "failures24h": 0 },
        { "provider": "google", "modelId": "gemini-2.5-flash", "status": "sleeping" }
      ],
      "budgets": [
        { "id": "b1", "label": "OpenAI", "limitUsd": 500, "spentUsd": 410.2, "percent": 82, "period": "monthly" }
      ]
    }
    """

    static let adminAlerts = """
    {
      "generatedAt": "2026-10-25T15:15:00.000Z",
      "counts": { "urgent": 1, "info": 2 },
      "items": [
        { "id": "social_failed:post-1", "kind": "social_failed", "severity": "urgent",
          "title": "فشل نشر تغريدة", "body": "رفضتها منصة X بعد 3 محاولات.",
          "occurredAt": "2026-10-25T15:09:00.000Z", "deeplink": "sabqdesk://social/post-1",
          "action": { "type": "retry_social", "postId": "post-1" } },
        { "id": "ai_incident:gemini", "kind": "ai_incident", "severity": "info",
          "title": "نموذج متدهور", "body": "gemini-2.5-flash",
          "occurredAt": "2026-10-25T14:00:00.000Z", "deeplink": "sabqdesk://system",
          "action": { "type": "open_system" } },
        { "id": "future:1", "kind": "something_new", "severity": "critical",
          "title": "نوع جديد", "body": null, "occurredAt": null, "deeplink": null,
          "action": { "type": "launch_rocket" } }
      ]
    }
    """

    static let loginSuccess = """
    {
      "success": true,
      "message": "تم تسجيل الدخول بنجاح",
      "token": "session-abc",
      "expiresAt": "2026-11-23T10:00:00.000Z",
      "user": { "id": "user-uuid", "email": "editor@sabq.org", "firstName": "ماجد", "lastName": "العتيبي", "role": "editor" }
    }
    """

    static let loginNeeds2FA = """
    { "success": false, "requires2FA": true, "challengeToken": "challenge-xyz", "message": "أدخل رمز التحقق" }
    """

    /// `GET /opinion/board` (shape from server/services/staffOpinionBoard.ts), fictional writers.
    static let opinionBoard = """
    {
      "weekStart": "2026-10-28",
      "days": [
        { "date": "2026-10-28", "weekday": 3, "counts": { "draft": 0, "prep": 0, "scheduled": 0, "missing": 0 } },
        { "date": "2026-10-29", "weekday": 4, "counts": { "draft": 1, "prep": 0, "scheduled": 0, "missing": 0 } },
        { "date": "2026-11-03", "weekday": 2, "counts": { "missing": 1 } }
      ],
      "slots": [
        { "writer": { "id": "w1", "name": "د. كاتب الرأي", "avatarUrl": null, "jobTitle": null,
                      "fixedSlot": { "weekday": 4, "publishTime": "09:00" } },
          "slotAt": "2026-10-29T06:00:00.000Z", "state": "arrived",
          "article": { "id": "a1", "title": "الاقتصاد الرقمي", "status": "new_draft",
                       "submittedAt": "2026-10-28T05:48:00.000Z", "scheduledAt": null, "publishedAt": null },
          "deeplink": "sabqdesk://opinion/a1" },
        { "writer": { "id": "w5", "name": "د. كاتب المقال", "fixedSlot": { "weekday": 2, "publishTime": "09:00" } },
          "slotAt": "2026-11-03T06:00:00.000Z", "state": "missing", "article": null, "deeplink": null },
        { "writer": { "id": "w9", "name": "كاتب جديد", "fixedSlot": null },
          "slotAt": "2026-11-01T07:00:00.000Z", "state": "on_hold",
          "article": { "id": "a9", "title": "حالة من خادم أحدث", "status": "frozen" } }
      ],
      "unslotted": [
        { "writer": { "id": "w3", "name": "كاتب ضيف", "fixedSlot": null }, "slotAt": null, "state": "arrived",
          "article": { "id": "a3", "title": "ماذا تعلّمنا من موسم الرياض؟", "status": "new_draft",
                       "submittedAt": "2026-10-28T05:20:00Z" },
          "deeplink": "sabqdesk://opinion/a3" }
      ],
      "pendingCount": 2
    }
    """

    static let opinionScheduleResult = """
    { "article": { "id": "a1", "status": "scheduled", "scheduledAt": "2026-10-29T06:00:00.000Z" },
      "scheduledAt": "2026-10-29T06:00:00.000Z",
      "warnings": [ { "code": "slot_clash", "message": "تنبيه: الكاتب ب مجدول في الموعد نفسه",
                      "otherWriterName": "ب", "otherArticleId": "a7" } ] }
    """
}

extension String {
    var data: Data { Data(utf8) }
}

final class MockTransport: HTTPTransport, @unchecked Sendable {
    struct Reply {
        var status: Int
        var body: String
    }

    private let lock = NSLock()
    private var replies: [Reply]
    private(set) var requests: [URLRequest] = []

    init(_ replies: [Reply]) {
        self.replies = replies
    }

    func send(_ request: URLRequest) async throws -> (Data, URLResponse) {
        let reply = lock.withLock {
            requests.append(request)
            return replies.isEmpty ? Reply(status: 500, body: "{}") : replies.removeFirst()
        }
        let response = HTTPURLResponse(url: request.url!, statusCode: reply.status, httpVersion: "HTTP/1.1", headerFields: nil)!
        return (reply.body.data, response)
    }

    var lastRequest: URLRequest? {
        lock.withLock { requests.last }
    }
}

func jsonObject(_ data: Data?) -> [String: Any] {
    guard let data, let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return [:] }
    return object
}
