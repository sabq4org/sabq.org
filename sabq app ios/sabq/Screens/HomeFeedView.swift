import SwiftUI

struct HomeFeedView: View {
    @Environment(ArticlesStore.self) private var articlesStore
    @Environment(BookmarksStore.self) private var bookmarksStore
    @Environment(AuthStore.self) private var authStore
    /// Mirror of the dark-mode flag in `sabqApp` so the header toggle flips
    /// the scene-level `.preferredColorScheme`. The setting also lives in the
    /// in-app preferences screen; both write to the same UserDefaults key.
    @AppStorage("isDarkMode") private var isDarkMode = false
    @State private var isFirstLoad = true
    /// Drives the slowly-pulsing "live" ring around the new live-coverage
    /// entry point in the header. Animated on appear; idle otherwise.
    @State private var livePulse = false
    @State private var todayInsights: [String: String] = [:]
    @State private var latestOmq: APIDeepAnalysis?
    @State private var calendarToday: [APICalendarEvent] = []
    @State private var latestNewsletter: APIAudioNewsletter?

    private var isContentReady: Bool {
        !articlesStore.allArticles.isEmpty || !articlesStore.featuredArticles.isEmpty
    }

    var body: some View {
        ScrollView(showsIndicators: false) {
            if isContentReady {
                VStack(alignment: .leading, spacing: 20) {
                    headerSection

                    NavigationLink(value: DailyBriefRoute()) {
                        greetingBlock
                    }
                    .buttonStyle(.plain)
                    .animatedAppear(index: 0)

                    if !articlesStore.breakingNews.isEmpty {
                        breakingNewsSection
                            .animatedAppear(index: 1)
                    }

                    if !articlesStore.stories.isEmpty {
                        storiesSection
                            .animatedAppear(index: 2)
                    }

                    featuredSection
                        .animatedAppear(index: 3)

                    omqPreviewSection
                        .animatedAppear(index: 4)

                    if !calendarToday.isEmpty {
                        calendarTodayCard
                            .animatedAppear(index: 5)
                    }

                    if latestNewsletter != nil {
                        audioNewsletterCard
                            .animatedAppear(index: 6)
                    }

                    opinionsPreviewSection
                        .animatedAppear(index: 7)

                    trendingPreviewSection
                        .animatedAppear(index: 8)

                    // Category chips removed from the homepage per user
                    // direction — categories are now reached via Explore tab.
                    // The `categoryChipsSection` view + filtering state remain
                    // intact in case we re-introduce them in a sheet later.

                    latestArticlesSection
                        .animatedAppear(index: 10)
                }
                .padding(.horizontal, 16)
                .padding(.top, 18)
                .padding(.bottom, 40)
                .frame(maxWidth: .infinity, alignment: .leading)
            } else {
                HomeFeedSkeleton()
                    .padding(.horizontal, 16)
                    .padding(.top, 18)
                    .padding(.bottom, 40)
            }
        }
        .refreshable {
            SabqHaptics.medium()
            await articlesStore.loadArticles(ignoreCache: true)
        }
        .background(SabqTheme.background)
        .sabqRTL()
        // Notifications sheet removed from this screen — the header now
        // surfaces the live-coverage entry point instead. The notifications
        // page is still reachable from the Settings tab.
        .onChange(of: isContentReady) { _, ready in
            if ready && isFirstLoad {
                isFirstLoad = false
            }
        }
        .task {
            // Phase-4 + Phase-5 background fetches. All best-effort: silent
            // on failure so the home screen still renders.
            async let insights: [String: String]? = try? await APIClient.shared.fetchTodayInsights()
            async let omqList: APIOmqListResponse? = try? await APIClient.shared.fetchOmqList(page: 1, limit: 1, status: "published")
            async let upcoming: [APICalendarEvent]? = try? await APIClient.shared.fetchUpcomingCalendarEvents(days: 14)
            async let newsletters: [APIAudioNewsletter]? = try? await APIClient.shared.fetchAudioNewsletters()

            if let v = await insights { todayInsights = v }
            latestOmq = (await omqList)?.analyses.first
            calendarToday = (await upcoming) ?? []
            latestNewsletter = (await newsletters)?.first
        }
    }

    // MARK: - Header

