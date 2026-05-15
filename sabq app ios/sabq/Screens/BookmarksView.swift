import SwiftUI

struct BookmarksView: View {
    @Environment(ArticlesStore.self) private var articlesStore
    @Environment(BookmarksStore.self) private var bookmarksStore
    

    private var bookmarkedArticles: [Article] {
        bookmarksStore.bookmarkedArticles(from: articlesStore.allArticles)
    }

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 20) {
                CompactScreenHeader(
                    title: "المحفوظات",
                    subtitle: "الأخبار التي حفظتها للقراءة لاحقاً"
                )

                if bookmarkedArticles.isEmpty {
                    emptyState
                } else {
                    statsSection
                    articlesListSection
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 18)
            .padding(.bottom, 40)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .background(SabqTheme.background)
        .sabqRTL()
    }

    // MARK: - Empty State

    private var emptyState: some View {
        SurfaceCard {
            EmptyStateView(
                icon: "bookmark",
                tint: SabqTheme.primaryEnd,
                title: "لا توجد محفوظات",
                subtitle: "احفظ الأخبار المهمة بالضغط على أيقونة الحفظ لقراءتها لاحقاً"
            )
        }
    }

    // MARK: - Stats

    private var statsSection: some View {
        HStack(spacing: 14) {
            statTile(
                title: "محفوظة",
                value: "\(bookmarkedArticles.count)",
                icon: "bookmark.fill",
                tint: SabqTheme.primaryEnd
            )

            let totalMinutes = bookmarkedArticles.reduce(0) { $0 + $1.readingMinutes }
            statTile(
                title: "وقت القراءة",
                value: "\(totalMinutes) د",
                icon: "clock",
                tint: SabqTheme.teal
            )

            let categories = Set(bookmarkedArticles.map(\.category)).count
            statTile(
                title: "أقسام",
                value: "\(categories)",
                icon: "square.grid.2x2",
                tint: SabqTheme.gold
            )
        }
    }

    private func statTile(title: String, value: String, icon: String, tint: Color) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            ZStack {
                Circle()
                    .fill(tint.opacity(0.12))
                    .frame(width: 32, height: 32)
                Image(systemName: icon)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(tint)
            }

            Text(value)
                .font(.system(size: 22, weight: .bold, design: .rounded))
                .foregroundStyle(SabqTheme.ink)
                .monospacedDigit()

            Text(title)
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(SabqTheme.tertiaryInk)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: SabqTheme.tileRadius, style: .continuous)
                .fill(.ultraThinMaterial)
                .overlay(
                    RoundedRectangle(cornerRadius: SabqTheme.tileRadius, style: .continuous)
                        .fill(tint.opacity(0.04))
                )
        )
        .overlay(
            RoundedRectangle(cornerRadius: SabqTheme.tileRadius, style: .continuous)
                .stroke(tint.opacity(0.18), lineWidth: 0.5)
        )
        .shadow(color: tint.opacity(0.08), radius: 12, x: 0, y: 4)
    }

    // MARK: - Articles List

    private var articlesListSection: some View {
        SurfaceCard {
            ForEach(Array(bookmarkedArticles.enumerated()), id: \.element.id) { index, article in
                if index > 0 {
                    Divider()
                        .foregroundStyle(SabqTheme.outline)
                }

                NavigationLink(value: article) {
                    CompactArticleRow(
                        article: article,
                        onBookmark: { bookmarksStore.toggle(article.id, article: article) },
                        isBookmarked: true
                    )
                }
                .buttonStyle(.plain)
            }
        }
    }
}
