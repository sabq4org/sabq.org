import SwiftUI

struct KeywordArticlesView: View {
    let keyword: String
    @Environment(BookmarksStore.self) private var bookmarksStore
    @Environment(FollowedKeywordsStore.self) private var followedKeywords
    @Environment(\.dismiss) private var dismiss
    @State private var items: [KeywordContentItem] = []
    @State private var isLoading = true

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 20) {
                heroSection
                followToggle

                if isLoading && items.isEmpty {
                    VStack {
                        ProgressView()
                            .tint(SabqTheme.primaryEnd)
                            .padding(.top, 40)
                    }
                    .frame(maxWidth: .infinity)
                } else if items.isEmpty {
                    EmptyStateView(
                        icon: "tag",
                        tint: SabqTheme.secondaryInk,
                        title: "لا توجد مواد",
                        subtitle: "لم نجد أخبارًا أو مقالات رأي تحمل هذا الوسم حاليًا"
                    )
                } else {
                    SurfaceCard {
                        ForEach(Array(items.enumerated()), id: \.element.id) { index, item in
                            if index > 0 {
                                Divider()
                                    .foregroundStyle(SabqTheme.outline)
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
            .padding(.horizontal, 16)
            .padding(.top, 18)
            .padding(.bottom, 40)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .background(SabqTheme.background)
        .sabqRTL()
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(true)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button { dismiss() } label: {
                    Image(systemName: "chevron.right")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(SabqTheme.ink)
                }
            }
        }
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
        } catch {
            items = []
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
        HStack(alignment: .top, spacing: 16) {
            VStack(alignment: .leading, spacing: 8) {
                Text(keyword)
                    .font(.system(size: 26, weight: .bold, design: .rounded))
                    .foregroundStyle(SabqTheme.ink)

                Text("أخبار ومقالات رأي تحمل هذا الوسم")
                    .font(.system(size: 15, weight: .regular))
                    .foregroundStyle(SabqTheme.secondaryInk)
                    .lineSpacing(4)

                if !items.isEmpty {
                    HStack(spacing: 8) {
                        StatusChip(title: "\(items.count) مادة", tint: SabqTheme.primaryEnd)

                        if articlesCount > 0 {
                            StatusChip(title: "\(articlesCount) خبر", tint: SabqTheme.sky)
                        }

                        if opinionsCount > 0 {
                            StatusChip(title: "\(opinionsCount) رأي", tint: SabqTheme.gold)
                        }
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            SquareIconBadge(systemImage: "tag.fill", tint: SabqTheme.primaryEnd)
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
            HStack(spacing: 7) {
                Image(systemName: isFollowing ? "checkmark.circle.fill" : "plus.circle")
                    .font(.system(size: 14, weight: .semibold))
                Text(isFollowing ? "متابع" : "متابعة الوسم")
                    .font(.system(size: 13, weight: .heavy))
            }
            .foregroundStyle(isFollowing ? .white : SabqTheme.primaryEnd)
            .padding(.horizontal, 16)
            .padding(.vertical, 9)
            .background(
                Capsule(style: .continuous)
                    .fill(isFollowing ? SabqTheme.primaryEnd : SabqTheme.primaryEnd.opacity(0.12))
            )
            .overlay(
                Capsule(style: .continuous)
                    .stroke(SabqTheme.primaryEnd.opacity(isFollowing ? 0 : 0.30), lineWidth: 0.5)
            )
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

private struct CompactOpinionKeywordRow: View {
    let opinion: OpinionArticle

    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 8) {
                    StatusChip(title: "مقال رأي", tint: SabqTheme.gold)
                    StatusChip(title: opinion.authorName, tint: SabqTheme.secondaryInk)
                }

                Text(opinion.title)
                    .font(.system(size: 16, weight: .bold, design: .rounded))
                    .foregroundStyle(SabqTheme.ink)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
                    .lineSpacing(3)

                HStack(spacing: 12) {
                    HStack(spacing: 4) {
                        Image(systemName: "clock")
                            .font(.system(size: 11, weight: .medium))
                        Text(opinion.readingTime)
                            .font(.system(size: 11, weight: .medium, design: .rounded))
                            .monospacedDigit()
                    }
                    .foregroundStyle(SabqTheme.tertiaryInk)

                    Text(opinion.dateFormatted)
                        .font(.system(size: 11, weight: .medium))
                        .foregroundStyle(SabqTheme.tertiaryInk)

                    Spacer(minLength: 0)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            if let urlString = opinion.imageURL, let url = URL(string: urlString) {
                FocalCachedAsyncImage(url: url, focalPoint: opinion.imageFocalPoint) {
                    thumbnailPlaceholder
                }
                .frame(width: 80, height: 80)
                .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            } else {
                thumbnailPlaceholder
            }
        }
        .padding(.vertical, 4)
    }

    private var thumbnailPlaceholder: some View {
        RoundedRectangle(cornerRadius: 16, style: .continuous)
            .fill(
                LinearGradient(
                    colors: [SabqTheme.gold.opacity(0.14), SabqTheme.primaryEnd.opacity(0.05)],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            )
            .frame(width: 80, height: 80)
            .overlay {
                Image(systemName: "text.quote")
                    .font(.system(size: 28, weight: .light))
                    .foregroundStyle(SabqTheme.gold.opacity(0.7))
            }
    }
}
