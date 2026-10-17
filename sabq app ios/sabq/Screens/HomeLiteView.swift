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
            LazyVStack(alignment: .leading, spacing: SabqLayout.space12) {
                header

                if articlesStore.allArticles.isEmpty {
                    emptyState
                } else {
                    list
                }
            }
            .padding(.horizontal, SabqLayout.pageMargin)
            .padding(.top, SabqLayout.space12)
            .padding(.bottom, SabqLayout.space32)
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
        HStack(alignment: .center, spacing: SabqLayout.space12) {
            VStack(alignment: .leading, spacing: SabqLayout.space4) {
                HStack(spacing: SabqLayout.space8) {
                    Image(systemName: "bolt.fill")
                        .font(SabqType.tag.font)
                        .foregroundStyle(SabqTheme.primary)
                        .accessibilityHidden(true)
                    Text("سبق Lite")
                        .font(SabqType.leadTitle.font)
                        .foregroundStyle(SabqTheme.textPrimary)
                        .accessibilityAddTraits(.isHeader)
                }
                Text("عرض الأخبار فقط — أسرع وأخف")
                    .font(SabqType.meta.font)
                    .foregroundStyle(SabqTheme.textTertiary)
            }
            Spacer(minLength: 0)
        }
    }

    private var list: some View {
        VStack(alignment: .leading, spacing: 0) {
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

                SidebarRowDivider()
            }

            if articlesStore.hasMore {
                Button {
                    Task { await articlesStore.loadMore() }
                } label: {
                    HStack {
                        if articlesStore.isLoading {
                            ProgressView().tint(SabqTheme.primary)
                        } else {
                            Text("تحميل المزيد")
                                .font(SabqType.button.font)
                                .foregroundStyle(SabqTheme.primary)
                        }
                    }
                    .frame(maxWidth: .infinity, minHeight: SabqLayout.controlHeight)
                    .overlay(
                        RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous)
                            .stroke(SabqTheme.outline, lineWidth: 1)
                    )
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .padding(.top, SabqLayout.space16)
            }
        }
    }

    private var emptyState: some View {
        VStack(spacing: SabqLayout.space12) {
            ProgressView().tint(SabqTheme.primary)
            Text("يتم تحميل الأخبار…")
                .font(SabqType.meta.font)
                .foregroundStyle(SabqTheme.textSecondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, SabqLayout.space40)
    }
}
