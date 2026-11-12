import Foundation

// «التنبيهات» (2026-10-29): the timeline behind the bell — tweets, opinion
// articles and news published from «نشر سبق». Server: GET /api/v1/staff/notifications
// (shared/staffNotifications.ts).

/// The filter tabs above the timeline.
public enum StaffNotificationCategory: String, Codable, Sendable, CaseIterable, Identifiable {
    /// `message` (writer tickets) is sent only to a client that asks with `v=2`.
    case tweet, opinion, news, message

    public var id: String { rawValue }

    public var title: String {
        switch self {
        case .tweet: return "تغريدات"
        case .opinion: return "مقالات رأي"
        case .news: return "أخبار"
        case .message: return "رسائل"
        }
    }

    /// The tag on one row: «خبر», «تغريدة», «مقال رأي», «رسالة».
    public var tag: String {
        switch self {
        case .tweet: return "تغريدة"
        case .opinion: return "مقال رأي"
        case .news: return "خبر"
        case .message: return "رسالة"
        }
    }
}

/// Who is behind a notification (server, 2026-11-12). An unknown value from
/// a newer server reads as `.unknown` and draws like a person.
public enum StaffNotificationActorKind: String, Codable, Sendable {
    case person, agency, bot, system, unknown

    public init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = StaffNotificationActorKind(rawValue: raw) ?? .unknown
    }
}

public struct StaffNotification: Codable, Sendable, Equatable, Identifiable, Hashable {
    public var id: String
    /// `tweet_draft`, `tweet_scheduled`, `tweet_published`, `opinion_draft`,
    /// `opinion_scheduled`, `news_published`. Kept as text so a new kind from
    /// a newer server still shows with its server label.
    public var kind: String
    public var category: StaffNotificationCategory
    public var label: String
    public var actionLabel: String
    public var title: String
    public var detail: String
    public var actorName: String?
    public var targetId: String
    /// The published article on sabq.org (news only).
    public var linkUrl: String?
    public var deeplink: String?
    public var scheduledAt: Date?
    public var createdAt: Date
    public var isUnread: Bool
    /// The three below are absent on a server older than 2026-11-12.
    public var actorKind: StaffNotificationActorKind?
    public var needsDecision: Bool?
    public var source: String?
    /// The person's photo or the agency's logo (absolute https), when the server has one.
    public var actorAvatarUrl: String?
    /// One timeline row per item (server, 2026-11-12): the sender's role
    /// («مراسل», «بوت», «وكالة»), the item's stages in one line, and how
    /// many events it holds. Absent on an older server.
    public var actorRole: String?
    public var trail: String?
    public var stageCount: Int?

    public init(id: String, kind: String, category: StaffNotificationCategory, label: String, actionLabel: String,
                title: String, detail: String, actorName: String? = nil, targetId: String, linkUrl: String? = nil,
                deeplink: String? = nil, scheduledAt: Date? = nil, createdAt: Date, isUnread: Bool = false,
                actorKind: StaffNotificationActorKind? = nil, needsDecision: Bool? = nil, source: String? = nil,
                actorAvatarUrl: String? = nil, actorRole: String? = nil, trail: String? = nil,
                stageCount: Int? = nil) {
        self.id = id
        self.kind = kind
        self.category = category
        self.label = label
        self.actionLabel = actionLabel
        self.title = title
        self.detail = detail
        self.actorName = actorName
        self.targetId = targetId
        self.linkUrl = linkUrl
        self.deeplink = deeplink
        self.scheduledAt = scheduledAt
        self.createdAt = createdAt
        self.isUnread = isUnread
        self.actorKind = actorKind
        self.needsDecision = needsDecision
        self.source = source
        self.actorAvatarUrl = actorAvatarUrl
        self.actorRole = actorRole
        self.trail = trail
        self.stageCount = stageCount
    }

    /// The line under the title: the item's stages, or the source line on an older server.
    public var statusLine: String {
        let text = trail?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return text.isEmpty ? sourceLine : text
    }

    /// «مراسل», «بوت», … beside the name; nil when there is none.
    public var roleLabel: String? {
        let text = actorRole?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return text.isEmpty ? nil : text
    }

    /// Only an https link is ever loaded.
    public var actorAvatarURL: URL? { DeskAvatarURL.https(actorAvatarUrl) }

    /// Kinds that wait for a decision; the rest are «للعلم».
    static let decisionKinds: Set<String> = [
        "tweet_draft", "opinion_draft", "news_bot_draft", "news_draft", "news_edit_request", "ticket_message",
    ]

    /// True while the item still waits for the desk. An older server sends
    /// no verdict, so the kind alone decides.
    public var waitsForDecision: Bool {
        needsDecision ?? Self.decisionKinds.contains(kind)
    }

    /// Bot, person or the scheduler; inferred from the kind on an older server.
    public var actor: StaffNotificationActorKind {
        if let actorKind, actorKind != .unknown { return actorKind }
        return kind == "news_bot_draft" ? .bot : .person
    }

    /// The line beside the type tag («مسودة من بوت · قروك بوت»); the old
    /// second line on an older server.
    public var sourceLine: String {
        let text = source?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return text.isEmpty ? detail : text
    }

    /// Where the row's button goes inside the app: the tweet, the opinion
    /// article, the writer's ticket, a news draft (a bot's or a reporter's) or
    /// an edit request. Nil for published news (opened from `articleURL`).
    public var link: DeskDeepLink? {
        guard DeskDeepLink.isValidID(targetId) else { return nil }
        switch category {
        case .tweet: return .social(id: targetId)
        case .opinion: return .opinion(id: targetId)
        case .message: return .ticket(id: targetId)
        case .news:
            switch kind {
            case "news_bot_draft", "news_draft": return .news(id: targetId)
            case "news_edit_request": return .editRequest(id: targetId)
            default: return nil
            }
        }
    }

