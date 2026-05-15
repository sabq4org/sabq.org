import SwiftUI

// Lightweight "reporter page" — filters known articles by author name
// client-side until a proper /api/reporters/:slug endpoint is wired. Good
// enough for in-session discovery ("show me everything by this writer").
struct AuthorArticlesView: View {
    let authorName: String

    @Environment(ArticlesStore.self) private var articlesStore
    @Environment(BookmarksStore.self) private var bookmarksStore
    @Environment(\.dismiss) private var dismiss

    private var articles: [Article] {
        articlesStore.allArticles
            .filter { $0.author == authorName }
            .sorted { $0.publishDate > $1.publishDate }
    }

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 20) {
                header

                if articles.isEmpty {
                    EmptyStateView(
                        icon: "person.crop.circle.badge.questionmark",
                        tint: SabqTheme.tertiaryInk,
                        title: "لم نجد أخباراً بعد",
                        subtitle: "لا توجد مواد محمّلة محلياً لهذا الكاتب. جرّب البحث أو المتابعة لاحقاً."
                    )
                } else {
                    SurfaceCard {
                        ForEach(Array(articles.enumerated()), id: \.element.id) { index, article in
                            if index > 0 {
                                Divider().foregroundStyle(SabqTheme.outline)
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
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 18)
            .padding(.bottom, 60)
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
    }

    private var header: some View {
        HStack(spacing: 16) {
            ZStack {
                Circle()
                    .fill(SabqTheme.primaryEnd.opacity(0.14))
                    .frame(width: 64, height: 64)
                Text(String(authorName.prefix(1)))
                    .font(.system(size: 26, weight: .heavy, design: .rounded))
                    .foregroundStyle(SabqTheme.primaryEnd)
            }

            VStack(alignment: .leading, spacing: 4) {
                Text(authorName)
                    .font(.system(size: 22, weight: .heavy, design: .rounded))
                    .foregroundStyle(SabqTheme.ink)
                if articles.count > 0 {
                    Text("\(articles.count) خبر متاح")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(SabqTheme.tertiaryInk)
                        .monospacedDigit()
                }
            }
            Spacer(minLength: 0)
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: SabqTheme.cardRadius, style: .continuous)
                .fill(.ultraThinMaterial)
        )
        .overlay(
            RoundedRectangle(cornerRadius: SabqTheme.cardRadius, style: .continuous)
                .stroke(SabqTheme.outline.opacity(0.4), lineWidth: 0.5)
        )
    }
}
