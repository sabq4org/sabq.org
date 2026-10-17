import SwiftUI

/// عمود الأخبار على العرض العريض (iPhone Duo مفتوحًا، iPad، Stage Manager).
///
/// كان `SabqTabNavigation` يضع `HomeFeedView` كاملة — الهيرو الدوّار والشرائط
/// والشبكات — في عمود عرضه 320–520 نقطة بجوار قارئ فارغ. هذا العرض بديلها في
/// العمود فقط: رأس مضغوط (الشعار + بحث/لحظة بلحظة/المظهر)، بطاقة موجز
/// SABQ AI، ثم «عاجل» و«أبرز الأخبار» كصفوف مضغوطة. النقر لا يدفع صفحة
/// جديدة بل يبدّل الخبر المفتوح في عمود القارئ (`SabqNavigationState.openInReader`)
/// ويُبرز الصف المفتوح حاليًا. على العرض الضيق (الجهاز مطويًا) يبقى
/// `HomeFeedView` كما هو ولا يُستخدم هذا العرض إطلاقًا.
struct HomeSidebarView: View {
    @Environment(ArticlesStore.self) private var articlesStore
    @Environment(BookmarksStore.self) private var bookmarksStore
    @Environment(SabqNavigationState.self) private var navigation
    /// الوضع الخفيف يصل إلى العمود أيضًا: تُخفى المصغّرات (توفير البيانات هو
    /// جوهر «سبق لايت») ويظهر شريط التفعيل/التعافي أعلى العمود كما في
    /// `HomeFeedView`. القارئ المجاور يتحوّل تلقائيًا إلى `ArticleLiteView`.
    @Environment(LiteModeManager.self) private var liteManager
    @AppStorage("appAppearance") private var appearanceRaw: String = AppAppearance.system.rawValue

    private var breaking: [Article] { Array(articlesStore.breakingNews.prefix(3)) }
    /// الأبرز ثم آخر الأخبار بلا تكرار لما ظهر في «عاجل».
    private var highlights: [Article] {
        let shownBreaking = Set(breaking.map(\.id))
        var seen = shownBreaking
        var result: [Article] = []
        for article in articlesStore.featuredArticles + articlesStore.filteredArticles
        where !seen.contains(article.id) {
            seen.insert(article.id)
            result.append(article)
        }
        return result
    }
    private var isEmpty: Bool { breaking.isEmpty && highlights.isEmpty }

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

    private var openArticleID: String? {
        (navigation.homeReaderArticle ?? Self.orderedArticles(articlesStore).first)?.id
    }

    var body: some View {
        ZStack(alignment: .top) {
            column
            LiteBannerView()
        }
    }

    private static let columnTopID = "homeSidebarTop"

    private var column: some View {
        ScrollViewReader { scrollProxy in
        ScrollView(showsIndicators: false) {
            LazyVStack(alignment: .leading, spacing: SabqLayout.space16) {
                Color.clear
                    .frame(height: 0)
                    .id(Self.columnTopID)
                header

                if let context = navigation.readerContext {
                    modePicker
                    if navigation.homeSidebarMode == .context {
                        ArticleContextView(
                            context: context,
                            onOpenArticle: { navigation.openInReader($0) },
                            onOpenOpinion: { navigation.openFromReaderContext($0, in: .home) },
                            onOpenKeyword: { navigation.openFromReaderContext(KeywordRoute(keyword: $0), in: .home) }
                        )
                        .id(context.id)
                        .transition(.opacity)
                    }
                }

                if navigation.readerContext == nil || navigation.homeSidebarMode == .news {
                    newsList
                }
            }
            .padding(.horizontal, SabqLayout.pageMargin)
            .padding(.top, SabqLayout.space8)
            .padding(.bottom, SabqLayout.space32)
            .animation(.easeOut(duration: 0.18), value: navigation.homeSidebarMode)
        }
        .background(SabqTheme.background)
        .refreshable {
            await articlesStore.loadArticles(ignoreCache: true)
        }
        // اختيار خبر من أسفل القائمة يبدّل العمود إلى سياقه الأقصر؛ بلا هذا
        // يبقى موضع التمرير بعد نهاية المحتوى فيظهر العمود فارغًا (محاكي
        // 2026-10-15).
        .onChange(of: navigation.homeSidebarMode) { _, _ in
            scrollProxy.scrollTo(Self.columnTopID, anchor: .top)
        }
        .onChange(of: navigation.readerContext?.id) { _, _ in
            if navigation.homeSidebarMode == .context {
                scrollProxy.scrollTo(Self.columnTopID, anchor: .top)
            }
        }
        }
    }