    private var headerSection: some View {
        HStack(alignment: .center, spacing: 14) {
            Image("SabqLogo")
                .renderingMode(.original)
                .resizable()
                .aspectRatio(contentMode: .fit)
                .frame(height: 48)

            Spacer(minLength: 0)

            HStack(spacing: 10) {
                NavigationLink(value: SearchRoute()) {
                    headerIcon("magnifyingglass")
                }
                .buttonStyle(.plain)

                // "لحظة بلحظة" entry point — replaces the previous bell
                // (notifications) button. Routes to the published-articles
                // live feed (`MomentByMomentView`), NOT the live-events
                // coverage screen. A subtle pulsing red dot signals
                // freshness without yelling.
                NavigationLink(value: MomentByMomentRoute()) {
                    ZStack {
                        Circle()
                            .fill(
                                LinearGradient(
                                    colors: [SabqTheme.primaryStart.opacity(0.10), SabqTheme.primaryEnd.opacity(0.05)],
                                    startPoint: .topLeading,
                                    endPoint: .bottomTrailing
                                )
                            )
                            .frame(width: 44, height: 44)

                        Image(systemName: "dot.radiowaves.left.and.right")
                            .font(.system(size: 18, weight: .semibold))
                            .foregroundStyle(SabqTheme.primaryEnd)

                        // Pulsing live indicator dot.
                        Circle()
                            .fill(SabqTheme.coral)
                            .frame(width: 8, height: 8)
                            .overlay(
                                Circle()
                                    .stroke(SabqTheme.coral.opacity(0.5), lineWidth: 2)
                                    .scaleEffect(livePulse ? 1.8 : 1)
                                    .opacity(livePulse ? 0 : 0.7)
                            )
                            .offset(x: 14, y: -14)
                    }
                }
                .buttonStyle(.plain)

                // Dark-mode toggle — mirrors the in-app setting. Tap flips
                // `isDarkMode` AppStorage which `sabqApp` reads to drive
                // `.preferredColorScheme(...)` for the whole scene.
                Button {
                    SabqHaptics.light()
                    withAnimation(.spring(response: 0.4, dampingFraction: 0.86)) {
                        isDarkMode.toggle()
                    }
                } label: {
                    headerIcon(isDarkMode ? "sun.max.fill" : "moon.fill")
                }
                .buttonStyle(.plain)
            }
        }
        .onAppear {
            withAnimation(.easeInOut(duration: 1.4).repeatForever(autoreverses: false)) {
                livePulse = true
            }
        }
    }

    private func headerIcon(_ systemName: String) -> some View {
        Circle()
            .fill(
                LinearGradient(
                    colors: [SabqTheme.primaryStart.opacity(0.10), SabqTheme.primaryEnd.opacity(0.05)],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            )
            .frame(width: 44, height: 44)
            .overlay {
                Image(systemName: systemName)
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(SabqTheme.primaryEnd)
            }
    }

    // MARK: - Breaking News

    @ViewBuilder
    private var breakingNewsSection: some View {
        if let article = articlesStore.breakingNews.first {
            NavigationLink(value: article) {
                HStack(spacing: 12) {
                    PulsingDot(color: SabqTheme.coral)

                    Text("عاجل")
                        .font(.system(size: 13, weight: .heavy))
                        .foregroundStyle(SabqTheme.coral)

                    Text(article.title)
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(SabqTheme.ink)
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)

                    Spacer(minLength: 0)

                    Image(systemName: "chevron.left")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundStyle(SabqTheme.coral.opacity(0.6))
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 14)
                .background(
                    RoundedRectangle(cornerRadius: SabqTheme.tileRadius, style: .continuous)
                        .fill(
                            LinearGradient(
                                colors: [SabqTheme.coral.opacity(0.06), SabqTheme.coral.opacity(0.02)],
                                startPoint: .leading,
                                endPoint: .trailing
                            )
                        )
                )
                .overlay(
                    RoundedRectangle(cornerRadius: SabqTheme.tileRadius, style: .continuous)
                        .stroke(SabqTheme.coral.opacity(0.15), lineWidth: 1)
                )
            }
            .buttonStyle(.plain)
        }
    }

    // MARK: - Stories

