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
        "sender": { "id": "writer-uuid", "name": "د. خالد العتيبي", "kind": "writer", "roleKind": "opinion_author" },
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
        lock.lock()
        requests.append(request)
        let reply = replies.isEmpty ? Reply(status: 500, body: "{}") : replies.removeFirst()
        lock.unlock()
        let response = HTTPURLResponse(url: request.url!, statusCode: reply.status, httpVersion: "HTTP/1.1", headerFields: nil)!
        return (reply.body.data, response)
    }

    var lastRequest: URLRequest? {
        lock.lock(); defer { lock.unlock() }
        return requests.last
    }
}

func jsonObject(_ data: Data?) -> [String: Any] {
    guard let data, let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return [:] }
    return object
}
