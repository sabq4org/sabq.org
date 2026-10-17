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
        [GridItem(.adaptive(minimum: dynamicTypeSize.isAccessibilitySize ? 280 : 155), spacing: SabqLayout.space12)]
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
                    Text("تصفّح الأقسام والمواضيع الأكثر تأثيراً")
                        .sabqText(SabqType.excerpt)
                        .foregroundStyle(SabqTheme.textSecondary)
                        .fixedSize(horizontal: false, vertical: true)

                    if trimmedSearchText.isEmpty {
                        idleContent
                    } else {
                        searchContent
                    }
                }
                .padding(.horizontal, SabqLayout.pageMargin)
                .padding(.top, SabqLayout.space16)
                .padding(.bottom, SabqLayout.space32)
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

        if !recentSearches.isEmpty {
            SabqSectionBand()
            recentSearchesSection
        }
    }

    private var sectionsGridSection: some View {
        VStack(alignment: .leading, spacing: SabqLayout.space12) {
            DiscoverySectionHeading(title: "التصنيفات")

            LazyVGrid(columns: columns, spacing: SabqLayout.space12) {
                ForEach(Array(ArticleCategory.allCases.enumerated()), id: \.element.id) { _, category in
                    NavigationLink(value: category) {
                        DiscoveryCategoryTile(category: category)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private var recentSearchesSection: some View {
        VStack(alignment: .leading, spacing: SabqLayout.space12) {
            HStack(alignment: .firstTextBaseline) {
                DiscoverySectionHeading(title: "عمليات البحث الأخيرة")
                Spacer(minLength: SabqLayout.space8)
                Button("مسح السجل") {
                    recentSearches.removeAll()
                    UserDefaults.standard.set([String](), forKey: "sabq_recent_searches")
                }
                .font(SabqType.meta.font)
                .foregroundStyle(SabqTheme.primary)
                .frame(minHeight: SabqLayout.touchTarget)
            }

            FlowLayout(spacing: SabqLayout.space8) {
                ForEach(recentSearches.prefix(10), id: \.self) { recent in
                    Button {
                        searchText = recent
                        performSearch(query: recent)
                    } label: {
                        DiscoveryChip(title: recent, icon: "magnifyingglass")
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
            DiscoveryListSkeleton(count: 3)
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
            VStack(alignment: .leading, spacing: 0) {
                VStack(alignment: .leading, spacing: SabqLayout.space4) {
                    if searchFailed {
                        Text("تُعرض نتائج محفوظة من الجهاز")
                            .font(SabqType.meta.font)
                            .foregroundStyle(SabqTheme.textSecondary)
                    }
                    Text("\(displayResults.count) نتيجة")
                        .font(SabqType.meta.font)
                        .foregroundStyle(SabqTheme.textTertiary)
                }

                ForEach(Array(displayResults.enumerated()), id: \.element.id) { index, article in
                    if index > 0 { SidebarRowDivider() }
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

// MARK: - Discovery building blocks
//
// قطع مشتركة لشاشات الاستكشاف (استكشف، الأقسام، البحث، الرائج، المحفوظات…)
// على نموذج الرئيسية المعتمد: أقسام بلا صناديق، عنوان 20، وبلاطات هادئة.

/// رأس قسم بشريط عمودي بهوية سبق: عنوان 20 وسطر سياق اختياري.
struct DiscoverySectionHeading: View {
    let title: String
    var subtitle: String? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: SabqLayout.space4) {
            HStack(alignment: .center, spacing: 8) {
                Capsule(style: .continuous)
                    .fill(SabqTheme.primary)
                    .frame(width: 4, height: 18)
                    .accessibilityHidden(true)

                Text(title)
                    .font(SabqType.sectionHeading.font)
                    .foregroundStyle(SabqTheme.textPrimary)
                    .accessibilityAddTraits(.isHeader)
            }
            if let subtitle {
                Text(subtitle)
                    .font(SabqType.meta.font)
                    .foregroundStyle(SabqTheme.textTertiary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// بلاطة تصنيف هادئة: تعبئة سماوية هادئة بزوايا 12 وحدود سماوية ناعمة وأيقونة بهوية سبق.
struct DiscoveryCategoryTile: View {
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    let category: ArticleCategory

    var body: some View {
        VStack(alignment: .leading, spacing: SabqLayout.space12) {
            Image(systemName: category.icon)
                .font(.system(size: 18, weight: .semibold))
                .foregroundStyle(SabqTheme.primary)
                .frame(width: 38, height: 38)
                .background(
                    RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous)
                        .fill(SabqTheme.surface)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous)
                        .strokeBorder(SabqTheme.skyOutline, lineWidth: 0.75)
                )
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: SabqLayout.space4) {
                Text(category.title)
                    .sabqText(SabqType.rowTitle)
                    .foregroundStyle(SabqTheme.textPrimary)

                Group {
                    if dynamicTypeSize.isAccessibilitySize {
                        Text(category.subtitle)
                    } else {
                        Text(category.subtitle).lineLimit(2, reservesSpace: true)
                    }
                }
                .font(SabqType.meta.font)
                .foregroundStyle(SabqTheme.textSecondary)
                .fixedSize(horizontal: false, vertical: true)
                .multilineTextAlignment(.leading)
            }
        }
        .padding(SabqLayout.space16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .sabqBlockSurface()
        .contentShape(RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous))
    }
}

/// شريحة هادئة (كلمة مفتاحية، بحث سابق): كبسولة surfaceMuted بنص أساسي،
/// ومساحة لمس 44 نقطة.
struct DiscoveryChip: View {
    let title: String
    var icon: String? = nil

    var body: some View {
        HStack(spacing: SabqLayout.space4) {
            if let icon {
                Image(systemName: icon)
                    .font(SabqType.tag.font)
                    .foregroundStyle(SabqTheme.textSecondary)
                    .accessibilityHidden(true)
            }
            Text(title)
                .font(SabqType.tag.font)
                .foregroundStyle(SabqTheme.textPrimary)
        }
        .padding(.horizontal, SabqLayout.space12)
        .padding(.vertical, SabqLayout.space8)
        .frame(minHeight: 36)
        .background(Capsule(style: .continuous).fill(SabqTheme.surfaceMuted))
        .frame(minHeight: SabqLayout.touchTarget)
        .contentShape(Rectangle())
    }
}

/// هيكل تحميل بمقاس `CompactArticleRow`: سطرا عنوان وسطر بيانات ومصغّرة 112×63.
struct DiscoveryRowSkeleton: View {
    var body: some View {
        HStack(alignment: .top, spacing: SabqLayout.space12) {
            VStack(alignment: .leading, spacing: SabqLayout.space8) {
                SkeletonBox(height: 16, radius: SabqRadius.small)
                SkeletonBox(width: 180, height: 16, radius: SabqRadius.small)
                SkeletonBox(width: 110, height: 12, radius: SabqRadius.small)
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            SkeletonBox(width: 112, height: 63, radius: SabqRadius.small)
        }
        .padding(.vertical, SabqLayout.rowPadding)
        .accessibilityHidden(true)
    }
}

/// قائمة هياكل تحميل مفصولة بخطوط رفيعة، كما تظهر القائمة بعد التحميل.
struct DiscoveryListSkeleton: View {
    var count: Int = 5

    var body: some View {
        VStack(spacing: 0) {
            ForEach(0..<count, id: \.self) { index in
                if index > 0 { SidebarRowDivider() }
                DiscoveryRowSkeleton()
            }
        }
    }
}
