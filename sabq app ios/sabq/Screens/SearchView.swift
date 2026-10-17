import SwiftUI
// Search analytics is emitted only after the API returns successfully.

struct SearchView: View {
    @Environment(ArticlesStore.self) private var articlesStore
    @Environment(BookmarksStore.self) private var bookmarksStore
    @State private var searchText = ""
    
    // لا قيم افتراضية وهمية: كانت «نيوم، رؤية 2030…» تظهر للمستخدم الجديد
    // بعنوان «عمليات بحث سابقة» وهو لم يبحث قط — القسم يختفي حتى أول بحث فعلي.
    @State private var recentSearches: [String] = {
        (UserDefaults.standard.stringArray(forKey: "sabq_recent_searches")) ?? []
    }()
    @State private var trendingKeywords: [String] = []
    @State private var suggestions: [String] = []
    @State private var apiResults: [Article] = []
    @State private var isSearching = false
    @State private var searchFailed = false
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
            VStack(alignment: .leading, spacing: SabqLayout.sectionGap) {
                Text("ابحث في آلاف الأخبار المحلية والعالمية")
                    .sabqText(SabqType.excerpt)
                    .foregroundStyle(SabqTheme.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)

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
            .padding(.horizontal, SabqLayout.pageMargin)
            .padding(.top, SabqLayout.space16)
            .padding(.bottom, SabqLayout.space32)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .background(SabqTheme.background)
        .sabqRTL()
        .sabqScreen("Search")
        .navigationTitle("البحث")
        .navigationBarTitleDisplayMode(.inline)
        .searchable(text: $searchText, placement: .navigationBarDrawer(displayMode: .always),
                    prompt: "ابحث عن خبر أو موضوع…")
        .onSubmit(of: .search) { performSearch() }
        .scrollDismissesKeyboard(.interactively)
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
                searchFailed = false
                isSearching = false
                return
            }
            searchFailed = false
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
        searchFailed = false
        let requestID = searchRequestID

