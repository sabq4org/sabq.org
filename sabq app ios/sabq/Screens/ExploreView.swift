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
    @State private var submittedQuery = ""
    @State private var searchTask: Task<Void, Never>?

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

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 22) {
                Text("تصفّح الأقسام والمواضيع الأكثر تأثيراً")
                    .font(SabqFonts.editorial(.subheadline, size: 14))
                    .foregroundStyle(SabqTheme.secondaryInk)
                    .fixedSize(horizontal: false, vertical: true)

                if trimmedSearchText.isEmpty {
                    idleContent
                } else {
                    searchContent
                }
            }
            .padding(.horizontal, 18)
            .padding(.top, 18)
            .padding(.bottom, 24)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .background(SabqTheme.background)
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
            .animatedAppear(index: 3)

        if !recentSearches.isEmpty {
            recentSearchesSection
                .animatedAppear(index: 4)
        }
    }

    private var sectionsGridSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionTitle(icon: "square.grid.2x2.fill", title: "تصفّح حسب التصنيف", tint: SabqTheme.primaryEnd)

            LazyVGrid(columns: columns, spacing: 14) {
                ForEach(Array(ArticleCategory.allCases.enumerated()), id: \.element.id) { _, category in
                    NavigationLink(value: category) {
                        CategoryTile(category: category)
                    }
                    .buttonStyle(.plain)
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
                .font(SabqFonts.app(size: 11, weight: .regular))
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
                                .font(SabqFonts.app(size: 10, weight: .regular))
                            Text(recent)
                                .font(SabqFonts.app(size: 12, weight: .medium))
                        }
                        .foregroundStyle(SabqTheme.secondaryInk)
                        .padding(.horizontal, 11)
                        .padding(.vertical, 7)
                        .frame(minHeight: 44)
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
                    .font(SabqFonts.app(size: 11, weight: .regular))
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
                .font(SabqFonts.app(size: 11, weight: .regular))
                .foregroundStyle(tint)
            Text(title)
                .font(SabqFonts.app(size: 14, weight: .bold))
                .foregroundStyle(SabqTheme.ink)
            Spacer(minLength: 0)
        }
    }

    private func scheduleSearch(for query: String) {
        searchTask?.cancel()
        requestID = UUID()
        isSearching = false
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
        searchTask?.cancel()
        searchTask = Task { await runSearch(query: q) }
    }

    private func runSearch(query: String) async {
        let id = UUID()
        requestID = id
        isSearching = true
        let result = await NewsService.search(query: query)
        guard !Task.isCancelled, requestID == id, trimmedSearchText == query else { return }
        apiResults = result.articles
        submittedQuery = query
        isSearching = false
    }
}
