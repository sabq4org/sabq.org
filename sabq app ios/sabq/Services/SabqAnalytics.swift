import Foundation
import SwiftUI

/// GA4 Measurement Protocol client — sends events to Google
/// Analytics via a plain HTTPS POST to google-analytics.com/mp/collect.
///
/// No third-party SDK, no bundled framework, no privacy manifest
/// gymnastics — just a network call. Same call-site surface as the
/// previous no-op facade so we did not need to touch any screen.
///
/// Configuration lives in Info.plist (added as Xcode build settings):
///   - GA4_MEASUREMENT_ID  → e.g. G-XXXXXXXXXX
///   - GA4_API_SECRET      → from GA admin > Data Streams >
///                             Measurement Protocol API secrets
/// If either is missing, every call becomes a no-op silently — same
/// behaviour as before this file was filled in, so a developer build
/// without secrets does not error.
enum SabqAnalytics {
    // ---------- Public API (call-site compatible) ----------

    static func screen(_ name: String, screenClass: String? = nil) {
        var params: [String: Any] = ["screen_name": name]
        if let cls = screenClass { params["screen_class"] = cls }
        log("screen_view", parameters: params)
    }

    static func articleView(id: String, title: String, category: String?) {
        var params: [String: Any] = [
            "article_id": id,
            "article_title": truncated(title, 100),
            "content_type": "news",
        ]
        if let category, !category.isEmpty { params["category"] = category }
        log("article_view", parameters: params)
    }

    static func opinionView(id: String, title: String, authorName: String) {
        log("opinion_view", parameters: [
            "article_id": id,
            "article_title": truncated(title, 100),
            "author": truncated(authorName, 80),
            "content_type": "opinion",
        ])
    }

    static func articleShare(id: String, platform: String) {
        log("share", parameters: ["article_id": id, "method": platform])
    }

    static func bookmarkToggle(id: String, isBookmarked: Bool) {
        log("bookmark_toggle", parameters: [
            "article_id": id,
            "bookmarked": isBookmarked,
        ])
    }

    static func search(query: String) {
        log("search", parameters: ["search_term": truncated(query, 100)])
    }

    // ---------- New events (added per user request, 2026-05-21) ----------

    /// React/unreact on an article. Logged once per state change so a
    /// double-tap that toggles off + on counts as two events.
    static func articleLike(id: String, liked: Bool) {
        log("article_like", parameters: [
            "article_id": id,
            "liked": liked,
        ])
    }

    /// Comment submitted (any depth — reply or root).  only
    /// included when present so threading is queryable in GA.
    static func articleComment(slug: String, parentId: String?) {
        var params: [String: Any] = ["article_slug": truncated(slug, 100)]
        if let parentId { params["parent_comment_id"] = parentId }
        log("article_comment", parameters: params)
    }

    /// Successful sign-in.  is the provider — "email", "apple",
    /// "google" — matches the GA4 recommended "login" event shape.
    static func login(method: String) {
        log("login", parameters: ["method": method])
    }

    /// User tapped a push notification and the deep link routed them in.
    ///  is the editorial event class ("published" / "scheduled" /
    /// "needs_revision" / "rejected" / etc.) so we can see which
    /// notifications actually drive opens.
    /// "سبق Lite" mode lifecycle. `trigger` is "manual" or "auto".
    /// Helps editorial see whether readers are opting in deliberately
    /// vs. the auto-detector flipping them on.
    static func liteModeActivated(trigger: String) {
        log("lite_mode_activated", parameters: ["trigger": trigger])
    }

    static func liteModeDeactivated() {
        log("lite_mode_deactivated", parameters: nil)
    }

    static func notificationOpen(type: String, articleId: String?) {
        var params: [String: Any] = ["notification_type": type]
        if let articleId { params["article_id"] = articleId }
        log("notification_open", parameters: params)
    }

    // ---------- Core: log() — fire-and-forget HTTPS POST ----------

    static func log(_ name: String, parameters: [String: Any]? = nil) {
        guard let measurementId, let apiSecret else { return }
        let cid = clientId
        let uid = userId
        let (sid, engagementMsec) = sessionInfo()

        var params = sanitizedParams(parameters)
        params["session_id"] = sid
        params["engagement_time_msec"] = String(engagementMsec)
        #if DEBUG
        params["debug_mode"] = 1
        #endif

        let event: [String: Any] = ["name": name, "params": params]
        var payload: [String: Any] = [
            "client_id": cid,
            "events": [event],
            "non_personalized_ads": true,
            "timestamp_micros": Int(Date().timeIntervalSince1970 * 1_000_000),
        ]
        if let uid { payload["user_id"] = uid }
        send(payload: payload, measurementId: measurementId, apiSecret: apiSecret)
    }

