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
    let emptyOpinion: Bool

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
        case "/api/v1/staff/opinion/board": body = Self.opinionBoardJSON(empty: emptyOpinion)
        case let path where path.hasPrefix("/api/v1/staff/opinion/"):
            body = Self.opinionActionJSON(path: path)
        case "/api/v1/staff/news": body = Self.newsBoardJSON
        case "/api/v1/staff/news/categories": body = #"{"categories":[{"id":"c1","name":"محليات"},{"id":"c2","name":"اقتصاد"}]}"#
        case let path where path.hasPrefix("/api/v1/staff/news/edit-requests/"): body = Self.editRequestJSON
        case let path where path.hasPrefix("/api/v1/staff/news/"): body = Self.newsPreviewJSON
        case let path where path.hasPrefix("/api/v1/staff/system/balances/"):
            // GET …/balances/<p>, POST …/<p>/topup and PUT …/<p>/threshold all answer the detail.
            let provider = path.dropFirst("/api/v1/staff/system/balances/".count).split(separator: "/").first
            body = Self.balanceDetailJSON(provider: provider.map(String.init) ?? "")
        default: body = "{}"
        }
        let response = HTTPURLResponse(url: url, statusCode: 200, httpVersion: "HTTP/1.1", headerFields: nil)!
        return (Data(body.utf8), response)
    }

    nonisolated static let newsBoardJSON = """
    {
      "counts": {"all": 3, "reporters": 1, "editRequests": 1, "email": 1},
      "oldestAt": "2026-10-31T04:20:00.000Z",
      "editRequestsReady": true,
      "items": [
        {"kind": "draft", "id": "preview-news-1", "articleId": "preview-news-1",
         "title": "أمطار غزيرة على جدة وتعليق الدراسة الحضورية غدًا في عدد من المحافظات",
         "subtitle": null, "channel": "app", "reporterName": "مراسل جدة", "categoryName": "محليات",
         "imageUrl": null, "thumbnailUrl": null, "albumCount": 4, "isBreaking": true, "lockedBy": null,
         "submittedAt": "2026-10-31T07:40:00.000Z"},
        {"kind": "edit_request", "id": "preview-req-1", "articleId": "preview-news-9",
         "title": "افتتاح معرض الرياض الدولي للكتاب بمشاركة أكثر من 2000 دار نشر",
         "articleStatus": "published", "requesterName": "مراسل الرياض", "urgent": false,
         "note": "الرقم الصحيح 2100 دار", "fields": ["title", "content", "albumImages"],
         "label": "3 تغييرات", "imageUrl": null, "submittedAt": "2026-10-31T05:40:00.000Z"},
        {"kind": "draft", "id": "preview-news-2", "articleId": "preview-news-2",
         "title": "هيئة الأرصاد: رياح نشطة مثيرة للأتربة على المنطقة الشرقية حتى الأحد",
         "subtitle": null, "channel": "email", "reporterName": "واس", "categoryName": null,
         "imageUrl": null, "thumbnailUrl": null, "albumCount": 0, "isBreaking": false, "lockedBy": null,
         "submittedAt": "2026-10-31T04:20:00.000Z"}
      ]
    }
    """

    nonisolated static let newsPreviewJSON = """
    {"article": {"id": "preview-news-1", "title": "أمطار غزيرة على جدة وتعليق الدراسة الحضورية غدًا",
     "subtitle": "الإدارة العامة للتعليم تعلن التحول إلى «مدرستي» احترازيًا", "slug": "jeddah-rain",
     "status": "draft", "reviewStatus": "pending_review",
     "content": "<p>شهدت محافظة جدة صباح اليوم هطول أمطار غزيرة صاحبتها رياح نشطة.</p>",
     "excerpt": null, "imageUrl": null, "albumImages": [], "category": {"id": "c1", "name": "محليات"},
     "isBreaking": true, "channel": "app", "reporterName": "مراسل جدة", "submittedAt": "2026-10-31T07:40:00.000Z",
     "summaryReady": true, "seoReady": true, "lockedBy": null,
     "webEditUrl": "https://sabq.org/dashboard/articles/preview-news-1/edit", "pendingEditRequestId": null,
     "updatedAt": "2026-10-31T07:40:00.000Z"}}
    """

    nonisolated static let editRequestJSON = """
    {"request": {"id": "preview-req-1", "articleId": "preview-news-9", "status": "pending", "urgent": false,
      "note": "حضر وزير الثقافة الافتتاح، والرقم الصحيح 2100 دار.", "requesterName": "مراسل الرياض",
      "decidedByName": null, "decisionNote": null,
      "proposed": {"title": "وزير الثقافة يفتتح معرض الرياض الدولي للكتاب بمشاركة 2100 دار نشر",
                   "contentEdits": [{"before": "افتتح المعرض بمشاركة أكثر من 2000 دار نشر", "after": "افتتح المعرض بحضور وزير الثقافة ومشاركة 2100 دار نشر"}],
                   "albumAdd": []},
      "createdAt": "2026-10-31T05:40:00.000Z"},
     "article": {"id": "preview-news-9", "title": "افتتاح معرض الرياض الدولي للكتاب بمشاركة أكثر من 2000 دار نشر",
                 "subtitle": null, "status": "published", "imageUrl": null, "albumImages": []},
     "fields": ["title", "content"],
     "contentEdits": [{"before": "افتتح المعرض بمشاركة أكثر من 2000 دار نشر", "after": "افتتح المعرض بحضور وزير الثقافة ومشاركة 2100 دار نشر", "found": true}]}
    """

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

