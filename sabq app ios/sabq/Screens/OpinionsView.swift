import SwiftUI

struct OpinionsView: View {
    @State private var opinions: [OpinionArticle] = []
    @State private var isLoading = false
    @State private var errorMessage: String?

    private var featuredOpinion: OpinionArticle? { opinions.first }
    private var remainingOpinions: [OpinionArticle] { Array(opinions.dropFirst()) }

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 20) {
                CompactScreenHeader(
                    title: "المقالات",
                    subtitle: "مقالات الرأي المنشورة بأسلوب قريب من تجربة قراءة الخبر"
                )

                if isLoading && opinions.isEmpty {
                    loadingSection
                } else if let errorMessage, opinions.isEmpty {
                    errorSection(message: errorMessage)
                } else if opinions.isEmpty {
                    EmptyStateView(
                        icon: "newspaper",
                        tint: SabqTheme.secondaryInk,
                        title: "لا توجد مقالات رأي الآن",
                        subtitle: "سنُظهر أحدث المقالات المنشورة هنا فور توفرها"
                    )
                } else {
                    if let featuredOpinion {
                        featuredOpinionSection(featuredOpinion)
                    }

                    if !remainingOpinions.isEmpty {
                        opinionsListSection
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 18)
            .padding(.bottom, 40)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .refreshable {
            await loadOpinions(isRefresh: true)
        }
        .background(SabqTheme.background)
        .sabqRTL()
        .task {
            guard opinions.isEmpty else { return }
            await loadOpinions()
        }
    }

    @ViewBuilder
    private var loadingSection: some View {
        VStack(alignment: .leading, spacing: 16) {
            FeaturedCardSkeleton()

            VStack(spacing: 16) {
                ForEach(0..<4, id: \.self) { _ in
                    HStack(alignment: .top, spacing: 14) {
                        SkeletonBox(width: 88, height: 88, radius: 18)
                        VStack(alignment: .leading, spacing: 10) {
                            SkeletonBox(width: 60, height: 24, radius: 12)
                            SkeletonBox(height: 16)
                            SkeletonBox(width: 180, height: 14)
                            HStack(spacing: 8) {
                                SkeletonBox(width: 28, height: 28, radius: 14)
                                SkeletonBox(width: 80, height: 12)
                            }
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
                action: { Task { await loadOpinions() } },
                actionTitle: "إعادة المحاولة"
            )
        }
    }

    private func featuredOpinionSection(_ opinion: OpinionArticle) -> some View {
        NavigationLink(value: opinion) {
            VStack(alignment: .leading, spacing: 0) {
                ZStack(alignment: .bottomLeading) {
                    if let urlString = opinion.imageURL, let url = URL(string: urlString) {
                        CachedAsyncImage(url: url, contentMode: .fill) {
                            featuredPlaceholder(opinion)
                        }
                        .frame(height: 230)
                        .clipShape(
                            UnevenRoundedRectangle(
                                topLeadingRadius: SabqTheme.cardRadius,
                                bottomLeadingRadius: 0,
                                bottomTrailingRadius: 0,
                                topTrailingRadius: SabqTheme.cardRadius,
                                style: .continuous
                            )
                        )
                    } else {
                        featuredPlaceholder(opinion)
                    }

                    LinearGradient(
                        colors: [.black.opacity(0.58), .clear],
                        startPoint: .bottom,
                        endPoint: .top
                    )
                    .frame(height: 110)

                    HStack(spacing: 8) {
                        StatusChip(title: "مقال رأي", tint: .white)
                        if !opinion.authorName.isEmpty {
                            StatusChip(title: opinion.authorName, tint: .white.opacity(0.9))
                        }
                    }
                    .padding(18)
                }

                VStack(alignment: .leading, spacing: 12) {
                    Text(opinion.title)
                        .font(.system(size: 21, weight: .bold, design: .rounded))
                        .foregroundStyle(SabqTheme.ink)
                        .lineLimit(3)
                        .multilineTextAlignment(.leading)
                        .lineSpacing(4)

                    if !opinion.excerpt.isEmpty {
                        Text(opinion.excerpt)
                            .font(.system(size: 15, weight: .regular))
                            .foregroundStyle(SabqTheme.secondaryInk)
                            .lineLimit(3)
                            .multilineTextAlignment(.leading)
                            .lineSpacing(4)
                    }

                    HStack(spacing: 12) {
                        authorPill(opinion)

                        Spacer(minLength: 0)

                        HStack(spacing: 5) {
                            Image(systemName: "clock")
                                .font(.system(size: 12, weight: .medium))
                            Text(opinion.readingTime)
                                .font(.system(size: 12, weight: .medium, design: .rounded))
                                .monospacedDigit()
                        }
                        .foregroundStyle(SabqTheme.tertiaryInk)

                        HStack(spacing: 5) {
                            Image(systemName: "calendar")
                                .font(.system(size: 12, weight: .medium))
                            Text(opinion.dateFormatted)
                                .font(.system(size: 12, weight: .medium))
                        }
                        .foregroundStyle(SabqTheme.tertiaryInk)
                    }
                }
                .padding(20)
            }
            .background(
                RoundedRectangle(cornerRadius: SabqTheme.cardRadius, style: .continuous)
                    .fill(SabqTheme.surface)
                    .shadow(color: SabqTheme.shadow, radius: 16, x: 0, y: 6)
                    .shadow(color: SabqTheme.deepShadow, radius: 1, x: 0, y: 1)
            )
            .overlay(
                RoundedRectangle(cornerRadius: SabqTheme.cardRadius, style: .continuous)
                    .stroke(SabqTheme.outline.opacity(0.5), lineWidth: 0.5)
            )
        }
        .buttonStyle(.plain)
    }

    private var opinionsListSection: some View {
        SurfaceCard(accent: SabqTheme.primaryEnd) {
            SectionHeader(
                title: "أحدث مقالات الرأي",
                subtitle: "قراءات وتحليلات وآراء منشورة",
                icon: "text.quote",
                tint: SabqTheme.primaryEnd
            )

            ForEach(Array(remainingOpinions.enumerated()), id: \.element.id) { index, opinion in
                if index > 0 {
                    Divider()
                        .foregroundStyle(SabqTheme.outline)
                }

                NavigationLink(value: opinion) {
                    opinionRow(opinion)
                }
                .buttonStyle(.plain)
            }
        }
    }

    private func opinionRow(_ opinion: OpinionArticle) -> some View {
        HStack(alignment: .top, spacing: 14) {
            if let urlString = opinion.imageURL, let url = URL(string: urlString) {
                CachedAsyncImage(url: url, contentMode: .fill) {
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
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)

                if !opinion.excerpt.isEmpty {
                    Text(opinion.excerpt)
                        .font(.system(size: 13, weight: .regular))
                        .foregroundStyle(SabqTheme.secondaryInk)
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)
                }

                authorPill(opinion)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private func authorPill(_ opinion: OpinionArticle) -> some View {
        HStack(spacing: 8) {
            OpinionAuthorAvatar(name: opinion.authorName, imageURL: opinion.authorImageURL, size: 28)

            Text(opinion.authorName)
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(SabqTheme.secondaryInk)
        }
    }

    private func featuredPlaceholder(_ opinion: OpinionArticle) -> some View {
        LinearGradient(
            colors: [SabqTheme.primaryEnd.opacity(0.18), SabqTheme.primaryStart.opacity(0.06)],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
        .frame(height: 230)
        .overlay {
            Image(systemName: "text.quote")
                .font(.system(size: 86, weight: .ultraLight))
                .foregroundStyle(SabqTheme.primaryEnd.opacity(0.18))
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

    @MainActor
    private func loadOpinions(isRefresh: Bool = false) async {
        isLoading = true
        errorMessage = nil

        let currentOpinions = opinions
        let fetched = await NewsService.fetchOpinions()
        if fetched.isEmpty {
            if isRefresh && !currentOpinions.isEmpty {
                opinions = currentOpinions
                errorMessage = "تعذر تحديث المقالات الآن"
            } else {
                opinions = []
            }
        } else {
            opinions = fetched
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
