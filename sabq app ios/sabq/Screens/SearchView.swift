import SwiftUI

struct SearchView: View {
    @Environment(ArticlesStore.self) private var articlesStore
    @Environment(BookmarksStore.self) private var bookmarksStore
    @State private var searchText = ""
    @FocusState private var isSearchFocused: Bool
    
    @State private var recentSearches: [String] = {
        (UserDefaults.standard.stringArray(forKey: "sabq_recent_searches")) ?? ["نيوم", "رؤية 2030", "الدوري السعودي", "أرامكو"]
    }()
    @State private var trendingKeywords: [String] = []
    @State private var suggestions: [String] = []
    @State private var apiResults: [Article] = []
    @State private var isSearching = false
    @State private var searchTotal = 0
    @State private var submittedQuery = ""
    @State private var searchTask: Task<Void, Never>?
    @State private var searchRequestTask: Task<Void, Never>?
    @State private var searchRequestID = 0

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
            VStack(alignment: .leading, spacing: 20) {
                CompactScreenHeader(
                    title: "البحث",
                    subtitle: "ابحث في آلاف الأخبار المحلية والعالمية"
                )

                SabqSearchBar(
                    text: $searchText,
                    placeholder: "ابحث عن خبر أو موضوع...",
                    onSubmit: { performSearch() },
                    focusState: $isSearchFocused
                )

                if searchText.isEmpty {
                    if !suggestions.isEmpty {
                        suggestionsSection
                    }
                    recentSearchesSection
                    trendingSection
                    suggestedTopicsSection
                } else {
                    if !suggestions.isEmpty {
                        suggestionsSection
                    }
                    searchResultsSection
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 18)
            .padding(.bottom, 40)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .background(SabqTheme.background)
        .sabqRTL()
        .task {
            trendingKeywords = await NewsService.fetchTrending()
            if trendingKeywords.isEmpty {
                trendingKeywords = articlesStore.trendingKeywords
            }
        }
        .onChange(of: searchText) { _, newValue in
            searchTask?.cancel()
            if newValue.isEmpty {
                searchRequestTask?.cancel()
                searchRequestID += 1
                suggestions = []
                apiResults = []
                submittedQuery = ""
                searchTotal = 0
                isSearching = false
                return
            }
            searchTask = Task {
                try? await Task.sleep(nanoseconds: 300_000_000)
                guard !Task.isCancelled else { return }
                let sug = await NewsService.fetchSearchSuggestions(query: newValue)
                guard !Task.isCancelled, searchText == newValue else { return }
                suggestions = sug
            }
        }
        .onDisappear {
            searchTask?.cancel()
            searchRequestTask?.cancel()
        }
    }

    private func performSearch() {
        let query = trimmedSearchText
        guard !query.isEmpty else { return }

        if searchText != query {
            searchText = query
        }

        saveRecentSearch(query)
        isSearching = true
        suggestions = []
        submittedQuery = query
        apiResults = []
        searchTotal = 0
        searchTask?.cancel()
        searchRequestTask?.cancel()
        searchRequestID += 1
        let requestID = searchRequestID

        searchRequestTask = Task {
            let result = await NewsService.search(query: query)
            guard !Task.isCancelled else { return }
            await MainActor.run {
                guard requestID == searchRequestID, submittedQuery == query else { return }
                apiResults = result.articles
                searchTotal = result.total
                isSearching = false
            }
        }
    }

    private func saveRecentSearch(_ query: String) {
        if !recentSearches.contains(query) {
            recentSearches.insert(query, at: 0)
            if recentSearches.count > 8 {
                recentSearches.removeLast()
            }
            UserDefaults.standard.set(recentSearches, forKey: "sabq_recent_searches")
        }
    }

    // MARK: - Suggestions (autocomplete)

    private var suggestionsSection: some View {
        VStack(alignment: .leading, spacing: 4) {
            ForEach(suggestions.prefix(5), id: \.self) { suggestion in
                Button {
                    searchText = suggestion
                    performSearch()
                } label: {
                    HStack(spacing: 10) {
                        Image(systemName: "magnifyingglass")
                            .font(.system(size: 13, weight: .medium))
                            .foregroundStyle(SabqTheme.tertiaryInk)

                        Text(suggestion)
                            .font(.system(size: 15, weight: .medium))
                            .foregroundStyle(SabqTheme.ink)

                        Spacer(minLength: 0)

                        Image(systemName: "arrow.up.left")
                            .font(.system(size: 12, weight: .medium))
                            .foregroundStyle(SabqTheme.tertiaryInk)
                    }
                    .padding(.vertical, 10)
                    .padding(.horizontal, 14)
                }
                .buttonStyle(.plain)
            }
        }
        .background(
            RoundedRectangle(cornerRadius: SabqTheme.chipRadius, style: .continuous)
                .fill(SabqTheme.surface)
                .shadow(color: SabqTheme.shadow, radius: 8, x: 0, y: 3)
        )
    }