// MARK: - «الرأي» (concept C), fictional placeholder writers only

extension DeskPreviewTransport {
    /// A Riyadh time `days` after today at `hour:minute`, as server JSON.
    nonisolated static func riyadh(days: Int, hour: Int, minute: Int = 0, now: Date = Date()) -> String {
        let calendar = RiyadhTime.calendar
        let today = calendar.startOfDay(for: now)
        let day = calendar.date(byAdding: .day, value: days, to: today) ?? today
        let at = calendar.date(bySettingHour: hour, minute: minute, second: 0, of: day) ?? day
        return iso(at)
    }

    nonisolated static func iso(_ date: Date) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.string(from: date)
    }

    nonisolated static func writer(_ id: String, _ name: String, weekdayOffset: Int?, time: String,
                                   now: Date = Date()) -> [String: Any] {
        var out: [String: Any] = ["id": id, "name": name, "avatarUrl": NSNull(), "jobTitle": NSNull()]
        if let weekdayOffset {
            let calendar = RiyadhTime.calendar
            let day = calendar.date(byAdding: .day, value: weekdayOffset, to: now) ?? now
            out["fixedSlot"] = ["weekday": calendar.component(.weekday, from: day) - 1, "publishTime": time]
        } else {
            out["fixedSlot"] = NSNull()
        }
        return out
    }

    nonisolated static func article(_ id: String, _ title: String, _ status: String,
                                    submittedMinutesAgo: Int, scheduledAt: String? = nil) -> [String: Any] {
        ["id": id, "title": title, "status": status,
         "submittedAt": iso(Date().addingTimeInterval(TimeInterval(-submittedMinutesAgo * 60))),
         "scheduledAt": scheduledAt ?? NSNull(), "publishedAt": NSNull()]
    }

    /// The concept's week: tomorrow 09:00 new draft, +3 days 08:00 in prep,
    /// +4 days 10:00 scheduled, +6 days 09:00 not arrived, and a guest
    /// without a fixed slot. `empty`: no drafts, one reserved slot tomorrow.
    nonisolated static func opinionBoardJSON(empty: Bool) -> String {
        let now = Date()
        let calendar = RiyadhTime.calendar
        let today = calendar.startOfDay(for: now)
        var counts: [Int: [String: Int]] = [:]
        func bump(_ day: Int, _ key: String) { counts[day, default: [:]][key, default: 0] += 1 }

        var slots: [[String: Any]] = []
        var unslotted: [[String: Any]] = []
        if empty {
            slots.append(["writer": writer("w1", "د. كاتب الرأي", weekdayOffset: 1, time: "09:00"),
                          "slotAt": riyadh(days: 1, hour: 9), "state": "missing", "article": NSNull(), "deeplink": NSNull()])
            bump(1, "missing")
        } else {
            slots = [
                ["writer": writer("w1", "د. كاتب الرأي", weekdayOffset: 1, time: "09:00"),
                 "slotAt": riyadh(days: 1, hour: 9), "state": "arrived",
                 "article": article("preview-op-1", "الاقتصاد الرقمي وفرص الشباب في سوق العمل الجديد", "new_draft",
                                    submittedMinutesAgo: 12),
                 "deeplink": "sabqdesk://opinion/preview-op-1"],
                ["writer": writer("w2", "أ. كاتبة الرأي", weekdayOffset: 3, time: "08:00"),
                 "slotAt": riyadh(days: 3, hour: 8), "state": "arrived",
                 "article": article("preview-op-2", "حين تصبح المدن أكثر إنصاتًا لسكانها: قراءة في تجارب الأحياء الذكية",
                                    "in_prep", submittedMinutesAgo: 120),
                 "deeplink": "sabqdesk://opinion/preview-op-2"],
                ["writer": writer("w4", "م. كاتب الأسبوع", weekdayOffset: 4, time: "10:00"),
                 "slotAt": riyadh(days: 4, hour: 10), "state": "scheduled",
                 "article": article("preview-op-4", "الرياضة المدرسية استثمار مؤجل في صحة جيل كامل", "scheduled",
                                    submittedMinutesAgo: 26 * 60, scheduledAt: riyadh(days: 4, hour: 10)),
                 "deeplink": "sabqdesk://opinion/preview-op-4"],
                ["writer": writer("w5", "د. كاتب المقال", weekdayOffset: 6, time: "09:00"),
                 "slotAt": riyadh(days: 6, hour: 9), "state": "missing", "article": NSNull(), "deeplink": NSNull()],
            ]
            unslotted = [
                ["writer": writer("w3", "كاتب ضيف", weekdayOffset: nil, time: ""),
                 "slotAt": NSNull(), "state": "arrived",
                 "article": article("preview-op-3", "ماذا تعلّمنا من موسم الرياض هذا العام؟", "new_draft",
                                    submittedMinutesAgo: 40),
                 "deeplink": "sabqdesk://opinion/preview-op-3"],
            ]
            bump(1, "draft"); bump(3, "prep"); bump(4, "scheduled"); bump(6, "missing")
        }
        let days: [[String: Any]] = (0..<7).map { offset in
            let day = calendar.date(byAdding: .day, value: offset, to: today) ?? today
            return ["date": RiyadhTime.dayString(day),
                    "weekday": calendar.component(.weekday, from: day) - 1,
                    "counts": counts[offset] ?? [:]]
        }
        let board: [String: Any] = ["weekStart": RiyadhTime.dayString(today), "days": days,
                                    "slots": slots, "unslotted": unslotted, "pendingCount": empty ? 0 : 3]
        guard let data = try? JSONSerialization.data(withJSONObject: board) else { return "{}" }
        return String(decoding: data, as: UTF8.self)
    }

    /// Writes answer like the server; prepare is the 501 stub's body (decoded leniently by previews).
    nonisolated static func opinionActionJSON(path: String) -> String {
        if path.hasSuffix("/slot-check") { return #"{"warnings":[]}"# }
        if path.hasSuffix("/schedule") {
            return #"{"article":{"id":"preview-op-1","status":"scheduled"},"warnings":[]}"#
        }
        return #"{"article":{"id":"preview-op-1","status":"published"}}"#
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
                                                            canManageBalances: true,
                                                            canOpinion: .init(view: true, schedule: true,
                                                                              publish: true, returnToWriter: true),
                                                            canNews: true),
                            alertPrefs: StaffAlertPrefs())

    static func client(emptyInbox: Bool, emptyOpinion: Bool = false) -> StaffAPIClient {
        StaffAPIClient(configuration: .init(installationID: "preview-installation", appVersion: "1.0.0"),
                       sessionStore: InMemorySessionStore(session: StaffSession(token: "preview", expiresAt: nil,
                                                                                userId: me.id)),
                       transport: DeskPreviewTransport(emptyInbox: emptyInbox, emptyOpinion: emptyOpinion))
    }
}

