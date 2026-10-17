import SwiftUI

/// State belongs to the tab, not the currently visible screen.
@Observable
final class SabqNavigationState {
    var sessionID = UUID()
    var selectedTab: AppTab = .home
    var paths: [AppTab: NavigationPath] = [:]
    /// الخبر المفتوح في عمود القارئ على العرض العريض (iPhone Duo مفتوحًا،
    /// iPad). `nil` يعني «أبرز خبر الآن» — يختاره `HomeReaderRoot` تلقائيًا
    /// حتى لا يستقبل القارئ شاشة فارغة عند الفتح.
    var homeReaderArticle: Article?
    /// هل دُفع خبر القارئ إلى مكدّس «الرئيسية» عند آخر طيّ؟ يُستخدم عند الفتح
    /// التالي لإزالته من المكدّس بدل أن يظهر مرتين (في القارئ وفوقه).
    private var bridgedReaderArticleIntoStack = false
    /// «سياق الخبر» المعروض في قارئ «الرئيسية» الآن. ينشره `ArticleDetailView`
    /// و`OpinionDetailView` حين يظهران في ذلك القارئ.
    var readerContext: ArticleContext?
    /// ما يعرضه عمود «الرئيسية» على الشاشة المفتوحة: القائمة أو سياق الخبر.
    var homeSidebarMode: HomeSidebarMode = .news

    func reset() {
        sessionID = UUID()
        paths = [:]
        selectedTab = .home
        homeReaderArticle = nil
        bridgedReaderArticleIntoStack = false
        readerContext = nil
        homeSidebarMode = .news
    }

    /// يفتح خبرًا في عمود القارئ ويعيد مكدّس التبويب إلى جذره حتى لا تتراكم
    /// صفحات خلفه (كلمة مفتاحية، كاتب…) من قراءة سابقة.
    ///
    /// اختيار المستخدم خبرًا يحوّل العمود إلى «سياق الخبر» (نموذج Duo المعتمد
    /// 2026-10-15)، ويعود إلى القائمة بلمسة على «الأخبار».
    func openInReader(_ article: Article) {
        homeReaderArticle = article
        paths[.home] = NavigationPath()
        bridgedReaderArticleIntoStack = false
        homeSidebarMode = .context
    }

    /// يدفع وجهة اختارها القارئ من «سياق الخبر» (عمود أو ورقة) في مكدّس
    /// التبويب. الخبر ومقال الرأي ينشران سياقهما عند ظهورهما؛ أي وجهة أخرى
    /// (كلمة مفتاحية…) لا سياق لها، فيُمسح سياق الخبر السابق ويعود عمود
    /// «الرئيسية» إلى «الأخبار» حتى لا يعرض سياق خبر لم يعد في القارئ.
    func openFromReaderContext<Value: Hashable>(_ value: Value, in tab: AppTab) {
        paths[tab, default: NavigationPath()].append(value)
        if !(value is Article) && !(value is OpinionArticle) {
            readerContext = nil
            if tab == .home { homeSidebarMode = .news }
        }
    }

    /// ينشر سياق الخبر الظاهر في القارئ؛ النشر المكرر بالقيمة نفسها لا يعيد
    /// رسم العمود.
    func publishReaderContext(_ context: ArticleContext) {
        if readerContext != context { readerContext = context }
    }

    /// جسر الطي/الفتح على iPhone Duo (وتقسيم الشاشة على iPad).
    ///
    /// التخطيطان العريض والضيق يتشاركان `paths[.home]`، لكن الخبر المفتوح في
    /// عمود القارئ يعيش في `homeReaderArticle` لا في المكدّس. من دون هذا الجسر
    /// كان الطيّ أثناء القراءة يعيد المستخدم إلى الصفحة الأولى ويُسقط الخبر
    /// (مثبت على المحاكي 2026-09-19).
    ///
    /// - الطيّ (عريض → ضيق): إن كان المكدّس فارغًا والقارئ على خبر اختاره
    ///   المستخدم، يُدفع الخبر إلى المكدّس فيبقى على الشاشة الخارجية.
    /// - الفتح (ضيق → عريض): إن كان المكدّس ما زال يحمل ذلك الخبر وحده،
    ///   يُزال لأن القارئ يعرضه أصلًا. إن تعمّق المستخدم بعده (كلمة مفتاحية،
    ///   كاتب…) يبقى المكدّس كما هو فوق القارئ.
    func homeLayoutDidChange(isWide: Bool) {
        let path = paths[.home] ?? NavigationPath()
        if isWide {
            if bridgedReaderArticleIntoStack, path.count == 1 {
                paths[.home] = NavigationPath()
            }
            bridgedReaderArticleIntoStack = false
        } else if path.isEmpty, let article = homeReaderArticle {
            paths[.home] = NavigationPath([article])
            bridgedReaderArticleIntoStack = true
        }
    }
}

