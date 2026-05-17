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
    @FocusState private var isSearchFocused: Bool

    @State private var recentSearches: [String] = {
        UserDefaults.standard.stringArray(forKey: "sabq_recent_searches") ?? []
    }()
    @State private var trendingKeywords: [String] = []
    @State private var categoryCounts: [String: Int] = [:]
    @State private var apiResults: [Article] = []
    @State private var selectedCategory: ArticleCategory?
    @State private var isSearching = false
    @State private var submittedQuery = ""
    @State private var searchTask: Task<Void, Never>?

    private let columns = [
        GridItem(.flexible(), spacing: 14),
        GridItem(.flexible(), spacing: 14)
    ]

    private var trimmedSearchText: String {
        searchText.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var displayResults: [Article] {
        if trimmedSearchText == submittedQuery && !apiResults.isEmpty {
            return apiResults
        }
        return articlesStore.search(query: trimmedSearchText)
    }

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 22) {
                CompactScreenHeader(
                    title: "استكشف",
                    subtitle: "تصفّح الأقسام والمواضيع الأكثر تأثيراً"
                )
                .animatedAppear(index: 0)

                SabqSearchBar(
                    text: $searchText,
                    placeholder: "ابحث عن خبر أو موضوع…",
                    onSubmit: { performSearch() },
                    focusState: $isSearchFocused
                )
                .animatedAppear(index: 1)

                if trimmedSearchText.isEmpty {
                    idleContent
                } else {
                    searchContent
                }
            }
            .padding(.horizontal, 18)
            .padding(.top, 18)
            .padding(.bottom, 100)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .background(SabqTheme.background)
        .sabqRTL()
        .sabqScreen("Explore")
        .scrollDismissesKeyboard(.interactively)
        .sheet(item: $selectedCategory) { category in
            CategoryArticlesSheet(category: category)
        }
        .task {
            async let cats = NewsService.fetchCategories()
            async let keywords = NewsService.fetchTrending()

            for cat in await cats {
                if let slug = cat.slug, let count = cat.articlesCount {
                    categoryCounts[slug] = count
                }
            }

            let kw = await keywords
            if !kw.isEmpty {
                trendingKeywords = kw
            } else if !articlesStore.trendingKeywords.isEmpty {
                trendingKeywords = articlesStore.trendingKeywords
            }
        }
        .onChange(of: trimmedSearchText) { _, newValue in
            scheduleSearch(for: newValue)
        }
    }

    // MARK: - Idle content

    @ViewBuilder
    private var idleContent: some View {
        if !trendingKeywords.isEmpty {
            trendingPillsSection
                .animatedAppear(index: 2)
        }

        sectionsGridSection
            .animatedAppear(index: 3)

        if !recentSearches.isEmpty {
            recentSearchesSection
                .animatedAppear(index: 4)
        }
    }

    private var trendingPillsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionTitle(icon: "flame.fill", title: "الأكثر بحثاً", tint: SabqTheme.coral)

            FlowLayout(spacing: 8) {
                ForEach(trendingKeywords.prefix(14), id: \.self) { keyword in
                    NavigationLink(value: KeywordRoute(keyword: keyword)) {
                        Text("#\(keyword)")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(SabqTheme.ink)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 7)
                            .background(
                                Capsule(style: .continuous)
                                    .fill(SabqTheme.paleFill)
                            )
                            .overlay(
                                Capsule(style: .continuous)
                                    .stroke(SabqTheme.outline.opacity(0.35), lineWidth: 0.5)
                            )
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: SabqTheme.tileRadius, style: .continuous)
                .fill(SabqTheme.surface)
        )
        .overlay(
            RoundedRectangle(cornerRadius: SabqTheme.tileRadius, style: .continuous)
                .stroke(SabqTheme.outline.opacity(0.4), lineWidth: 0.5)
        )
    }

    private var sectionsGridSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionTitle(icon: "square.grid.2x2.fill", title: "تصفّح حسب التصنيف", tint: SabqTheme.primaryEnd)

            LazyVGrid(columns: columns, spacing: 14) {
                ForEach(Array(ArticleCategory.allCases.enumerated()), id: \.element.id) { _, category in
                    CategoryTile(
                        category: category,
                        articleCount: categoryCounts[category.slug]
                            ?? articlesStore.articleCount(for: category)
                    ) {
                        SabqHaptics.light()
                        selectedCategory = category
                    }
                }
            }
        }
    }

    private var recentSearchesSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                sectionTitle(icon: "clock.arrow.circlepath", title: "آخر عمليات البحث", tint: SabqTheme.secondaryInk)
                Spacer(minLength: 0)
                Button("مسح") {
                    recentSearches.removeAll()
                    UserDefaults.standard.set([String](), forKey: "sabq_recent_searches")
                }
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(SabqTheme.tertiaryInk)
            }

            FlowLayout(spacing: 8) {
                ForEach(recentSearches.prefix(10), id: \.self) { recent in
                    Button {
                        searchText = recent
                        performSearch()
                    } label: {
                        HStack(spacing: 5) {
                            Image(systemName: "magnifyingglass")
                                .font(.system(size: 10, weight: .semibold))
                            Text(recent)
                                .font(.system(size: 12, weight: .medium))
                        }
                        .foregroundStyle(SabqTheme.secondaryInk)
                        .padding(.horizontal, 11)
                        .padding(.vertical, 7)
                        .background(
                            Capsule(style: .continuous)
                                .fill(SabqTheme.softFill)
                        )
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
            VStack(spacing: 14) {
                SkeletonBox(height: 90, radius: SabqTheme.tileRadius)
                SkeletonBox(height: 90, radius: SabqTheme.tileRadius)
                SkeletonBox(height: 90, radius: SabqTheme.tileRadius)
            }
            .animatedAppear(index: 2)
        } else if displayResults.isEmpty {
            EmptyStateView(
                icon: "doc.text.magnifyingglass",
                tint: SabqTheme.tertiaryInk,
                title: "لا توجد نتائج",
                subtitle: "جرّب كلمات مختلفة أو تصفّح الأقسام بالأسفل."
            )
            .animatedAppear(index: 2)
        } else {
            VStack(alignment: .leading, spacing: 14) {
                Text("\(displayResults.count) نتيجة")
                    .font(.system(size: 12, weight: .semibold))
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
                    .animatedAppear(index: index + 2)
                }
            }
        }
    }

    // MARK: - Helpers

    private func sectionTitle(icon: String, title: String, tint: Color) -> some View {
        HStack(spacing: 6) {
            Image(systemName: icon)
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(tint)
            Text(title)
                .font(.system(size: 14, weight: .bold))
                .foregroundStyle(SabqTheme.ink)
            Spacer(minLength: 0)
        }
    }

    private func scheduleSearch(for query: String) {
        searchTask?.cancel()
        guard !query.isEmpty else {
            apiResults = []
            submittedQuery = ""
            isSearching = false
            return
        }
        searchTask = Task {
            try? await Task.sleep(nanoseconds: 350_000_000)
            if Task.isCancelled { return }
            await runSearch(query: query)
        }
    }

    private func performSearch() {
        let q = trimmedSearchText
        guard !q.isEmpty else { return }
        if !recentSearches.contains(q) {
            recentSearches.insert(q, at: 0)
            recentSearches = Array(recentSearches.prefix(10))
            UserDefaults.standard.set(recentSearches, forKey: "sabq_recent_searches")
        }
        Task { await runSearch(query: q) }
    }

    private func runSearch(query: String) async {
        isSearching = true
        defer { isSearching = false }
        let result = await NewsService.search(query: query)
        if trimmedSearchText == query {
            apiResults = result.articles
            submittedQuery = query
        }
    }
}