    private var storiesSection: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 14) {
                ForEach(articlesStore.stories) { story in
                    StoryBubble(story: story)
                }
            }
            .padding(.vertical, 4)
        }
    }

    // MARK: - Featured

    private var featuredSection: some View {
        TabView {
            ForEach(Array(articlesStore.featuredArticles.prefix(3))) { article in
                NavigationLink(value: article) {
                    FeaturedArticleCard(
                        article: article,
                        onBookmark: { bookmarksStore.toggle(article.id, article: article) },
                        isBookmarked: bookmarksStore.isBookmarked(article.id)
                    )
                }
                .buttonStyle(.plain)
                .padding(.horizontal, 4)
                .padding(.bottom, 40)
            }
        }
        .tabViewStyle(.page(indexDisplayMode: .always))
        .onAppear {
            let appearance = UIPageControl.appearance(whenContainedInInstancesOf: [UIHostingController<HomeFeedView>.self])
            appearance.currentPageIndicatorTintColor = UIColor(SabqTheme.primaryEnd)
            appearance.pageIndicatorTintColor = UIColor(SabqTheme.primaryEnd.opacity(0.3))
        }
        .frame(height: 420)
    }

    // MARK: - Category Chips

    private var categoryChipsSection: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 10) {
                CategoryChip(
                    title: "الكل",
                    isSelected: articlesStore.selectedCategory == nil
                ) {
                    withAnimation(.spring(response: 0.3)) {
                        articlesStore.selectedCategory = nil
                    }
                }

                ForEach(ArticleCategory.allCases) { category in
                    CategoryChip(
                        title: category.title,
                        isSelected: articlesStore.selectedCategory == category
                    ) {
                        withAnimation(.spring(response: 0.3)) {
                            articlesStore.selectedCategory = category
                        }
                    }
                }
            }
            .padding(.vertical, 2)
        }
    }

    // MARK: - Trending Preview

    @ViewBuilder
    private var trendingPreviewSection: some View {
        if !articlesStore.trendingArticles.isEmpty {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    HStack(spacing: 8) {
                        Image(systemName: "flame.fill")
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundStyle(.orange)
                        Text("الأكثر تداولاً")
                            .font(.system(size: 17, weight: .bold, design: .rounded))
                            .foregroundStyle(SabqTheme.ink)
                    }

                    Spacer()

                    NavigationLink(value: TrendingRoute()) {
                        HStack(spacing: 4) {
                            Text("المزيد")
                                .font(.system(size: 13, weight: .semibold))
                            Image(systemName: "chevron.left")
                                .font(.system(size: 11, weight: .semibold))
                        }
                        .foregroundStyle(SabqTheme.primaryEnd)
                    }
                    .buttonStyle(.plain)
                }

                SurfaceCard {
                    ForEach(Array(articlesStore.trendingArticles.prefix(3).enumerated()), id: \.element.id) { index, article in
                        if index > 0 {
                            Divider().foregroundStyle(SabqTheme.outline)
                        }

                        NavigationLink(value: article) {
                            HStack(spacing: 12) {
                                Text("\(index + 1)")
                                    .font(.system(size: 18, weight: .heavy, design: .rounded))
                                    .foregroundStyle(index < 3 ? .orange : SabqTheme.tertiaryInk)
                                    .frame(width: 28)

                                Text(article.title)
                                    .font(.system(size: 14, weight: .semibold))
                                    .foregroundStyle(SabqTheme.ink)
                                    .lineLimit(2)
                                    .multilineTextAlignment(.leading)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                            }
                            .padding(.vertical, 4)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
    }

    // MARK: - Opinions Preview

    @ViewBuilder
    private var opinionsPreviewSection: some View {
        if !articlesStore.opinions.isEmpty {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    HStack(spacing: 8) {
                        ZStack {
                            Circle()
                                .fill(SabqTheme.gold.opacity(0.15))
                                .frame(width: 28, height: 28)
                            Image(systemName: "quote.opening")
                                .font(.system(size: 12, weight: .bold))
                                .foregroundStyle(SabqTheme.gold)
                        }
                        Text("آراء وأقلام")
                            .font(.system(size: 17, weight: .bold, design: .rounded))
                            .foregroundStyle(SabqTheme.ink)
                    }

                    Spacer()

                    NavigationLink(value: OpinionsRoute()) {
                        HStack(spacing: 4) {
                            Text("جميع المقالات")
                                .font(.system(size: 13, weight: .semibold))
                            Image(systemName: "chevron.left")
                                .font(.system(size: 11, weight: .semibold))
                        }
                        .foregroundStyle(SabqTheme.primaryEnd)
                    }
                    .buttonStyle(.plain)
                }

                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 14) {
                        ForEach(articlesStore.opinions.prefix(5)) { opinion in
                            NavigationLink(value: opinion) {
                                opinionCard(opinion)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(.vertical, 2)
                }
            }
        }
    }

    private func opinionCard(_ opinion: OpinionArticle) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            ZStack(alignment: .bottomLeading) {
                if let urlString = opinion.imageURL, let url = URL(string: urlString) {
                    CachedAsyncImage(url: url, contentMode: .fill) {
                        opinionCardPlaceholder
                    }
                    .frame(width: 200, height: 120)
                    .clipped()
                } else {
                    opinionCardPlaceholder
                }

                LinearGradient(
                    colors: [.black.opacity(0.7), .clear],
                    startPoint: .bottom,
                    endPoint: .top
                )
                .frame(height: 60)

                HStack(spacing: 6) {
                    opinionAuthorAvatar(opinion, size: 24)
                    Text(opinion.authorName)
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(.white)
                        .lineLimit(1)
                }
                .padding(8)
            }
            .frame(width: 200, height: 120)
            .clipShape(UnevenRoundedRectangle(topLeadingRadius: 12, bottomLeadingRadius: 0, bottomTrailingRadius: 0, topTrailingRadius: 12))

            VStack(alignment: .leading, spacing: 6) {
                Text(opinion.title)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(SabqTheme.ink)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
                    .frame(height: 36, alignment: .top)

                HStack(spacing: 8) {
                    HStack(spacing: 4) {
                        Image(systemName: "clock")
                            .font(.system(size: 10, weight: .medium))
                        Text(opinion.readingTime)
                            .font(.system(size: 10, weight: .medium))
                    }
                    .foregroundStyle(SabqTheme.tertiaryInk)

                    Spacer()

                    Text(opinion.relativeDate)
                        .font(.system(size: 10, weight: .medium))
                        .foregroundStyle(SabqTheme.tertiaryInk)
                }
            }
            .padding(10)
            .frame(width: 200)
            .background(SabqTheme.surface)
        }
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .shadow(color: .black.opacity(0.06), radius: 8, x: 0, y: 2)
    }

    private var opinionCardPlaceholder: some View {
        Rectangle()
            .fill(
                LinearGradient(
                    colors: [SabqTheme.gold.opacity(0.2), SabqTheme.primaryEnd.opacity(0.1)],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            )
            .frame(width: 200, height: 120)
            .overlay {
                Image(systemName: "text.quote")
                    .font(.system(size: 32, weight: .light))
                    .foregroundStyle(SabqTheme.gold.opacity(0.4))
            }
    }

    private func opinionAuthorAvatar(_ opinion: OpinionArticle, size: CGFloat) -> some View {
        Group {
            if let urlString = opinion.authorImageURL, let url = URL(string: urlString) {
                CachedAsyncImage(url: url, contentMode: .fill) {
                    authorInitialsView(opinion.authorName, size: size)
                }
                .frame(width: size, height: size)
                .clipShape(Circle())
            } else {
                authorInitialsView(opinion.authorName, size: size)
            }
        }
    }

    private func authorInitialsView(_ name: String, size: CGFloat) -> some View {
        Circle()
            .fill(
                LinearGradient(
                    colors: [SabqTheme.gold, SabqTheme.primaryEnd],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            )
            .frame(width: size, height: size)
            .overlay {
                Text(String(name.prefix(1)))
                    .font(.system(size: size * 0.45, weight: .bold))
                    .foregroundStyle(.white)
            }
    }

    // MARK: - Latest Articles

    private var latestArticlesSection: some View {
        VStack(alignment: .leading, spacing: 14) {
            SectionHeader(
                title: articlesStore.selectedCategory?.title ?? "آخر الأخبار",
                subtitle: articlesStore.selectedCategory?.subtitle ?? "تابع أحدث الأخبار المحلية والعالمية",
                icon: "newspaper.fill",
                tint: articlesStore.selectedCategory?.tint ?? SabqTheme.primaryEnd
            )

            SurfaceCard {
                ForEach(Array(articlesStore.filteredArticles.enumerated()), id: \.element.id) { index, article in
                    if index > 0 {
                        Divider()
                            .foregroundStyle(SabqTheme.outline)
                    }

                    NavigationLink(value: article) {
                        CompactArticleRow(
                            article: article,
                            onBookmark: { bookmarksStore.toggle(article.id, article: article) },
                            isBookmarked: bookmarksStore.isBookmarked(article.id)
                        )
                    }
                    .buttonStyle(.plain)
                }

                if articlesStore.hasMore && articlesStore.selectedCategory == nil {
                    Button {
                        Task { await articlesStore.loadMore() }
                    } label: {
                        HStack(spacing: 8) {
                            if articlesStore.isLoading {
                                ProgressView()
                                    .tint(SabqTheme.primaryEnd)
                            }
                            Text("تحميل المزيد")
                                .font(.system(size: 14, weight: .semibold))
                                .foregroundStyle(SabqTheme.primaryEnd)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                    }
                    .buttonStyle(.plain)
                    .disabled(articlesStore.isLoading)
                }
            }
        }
    }

    // MARK: - Greeting Block (Phase 2)

    /// Time-aware Arabic greeting. The greeting + sub-message is the first
    /// piece the reader sees, framing the day's content as something curated
    /// rather than a dump of articles.
    private var greetingBlock: some View {
        let hour = Calendar.current.component(.hour, from: Date())
        let greeting: String
        let icon: String
        let tint: Color
        switch hour {
        case 5..<12:
            greeting = "صباح الخير"
            icon = "sun.max.fill"
            tint = Color(red: 0.96, green: 0.72, blue: 0.18)
        case 12..<17:
            greeting = "نهارك سعيد"
            icon = "sun.haze.fill"
            tint = Color(red: 0.93, green: 0.58, blue: 0.22)
        case 17..<21:
            // Evening = the sun setting. `sunset.fill` reads as dusk far more
            // clearly than the previous `sun.dust.fill` (which most users see
            // as a daytime haze icon). Warmer orange tint matches the sunset.
            greeting = "مساء الخير"
            icon = "sunset.fill"
            tint = Color(red: 0.95, green: 0.45, blue: 0.20)
        default:
            greeting = "ليلة هادئة"
            icon = "moon.stars.fill"
            tint = Color(red: 0.46, green: 0.52, blue: 0.95)
        }

        let todayCount = articlesStore.allArticles.filter {
            Calendar.current.isDateInToday($0.publishDate)
        }.count

        // SmartSummary keys from the backend — fall back gracefully when
        // a key is missing. `phrase` is the AI-generated headline-style line,
        // `summary` is a one-paragraph context, both optional.
        let aiPhrase = todayInsights["phrase"]
            ?? todayInsights["headline"]
            ?? todayInsights["summary"]
        let topCategory = todayInsights["topCategory"]

        return HStack(alignment: .top, spacing: 14) {
            ZStack {
                Circle()
                    .fill(tint.opacity(0.14))
                    .frame(width: 52, height: 52)
                Image(systemName: icon)
                    .font(.system(size: 22, weight: .semibold))
                    .foregroundStyle(tint)
                    .symbolRenderingMode(.hierarchical)
            }

            VStack(alignment: .leading, spacing: 6) {
                Text(greeting)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(SabqTheme.secondaryInk)
                if let aiPhrase, !aiPhrase.isEmpty {
                    Text(aiPhrase)
                        .font(.system(size: 16, weight: .heavy, design: .rounded))
                        .foregroundStyle(SabqTheme.ink)
                        .lineLimit(3)
                        .multilineTextAlignment(.leading)
                        .fixedSize(horizontal: false, vertical: true)
                } else {
                    Text("هذا ما اخترناه لك اليوم")
                        .font(.system(size: 18, weight: .heavy, design: .rounded))
                        .foregroundStyle(SabqTheme.ink)
                }
                HStack(spacing: 6) {
                    if todayCount > 0 {
                        Text("\(todayCount) خبر اليوم")
                            .font(.system(size: 11, weight: .medium))
                            .foregroundStyle(SabqTheme.tertiaryInk)
                            .monospacedDigit()
                    }
                    if let topCategory, !topCategory.isEmpty {
                        if todayCount > 0 {
                            Text("·")
                                .font(.system(size: 10))
                                .foregroundStyle(SabqTheme.tertiaryInk.opacity(0.6))
                        }
                        Text("الأبرز: \(topCategory)")
                            .font(.system(size: 11, weight: .medium))
                            .foregroundStyle(tint)
                    }
                }
            }
            Spacer(minLength: 0)
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: SabqTheme.cardRadius, style: .continuous)
                .fill(.ultraThinMaterial)
                .overlay(
                    RoundedRectangle(cornerRadius: SabqTheme.cardRadius, style: .continuous)
                        .fill(tint.opacity(0.05))
                )
        )
        .overlay(
            RoundedRectangle(cornerRadius: SabqTheme.cardRadius, style: .continuous)
                .stroke(tint.opacity(0.18), lineWidth: 0.5)
        )
        .shadow(color: tint.opacity(0.08), radius: 14, x: 0, y: 6)
    }

    // MARK: - OMQ Preview (Phase 2)

    /// Deep analyses preview card. Now backed by /api/omq real data — falls
    /// back to a "coming soon" placeholder when no published analyses exist.
    private var omqPreviewSection: some View {
        let sky = SabqTheme.sky
        return VStack(alignment: .leading, spacing: 14) {
            HStack {
                sectionHeading(
                    title: "تحليل عميق",
                    icon: "sparkles.rectangle.stack.fill",
                    tint: sky
                )
                if latestOmq != nil {
                    NavigationLink(value: OmqRoute()) {
                        Text("الكل")
                            .font(.system(size: 11, weight: .heavy))
                            .foregroundStyle(sky)
                    }
                }
            }

            if let omq = latestOmq {
                NavigationLink(value: OmqDetailRoute(id: omq.id, title: omq.title)) {
                    HStack(alignment: .top, spacing: 14) {
                        ZStack {
                            RoundedRectangle(cornerRadius: 16, style: .continuous)
                                .fill(sky.opacity(0.14))
                            Image(systemName: "brain.head.profile")
                                .font(.system(size: 22, weight: .light))
                                .foregroundStyle(sky)
                                .symbolRenderingMode(.hierarchical)
                        }
                        .frame(width: 50, height: 50)
                        VStack(alignment: .leading, spacing: 5) {
                            Text(omq.title)
                                .font(.system(size: 14, weight: .heavy, design: .rounded))
                                .foregroundStyle(SabqTheme.ink)
                                .lineLimit(2)
                                .multilineTextAlignment(.leading)
                            if let topic = omq.topic, !topic.isEmpty, topic != omq.title {
                                Text(topic)
                                    .font(.system(size: 11))
                                    .foregroundStyle(SabqTheme.secondaryInk)
                                    .lineLimit(2)
                            }
                        }
                        Spacer(minLength: 0)
                    }
                    .padding(16)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(
                        RoundedRectangle(cornerRadius: SabqTheme.cardRadius, style: .continuous)
                            .fill(LinearGradient(
                                colors: [sky.opacity(0.08), sky.opacity(0.02)],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing))
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: SabqTheme.cardRadius, style: .continuous)
                            .stroke(sky.opacity(0.18), lineWidth: 0.5)
                    )
                }
                .buttonStyle(.plain)
            } else {
                NavigationLink(value: OmqRoute()) {
                    omqPlaceholder(sky: sky)
                }
                .buttonStyle(.plain)
            }
        }
    }

    private func omqPlaceholder(sky: Color) -> some View {
        HStack(alignment: .center, spacing: 14) {
            ZStack {
                RoundedRectangle(cornerRadius: 20, style: .continuous)
                    .fill(sky.opacity(0.14))
                Image(systemName: "brain.head.profile")
                    .font(.system(size: 28, weight: .light))
                    .foregroundStyle(sky)
                    .symbolRenderingMode(.hierarchical)
            }
            .frame(width: 64, height: 64)
            VStack(alignment: .leading, spacing: 5) {
                Text("تحليلات الذكاء الاصطناعي")
                    .font(.system(size: 15, weight: .bold, design: .rounded))
                    .foregroundStyle(SabqTheme.ink)
                Text("اعرض كل التحليلات المعمّقة المتاحة بمنهجية سبق التحريرية.")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(SabqTheme.secondaryInk)
                    .lineLimit(3)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: SabqTheme.cardRadius, style: .continuous)
                .fill(LinearGradient(
                    colors: [sky.opacity(0.06), sky.opacity(0.02)],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing))
        )
        .overlay(
            RoundedRectangle(cornerRadius: SabqTheme.cardRadius, style: .continuous)
                .stroke(sky.opacity(0.18), lineWidth: 0.5)
        )
    }

    // MARK: - Calendar today card

    private var calendarTodayCard: some View {
        let gold = SabqTheme.gold
        let preview = calendarToday.prefix(3)
        return VStack(alignment: .leading, spacing: 12) {
            HStack {
                sectionHeading(
                    title: "أحداث اليوم القادمة",
                    icon: "calendar",
                    tint: gold
                )
                NavigationLink(value: CalendarRoute()) {
                    Text("الكل")
                        .font(.system(size: 11, weight: .heavy))
                        .foregroundStyle(gold)
                }
            }
            VStack(spacing: 10) {
                ForEach(Array(preview.enumerated()), id: \.offset) { _, event in
                    HStack(spacing: 10) {
                        RoundedRectangle(cornerRadius: 3).fill(gold).frame(width: 3, height: 28)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(event.title)
                                .font(.system(size: 13, weight: .bold))
                                .foregroundStyle(SabqTheme.ink)
                                .lineLimit(1)
                            if let imp = event.importance, imp >= 4 {
                                Text("حدث بارز")
                                    .font(.system(size: 10, weight: .medium))
                                    .foregroundStyle(SabqTheme.tertiaryInk)
                            }
                        }
                        Spacer(minLength: 0)
                    }
                }
            }
            .padding(14)
            .background(
                RoundedRectangle(cornerRadius: SabqTheme.tileRadius, style: .continuous)
                    .fill(SabqTheme.surface)
            )
            .overlay(
                RoundedRectangle(cornerRadius: SabqTheme.tileRadius, style: .continuous)
                    .stroke(gold.opacity(0.18), lineWidth: 0.5)
            )
        }
    }

    // MARK: - Audio newsletter card

    @ViewBuilder
    private var audioNewsletterCard: some View {
        if let n = latestNewsletter {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    sectionHeading(
                        title: "النشرات الصوتية",
                        icon: "waveform",
                        tint: SabqTheme.coral
                    )
                    NavigationLink(value: AudioNewslettersRoute()) {
                        Text("الكل")
                            .font(.system(size: 11, weight: .heavy))
                            .foregroundStyle(SabqTheme.coral)
                    }
                }
                NavigationLink(value: AudioNewslettersRoute()) {
                    HStack(spacing: 14) {
                        ZStack {
                            RoundedRectangle(cornerRadius: 14, style: .continuous)
                                .fill(LinearGradient(
                                    colors: [SabqTheme.coral.opacity(0.30), SabqTheme.primaryEnd.opacity(0.18)],
                                    startPoint: .topLeading,
                                    endPoint: .bottomTrailing))
                            Image(systemName: "waveform")
                                .font(.system(size: 20, weight: .light))
                                .foregroundStyle(.white.opacity(0.8))
                        }
                        .frame(width: 54, height: 54)
                        VStack(alignment: .leading, spacing: 4) {
                            Text(n.title)
                                .font(.system(size: 14, weight: .heavy, design: .rounded))
                                .foregroundStyle(SabqTheme.ink)
                                .lineLimit(2)
                                .multilineTextAlignment(.leading)
                            if let d = n.duration {
                                Text("\(d / 60) دقيقة استماع")
                                    .font(.system(size: 11, weight: .medium))
                                    .foregroundStyle(SabqTheme.tertiaryInk)
                                    .monospacedDigit()
                            }
                        }
                        Spacer(minLength: 0)
                        Image(systemName: "play.circle.fill")
                            .font(.system(size: 28))
                            .foregroundStyle(SabqTheme.coral)
                    }
                    .padding(14)
                    .background(
                        RoundedRectangle(cornerRadius: SabqTheme.tileRadius, style: .continuous)
                            .fill(SabqTheme.surface)
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: SabqTheme.tileRadius, style: .continuous)
                            .stroke(SabqTheme.coral.opacity(0.18), lineWidth: 0.5)
                    )
                }
                .buttonStyle(.plain)
            }
        }
    }

    private func sectionHeading(title: String, icon: String, tint: Color) -> some View {
        HStack(spacing: 8) {
            ZStack {
                Circle()
                    .fill(tint.opacity(0.14))
                    .frame(width: 26, height: 26)
                Image(systemName: icon)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(tint)
            }
            Text(title)
                .font(.system(size: 16, weight: .heavy, design: .rounded))
                .foregroundStyle(SabqTheme.ink)
            Spacer(minLength: 0)
        }
    }
}

