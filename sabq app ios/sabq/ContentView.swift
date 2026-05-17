import SwiftUI

struct ContentView: View {
    @State private var articlesStore = ArticlesStore()
    @State private var bookmarksStore = BookmarksStore()
    @State private var authStore = AuthStore()
    @State private var followedKeywords = FollowedKeywordsStore()
    @State private var selectedTab: AppTab = .home
    @State private var navigationPath = NavigationPath()
    /// Singleton owns the latest deep link captured from a notification tap
    /// (cold start, foreground, or background restore). We watch it via the
    /// onChange handler below and translate it into a NavigationPath entry.
    @State private var notificationsStore = NotificationsStore.shared
    @Environment(\.scenePhase) private var scenePhase

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
                .navigationDestination(for: MomentByMomentRoute.self) { _ in
                    MomentByMomentView()
                }
                .navigationDestination(for: OpinionsRoute.self) { _ in
                    OpinionsView()
                }
                .navigationDestination(for: EditorialNotificationsRoute.self) { _ in
                    EditorialNotificationsView()
                }
                .navigationDestination(for: ArticleSlugRoute.self) { route in
                    // Wraps a slug-based deep link in the existing
                    // article detail view by hydrating a minimal Article
                    // shell — ArticleDetailView already refetches the
                    // full payload from the slug via NewsService.
                    ArticleDetailView(article: Article.placeholder(slug: route.slug))
                }
                .navigationDestination(for: OpinionSlugRoute.self) { route in
                    // Same pattern as ArticleSlugRoute but for opinion
                    // articles. OpinionDetailView's `.task { loadOpinion() }`
                    // hydrates the real payload (title, body, author, etc.)
                    // from `/api/opinion/<slug>` on first appear.
                    OpinionDetailView(opinion: OpinionArticle.placeholder(slug: route.slug))
                }
                .navigationDestination(for: DraftDeepLinkRoute.self) { route in
                    // For now, route to the editorial notifications screen
                    // which is the closest "manage your draft" surface
                    // we have. When a real draft preview view ships we
                    // swap this in.
                    EditorialNotificationsView()
                        .id(route.articleId)
                }
            }
            .environment(articlesStore)
            .environment(bookmarksStore)
            .environment(authStore)
            .environment(followedKeywords)
            .onChange(of: notificationsStore.pendingDeepLink) { _, newLink in
                guard let link = newLink else { return }
                handleDeepLink(link)
                // Consume so a re-render doesn't navigate twice.
                notificationsStore.pendingDeepLink = nil
            }
            .onAppear {
                // Catch deep links captured before this view rendered (cold
                // start from a notification tap).
                if let link = notificationsStore.pendingDeepLink {
                    handleDeepLink(link)
                    notificationsStore.pendingDeepLink = nil
                }
            }
            .onChange(of: scenePhase) { _, newPhase in
                // When the app returns to the foreground (after being in
                // background long enough that push handlers didn't fire),
                // refresh the unread editorial-notification count so the
                // header bell's red dot reflects the latest server state.
                if newPhase == .active && authStore.isLoggedIn {
                    Task { await notificationsStore.refreshUnreadCount() }
                }
            }

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

    /// Translate a parsed deep link from a notification tap into a concrete
    /// navigation. `article` → ArticleDetailView via slug, `draft` /
    /// `feedback` → the editorial notifications screen so the user lands on
    /// the entry that describes the editorial action.
    private func handleDeepLink(_ link: NotificationDeepLink) {
        // Make sure we're on the home tab — the navigation stack only
        // exists in the home flow.
        if selectedTab != .home {
            selectedTab = .home
        }
        switch link {
        case .article(let slug):
            navigationPath.append(ArticleSlugRoute(slug: slug))
        case .opinion(let slug):
            navigationPath.append(OpinionSlugRoute(slug: slug))
        case .draft(let id):
            navigationPath.append(EditorialNotificationsRoute())
            _ = id // reserved for future per-draft preview
        case .feedback(let id):
            navigationPath.append(EditorialNotificationsRoute())
            _ = id
        }
    }
}

// MARK: - Notification-driven routes

/// Opens the EditorialNotificationsView from a deep link (or any caller
/// that wants it on the navigation stack rather than as a settings push).
struct EditorialNotificationsRoute: Hashable {}

/// Opens an article by slug — used by published-event deep links where
/// only the slug is available. ArticleDetailView's existing loader
/// hydrates the full payload from the slug.
struct ArticleSlugRoute: Hashable {
    let slug: String
}

/// Opinion equivalent of `ArticleSlugRoute`. Backend `sabq://opinion/<slug>`
/// deep links land here so the user gets the proper OpinionDetailView
/// instead of the article view (which refuses opinion payloads).
struct OpinionSlugRoute: Hashable {
    let slug: String
}

/// Placeholder route for draft/feedback deep links. Currently routes to
/// the editorial notifications view; future work can swap it for a
/// dedicated in-app draft preview.
struct DraftDeepLinkRoute: Hashable {
    let articleId: String
}