extension EnvironmentValues {
    /// `true` داخل قارئ «الرئيسية» فقط: الخبر المعروض ينشر سياقه للعمود
    /// المجاور (`SabqNavigationState.readerContext`).
    @Entry var publishesReaderContext = false
}

/// Use the standard stack in compact windows so deep links and native back
/// navigation share the same path. Wide windows keep the list beside the reader.
///
/// القرار «عريض/ضيق» لا يعتمد على `horizontalSizeClass` وحده: iPhone Duo
/// مفتوحًا بالوضع الرأسي يبلّغ `.compact` رغم أن عرضه يتجاوز 650 نقطة، فكان
/// التخطيط المزدوج لا يظهر إلا بالوضع الأفقي. نقيس عرض النافذة الفعلي أيضًا.
struct SabqTabNavigation<Root: View, Sidebar: View, Detail: View>: View {
    @Binding var path: NavigationPath
    var usesReaderColumns = true
    @Environment(\.horizontalSizeClass) private var sizeClass
    @ViewBuilder var root: () -> Root
    /// ما يُعرض في عمود القائمة على العرض العريض (iPhone Duo مفتوحًا، iPad).
    /// الافتراضي `root` نفسه؛ «الرئيسية» تمرّر `HomeSidebarView` لأن الصفحة
    /// الأولى الكاملة لا تصلح عمودًا بجوار القارئ.
    @ViewBuilder var sidebar: () -> Sidebar
    /// جذر عمود القارئ قبل أن يختار المستخدم شيئًا. الافتراضي رسالة
    /// «اختر ما تود قراءته»؛ «الرئيسية» تمرّر `HomeReaderRoot` فيُفتح أبرز خبر فورًا.
    @ViewBuilder var detail: () -> Detail
    /// يُستدعى عند الانتقال بين التخطيطين (طيّ/فتح Duo، تقسيم الشاشة) بالقيمة
    /// الجديدة لـ «عريض». التبويبات التي تحمل حالة خارج المكدّس (الرئيسية:
    /// خبر القارئ) تجسرها هنا؛ راجع `SabqNavigationState.homeLayoutDidChange`.
    var onLayoutChange: ((_ isWide: Bool) -> Void)? = nil
    /// ملاحظة مُتعلَّمة: رأينا نافذة هاتف بعرض قابل للطيّ مفتوحًا. تُحفظ
    /// لتفعيل الحاوية الثابتة من الإقلاع التالي على طرازات غير مدرجة.
    @AppStorage(FoldableDevice.observedDefaultsKey) private var foldableObserved = false

    /// أقل عرض (نقطة) يُعدّ «عريضًا». iPhone Max أفقيًا ≈ 932، Duo مفتوحًا
    /// رأسيًا ≈ 700، iPad mini رأسيًا 744؛ أي هاتف مطوي/عادي رأسيًا < 450.
    static var readerColumnsMinWidth: CGFloat { 640 }

