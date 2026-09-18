import SwiftUI

/// عمود الأخبار على العرض المنتظم (iPhone Duo مفتوحًا، iPad، Stage Manager).
///
/// كان `SabqTabNavigation` يضع `HomeFeedView` كاملة — الهيرو الدوّار والشرائط
/// والشبكات — في عمود عرضه 320–520 نقطة بجوار قارئ فارغ، فتبدو الصفحة الأولى
/// محشورة وتُهدر المساحة الأكبر. هذا العرض بديلها في العمود فقط: بطاقات خبرية
/// مضغوطة (`CompactArticleRow` نفسها المستخدمة في «آخر الأخبار») مرتبة
/// عاجل ← الأبرز ← آخر الأخبار، والنقر يفتح الخبر في عمود القارئ عبر
/// `SabqDestinations`. على العرض المضغوط (الجهاز مطويًا) يبقى `HomeFeedView`
/// كما هو ولا يُستخدم هذا العرض إطلاقًا.
struct HomeSidebarView: View {
    @Environment(ArticlesStore.self) private var articlesStore
    @Environment(BookmarksStore.self) private var bookmarksStore

    private var breaking: [Article] { Array(articlesStore.breakingNews.prefix(3)) }
    private var featured: [Article] { Array(articlesStore.featuredArticles.prefix(3)) }
    /// آخر الأخبار بلا تكرار لما ظهر في «عاجل» و«الأبرز» أعلاه.
    private var latest: [Article] {
        let shown = Set((breaking + featured).map(\.id))
        return articlesStore.filteredArticles.filter { !shown.contains($0.id) }
    }
    private var isEmpty: Bool { breaking.isEmpty && featured.isEmpty && latest.isEmpty }

    var body: some View {
        ScrollView(showsIndicators: false) {
            LazyVStack(alignment: .leading, spacing: 18) {
                header

                if isEmpty {
                    emptyState
                } else {
                    if !breaking.isEmpty {
                        group("عاجل", icon: "bolt.fill", tint: SabqTheme.coral, articles: breaking)
                    }
                    if !featured.isEmpty {
                        group("الأبرز", icon: "star.fill", tint: SabqTheme.gold, articles: featured)
                    }
                    if !latest.isEmpty {
                        group("آخر الأخبار", icon: "newspaper", tint: SabqTheme.primaryEnd, articles: latest)
                        if articlesStore.hasMore { loadMoreButton }
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .padding(.bottom, 32)
        }
        .background(SabqTheme.background)
        .refreshable {
            await articlesStore.loadArticles(ignoreCache: true)
        }
    }

    // MARK: - Header

    private var header: some View {
        HStack(alignment: .center, spacing: 12) {
            Image("SabqLogo")
                .renderingMode(.original)
                .resizable()
                .aspectRatio(contentMode: .fit)
                .frame(height: 40)

            Spacer(minLength: 0)

            if articlesStore.newArticlesCount > 0 {
                Button {
                    SabqHaptics.medium()
                    withAnimation(.spring(response: 0.4, dampingFraction: 0.8)) {
                        articlesStore.applyPendingArticles()
                    }
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "arrow.up")
                            .font(SabqFonts.app(size: 12, weight: .medium))
                        Text(newArticlesText)
                    }
                    .font(SabqFonts.app(size: 13, weight: .semibold))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(Capsule().fill(SabqTheme.primaryEnd))
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.vertical, 4)
    }

    /// صيغة العدد نفسها في `HomeFeedView.newArticlesBannerText`.
    private var newArticlesText: String {
        let count = articlesStore.newArticlesCount
        switch count {
        case 1:  return "خبر جديد"
        case 2:  return "خبران جديدان"
        case 3...10: return "\(count) أخبار جديدة"
        default: return "\(count) خبرًا جديدًا"
        }
    }

    // MARK: - Groups

    private func group(_ title: String, icon: String, tint: Color, articles: [Article]) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Image(systemName: icon)
                    .font(SabqFonts.app(size: 13, weight: .semibold))
                    .foregroundStyle(tint)
                Text(title)
                    .font(SabqFonts.app(size: 16, weight: .bold))
                    .foregroundStyle(SabqTheme.ink)
            }
            .padding(.horizontal, 4)

            SurfaceCard {
                LazyVStack(alignment: .leading, spacing: 0) {
                    ForEach(Array(articles.enumerated()), id: \.element.id) { index, article in
                        if index > 0 { SidebarRowDivider() }
                        NavigationLink(value: article) {
                            CompactArticleRow(
                                article: article,
                                onBookmark: { bookmarksStore.toggle(article.id, article: article) },
                                isBookmarked: bookmarksStore.isBookmarked(article.id),
                                isNew: articlesStore.isRecentlyAdded(article.id)
                            )
                        }
                        .buttonStyle(.plain)
                        .padding(.vertical, 4)
                    }
                }
            }
        }
    }

    private var loadMoreButton: some View {
        Button {
            Task { await articlesStore.loadMore() }
        } label: {
            HStack(spacing: 8) {
                if articlesStore.isLoading {
                    ProgressView().tint(SabqTheme.primaryEnd)
                }
                Text("تحميل المزيد")
            }
            .font(SabqFonts.app(size: 14, weight: .semibold))
            .foregroundStyle(SabqTheme.primaryEnd)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 12)
            .background(
                RoundedRectangle(cornerRadius: SabqTheme.chipRadius, style: .continuous)
                    .fill(SabqTheme.primaryEnd.opacity(0.10))
            )
        }
        .buttonStyle(.plain)
        .disabled(articlesStore.isLoading)
    }

    // MARK: - Empty

    private var emptyState: some View {
        VStack(spacing: 12) {
            if articlesStore.isLoading {
                ProgressView().tint(SabqTheme.primaryEnd)
                Text("جارٍ تحميل الأخبار…")
            } else {
                Image(systemName: "newspaper")
                    .font(.system(size: 28))
                Text(articlesStore.errorMessage ?? "لا توجد أخبار الآن")
            }
        }
        .font(SabqFonts.app(size: 14, weight: .medium))
        .foregroundStyle(SabqTheme.secondaryInk)
        .frame(maxWidth: .infinity)
        .padding(.vertical, 60)
    }
}
