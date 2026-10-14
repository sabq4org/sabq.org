import SwiftUI

// Unified "استكشف" surface — merges the old Sections / Search / Trending tabs
// into a single calm discovery view (matches the Passport sheet aesthetic the
// user called out as the reference).
//
// Layout intent (top → bottom):
//   1. Calm screen header (title + subtitle)
//   2. Glass search bar (sticky-feeling)
//   3a. While typing: live search results
//   3b. Idle: trending keywords flow → category grid → suggested topics
struct ExploreView: View {
    @Environment(ArticlesStore.self) private var articlesStore
    @Environment(BookmarksStore.self) private var bookmarksStore

    @State private var searchText = ""
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @State private var requestID = UUID()

    @State private var recentSearches: [String] = {
        UserDefaults.standard.stringArray(forKey: "sabq_recent_searches") ?? []
    }()
    @State private var apiResults: [Article] = []
    @State private var isSearching = false
    @State private var searchFailed = false
    @State private var submittedQuery = ""
    @State private var searchTask: Task<Void, Never>?
    @State private var scrollRequest = 0

    private let resultsAnchor = "explore-results-top"

    private var columns: [GridItem] {
        [GridItem(.adaptive(minimum: dynamicTypeSize.isAccessibilitySize ? 280 : 155), spacing: 14)]
    }