    var body: some View {
        GeometryReader { geo in
            let isWide = usesReaderColumns
                && (sizeClass == .regular || geo.size.width >= Self.readerColumnsMinWidth)
            // Duo فقط: حاوية واحدة ثابتة في الوضعين. غيره يبقى على التبديل.
            let usesStableSplit = usesReaderColumns && FoldableDevice.isFoldable(observed: foldableObserved)
            Group {
                if usesStableSplit {
                    stableSplitLayout(isWide: isWide)
                } else if isWide {
                    splitLayout
                        // Duo can retain compact traits while unfolded. Without
                        // this scoped override SwiftUI presents the sidebar over
                        // the reader, even when there is room for both columns.
                        .environment(\.horizontalSizeClass, .regular)
                } else {
                    stackLayout
                }
            }
            .frame(width: geo.size.width, height: geo.size.height)
            // يُستدعى قبل أن يُبنى التخطيط الجديد بالمكدّس المشترك، فيجد
            // الفرع الضيق خبر القارئ مدفوعًا فوق الجذر مباشرة.
            .onChange(of: isWide) { _, nowWide in onLayoutChange?(nowWide) }
            .onChange(of: geo.size, initial: true) { _, size in
                if !foldableObserved, FoldableDevice.looksUnfolded(size) { foldableObserved = true }
            }
        }
        .ignoresSafeArea(.keyboard)
    }

    /// iPhone Duo: `NavigationSplitView` واحد لا يُهدم عند الطيّ.
    ///
    /// بدل تبديل نوع الحاوية (Split ↔ Stack) الذي كان يعيد بناء شجرة التبويب
    /// ويُسقط `@State` الداخلية، تبقى الحاوية نفسها و`NavigationStack` نفسه في
    /// عمود القارئ، ويتغير أمران فقط:
    /// - `columnVisibility`: `.all` مفتوحًا، `.detailOnly` مطويًا (العمود يُخفى
    ///   ولا يُعرض طبقةً فوق المحتوى). الرابط لا يقبل تغييرًا من إيماءة السحب.
    /// - جذر عمود القارئ: `detail()` مفتوحًا (القارئ يفتح أبرز خبر) و`root()`
    ///   مطويًا (الصفحة الأولى الكاملة). ما دُفع فوقه في `path` يبقى في المكدّس
    ///   نفسه فينجو تمريره وبياناته.
    ///
    /// صنف الحجم يُفرض `.regular` على الـ Split View نفسه كي لا ينهار إلى عمود
    /// واحد على الشاشة الخارجية، ثم يُعاد القيمة الحقيقية لمحتوى العمودين حتى
    /// لا تظن الشاشات (مثل `CategoryArticlesView`) أنها على عرض منتظم وهي على
    /// 466 نقطة.
    private func stableSplitLayout(isWide: Bool) -> some View {
        let visibility = Binding<NavigationSplitViewVisibility>(
            get: { isWide ? .all : .detailOnly },
            set: { _ in }
        )
        let contentSizeClass: UserInterfaceSizeClass? = isWide ? .regular : sizeClass
        return NavigationSplitView(columnVisibility: visibility) {
            sidebar()
                .modifier(SabqDestinations())
                .navigationSplitViewColumnWidth(min: 340, ideal: 400, max: 520)
                .toolbar(removing: .sidebarToggle)
                .environment(\.horizontalSizeClass, .regular)
        } detail: {
            NavigationStack(path: $path) {
                Group {
                    if isWide { detail() } else { root() }
                }
                .background(SabqTheme.background)
                .duoContentInsets()
                .modifier(SabqDestinations())
            }
            .toolbar(removing: .sidebarToggle)
            .environment(\.horizontalSizeClass, contentSizeClass)
        }
        .navigationSplitViewStyle(.balanced)
        .environment(\.horizontalSizeClass, .regular)
    }

    private var splitLayout: some View {
        NavigationSplitView(columnVisibility: .constant(.all)) {
            sidebar()
                .modifier(SabqDestinations())
                .navigationSplitViewColumnWidth(min: 340, ideal: 400, max: 520)
                .toolbar(removing: .sidebarToggle)
        } detail: {
            NavigationStack(path: $path) {
                detail()
                    .background(SabqTheme.background)
                    .modifier(SabqDestinations())
            }
            .toolbar(removing: .sidebarToggle)
        }
        .navigationSplitViewStyle(.balanced)
    }

    private var stackLayout: some View {
        NavigationStack(path: $path) {
            root()
                .duoContentInsets()
                .modifier(SabqDestinations())
        }
    }
}

extension SabqTabNavigation where Sidebar == Root, Detail == ReaderPlaceholderView {
    /// التبويبات التي تصلح جذورها عمودًا كما هي (قوائم وشبكات) لا تمرّر `sidebar`.
    init(
        path: Binding<NavigationPath>,
        usesReaderColumns: Bool = true,
        @ViewBuilder root: @escaping () -> Root
    ) {
        self._path = path
        self.usesReaderColumns = usesReaderColumns
        self.root = root
        self.sidebar = root
        self.detail = { ReaderPlaceholderView() }
    }
}

