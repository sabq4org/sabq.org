import SwiftUI

// MARK: - Editorial Feed Row (صف أخبار الرئيسية التفاعلي)

/// صف خبر تحريري نظيف لقائمة «آخر الأخبار» في الرئيسية: يفصل رابط الخبر عن أزرار
/// «✨ الزبدة» والحفظ السريع حتى تعمل اللمسات بدقة 100% بلا تعارض إيماءات.
struct EditorialArticleFeedRow: View {
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    let article: Article
    let isBookmarked: Bool
    let isNew: Bool
    let showsCategory: Bool
    let onBookmark: () -> Void
    let onZubda: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            ArticleLink(article: article) {
                HStack(alignment: .top, spacing: NewsRowStyle.thumbnailGap) {
                    SabqRTLText(
                        article.title,
                        uiFont: SabqType.rowTitle.uiFont,
                        color: SabqTheme.textPrimary,
                        lineLimit: dynamicTypeSize.isAccessibilitySize ? 0 : NewsRowStyle.compactTitleLines,
                        lineSpacing: NewsRowStyle.titleLineSpacing,
                        textStyle: SabqType.rowTitle.uiTextStyle
                    )
                    .frame(maxWidth: .infinity, alignment: .leading)

                    thumbnail
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)

            TimelineView(.periodic(from: .now, by: 30)) { context in
                let showNew = isNew || article.isFreshlyPublished(relativeTo: context.date)
                HStack(alignment: .center, spacing: 6) {
                    ArticleLink(article: article) {
                        HStack(alignment: .center, spacing: 6) {
                            if showsCategory {
                                Text(article.isBreaking ? "عاجل" : article.categoryTitle)
                                    .font(SabqType.tag.font)
                                    .foregroundStyle(article.isBreaking ? SabqTheme.breaking : SabqTheme.primary)
                                    .lineLimit(1)

                                Text("·")
                                    .font(SabqType.timestamp.font)
                                    .foregroundStyle(SabqTheme.textTertiary)
                                    .accessibilityHidden(true)
                            }
                            if article.isInfographic {
                                InfographicPill()
                            }
                            if showNew {
                                Text("جديد")
                                    .font(SabqType.tag.font)
                                    .foregroundStyle(SabqTheme.success)
                                    .padding(.horizontal, 7)
                                    .padding(.vertical, 2)
                                    .background(Capsule(style: .continuous).fill(SabqTheme.success.opacity(0.08)))
                            } else {
                                Text(SabqFormatters.arabicRelative(article.publishDate, now: context.date))
                                    .font(SabqType.timestamp.font)
                                    .monospacedDigit()
                                    .foregroundStyle(SabqTheme.textTertiary)
                            }
                        }
                    }
                    .buttonStyle(.plain)

                    Spacer(minLength: 4)

                    Button {
                        SabqHaptics.light()
                        onZubda()
                    } label: {
                        HStack(spacing: 3) {
                            Image(systemName: "sparkles")
                                .font(.system(size: 10, weight: .semibold))
                            Text("الزبدة")
                                .font(SabqType.timestamp.font.weight(.semibold))
                        }
                        .foregroundStyle(SabqTheme.primary)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(Capsule(style: .continuous).fill(SabqTheme.skyTint))
                        .overlay(Capsule(style: .continuous).strokeBorder(SabqTheme.skyOutline, lineWidth: 0.75))
                        .contentShape(Capsule())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("الزبدة: خلاصة \(article.title)")

                    Button {
                        SabqHaptics.medium()
                        onBookmark()
                    } label: {
                        Image(systemName: isBookmarked ? "bookmark.fill" : "bookmark")
                            .font(.system(size: 12, weight: .medium))
                            .foregroundStyle(isBookmarked ? SabqTheme.primary : SabqTheme.textTertiary)
                            .frame(width: 28, height: 26)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(isBookmarked ? "إزالة من المحفوظات" : "حفظ الخبر")
                }
            }
        }
        .padding(.vertical, 14)
    }

    private var thumbnail: some View {
        Group {
            if let urlString = article.imageURL, let url = URL(string: urlString) {
                FocalCachedAsyncImage(
                    url: url,
                    focalPoint: article.imageFocalPoint,
                    maxPixelSize: 360,
                    fitsMismatchedAspect: true
                ) {
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
        .aiImageBadgeOverlay(
            isVisible: article.isAiGeneratedImage,
            model: article.aiImageModel,
            inset: 4,
            sizeScale: 0.65
        )
    }
}

// MARK: - Zubda Smart Summary Sheet (ورقة «✨ الزبدة»)

/// ورقة سفلية تعرض خلاصة الخبر في 3 نقاط سريعة مع إمكانية الاستماع الصوتي
/// أو الانتقال لقراءة التفاصيل الكاملة دون فقدان موضع التصفح في الرئيسية.
struct ZubdaSummarySheet: View {
    let article: Article
    let onReadFull: (Article) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var hydratedArticle: Article?
    @State private var isLoadingSummary = false
    @State private var audioPlayer = SabqAudioPlayer.shared

    private var displayArticle: Article {
        hydratedArticle ?? article
    }

    private var rawSummaryText: String {
        let ai = displayArticle.aiSummary.trimmingCharacters(in: .whitespacesAndNewlines)
        if !ai.isEmpty { return ai }
        return displayArticle.excerpt.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var bullets: [String] {
        let parsed = ArticleContext.summaryPoints(from: rawSummaryText)
        if !parsed.isEmpty { return parsed }
        return rawSummaryText.isEmpty ? [] : [rawSummaryText]
    }

    private var audioKey: String {
        "article:\(displayArticle.slug ?? displayArticle.id)"
    }

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: SabqLayout.space16) {
                HStack(alignment: .center) {
                    HStack(spacing: 6) {
                        Image(systemName: "sparkles")
                            .font(.system(size: 13, weight: .bold))
                        Text("الزبدة · خلاصة الخبر")
                            .font(SabqType.metaEmphasis.font)
                    }
                    .foregroundStyle(SabqTheme.primary)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
                    .background(Capsule(style: .continuous).fill(SabqTheme.skyTint))
                    .overlay(Capsule(style: .continuous).strokeBorder(SabqTheme.skyOutline, lineWidth: 0.75))

                    Spacer()

                    Button {
                        dismiss()
                    } label: {
                        Image(systemName: "xmark")
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(SabqTheme.textSecondary)
                            .frame(width: 34, height: 34)
                            .background(Circle().fill(SabqTheme.surfaceMuted))
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("إغلاق")
                }

                SabqRTLText(
                    displayArticle.title,
                    uiFont: SabqType.sectionHeading.uiFont,
                    color: SabqTheme.textPrimary,
                    lineLimit: 0,
                    lineSpacing: 3,
                    textStyle: SabqType.sectionHeading.uiTextStyle
                )

                if isLoadingSummary && bullets.isEmpty {
                    VStack(alignment: .leading, spacing: 10) {
                        SkeletonBox(height: 18)
                        SkeletonBox(height: 18)
                        SkeletonBox(width: 220, height: 18)
                    }
                    .padding(SabqLayout.cardInset)
                    .sabqSkyCardSurface()
                } else if !bullets.isEmpty {
                    VStack(alignment: .leading, spacing: SabqLayout.space12) {
                        ForEach(Array(bullets.enumerated()), id: \.offset) { index, point in
                            HStack(alignment: .top, spacing: 10) {
                                Text("\(index + 1)")
                                    .font(SabqType.tag.font)
                                    .foregroundStyle(SabqTheme.primary)
                                    .monospacedDigit()
                                    .frame(width: 24, height: 24)
                                    .background(Circle().fill(SabqTheme.surface))
                                    .overlay(Circle().strokeBorder(SabqTheme.skyOutline, lineWidth: 0.75))

                                Text(point)
                                    .sabqText(SabqType.excerpt)
                                    .foregroundStyle(SabqTheme.textPrimary)
                                    .fixedSize(horizontal: false, vertical: true)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                            }
                        }
                    }
                    .padding(SabqLayout.cardInset)
                    .sabqSkyCardSurface()
                } else {
                    Text("افتح الخبر لقراءة التفاصيل الكاملة وسياق التغطية.")
                        .sabqText(SabqType.excerpt)
                        .foregroundStyle(SabqTheme.textSecondary)
                        .padding(SabqLayout.cardInset)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .sabqSkyCardSurface()
                }

                HStack(spacing: SabqLayout.space8) {
                    if let slug = displayArticle.slug, !slug.isEmpty, !rawSummaryText.isEmpty {
                        let playing = audioPlayer.isPlaying(key: audioKey)
                        Button {
                            guard let url = URL(string: "\(URLConstants.publicAPI)/articles/\(slug)/summary-audio?tts=tafqit-v2") else { return }
                            SabqHaptics.medium()
                            audioPlayer.toggle(
                                SabqAudioPlayer.Item(
                                    key: audioKey,
                                    url: url,
                                    title: displayArticle.title,
                                    subtitle: "الملخص الصوتي · سبق",
                                    artworkURL: displayArticle.imageURL.flatMap(URL.init(string:)),
                                    delivery: .download
                                )
                            )
                        } label: {
                            HStack(spacing: 6) {
                                Image(systemName: playing ? "pause.fill" : "headphones")
                                    .font(SabqType.tag.font)
                                Text(playing ? "إيقاف" : "استمع")
                                    .font(SabqType.metaEmphasis.font)
                            }
                            .foregroundStyle(SabqTheme.primary)
                            .padding(.horizontal, 16)
                            .frame(minHeight: SabqLayout.controlHeight)
                            .background(
                                RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous)
                                    .fill(SabqTheme.surfaceMuted)
                            )
                            .overlay(
                                RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous)
                                    .strokeBorder(SabqTheme.separator, lineWidth: 0.75)
                            )
                        }
                        .buttonStyle(.plain)
                    }

                    Button {
                        SabqHaptics.light()
                        let target = displayArticle
                        dismiss()
                        DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) {
                            onReadFull(target)
                        }
                    } label: {
                        HStack(spacing: 6) {
                            Text("قراءة التفاصيل الكاملة")
                                .font(SabqType.button.font)
                            Image(systemName: "arrow.left")
                                .font(SabqType.tag.font)
                        }
                        .foregroundStyle(SabqTheme.onAction)
                        .frame(maxWidth: .infinity, minHeight: SabqLayout.controlHeight)
                        .background(
                            RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous)
                                .fill(SabqTheme.actionFill)
                        )
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, SabqLayout.pageMargin)
            .padding(.top, SabqLayout.space16)
            .padding(.bottom, SabqLayout.space24)
        }
        .background(SabqTheme.background)
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        .sabqRTL()
        .task(id: article.id) {
            guard let slug = article.slug, !slug.isEmpty else { return }
            if let cached = ArticleDetailCache.shared.entry(for: slug) {
                hydratedArticle = cached.article
                if cached.isFresh() { return }
            }
            if article.aiSummary.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                isLoadingSummary = true
            }
            if let bundle = await NewsService.fetchArticleDetail(slug: slug) {
                hydratedArticle = bundle.article
            }
            isLoadingSummary = false
        }
    }
}

