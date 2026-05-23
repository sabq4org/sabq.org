import SwiftUI

struct ContentView: View {
    @State private var articlesStore = ArticlesStore()
    @State private var bookmarksStore = BookmarksStore()
    @State private var likesStore = LikesStore()
    @State private var authStore = AuthStore()
    @State private var followedKeywords = FollowedKeywordsStore()
    /// Owns the writer's revision-pending article list. Refreshed on
    /// app foreground + after every successful resubmit so the
    /// settings card collapses to 0 the moment the queue clears.
    @State private var revisionsStore = ArticleRevisionsStore()
    @State private var selectedTab: AppTab = .home
    @State private var navigationPath = NavigationPath()
    /// Singleton owns the latest deep link captured from a notification tap
    /// (cold start, foreground, or background restore). We watch it via the
    /// onChange handler below and translate it into a NavigationPath entry.
    @State private var notificationsStore = NotificationsStore.shared
    /// Drives the floating tab bar's auto-hide animation when the
    /// reader scrolls inside Home/Detail screens. See TabBarVisibility
    /// in SabqComponents.swift.
    @State private var tabBarVisibility = TabBarVisibility.shared
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
                // Reserve 80pt at the bottom for the floating tab bar
                // while it's visible. When the bar auto-hides on scroll,
                // collapse the reserved strip to 0 so the underlying
                // SabqTheme.background doesn't peek through as a white
                // stripe. The animation is tied to the same visibility
                // flag so the strip slides shut in lockstep with the bar.
                .padding(.bottom, tabBarVisibility.isVisible ? 80 : 0)
                .animation(.easeOut(duration: 0.22), value: tabBarVisibility.isVisible)
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
                .navigationDestination(for: LoyaltyAccountRoute.self) { _ in
                    LoyaltyAccountView()
                }
                .navigationDestination(for: PressCardRoute.self) { _ in
                    PressCardActivationView()
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
                    // Resolves `sabq://draft/<id>` deep links and the
                    // "open" button on a needs_revision notification.
                    // Loads the latest draft from the server and
                    // presents the revision form.
                    ArticleRevisionView(articleId: route.articleId)
                }
                .navigationDestination(for: ArticleRevisionsRoute.self) { _ in
                    ArticleRevisionsListView()
                }
            }
            .environment(articlesStore)
            .environment(bookmarksStore)
            .environment(likesStore)
            .environment(authStore)
            .environment(followedKeywords)
            .environment(revisionsStore)
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
                // Also pull the revisions queue — an editor may have
                // sent something back while the app was suspended.
                if newPhase == .active && authStore.isLoggedIn {
                    Task { await notificationsStore.refreshUnreadCount() }
                    Task { await revisionsStore.refresh() }
                }
            }
            .onChange(of: authStore.isLoggedIn) { _, loggedIn in
                // Pull revisions once on first login of the session; clear
                // on logout so the next user doesn't see the previous
                // writer's queue.
                if loggedIn {
                    Task { await revisionsStore.refresh() }
                } else {
                    revisionsStore.clear()
                }
            }

            // Tab bar stays visible at all times — including inside pushed
            // detail views — so a tap on any tab is always an escape
            // hatch. The `onSelect` callback fires on every tap (even
            // taps on the already-selected tab), which is exactly when
            // we need to pop the navigation stack to root. Using
            // `.onChange(of: selectedTab)` alone wouldn't work because
            // tapping Home while already on Home doesn't change the
            // binding's value.
            SabqTabBar(
                selectedTab: $selectedTab,
                onSelect: { tab in
                    if !navigationPath.isEmpty {
                        navigationPath = NavigationPath()
                    }
                    // Re-tap Home while already on the feed → scroll to top
                    // (Instagram/Twitter pattern). Tab switches from other
                    // tabs preserve scroll position — only same-tab re-tap.
                    if tab == .home && selectedTab == .home {
                        NotificationCenter.default.post(name: .sabqHomeScrollToTop, object: nil)
                    }
                    // Any tab tap snaps the bar back into view — the reader
                    // is intentionally engaging with it.
                    tabBarVisibility.reset()
                }
            )
            .padding(.horizontal, 20)
            .padding(.bottom, 2)
            // Slide off the bottom edge + fade when the active screen
            // reports a downward scroll. 120pt is enough to clear the
            // safe-area inset on every device class we ship to.
            .offset(y: tabBarVisibility.isVisible ? 0 : 120)
            .opacity(tabBarVisibility.isVisible ? 1 : 0)
            .allowsHitTesting(tabBarVisibility.isVisible)
        }
        .sabqRTL()
        .onChange(of: navigationPath.count) { _, _ in
            // Whenever the stack pops/pushes, restore the bar so the
            // reader never lands on a screen with the bar already hidden.
            tabBarVisibility.reset()
        }
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
            SabqAnalytics.notificationOpen(type: "article", articleId: nil)
            navigationPath.append(ArticleSlugRoute(slug: slug))
        case .opinion(let slug):
            SabqAnalytics.notificationOpen(type: "opinion", articleId: nil)
            navigationPath.append(OpinionSlugRoute(slug: slug))
        case .draft(let id):
            SabqAnalytics.notificationOpen(type: "draft", articleId: id)
            navigationPath.append(DraftDeepLinkRoute(articleId: id))
        case .feedback(let id):
            SabqAnalytics.notificationOpen(type: "feedback", articleId: id)
            navigationPath.append(EditorialNotificationsRoute())
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

/// Opens the revision form for a specific article id. Resolves the
/// `sabq://draft/<id>` deep link and the "افتح للتعديل" action button
/// on a needs_revision notification.
struct DraftDeepLinkRoute: Hashable {
    let articleId: String
}

/// Opens the list of articles the editor sent back for revision. Used
/// by the "مقالات تنتظر التعديل" card in Settings.
struct ArticleRevisionsRoute: Hashable {}
