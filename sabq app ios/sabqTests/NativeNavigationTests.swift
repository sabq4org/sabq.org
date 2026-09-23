import Testing
import SwiftUI
@testable import sabq

@MainActor
struct NativeNavigationTests {
    @Test func switchingTabsPreservesEachRoute() {
        let state = SabqNavigationState()
        state.paths[.home, default: NavigationPath()].append(ArticleSlugRoute(slug: "first-article"))
        state.selectedTab = .explore
        state.paths[.explore, default: NavigationPath()].append(KeywordRoute(keyword: "الرياض"))
        state.selectedTab = .home
        #expect(state.paths[.home]?.count == 1)
        #expect(state.paths[.explore]?.count == 1)
        state.paths[.home]?.removeLast()
        #expect(state.paths[.home]?.isEmpty == true)
        #expect(state.paths[.explore]?.count == 1)
    }

    // MARK: - جسر الطي/الفتح (iPhone Duo)

    @Test func foldingPushesReaderArticleOntoStack() {
        let state = SabqNavigationState()
        let article = Article.placeholder(slug: "reader-open")
        state.openInReader(article)
        #expect(state.paths[.home]?.isEmpty ?? true)

        state.homeLayoutDidChange(isWide: false)
        #expect(state.paths[.home]?.count == 1)
        #expect(state.homeReaderArticle?.slug == "reader-open")
    }

    @Test func unfoldingRemovesOnlyTheBridgedArticle() {
        let state = SabqNavigationState()
        state.openInReader(Article.placeholder(slug: "reader-open"))
        state.homeLayoutDidChange(isWide: false)
        #expect(state.paths[.home]?.count == 1)

        state.homeLayoutDidChange(isWide: true)
        #expect(state.paths[.home]?.isEmpty == true)
        #expect(state.homeReaderArticle?.slug == "reader-open")
    }

    @Test func unfoldingKeepsDeeperNavigationAboveReader() {
        let state = SabqNavigationState()
        state.openInReader(Article.placeholder(slug: "reader-open"))
        state.homeLayoutDidChange(isWide: false)
        // المستخدم تابع من الخبر إلى كلمة مفتاحية وهو مطوي.
        state.paths[.home, default: NavigationPath()].append(KeywordRoute(keyword: "نيوم"))
        #expect(state.paths[.home]?.count == 2)

        state.homeLayoutDidChange(isWide: true)
        #expect(state.paths[.home]?.count == 2)
    }

    @Test func foldingWithoutExplicitReaderArticleLeavesStackEmpty() {
        let state = SabqNavigationState()
        #expect(state.homeReaderArticle == nil)
        state.homeLayoutDidChange(isWide: false)
        #expect(state.paths[.home]?.isEmpty ?? true)
    }

    @Test func foldingWithExistingStackDoesNotDuplicate() {
        let state = SabqNavigationState()
        state.openInReader(Article.placeholder(slug: "reader-open"))
        state.paths[.home, default: NavigationPath()].append(KeywordRoute(keyword: "نيوم"))
        state.homeLayoutDidChange(isWide: false)
        #expect(state.paths[.home]?.count == 1)
        state.homeLayoutDidChange(isWide: true)
        #expect(state.paths[.home]?.count == 1)
    }

    @Test func unfoldingAfterUserPoppedBridgedArticleIsHarmless() {
        let state = SabqNavigationState()
        state.openInReader(Article.placeholder(slug: "reader-open"))
        state.homeLayoutDidChange(isWide: false)
        state.paths[.home]?.removeLast()
        state.homeLayoutDidChange(isWide: true)
        #expect(state.paths[.home]?.isEmpty == true)
        #expect(state.homeReaderArticle?.slug == "reader-open")
    }

    @Test func logoutClearsAllPrivateRoutes() {
        let state = SabqNavigationState()
        state.selectedTab = .profile
        state.paths[.profile, default: NavigationPath()].append(DraftDeepLinkRoute(articleId: "private-draft"))
        state.paths[.home, default: NavigationPath()].append(ArticleRevisionsRoute())
        state.reset()
        #expect(state.selectedTab == .home)
        #expect(state.paths.isEmpty)
    }
}
