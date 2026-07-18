import SwiftUI

/// Lightweight home feed for "سبق Lite" — Phase 2 of #81.
///
/// What's intentionally MISSING vs. `HomeFeedView`:
///   - Featured carousel
///   - Knowledge journey block (`personalJourneyBlock`)
///   - Stories rail
///   - Breaking pill
///   - "صدى الحج" seasonal block
///   - Trending preview / opinions rail / calendar / audio newsletter
///   - Category chips
///   - Behavior tracking (no analytics / loyalty calls on row appear)
///
/// What's left: a simple paginated list of `CompactArticleRow` items.
/// Same `ArticlesStore` backing as the full feed, so pagination and
/// bookmark state are shared. Tapping a row opens `ArticleDetailView`
/// (which itself swaps to `ArticleLiteView` while Lite is active).
struct HomeLiteView: View {
    @Environment(ArticlesStore.self) private var articlesStore
    @Environment(BookmarksStore.self) private var bookmarksStore

    var body: some View {
        ScrollView(showsIndicators: false) {
            LazyVStack(alignment: .leading, spacing: 14) {
                header

                if articlesStore.allArticles.isEmpty {
                    emptyState
                } else {
                    list
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 12)
            .padding(.bottom, 32)
        }
        .background(SabqTheme.background.ignoresSafeArea())
        .refreshable {
            await articlesStore.loadArticles(ignoreCache: true)
        }
        .task {
            // Same first-load pattern as the full feed — fetch once
            // if the store hasn't populated yet. Subsequent navigations
            // back to Home reuse the cache.
            if articlesStore.allArticles.isEmpty {
                await articlesStore.loadArticles()
            }
        }
    }

    // MARK: - Sub-views

    private var header: some View {
        HStack(alignment: .center, spacing: 10) {
            Image(systemName: "bolt.fill")
                .font(SabqFonts.app(size: 14, weight: .bold))
                .foregroundStyle(SabqTheme.primaryEnd)
                .padding(6)
                .background(
                    Circle().fill(SabqTheme.primaryEnd.opacity(0.12))
                )
            VStack(alignment: .leading, spacing: 2) {
                Text("سبق Lite")
                    .font(SabqFonts.app(size: 17, weight: .bold))
                    .foregroundStyle(SabqTheme.ink)
                Text("عرض الأخبار فقط — أسرع وأخف")
                    .font(SabqFonts.app(size: 11, weight: .medium))
                    .foregroundStyle(SabqTheme.tertiaryInk)
            }
            Spacer(minLength: 0)
        }
    }

    private var list: some View {
        VStack(alignment: .leading, spacing: 6) {
            ForEach(articlesStore.allArticles) { article in
                NavigationLink(value: article) {
                    CompactArticleRow(
                        article: article,
                        onBookmark: {
                            bookmarksStore.toggle(article.id, article: article)
                        },
                        isBookmarked: bookmarksStore.isBookmarked(article.id)
                    )
                }
                .buttonStyle(.plain)

                Divider()
                    .background(SabqTheme.outline.opacity(0.4))
            }

            if articlesStore.hasMore {
                Button {
                    Task { await articlesStore.loadMore() }
                } label: {
                    HStack {
                        if articlesStore.isLoading {
                            ProgressView().tint(SabqTheme.primaryEnd)
                        } else {
                            Text("تحميل المزيد")
                                .font(SabqFonts.app(size: 14, weight: .semibold))
                                .foregroundStyle(SabqTheme.primaryEnd)
                        }
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                }
                .buttonStyle(.plain)
            }
        }
    }

    private var emptyState: some View {
        VStack(spacing: 12) {
            ProgressView().tint(SabqTheme.primaryEnd)
            Text("يتم تحميل الأخبار…")
                .font(SabqFonts.app(size: 13, weight: .medium))
                .foregroundStyle(SabqTheme.secondaryInk)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 40)
    }
}