// MARK: - Explore Radar & Interactive Portals («رادار استكشف»)

/// شبكة بوابات سبق التفاعلية (2×2) في شاشة «استكشف»: تجمع مواعيدك والاقتصاد الحي
/// ومركز المباريات ولحظة بلحظة في مدخل بصري واضح ومنظّم.
struct ExploreInteractiveHubsSection: View {
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    private var columns: [GridItem] {
        [GridItem(.adaptive(minimum: dynamicTypeSize.isAccessibilitySize ? 260 : 155), spacing: SabqLayout.space12)]
    }

    var body: some View {
        VStack(alignment: .leading, spacing: SabqLayout.space12) {
            DiscoverySectionHeading(
                title: "بوابات سبق التفاعلية",
                subtitle: "بيانات حيّة وخدمات يومية متجددة"
            )

            LazyVGrid(columns: columns, spacing: SabqLayout.space12) {
                NavigationLink(value: MawaeedRoute()) {
                    hubTile(
                        title: "مواعيدك",
                        subtitle: "الرواتب والدعم والإجازات القادمة",
                        icon: "calendar.badge.clock",
                        tint: SabqTheme.primary
                    )
                }
                .buttonStyle(.plain)

                NavigationLink(value: EconomyRoute()) {
                    hubTile(
                        title: "الاقتصاد الحي",
                        subtitle: "إنفاق نقاط البيع والقطاعات بالأرقام",
                        icon: "chart.line.uptrend.xyaxis",
                        tint: SabqTheme.success
                    )
                }
                .buttonStyle(.plain)

                NavigationLink(value: SportsTodayRoute()) {
                    hubTile(
                        title: "مركز المباريات",
                        subtitle: "مباريات اليوم ونتائج البطولات الكبرى",
                        icon: "sportscourt.fill",
                        tint: SabqTheme.teal
                    )
                }
                .buttonStyle(.plain)

                NavigationLink(value: MomentByMomentRoute()) {
                    hubTile(
                        title: "لحظة بلحظة",
                        subtitle: "تغطية الأخبار المتسارعة أولًا بأول",
                        icon: "dot.radiowaves.left.and.right",
                        tint: SabqTheme.breaking
                    )
                }
                .buttonStyle(.plain)
            }
        }
    }