/// Holds the preview models in `@State` so they survive re-renders, and
/// applies the same environment as `SabqDeskApp` (RTL, Riyadh locale, tint).
@MainActor
struct DeskPreviewHost<Content: View>: View {
    @State private var model: AppModel
    @State private var appLock: AppLockController
    private let content: Content

    init(emptyInbox: Bool, emptyOpinion: Bool = false, content: Content) {
        let model = AppModel.preview(me: DeskPreviewFixtures.me,
                                     unread: StaffUnreadCounts(tickets: 2, social: 3, total: 5),
                                     client: DeskPreviewFixtures.client(emptyInbox: emptyInbox,
                                                                        emptyOpinion: emptyOpinion))
        model.setOpinionPending(emptyOpinion ? 0 : 3)
        model.setNewsPending(3)
        _model = State(initialValue: model)
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
    func deskPreviewEnvironment(emptyInbox: Bool = false, emptyOpinion: Bool = false) -> some View {
        DeskPreviewHost(emptyInbox: emptyInbox, emptyOpinion: emptyOpinion, content: self)
    }
}

/// Simulator screenshots with the preview fixtures: launch a Debug build with
/// `SIMCTL_CHILD_DESK_SHOT=<scene>` and the app opens the tabs on canned data
/// instead of the real session. Release builds never compile this.
enum DeskScreenshotScene: String {
    case balances, openai, update, banner
    /// «الرأي» (concept C): the timeline, scrolled to the scheduled card +
    /// missing slot + «بلا موعد ثابت», and the empty week.
    case opinion, opinionmid, opinionempty
    /// Scrolled to the «بلا موعد ثابت» section (guest writer card).
    case opinionnoslot
    /// «الأخبار» list, the news preview and the edit-request review (2026-10-31).
    case news, newspreview, editrequest

