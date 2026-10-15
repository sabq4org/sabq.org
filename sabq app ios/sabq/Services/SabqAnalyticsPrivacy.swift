import Foundation

/// The small, deterministic part of analytics that is safe to unit test
/// without Firebase or a device. Firebase accepts strings and numbers only;
/// all other values are dropped rather than stringified into an opaque payload.
enum SabqAnalyticsPrivacy {
    static func canCollect(consented: Bool, debug: Bool, debugOptIn: Bool, configured: Bool) -> Bool {
        configured && consented && (!debug || debugOptIn)
    }
    static func readingDepth(bodyTop: Double, bodyHeight: Double, viewportHeight: Double) -> Double {
        guard bodyHeight > 0, viewportHeight > 0 else { return 0 }
        return min(1, max(0, (viewportHeight - bodyTop) / bodyHeight))
    }
    static let publicScreens: Set<String> = [
        "Home", "Explore", "ArticleDetail", "OpinionDetail", "Search",
    ]

    private static let allowedEvents: [String: Set<String>] = [
        "screen_view": ["screen_name", "screen_class"],
        "article_view": ["article_id", "article_title", "content_type", "category"],
        "opinion_view": ["article_id", "article_title", "author", "content_type"],
        "share_intent": ["article_id", "method"],
        "share": ["article_id", "method", "stage"],
        "bookmark_toggle": ["article_id", "bookmarked"],
        "article_like": ["article_id", "liked"],
        "article_comment": ["article_slug", "parent_comment_id"],
        "search": ["search_term"],
        "login": ["method"],
        "sign_up": ["method"],
        "deep_link_open": ["kind", "source", "article_id"],
        "push_open": ["notification_type", "article_id"],
        "lite_mode_activated": ["trigger"],
        "lite_mode_deactivated": [],
        "scroll_depth": ["article_id", "percent_scrolled"],
        "reading_time": ["article_id", "reading_time_seconds"],
    ]
    private static let requiredParameters: [String: Set<String>] = [
        "screen_view": ["screen_name"], "search": ["search_term"],
        "article_view": ["article_id"],
        "opinion_view": ["article_id"],
        "article_like": ["article_id"], "bookmark_toggle": ["article_id"],
        "share_intent": ["article_id"], "share": ["article_id"],
        "reading_time": ["article_id", "reading_time_seconds"],
        "scroll_depth": ["article_id", "percent_scrolled"],
        "login": ["method"], "sign_up": ["method"],
        "deep_link_open": ["kind", "source"], "push_open": ["notification_type"],
        "lite_mode_activated": ["trigger"],
    ]

    static func sanitizeEvent(_ name: String, parameters: [String: Any]?) -> [String: Any]? {
        guard allowedEvents[name] != nil else { return nil }
        if name == "screen_view", !isPublicScreen(parameters?["screen_name"] as? String ?? "") { return nil }
        var output: [String: Any] = [:]
        for (rawKey, value) in parameters ?? [:] {
            let key = normalizedKey(rawKey)
            guard allowedEvents[name]!.contains(key) else { continue }
            if let string = value as? String {
                guard isSafe(string, key: key) else { continue }
                output[key] = String(string.prefix(100))
            } else if let number = numberValue(value) {
                output[key] = number
            }
        }
        guard requiredParameters[name, default: []].isSubset(of: Set(output.keys)) else { return nil }
        return output
    }

    static func isPublicScreen(_ name: String) -> Bool { publicScreens.contains(name) }

    private static func normalizedKey(_ key: String) -> String {
        key.lowercased().replacingOccurrences(of: "-", with: "_")
    }

    private static func numberValue(_ value: Any) -> NSNumber? {
        if let value = value as? NSNumber {
            // Do not allow arbitrary Foundation objects that bridge to NSNumber.
            let type = String(cString: value.objCType)
            guard ["c", "i", "s", "l", "q", "C", "I", "S", "L", "Q", "f", "d", "B"].contains(type), value.doubleValue.isFinite else { return nil }
            return value
        }
        return nil
    }

    static func safeIdentifier(_ value: String) -> Bool {
        value.range(of: #"^[A-Za-z0-9_-]{1,100}$"#, options: .regularExpression) != nil
    }

    private static func isSafe(_ value: String, key: String) -> Bool {
        if key == "article_id" || key == "parent_comment_id" { return safeIdentifier(value) }
        var decoded = value
        for _ in 0..<2 { decoded = decoded.removingPercentEncoding ?? decoded }
        guard !decoded.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return false }
        if decoded.range(of: #"(?:@|https?://|www\.|(?:token|password|secret|email|phone|code)\s*[=:])"#, options: [.regularExpression, .caseInsensitive]) != nil { return false }
        if decoded.range(of: #"(?<![\p{L}\p{Nd}])\+?\p{Nd}[\p{Nd}\s().-]{5,}\p{Nd}(?![\p{L}\p{Nd}])"#, options: .regularExpression) != nil { return false }
        if key == "article_slug" {
            return decoded.range(of: #"^[\p{L}\p{Nd}_-]{1,100}$"#, options: .regularExpression) != nil
        }
        return true
    }

}

struct SabqReadingSessionState: Equatable {
    private(set) var articleID: String?
    private(set) var foregroundSeconds: TimeInterval = 0
    private(set) var crossedThresholds: Set<Int> = []
    private(set) var isActive = false
    private var lastTick: Date?
    private var flushed = false

    mutating func begin(articleID: String, at date: Date) {
        self.articleID = articleID
        foregroundSeconds = 0
        crossedThresholds = []
        isActive = true
        lastTick = date
        flushed = false
    }

    mutating func setActive(_ active: Bool, at date: Date) {
        guard articleID != nil else { return }
        if active && !isActive { lastTick = date }
        if !active && isActive { accumulate(to: date) }
        isActive = active
    }

    mutating func tick(at date: Date) {
        guard isActive else { return }
        accumulate(to: date)
        lastTick = date
    }

    mutating func cross(percent: Int) -> [Int] {
        guard articleID != nil, isActive, !flushed else { return [] }
        let valid = [25, 50, 75, 90]
        let newlyCrossed = valid.filter { percent >= $0 && crossedThresholds.insert($0).inserted }
        return newlyCrossed
    }

    mutating func flush(at date: Date, minimumSeconds: TimeInterval = 10) -> Int? {
        tick(at: date)
        guard !flushed, foregroundSeconds >= minimumSeconds else { return nil }
        flushed = true
        return Int(foregroundSeconds.rounded(.down))
    }

    mutating func end(at date: Date) -> Int? {
        let value = flush(at: date)
        articleID = nil
        isActive = false
        lastTick = nil
        return value
    }

    private mutating func accumulate(to date: Date) {
        guard let lastTick, date >= lastTick else { return }
        foregroundSeconds += date.timeIntervalSince(lastTick)
    }
}

/// A new navigation entry counts even when it has the same screen name.
struct SabqScreenVisitState {
    private(set) var owner: UUID?
    mutating func enter(_ id: UUID?) -> Bool {
        if let id, owner == id { return false }
        owner = id
        return true
    }
    mutating func leave(_ id: UUID) { if owner == id { owner = nil } }
}
