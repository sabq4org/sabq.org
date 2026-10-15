import Foundation
import SwiftUI
#if canImport(FirebaseCore) && canImport(FirebaseAnalytics)
import FirebaseCore
import FirebaseAnalytics
#endif

/// The only native analytics sender. Collection is disabled until the user
/// makes an explicit choice; this facade contains no Measurement Protocol.
enum SabqAnalytics {
    private static let consentKey = "sabq.analytics.consent"
    static let collectionDidChange = Notification.Name("SabqAnalyticsCollectionDidChange")
    private static let enabledKey = "sabq.analytics.enabled"
    private static let debugFlag = "-SabqAnalyticsDebug"
    private static let lock = NSLock()
    private static var cachedUserID: String?
    private static var reading = SabqReadingSessionState()
    private static var screenVisit = SabqScreenVisitState()
    private static var firebaseConfigured = false
    private static var appActive = true
    static var now: () -> Date = Date.init

    static var hasAnalyticsConsent: Bool { UserDefaults.standard.object(forKey: consentKey) != nil }
    static var consentGranted: Bool { UserDefaults.standard.bool(forKey: consentKey) }
    static var analyticsCollectionEnabled: Bool {
        SabqAnalyticsPrivacy.canCollect(consented: consentGranted, debug: isDebugBuild, debugOptIn: debugOptIn, configured: firebaseConfigured)
    }
    private static var isDebugBuild: Bool {
        #if DEBUG
        true
        #else
        false
        #endif
    }
    private static var debugOptIn: Bool { ProcessInfo.processInfo.arguments.contains(debugFlag) }

