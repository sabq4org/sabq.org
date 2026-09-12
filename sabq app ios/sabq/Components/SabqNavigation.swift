import SwiftUI

/// State belongs to the tab, not the currently visible screen.
@Observable
final class SabqNavigationState {
    var sessionID = UUID()
    var selectedTab: AppTab = .home
    var paths: [AppTab: NavigationPath] = [:]

    func reset() {
        sessionID = UUID()
        paths = [:]
        selectedTab = .home
    }
}

/// Use the standard stack in compact windows so deep links and native back
/// navigation share the same path. Wide windows keep the list beside the reader.
struct SabqTabNavigation<Root: View>: View {
    @Binding var path: NavigationPath
    var usesReaderColumns = true
    @Environment(\.horizontalSizeClass) private var sizeClass
    @ViewBuilder var root: () -> Root

    var body: some View {
        if sizeClass == .regular && usesReaderColumns {
            NavigationSplitView {
                root()
                    .modifier(SabqDestinations())
                    .navigationSplitViewColumnWidth(min: 320, ideal: 390, max: 520)
            } detail: {
                NavigationStack(path: $path) {
                    ContentUnavailableView("اختر ما تود قراءته", systemImage: "newspaper",
                        description: Text("تصفّح الأخبار وافتح مقالًا لقراءته هنا."))
                        .background(SabqTheme.background)
                        .modifier(SabqDestinations())
                }
            }
            .navigationSplitViewStyle(.balanced)
        } else {
            NavigationStack(path: $path) {
                root()
                    .modifier(SabqDestinations())
            }
        }
    }
}

private struct SabqDestinations: ViewModifier {
    func body(content: Content) -> some View {
        content
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
            .navigationDestination(for: WorldCupRoute.self) { _ in
                WorldCupView()
            }
            .navigationDestination(for: AsianCupRoute.self) { _ in
                AsianCupView()
            }
            .navigationDestination(for: KingsCupRoute.self) { _ in
                KingsCupView()
            }
            .navigationDestination(for: RoshnRoute.self) { _ in
                RoshnView()
            }
            .navigationDestination(for: EconomyRoute.self) { _ in
                EconomyView()
            }
            .navigationDestination(for: RoshnTeamRoute.self) { route in
                RoshnTeamView(teamId: route.teamId)
            }
            .navigationDestination(for: MuqtarabRoute.self) { _ in
                MuqtarabLandingView()
            }
            .navigationDestination(for: MuqtarabAngleRoute.self) { route in
                MuqtarabAngleView(
                    slug: route.slug,
                    initialName: route.name,
                    initialColorHex: route.colorHex
                )
            }
            .navigationDestination(for: MuqtarabTopicRoute.self) { route in
                MuqtarabTopicView(
                    angleSlug: route.angleSlug,
                    topicSlug: route.topicSlug,
                    initialTitle: route.title
                )
            }
            .navigationDestination(for: MuqtarabWriterRoute.self) { route in
                MuqtarabWriterView(id: route.id, initialName: route.name)
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
            .navigationDestination(for: SurveyDeepLinkRoute.self) { route in
                SurveyView(token: route.token)
            }
            .navigationDestination(for: ContributorDashboardRoute.self) { _ in
                WriterWorkspaceView()
            }
            .navigationDestination(for: AdminDashboardRoute.self) { _ in
                AdminDashboardView()
            }
            .navigationDestination(for: AdminContactMessagesRoute.self) { _ in
                AdminContactMessagesView()
            }
            .navigationDestination(for: AdminOpinionTicketsRoute.self) { _ in
                AdminOpinionTicketsView()
            }
            .navigationDestination(for: AdminContactMessageRoute.self) { route in
                AdminContactMessageDetailView(id: route.id)
            }
            .navigationDestination(for: AdminOpinionTicketRoute.self) { route in
                AdminOpinionTicketDetailView(id: route.id)
            }
            .navigationDestination(for: LoyaltyAccountRoute.self) { _ in
                LoyaltyAccountView()
            }
            .navigationDestination(for: SabqPlusRoute.self) { _ in
                SabqPlusView()
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
            .navigationDestination(for: ArticleCategory.self) { category in
                CategoryArticlesView(category: category)
            }
    }
}