    static let current = ProcessInfo.processInfo.environment["DESK_SHOT"].flatMap(Self.init(rawValue:))

    var link: DeskDeepLink? {
        switch self {
        case .balances: return .balances
        case .openai, .update: return .balance(provider: "openai")
        case .banner: return .systemHealth
        case .opinion, .opinionempty: return nil
        // Focusing the scheduled card scrolls past the first two slots.
        case .opinionmid: return .opinion(id: "preview-op-4")
        case .opinionnoslot: return .opinion(id: "preview-op-3")
        case .news: return nil
        case .newspreview: return .news(id: "preview-news-1")
        case .editrequest: return .editRequest(id: "preview-req-1")
        }
    }

    var tab: MainTabView.Tab? {
        switch self {
        case .opinion, .opinionmid, .opinionempty, .opinionnoslot: return .opinion
        case .news, .newspreview, .editrequest: return .news
        default: return nil
        }
    }
}

struct DeskScreenshotHost: View {
    let scene: DeskScreenshotScene

    var body: some View {
        DeskScreenshotRouter(scene: scene)
            .deskPreviewEnvironment(emptyOpinion: scene == .opinionempty)
            .preferredColorScheme(.light)
    }
}

private struct DeskScreenshotRouter: View {
    @Environment(AppModel.self) private var model
    let scene: DeskScreenshotScene

    var body: some View {
        MainTabView(initialTab: scene.tab)
            .background(DeskTheme.background)
            .task { if let link = scene.link { model.pendingLink = link } }
    }
}
#endif