    private func hubTile(title: String, subtitle: String, icon: String, tint: Color) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            SmallSquareBadge(systemImage: icon, tint: tint)

            VStack(alignment: .leading, spacing: 3) {
                Text(title)
                    .sabqText(SabqType.rowTitle)
                    .foregroundStyle(SabqTheme.textPrimary)

                Group {
                    if dynamicTypeSize.isAccessibilitySize {
                        Text(subtitle)
                    } else {
                        Text(subtitle).lineLimit(2, reservesSpace: true)
                    }
                }
                .font(SabqType.meta.font)
                .foregroundStyle(SabqTheme.textSecondary)
                .fixedSize(horizontal: false, vertical: true)
                .multilineTextAlignment(.leading)
            }
        }
        .padding(SabqLayout.space16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .sabqSkyCardSurface()
        .contentShape(RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous))
    }
}

// MARK: - Story Context Entry Points (مداخل «خلفية القصة» لقارئ الآيفون)

/// شارة تفاعلية في شريط وسوم الخبر تفتح ورقة «خلفية القصة وسياق الخبر».
struct StoryContextInlinePill: View {
    let action: () -> Void

    var body: some View {
        Button {
            SabqHaptics.light()
            action()
        } label: {
            HStack(spacing: 4) {
                Image(systemName: "safari")
                    .font(SabqType.timestamp.font.weight(.semibold))
                Text("خلفية القصة")
                    .font(SabqType.tag.font)
            }
            .foregroundStyle(SabqTheme.primary)
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .background(Capsule(style: .continuous).fill(SabqTheme.skyTint))
            .overlay(Capsule(style: .continuous).strokeBorder(SabqTheme.skyOutline, lineWidth: 0.75))
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("خلفية القصة وسياق الخبر")
    }
}

/// بطاقة دعوة هادئة أسفل متن الخبر لفتح التسلسل الزمني وسياق القصة في ورقة سفلية.
struct StoryContextPromptCard: View {
    let timelineCount: Int
    let relatedCount: Int
    let action: () -> Void

