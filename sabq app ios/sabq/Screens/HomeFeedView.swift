import SwiftUI

struct HomeFeedView: View {
    private static let scrollTopID = "home-feed-top"
    /// Ignore scroll-to-top when the reader is already near the header.
    private static let scrollToTopThreshold: CGFloat = 120

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
    /// Rich personal-journey insights (member-session only). Drives the
    /// inline metric tiles + interest chips in personalJourneyBlock.
    @State private var richInsights: APITodayInsights?
    @State private var latestOmq: APIDeepAnalysis?
    @State private var calendarToday: [APICalendarEvent] = []
    @State private var latestNewsletter: APIAudioNewsletter?
    /// Reactive handle on the notifications singleton so the header bell's
    /// red unread dot refreshes when push notifications arrive or the
    /// user marks them read.
    @State private var notificationsStore = NotificationsStore.shared
    @State private var scrollOffsetY: CGFloat = 0
    /// Drives the custom page-indicator row under the featured carousel.
    /// We hide TabView's built-in dots (they sit at the bottom of the
    /// TabView frame, which leaves a visible gap above them on short
    /// cards) and render our own tight against the card bottom.
    @State private var featuredIndex: Int = 0

    private var isContentReady: Bool {
        !articlesStore.allArticles.isEmpty || !articlesStore.featuredArticles.isEmpty
    }

