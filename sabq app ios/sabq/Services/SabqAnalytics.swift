import Foundation
import SwiftUI
import FirebaseAnalytics

// Thin facade over Firebase Analytics so call sites don't have to import
// `FirebaseAnalytics` directly and so we can swap providers (or no-op in
// previews / unit tests) without touching the rest of the app.
//
// All events flow to the linked GA4 property (`sabq-prod`, iOS stream
// 14892913316) inside Firebase. Mirrors the helpers in
// client/src/lib/analytics.ts so iOS + web report the same event names.
enum SabqAnalytics {
    /// Log a fire-and-forget event. Empty `name` is dropped silently.
    static func log(_ name: String, parameters: [String: Any]? = nil) {
        guard !name.isEmpty else { return }
        Analytics.logEvent(name, parameters: parameters)
    }

    /// Log a screen view. Firebase auto-collects this for UIKit, but
    /// SwiftUI views need an explicit call. Wire via `.sabqScreen(...)`
    /// on any screen-root view.
    static func screen(_ name: String, screenClass: String? = nil) {
        log(AnalyticsEventScreenView, parameters: [
            AnalyticsParameterScreenName: name,
            AnalyticsParameterScreenClass: screenClass ?? name,
        ])
    }

    // MARK: - Domain events (match web's trackEvent helpers)

    static func articleView(id: String, title: String, category: String?) {
        log("article_view", parameters: [
            "article_id": id,
            "article_title": title,
            "category": category ?? "",
        ])
    }

    static func opinionView(id: String, title: String, authorName: String) {
        log("opinion_view", parameters: [
            "article_id": id,
            "article_title": title,
            "author": authorName,
        ])
    }

    static func articleShare(id: String, platform: String) {
        log("share", parameters: [
            "method": platform,
            "content_type": "article",
            "item_id": id,
        ])
    }

    static func bookmarkToggle(id: String, isBookmarked: Bool) {
        log(isBookmarked ? "bookmark_add" : "bookmark_remove", parameters: [
            "item_id": id,
        ])
    }

    static func search(query: String) {
        log(AnalyticsEventSearch, parameters: [
            AnalyticsParameterSearchTerm: query,
        ])
    }
}

// MARK: - SwiftUI screen-tracking modifier

private struct SabqScreenModifier: ViewModifier {
    let name: String
    let screenClass: String?

    func body(content: Content) -> some View {
        content.onAppear {
            SabqAnalytics.screen(name, screenClass: screenClass)
        }
    }
}

extension View {
    /// Track this view as a Firebase / GA4 screen. Call on the root view
    /// of each navigation destination (Home, Article, Opinion, etc.).
    /// The `screenClass` defaults to `name` when omitted.
    func sabqScreen(_ name: String, class screenClass: String? = nil) -> some View {
        modifier(SabqScreenModifier(name: name, screenClass: screenClass))
    }
}