    private var subtitle: String {
        if timelineCount > 0 {
            return "استعرض التسلسل الزمني للحدث (\(timelineCount) محطات) والأخبار المرتبطة"
        }
        return "استعرض الموجز الذكي والأخبار المرتبطة (\(relatedCount)) في مكان واحد"
    }

    var body: some View {
        Button {
            SabqHaptics.light()
            action()
        } label: {
            HStack(spacing: SabqLayout.space12) {
                SmallSquareBadge(systemImage: "safari.fill", tint: SabqTheme.primary)

                VStack(alignment: .leading, spacing: 2) {
                    Text("خلفية القصة وسياق الخبر")
                        .font(SabqType.rowTitle.font)
                        .foregroundStyle(SabqTheme.textPrimary)
                    Text(subtitle)
                        .font(SabqType.meta.font)
                        .foregroundStyle(SabqTheme.textSecondary)
                        .multilineTextAlignment(.leading)
                }
                .frame(maxWidth: .infinity, alignment: .leading)

                Image(systemName: "chevron.left")
                    .font(SabqType.metaEmphasis.font)
                    .foregroundStyle(SabqTheme.primary)
            }
            .padding(SabqLayout.space16)
            .sabqSkyCardSurface()
            .contentShape(RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous))
        }
        .buttonStyle(.plain)
    }
}
