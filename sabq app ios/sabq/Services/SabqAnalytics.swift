import Foundation
import SwiftUI

// No-op analytics facade.
//
// Firebase Analytics was removed in build 9.0.6 (2026051806) while we
// investigate App Store auto-rejection that may have been triggered by
// the bundled FirebaseAnalytics / GoogleAppMeasurement /
// GoogleAdsOnDeviceConversion frameworks. Call sites stay unchanged so
// we can drop a replacement provider (or restore Firebase, post-fix)
// without touching every screen.
enum SabqAnalytics {
    static func log(_ name: String, parameters: [String: Any]? = nil) {}

    static func screen(_ name: String, screenClass: String? = nil) {}

    static func articleView(id: String, title: String, category: String?) {}

    static func opinionView(id: String, title: String, authorName: String) {}

    static func articleShare(id: String, platform: String) {}

    static func bookmarkToggle(id: String, isBookmarked: Bool) {}

    static func search(query: String) {}
}

// MARK: - SwiftUI screen-tracking modifier (kept for call-site compatibility)

private struct SabqScreenModifier: ViewModifier {
    let name: String
    let screenClass: String?

    func body(content: Content) -> some View {
        content
    }
}

extension View {
    func sabqScreen(_ name: String, class screenClass: String? = nil) -> some View {
        modifier(SabqScreenModifier(name: name, screenClass: screenClass))
    }
}
