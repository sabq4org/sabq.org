import SwiftUI

/// عمود الأخبار على العرض العريض (iPhone Duo مفتوحًا، iPad، Stage Manager).
///
/// «الأخبار»: رئيسية الآيفون نفسها (`HomeFeedView`) بمحتواها وترتيبها، بطلب
/// المالك 2026-10-18 بدل الصفوف المضغوطة السابقة. النقر على خبر لا يدفع صفحة بل
/// يبدّل خبر القارئ المجاور (`ArticleLink` → `openInReader`)، وبقية الوجهات
/// تُدفع في عمود القارئ. «سياق الخبر»: رأس العمود + سياق الخبر المفتوح، ومفتاح
/// «الأخبار | سياق الخبر» يظهر في الحالتين متى كان في القارئ خبر له سياق.
/// على العرض الضيق (الجهاز مطويًا) يُعرض `HomeFeedView` مباشرة لا هذا العرض.
struct HomeSidebarView: View {
    @Environment(ArticlesStore.self) private var articlesStore
    @Environment(BookmarksStore.self) private var bookmarksStore
    @Environment(SabqNavigationState.self) private var navigation
    /// الوضع الخفيف يصل إلى العمود أيضًا: تُخفى المصغّرات (توفير البيانات هو
    /// جوهر «سبق لايت») ويظهر شريط التفعيل/التعافي أعلى العمود كما في
    /// `HomeFeedView`. القارئ المجاور يتحوّل تلقائيًا إلى `ArticleLiteView`.
    @Environment(LiteModeManager.self) private var liteManager
    @Environment(AuthStore.self) private var authStore
    @AppStorage("appAppearance") private var appearanceRaw: String = AppAppearance.system.rawValue
    @State private var notificationsStore = NotificationsStore.shared
    /// «نشرة سَبْق» — نفس شريط رئيسية الهاتف. يُحدَّث من ردّ ناجح فقط (#1923).
    @State private var audioBulletin: APIAudioBulletin?

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

    var body: some View {
        if navigation.readerContext != nil && navigation.homeSidebarMode == .context {
            ZStack(alignment: .top) {
                column
                LiteBannerView()
            }
        } else {
            // «الأخبار»: رئيسية الآيفون نفسها بمحتواها وترتيبها (طلب المالك
            // 2026-10-18)، والنقر على خبر يفتحه في القارئ المجاور.
            HomeFeedView()
                .environment(\.opensArticlesInReader, true)
                .environment(\.homeFeedTopAccessory, navigation.readerContext == nil ? nil : AnyView(
                    modePicker.padding(.top, SabqLayout.space4)
                ))
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

                if let bulletin = audioBulletin, !bulletin.audioUrl.isEmpty {
                    AudioBulletinBar(bulletin: bulletin)
                }

                if let context = navigation.readerContext {
                    modePicker
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
            .padding(.horizontal, SabqLayout.pageMargin)
            .padding(.top, SabqLayout.space8)
            .padding(.bottom, SabqLayout.space32)
            .animation(.easeOut(duration: 0.18), value: navigation.homeSidebarMode)
        }
        .background(SabqTheme.background)
        .refreshable {
            await articlesStore.loadArticles(ignoreCache: true)
            await refreshAudioBulletin()
            await notificationsStore.refreshUnreadCount()
        }
        // النشرة تُعتمد عدة مرات يوميًا: فحص كل دقيقتين ما دام العمود ظاهرًا
        .task {
            while !Task.isCancelled {
                await refreshAudioBulletin()
                try? await Task.sleep(for: .seconds(120))
            }
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

                    // الجرس كما في رئيسية الهاتف: صندوق القارئ والنقطة تجمع العدّادين
                    if authStore.isLoggedIn {
                        NavigationLink(value: ReaderInboxRoute()) {
                            headerIcon("bell")
                                .overlay(alignment: .topTrailing) {
                                    if notificationsStore.totalUnread > 0 {
                                        Circle()
                                            .fill(SabqTheme.breaking)
                                            .frame(width: 9, height: 9)
                                            .overlay(Circle().stroke(SabqTheme.background, lineWidth: 2))
                                            .padding(10)
                                    }
                                }
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(notificationsStore.totalUnread > 0
                            ? "الإشعارات — لديك إشعارات غير مقروءة"
                            : "الإشعارات")
                    }

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

    /// فشل الطلب لا يُخفي الشريط؛ null من الخادم وحده يعني «لا نشرة».
    private func refreshAudioBulletin() async {
        do {
            audioBulletin = try await APIClient.shared.fetchCurrentAudioBulletin(ignoreCache: true)
        } catch {}
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
