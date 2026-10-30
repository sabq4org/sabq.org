import SwiftUI

struct BookmarksView: View {
    @Environment(ArticlesStore.self) private var articlesStore
    @Environment(BookmarksStore.self) private var bookmarksStore
    @Environment(SabqNavigationState.self) private var navigation

    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    @State private var isSyncing = false

    private var bookmarkedArticles: [Article] {
        bookmarksStore.bookmarkedArticles(from: articlesStore.allArticles)
    }

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: SabqLayout.space24) {
                SabqPageIntro("الأخبار التي حفظتها للقراءة لاحقاً")

                if isSyncing || (bookmarkedArticles.isEmpty && !bookmarksStore.bookmarkedIDs.isEmpty) {
                    // المزامنة أو معرّفات بلا بيانات بعد: هيكل بمقاس الصفوف الحقيقية
                    // بدل مؤشر دوّار وحيد، كبقية شاشات القوائم.
                    DiscoveryListSkeleton(count: 4)
                        .padding(.horizontal, SabqLayout.space12)
                        .sabqNewsSurface()
                        .accessibilityElement(children: .ignore)
                        .accessibilityLabel("يتم تحميل المحفوظات")
                } else if bookmarkedArticles.isEmpty {
                    emptyState
                } else {
                    statsSection
                    articlesListSection
                        .padding(.horizontal, SabqLayout.space12)
                        .sabqNewsSurface()
                }
            }
            .padding(.horizontal, SabqLayout.pageMargin)
            .padding(.top, SabqLayout.space16)
            .padding(.bottom, SabqLayout.tabBarClearance)
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
        EmptyStateView(
            icon: "bookmark",
            tint: SabqTheme.primary,
            title: "لا توجد محفوظات",
            subtitle: "احفظ الأخبار المهمة لقراءتها لاحقاً.",
            action: { navigation.selectedTab = .home },
            actionTitle: "استعرض الأخبار"
        )
    }

    // MARK: - Stats

    private var statsSection: some View {
        let layout = dynamicTypeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: SabqLayout.space12))
            : AnyLayout(HStackLayout(alignment: .top, spacing: SabqLayout.space12))
        return VStack(alignment: .leading, spacing: 0) {
            layout {
                statTile(
                    title: "محفوظة",
                    value: "\(bookmarkedArticles.count)",
                    icon: "bookmark.fill",
                    tint: SabqTheme.primary
                )

                let totalMinutes = bookmarkedArticles.reduce(0) { $0 + $1.readingMinutes }
                statTile(
                    title: "وقت القراءة",
                    value: "\(totalMinutes) د",
                    icon: "clock",
                    tint: SabqTheme.primary
                )

                let categories = Set(bookmarkedArticles.map(\.category)).count
                statTile(
                    title: "أقسام",
                    value: "\(categories)",
                    icon: "square.grid.2x2",
                    tint: SabqTheme.primary
                )
            }
        }
        .padding(SabqLayout.space16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .sabqBlockSurface()
    }

    private func statTile(title: String, value: String, icon: String, tint: Color) -> some View {
        VStack(alignment: .leading, spacing: SabqLayout.space4) {
            HStack(spacing: SabqLayout.space8) {
                Image(systemName: icon)
                    .font(SabqType.rowTitle.font)
                    .foregroundStyle(tint)
                    .accessibilityHidden(true)
                Text(value)
                    .font(SabqType.sectionHeading.font)
                    .foregroundStyle(SabqTheme.textPrimary)
                    .monospacedDigit()
            }
            Text(title)
                .font(SabqType.meta.font)
                .foregroundStyle(SabqTheme.textSecondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }

    // MARK: - Articles List

    private var articlesListSection: some View {
        LazyVStack(alignment: .leading, spacing: 0) {
            ForEach(Array(bookmarkedArticles.enumerated()), id: \.element.id) { index, article in
                if index > 0 {
                    SidebarRowDivider()
                }

                NavigationLink(value: article) {
                    CompactArticleRow(
                        article: article,
                        onBookmark: { bookmarksStore.toggle(article.id, article: article) },
                        isBookmarked: true
                    )
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("saved.article.\(article.id)")
            }
        }
    }
}