    /// The published news page; only https links on sabq.org are opened.
    public var articleURL: URL? { DeskDeepLink.sabqArticleURL(linkUrl) }
}

public struct StaffNotificationCounts: Codable, Sendable, Equatable {
    public var all: Int
    public var tweet: Int
    public var opinion: Int
    public var news: Int
    public var message: Int

    public init(all: Int = 0, tweet: Int = 0, opinion: Int = 0, news: Int = 0, message: Int = 0) {
        self.all = all
        self.tweet = tweet
        self.opinion = opinion
        self.news = news
        self.message = message
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        all = try container.decodeIfPresent(Int.self, forKey: .all) ?? 0
        tweet = try container.decodeIfPresent(Int.self, forKey: .tweet) ?? 0
        opinion = try container.decodeIfPresent(Int.self, forKey: .opinion) ?? 0
        news = try container.decodeIfPresent(Int.self, forKey: .news) ?? 0
        // Missing on a server older than 2026-11-10.
        message = try container.decodeIfPresent(Int.self, forKey: .message) ?? 0
    }

    public func count(_ category: StaffNotificationCategory?) -> Int {
        switch category {
        case nil: return all
        case .tweet?: return tweet
        case .opinion?: return opinion
        case .news?: return news
        case .message?: return message
        }
    }
}

public struct StaffNotificationsPage: Codable, Sendable, Equatable {
    public var items: [StaffNotification]
    public var nextCursor: String?
    public var categories: [StaffNotificationCategory]
    public var counts: StaffNotificationCounts
    public var unreadCount: Int

    public init(items: [StaffNotification] = [], nextCursor: String? = nil,
                categories: [StaffNotificationCategory] = [], counts: StaffNotificationCounts = .init(),
                unreadCount: Int = 0) {
        self.items = items
        self.nextCursor = nextCursor
        self.categories = categories
        self.counts = counts
        self.unreadCount = unreadCount
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        // A row with an unknown category (newer server) is skipped, not fatal.
        items = (try container.decodeIfPresent([Lossy<StaffNotification>].self, forKey: .items) ?? [])
            .compactMap(\.value)
        nextCursor = try container.decodeIfPresent(String.self, forKey: .nextCursor)
        categories = (try container.decodeIfPresent([Lossy<StaffNotificationCategory>].self, forKey: .categories) ?? [])
            .compactMap(\.value)
        counts = try container.decodeIfPresent(StaffNotificationCounts.self, forKey: .counts) ?? .init()
        unreadCount = try container.decodeIfPresent(Int.self, forKey: .unreadCount) ?? 0
    }

    private enum CodingKeys: String, CodingKey { case items, nextCursor, categories, counts, unreadCount }
}

public struct StaffNotificationsUnread: Codable, Sendable, Equatable {
    public var unreadCount: Int
    public var latest: StaffNotification?

    public init(unreadCount: Int = 0, latest: StaffNotification? = nil) {
        self.unreadCount = unreadCount
        self.latest = latest
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        unreadCount = try container.decodeIfPresent(Int.self, forKey: .unreadCount) ?? 0
        latest = try? container.decodeIfPresent(StaffNotification.self, forKey: .latest)
    }

    private enum CodingKeys: String, CodingKey { case unreadCount, latest }
}

private struct Lossy<Value: Decodable>: Decodable {
    let value: Value?

    init(from decoder: Decoder) throws {
        value = try? Value(from: decoder)
    }
}

/// One day on the timeline: «اليوم» / «أمس» / the weekday, then the date.
public struct StaffNotificationDay: Sendable, Equatable, Identifiable {
    public var id: String
    public var title: String
    public var date: String
    public var items: [StaffNotification]
}

public enum StaffNotificationTimeline {
    /// Groups newest-first items by Riyadh day, keeping their order.
    public static func days(_ items: [StaffNotification], now: Date = Date()) -> [StaffNotificationDay] {
        let calendar = RiyadhTime.calendar
        var out: [StaffNotificationDay] = []
        for item in items {
            let key = RiyadhTime.dayString(item.createdAt)
            if let index = out.firstIndex(where: { $0.id == key }) {
                out[index].items.append(item)
                continue
            }
            let title: String
            if calendar.isDate(item.createdAt, inSameDayAs: now) {
                title = "اليوم"
            } else if let yesterday = calendar.date(byAdding: .day, value: -1, to: now),
                      calendar.isDate(item.createdAt, inSameDayAs: yesterday) {
                title = "أمس"
            } else {
                title = weekday(item.createdAt)
            }
            out.append(StaffNotificationDay(id: key, title: title, date: dateLine(item.createdAt), items: [item]))
        }
        return out
    }

    /// `9:50 ص` — 12-hour Riyadh time with Latin digits, as on the mockup.
    public static func time(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.locale = RiyadhTime.locale
        formatter.timeZone = RiyadhTime.timeZone
        formatter.calendar = RiyadhTime.calendar
        formatter.dateFormat = "h:mm a"
        return formatter.string(from: date)
    }

    static func weekday(_ date: Date) -> String {
        format(date, "EEEE")
    }

    /// `الخميس 29 أكتوبر`
    static func dateLine(_ date: Date) -> String {
        format(date, "EEEE d MMMM")
    }

    private static func format(_ date: Date, _ pattern: String) -> String {
        let formatter = DateFormatter()
        formatter.locale = RiyadhTime.locale
        formatter.timeZone = RiyadhTime.timeZone
        formatter.calendar = RiyadhTime.calendar
        formatter.dateFormat = pattern
        return formatter.string(from: date)
    }
}