    var body: some View {
        ScrollViewReader { scrollProxy in
            ScrollView(showsIndicators: false) {
                if isContentReady {
                    // 26pt outer spacing — gives the home feed enough
                    // breathing room between visually heterogeneous blocks
                    // (raw header → padded greeting card → breaking pill
                    // → stories rail → 420pt featured carousel → analytic
                    // cards → section previews). 20pt felt cramped right
                    // around the cards-to-section-preview transition.
                    VStack(alignment: .leading, spacing: 26) {
                        Color.clear
                            .frame(height: 0)
                            .id(Self.scrollTopID)

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

                    // Personal "knowledge journey" inline panel — signed-in
                    // users only. Renders the four metric tiles + interest
                    // chips directly (no navigation), mirroring the web's
                    // SmartSummaryBlock. Logged-out readers see nothing in
                    // this slot.
                    if authStore.isLoggedIn {
                        personalJourneyBlock
                            .animatedAppear(index: 4)
                    }

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
                    VStack(spacing: 0) {
                        Color.clear
                            .frame(height: 0)
                            .id(Self.scrollTopID)

                        HomeFeedSkeleton()
                    }
                    .padding(.horizontal, 16)
                    .padding(.top, 18)
                    .padding(.bottom, 40)
                }
            }
            .onScrollGeometryChange(for: CGFloat.self) { geo in
                geo.contentOffset.y
            } action: { _, y in
                scrollOffsetY = y
            }
            .onReceive(NotificationCenter.default.publisher(for: .sabqHomeScrollToTop)) { _ in
                guard scrollOffsetY > Self.scrollToTopThreshold else { return }
                withAnimation(.easeOut(duration: 0.28)) {
                    scrollProxy.scrollTo(Self.scrollTopID, anchor: .top)
                }
            }
        }
        .refreshable {
            SabqHaptics.medium()
            await articlesStore.loadArticles(ignoreCache: true)
        }
        .background(SabqTheme.background)
        .sabqRTL()
        .sabqScreen("Home")
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
            // Rich personal-journey insights (member-session only). Returns
            // nil for logged-out users so the block stays hidden cleanly.
            async let richJourney: APITodayInsights? = authStore.isLoggedIn
                ? (try? await APIClient.shared.fetchTodayInsightsRich())
                : nil

            if let v = await insights { todayInsights = v }
            latestOmq = (await omqList)?.analyses.first
            calendarToday = (await upcoming) ?? []
            latestNewsletter = (await newsletters)?.first
            richInsights = await richJourney

            // Fetch unread editorial-notification count so the header bell's
            // red dot reflects reality on first home-screen render after
            // launch (and on every pull-to-refresh).
            if authStore.isLoggedIn {
                if let page = try? await APIClient.shared.fetchEditorialNotifications() {
                    notificationsStore.unreadCount = page.unread
                }
            }
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

                // Editorial notifications bell — fast access to the user's
                // own notifications (article scheduled/published/rejected/
                // needs_revision/archived). Red dot when unread > 0. Visible
                // only when signed in; readers without editorial roles still
                // see it but its history is naturally empty.
                if authStore.isLoggedIn {
                    NavigationLink(value: EditorialNotificationsRoute()) {
                        ZStack(alignment: .topTrailing) {
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
                                Image(systemName: "bell.fill")
                                    .font(.system(size: 17, weight: .semibold))
                                    .foregroundStyle(SabqTheme.primaryEnd)
                            }
                            // Red unread dot — driven by NotificationsStore's
                            // `unreadCount` which the EditorialNotificationsView
                            // updates on every fetch.
                            if notificationsStore.unreadCount > 0 {
                                Circle()
                                    .fill(SabqTheme.coral)
                                    .frame(width: 10, height: 10)
                                    .overlay(
                                        Circle()
                                            .stroke(SabqTheme.background, lineWidth: 2)
                                    )
                                    .offset(x: 4, y: -4)
                            }
                        }
                    }
                    .buttonStyle(.plain)
                }

                // "لحظة بلحظة" entry point. The red pulsing dot was removed
                // to avoid confusing it with the editorial-notifications
                // unread indicator on the bell next to it — same colour
                // would have meant two different things side by side.
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
            .padding(.vertical, 6)
        }
    }

    // MARK: - Featured

    private var featuredSection: some View {
        let featured = Array(articlesStore.featuredArticles.prefix(3))
        return VStack(spacing: 10) {
            TabView(selection: $featuredIndex) {
                ForEach(Array(featured.enumerated()), id: \.element.id) { idx, article in
                    // VStack + trailing Spacer anchors the card to the top
                    // of its TabView page. Without this, TabView's default
                    // center-alignment lets a tall (3-line-title) card
                    // slide upward and clip against the section above it.
                    VStack(spacing: 0) {
                        NavigationLink(value: article) {
                            FeaturedArticleCard(
                                article: article,
                                onBookmark: { bookmarksStore.toggle(article.id, article: article) },
                                isBookmarked: bookmarksStore.isBookmarked(article.id)
                            )
                        }
                        .buttonStyle(.plain)
                        Spacer(minLength: 0)
                    }
                    .padding(.horizontal, 4)
                    .tag(idx)
                }
            }
            // System dots are hidden; we draw our own immediately below the
            // TabView so the indicator hugs the card instead of floating at
            // the bottom of the TabView frame with a Spacer-sized gap above.
            .tabViewStyle(.page(indexDisplayMode: .never))
            // 425pt covers the worst-case featured card: 200pt hero + 40pt
            // vertical padding + 3-line title (~80pt) + 12pt + 2-line
            // excerpt (~45pt) + 12pt + 30pt meta row + a few pt slack. Most
            // cards sit shorter than this; the Spacer inside still absorbs
            // the remainder so the card top stays pinned.
            .frame(height: 425)

            if featured.count > 1 {
                HStack(spacing: 7) {
                    ForEach(featured.indices, id: \.self) { i in
                        Circle()
                            .fill(i == featuredIndex
                                  ? SabqTheme.primaryEnd
                                  : SabqTheme.ink.opacity(0.30))
                            .frame(width: 7, height: 7)
                            .animation(.easeInOut(duration: 0.2), value: featuredIndex)
                    }
                }
                .frame(maxWidth: .infinity)
            }
        }
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
                HStack(alignment: .top) {
                    HStack(alignment: .top, spacing: 8) {
                        Image(systemName: "flame.fill")
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundStyle(.orange)
                            .padding(.top, 2)
                        VStack(alignment: .leading, spacing: 2) {
                            Text("الأكثر تداولاً")
                                .font(.system(size: 17, weight: .bold, design: .rounded))
                                .foregroundStyle(SabqTheme.ink)
                            Text("خلال آخر 48 ساعة")
                                .font(.system(size: 11, weight: .medium))
                                .foregroundStyle(SabqTheme.tertiaryInk)
                        }
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
            .aiImageBadgeOverlay(
                isVisible: opinion.isAiGeneratedImage,
                model: opinion.aiImageModel,
                inset: 6,
                sizeScale: 0.7
            )

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
                // LazyVStack so the home feed only materialises rows
                // for articles entering the viewport — previous plain
                // VStack rendered all ~15-50 CompactArticleRow views
                // upfront on every paginated `تحميل المزيد` tap.
                LazyVStack(alignment: .leading, spacing: 0) {
                    ForEach(Array(articlesStore.filteredArticles.enumerated()), id: \.element.id) { _, article in
                        NavigationLink(value: article) {
                            CompactArticleRow(
                                article: article,
                                onBookmark: { bookmarksStore.toggle(article.id, article: article) },
                                isBookmarked: bookmarksStore.isBookmarked(article.id)
                            )
                        }
                        .buttonStyle(.plain)
                        .padding(.vertical, 4)
                    }
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

        // Stable seed keyed off the calendar day so the rotated headline +
        // tip don't flicker between renders. Day of year drives the tip
        // (different tip each day); (day + hour-of-day quarter) drives the
        // headline (different headline each quarter of the day).
        let dayOfYear = Calendar.current.ordinality(of: .day, in: .year, for: Date()) ?? 1
        let quarterIndex: Int
        switch hour {
        case 5..<12:  quarterIndex = 0
        case 12..<17: quarterIndex = 1
        case 17..<21: quarterIndex = 2
        default:      quarterIndex = 3
        }

        // Prefer the backend-generated AI line when it actually comes back
        // with something — falls through to a SABQ-AI-branded static line
        // otherwise so the block never looks empty or generic.
        let backendAIPhrase = (todayInsights["phrase"]
            ?? todayInsights["headline"]
            ?? todayInsights["summary"]) ?? ""
        let headline: String = {
            let trimmed = backendAIPhrase.trimmingCharacters(in: .whitespacesAndNewlines)
            if !trimmed.isEmpty { return trimmed }
            return Self.sabqHeadlines[(dayOfYear + quarterIndex) % Self.sabqHeadlines.count]
        }()

        let tip = Self.sabqTips[dayOfYear % Self.sabqTips.count]

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
                HStack(spacing: 6) {
                    Text(greeting)
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(SabqTheme.secondaryInk)
                    // Tiny "SABQ AI" pill so the headline below clearly
                    // reads as machine-curated rather than editorial copy.
                    HStack(spacing: 3) {
                        Image(systemName: "sparkles")
                            .font(.system(size: 8, weight: .bold))
                        Text("SABQ AI")
                            .font(.system(size: 9, weight: .heavy))
                    }
                    .foregroundStyle(.white)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(
                        Capsule().fill(
                            LinearGradient(
                                colors: [SabqTheme.primaryEnd, tint],
                                startPoint: .leading,
                                endPoint: .trailing
                            )
                        )
                    )
                }

                Text(headline)
                    .font(.system(size: 16, weight: .heavy, design: .rounded))
                    .foregroundStyle(SabqTheme.ink)
                    .lineLimit(3)
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)

                Text(tip)
                    .font(.system(size: 11, weight: .medium))
                    .foregroundStyle(SabqTheme.tertiaryInk)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)
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

    // MARK: - Personal Journey Block (auth-gated)

    /// Compact inline "knowledge journey" panel for signed-in users —
    /// mirrors the web's SmartSummaryBlock. Renders the four metric tiles
    /// (reading time / completion / likes / comments) + interest chips
    /// directly on the home feed, no navigation. Uses the backend greeting
    /// when available so the user sees their actual name, falls back to a
    /// device-local time greeting otherwise.
    private var personalJourneyBlock: some View {
        VStack(alignment: .leading, spacing: 14) {
            journeyHeader
            journeyMetrics
            journeyInterests
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: SabqTheme.cardRadius, style: .continuous)
                .fill(.ultraThinMaterial)
        )
        .overlay(
            RoundedRectangle(cornerRadius: SabqTheme.cardRadius, style: .continuous)
                .stroke(SabqTheme.outline.opacity(0.5), lineWidth: 0.5)
        )
    }

    // MARK: Journey sub-views

    private var journeyHeader: some View {
        HStack(spacing: 12) {
            ZStack {
                Circle()
                    .fill(
                        LinearGradient(
                            colors: [
                                Color(red: 0.55, green: 0.36, blue: 0.92),
                                SabqTheme.primaryEnd
                            ],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .frame(width: 40, height: 40)
                Image(systemName: "sparkles")
                    .font(.system(size: 16, weight: .bold))
                    .foregroundStyle(.white)
            }

            VStack(alignment: .leading, spacing: 2) {
                Text(journeyGreeting)
                    .font(.system(size: 15, weight: .heavy, design: .rounded))
                    .foregroundStyle(SabqTheme.ink)
                    .lineLimit(1)
                    .minimumScaleFactor(0.85)
                Text("رحلتك المعرفية في سبق اليوم باختصار")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundStyle(SabqTheme.secondaryInk)
                    .lineLimit(1)
                    .minimumScaleFactor(0.9)
            }
            Spacer(minLength: 0)
        }
    }

    /// Backend greeting wins (includes the user's name); falls back to a
    /// device-local time greeting + firstName when offline.
    private var journeyGreeting: String {
        // Greeting word is ALWAYS computed from the device's local clock
        // — never from the backend. The Railway server runs in UTC, so
        // `new Date().getHours()` there returned 11 at 2 PM Riyadh and
        // sent back "صباح الخير" for the entire afternoon. The user's
        // own device knows their actual hour-of-day, so we trust it.
        // We still prefer the backend's *name* if it embeds one in the
        // greeting string (e.g. "صباح الخير يا علي" → pluck "علي").
        let hour = Calendar.current.component(.hour, from: Date())
        let word: String
        switch hour {
        case 5..<12:  word = "صباح الخير"
        case 12..<17: word = "نهارك سعيد"
        case 17..<21: word = "مساء الخير"
        default:      word = "ليلة سعيدة"
        }

        // Try to pluck the name from a backend greeting like
        // "صباح الخير يا علي" so we don't lose personalization. Falls
        // back to AuthStore's cached firstName, then to no-name.
        let nameFromBackend: String? = {
            let raw = (richInsights?.greeting ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            guard let range = raw.range(of: " يا ") else { return nil }
            let candidate = String(raw[range.upperBound...]).trimmingCharacters(in: .whitespacesAndNewlines)
            return candidate.isEmpty ? nil : candidate
        }()

        let firstName = nameFromBackend
            ?? authStore.currentUser?.firstName?.trimmingCharacters(in: .whitespacesAndNewlines)
            ?? ""
        return firstName.isEmpty ? word : "\(word) يا \(firstName)"
    }

    /// Four metric cells in a single row — intentionally bare. No per-cell
    /// icons or coloured backgrounds (the user explicitly asked us to stop
    /// "كثرة الأيقونات والألوان"). Just a number + label per cell, with a
    /// hairline divider between them and one accent for the unit.
    private var journeyMetrics: some View {
        HStack(spacing: 0) {
            metricCell(value: "\(richInsights?.metrics.readingTime ?? 0)", unit: "د", label: "وقت القراءة")
            metricDivider
            metricCell(value: "\(richInsights?.metrics.completionRate ?? 0)%", unit: nil, label: "الإكمال")
            metricDivider
            metricCell(value: "\(richInsights?.metrics.likes ?? 0)", unit: nil, label: "إعجابات")
            metricDivider
            metricCell(value: "\(richInsights?.metrics.comments ?? 0)", unit: nil, label: "تعليقات")
        }
        .padding(.vertical, 10)
        .padding(.horizontal, 4)
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(SabqTheme.paleFill.opacity(0.5))
        )
    }

    private func metricCell(value: String, unit: String?, label: String) -> some View {
        VStack(spacing: 4) {
            HStack(alignment: .firstTextBaseline, spacing: 2) {
                Text(value)
                    .font(.system(size: 17, weight: .heavy, design: .rounded))
                    .foregroundStyle(SabqTheme.ink)
                    .monospacedDigit()
                    .minimumScaleFactor(0.7)
                    .lineLimit(1)
                if let unit {
                    Text(unit)
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(SabqTheme.tertiaryInk)
                }
            }
            Text(label)
                .font(.system(size: 10, weight: .medium))
                .foregroundStyle(SabqTheme.tertiaryInk)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
        }
        .frame(maxWidth: .infinity)
    }

    private var metricDivider: some View {
        Rectangle()
            .fill(SabqTheme.outline.opacity(0.5))
            .frame(width: 0.5, height: 28)
    }

    /// Top-3 interest chips — minimal styling, one neutral capsule treatment
    /// (no per-chip colours).
    @ViewBuilder
    private var journeyInterests: some View {
        if let interests = richInsights?.topInterests, !interests.isEmpty {
            HStack(spacing: 6) {
                Text("اهتماماتك اليوم:")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(SabqTheme.tertiaryInk)
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 6) {
                        ForEach(interests, id: \.self) { name in
                            Text(name)
                                .font(.system(size: 11, weight: .semibold))
                                .foregroundStyle(SabqTheme.secondaryInk)
                                .padding(.horizontal, 9)
                                .padding(.vertical, 4)
                                .background(Capsule().fill(SabqTheme.paleFill))
                                .overlay(Capsule().stroke(SabqTheme.outline.opacity(0.5), lineWidth: 0.5))
                        }
                    }
                }
            }
        }
    }

    /// SABQ-AI-branded headlines for the greeting block. Picked by a stable
    /// (day-of-year + quarter-of-day) index so the line cycles four times a
    /// day without flickering between renders. Wording is deliberately
    /// product-flavoured — the user asked for "phrases related to the
    /// newspaper" rather than the previous editorial-tone copy.
    nonisolated static let sabqHeadlines: [String] = [
        "موجزك ينتظر اهتماماتك",
        "اختر ما يهمك وسبق ترتّب الباقي",
        "صفحتك الشخصية تبدأ من هنا",
        "أخبارك اليومية في مساحة واحدة",
        "اقتراحات أذكى كلما قرأت أكثر",
        "احفظ، تابع، واكتشف من حسابك",
        "موجز خاص بك داخل سبق",
        "ابدأ تجربة قراءة مصممة لك",
    ]

    /// Rotating in-app announcements / feature tips shown as the small line
    /// under the headline. Indexed by day-of-year so users see a different
    /// tip each day. Keep these short, action-oriented, and feature-true.
    nonisolated static let sabqTips: [String] = [
        "أنشئ حسابك لاختيار المحليات والرياضة والاقتصاد وما يهمك",
        "بعد التسجيل يظهر لك موجز يومي مبني على اهتماماتك",
        "حسابك يحفظ المقالات ويعيدها لك من أي جهاز",
        "كل قراءة تساعد سبق AI على تحسين الاقتراحات لك",
        "صفحة حسابك تجمع اهتماماتك ومحفوظاتك وإحصاءاتك",
        "اضغط هنا لمعاينة مزايا العضوية قبل التسجيل",
        "الموجز الشخصي يختصر لك أهم ما فاتك",
        "ابدأ بعضوية مجانية واجعل الصفحة الرئيسية أقرب لك",
        "اختر اهتماماتك مرة، ودع سبق ترتّب الأخبار لك",
    ]

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

extension Notification.Name {
    /// Posted when the user re-taps the Home tab while already on the feed.
    static let sabqHomeScrollToTop = Notification.Name("sabq.home.scrollToTop")
}
