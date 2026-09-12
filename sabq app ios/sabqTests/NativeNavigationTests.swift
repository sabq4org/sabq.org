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
