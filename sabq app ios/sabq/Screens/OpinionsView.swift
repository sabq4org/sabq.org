import SwiftUI

/// "جميع المقالات" — the full opinion-articles landing screen.
/// Top: a "الأكثر قراءة" highlight section (horizontal scroll of medium
/// cards, fed by `sort=views`).
/// Bottom: a list of latest opinions in the same compact-row style the
/// homepage uses for "آخر الأخبار".
struct OpinionsView: View {
    @Environment(BookmarksStore.self) private var bookmarksStore
    @State private var mostViewed: [OpinionArticle] = []
    @State private var latest: [OpinionArticle] = []
    @State private var isLoading = false
    @State private var errorMessage: String?

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: SabqLayout.space24) {
                SabqPageIntro("أكثر مقالات الرأي قراءةً، وأحدث ما نشر")

                if isLoading && latest.isEmpty && mostViewed.isEmpty {
                    loadingSection
                } else if let errorMessage, latest.isEmpty && mostViewed.isEmpty {
                    errorSection(message: errorMessage)
                } else if latest.isEmpty && mostViewed.isEmpty {
                    EmptyStateView(
                        icon: "newspaper",
                        tint: SabqTheme.textSecondary,
                        title: "لا توجد مقالات رأي الآن",
                        subtitle: "سنُظهر أحدث المقالات المنشورة هنا فور توفرها"
                    )
                } else {
                    if !mostViewed.isEmpty {
                        mostViewedSection
                    }

                    if !latest.isEmpty {
                        latestSection
                    }
                }
            }
            .padding(.horizontal, SabqLayout.pageMargin)
            .padding(.top, SabqLayout.space16)
            .padding(.bottom, SabqLayout.tabBarClearance)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .refreshable {
            await loadAll(isRefresh: true)
        }
        .navigationTitle("المقالات")
        .navigationBarTitleDisplayMode(.inline)
        .background(SabqTheme.background)
        .sabqRTL()
        .task {
            guard latest.isEmpty && mostViewed.isEmpty else { return }
            await loadAll()
        }
    }

    // MARK: - Trending (top)

    private var mostViewedSection: some View {
        VStack(alignment: .leading, spacing: SabqLayout.space12) {
            DiscoverySectionHeading(title: "ترند المقالات", subtitle: "الأكثر تفاعلاً خلال آخر 48 ساعة")

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(alignment: .top, spacing: SabqLayout.space16) {
                    ForEach(Array(mostViewed.prefix(8).enumerated()), id: \.element.id) { index, opinion in
                        NavigationLink(value: opinion) {
                            mostViewedCard(rank: index + 1, opinion: opinion)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.bottom, SabqLayout.space4)
            }
        }
    }

    /// بطاقة بعرض 240: صورة 16:9، ورقم الترتيب في مربع هادئ، ثم العنوان والكاتب.
    private func mostViewedCard(rank: Int, opinion: OpinionArticle) -> some View {
        VStack(alignment: .leading, spacing: SabqLayout.space8) {
            ZStack(alignment: .topLeading) {
                Group {
                    if let urlString = opinion.imageURL, let url = URL(string: urlString) {
                        FocalCachedAsyncImage(url: url, focalPoint: opinion.imageFocalPoint) {
                            SabqImagePlaceholder()
                        }
                    } else {
                        SabqImagePlaceholder()
                            .environment(\.sabqImageLoadFailed, true)
                    }
                }
                .frame(width: 240, height: 135)
                .clipShape(RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous))

                // رقم الترتيب بنمط الرئيسية (28 نقطة، نص أساسي). فوق الصورة يحتاج
                // سطحًا أبيض بدل التعبئة الشفافة كي يبقى مقروءًا.
                Text("\(rank)")
                    .font(SabqType.metaEmphasis.font)
                    .monospacedDigit()
                    .foregroundStyle(SabqTheme.primary)
                    .frame(width: 28, height: 28)
                    .background(SabqTheme.surface, in: RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous)
                            .strokeBorder(SabqTheme.separator, lineWidth: 0.75)
                    )
                    .padding(SabqLayout.space8)
                    .accessibilityLabel("المرتبة \(rank)")
            }

            Text(opinion.title)
                .sabqText(SabqType.rowTitle)
                .foregroundStyle(SabqTheme.textPrimary)
                .lineLimit(3)
                .multilineTextAlignment(.leading)
                .frame(width: 240, alignment: .leading)

            HStack(spacing: SabqLayout.space8) {
                OpinionAuthorAvatar(name: opinion.authorName, imageURL: opinion.authorImageURL, size: 24)
                Text(opinion.authorName)
                    .font(SabqType.metaEmphasis.font)
                    .foregroundStyle(SabqTheme.primary)
                    .lineLimit(1)
            }
            .frame(width: 240, alignment: .leading)
        }
        .frame(width: 240, alignment: .leading)
    }

    // MARK: - Latest (bottom)

    private var latestSection: some View {
        VStack(alignment: .leading, spacing: SabqLayout.space8) {
            DiscoverySectionHeading(title: "أحدث المقالات", subtitle: "كل ما نُشر مرتباً زمنياً")

            // صفوف بفواصل رفيعة على سطح أبيض واحد، كما في الرئيسية.
            LazyVStack(alignment: .leading, spacing: 0) {
                ForEach(Array(latest.enumerated()), id: \.element.id) { index, opinion in
                    if index > 0 {
                        SidebarRowDivider()
                    }

                    NavigationLink(value: opinion) {
                        opinionRow(opinion)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, SabqLayout.space12)
            .sabqNewsSurface()
        }
    }

    /// صف بشكل `CompactArticleRow`: العنوان وسطر البيانات، والمصغّرة 112×63 في طرف السطر.
    private func opinionRow(_ opinion: OpinionArticle) -> some View {
        HStack(alignment: .top, spacing: SabqLayout.space12) {
            VStack(alignment: .leading, spacing: SabqLayout.space8) {
                Text(opinion.title)
                    .sabqText(SabqType.rowTitle)
                    .foregroundStyle(SabqTheme.textPrimary)
                    .lineLimit(3)
                    .multilineTextAlignment(.leading)

                HStack(spacing: SabqLayout.space4) {
                    Text("رأي")
                        .font(SabqType.metaEmphasis.font)
                        .foregroundStyle(SabqTheme.primary)
                    Text("·")
                        .font(SabqType.meta.font)
                        .foregroundStyle(SabqTheme.textTertiary)
                    Text(opinion.relativeDate)
                        .font(SabqType.timestamp.font)
                        .foregroundStyle(SabqTheme.textTertiary)
                        .lineLimit(1)
                }

                authorPill(opinion)
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            Group {
                if let urlString = opinion.imageURL, let url = URL(string: urlString) {
                    FocalCachedAsyncImage(url: url, focalPoint: opinion.imageFocalPoint, maxPixelSize: 360) {
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
        }
        .padding(.vertical, SabqLayout.rowPadding)
        .contentShape(Rectangle())
    }

    private func authorPill(_ opinion: OpinionArticle) -> some View {
        HStack(spacing: SabqLayout.space8) {
            OpinionAuthorAvatar(name: opinion.authorName, imageURL: opinion.authorImageURL, size: 24)

            Text(opinion.authorName)
                .font(SabqType.metaEmphasis.font)
                .foregroundStyle(SabqTheme.primary)
                .lineLimit(1)

            Spacer(minLength: 0)

            // عدد المشاهدات في طرف الصف بدل «اقرأ المقال» — بطاقة أرشيف الرأي في الويب (#1605)
            HStack(spacing: SabqLayout.space4) {
                Image(systemName: "eye")
                    .font(SabqType.tag.font)
                Text(opinion.viewsLabel)
                    .monospacedDigit()
            }
            .font(SabqType.meta.font)
            .foregroundStyle(SabqTheme.textTertiary)
            .lineLimit(1)
        }
    }

    // MARK: - Loading / Error

    @ViewBuilder
    private var loadingSection: some View {
        VStack(alignment: .leading, spacing: SabqLayout.space16) {
            SkeletonBox(width: 140, height: 18, radius: SabqRadius.small)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: SabqLayout.space16) {
                    ForEach(0..<3, id: \.self) { _ in
                        VStack(alignment: .leading, spacing: SabqLayout.space8) {
                            SkeletonBox(width: 240, height: 135, radius: SabqRadius.medium)
                            SkeletonBox(width: 220, height: 14, radius: SabqRadius.small)
                            SkeletonBox(width: 140, height: 12, radius: SabqRadius.small)
                        }
                    }
                }
            }

            VStack(spacing: 0) {
                ForEach(0..<4, id: \.self) { index in
                    if index > 0 { SidebarRowDivider() }
                    HStack(alignment: .top, spacing: SabqLayout.space12) {
                        VStack(alignment: .leading, spacing: SabqLayout.space8) {
                            SkeletonBox(height: 16)
                            SkeletonBox(width: 180, height: 14)
                            SkeletonBox(width: 100, height: 12)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        SkeletonBox(width: NewsRowStyle.thumbnailWidth, height: NewsRowStyle.thumbnailHeight, radius: SabqRadius.small)
                    }
                    .padding(.vertical, SabqLayout.rowPadding)
                }
            }
            .padding(.horizontal, SabqLayout.space12)
            .sabqNewsSurface()
        }
    }

    private func errorSection(message: String) -> some View {
        EmptyStateView(
            icon: "exclamationmark.triangle",
            tint: SabqTheme.danger,
            title: "تعذر تحميل المقالات",
            subtitle: message,
            action: { Task { await loadAll() } },
            actionTitle: "إعادة المحاولة"
        )
    }

    // MARK: - Data

    @MainActor
    private func loadAll(isRefresh: Bool = false) async {
        isLoading = true
        errorMessage = nil

        let priorLatest = latest
        let priorMostViewed = mostViewed

        // Two parallel fetches: trending (24h window, by views) and latest
        // (default ordering). Either one can return empty without breaking
        // the other section. Switched from `sort=views` (all-time) to
        // `sort=trending` (last 24h) so the top section actually shows
        // different articles from the latest list below.
        async let viewsTask = NewsService.fetchOpinions(sort: "trending")
        async let latestTask = NewsService.fetchOpinions(sort: nil)

        let viewsResult = await viewsTask
        let latestResult = await latestTask

        if !viewsResult.isEmpty {
            mostViewed = viewsResult
        } else if isRefresh {
            mostViewed = priorMostViewed
        } else {
            mostViewed = []
        }

        if !latestResult.isEmpty {
            latest = latestResult
        } else if isRefresh {
            latest = priorLatest
            errorMessage = "تعذر تحديث المقالات الآن"
        } else {
            latest = []
        }

        isLoading = false
    }
}

struct OpinionAuthorAvatar: View {
    let name: String
    let imageURL: String?
    let size: CGFloat

    var body: some View {
        Group {
            if let imageURL, let url = URL(string: imageURL) {
                CachedAsyncImage(url: url, contentMode: .fill) {
                    placeholder
                }
                .frame(width: size, height: size)
                .clipShape(Circle())
            } else {
                placeholder
            }
        }
    }

    private var placeholder: some View {
        Circle()
            .fill(SabqTheme.surfaceMuted)
            .frame(width: size, height: size)
            .overlay {
                Text(String(name.prefix(1)))
                    .font(SabqFonts.app(size: size * 0.42, weight: .bold))
                    .foregroundStyle(SabqTheme.textSecondary)
            }
            // حدّ رفيع يُبقي الدائرة مرئية على الخلفية الرمادية وعلى السطح الأبيض معًا.
            .overlay(Circle().strokeBorder(SabqTheme.separator, lineWidth: 0.75))
    }
}
