import SwiftUI

struct SectionsView: View {
    @Environment(ArticlesStore.self) private var articlesStore
    @Environment(BookmarksStore.self) private var bookmarksStore
    @State private var trendingTags: [String] = []

    private let columns = [
        GridItem(.flexible(), spacing: 14),
        GridItem(.flexible(), spacing: 14)
    ]

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 20) {
                CompactScreenHeader(
                    title: "الأقسام",
                    subtitle: "تصفح الأخبار حسب التصنيف"
                )

                LazyVGrid(columns: columns, spacing: 14) {
                    ForEach(Array(ArticleCategory.allCases.enumerated()), id: \.element.id) { index, category in
                        NavigationLink(value: category) {
                            CategoryTile(category: category)
                        }
                        .buttonStyle(.plain)
                        .animatedAppear(index: index)
                    }
                }

                trendingTagsSection
            }
            .padding(.horizontal, 16)
            .padding(.top, 18)
            .padding(.bottom, 40)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .background(SabqTheme.background)
        .sabqRTL()
        .navigationDestination(for: ArticleCategory.self) { category in
            CategoryArticlesView(category: category)
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
        SurfaceCard(accent: SabqTheme.primaryEnd) {
            SectionHeader(
                title: "الكلمات المفتاحية",
                subtitle: "أكثر المواضيع بحثاً",
                icon: "tag.fill",
                tint: SabqTheme.primaryEnd
            )

            FlowLayout(spacing: 8) {
                ForEach(trendingTags, id: \.self) { tag in
                    NavigationLink(value: KeywordRoute(keyword: tag)) {
                        Text(tag)
                            .font(SabqFonts.app(size: 12, weight: .medium))
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

    private var fallbackTags: [String] {
        ["رؤية 2030", "نيوم", "كأس العالم 2034", "أرامكو", "ذكاء اصطناعي", "موسم الرياض", "تاسي", "الدوري", "سياحة", "فضاء"]
    }
}

// MARK: - Category Articles View

struct CategoryArticlesView: View {
    let category: ArticleCategory
    @Environment(ArticlesStore.self) private var articlesStore
    @Environment(BookmarksStore.self) private var bookmarksStore
    @State private var categoryArticles: [Article] = []
    @State private var isLoading = true
    @State private var hasMore = false
    @State private var currentPage = 1

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 20) {
                heroSection

                if isLoading && categoryArticles.isEmpty {
                    VStack(spacing: 16) {
                        ForEach(0..<5, id: \.self) { _ in
                            ArticleRowSkeleton()
                            Divider().foregroundStyle(SabqTheme.outline.opacity(0.3))
                        }
                    }
                    .padding(20)
                    .background(
                        RoundedRectangle(cornerRadius: SabqTheme.cardRadius, style: .continuous)
                            .fill(SabqTheme.surface)
                            .shadow(color: SabqTheme.shadow, radius: 16, x: 0, y: 6)
                    )
                } else if categoryArticles.isEmpty {
                    EmptyStateView(
                        icon: category.icon,
                        tint: category.tint,
                        title: "لا توجد أخبار",
                        subtitle: "لم نجد أخباراً في هذا القسم حالياً"
                    )
                } else {
                    SurfaceCard {
                        ForEach(Array(categoryArticles.enumerated()), id: \.element.id) { index, article in
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

                        if hasMore {
                            Button {
                                Task { await loadMore() }
                            } label: {
                                HStack(spacing: 8) {
                                    if isLoading {
                                        ProgressView().tint(SabqTheme.primaryEnd)
                                    }
                                    Text("تحميل المزيد")
                                        .font(SabqFonts.app(size: 14, weight: .semibold))
                                        .foregroundStyle(SabqTheme.primaryEnd)
                                }
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 12)
                            }
                            .buttonStyle(.plain)
                            .disabled(isLoading)
                        }
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 18)
            .padding(.bottom, 40)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .background(SabqTheme.background)
        .sabqRTL()
        .navigationTitle(category.title)
        .navigationBarTitleDisplayMode(.inline)
        .navigationDestination(for: Article.self) { article in
            ArticleDetailView(article: article)
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

    private var heroSection: some View {
        HStack(alignment: .top, spacing: 16) {
            VStack(alignment: .leading, spacing: 8) {
                Text(category.title)
                    .font(SabqFonts.app(size: 26, weight: .bold))
                    .foregroundStyle(SabqTheme.ink)

                Text(category.subtitle)
                    .font(SabqFonts.app(size: 15, weight: .regular))
                    .foregroundStyle(SabqTheme.secondaryInk)
                    .lineSpacing(4)

                StatusChip(title: "\(categoryArticles.count) خبر", tint: category.tint)
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            SquareIconBadge(systemImage: category.icon, tint: category.tint)
        }
    }
}

extension ArticleCategory: Hashable {}