    /// «الأخبار | سياق الخبر» أعلى العمود (نموذج Duo المعتمد). يظهر فقط حين
    /// يكون في القارئ خبر له سياق.
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
        let isSelected = navigation.homeSidebarMode == mode
        return Button {
            guard !isSelected else { return }
            SabqHaptics.light()
            navigation.homeSidebarMode = mode
        } label: {
            Text(title)
                .font(SabqType.metaEmphasis.font)
                .foregroundStyle(isSelected ? SabqTheme.onAction : SabqTheme.textPrimary)
                .frame(maxWidth: .infinity, minHeight: 36)
                .background(
                    RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous)
                        .fill(isSelected ? SabqTheme.actionFill : Color.clear)
                )
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(isSelected ? .isSelected : [])
        .accessibilityIdentifier(mode == .context ? "homeSidebarMode.context" : "homeSidebarMode.news")
    }

    @ViewBuilder
    private var newsList: some View {
        briefingCard

        if isEmpty {
            emptyState
        } else {
            if !breaking.isEmpty {
                section("عاجل", icon: "bolt.fill", tint: SabqTheme.breaking, articles: breaking)
            }
            if !highlights.isEmpty {
                SabqSectionBand()
                section("أبرز الأخبار", icon: nil, tint: SabqTheme.primary, articles: highlights)
                if articlesStore.hasMore { loadMoreButton }
            }
        }
    }

    // MARK: - Header

    private var header: some View {
        VStack(alignment: .leading, spacing: SabqLayout.space12) {
            HStack(alignment: .center, spacing: SabqLayout.space12) {
                SabqBrandLogo(height: 44)

                Spacer(minLength: 0)

                HStack(spacing: SabqLayout.space4) {
                    NavigationLink(value: SearchRoute()) { headerIcon("magnifyingglass") }
                        .buttonStyle(.plain)
                        .accessibilityLabel("البحث")

                    NavigationLink(value: MomentByMomentRoute()) { headerIcon("dot.radiowaves.left.and.right") }
                        .buttonStyle(.plain)
                        .accessibilityLabel("لحظة بلحظة — التغطية المباشرة")

                    Button {
                        SabqHaptics.light()
                        withAnimation(.spring(response: 0.4, dampingFraction: 0.86)) {
                            let current = AppAppearance(rawValue: appearanceRaw) ?? .system
                            appearanceRaw = current.next.rawValue
                        }
                    } label: {
                        headerIcon((AppAppearance(rawValue: appearanceRaw) ?? .system).iconName)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("تبديل المظهر")
                }
            }

            if articlesStore.newArticlesCount > 0 {
                Button {
                    SabqHaptics.medium()
                    withAnimation(.spring(response: 0.4, dampingFraction: 0.8)) {
                        articlesStore.applyPendingArticles()
                    }
                } label: {
                    HStack(spacing: SabqLayout.space8) {
                        Image(systemName: "arrow.up")
                            .font(SabqType.tag.font)
                        Text(newArticlesText)
                    }
                    .font(SabqType.metaEmphasis.font)
                    .foregroundStyle(SabqTheme.onAction)
                    .padding(.horizontal, SabqLayout.space16)
                    .frame(minHeight: 36)
                    .background(Capsule().fill(SabqTheme.actionFill))
                    .frame(minHeight: SabqLayout.touchTarget)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.vertical, SabqLayout.space4)
    }

    private func headerIcon(_ systemName: String) -> some View {
        // رمز صريح بلا دائرة خلفه كرأس الرئيسية.
        Image(systemName: systemName)
            .font(.system(size: 19, weight: .regular))
            .foregroundStyle(SabqTheme.textPrimary)
            .frame(width: SabqLayout.touchTarget, height: SabqLayout.touchTarget)
            .contentShape(Rectangle())
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

    // MARK: - Briefing card

    /// نسخة مضغوطة من بطاقة التحية في `HomeFeedView.greetingBlock` (التحية
    /// حسب الساعة + شارة SABQ AI) تناسب عمودًا عرضه 340–520 نقطة.
    private var briefingCard: some View {
        let hour = Calendar.current.component(.hour, from: Date())
        let greeting: String
        let icon: String
        switch hour {
        case 5..<12:
            greeting = "صباح الخير"; icon = "sun.max.fill"
        case 12..<17:
            greeting = "نهارك سعيد"; icon = "sun.haze.fill"
        case 17..<21:
            greeting = "مساء الخير"; icon = "sunset.fill"
        default:
            greeting = "ليلة هادئة"; icon = "moon.stars.fill"
        }

        // بلوك هادئ كتحية الرئيسية: رمز في مربع هادئ، بلا ألوان الساعة ولا تدرّج.
        return NavigationLink(value: DailyBriefRoute()) {
            HStack(alignment: .center, spacing: SabqLayout.space12) {
                Image(systemName: icon)
                    .font(.system(size: 20, weight: .regular))
                    .foregroundStyle(SabqTheme.primary)
                    .frame(width: SabqLayout.touchTarget, height: SabqLayout.touchTarget)
                    .background(
                        RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous)
                            .fill(SabqTheme.surface)
                    )
                    .accessibilityHidden(true)

                VStack(alignment: .leading, spacing: SabqLayout.space4) {
                    HStack(spacing: SabqLayout.space8) {
                        Text(greeting)
                            .font(SabqType.meta.font)
                            .foregroundStyle(SabqTheme.textSecondary)
                        HStack(spacing: SabqLayout.space4) {
                            Image(systemName: "sparkles")
                            Text("SABQ AI")
                        }
                        .font(SabqType.tag.font)
                        .foregroundStyle(SabqTheme.primary)
                    }
                    Text("موجز خاص بك داخل سبق")
                        .font(SabqType.rowTitle.font)
                        .foregroundStyle(SabqTheme.textPrimary)
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)
                    Text("بعد التسجيل يظهر لك موجز يومي مبني على اهتماماتك")
                        .font(SabqType.meta.font)
                        .foregroundStyle(SabqTheme.textSecondary)
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)
                }
                .frame(maxWidth: .infinity, alignment: .leading)

                Image(systemName: "chevron.left")
                    .font(SabqType.meta.font)
                    .foregroundStyle(SabqTheme.textTertiary)
                    .accessibilityHidden(true)
            }
            .padding(SabqLayout.cardInset)
            .frame(maxWidth: .infinity, alignment: .leading)
            .sabqBlockSurface()
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    // MARK: - Sections

    private func section(_ title: String, icon: String?, tint: Color, articles: [Article]) -> some View {
        VStack(alignment: .leading, spacing: SabqLayout.space4) {
            HStack(spacing: SabqLayout.space8) {
                if let icon {
                    Image(systemName: icon)
                        .font(SabqType.tag.font)
                        .foregroundStyle(tint)
                        .accessibilityHidden(true)
                }
                Text(title)
                    .font(SabqType.sectionHeading.font)
                    .foregroundStyle(SabqTheme.textPrimary)
                    .accessibilityAddTraits(.isHeader)
            }

            // صفوف بفواصل رفيعة على الصفحة، بلا بطاقات.
            LazyVStack(spacing: 0) {
                ForEach(Array(articles.enumerated()), id: \.element.id) { index, article in
                    if index > 0 { SidebarRowDivider() }
                    Button {
                        SabqHaptics.light()
                        navigation.openInReader(article)
                    } label: {
                        HomeSidebarNewsRow(
                            article: article,
                            isOpen: article.id == openArticleID,
                            isNew: articlesStore.isRecentlyAdded(article.id),
                            showsThumbnail: !liteManager.isLiteActive
                        )
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("homeSidebarRow")
                    .contextMenu {
                        Button {
                            bookmarksStore.toggle(article.id, article: article)
                        } label: {
                            Label(bookmarksStore.isBookmarked(article.id) ? "إزالة من المحفوظات" : "حفظ",
                                  systemImage: bookmarksStore.isBookmarked(article.id) ? "bookmark.slash" : "bookmark")
                        }
                    }
                }
            }
        }
    }

    private var loadMoreButton: some View {
        Button {
            Task { await articlesStore.loadMore() }
        } label: {
            HStack(spacing: SabqLayout.space8) {
                if articlesStore.isLoading {
                    ProgressView().tint(SabqTheme.primary)
                }
                Text("تحميل المزيد")
            }
            .font(SabqType.button.font)
            .foregroundStyle(SabqTheme.primary)
            .frame(maxWidth: .infinity, minHeight: SabqLayout.controlHeight)
            .overlay(
                RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous)
                    .stroke(SabqTheme.outline, lineWidth: 1)
            )
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(articlesStore.isLoading)
    }

    // MARK: - Empty

    private var emptyState: some View {
        VStack(spacing: SabqLayout.space12) {
            if articlesStore.isLoading {
                ProgressView().tint(SabqTheme.primary)
                Text("جارٍ تحميل الأخبار…")
            } else {
                Image(systemName: "newspaper")
                    .font(.system(size: 28))
                    .accessibilityHidden(true)
                Text(articlesStore.errorMessage ?? "لا توجد أخبار الآن")
            }
        }
        .font(SabqType.excerpt.font)
        .foregroundStyle(SabqTheme.textSecondary)
        .multilineTextAlignment(.center)
        .frame(maxWidth: .infinity)
        .padding(.vertical, SabqLayout.space40)
    }
}

// MARK: - Row

/// صف خبر في العمود الجانبي: عنوان حتى ثلاثة أسطر، سطر «القسم • منذ …»،
/// وصورة مصغّرة على الطرف البادئ. الصف المفتوح في القارئ يحمل خلفية زرقاء
/// خفيفة وشريطًا على الطرف الختامي حتى يعرف القارئ أين هو في القائمة.
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
