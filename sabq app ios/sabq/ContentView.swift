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
    @State private var navigation = SabqNavigationState()
    /// Match center presented from a sports-alert deep link (sabq://match/:id
    /// أو sabq://asian-cup/match/:id).
    @State private var deepLinkMatch: DeepLinkMatch?
    /// Singleton owns the latest deep link captured from a notification tap
    /// (cold start, foreground, or background restore). We watch it via the
    /// onChange handler below and translate it into a NavigationPath entry.
    @State private var notificationsStore = NotificationsStore.shared
    @State private var showCompleteName = false
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        TabView(selection: $navigation.selectedTab) {
            ForEach(AppTab.allCases) { tab in
                SabqTabNavigation(path: path(for: tab), usesReaderColumns: tab != .profile) {
                    tabRoot(tab)
                }
                .tabItem { Label(tab.title, systemImage: tab.systemImage) }
                .tag(tab)
            }
        }
        .id(navigation.sessionID)
        .tint(SabqTheme.primaryEnd)
        .environment(articlesStore)
        .environment(bookmarksStore)
        .environment(likesStore)
        .environment(authStore)
        .environment(followedKeywords)
        .environment(revisionsStore)
        .environment(LiteModeManager.shared)
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
        // sabq:// links arriving through the system — the Live Activity /
        // Dynamic Island tap (`.widgetURL`) lands here, NOT in the push
        // userInfo path. Without this handler (and the CFBundleURLTypes
        // registration) tapping the island opened the app on whatever
        // screen was last visible and never reached the match center.
        .onOpenURL { url in
            if let link = notificationsStore.parseSabqDeepLink(url: url) {
                handleDeepLink(link)
            }
        }
        .sheet(item: $deepLinkMatch) { sel in
            if sel.competition == "asian-cup" {
                AsianCupMatchCenter(fixtureId: sel.id)
            } else if sel.competition == "roshn" {
                RoshnMatchCenter(fixtureId: sel.id)
            } else {
                WorldCupMatchCenter(fixtureId: sel.id)
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
                bookmarksStore.syncFromServer()
            }
        }
        .onChange(of: authStore.isLoggedIn) { _, loggedIn in
            // Pull revisions once on first login of the session; clear
            // on logout so the next user doesn't see the previous
            // writer's queue.
            if loggedIn {
                Task { await revisionsStore.refresh() }
                bookmarksStore.syncFromServer()
            } else {
                navigation.reset()
                revisionsStore.clear()
                // الجهاز المشترك: المفضلات/الإعجابات/عمليات البحث كانت
                // تبقى للمستخدم التالي بعد الخروج. المحفوظات على الخادم
                // تعود بالمزامنة عند الدخول القادم.
                bookmarksStore.clear()
                likesStore.clear()
                UserDefaults.standard.removeObject(forKey: "sabq_recent_searches")
            }
        }

        .sabqRTL()
        // Boot-time loads live here (NOT in the stores' inits): the @State
        // initial-value expression re-runs on every sabqApp body re-eval
        // (scene phase / appearance changes), spawning throwaway store
        // instances whose init-side network calls all fired and got dumped.
        // `.task` runs once per view identity — exactly one session check
        // and one home feed load per launch.
        .task {
            async let auth: Void = authStore.checkAuth()
            async let articles: Void = articlesStore.loadArticles()
            _ = await (auth, articles)
            syncNameGate()
        }
        .fullScreenCover(isPresented: $showCompleteName) {
            NavigationStack {
                ScrollView {
                    CompleteNameForm(onDone: { showCompleteName = false })
                        .padding(24)
                }
                .background(SabqTheme.background.ignoresSafeArea())
                .sabqRTL()
                .interactiveDismissDisabled(true)
            }
            .environment(authStore)
        }
        .onChange(of: authStore.isLoggedIn) { _, _ in syncNameGate() }
        .onChange(of: authStore.needsDisplayName) { _, _ in syncNameGate() }
        .onChange(of: authStore.isAuthSheetPresented) { _, _ in syncNameGate() }
    }

    private func path(for tab: AppTab) -> Binding<NavigationPath> {
        Binding(get: { navigation.paths[tab] ?? NavigationPath() },
                set: { navigation.paths[tab] = $0 })
    }

    @ViewBuilder
    private func tabRoot(_ tab: AppTab) -> some View {
        switch tab {
        case .home: HomeFeedView()
        case .explore: ExploreView()
        case .bookmarks: BookmarksView()
        case .profile: SettingsView()
        }
    }

    private func syncNameGate() {
        // ورقة الدخول تتولى الإكمال بعد OTP؛ الغطاء للجلسات المستعادة فقط.
        showCompleteName = authStore.needsDisplayName && !authStore.isAuthSheetPresented
    }

    /// Translate a parsed deep link from a notification tap into a concrete
    /// navigation. `article` → ArticleDetailView via slug, `draft` /
    /// `feedback` → the editorial notifications screen so the user lands on
    /// the entry that describes the editorial action.
    private func handleDeepLink(_ link: NotificationDeepLink) {
        navigation.selectedTab = .home
        switch link {
        case .article(let slug):
            SabqAnalytics.notificationOpen(type: "article", articleId: nil)
            navigation.paths[.home, default: NavigationPath()].append(ArticleSlugRoute(slug: slug))
        case .opinion(let slug):
            SabqAnalytics.notificationOpen(type: "opinion", articleId: nil)
            navigation.paths[.home, default: NavigationPath()].append(OpinionSlugRoute(slug: slug))
        case .draft(let id):
            SabqAnalytics.notificationOpen(type: "draft", articleId: id)
            navigation.paths[.home, default: NavigationPath()].append(DraftDeepLinkRoute(articleId: id))
        case .feedback(let id):
            SabqAnalytics.notificationOpen(type: "feedback", articleId: id)
            navigation.paths[.home, default: NavigationPath()].append(EditorialNotificationsRoute())
        case .match(let id):
            SabqAnalytics.notificationOpen(type: "match", articleId: String(id))
            deepLinkMatch = DeepLinkMatch(id: id, competition: nil)
        case .asianCupMatch(let id):
            SabqAnalytics.notificationOpen(type: "asian-cup-match", articleId: String(id))
            deepLinkMatch = DeepLinkMatch(id: id, competition: "asian-cup")
        case .roshn:
            navigation.paths[.home, default: NavigationPath()].append(RoshnRoute())
        case .roshnTeam(let id):
            navigation.paths[.home, default: NavigationPath()].append(RoshnTeamRoute(teamId: id))
        case .roshnMatch(let id):
            deepLinkMatch = DeepLinkMatch(id: id, competition: "roshn")
        case .survey(let token):
            SabqAnalytics.notificationOpen(type: "survey", articleId: nil)
            navigation.paths[.home, default: NavigationPath()].append(SurveyDeepLinkRoute(token: token))
        }
    }
}

/// Identifiable wrapper so a match fixture id can drive a `.sheet(item:)`
/// presentation of the match center from a sports-alert deep link.
struct DeepLinkMatch: Identifiable {
    let id: Int
    /// `"asian-cup"` يفتح مركز كأس آسيا؛ غير ذلك مركز المونديال (الافتراضي).
    let competition: String?
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

/// Opens the personal survey screen from a `sabq://survey/<token>` deep
/// link (push tap) or from the pending-survey card / notifications list.
struct SurveyDeepLinkRoute: Hashable {
    let token: String
}
