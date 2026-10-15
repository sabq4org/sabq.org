import Foundation
import Testing
@testable import sabq

struct SabqAnalyticsCoreTests {
    @Test func screenOwnershipCountsRapidNewArticlesAndBackWithoutDuplicateAppear() {
        var state = SabqScreenVisitState()
        let first = UUID(), second = UUID()
        let firstEntry = state.enter(first)
        let duplicateFirst = state.enter(first)
        let secondEntry = state.enter(second)
        state.leave(first)
        let duplicateSecond = state.enter(second)
        state.leave(second)
        let backEntry = state.enter(first)
        #expect(firstEntry && secondEntry && backEntry)
        #expect(!duplicateFirst && !duplicateSecond)
    }

    @Test func pushUsesCustomNameAndNeverLogsReservedNotificationName() {
        #expect(SabqAnalyticsPrivacy.sanitizeEvent("notification_open", parameters: ["notification_type": "article"]) == nil)
        #expect(SabqAnalyticsPrivacy.sanitizeEvent("push_open", parameters: ["notification_type": "article"]) != nil)
    }

    @Test func collectionRequiresConsentConfigurationAndDebugOptIn() {
        #expect(!SabqAnalyticsPrivacy.canCollect(consented: false, debug: false, debugOptIn: false, configured: true))
        #expect(!SabqAnalyticsPrivacy.canCollect(consented: true, debug: false, debugOptIn: false, configured: false))
        #expect(!SabqAnalyticsPrivacy.canCollect(consented: true, debug: true, debugOptIn: false, configured: true))
        #expect(SabqAnalyticsPrivacy.canCollect(consented: true, debug: true, debugOptIn: true, configured: true))
        #expect(SabqAnalyticsPrivacy.canCollect(consented: true, debug: false, debugOptIn: false, configured: true))
    }

    @Test func sensitiveSearchAndUserIdentifiersAreRejected() {
        for query in ["test@example.com", "test%2540example.com", "اتصل ٠٥٠١٢٣٤٥٦٧", "call +966 50 123 4567", "token%3Dsynthetic"] {
            #expect(SabqAnalyticsPrivacy.sanitizeEvent("search", parameters: ["search_term": query]) == nil)
        }
        #expect(!SabqAnalyticsPrivacy.safeIdentifier("test@example.com"))
        #expect(SabqAnalyticsPrivacy.safeIdentifier("123e4567-e89b-12d3-a456-426614174000"))
        #expect(SabqAnalyticsPrivacy.sanitizeEvent("search", parameters: ["search_term": "رؤية 2030"]) != nil)
    }
    @Test func bodyDepthExcludesHeaderAndFooterAndSupportsShortContent() {
        #expect(SabqAnalyticsPrivacy.readingDepth(bodyTop: 900, bodyHeight: 1000, viewportHeight: 800) == 0)
        #expect(SabqAnalyticsPrivacy.readingDepth(bodyTop: 300, bodyHeight: 1000, viewportHeight: 800) == 0.5)
        #expect(SabqAnalyticsPrivacy.readingDepth(bodyTop: -500, bodyHeight: 1000, viewportHeight: 800) == 1)
        #expect(SabqAnalyticsPrivacy.readingDepth(bodyTop: 200, bodyHeight: 300, viewportHeight: 800) == 1)
    }

    @Test func identifiersNeedStrictSafeShapeAndNumbersMustBeFinite() {
        #expect(SabqAnalyticsPrivacy.sanitizeEvent("article_view", parameters: ["article_id": "123_ABC", "article_title": "خبر"]) != nil)
        #expect(SabqAnalyticsPrivacy.sanitizeEvent("article_view", parameters: ["article_id": "123/ABC", "article_title": "خبر"]) == nil)
        #expect(SabqAnalyticsPrivacy.sanitizeEvent("article_view", parameters: ["article_id": "a@b", "article_title": "خبر"]) == nil)
        #expect(SabqAnalyticsPrivacy.sanitizeEvent("scroll_depth", parameters: ["article_id": "a1", "percent_scrolled": Double.nan]) == nil)
    }
    @Test func allowlistKeepsArticleIdentifiersButDropsPIIAndObjects() {
        let values: [String: Any] = [
            "article_id": 123456789,
            "article_title": "عنوان الخبر",
            "email": "reader@example.com",
            "page_url": "https://sabq.org/article/a?token=secret",
            "nested": ["email": "reader@example.com"],
        ]
        let result = SabqAnalyticsPrivacy.sanitizeEvent("article_view", parameters: values)!
        #expect((result["article_id"] as? NSNumber)?.intValue == 123456789)
        #expect(result["article_title"] as? String == "عنوان الخبر")
        #expect(result["email"] == nil)
        #expect(result["page_url"] == nil)
        #expect(result["nested"] == nil)
    }

    @Test func unknownEventAndInvalidParametersAreDropped() {
        #expect(SabqAnalyticsPrivacy.sanitizeEvent("arbitrary_event", parameters: [:]) == nil)
        let result = SabqAnalyticsPrivacy.sanitizeEvent("login", parameters: ["method": "email", "extra": "ignored"])!
        #expect(result.count == 1)
        #expect(result["method"] as? String == "email")
    }

    @Test func publicScreensExcludePrivateRoutes() {
        #expect(SabqAnalyticsPrivacy.isPublicScreen("Home"))
        #expect(!SabqAnalyticsPrivacy.isPublicScreen("More"))
        #expect(!SabqAnalyticsPrivacy.isPublicScreen("Bookmarks"))
        #expect(!SabqAnalyticsPrivacy.isPublicScreen("AdminDashboard"))
        #expect(!SabqAnalyticsPrivacy.isPublicScreen("Profile"))
    }

    @Test func readingCountsForegroundOnlyAndFlushesOnce() {
        var state = SabqReadingSessionState()
        let start = Date(timeIntervalSince1970: 1_000)
        state.begin(articleID: "article-1", at: start)
        state.tick(at: start.addingTimeInterval(4))
        state.setActive(false, at: start.addingTimeInterval(5))
        state.setActive(true, at: start.addingTimeInterval(105))
        state.tick(at: start.addingTimeInterval(112))
        #expect(state.foregroundSeconds == 12)
        #expect(state.flush(at: start.addingTimeInterval(112)) == 12)
        #expect(state.flush(at: start.addingTimeInterval(200)) == nil)
    }

    @Test func backgroundDoesNotCrossReadingTimeOrDepth() {
        var state = SabqReadingSessionState()
        let start = Date(timeIntervalSince1970: 1_000)
        state.begin(articleID: "a1", at: start)
        state.setActive(false, at: start.addingTimeInterval(3))
        #expect(state.flush(at: start.addingTimeInterval(103)) == nil)
        #expect(state.cross(percent: 90).isEmpty)
        state.setActive(true, at: start.addingTimeInterval(103))
        state.tick(at: start.addingTimeInterval(112))
        #expect(state.flush(at: start.addingTimeInterval(112)) == 12)
    }

    @Test func readingThresholdsAreMonotonicAndPerVisit() {
        var state = SabqReadingSessionState()
        let now = Date(timeIntervalSince1970: 1_000)
        state.begin(articleID: "article-1", at: now)
        #expect(state.cross(percent: 50) == [25, 50])
        #expect(state.cross(percent: 90) == [75, 90])
        #expect(state.cross(percent: 100).isEmpty)
        state.begin(articleID: "article-2", at: now)
        #expect(state.cross(percent: 25) == [25])
    }
}
