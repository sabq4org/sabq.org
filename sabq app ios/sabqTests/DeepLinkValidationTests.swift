import Foundation
import Testing
@testable import sabq

/// يغطي حراسة `parseSabqDeepLink` (تدقيق الديون sec-1، 2026-09-23):
/// روابط sabq://، Universal Links، والمسار النسبي — يجب أن ترفض القيم
/// المشوَّهة/الخبيثة وتقبل الصيغ الصحيحة فقط.
@MainActor
struct DeepLinkValidationTests {
    private let store = NotificationsStore.shared

    // MARK: - sabq:// custom scheme

    @Test func acceptsValidArticleSlug() {
        let url = URL(string: "sabq://article/saudi-vision-2030")!
        #expect(store.parseSabqDeepLink(url: url) == .article(slug: "saudi-vision-2030"))
    }

    @Test func acceptsArabicSlug() {
        let url = URL(string: "sabq://article/%D8%B1%D8%A6%D9%8A%D8%B3-2030")!
        if case .article = store.parseSabqDeepLink(url: url) {
            // نجاح — slug عربي مقبول.
        } else {
            Issue.record("Arabic slug should be accepted")
        }
    }

    @Test func rejectsPathTraversalInSlug() {
        let url = URL(string: "sabq://article/..%2F..%2Fetc%2Fpasswd")!
        #expect(store.parseSabqDeepLink(url: url) == nil)
    }

    @Test func rejectsEmptySlug() {
        let url = URL(string: "sabq://article/")!
        #expect(store.parseSabqDeepLink(url: url) == nil)
    }

    @Test func rejectsUnknownHost() {
        let url = URL(string: "sabq://admin/1")!
        #expect(store.parseSabqDeepLink(url: url) == nil)
    }

    @Test func rejectsUnknownScheme() {
        let url = URL(string: "evil://article/some-slug")!
        #expect(store.parseSabqDeepLink(url: url) == nil)
    }

    @Test func rejectsScriptInjectionInSlug() {
        let url = URL(string: "sabq://article/%3Cscript%3Ealert(1)%3C/script%3E")!
        #expect(store.parseSabqDeepLink(url: url) == nil)
    }

    @Test func acceptsValidMatchId() {
        let url = URL(string: "sabq://match/123")!
        #expect(store.parseSabqDeepLink(url: url) == .match(id: 123))
    }

    @Test func rejectsNonNumericMatchId() {
        let url = URL(string: "sabq://match/abc")!
        #expect(store.parseSabqDeepLink(url: url) == nil)
    }

    @Test func rejectsNegativeMatchId() {
        let url = URL(string: "sabq://match/-1")!
        #expect(store.parseSabqDeepLink(url: url) == nil)
    }

    @Test func acceptsValidDraftToken() {
        let url = URL(string: "sabq://draft/abc123-def")!
        #expect(store.parseSabqDeepLink(url: url) == .draft(id: "abc123-def"))
    }

    // MARK: - Universal Links (https://sabq.org)

    @Test func acceptsUniversalLinkArticle() {
        let url = URL(string: "https://sabq.org/article/saudi-vision-2030")!
        #expect(store.parseSabqDeepLink(url: url) == .article(slug: "saudi-vision-2030"))
    }

    @Test func rejectsUniversalLinkWrongHost() {
        // مضيف مشابه لكنه ليس ضمن القائمة المسموحة — يجب أن يُرفض لا أن
        // يُقبل بافتراض "أي https معقول".
        let url = URL(string: "https://sabq.org.evil.com/article/x")!
        #expect(store.parseSabqDeepLink(url: url) == nil)
    }

    @Test func rejectsUniversalLinkMaliciousSlug() {
        let url = URL(string: "https://sabq.org/article/%3Cimg%20src=x%3E")!
        #expect(store.parseSabqDeepLink(url: url) == nil)
    }

    // MARK: - Relative path (push `deeplink` field)

    @Test func acceptsRelativeArticlePath() {
        let url = URL(string: "/article/saudi-vision-2030")!
        #expect(store.parseSabqDeepLink(url: url) == .article(slug: "saudi-vision-2030"))
    }

    @Test func rejectsRelativePathTraversal() {
        let url = URL(string: "/article/../../secret")!
        #expect(store.parseSabqDeepLink(url: url) == nil)
    }
}