    static func configureIfAvailable() {
        UserDefaults.standard.set(false, forKey: enabledKey)
        #if DEBUG
        guard debugOptIn else { return }
        #endif
        #if canImport(FirebaseCore) && canImport(FirebaseAnalytics)
        guard FirebaseApp.app() == nil,
              let path = Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist"),
              let options = FirebaseOptions(contentsOfFile: path),
              options.googleAppID.range(of: #"^1:[0-9]+:ios:[a-fA-F0-9]+$"#, options: .regularExpression) != nil,
              let apiKey = options.apiKey, !apiKey.isEmpty,
              let bundleID = Bundle.main.bundleIdentifier, options.bundleID == bundleID,
              let projectID = options.projectID, !projectID.isEmpty else { return }
        FirebaseApp.configure(options: options)
        firebaseConfigured = true
        Analytics.setAnalyticsCollectionEnabled(false)
        // A prior explicit grant may be restored only after Firebase is
        // configured; no event is replayed while collection is re-enabled.
        setFirebaseConsent(consentGranted)
        setAnalyticsCollectionEnabled(consentGranted)
        #endif
    }

    /// Consent is persisted before collection is enabled. Rejecting/revoking
    /// also clears the Firebase user identifier immediately.
    static func setAnalyticsConsent(_ enabled: Bool) {
        UserDefaults.standard.set(enabled, forKey: consentKey)
        resetReading()
        setFirebaseConsent(analyticsCollectionEnabled)
        setAnalyticsCollectionEnabled(enabled)
        setUserIDInSDK(analyticsCollectionEnabled ? cachedUserID : nil)
        NotificationCenter.default.post(name: collectionDidChange, object: nil)
    }

    static func setAnalyticsCollectionEnabled(_ enabled: Bool) {
        let value = enabled && consentGranted
        UserDefaults.standard.set(value, forKey: enabledKey)
        if !value { setUserIDInSDK(nil) }
        #if canImport(FirebaseCore) && canImport(FirebaseAnalytics)
        guard FirebaseApp.app() != nil else { return }
        Analytics.setAnalyticsCollectionEnabled(value && analyticsCollectionEnabled)
        #endif
    }

    /// Scene lifecycle boundary; background time is never counted as reading.
    static func setAppActive(_ active: Bool) {
        lock.lock(); defer { lock.unlock() }
        appActive = active
        reading.setActive(active, at: now())
    }

    static func screen(_ name: String, screenClass: String? = nil, ownerID: UUID? = nil) {
        guard SabqAnalyticsPrivacy.isPublicScreen(name) else { return }
        lock.lock()
        guard screenVisit.enter(ownerID) else { lock.unlock(); return }
        lock.unlock()
        var params: [String: Any] = ["screen_name": name]
        if let screenClass { params["screen_class"] = screenClass }
        log("screen_view", parameters: params)
    }

    static func deactivateScreen(ownerID: UUID) {
        lock.lock(); defer { lock.unlock() }
        screenVisit.leave(ownerID)
    }

    static func articleView(id: String, title: String, category: String?) {
        var p: [String: Any] = ["article_id": id, "article_title": truncate(title, 100), "content_type": "news"]
        if let category, !category.isEmpty { p["category"] = category }
        log("article_view", parameters: p)
    }
    static func opinionView(id: String, title: String, authorName: String) {
        log("opinion_view", parameters: ["article_id": id, "article_title": truncate(title, 100), "author": truncate(authorName, 80), "content_type": "opinion"])
    }
    static func articleShare(id: String, platform: String) { log("share", parameters: ["article_id": id, "method": platform, "stage": "completed"]) }
    static func bookmarkToggle(id: String, isBookmarked: Bool) { log("bookmark_toggle", parameters: ["article_id": id, "bookmarked": isBookmarked ? 1 : 0]) }
    static func search(query: String) { searchSucceeded(query: query) }
    static func articleLike(id: String, liked: Bool) { log("article_like", parameters: ["article_id": id, "liked": liked ? 1 : 0]) }
    static func articleComment(slug: String, parentId: String?) {
        var p: [String: Any] = ["article_slug": truncate(slug, 100)]
        if let parentId { p["parent_comment_id"] = parentId }
        log("article_comment", parameters: p)
    }
    static func signUp(method: String) { log("sign_up", parameters: ["method": method]) }
    static func searchSucceeded(query: String) { log("search", parameters: ["search_term": truncate(query, 100)]) }
    static func shareIntent(articleId: String, method: String? = nil) {
        var p: [String: Any] = ["article_id": articleId]; if let method { p["method"] = method }; log("share_intent", parameters: p)
    }
    static func shareCompleted(articleId: String, stage: String = "completed", method: String? = nil) {
        var p: [String: Any] = ["article_id": articleId, "stage": (stage == "ios_lite_completion" || stage == "ios_completion") ? "completed" : stage]
        if let method { p["method"] = method }; log("share", parameters: p)
    }
    static func deepLinkOpen(kind: String, source: String, articleId: String? = nil) {
        var p: [String: Any] = ["kind": kind, "source": source]; if let articleId { p["article_id"] = articleId }; log("deep_link_open", parameters: p)
    }
    static func beginReading(articleId: String) {
        guard analyticsCollectionEnabled else { return }
        lock.lock(); reading.begin(articleID: articleId, at: now()); reading.setActive(appActive, at: now()); lock.unlock()
    }
    static func updateReading(articleId: String, percent: Int) {
        lock.lock(); reading.tick(at: now()); let crossed = reading.articleID == articleId ? reading.cross(percent: percent) : []; lock.unlock()
        for threshold in crossed { log("scroll_depth", parameters: ["article_id": articleId, "percent_scrolled": threshold]) }
    }
    static func endReading(articleId: String) {
        lock.lock(); let seconds = reading.articleID == articleId ? reading.end(at: now()) : nil; lock.unlock()
        if let seconds { log("reading_time", parameters: ["article_id": articleId, "reading_time_seconds": seconds]) }
    }
    static func login(method: String) { log("login", parameters: ["method": method]) }
    static func liteModeActivated(trigger: String) { log("lite_mode_activated", parameters: ["trigger": trigger]) }
    static func liteModeDeactivated() { log("lite_mode_deactivated") }
    static func notificationOpen(type: String, articleId: String?) {
        var p: [String: Any] = ["notification_type": type]; if let articleId { p["article_id"] = articleId }; log("push_open", parameters: p)
    }

    static func log(_ name: String, parameters: [String: Any]? = nil) {
        guard analyticsCollectionEnabled else { return }
        guard let safe = SabqAnalyticsPrivacy.sanitizeEvent(name, parameters: parameters) else { return }
        #if canImport(FirebaseCore) && canImport(FirebaseAnalytics)
        guard FirebaseApp.app() != nil, analyticsCollectionEnabled else { return }
        Analytics.logEvent(name, parameters: safe)
        #endif
    }

    static func setUserId(_ id: String?) {
        cachedUserID = id.flatMap { SabqAnalyticsPrivacy.safeIdentifier($0) ? $0 : nil }
        if cachedUserID == nil {
            // Clearing is safe and must not be blocked by the collection guard;
            // otherwise logout/revocation leaves Firebase's previous UID set.
            setUserIDInSDK(nil)
            return
        }
        guard hasAnalyticsConsent, analyticsCollectionEnabled else { return }
        setUserIDInSDK(cachedUserID)
    }
    private static func setFirebaseConsent(_ granted: Bool) {
        #if canImport(FirebaseCore) && canImport(FirebaseAnalytics)
        guard FirebaseApp.app() != nil else { return }
        Analytics.setConsent([
            .analyticsStorage: granted ? .granted : .denied,
            .adStorage: .denied,
            .adUserData: .denied,
            .adPersonalization: .denied,
        ])
        #endif
    }
    private static func resetReading() { lock.lock(); reading = SabqReadingSessionState(); lock.unlock() }
    private static func setUserIDInSDK(_ id: String?) {
        #if canImport(FirebaseCore) && canImport(FirebaseAnalytics)
        guard FirebaseApp.app() != nil else { return }
        // The ID is only reached through an explicit consent + collection
        // path. DebugView itself is opt-in via -SabqAnalyticsDebug.
        Analytics.setUserID(id)
        #endif
    }
    private static func truncate(_ value: String, _ max: Int) -> String { value.count <= max ? value : String(value.prefix(max)) }
}

private struct SabqScreenModifier: ViewModifier {
    let name: String; let screenClass: String?
    @State private var ownerID = UUID()
    @State private var isVisible = false
    func body(content: Content) -> some View {
        content
            .onAppear { isVisible = true; SabqAnalytics.screen(name, screenClass: screenClass, ownerID: ownerID) }
            .onDisappear { isVisible = false; SabqAnalytics.deactivateScreen(ownerID: ownerID) }
            .onReceive(NotificationCenter.default.publisher(for: SabqAnalytics.collectionDidChange)) { _ in
                guard isVisible, SabqAnalytics.analyticsCollectionEnabled else { return }
                SabqAnalytics.deactivateScreen(ownerID: ownerID)
                SabqAnalytics.screen(name, screenClass: screenClass, ownerID: ownerID)
            }
    }
}
extension View {
    func sabqScreen(_ name: String, class screenClass: String? = nil) -> some View { modifier(SabqScreenModifier(name: name, screenClass: screenClass)) }
}