    private var trimmedSearchText: String {
        searchText.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var displayResults: [Article] {
        if trimmedSearchText == submittedQuery {
            return apiResults
        }
        return articlesStore.search(query: trimmedSearchText)
    }

    private var localResults: [Article] { articlesStore.search(query: trimmedSearchText) }

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: SabqLayout.space24) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("اكتشف ما يحدث")
                            .font(SabqFonts.display(size: 28, weight: .heavy))
                            .foregroundStyle(SabqTheme.ink)
                            .accessibilityAddTraits(.isHeader)
                        Text("الأقسام بآخر صورها، والنشرات الصوتية، وبحث في كل سبق")
                            .font(SabqType.body)
                            .foregroundStyle(SabqTheme.secondaryInk)
                            .fixedSize(horizontal: false, vertical: true)
                    }

                    if trimmedSearchText.isEmpty {
                        idleContent
                    } else {
                        searchContent
                    }
                }
                .padding(.horizontal, SabqLayout.pageInset)
                .padding(.top, SabqLayout.space16)
                .padding(.bottom, SabqLayout.space24)
                .frame(maxWidth: .infinity, alignment: .leading)
                .id(resultsAnchor)
            }
            .background(SabqTheme.background)
            .onChange(of: scrollRequest) { _, _ in
                proxy.scrollTo(resultsAnchor, anchor: .top)
            }
        }
        .navigationTitle("استكشف")
        .navigationBarTitleDisplayMode(.inline)
        .searchable(text: $searchText, placement: .navigationBarDrawer(displayMode: .always),
                    prompt: "ابحث عن خبر أو موضوع…")
        .onSubmit(of: .search) { performSearch() }
        .sabqRTL()
        .sabqScreen("Explore")
        .scrollDismissesKeyboard(.interactively)

        .onChange(of: trimmedSearchText) { _, newValue in
            scheduleSearch(for: newValue)
        }
        .onAppear {
            if !trimmedSearchText.isEmpty && trimmedSearchText != submittedQuery {
                scheduleSearch(for: trimmedSearchText)
            }
        }
        .onDisappear {
            searchTask?.cancel()
            requestID = UUID()
            isSearching = false
        }
    }

    // MARK: - Idle content

    @ViewBuilder
    private var idleContent: some View {
        sectionsGridSection

        audioCard

        if !recentSearches.isEmpty {
            recentSearchesSection
        }
    }

    /// أحدث خبر بصورة في كل قسم من الأخبار المحمّلة — يغذّي صورة البطاقة ووقتها.
    private var latestByCategory: [ArticleCategory: Article] {
        var map: [ArticleCategory: Article] = [:]
        for article in articlesStore.allArticles where article.imageURL?.isEmpty == false {
            if let current = map[article.category], current.publishDate >= article.publishDate { continue }
            map[article.category] = article
        }
        return map
    }

    private var sectionsGridSection: some View {
        let latest = latestByCategory
        let pictured = ArticleCategory.allCases.filter { latest[$0] != nil }
        let plain = ArticleCategory.allCases.filter { latest[$0] == nil }
        let compactColumns = [GridItem(.adaptive(minimum: dynamicTypeSize.isAccessibilitySize ? 200 : 100), spacing: 8)]
        return VStack(alignment: .leading, spacing: SabqLayout.space12) {
            Text("الأقسام")
                .font(SabqFonts.display(size: 21, weight: .heavy))
                .foregroundStyle(SabqTheme.ink)
                .accessibilityAddTraits(.isHeader)

            LazyVGrid(columns: columns, spacing: SabqLayout.space12) {
                ForEach(pictured) { category in
                    NavigationLink(value: category) {
                        InkCategoryTile(category: category, latest: latest[category])
                    }
                    .buttonStyle(.plain)
                }
            }

            if !plain.isEmpty {
                LazyVGrid(columns: compactColumns, spacing: 8) {
                    ForEach(plain) { category in
                        NavigationLink(value: category) {
                            Text(category.title)
                                .font(SabqFonts.app(size: 15, weight: .semibold))
                                .foregroundStyle(SabqTheme.ink)
                                .frame(maxWidth: .infinity, minHeight: 50)
                                .background(InkSky.card, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                                .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(InkSky.line, lineWidth: 1))
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
    }

    /// «سبق بصوت» على الحبر — مدخل النشرات الصوتية.
    private var audioCard: some View {
        NavigationLink(value: AudioNewslettersRoute()) {
            VStack(alignment: .leading, spacing: 12) {
                HStack(spacing: 10) {
                    Image(systemName: "headphones")
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundStyle(InkSky.sky)
                        .accessibilityHidden(true)
                    Text("سبق بصوت")
                        .font(SabqFonts.display(size: 18, weight: .bold))
                        .foregroundStyle(.white)
                    Spacer(minLength: 0)
                    InkSkyWave(activeCount: 4, active: InkSky.sky, idle: .white.opacity(0.25),
                               heights: [8, 14, 20, 12, 22, 16, 10, 18])
                }
                Text("النشرات الصوتية وموجز اليوم — في الطريق أو قبل النوم.")
                    .font(SabqFonts.app(size: 14, weight: .regular))
                    .foregroundStyle(.white.opacity(0.75))
                    .fixedSize(horizontal: false, vertical: true)
                HStack(spacing: 8) {
                    Image(systemName: "play.fill")
                        .font(.system(size: 13, weight: .bold))
                    Text("استمع للنشرات")
                        .font(SabqFonts.app(size: 14, weight: .bold))
                }
                .foregroundStyle(InkSky.ink)
                .padding(.horizontal, 16)
                .frame(height: 44)
                .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(InkSky.sky))
            }
            .padding(18)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(InkSky.ink, in: RoundedRectangle(cornerRadius: InkSky.cardRadius, style: .continuous))
        }
        .buttonStyle(.plain)
    }

    private var recentSearchesSection: some View {
        VStack(alignment: .leading, spacing: SabqLayout.space12) {
            HStack {
                sectionTitle(icon: "clock.arrow.circlepath", title: "عمليات البحث الأخيرة", tint: SabqTheme.secondaryInk)
                Spacer(minLength: 0)
                Button("مسح السجل") {
                    recentSearches.removeAll()
                    UserDefaults.standard.set([String](), forKey: "sabq_recent_searches")
                }
                .font(SabqType.caption)
                .foregroundStyle(SabqTheme.tertiaryInk)
            }

            FlowLayout(spacing: 8) {
                ForEach(recentSearches.prefix(10), id: \.self) { recent in
                    Button {
                        searchText = recent
                        performSearch(query: recent)
                    } label: {
                        HStack(spacing: 5) {
                            Image(systemName: "magnifyingglass")
                                .font(SabqFonts.app(size: 10, weight: .regular))
                            Text(recent)
                                .font(SabqFonts.app(size: 12, weight: .medium))
                        }
                        .foregroundStyle(SabqTheme.secondaryInk)
                        .padding(.horizontal, SabqLayout.space12)
                        .padding(.vertical, SabqLayout.space8)
                        .frame(minHeight: SabqLayout.touchTarget)
                        .background(InkSky.card, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).stroke(InkSky.line, lineWidth: 1))
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    // MARK: - Search content

    @ViewBuilder
    private var searchContent: some View {
        if isSearching && displayResults.isEmpty {
            VStack(spacing: SabqLayout.space16) {
                SkeletonBox(height: 90, radius: SabqTheme.tileRadius)
                SkeletonBox(height: 90, radius: SabqTheme.tileRadius)
                SkeletonBox(height: 90, radius: SabqTheme.tileRadius)
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("جارٍ البحث")

        } else if searchFailed && displayResults.isEmpty {
            ErrorStateView(
                message: "تعذّر الاتصال للبحث. تحقق من اتصالك ثم أعد المحاولة.",
                retryAction: { performSearch() }
            )

        } else if displayResults.isEmpty {
            EmptyStateView(
                icon: "doc.text.magnifyingglass",
                tint: SabqTheme.tertiaryInk,
                title: "لا توجد نتائج",
                subtitle: "جرّب كلمة أخرى أو امسح البحث لتصفح التصنيفات."
            )

        } else {
            VStack(alignment: .leading, spacing: 14) {
                if searchFailed {
                    Text("تُعرض نتائج محفوظة من الجهاز")
                        .font(SabqType.caption)
                        .foregroundStyle(SabqTheme.secondaryInk)
                }
                Text("\(displayResults.count) نتيجة")
                    .font(SabqType.caption)
                    .foregroundStyle(SabqTheme.tertiaryInk)

                ForEach(Array(displayResults.enumerated()), id: \.element.id) { index, article in
                    NavigationLink(value: article) {
                        CompactArticleRow(
                            article: article,
                            onBookmark: {
                                SabqHaptics.medium()
                                bookmarksStore.toggle(article.id, article: article)
                            },
                            isBookmarked: bookmarksStore.isBookmarked(article.id)
                        )
                    }
                    .buttonStyle(.plain)

                }
            }
        }
    }

    // MARK: - Helpers

    private func sectionTitle(icon: String, title: String, tint: Color) -> some View {
        HStack(spacing: 6) {
            Image(systemName: icon)
                .font(SabqFonts.app(size: 11, weight: .regular))
                .foregroundStyle(tint)
            Text(title)
                .font(SabqType.sectionTitle)
                .foregroundStyle(SabqTheme.ink)
            Spacer(minLength: 0)
        }
    }

    private func scheduleSearch(for query: String) {
        searchTask?.cancel()
        requestID = UUID()
        isSearching = false
        searchFailed = false
        guard !query.isEmpty else {
            apiResults = []
            submittedQuery = ""
            isSearching = false
            scrollRequest &+= 1
            return
        }
        searchTask = Task {
            try? await Task.sleep(nanoseconds: 350_000_000)
            if Task.isCancelled { return }
            await runSearch(query: query)
        }
    }

    private func performSearch(query explicitQuery: String? = nil) {
        let q = (explicitQuery ?? trimmedSearchText).trimmingCharacters(in: .whitespacesAndNewlines)
        guard !q.isEmpty else { return }
        if !recentSearches.contains(q) {
            recentSearches.insert(q, at: 0)
            recentSearches = Array(recentSearches.prefix(10))
            UserDefaults.standard.set(recentSearches, forKey: "sabq_recent_searches")
        }
        searchTask?.cancel()
        searchTask = Task { await runSearch(query: q) }
        searchFailed = false
        scrollRequest &+= 1
    }

    private func runSearch(query: String) async {
        let id = UUID()
        requestID = id
        isSearching = true
        do {
            let result = try await NewsService.searchResult(query: query)
            guard !Task.isCancelled, requestID == id, trimmedSearchText == query else { return }
            apiResults = result.articles
            submittedQuery = query
            searchFailed = false
            isSearching = false
        } catch {
            guard !Task.isCancelled, requestID == id, trimmedSearchText == query else { return }
            apiResults = localResults
            submittedQuery = query
            searchFailed = true
            isSearching = false
        }
    }
}

/// بطاقة قسم بصورة آخر خبر فيه، واسمه بخط العرض فوق حبر متدرّج.
struct InkCategoryTile: View {
    let category: ArticleCategory
    let latest: Article?

    var body: some View {
        ZStack(alignment: .bottomLeading) {
            Color.clear
                .overlay {
                    if let s = latest?.imageURL, let url = URL(string: s) {
                        FocalCachedAsyncImage(url: url, focalPoint: latest?.imageFocalPoint, maxPixelSize: 600) {
                            InkSky.inkRaised
                        }
                    } else {
                        InkSky.inkRaised
                    }
                }
                .clipped()

            LinearGradient(
                stops: [
                    .init(color: InkSky.ink.opacity(0.05), location: 0),
                    .init(color: InkSky.ink.opacity(0.88), location: 1),
                ],
                startPoint: .top, endPoint: .bottom
            )

            VStack(alignment: .leading, spacing: 2) {
                Text(category.title)
                    .font(SabqFonts.display(size: 21, weight: .heavy))
                    .foregroundStyle(.white)
                if let latest {
                    Text("آخر خبر \(InkFormat.ago(latest.publishDate))")
                        .font(SabqFonts.app(size: 12, weight: .regular))
                        .foregroundStyle(.white.opacity(0.78))
                }
            }
            .padding(14)
        }
        .frame(height: 136)
        .frame(maxWidth: .infinity)
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        .contentShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        .accessibilityElement(children: .combine)
    }
}
