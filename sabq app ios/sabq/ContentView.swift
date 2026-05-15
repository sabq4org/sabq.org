import SwiftUI

struct ContentView: View {
    @State private var articlesStore = ArticlesStore()
    @State private var bookmarksStore = BookmarksStore()
    @State private var authStore = AuthStore()
    @State private var followedKeywords = FollowedKeywordsStore()
    @State private var selectedTab: AppTab = .home
    @State private var navigationPath = NavigationPath()

    var body: some View {
        ZStack(alignment: .bottom) {
            SabqTheme.background
                .ignoresSafeArea()

            NavigationStack(path: $navigationPath) {
                Group {
                    switch selectedTab {
                    case .home:
                        HomeFeedView()
                    case .explore:
                        ExploreView()
                    case .bookmarks:
                        BookmarksView()
                    case .profile:
                        SettingsView()
                    }
                }
                .id(selectedTab)
                .transition(.opacity.animation(.easeInOut(duration: 0.15)))
                .padding(.bottom, 80)
                .navigationDestination(for: Article.self) { article in
                    ArticleDetailView(article: article)
                }
                .navigationDestination(for: OpinionArticle.self) { opinion in
                    OpinionDetailView(opinion: opinion)
                }
                .navigationDestination(for: KeywordRoute.self) { route in
                    KeywordArticlesView(keyword: route.keyword)
                }
                .navigationDestination(for: AuthorRoute.self) { route in
                    AuthorArticlesView(authorName: route.name)
                }
                .navigationDestination(for: CalendarRoute.self) { _ in
                    CalendarView()
                }
                .navigationDestination(for: OmqRoute.self) { _ in
                    OmqListView()
                }
                .navigationDestination(for: OmqDetailRoute.self) { route in
                    OmqDetailView(id: route.id, initialTitle: route.title)
                }
                .navigationDestination(for: DailyBriefRoute.self) { _ in
                    DailyBriefView()
                }
                .navigationDestination(for: AudioNewslettersRoute.self) { _ in
                    AudioNewslettersView()
                }
                .navigationDestination(for: SearchRoute.self) { _ in
                    SearchView()
                }
                .navigationDestination(for: TrendingRoute.self) { _ in
                    TrendingView()
                }
                .navigationDestination(for: LiveCoverageRoute.self) { _ in
                    LiveCoverageView()
                }
                .navigationDestination(for: OpinionsRoute.self) { _ in
                    OpinionsView()
                }
            }
            .environment(articlesStore)
            .environment(bookmarksStore)
            .environment(authStore)
            .environment(followedKeywords)

            if navigationPath.isEmpty {
                SabqTabBar(selectedTab: $selectedTab)
                    .padding(.horizontal, 20)
                    .padding(.bottom, 2)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .animation(.easeInOut(duration: 0.2), value: navigationPath.isEmpty)
        .sabqRTL()
    }
}
