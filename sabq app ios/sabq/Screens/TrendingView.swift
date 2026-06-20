import SwiftUI

struct TrendingView: View {
    @Environment(BookmarksStore.self) private var bookmarksStore
    @State private var articles: [Article] = []
    @State private var tags: [String] = []
    @State private var isLoading = true

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 20) {
                heroSection

                if !tags.isEmpty {
                    tagsSection
                }

                if isLoading {
                    loadingSection
                } else if articles.isEmpty {
                    EmptyStateView(
                        icon: "flame",
                        tint: .orange,
                        title: "لا توجد أخبار رائجة",
                        subtitle: "تابعنا لاحقاً لمعرفة الأكثر تداولاً"
                    )
                } else {
                    articlesSection
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 18)
            .padding(.bottom, 40)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .background(SabqTheme.background)
        .sabqRTL()
        .navigationBarBackButtonHidden(true)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button {
                    SabqHaptics.light()
                    dismiss()
                } label: {
                    Image(systemName: "chevron.right")
                        .font(SabqFonts.app(size: 14, weight: .bold))
                        .foregroundStyle(SabqTheme.ink)
                        .padding(8)
                        .background(Circle().fill(.ultraThinMaterial))
                }
            }
            ToolbarItem(placement: .principal) {
                Text("الأكثر تداولاً")
                    .font(SabqFonts.app(size: 17, weight: .bold))
                    .foregroundStyle(SabqTheme.ink)
            }
        }
        .task { await loadData() }
    }

    @Environment(\.dismiss) private var dismiss

    private var heroSection: some View {
        HStack(spacing: 12) {
            Image(systemName: "flame.fill")
                .font(SabqFonts.app(size: 28, weight: .medium))
                .foregroundStyle(.orange)

            VStack(alignment: .leading, spacing: 4) {
                Text("الأكثر تداولاً")
                    .font(SabqFonts.app(size: 22, weight: .bold))
                    .foregroundStyle(SabqTheme.ink)

                Text("الأخبار الأكثر مشاهدة في آخر 48 ساعة")
                    .font(SabqFonts.app(size: 13, weight: .regular))
                    .foregroundStyle(SabqTheme.secondaryInk)
            }

            Spacer()
        }
    }

    private var tagsSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("الوسوم الرائجة")
                .font(SabqFonts.app(size: 15, weight: .bold))
                .foregroundStyle(SabqTheme.ink)

            FlowLayout(spacing: 8) {
                ForEach(tags, id: \.self) { tag in
                    NavigationLink(value: KeywordRoute(keyword: tag)) {
                        Text(tag)
                            .font(SabqFonts.app(size: 13, weight: .semibold))
                            .foregroundStyle(SabqTheme.primaryEnd)
                            .padding(.horizontal, 14)
                            .padding(.vertical, 8)
                            .background(
                                Capsule().fill(SabqTheme.primaryEnd.opacity(0.08))
                            )
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .padding(.vertical, 4)
    }

    private var loadingSection: some View {
        VStack(spacing: 16) {
            ForEach(0..<5, id: \.self) { _ in
                HStack(spacing: 14) {
                    SkeletonBox(width: 36, height: 36)
                    VStack(alignment: .leading, spacing: 6) {
                        SkeletonBox(height: 14)
                        SkeletonBox(width: 120, height: 10)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    SkeletonBox(width: 64, height: 64, radius: 8)
                }
                .padding(.vertical, 6)
            }
        }
        .padding(20)
        .background(
            RoundedRectangle(cornerRadius: SabqTheme.cardRadius, style: .continuous)
                .fill(SabqTheme.surface)
                .shadow(color: SabqTheme.shadow, radius: 16, x: 0, y: 6)
        )
    }

    private var articlesSection: some View {
        SurfaceCard {
            ForEach(Array(articles.enumerated()), id: \.element.id) { index, article in
                if index > 0 {
                    Divider().foregroundStyle(SabqTheme.outline)
                }

                NavigationLink(value: article) {
                    HStack(alignment: .top, spacing: 14) {
                        Text("\(index + 1)")
                            .font(SabqFonts.app(size: 22, weight: .heavy))
                            .foregroundStyle(rankColor(for: index))
                            .frame(width: 36)

                        VStack(alignment: .leading, spacing: 6) {
                            Text(article.title)
                                .font(SabqFonts.app(size: 15, weight: .semibold))
                                .foregroundStyle(SabqTheme.ink)
                                .lineLimit(2)
                                .multilineTextAlignment(.leading)

                            HStack(spacing: 8) {
                                Text(article.category.title)
                                    .font(SabqFonts.app(size: 11, weight: .bold))
                                    .foregroundStyle(SabqTheme.primaryEnd)

                                HStack(spacing: 3) {
                                    Image(systemName: "clock")
                                        .font(SabqFonts.app(size: 10))
                                    Text(article.relativeDate)
                                        .font(SabqFonts.app(size: 11, weight: .medium))
                                }
                                .foregroundStyle(SabqTheme.tertiaryInk)
                            }
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)

                        if let urlStr = article.imageURL, let url = URL(string: urlStr) {
                            FocalCachedAsyncImage(url: url, focalPoint: article.imageFocalPoint) {
                                RoundedRectangle(cornerRadius: 8, style: .continuous)
                                    .fill(SabqTheme.paleFill)
                            }
                            .frame(width: 64, height: 64)
                            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                            .aiImageBadgeOverlay(
                                isVisible: article.isAiGeneratedImage,
                                model: article.aiImageModel,
                                inset: 3,
                                sizeScale: 0.55
                            )
                        }
                    }
                    .padding(.vertical, 6)
                }
                .buttonStyle(.plain)
            }
        }
    }

    private func rankColor(for index: Int) -> Color {
        switch index {
        case 0: return .orange
        case 1: return SabqTheme.primaryEnd
        case 2: return SabqTheme.teal
        default: return SabqTheme.tertiaryInk
        }
    }

    private func loadData() async {
        do {
            let response = try await APIClient.shared.fetchTrendingPage()
            let mapped = response.articles.map { Article.from($0) }
            await MainActor.run {
                articles = mapped
                tags = response.tags
                isLoading = false
            }
        } catch {
            await MainActor.run { isLoading = false }
        }
    }
}
