import SwiftUI

/// عمود الأخبار على العرض العريض (iPhone Duo مفتوحًا، iPad، Stage Manager).
///
/// رئيسية الآيفون نفسها (`HomeFeedView`) بمحتواها وترتيبها في الوضعين (طلب المالك
/// 2026-10-18). «الأخبار»: الكتل كاملة، والنقر على خبر يبدّل خبر القارئ المجاور
/// (`ArticleLink` → `openInReader`). «سياق الخبر»: سياق الخبر المفتوح مكان الكتل
/// (`homeFeedReplacement`)، والرأس والمفتاح والنشرة في أماكنها — كان عمود السياق
/// عرضًا منفصلًا برأس آخر فقفزت الأيقونات وتبدّل موضع المفتاح والنشرة عند
/// التبديل، وأُعيد بناء الرئيسية فضاع موضع التمرير (تسجيل المالك 2026-10-18).
/// على العرض الضيق (الجهاز مطويًا) يُعرض `HomeFeedView` مباشرة لا هذا العرض.
struct HomeSidebarView: View {
    @Environment(SabqNavigationState.self) private var navigation

    /// الترتيب نفسه الذي يراه المستخدم في العمود؛ `HomeReaderRoot` يفتح أوله
    /// تلقائيًا، فيتطابق الخبر المفتوح مع أول صف مُبرز.
    static func orderedArticles(_ store: ArticlesStore) -> [Article] {
        var seen = Set<String>()
        var result: [Article] = []
        for article in Array(store.breakingNews.prefix(3)) + store.featuredArticles + store.filteredArticles
        where !seen.contains(article.id) {
            seen.insert(article.id)
            result.append(article)
        }
        return result
    }

    private var showsContext: Bool {
        navigation.readerContext != nil && navigation.homeSidebarMode == .context
    }

    var body: some View {
        HomeFeedView()
            .environment(\.opensArticlesInReader, true)
            // المفتاح ثابت في العمود دائمًا: إخفاؤه حين يُسحب السياق (فتح مُقترب أو
            // رأي من العمود) كان يرفع العمود كله ~90 نقطة تحت إصبع القارئ، ويُبقي
            // الصف الملموس في موضعه القديم فوق ما بعده (محاكي 2026-10-18).
            .environment(\.homeFeedTopAccessory, AnyView(
                modePicker.padding(.top, SabqLayout.space4)
            ))
            .environment(\.homeFeedReplacement, showsContext ? contextReplacement : nil)
            // السياق أقصر من الكتل: بلا صعود يبقى موضع التمرير بعد نهايته فيظهر
            // العمود فارغًا (محاكي 2026-10-15)
            .onChange(of: showsContext) { _, nowContext in
                if nowContext { NotificationCenter.default.post(name: .sabqHomeScrollToTop, object: nil) }
            }
            .onChange(of: navigation.readerContext?.id) { _, _ in
                if showsContext { NotificationCenter.default.post(name: .sabqHomeScrollToTop, object: nil) }
            }
    }

    private var contextReplacement: AnyView? {
        guard let context = navigation.readerContext else { return nil }
        return AnyView(
            ArticleContextView(
                context: context,
                onOpenArticle: { navigation.openInReader($0) },
                onOpenOpinion: { navigation.openFromReaderContext($0, in: .home) },
                onOpenKeyword: { navigation.openFromReaderContext(KeywordRoute(keyword: $0), in: .home) }
            )
            .id(context.id)
            .transition(.opacity)
        )
    }

    /// «الأخبار | سياق الخبر» أعلى العمود (نموذج Duo المعتمد). «سياق الخبر» معطّل
    /// حين لا يكون في القارئ خبر له سياق (صفحة مُقترب، بحث، قسم…).
    private var modePicker: some View {
        HStack(spacing: SabqLayout.space4) {
            modeButton("الأخبار", mode: .news)
            modeButton("سياق الخبر", mode: .context)
        }
        .padding(SabqLayout.space4)
        .background(
            RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous)
                .fill(SabqTheme.surfaceMuted)
        )
    }

    private func modeButton(_ title: String, mode: HomeSidebarMode) -> some View {
        let isAvailable = mode == .news || navigation.readerContext != nil
        let isSelected = isAvailable && navigation.homeSidebarMode == mode
            || mode == .news && navigation.readerContext == nil
        return Button {
            guard !isSelected, isAvailable else { return }
            SabqHaptics.light()
            navigation.homeSidebarMode = mode
        } label: {
            Text(title)
                .font(SabqType.metaEmphasis.font)
                .foregroundStyle(isSelected ? SabqTheme.onAction
                                 : isAvailable ? SabqTheme.textPrimary : SabqTheme.textTertiary)
                .frame(maxWidth: .infinity, minHeight: 36)
                .background(
                    RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous)
                        .fill(isSelected ? SabqTheme.actionFill : Color.clear)
                )
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(!isAvailable)
        .accessibilityAddTraits(isSelected ? .isSelected : [])
        .accessibilityIdentifier(mode == .context ? "homeSidebarMode.context" : "homeSidebarMode.news")
    }
}

