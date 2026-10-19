import SwiftUI

struct KeywordArticlesView: View {
    let keyword: String
    @Environment(BookmarksStore.self) private var bookmarksStore
    @Environment(FollowedKeywordsStore.self) private var followedKeywords
    @State private var items: [KeywordContentItem] = []
    @State private var isLoading = true
    @State private var loadError: String? = nil

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: SabqLayout.space24) {
                VStack(alignment: .leading, spacing: SabqLayout.space16) {
                    heroSection
                    followToggle
                }

                if isLoading && items.isEmpty {
                    DiscoveryListSkeleton()
                } else if items.isEmpty, let loadError {
                    // كان الفشل يُبتلع إلى «لا توجد مواد» حتى بلا إنترنت (نقل أندرويد #1573).
                    ErrorStateView(message: loadError) {
                        Task { await loadArticles() }
                    }
                } else if items.isEmpty {
                    EmptyStateView(
                        icon: "tag",
                        tint: SabqTheme.secondaryInk,
                        title: "لا توجد مواد",
                        subtitle: "لم نجد أخبارًا أو مقالات رأي تحمل هذا الوسم حاليًا"
                    )
                } else {
                    LazyVStack(alignment: .leading, spacing: 0) {
                        ForEach(Array(items.enumerated()), id: \.element.id) { index, item in
                            if index > 0 {
                                SidebarRowDivider()
                            }

                            switch item {
                            case .article(let article):
                                NavigationLink(value: article) {
                                    CompactArticleRow(
                                        article: article,
                                        onBookmark: { bookmarksStore.toggle(article.id, article: article) },
                                        isBookmarked: bookmarksStore.isBookmarked(article.id)
                                    )
                                }
                                .buttonStyle(.plain)

                            case .opinion(let opinion):
                                NavigationLink(value: opinion) {
                                    CompactOpinionKeywordRow(opinion: opinion)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }
                }
            }
            .padding(.horizontal, SabqLayout.pageMargin)
            .padding(.top, SabqLayout.space16)
            .padding(.bottom, SabqLayout.space40)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .background(SabqTheme.background)
        .sabqRTL()
        .navigationTitle(keyword)
        .navigationBarTitleDisplayMode(.inline)
        .task { await loadArticles() }
    }

    private func loadArticles() async {
        isLoading = true
        do {
            let apiArticles = try await APIClient.shared.fetchArticlesByKeyword(keyword)
            var seen = Set<String>()
            items = apiArticles
                .compactMap { apiArticle in
                    let item: KeywordContentItem = apiArticle.isOpinionContent
                        ? .opinion(OpinionArticle.from(apiArticle))
                        : .article(Article.from(apiArticle))
                    return seen.insert(item.id).inserted ? item : nil
                }
                .sorted { $0.publishDate > $1.publishDate }
            loadError = nil
        } catch {
            items = []
            loadError = ReaderErrorMessage.message(for: error, fallback: "تعذّر تحميل مواد هذا الوسم. حاول مرة أخرى.")
        }
        isLoading = false
    }

    private var articlesCount: Int {
        items.reduce(into: 0) { partialResult, item in
            if case .article = item {
                partialResult += 1
            }
        }
    }

    private var opinionsCount: Int {
        items.reduce(into: 0) { partialResult, item in
            if case .opinion = item {
                partialResult += 1
            }
        }
    }

    private var heroSection: some View {
        HStack(alignment: .top, spacing: SabqLayout.space12) {
            VStack(alignment: .leading, spacing: SabqLayout.space8) {
                Text(keyword)
                    .sabqText(SabqType.articleTitle)
                    .foregroundStyle(SabqTheme.textPrimary)
                    .fixedSize(horizontal: false, vertical: true)

                Text("أخبار ومقالات رأي تحمل هذا الوسم")
                    .sabqText(SabqType.excerpt)
                    .foregroundStyle(SabqTheme.textSecondary)

                if !items.isEmpty {
                    HStack(spacing: SabqLayout.space8) {
                        StatusChip(title: "\(items.count) مادة", tint: SabqTheme.primary)

                        if articlesCount > 0 {
                            StatusChip(title: "\(articlesCount) خبر", tint: SabqTheme.textSecondary)
                        }

                        if opinionsCount > 0 {
                            StatusChip(title: "\(opinionsCount) رأي", tint: SabqTheme.textSecondary)
                        }
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            Image(systemName: "tag")
                .font(SabqType.rowTitle.font)
                .foregroundStyle(SabqTheme.primary)
                .frame(width: SabqLayout.touchTarget, height: SabqLayout.touchTarget)
                .background(
                    RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous)
                        .fill(SabqTheme.surfaceMuted)
                )
                .accessibilityHidden(true)
        }
    }

    private var followToggle: some View {
        let isFollowing = followedKeywords.isFollowed(keyword)
        return Button {
            SabqHaptics.medium()
            withAnimation(.spring(response: 0.4, dampingFraction: 0.85)) {
                followedKeywords.toggle(keyword)
            }
        } label: {
            HStack(spacing: SabqLayout.space8) {
                Image(systemName: isFollowing ? "checkmark" : "plus")
                    .font(SabqType.metaEmphasis.font)
                Text(isFollowing ? "متابع" : "متابعة الوسم")
                    .font(SabqType.metaEmphasis.font)
            }
            .foregroundStyle(isFollowing ? SabqTheme.onAction : SabqTheme.textPrimary)
            .padding(.horizontal, SabqLayout.space16)
            .frame(minHeight: 36)
            .background(
                Capsule(style: .continuous)
                    .fill(isFollowing ? SabqTheme.actionFill : SabqTheme.surfaceMuted)
            )
            .frame(minHeight: SabqLayout.touchTarget)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

private enum KeywordContentItem: Hashable, Identifiable {
    case article(Article)
    case opinion(OpinionArticle)

    var id: String {
        switch self {
        case .article(let article):
            return "article-\(article.id)"
        case .opinion(let opinion):
            return "opinion-\(opinion.id)"
        }
    }

    var publishDate: Date {
        switch self {
        case .article(let article):
            return article.publishDate
        case .opinion(let opinion):
            return opinion.publishDate
        }
    }
}

/// صف مقال رأي بمقاس `CompactArticleRow`: العنوان، ثم «مقال رأي · الكاتب»
/// ووقت القراءة والتاريخ، ومصغّرة 112×63 في نهاية السطر.
private struct CompactOpinionKeywordRow: View {
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    let opinion: OpinionArticle

    var body: some View {
        HStack(alignment: .top, spacing: NewsRowStyle.thumbnailGap) {
            VStack(alignment: .leading, spacing: NewsRowStyle.textStackSpacing) {
                SabqRTLText(
                    opinion.title,
                    uiFont: SabqType.rowTitle.uiFont,
                    color: SabqTheme.textPrimary,
                    lineLimit: dynamicTypeSize.isAccessibilitySize ? 0 : NewsRowStyle.compactTitleLines,
                    lineSpacing: NewsRowStyle.titleLineSpacing,
                    textStyle: SabqType.rowTitle.uiTextStyle
                )

                ViewThatFits(in: .horizontal) {
                    HStack(spacing: SabqLayout.space4) {
                        kindAndAuthor
                        Text("·").foregroundStyle(SabqTheme.textTertiary)
                        timing
                    }
                    VStack(alignment: .leading, spacing: SabqLayout.space4) {
                        kindAndAuthor
                        timing
                    }
                }
                .font(SabqType.meta.font)
                .lineLimit(1)
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            thumbnail
        }
        .padding(.vertical, SabqLayout.rowPadding)
        .contentShape(Rectangle())
    }

    private var kindAndAuthor: some View {
        HStack(spacing: SabqLayout.space4) {
            Text("مقال رأي")
                .font(SabqType.metaEmphasis.font)
                .foregroundStyle(SabqTheme.primary)
            Text("·").foregroundStyle(SabqTheme.textTertiary)
            Text(opinion.authorName)
                .foregroundStyle(SabqTheme.textSecondary)
        }
    }

    private var timing: some View {
        HStack(spacing: SabqLayout.space8) {
            Text(opinion.readingTime)
                .monospacedDigit()
            Text(opinion.dateFormatted)
        }
        .font(SabqType.timestamp.font)
        .foregroundStyle(SabqTheme.textTertiary)
    }

    private var thumbnail: some View {
        Group {
            if let urlString = opinion.imageURL, let url = URL(string: urlString) {
                FocalCachedAsyncImage(url: url, focalPoint: opinion.imageFocalPoint, maxPixelSize: 360, fitsMismatchedAspect: true) {
                    SabqImagePlaceholder()
                }
            } else {
                SabqImagePlaceholder()
                    .environment(\.sabqImageLoadFailed, true)
            }
        }
        .frame(width: NewsRowStyle.thumbnailWidth, height: NewsRowStyle.thumbnailHeight)
        .clipShape(RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous))
    }
}