        searchRequestTask = Task {
            do {
                let result = try await NewsService.searchResult(query: query)
                guard !Task.isCancelled else { return }
                await MainActor.run {
                    guard requestID == searchRequestID, submittedQuery == query else { return }
                    apiResults = result.articles
                    searchTotal = result.total
                    searchFailed = false
                    isSearching = false
                    SabqAnalytics.searchSucceeded(query: query)
                }
            } catch {
                guard !Task.isCancelled else { return }
                await MainActor.run {
                    guard requestID == searchRequestID, submittedQuery == query else { return }
                    let cached = articlesStore.search(query: query)
                    apiResults = cached
                    searchTotal = cached.count
                    searchFailed = true
                    isSearching = false
                }
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
        VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(suggestions.prefix(5).enumerated()), id: \.element) { index, suggestion in
                if index > 0 { SidebarRowDivider() }
                Button {
                    searchText = suggestion
                    performSearch()
                } label: {
                    queryRow(leading: Image(systemName: "magnifyingglass"), text: suggestion)
                }
                .buttonStyle(.plain)
            }
        }
    }

    /// صف استعلام على الصفحة: أيقونة هادئة، النص، وسهم «املأ البحث».
    private func queryRow(leading: some View, text: String) -> some View {
        HStack(spacing: SabqLayout.space12) {
            leading
                .font(SabqType.excerpt.font)
                .foregroundStyle(SabqTheme.textTertiary)
                .accessibilityHidden(true)

            Text(text)
                .font(SabqType.excerpt.font)
                .foregroundStyle(SabqTheme.textPrimary)

            Spacer(minLength: 0)

            Image(systemName: "arrow.up.backward")
                .font(SabqType.meta.font)
                .foregroundStyle(SabqTheme.textTertiary)
                .accessibilityHidden(true)
        }
        .padding(.vertical, SabqLayout.space12)
        .frame(minHeight: SabqLayout.touchTarget)
        .contentShape(Rectangle())
    }

    // MARK: - Trending

    private var trendingSection: some View {
        Group {
            if !trendingKeywords.isEmpty {
                VStack(alignment: .leading, spacing: SabqLayout.space4) {
                    DiscoverySectionHeading(title: "الأكثر بحثاً", subtitle: "المواضيع الرائجة الآن")

                    ForEach(Array(trendingKeywords.prefix(5).enumerated()), id: \.offset) { index, keyword in
                        if index > 0 { SidebarRowDivider() }
                        Button {
                            searchText = keyword
                            performSearch()
                        } label: {
                            HStack(spacing: SabqLayout.space12) {
                                Text("\(index + 1)")
                                    .font(SabqType.rowTitle.font)
                                    .foregroundStyle(index < 3 ? SabqTheme.primary : SabqTheme.textTertiary)
                                    .monospacedDigit()
                                    .frame(width: SabqLayout.space24)

                                Text(keyword)
                                    .font(SabqType.rowTitle.font)
                                    .foregroundStyle(SabqTheme.textPrimary)

                                Spacer(minLength: 0)

                                Image(systemName: "arrow.up.backward")
                                    .font(SabqType.meta.font)
                                    .foregroundStyle(SabqTheme.textTertiary)
                                    .accessibilityHidden(true)
                            }
                            .padding(.vertical, SabqLayout.space12)
                            .frame(minHeight: SabqLayout.touchTarget)
                            .contentShape(Rectangle())
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
                VStack(alignment: .leading, spacing: SabqLayout.space4) {
                    DiscoverySectionHeading(title: "عمليات البحث الأخيرة", subtitle: "اضغط للبحث مجدداً")

                    ForEach(Array(recentSearches.enumerated()), id: \.element) { index, search in
                        if index > 0 { SidebarRowDivider() }
                        Button {
                            searchText = search
                            performSearch()
                        } label: {
                            queryRow(leading: Image(systemName: "magnifyingglass"), text: search)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
    }

    // MARK: - Suggested Topics

    private var suggestedTopicsSection: some View {
        VStack(alignment: .leading, spacing: SabqLayout.space12) {
            DiscoverySectionHeading(title: "مواضيع مقترحة", subtitle: "استكشف مواضيع متنوعة")

            FlowLayout(spacing: SabqLayout.space8) {
                ForEach(suggestedTopics, id: \.self) { topic in
                    Button {
                        searchText = topic
                        performSearch()
                    } label: {
                        DiscoveryChip(title: topic, icon: "plus")
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    // MARK: - Search Results

    private var searchResultsSection: some View {
        VStack(alignment: .leading, spacing: SabqLayout.space8) {
            HStack(alignment: .firstTextBaseline) {
                Text("نتائج البحث")
                    .font(SabqType.sectionHeading.font)
                    .foregroundStyle(SabqTheme.textPrimary)
                    .accessibilityAddTraits(.isHeader)

                Spacer(minLength: 0)

                if isSearching {
                    ProgressView()
                        .tint(SabqTheme.primary)
                } else {
                    Text("\(searchTotal > 0 ? searchTotal : displayResults.count) نتيجة")
                        .font(SabqType.meta.font)
                        .foregroundStyle(SabqTheme.textTertiary)
                }
            }

            if isSearching && displayResults.isEmpty {
                ProgressView()
                    .frame(maxWidth: .infinity, minHeight: SabqLayout.controlHeight)
                    .accessibilityLabel("جارٍ البحث")
            } else if searchFailed && displayResults.isEmpty {
                ErrorStateView(
                    message: "تعذّر الاتصال للبحث. تحقق من اتصالك ثم أعد المحاولة.",
                    retryAction: performSearch
                )
            } else if displayResults.isEmpty && !isSearching {
                EmptyStateView(
                    icon: "magnifyingglass",
                    tint: SabqTheme.secondaryInk,
                    title: "لا توجد نتائج",
                    subtitle: "جرّب البحث بكلمات مختلفة"
                )
            } else {
                if searchFailed {
                    Text("تُعرض نتائج محفوظة من الجهاز")
                        .font(SabqType.meta.font)
                        .foregroundStyle(SabqTheme.textSecondary)
                }
                LazyVStack(alignment: .leading, spacing: 0) {
                    ForEach(Array(displayResults.enumerated()), id: \.element.id) { index, article in
                        if index > 0 {
                            SidebarRowDivider()
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
