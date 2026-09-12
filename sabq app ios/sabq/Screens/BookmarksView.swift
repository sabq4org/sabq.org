import SwiftUI

struct BookmarksView: View {
    @Environment(ArticlesStore.self) private var articlesStore
    @Environment(BookmarksStore.self) private var bookmarksStore

    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    @State private var isSyncing = false

    private var bookmarkedArticles: [Article] {
        bookmarksStore.bookmarkedArticles(from: articlesStore.allArticles)
    }

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 20) {
                SabqPageIntro("الأخبار التي حفظتها للقراءة لاحقاً")

                if isSyncing {
                    HStack { Spacer(); ProgressView().tint(SabqTheme.primaryEnd); Spacer() }
                        .padding(.vertical, 40)
                } else if bookmarkedArticles.isEmpty && bookmarksStore.bookmarkedIDs.isEmpty {
                    emptyState
                } else if bookmarkedArticles.isEmpty {
                    // IDs exist (from server sync) but no cached metadata.
                    // Show a hint that data is loading.
                    VStack(spacing: 12) {
                        ProgressView().tint(SabqTheme.primaryEnd)
                        Text("يتم تحميل المحفوظات…")
                            .font(SabqFonts.app(size: 13, weight: .medium))
                            .foregroundStyle(SabqTheme.secondaryInk)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 40)
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
        .navigationTitle("محفوظاتي")
        .navigationBarTitleDisplayMode(.inline)
        .background(SabqTheme.background)
        .sabqRTL()
        .sabqScreen("Bookmarks")
        .task {
            // Sync from server on every tab visit so reinstalls +
            // cross-platform bookmarks appear. Best-effort.
            isSyncing = true
            bookmarksStore.syncFromServer()
            // Give the async sync a moment to complete.
            try? await Task.sleep(nanoseconds: 1_500_000_000)
            isSyncing = false
        }
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
        let layout = dynamicTypeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: 12))
            : AnyLayout(HStackLayout(alignment: .top, spacing: 12))
        return SurfaceCard {
            layout {
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
    }

    private func statTile(title: String, value: String, icon: String, tint: Color) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Label(value, systemImage: icon)
                .font(SabqFonts.editorial(.headline, size: 18, weight: .semibold))
                .foregroundStyle(tint)
                .monospacedDigit()
            Text(title)
                .font(SabqFonts.editorial(.caption, size: 12))
                .foregroundStyle(SabqTheme.secondaryInk)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }

    // MARK: - Articles List

    private var articlesListSection: some View {
        SurfaceCard(lazy: true) {
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