// MARK: - Pulsing Dot

// TimelineView-driven pulse — smoother than withAnimation.repeatForever
// because it ties the animation to the frame clock rather than a fixed
// duration. Two halos with phase offset give a more organic, heartbeat feel.
struct PulsingDot: View {
    let color: Color

    var body: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 60.0, paused: false)) { context in
            let t = context.date.timeIntervalSinceReferenceDate
            let phase1 = 0.5 + 0.5 * sin(t * 2.4)              // 0 → 1 → 0
            let phase2 = 0.5 + 0.5 * sin(t * 2.4 + .pi / 2.5)  // offset phase

            ZStack {
                Circle()
                    .fill(color.opacity(0.20))
                    .frame(width: 18, height: 18)
                    .scaleEffect(0.85 + phase1 * 0.45)
                    .opacity(1 - phase1)

                Circle()
                    .fill(color.opacity(0.30))
                    .frame(width: 12, height: 12)
                    .scaleEffect(0.9 + phase2 * 0.3)
                    .opacity(1 - phase2 * 0.6)

                Circle()
                    .fill(color)
                    .frame(width: 8, height: 8)
            }
        }
    }
}

// MARK: - Story Bubble

struct StoryBubble: View {
    let story: APIStory

    var body: some View {
        VStack(spacing: 8) {
            ZStack {
                Circle()
                    .stroke(
                        LinearGradient(
                            colors: [SabqTheme.primaryStart, SabqTheme.primaryEnd],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        ),
                        lineWidth: 2.5
                    )
                    .frame(width: 68, height: 68)

                if let urlString = story.imageUrl, let url = URL(string: urlString) {
                    CachedAsyncImage(url: url, contentMode: .fill) {
                        storyPlaceholder
                    }
                    .frame(width: 60, height: 60)
                    .clipShape(Circle())
                } else {
                    storyPlaceholder
                }
            }

            Text(story.title)
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(SabqTheme.ink)
                .lineLimit(1)
                .frame(width: 72)
        }
    }