    // MARK: - Trending

    private var trendingSection: some View {
        Group {
            if !trendingKeywords.isEmpty {
                SurfaceCard(accent: SabqTheme.coral) {
                    SectionHeader(
                        title: "الأكثر بحثاً",
                        subtitle: "المواضيع الرائجة الآن",
                        icon: "chart.line.uptrend.xyaxis",
                        tint: SabqTheme.coral
                    )

                    ForEach(Array(trendingKeywords.prefix(5).enumerated()), id: \.offset) { index, keyword in
                        Button {
                            searchText = keyword
                            performSearch()
                        } label: {
                            HStack(spacing: 12) {
                                Text("\(index + 1)")
                                    .font(.system(size: 16, weight: .bold, design: .rounded))
                                    .foregroundStyle(index < 3 ? SabqTheme.coral : SabqTheme.tertiaryInk)
                                    .monospacedDigit()
                                    .frame(width: 24)

                                Text(keyword)
                                    .font(.system(size: 15, weight: .semibold))
                                    .foregroundStyle(SabqTheme.ink)

                                Spacer(minLength: 0)

                                Image(systemName: "arrow.up.left")
                                    .font(.system(size: 12, weight: .medium))
                                    .foregroundStyle(SabqTheme.tertiaryInk)
                            }
                            .padding(.vertical, 4)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
    }

    // MARK: - Recent Searches

    private var recentSearchesSection: some View {
        Group {
            if !recentSearches.isEmpty {
                SurfaceCard {
                    SectionHeader(
                        title: "عمليات بحث سابقة",
                        subtitle: "اضغط للبحث مجدداً",
                        icon: "clock.arrow.circlepath",
                        tint: SabqTheme.secondaryInk
                    )

                    ForEach(recentSearches, id: \.self) { search in
                        Button {
                            searchText = search
                            performSearch()
                        } label: {
                            HStack(spacing: 10) {
                                Image(systemName: "magnifyingglass")
                                    .font(.system(size: 14, weight: .medium))
                                    .foregroundStyle(SabqTheme.tertiaryInk)

                                Text(search)
                                    .font(.system(size: 15, weight: .medium))
                                    .foregroundStyle(SabqTheme.ink)

                                Spacer(minLength: 0)

                                Image(systemName: "arrow.up.left")
                                    .font(.system(size: 13, weight: .medium))
                                    .foregroundStyle(SabqTheme.tertiaryInk)
                            }
                            .padding(.vertical, 6)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
    }

    // MARK: - Suggested Topics

    private var suggestedTopicsSection: some View {
        SurfaceCard(accent: SabqTheme.leaf) {
            SectionHeader(
                title: "مواضيع مقترحة",
                subtitle: "استكشف مواضيع متنوعة",
                icon: "sparkles",
                tint: SabqTheme.leaf
            )

            FlowLayout(spacing: 8) {
                ForEach(suggestedTopics, id: \.self) { topic in
                    Button {
                        searchText = topic
                        performSearch()
                    } label: {
                        HStack(spacing: 6) {
                            Image(systemName: "plus")
                                .font(.system(size: 11, weight: .bold))
                            Text(topic)
                                .font(.system(size: 13, weight: .semibold))
                        }
                        .foregroundStyle(SabqTheme.primaryStart)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 8)
                        .background(
                            Capsule(style: .continuous)
                                .fill(SabqTheme.primaryEnd.opacity(0.08))
                        )
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    // MARK: - Search Results

    private var searchResultsSection: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                Text("نتائج البحث")
                    .font(.system(size: 17, weight: .bold, design: .rounded))
                    .foregroundStyle(SabqTheme.ink)

                Spacer(minLength: 0)

                if isSearching {
                    ProgressView()
                        .tint(SabqTheme.primaryEnd)
                } else {
                    Text("\(searchTotal > 0 ? searchTotal : displayResults.count) نتيجة")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(SabqTheme.tertiaryInk)
                }
            }

            if displayResults.isEmpty && !isSearching {
                EmptyStateView(
                    icon: "magnifyingglass",
                    tint: SabqTheme.secondaryInk,
                    title: "لا توجد نتائج",
                    subtitle: "جرّب البحث بكلمات مختلفة"
                )
            } else {
                SurfaceCard {
                    ForEach(Array(displayResults.enumerated()), id: \.element.id) { index, article in
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
                        .simultaneousGesture(TapGesture().onEnded { saveRecentSearch(searchText) })
                    }
                }
            }
        }
    }

    private var suggestedTopics: [String] {
        if !trendingKeywords.isEmpty {
            return Array(trendingKeywords.suffix(from: min(5, trendingKeywords.count)).prefix(10))
        }
        return ["رؤية 2030", "نيوم", "الهلال", "أرامكو", "موسم الرياض", "كأس العالم", "تعليم", "فضاء", "سياحة", "ذكاء اصطناعي"]
    }
}
