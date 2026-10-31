import SwiftUI

struct TrendingView: View {
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @Environment(BookmarksStore.self) private var bookmarksStore
    @State private var articles: [Article] = []
    @State private var tags: [String] = []
    @State private var isLoading = true
    @State private var loadError: String? = nil

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: SabqLayout.space24) {
                heroSection

                if !tags.isEmpty {
                    tagsSection
                }

                if isLoading {
                    loadingSection
                } else if articles.isEmpty, let loadError {
                    ErrorStateView(message: loadError) {
                        isLoading = true
                        Task { await loadData() }
                    }
                } else if articles.isEmpty {
                    EmptyStateView(
                        icon: "flame",
                        tint: SabqTheme.textSecondary,
                        title: "لا توجد أخبار رائجة",
                        subtitle: "تابعنا لاحقاً لمعرفة الأكثر تداولاً"
                    )
                } else {
                    articlesSection
                }
            }
            .padding(.horizontal, SabqLayout.pageMargin)
            .padding(.top, SabqLayout.space16)
            .padding(.bottom, SabqLayout.tabBarClearance)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .background(SabqTheme.background)
        .sabqRTL()
        .navigationTitle("الأكثر تداولاً")
        .navigationBarTitleDisplayMode(.inline)
        .task { await loadData() }
    }

    private var heroSection: some View {
        SabqPageIntro("الأخبار الأكثر مشاهدة في آخر 48 ساعة")
    }

    private var tagsSection: some View {
        VStack(alignment: .leading, spacing: SabqLayout.space12) {
            DiscoverySectionHeading(title: "الوسوم الرائجة")

            FlowLayout(spacing: SabqLayout.space8) {
                ForEach(tags, id: \.self) { tag in
                    NavigationLink(value: KeywordRoute(keyword: tag)) {
                        DiscoveryChip(title: tag)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private var loadingSection: some View {
        DiscoveryListSkeleton()
            .padding(.horizontal, SabqLayout.space12)
            .sabqNewsSurface()
    }

    private var articlesSection: some View {
        LazyVStack(alignment: .leading, spacing: 0) {
            ForEach(Array(articles.enumerated()), id: \.element.id) { index, article in
                if index > 0 {
                    SidebarRowDivider()
                }

                NavigationLink(value: article) {
                    rankedRow(article, index: index)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, SabqLayout.space12)
        .sabqNewsSurface()
    }

    /// صف خبر بمقاس `CompactArticleRow` يسبقه رقم الترتيب.
    private func rankedRow(_ article: Article, index: Int) -> some View {
        HStack(alignment: .top, spacing: SabqLayout.space12) {
            Text("\(index + 1)")
                .font(SabqType.metaEmphasis.font)
                .monospacedDigit()
                .foregroundStyle(SabqTheme.primary)
                .frame(width: 28, height: 28)
                .background(SabqTheme.primary.opacity(0.08), in: RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous))
                .accessibilityLabel("المرتبة \(index + 1)")

            VStack(alignment: .leading, spacing: NewsRowStyle.textStackSpacing) {
                SabqRTLText(
                    article.title,
                    uiFont: SabqType.rowTitle.uiFont,
                    color: SabqTheme.textPrimary,
                    lineLimit: dynamicTypeSize.isAccessibilitySize ? 0 : 3,
                    lineSpacing: SabqType.rowTitle.lineSpacing,
                    textStyle: SabqType.rowTitle.uiTextStyle
                )

                HStack(alignment: .center, spacing: 6) {
                    Text(article.categoryTitle)
                        .font(SabqType.tag.font)
                        .foregroundStyle(SabqTheme.primary)
                        .lineLimit(1)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 2.5)
                        .background(Capsule(style: .continuous).fill(SabqTheme.primary.opacity(0.07)))
                        .fixedSize(horizontal: true, vertical: false)
                    Text(article.relativeDate)
                        .font(SabqType.timestamp.font)
                        .foregroundStyle(SabqTheme.textTertiary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            Group {
                if let urlStr = article.imageURL, let url = URL(string: urlStr) {
                    FocalCachedAsyncImage(url: url, focalPoint: article.imageFocalPoint, maxPixelSize: 360, fitsMismatchedAspect: true) {
                        SabqImagePlaceholder()
                    }
                } else {
                    SabqImagePlaceholder()
                        .environment(\.sabqImageLoadFailed, true)
                }
            }
            .frame(width: NewsRowStyle.thumbnailWidth, height: NewsRowStyle.thumbnailHeight)
            .clipShape(RoundedRectangle(cornerRadius: NewsRowStyle.thumbnailRadius, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: NewsRowStyle.thumbnailRadius, style: .continuous)
                    .strokeBorder(SabqTheme.separator, lineWidth: 0.75)
            )
            .aiImageBadgeOverlay(
                isVisible: article.isAiGeneratedImage,
                model: article.aiImageModel,
                inset: 4,
                sizeScale: 0.65
            )
        }
        .padding(.vertical, SabqLayout.rowPadding)
        .contentShape(Rectangle())
    }

    private func loadData() async {
        do {
            let response = try await APIClient.shared.fetchTrendingPage()
            let mapped = response.articles.map { Article.from($0) }
            await MainActor.run {
                articles = mapped
                tags = response.tags
                loadError = nil
                isLoading = false
            }
        } catch {
            // رسالة مفهومة للقارئ بحسب نوع الفشل بدل الصمت (نقل أندرويد #1573).
            let message = ReaderErrorMessage.message(for: error, fallback: "تعذّر تحميل الأخبار الرائجة. حاول مرة أخرى.")
            await MainActor.run {
                loadError = message
                isLoading = false
            }
        }
    }
}