    private var storyPlaceholder: some View {
        Circle()
            .fill(
                LinearGradient(
                    colors: [SabqTheme.primaryEnd.opacity(0.15), SabqTheme.primaryStart.opacity(0.05)],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            )
            .frame(width: 60, height: 60)
            .overlay {
                Image(systemName: "doc.text.fill")
                    .font(.system(size: 22, weight: .light))
                    .foregroundStyle(SabqTheme.primaryEnd.opacity(0.5))
            }
    }
}

// MARK: - Notifications Sheet

struct NotificationsSheet: View {
    @Environment(AuthStore.self) private var authStore
    @State private var notifications: [APINotification] = []
    @State private var isLoading = true
    @State private var isMarkingAllRead = false
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Group {
                if isLoading {
                    VStack {
                        Spacer()
                        ProgressView()
                            .tint(SabqTheme.primaryEnd)
                        Spacer()
                    }
                } else if notifications.isEmpty {
                    EmptyStateView(
                        icon: "bell.slash",
                        tint: SabqTheme.secondaryInk,
                        title: "لا توجد إشعارات",
                        subtitle: "ستظهر هنا الإشعارات الجديدة"
                    )
                } else {
                    ScrollView {
                        VStack(spacing: 0) {
                            ForEach(notifications) { notif in
                                notificationRow(notif)
                                Divider().foregroundStyle(SabqTheme.outline)
                            }
                        }
                        .padding(.horizontal, 16)
                    }
                }
            }
            .background(SabqTheme.background)
            .sabqRTL()
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button { dismiss() } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(.system(size: 22))
                            .foregroundStyle(SabqTheme.tertiaryInk)
                    }
                }
                ToolbarItem(placement: .principal) {
                    Text("الإشعارات")
                        .font(.system(size: 17, weight: .bold, design: .rounded))
                        .foregroundStyle(SabqTheme.ink)
                }
                ToolbarItem(placement: .primaryAction) {
                    Button {
                        Task {
                            guard !isMarkingAllRead else { return }
                            isMarkingAllRead = true
                            do {
                                try await APIClient.shared.markAllNotificationsRead()
                                for i in notifications.indices {
                                    notifications[i].isRead = true
                                }
                                await MainActor.run {
                                    authStore.markAllNotificationsReadLocally()
                                }
                            } catch {
                            }
                            isMarkingAllRead = false
                        }
                    } label: {
                        if isMarkingAllRead {
                            ProgressView()
                                .tint(SabqTheme.primaryEnd)
                        } else {
                            Text("قراءة الكل")
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundStyle(SabqTheme.primaryEnd)
                        }
                    }
                    .disabled(isMarkingAllRead || !notifications.contains(where: { !$0.isRead }))
                }
            }
            .task {
                notifications = await NewsService.fetchNotifications()
                isLoading = false
            }
        }
    }

    private func notificationRow(_ notif: APINotification) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Circle()
                .fill(notif.isRead ? SabqTheme.outline : SabqTheme.primaryEnd)
                .frame(width: 8, height: 8)
                .padding(.top, 6)

            VStack(alignment: .leading, spacing: 4) {
                if let title = notif.title {
                    Text(title)
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(SabqTheme.ink)
                }
                if let body = notif.body {
                    Text(body)
                        .font(.system(size: 14, weight: .regular))
                        .foregroundStyle(SabqTheme.secondaryInk)
                        .lineLimit(2)
                }
                if let date = notif.createdAt {
                    Text(date)
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(SabqTheme.tertiaryInk)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.vertical, 14)
    }
}
