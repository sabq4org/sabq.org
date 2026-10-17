import SwiftUI

struct SectionsView: View {
    @Environment(ArticlesStore.self) private var articlesStore
    @Environment(BookmarksStore.self) private var bookmarksStore
    @State private var trendingTags: [String] = []

    private let columns = SabqGrid.adaptive(spacing: SabqLayout.space12)

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: SabqLayout.space24) {
                SabqPageIntro("تصفح الأخبار حسب التصنيف")

                LazyVGrid(columns: columns, spacing: SabqLayout.space12) {
                    ForEach(Array(ArticleCategory.allCases.enumerated()), id: \.element.id) { index, category in
                        NavigationLink(value: category) {
                            DiscoveryCategoryTile(category: category)
                        }
                        .buttonStyle(.plain)
                        .animatedAppear(index: index)
                    }
                }

                SabqSectionBand()

                trendingTagsSection
            }
            .padding(.horizontal, SabqLayout.pageMargin)
            .padding(.top, SabqLayout.space16)
            .padding(.bottom, SabqLayout.space32)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .navigationTitle("الأقسام")
        .navigationBarTitleDisplayMode(.inline)
        .background(SabqTheme.background)
        .sabqRTL()
        .navigationDestination(for: ArticleCategory.self) { category in
            CategoryArticlesView(category: category)
                .duoContentInsets()
        }
        .task {
            let fetchedKeywords = await NewsService.fetchTrending()
            if !fetchedKeywords.isEmpty {
                trendingTags = fetchedKeywords
            } else if !articlesStore.trendingKeywords.isEmpty {
                trendingTags = articlesStore.trendingKeywords
            } else {
                trendingTags = fallbackTags
            }
        }
    }

    private var trendingTagsSection: some View {
        VStack(alignment: .leading, spacing: SabqLayout.space12) {
            DiscoverySectionHeading(title: "الكلمات المفتاحية", subtitle: "أكثر المواضيع بحثاً")

            FlowLayout(spacing: SabqLayout.space8) {
                ForEach(trendingTags, id: \.self) { tag in
                    NavigationLink(value: KeywordRoute(keyword: tag)) {
                        DiscoveryChip(title: tag)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private var fallbackTags: [String] {
        ["رؤية 2030", "نيوم", "كأس العالم 2034", "أرامكو", "ذكاء اصطناعي", "موسم الرياض", "تاسي", "الدوري", "سياحة", "فضاء"]
    }
}

// MARK: - Category Articles View

struct CategoryArticlesView: View {
    let category: ArticleCategory
    @Environment(ArticlesStore.self) private var articlesStore
    @Environment(BookmarksStore.self) private var bookmarksStore
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @State private var categoryArticles: [Article] = []
    @State private var isLoading = true
    @State private var hasMore = false
    @State private var currentPage = 1

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: SabqLayout.space24) {
                heroSection

                if isLoading && categoryArticles.isEmpty {
                    DiscoveryListSkeleton()
                } else if categoryArticles.isEmpty {
                    EmptyStateView(
                        icon: category.icon,
                        tint: SabqTheme.textSecondary,
                        title: "لا توجد أخبار",
                        subtitle: "لم نجد أخباراً في هذا القسم حالياً"
                    )
                } else {
                    LazyVStack(alignment: .leading, spacing: 0) {
                        ForEach(Array(categoryArticles.enumerated()), id: \.element.id) { index, article in
                            if index > 0 {
                                SidebarRowDivider()
                            }

                            NavigationLink(value: article) {
                                CompactArticleRow(
                                    article: article,
                                    onBookmark: { bookmarksStore.toggle(article.id, article: article) },
                                    isBookmarked: bookmarksStore.isBookmarked(article.id),
                                    showsCategory: false
                                )
                            }
                            .buttonStyle(.plain)
                        }

                        if hasMore {
                            Button {
                                Task { await loadMore() }
                            } label: {
                                HStack(spacing: SabqLayout.space8) {
                                    if isLoading {
                                        ProgressView().tint(SabqTheme.primary)
                                    }
                                    Text("تحميل المزيد")
                                        .font(SabqType.button.font)
                                        .foregroundStyle(SabqTheme.primary)
                                }
                                .frame(maxWidth: .infinity, minHeight: SabqLayout.controlHeight)
                                .overlay(
                                    RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous)
                                        .stroke(SabqTheme.outline, lineWidth: 1)
                                )
                                .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                            .disabled(isLoading)
                            .padding(.top, SabqLayout.space16)
                        }
                    }
                }
            }
            .padding(.horizontal, SabqLayout.pageMargin)
            .padding(.top, SabqLayout.space16)
            .padding(.bottom, SabqLayout.space32)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .background(SabqTheme.background)
        .sabqRTL()
        .navigationTitle(category.title)
        .navigationBarTitleDisplayMode(.inline)
        .navigationDestination(for: Article.self) { article in
            ArticleDetailView(article: article)
                .duoContentInsets()
        }
        .task { await loadArticles() }
    }

    private func loadArticles() async {
        isLoading = true
        let result = await NewsService.fetchCategoryArticles(slug: category.slug, page: 1)
        if result.articles.isEmpty {
            categoryArticles = articlesStore.articles(for: category)
        } else {
            categoryArticles = result.articles
        }
        hasMore = result.hasMore
        currentPage = 1
        isLoading = false
    }

    private func loadMore() async {
        guard hasMore, !isLoading else { return }
        isLoading = true
        currentPage += 1
        let result = await NewsService.fetchCategoryArticles(slug: category.slug, page: currentPage)
        let newArticles = result.articles.filter { new in
            !categoryArticles.contains { $0.id == new.id }
        }
        categoryArticles.append(contentsOf: newArticles)
        hasMore = result.hasMore
        isLoading = false
    }

    /// رأس تصنيف هادئ يحتفظ بالعنوان والعداد والوصف عند المساحة المناسبة.
    /// لا يعتمد على breadcrumb أو لون دلالي؛ العنوان وحده يعرّف الوجهة.
    private var heroSection: some View {
        VStack(alignment: .leading, spacing: SabqLayout.space12) {
            Group {
                if dynamicTypeSize.isAccessibilitySize {
                    VStack(alignment: .leading, spacing: SabqLayout.space12) {
                        categoryIdentityIcon
                        categoryIdentityText
                    }
                } else {
                    HStack(alignment: .center, spacing: SabqLayout.space12) {
                        categoryIdentityIcon
                        categoryIdentityText
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var categoryIdentityIcon: some View {
        Image(systemName: category.icon)
            .font(SabqType.rowTitle.font)
            .foregroundStyle(SabqTheme.primary)
            .frame(width: SabqLayout.touchTarget, height: SabqLayout.touchTarget)
            .background(RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous).fill(SabqTheme.surfaceMuted))
            .accessibilityHidden(true)
    }

    private var categoryIdentityText: some View {
        VStack(alignment: .leading, spacing: SabqLayout.space4) {
            if dynamicTypeSize.isAccessibilitySize {
                VStack(alignment: .leading, spacing: SabqLayout.space8) {
                    categoryTitle
                    categoryCount
                }
            } else {
                HStack(spacing: SabqLayout.space8) {
                    categoryTitle
                    categoryCount
                }
            }
            if horizontalSizeClass == .regular {
                Text(category.subtitle)
                    .sabqText(SabqType.excerpt)
                    .foregroundStyle(SabqTheme.textSecondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var categoryTitle: some View {
        Text(category.title)
            .font(SabqType.articleTitle.font)
            .foregroundStyle(SabqTheme.textPrimary)
            .fixedSize(horizontal: false, vertical: true)
    }

    private var categoryCount: some View {
        StatusChip(title: "\(categoryArticles.count) خبر", tint: SabqTheme.textSecondary)
            .frame(minHeight: SabqLayout.touchTarget, alignment: .leading)
    }
}

extension ArticleCategory: Hashable {}
