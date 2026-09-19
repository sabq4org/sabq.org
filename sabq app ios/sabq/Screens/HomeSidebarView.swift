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

    private var column: some View {
        ScrollView(showsIndicators: false) {
            LazyVStack(alignment: .leading, spacing: 18) {
                header
                briefingCard

                if isEmpty {
                    emptyState
                } else {
                    if !breaking.isEmpty {
                        section("عاجل", icon: "bolt.fill", tint: SabqTheme.coral, articles: breaking)
                    }
                    if !highlights.isEmpty {
                        section("أبرز الأخبار", icon: nil, tint: SabqTheme.primaryEnd, articles: highlights)
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
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .center, spacing: 12) {
                Image("SabqLogo")
                    .renderingMode(.original)
                    .resizable()
                    .aspectRatio(contentMode: .fit)
                    .frame(height: 44)

                Spacer(minLength: 0)

                HStack(spacing: 10) {
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

    private func headerIcon(_ systemName: String) -> some View {
        ZStack {
            Circle()
                .fill(
                    LinearGradient(
                        colors: [SabqTheme.primaryStart.opacity(0.10), SabqTheme.primaryEnd.opacity(0.05)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
                .frame(width: 44, height: 44)
            Image(systemName: systemName)
                .font(.system(size: 17, weight: .semibold))
                .foregroundStyle(SabqTheme.primaryEnd)
        }
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
        let tint: Color
        switch hour {
        case 5..<12:
            greeting = "صباح الخير"; icon = "sun.max.fill"
            tint = Color(red: 0.96, green: 0.72, blue: 0.18)
        case 12..<17:
            greeting = "نهارك سعيد"; icon = "sun.haze.fill"
            tint = Color(red: 0.93, green: 0.58, blue: 0.22)
        case 17..<21:
            greeting = "مساء الخير"; icon = "sunset.fill"
            tint = Color(red: 0.95, green: 0.45, blue: 0.20)
        default:
            greeting = "ليلة هادئة"; icon = "moon.stars.fill"
            tint = Color(red: 0.46, green: 0.52, blue: 0.95)
        }

        return NavigationLink(value: DailyBriefRoute()) {
            HStack(alignment: .top, spacing: 12) {
                ZStack {
                    Circle()
                        .fill(tint.opacity(0.14))
                        .frame(width: 48, height: 48)
                    Image(systemName: icon)
                        .font(.system(size: 20, weight: .semibold))
                        .foregroundStyle(tint)
                        .symbolRenderingMode(.hierarchical)
                }

                VStack(alignment: .leading, spacing: 5) {
                    HStack(spacing: 6) {
                        Text(greeting)
                            .font(SabqFonts.app(size: 12, weight: .medium))
                            .foregroundStyle(SabqTheme.secondaryInk)
                        HStack(spacing: 3) {
                            Image(systemName: "sparkles")
                                .font(SabqFonts.app(size: 8, weight: .bold))
                            Text("SABQ AI")
                                .font(SabqFonts.app(size: 9, weight: .medium))
                        }
                        .foregroundStyle(.white)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(
                            Capsule().fill(
                                LinearGradient(colors: [SabqTheme.primaryEnd, tint],
                                               startPoint: .leading, endPoint: .trailing)
                            )
                        )
                    }
                    Text("موجز خاص بك داخل سبق")
                        .font(SabqFonts.app(size: 15, weight: .semibold))
                        .foregroundStyle(SabqTheme.ink)
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)
                    Text("بعد التسجيل يظهر لك موجز يومي مبني على اهتماماتك")
                        .font(SabqFonts.app(size: 11, weight: .regular))
                        .foregroundStyle(SabqTheme.tertiaryInk)
                        .lineLimit(1)
                }
                Spacer(minLength: 0)
            }
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                RoundedRectangle(cornerRadius: SabqTheme.cardRadius, style: .continuous)
                    .fill(.ultraThinMaterial)
                    .overlay(
                        RoundedRectangle(cornerRadius: SabqTheme.cardRadius, style: .continuous)
                            .fill(tint.opacity(0.05))
                    )
            )
        }
        .buttonStyle(.plain)
    }

    // MARK: - Sections

    private func section(_ title: String, icon: String?, tint: Color, articles: [Article]) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                if let icon {
                    Image(systemName: icon)
                        .font(SabqFonts.app(size: 13, weight: .semibold))
                        .foregroundStyle(tint)
                }
                Text(title)
                    .font(SabqFonts.app(size: 16, weight: .bold))
                    .foregroundStyle(SabqTheme.ink)
            }
            .padding(.horizontal, 4)

            LazyVStack(spacing: 10) {
                ForEach(articles) { article in
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

// MARK: - Row

/// صف خبر في العمود الجانبي: عنوان حتى ثلاثة أسطر، سطر «القسم • منذ …»،
/// وصورة مصغّرة على الطرف البادئ. الصف المفتوح في القارئ يحمل خلفية زرقاء
/// خفيفة وشريطًا على الطرف الختامي حتى يعرف القارئ أين هو في القائمة.
struct HomeSidebarNewsRow: View {
    let article: Article
    let isOpen: Bool
    var isNew: Bool = false
    /// `false` في الوضع الخفيف: لا تُطلب الصور المصغّرة أصلًا.
    var showsThumbnail: Bool = true

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            if showsThumbnail { thumbnail }

            VStack(alignment: .leading, spacing: 8) {
                Text(article.title)
                    .font(SabqFonts.app(size: 15, weight: .bold))
                    .foregroundStyle(SabqTheme.ink)
                    .lineLimit(3)
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)

                HStack(spacing: 6) {
                    if article.isBreaking {
                        Text("عاجل")
                            .font(SabqFonts.app(size: 11, weight: .bold))
                            .foregroundStyle(SabqTheme.coral)
                        Text("•").foregroundStyle(SabqTheme.tertiaryInk)
                    } else if isNew {
                        Text("جديد")
                            .font(SabqFonts.app(size: 11, weight: .bold))
                            .foregroundStyle(SabqTheme.primaryEnd)
                        Text("•").foregroundStyle(SabqTheme.tertiaryInk)
                    }
                    Text(article.categoryTitle)
                    Text("•")
                    Text(Self.relativeTime(article.publishDate))
                }
                .font(SabqFonts.app(size: 12, weight: .medium))
                .foregroundStyle(SabqTheme.secondaryInk)
                .lineLimit(1)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(12)
        .background(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .fill(isOpen ? SabqTheme.primaryEnd.opacity(0.10) : SabqTheme.surface)
        )
        .overlay(alignment: .trailing) {
            if isOpen {
                Capsule()
                    .fill(SabqTheme.primaryEnd)
                    .frame(width: 4, height: 36)
                    .padding(.trailing, 6)
            }
        }
        .contentShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
        .animation(.easeOut(duration: 0.18), value: isOpen)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(isOpen ? .isSelected : [])
    }

    @ViewBuilder
    private var thumbnail: some View {
        Group {
            if let urlString = article.imageURL, let url = URL(string: urlString) {
                FocalCachedAsyncImage(url: url, focalPoint: article.imageFocalPoint, maxPixelSize: 260) {
                    placeholder
                }
            } else {
                placeholder
            }
        }
        .frame(width: 80, height: 80)
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(SabqTheme.ink.opacity(0.10), lineWidth: 1)
        )
    }

    private var placeholder: some View {
        RoundedRectangle(cornerRadius: 14, style: .continuous)
            .fill(
                LinearGradient(
                    colors: [article.category.tint.opacity(0.12), article.category.tint.opacity(0.04)],
                    startPoint: .topLeading, endPoint: .bottomTrailing
                )
            )
            .overlay {
                Image(systemName: "newspaper")
                    .font(.system(size: 20, weight: .medium))
                    .foregroundStyle(article.category.tint.opacity(0.6))
            }
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