struct HomeSidebarNewsRow: View {
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    let article: Article
    let isOpen: Bool
    var isNew: Bool = false
    /// `false` في الوضع الخفيف: لا تُطلب الصور المصغّرة أصلًا.
    var showsThumbnail: Bool = true

    var body: some View {
        HStack(alignment: .top, spacing: NewsRowStyle.thumbnailGap) {
            VStack(alignment: .leading, spacing: NewsRowStyle.textStackSpacing) {
                SabqRTLText(
                    article.title,
                    uiFont: SabqType.rowTitle.uiFont,
                    color: SabqTheme.textPrimary,
                    lineLimit: dynamicTypeSize.isAccessibilitySize ? 0 : 3,
                    lineSpacing: NewsRowStyle.titleLineSpacing,
                    textStyle: SabqType.rowTitle.uiTextStyle
                )

                HStack(alignment: .center, spacing: 6) {
                    if article.isBreaking {
                        Text("عاجل")
                            .font(SabqType.tag.font)
                            .foregroundStyle(SabqTheme.breaking)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 2.5)
                            .background(Capsule(style: .continuous).fill(SabqTheme.breaking.opacity(0.08)))
                    }
                    Text(article.categoryTitle)
                        .font(SabqType.tag.font)
                        .foregroundStyle(SabqTheme.primary)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 2.5)
                        .background(Capsule(style: .continuous).fill(SabqTheme.primary.opacity(0.07)))
                    if isNew || article.isFreshlyPublished {
                        Text("جديد")
                            .font(SabqType.tag.font)
                            .foregroundStyle(SabqTheme.success)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 2.5)
                            .background(Capsule(style: .continuous).fill(SabqTheme.success.opacity(0.08)))
                    } else {
                        Text(Self.relativeTime(article.publishDate))
                    }
                }
                .font(SabqType.meta.font)
                .foregroundStyle(SabqTheme.textTertiary)
                .lineLimit(dynamicTypeSize.isAccessibilitySize ? nil : 1)
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            // المصغّرة في طرف السطر كـ`CompactArticleRow`.
            if showsThumbnail { thumbnail }
        }
        .padding(.vertical, SabqLayout.space12)
        .padding(.horizontal, SabqLayout.space8)
        // الصف المفتوح: تعبئة هادئة وشريط على الطرف البادئ، بلا تلوين أزرق للبطاقة.
        .background(
            RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous)
                .fill(isOpen ? SabqTheme.surfaceMuted : Color.clear)
        )
        .overlay(alignment: .leading) {
            if isOpen {
                Capsule()
                    .fill(SabqTheme.primary)
                    .frame(width: 4, height: 36)
            }
        }
        .padding(.horizontal, -SabqLayout.space8)
        .contentShape(Rectangle())
        .animation(.easeOut(duration: 0.18), value: isOpen)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(isOpen ? .isSelected : [])
    }

    @ViewBuilder
    private var thumbnail: some View {
        Group {
            if let urlString = article.imageURL, let url = URL(string: urlString) {
                FocalCachedAsyncImage(url: url, focalPoint: article.imageFocalPoint, maxPixelSize: 360, fitsMismatchedAspect: true) {
                    SabqImagePlaceholder()
                }
            } else {
                SabqImagePlaceholder()
                    .environment(\.sabqImageLoadFailed, true)
            }
        }
        .frame(width: NewsRowStyle.thumbnailWidth, height: NewsRowStyle.thumbnailHeight)
        .clipShape(RoundedRectangle(cornerRadius: NewsRowStyle.thumbnailRadius, style: .continuous))
    }

    static func relativeTime(_ date: Date) -> String {
        let seconds = max(0, Date().timeIntervalSince(date))
        let minutes = Int(seconds) / 60
        let hours = minutes / 60
        let days = hours / 24
        if minutes < 1 { return "الآن" }
        if minutes < 60 { return "قبل \(minutes) دقائق" }
        if hours == 1 { return "قبل ساعة" }
        if hours == 2 { return "قبل ساعتين" }
        if hours < 24 { return "قبل \(hours) ساعات" }
        if days == 1 { return "قبل يوم واحد" }
        if days == 2 { return "قبل يومين" }
        if days < 7 { return "قبل \(days) أيام" }
        let f = DateFormatter()
        f.locale = Locale(identifier: "ar")
        f.dateFormat = "d MMMM yyyy"
        return f.string(from: date)
    }
}