    // ---------- Session management ----------

    private static let sessionLock = NSLock()
    private static var _sessionId: String?
    private static var _lastEventDate: Date?
    /// 30 min of inactivity rolls a new session — same default as GA4.
    private static let sessionTimeout: TimeInterval = 30 * 60
    /// Cap engagement_time_msec at 30s — a longer gap means the app was
    /// backgrounded, not the user actively reading.
    private static let maxEngagementMsec = 30_000

    private static func sessionInfo() -> (sessionId: String, engagementMsec: Int) {
        sessionLock.lock()
        defer { sessionLock.unlock() }
        let now = Date()
        let lastDate = _lastEventDate
        let idle = lastDate.map { now.timeIntervalSince($0) } ?? .infinity
        if _sessionId == nil || idle > sessionTimeout {
            _sessionId = String(Int(now.timeIntervalSince1970))
        }
        let engagement: Int = {
            guard let last = lastDate else { return 1 }
            let ms = Int(now.timeIntervalSince(last) * 1000)
            return max(1, min(ms, maxEngagementMsec))
        }()
        _lastEventDate = now
        return (_sessionId!, engagement)
    }

    // ---------- Config helpers ----------

    private static var measurementId: String? {
        let id = Bundle.main.object(forInfoDictionaryKey: "GA4_MEASUREMENT_ID") as? String
        return id?.isEmpty == false ? id : nil
    }

    private static var apiSecret: String? {
        let s = Bundle.main.object(forInfoDictionaryKey: "GA4_API_SECRET") as? String
        return s?.isEmpty == false ? s : nil
    }

    /// Per-install UUID — persisted in UserDefaults so the same device
    /// stays the same client_id across launches but no user/IDFA is
    /// ever sent. No ATT prompt required.
    private static var clientId: String {
        let key = "sabq_ga4_client_id"
        if let existing = UserDefaults.standard.string(forKey: key) { return existing }
        let id = UUID().uuidString
        UserDefaults.standard.set(id, forKey: key)
        return id
    }

    /// First-party Sabq user id when signed in. Lets us connect events
    /// across devices for the same logged-in member. Set externally so
    /// AuthStore does not need to import this file.
    private static var _userId: String?
    static func setUserId(_ id: String?) { _userId = id?.isEmpty == false ? id : nil }
    private static var userId: String? { _userId }

    // ---------- HTTP ----------

    private static let endpoint = URL(string: "https://www.google-analytics.com/mp/collect")!
    private static let session: URLSession = {
        let cfg = URLSessionConfiguration.ephemeral
        cfg.timeoutIntervalForRequest = 6
        cfg.timeoutIntervalForResource = 8
        return URLSession(configuration: cfg)
    }()

    private static func send(payload: [String: Any], measurementId: String, apiSecret: String) {
        var components = URLComponents(url: endpoint, resolvingAgainstBaseURL: false)!
        components.queryItems = [
            URLQueryItem(name: "measurement_id", value: measurementId),
            URLQueryItem(name: "api_secret", value: apiSecret),
        ]
        guard let url = components.url else { return }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try? JSONSerialization.data(withJSONObject: payload, options: [])
        // Fire-and-forget. We do not retry — losing the occasional event
        // is fine, the system is for trend signal not auditing.
        session.dataTask(with: req).resume()
    }

    private static func sanitizedParams(_ raw: [String: Any]?) -> [String: Any] {
        guard let raw else { return [:] }
        var out: [String: Any] = [:]
        for (k, v) in raw {
            // GA4 param keys must be alphanumeric/underscore, ≤40 chars.
            let key = k.lowercased().replacingOccurrences(of: "-", with: "_")
            if v is String || v is Int || v is Double || v is Bool {
                out[key] = v
            } else {
                out[key] = String(describing: v)
            }
        }
        return out
    }

    private static func truncated(_ s: String, _ max: Int) -> String {
        s.count <= max ? s : String(s.prefix(max))
    }
}

// MARK: - SwiftUI screen-tracking modifier

private struct SabqScreenModifier: ViewModifier {
    let name: String
    let screenClass: String?

    func body(content: Content) -> some View {
        content.onAppear { SabqAnalytics.screen(name, screenClass: screenClass) }
    }
}

extension View {
    func sabqScreen(_ name: String, class screenClass: String? = nil) -> some View {
        modifier(SabqScreenModifier(name: name, screenClass: screenClass))
    }
}
