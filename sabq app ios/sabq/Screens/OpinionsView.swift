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
            VStack(alignment: .leading, spacing: 22) {
                CompactScreenHeader(
                    title: "المقالات",
                    subtitle: "أكثر مقالات الرأي قراءةً، وأحدث ما نشر"
                )

                if isLoading && latest.isEmpty && mostViewed.isEmpty {
                    loadingSection
                } else if let errorMessage, latest.isEmpty && mostViewed.isEmpty {
                    errorSection(message: errorMessage)
                } else if latest.isEmpty && mostViewed.isEmpty {
                    EmptyStateView(
                        icon: "newspaper",
                        tint: SabqTheme.secondaryInk,
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
            .padding(.horizontal, 16)
            .padding(.top, 18)
            .padding(.bottom, 40)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .refreshable {
            await loadAll(isRefresh: true)
        }
        .background(SabqTheme.background)
        .sabqRTL()
        .task {
            guard latest.isEmpty && mostViewed.isEmpty else { return }
            await loadAll()
        }
    }

    // MARK: - Trending (top)

    private var mostViewedSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionHeader(
                title: "ترند المقالات",
                subtitle: "الأكثر تفاعلاً خلال آخر 48 ساعة",
                icon: "flame.fill",
                tint: SabqTheme.coral
            )

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(alignment: .top, spacing: 14) {
                    ForEach(Array(mostViewed.prefix(8).enumerated()), id: \.element.id) { index, opinion in
                        NavigationLink(value: opinion) {
                            mostViewedCard(rank: index + 1, opinion: opinion)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, 2)
                .padding(.bottom, 4)
            }
        }
    }

    /// A 240-pt-wide card with image + numeric rank + title + author. The
    /// rank badge is a deliberate cue that this is the "most read" list —
    /// it visually distinguishes the section from "latest".
    private func mostViewedCard(rank: Int, opinion: OpinionArticle) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            ZStack(alignment: .topLeading) {
                if let urlString = opinion.imageURL, let url = URL(string: urlString) {
                    FocalCachedAsyncImage(url: url, focalPoint: opinion.imageFocalPoint) {
                        mostViewedPlaceholder
                    }
                    .frame(width: 240, height: 140)
                    .clipShape(RoundedRectangle(cornerRadius: SabqTheme.tileRadius, style: .continuous))
                } else {
                    mostViewedPlaceholder
                        .frame(width: 240, height: 140)
                        .clipShape(RoundedRectangle(cornerRadius: SabqTheme.tileRadius, style: .continuous))
                }

                // Rank badge
                Text("\(rank)")
                    .font(.system(size: 22, weight: .heavy, design: .rounded))
                    .foregroundStyle(.white)
                    .frame(width: 36, height: 36)
                    .background(
                        Circle().fill(
                            LinearGradient(
                                colors: [SabqTheme.coral, SabqTheme.primaryEnd],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        )
                    )
                    .overlay(Circle().stroke(.white.opacity(0.9), lineWidth: 2))
                    .shadow(color: SabqTheme.coral.opacity(0.35), radius: 6, x: 0, y: 3)
                    .padding(10)
            }

            Text(opinion.title)
                .font(.system(size: 14.5, weight: .bold))
                .foregroundStyle(SabqTheme.ink)
                .lineLimit(3)
                .multilineTextAlignment(.leading)
                .frame(width: 240, alignment: .leading)

            HStack(spacing: 8) {
                OpinionAuthorAvatar(name: opinion.authorName, imageURL: opinion.authorImageURL, size: 22)
                Text(opinion.authorName)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(SabqTheme.secondaryInk)
                    .lineLimit(1)
            }
            .frame(width: 240, alignment: .leading)
        }
        .frame(width: 240, alignment: .leading)
    }

    private var mostViewedPlaceholder: some View {
        LinearGradient(
            colors: [SabqTheme.primaryEnd.opacity(0.18), SabqTheme.coral.opacity(0.10)],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
        .overlay {
            Image(systemName: "text.quote")
                .font(.system(size: 42, weight: .ultraLight))
                .foregroundStyle(SabqTheme.primaryEnd.opacity(0.30))
        }
    }

    // MARK: - Latest (bottom)

    private var latestSection: some View {
        VStack(alignment: .leading, spacing: 14) {
            SectionHeader(
                title: "أحدث المقالات",
                subtitle: "كل ما نُشر مرتباً زمنياً",
                icon: "text.quote",
                tint: SabqTheme.primaryEnd
            )

            SurfaceCard {
                ForEach(Array(latest.enumerated()), id: \.element.id) { index, opinion in
                    if index > 0 {
                        Divider().foregroundStyle(SabqTheme.outline)
                    }

                    NavigationLink(value: opinion) {
                        opinionRow(opinion)
                            .padding(.vertical, 4)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private func opinionRow(_ opinion: OpinionArticle) -> some View {
        HStack(alignment: .top, spacing: 14) {
            if let urlString = opinion.imageURL, let url = URL(string: urlString) {
                FocalCachedAsyncImage(url: url, focalPoint: opinion.imageFocalPoint) {
                    rowPlaceholder
                }
                .frame(width: 88, height: 88)
                .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
            } else {
                rowPlaceholder
                    .frame(width: 88, height: 88)
            }

            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 8) {
                    StatusChip(title: "رأي", tint: SabqTheme.primaryEnd)
                    Text(opinion.relativeDate)
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(SabqTheme.tertiaryInk)
                }

                Text(opinion.title)
                    .font(.system(size: 16, weight: .bold))
                    .foregroundStyle(SabqTheme.ink)
                    .lineLimit(3)
                    .multilineTextAlignment(.leading)

                authorPill(opinion)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private func authorPill(_ opinion: OpinionArticle) -> some View {
        HStack(spacing: 8) {
            OpinionAuthorAvatar(name: opinion.authorName, imageURL: opinion.authorImageURL, size: 26)

            Text(opinion.authorName)
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(SabqTheme.secondaryInk)
        }
    }

    private var rowPlaceholder: some View {
        RoundedRectangle(cornerRadius: 18, style: .continuous)
            .fill(SabqTheme.primaryEnd.opacity(0.08))
            .overlay {
                Image(systemName: "text.quote")
                    .font(.system(size: 24, weight: .semibold))
                    .foregroundStyle(SabqTheme.primaryEnd.opacity(0.45))
            }
    }

    // MARK: - Loading / Error

    @ViewBuilder
    private var loadingSection: some View {
        VStack(alignment: .leading, spacing: 18) {
            SkeletonBox(width: 140, height: 18, radius: 4)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 14) {
                    ForEach(0..<3, id: \.self) { _ in
                        VStack(alignment: .leading, spacing: 10) {
                            SkeletonBox(width: 240, height: 140, radius: SabqTheme.tileRadius)
                            SkeletonBox(width: 220, height: 14, radius: 4)
                            SkeletonBox(width: 140, height: 12, radius: 4)
                        }
                    }
                }
            }

            VStack(spacing: 16) {
                ForEach(0..<4, id: \.self) { _ in
                    HStack(alignment: .top, spacing: 14) {
                        SkeletonBox(width: 88, height: 88, radius: 18)
                        VStack(alignment: .leading, spacing: 10) {
                            SkeletonBox(width: 60, height: 24, radius: 12)
                            SkeletonBox(height: 16)
                            SkeletonBox(width: 180, height: 14)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    Divider().foregroundStyle(SabqTheme.outline.opacity(0.3))
                }
            }
            .padding(20)
            .background(
                RoundedRectangle(cornerRadius: SabqTheme.cardRadius, style: .continuous)
                    .fill(SabqTheme.surface)
                    .shadow(color: SabqTheme.shadow, radius: 16, x: 0, y: 6)
            )
        }
    }

    private func errorSection(message: String) -> some View {
        SurfaceCard(accent: SabqTheme.coral) {
            EmptyStateView(
                icon: "exclamationmark.triangle",
                tint: SabqTheme.coral,
                title: "تعذر تحميل المقالات",
                subtitle: message,
                action: { Task { await loadAll() } },
                actionTitle: "إعادة المحاولة"
            )
        }
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
            .fill(SabqTheme.primaryEnd.opacity(0.12))
            .frame(width: size, height: size)
            .overlay {
                Text(String(name.prefix(1)))
                    .font(.system(size: size * 0.42, weight: .bold))
                    .foregroundStyle(SabqTheme.primaryEnd)
            }
    }
}