extension SabqTabNavigation where Detail == ReaderPlaceholderView {
    init(
        path: Binding<NavigationPath>,
        usesReaderColumns: Bool = true,
        @ViewBuilder root: @escaping () -> Root,
        @ViewBuilder sidebar: @escaping () -> Sidebar
    ) {
        self._path = path
        self.usesReaderColumns = usesReaderColumns
        self.root = root
        self.sidebar = sidebar
        self.detail = { ReaderPlaceholderView() }
    }
}

/// عمود القارئ الفارغ للتبويبات التي لا تفتح شيئًا تلقائيًا.
struct ReaderPlaceholderView: View {
    var body: some View {
        ContentUnavailableView("اختر ما تود قراءته", systemImage: "newspaper",
            description: Text("تصفّح الأخبار وافتح مقالًا لقراءته هنا."))
            .background(SabqTheme.background)
    }
}

private struct SabqDestinations: ViewModifier {
    func body(content: Content) -> some View {
        content
            .navigationDestination(for: Article.self) { article in
                ArticleDetailView(article: article)
                    .duoContentInsets()
            }
            .navigationDestination(for: OpinionArticle.self) { opinion in
                OpinionDetailView(opinion: opinion)
                    .duoContentInsets()
            }
            .navigationDestination(for: KeywordRoute.self) { route in
                KeywordArticlesView(keyword: route.keyword)
                    .duoContentInsets()
            }
            .navigationDestination(for: AuthorRoute.self) { route in
                AuthorArticlesView(authorName: route.name)
                    .duoContentInsets()
            }
            .navigationDestination(for: CalendarRoute.self) { _ in
                CalendarView()
                    .duoContentInsets()
            }
            .navigationDestination(for: OmqRoute.self) { _ in
                OmqListView()
                    .duoContentInsets()
            }
            .navigationDestination(for: OmqDetailRoute.self) { route in
                OmqDetailView(id: route.id, initialTitle: route.title)
                    .duoContentInsets()
            }
            .navigationDestination(for: DailyBriefRoute.self) { _ in
                DailyBriefView()
                    .duoContentInsets()
            }
            .navigationDestination(for: AudioNewslettersRoute.self) { _ in
                AudioNewslettersView()
                    .duoContentInsets()
            }
            .navigationDestination(for: SearchRoute.self) { _ in
                SearchView()
                    .duoContentInsets()
            }
            .navigationDestination(for: TrendingRoute.self) { _ in
                TrendingView()
                    .duoContentInsets()
            }
            .navigationDestination(for: LiveCoverageRoute.self) { _ in
                LiveCoverageView()
                    .duoContentInsets()
            }
            .navigationDestination(for: WorldCupRoute.self) { _ in
                WorldCupView()
                    .duoContentInsets()
            }
            .navigationDestination(for: AsianCupRoute.self) { _ in
                AsianCupView()
                    .duoContentInsets()
            }
            .navigationDestination(for: KingsCupRoute.self) { _ in
                KingsCupView()
                    .duoContentInsets()
            }
            .navigationDestination(for: RoshnRoute.self) { _ in
                RoshnView()
                    .duoContentInsets()
            }
            .navigationDestination(for: EconomyRoute.self) { _ in
                EconomyView()
                    .duoContentInsets()
            }
            .navigationDestination(for: RoshnTeamRoute.self) { route in
                RoshnTeamView(teamId: route.teamId)
                    .duoContentInsets()
            }
            .navigationDestination(for: MuqtarabRoute.self) { _ in
                MuqtarabLandingView()
                    .duoContentInsets()
            }
            .navigationDestination(for: MuqtarabAngleRoute.self) { route in
                MuqtarabAngleView(
                    slug: route.slug,
                    initialName: route.name,
                    initialColorHex: route.colorHex
                )
                .duoContentInsets()
            }
            .navigationDestination(for: MuqtarabTopicRoute.self) { route in
                MuqtarabTopicView(
                    angleSlug: route.angleSlug,
                    topicSlug: route.topicSlug,
                    initialTitle: route.title
                )
                .duoContentInsets()
            }
            .navigationDestination(for: MuqtarabWriterRoute.self) { route in
                MuqtarabWriterView(id: route.id, initialName: route.name)
                    .duoContentInsets()
            }
            .navigationDestination(for: MawaeedRoute.self) { _ in
                MawaeedView()
                    .duoContentInsets()
            }
            .navigationDestination(for: MyKeywordsRoute.self) { _ in
                MyKeywordsView()
                    .duoContentInsets()
            }
            .navigationDestination(for: SabqAIRoute.self) { _ in
                SabqAIView()
                    .duoContentInsets()
            }
            .navigationDestination(for: SportsTodayRoute.self) { _ in
                SportsTodayView()
                    .duoContentInsets()
            }
            .navigationDestination(for: MomentByMomentRoute.self) { _ in
                MomentByMomentView()
                    .duoContentInsets()
            }
            .navigationDestination(for: OpinionsRoute.self) { _ in
                OpinionsView()
                    .duoContentInsets()
            }
            .navigationDestination(for: EditorialNotificationsRoute.self) { _ in
                EditorialNotificationsView()
                    .duoContentInsets()
            }
            .navigationDestination(for: SurveyDeepLinkRoute.self) { route in
                SurveyView(token: route.token)
                    .duoContentInsets()
            }
            .navigationDestination(for: ContributorDashboardRoute.self) { _ in
                WriterWorkspaceView()
                    .duoContentInsets()
            }
            .navigationDestination(for: AdminDashboardRoute.self) { _ in
                AdminDashboardView()
                    .duoContentInsets()
            }
            .navigationDestination(for: AdminContactMessagesRoute.self) { _ in
                AdminContactMessagesView()
                    .duoContentInsets()
            }
            .navigationDestination(for: AdminOpinionTicketsRoute.self) { _ in
                AdminOpinionTicketsView()
                    .duoContentInsets()
            }
            .navigationDestination(for: AdminContactMessageRoute.self) { route in
                AdminContactMessageDetailView(id: route.id)
                    .duoContentInsets()
            }
            .navigationDestination(for: AdminOpinionTicketRoute.self) { route in
                AdminOpinionTicketDetailView(id: route.id)
                    .duoContentInsets()
            }
            .navigationDestination(for: LoyaltyAccountRoute.self) { _ in
                LoyaltyAccountView()
                    .duoContentInsets()
            }
            .navigationDestination(for: SabqPlusRoute.self) { _ in
                SabqPlusView()
                    .duoContentInsets()
            }
            .navigationDestination(for: PressCardRoute.self) { _ in
                PressCardActivationView()
                    .duoContentInsets()
            }
            .navigationDestination(for: ArticleSlugRoute.self) { route in
                // Wraps a slug-based deep link in the existing
                // article detail view by hydrating a minimal Article
                // shell — ArticleDetailView already refetches the
                // full payload from the slug via NewsService.
                ArticleDetailView(article: Article.placeholder(slug: route.slug))
                    .duoContentInsets()
            }
            .navigationDestination(for: OpinionSlugRoute.self) { route in
                // Same pattern as ArticleSlugRoute but for opinion
                // articles. OpinionDetailView's `.task { loadOpinion() }`
                // hydrates the real payload (title, body, author, etc.)
                // from `/api/opinion/<slug>` on first appear.
                OpinionDetailView(opinion: OpinionArticle.placeholder(slug: route.slug))
                    .duoContentInsets()
            }
            .navigationDestination(for: DraftDeepLinkRoute.self) { route in
                // Resolves `sabq://draft/<id>` deep links and the
                // "open" button on a needs_revision notification.
                // Loads the latest draft from the server and
                // presents the revision form.
                ArticleRevisionView(articleId: route.articleId)
                    .duoContentInsets()
            }
            .navigationDestination(for: ArticleRevisionsRoute.self) { _ in
                ArticleRevisionsListView()
                    .duoContentInsets()
            }
            .navigationDestination(for: ArticleCategory.self) { category in
                CategoryArticlesView(category: category)
                    .duoContentInsets()
            }
    }
}
