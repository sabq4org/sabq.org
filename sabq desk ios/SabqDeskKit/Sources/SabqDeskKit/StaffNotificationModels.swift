import Foundation

// «التنبيهات» (2026-10-29): the timeline behind the bell — tweets, opinion
// articles and news published from «نشر سبق». Server: GET /api/v1/staff/notifications
// (shared/staffNotifications.ts).

/// The filter tabs above the timeline.
public enum StaffNotificationCategory: String, Codable, Sendable, CaseIterable, Identifiable {
    case tweet, opinion, news

    public var id: String { rawValue }

    public var title: String {
        switch self {
        case .tweet: return "تغريدات"
        case .opinion: return "مقالات رأي"
        case .news: return "أخبار"
        }
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

    public init(id: String, kind: String, category: StaffNotificationCategory, label: String, actionLabel: String,
                title: String, detail: String, actorName: String? = nil, targetId: String, linkUrl: String? = nil,
                deeplink: String? = nil, scheduledAt: Date? = nil, createdAt: Date, isUnread: Bool = false) {
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
    }

    /// Where the row's button goes: the tweet or the opinion article inside
    /// the app, or nil for news (opened from `articleURL`).
    public var link: DeskDeepLink? {
        guard DeskDeepLink.isValidID(targetId) else { return nil }
        switch category {
        case .tweet: return .social(id: targetId)
        case .opinion: return .opinion(id: targetId)
        case .news: return nil
        }
    }

    /// The published news page; only https links on sabq.org are opened.
    public var articleURL: URL? {
        guard let linkUrl, let url = URL(string: linkUrl), url.scheme == "https",
              let host = url.host?.lowercased(), host == "sabq.org" || host.hasSuffix(".sabq.org") else { return nil }
        return url
    }
}

public struct StaffNotificationCounts: Codable, Sendable, Equatable {
    public var all: Int
    public var tweet: Int
    public var opinion: Int
    public var news: Int

    public init(all: Int = 0, tweet: Int = 0, opinion: Int = 0, news: Int = 0) {
        self.all = all
        self.tweet = tweet
        self.opinion = opinion
        self.news = news
    }

    public func count(_ category: StaffNotificationCategory?) -> Int {
        switch category {
        case nil: return all
        case .tweet?: return tweet
        case .opinion?: return opinion
        case .news?: return news
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
