import SwiftUI

// MARK: - Editorial Masthead (ترويسة الصحيفة)

/// ترويسة «صحيفة سبق» الورقية الهادئة: شعار الهوية + التاريخ الهجري بتوقيت الرياض،
/// وفي الطرف الأيسر كبسولة «لحظة بلحظة» وجرس الإشعارات فقط بلا زحام أيقونات.
struct EditorialMastheadView: View {
    let isCompact: Bool
    let isLoggedIn: Bool
    let unreadNotifications: Int

    private static let hijriFormatter: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "ar-SA-u-ca-islamic-umalqura-nu-latn")
        f.calendar = Calendar(identifier: .islamicUmmAlQura)
        f.timeZone = TimeZone(identifier: "Asia/Riyadh")
        f.dateFormat = "d MMMM yyyy"
        return f
    }()

    var body: some View {
        HStack(alignment: .center, spacing: SabqLayout.space12) {
            HStack(alignment: .center, spacing: 10) {
                SabqBrandLogo(height: isCompact ? 30 : 36)

                if !isCompact {
                    Rectangle()
                        .fill(SabqTheme.separator)
                        .frame(width: 1, height: 24)
                        .accessibilityHidden(true)

                    TimelineView(.everyMinute) { context in
                        VStack(alignment: .leading, spacing: 1) {
                            Text("صحيفة سبق")
                                .font(SabqType.tag.font)
                                .foregroundStyle(SabqTheme.textPrimary)
                                .lineLimit(1)

                            Text("\u{200F}\(Self.hijriFormatter.string(from: context.date)) هـ")
                                .font(SabqType.timestamp.font)
                                .foregroundStyle(SabqTheme.textTertiary)
                                .monospacedDigit()
                                .lineLimit(1)
                                .minimumScaleFactor(0.85)
                        }
                    }
                    .transition(.opacity)
                }
            }

            Spacer(minLength: 8)

            HStack(spacing: SabqLayout.space8) {
                ReaderLink(value: MomentByMomentRoute()) {
                    HStack(spacing: 6) {
                        PulsingDot(color: SabqTheme.breaking)
                        Text("لحظة بلحظة")
                            .font(SabqType.tag.font)
                            .foregroundStyle(SabqTheme.breaking)
                            .lineLimit(1)
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 7)
                    .background(
                        Capsule(style: .continuous)
                            .fill(SabqTheme.breaking.opacity(0.08))
                    )
                    .overlay(
                        Capsule(style: .continuous)
                            .strokeBorder(SabqTheme.breaking.opacity(0.22), lineWidth: 0.75)
                    )
                    .frame(minHeight: 38)
                    .contentShape(Capsule())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("لحظة بلحظة — التغطية المباشرة")

                if isLoggedIn {
                    ReaderLink(value: ReaderInboxRoute()) {
                        bellCircle(showDot: unreadNotifications > 0)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(
                        unreadNotifications > 0
                            ? "الإشعارات — لديك إشعارات غير مقروءة"
                            : "الإشعارات"
                    )
                } else {
                    ReaderLink(value: ReaderNotificationSettingsRoute()) {
                        bellCircle(showDot: false)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("إعدادات الإشعارات")
                }
            }
        }
    }

    private func bellCircle(showDot: Bool) -> some View {
        Image(systemName: "bell")
            .font(.system(size: 16, weight: .medium))
            .foregroundStyle(SabqTheme.textPrimary)
            .frame(width: 38, height: 38)
            .background(Circle().fill(SabqTheme.surfaceMuted))
            .overlay(Circle().strokeBorder(SabqTheme.separator, lineWidth: 0.75))
            .overlay(alignment: .topTrailing) {
                if showDot {
                    Circle()
                        .fill(SabqTheme.breaking)
                        .frame(width: 9, height: 9)
                        .overlay(Circle().stroke(SabqTheme.background, lineWidth: 1.5))
                        .offset(x: -6, y: 6)
                }
            }
            .contentShape(Circle())
    }
}

// MARK: - Editorial Lenses Bar (عدسات التصفية السريعة)

/// شريط العدسات التحريرية أعلى الرئيسية: يتنقّل بين «الكل» والأقسام بنقرة واحدة،
/// مع عدسة مباشرة لـ«آراء وعمق».
struct EditorialLensesBar: View {
    @Binding var selectedCategory: ArticleCategory?

    private static let orderedCategories: [ArticleCategory] = [
        .saudi, .sports, .business, .world, .life, .technology,
        .regions, .culture, .tourism, .community, .cars, .stations
    ]

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: SabqLayout.space8) {
                lensPill(
                    title: "الكل",
                    isSelected: selectedCategory == nil
                ) {
                    SabqHaptics.selection()
                    withAnimation(.snappy(duration: 0.22)) {
                        selectedCategory = nil
                    }
                }

                ForEach(Self.orderedCategories) { category in
                    let label = category == .business ? "اقتصاد وأعمال" : category.title
                    lensPill(
                        title: label,
                        isSelected: selectedCategory == category
                    ) {
                        SabqHaptics.selection()
                        withAnimation(.snappy(duration: 0.22)) {
                            selectedCategory = selectedCategory == category ? nil : category
                        }
                    }
                }

                ReaderLink(value: OpinionsRoute()) {
                    HStack(spacing: 4) {
                        Image(systemName: "quote.opening")
                            .font(.system(size: 10, weight: .bold))
                        Text("آراء وعمق")
                            .font(SabqType.tag.font)
                    }
                    .foregroundStyle(SabqTheme.primary)
                    .padding(.horizontal, 13)
                    .padding(.vertical, 7)
                    .background(Capsule(style: .continuous).fill(SabqTheme.skyTint))
                    .overlay(Capsule(style: .continuous).strokeBorder(SabqTheme.skyOutline, lineWidth: 0.75))
                    .contentShape(Capsule())
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, SabqLayout.pageMargin)
            .padding(.vertical, 2)
        }
        .fixedSize(horizontal: false, vertical: true)
        .padding(.horizontal, -SabqLayout.pageMargin)
    }

    private func lensPill(title: String, isSelected: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .font(SabqType.tag.font)
                .foregroundStyle(isSelected ? SabqTheme.onAction : SabqTheme.textSecondary)
                .lineLimit(1)
                .padding(.horizontal, 14)
                .padding(.vertical, 7)
                .background(
                    Capsule(style: .continuous)
                        .fill(isSelected ? SabqTheme.actionFill : SabqTheme.surfaceMuted)
                )
                .overlay(
                    Capsule(style: .continuous)
                        .strokeBorder(isSelected ? Color.clear : SabqTheme.separator, lineWidth: 0.75)
                )
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(isSelected ? [.isSelected] : [])
    }
}

// MARK: - Editorial Hero Section (الخبر الرئيسي غير المبتور + شريط البارزة المسمّى)

/// الهيرو التحريري الجديد:
/// 1) صورة 16:9 نقية بلا تدرج معتم يطمس الوجوه.
/// 2) عنوان كامل غير مبتور (`lineLimit: 0`) مع زر «✨ الزبدة» والحفظ السريع.
/// 3) شريط فرعي مسمّى للأخبار البارزة (1 · 2 · 3) بدل النقاط الصامتة.
struct EditorialHeroSection: View {
    let articles: [Article]
    let isBookmarked: (Article) -> Bool
    let onBookmark: (Article) -> Void
    let onZubda: (Article) -> Void

    @State private var selectedIndex: Int = 0
    @Environment(\.opensArticlesInReader) private var opensInReader
    @Environment(SabqNavigationState.self) private var navigation

    private var activeArticle: Article? {
        guard !articles.isEmpty else { return nil }
        let idx = min(max(0, selectedIndex), articles.count - 1)
        return articles[idx]
    }

    var body: some View {
        if let active = activeArticle {
            VStack(alignment: .leading, spacing: SabqLayout.space12) {
                leadStoryView(active)

                if articles.count > 1 {
                    namedSubLeadsStrip
                }
            }
            .onChange(of: articles.map(\.id)) { _, _ in
                if selectedIndex >= articles.count {
                    selectedIndex = 0
                }
            }
        }
    }

    private func leadStoryView(_ article: Article) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            ArticleLink(article: article) {
                Color.clear
                    .frame(maxWidth: .infinity)
                    .aspectRatio(16.0 / 9.6, contentMode: .fit)
                    .overlay {
                        if let urlString = article.imageURL, let url = URL(string: urlString) {
                            FocalCachedAsyncImage(
                                url: url,
                                focalPoint: article.imageFocalPoint ?? ImageFocalPoint(x: 50, y: 30)
                            ) {
                                SabqImagePlaceholder()
                            }
                        } else {
                            SabqImagePlaceholder()
                                .environment(\.sabqImageLoadFailed, true)
                        }
                    }
                    .clipShape(RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous)
                            .strokeBorder(SabqTheme.separator, lineWidth: 0.75)
                    )
                    .aiImageBadgeOverlay(
                        isVisible: article.isAiGeneratedImage,
                        model: article.aiImageModel,
                        inset: 10
                    )
            }
            .buttonStyle(.plain)

            HStack(alignment: .center, spacing: SabqLayout.space8) {
                ArticleLink(article: article) {
                    HStack(spacing: 6) {
                        if article.isBreaking {
                            HStack(spacing: 4) {
                                PulsingDot(color: SabqTheme.breaking)
                                Text("عاجل")
                                    .font(SabqType.tag.font)
                            }
                            .foregroundStyle(SabqTheme.breaking)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 3)
                            .background(Capsule(style: .continuous).fill(SabqTheme.breaking.opacity(0.10)))
                        } else {
                            Text(article.categoryTitle)
                                .font(SabqType.tag.font)
                                .foregroundStyle(SabqTheme.primary)
                            if article.isInfographic {
                                InfographicPill()
                            }
                        }

                        Text("·")
                            .font(SabqType.timestamp.font)
                            .foregroundStyle(SabqTheme.textTertiary)
                            .accessibilityHidden(true)

                        if article.isFreshlyPublished {
                            Text("جديد")
                                .font(SabqType.tag.font)
                                .foregroundStyle(SabqTheme.success)
                        } else {
                            Text(article.heroWhenLabel)
                                .font(SabqType.timestamp.font)
                                .foregroundStyle(SabqTheme.textTertiary)
                                .monospacedDigit()
                        }
                    }
                    .lineLimit(1)
                }
                .buttonStyle(.plain)

                Spacer(minLength: 4)

                HStack(spacing: 6) {
                    Button {
                        SabqHaptics.light()
                        onZubda(article)
                    } label: {
                        HStack(spacing: 4) {
                            Image(systemName: "sparkles")
                                .font(.system(size: 11, weight: .semibold))
                            Text("الزبدة")
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
                    .accessibilityLabel("الزبدة — ملخص سريع للخبر الرئيسي")

                    let saved = isBookmarked(article)
                    Button {
                        SabqHaptics.medium()
                        onBookmark(article)
                    } label: {
                        Image(systemName: saved ? "bookmark.fill" : "bookmark")
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundStyle(saved ? SabqTheme.primary : SabqTheme.textSecondary)
                            .frame(width: 30, height: 30)
                            .background(Circle().fill(SabqTheme.surfaceMuted))
                            .overlay(Circle().strokeBorder(SabqTheme.separator, lineWidth: 0.75))
                            .contentShape(Circle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(saved ? "إزالة من المحفوظات" : "حفظ الخبر")
                }
            }

            ArticleLink(article: article) {
                SabqRTLText(
                    article.title,
                    uiFont: SabqType.leadTitle.uiFont,
                    color: SabqTheme.textPrimary,
                    lineLimit: 0,
                    lineSpacing: SabqType.leadTitle.lineSpacing,
                    textStyle: SabqType.leadTitle.uiTextStyle
                )
                .frame(maxWidth: .infinity, alignment: .leading)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        }
    }

    private var namedSubLeadsStrip: some View {
        let count = min(articles.count, 3)
        return HStack(alignment: .top, spacing: SabqLayout.space8) {
            ForEach(0..<count, id: \.self) { idx in
                let item = articles[idx]
                let isActive = idx == min(selectedIndex, count - 1)
                Button {
                    if isActive {
                        SabqHaptics.light()
                        openArticle(item)
                    } else {
                        SabqHaptics.selection()
                        withAnimation(.snappy(duration: 0.24)) {
                            selectedIndex = idx
                        }
                    }
                } label: {
                    VStack(alignment: .leading, spacing: 4) {
                        HStack(spacing: 4) {
                            Text("\(idx + 1)")
                                .font(SabqType.timestamp.font.weight(.bold))
                                .monospacedDigit()
                            Text("·")
                                .font(SabqType.timestamp.font)
                            Text(item.isBreaking ? "عاجل" : item.categoryTitle)
                                .font(SabqType.timestamp.font.weight(.semibold))
                                .lineLimit(1)
                        }
                        .foregroundStyle(
                            item.isBreaking
                                ? SabqTheme.breaking
                                : (isActive ? SabqTheme.primary : SabqTheme.textTertiary)
                        )

                        Text(item.title)
                            .font(SabqType.tag.font)
                            .foregroundStyle(isActive ? SabqTheme.textPrimary : SabqTheme.textSecondary)
                            .lineLimit(2, reservesSpace: true)
                            .multilineTextAlignment(.leading)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .padding(.horizontal, 10)
                    .padding(.vertical, 8)
                    .frame(maxWidth: .infinity, alignment: .topLeading)
                    .background(
                        RoundedRectangle(cornerRadius: SabqRadius.small + 2, style: .continuous)
                            .fill(isActive ? SabqTheme.skyTint : SabqTheme.surfaceMuted.opacity(0.65))
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: SabqRadius.small + 2, style: .continuous)
                            .strokeBorder(isActive ? SabqTheme.primary.opacity(0.45) : SabqTheme.separator, lineWidth: isActive ? 1 : 0.75)
                    )
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("البارز \(idx + 1): \(item.title)")
                .accessibilityHint(isActive ? "اضغط لفتح الخبر" : "اضغط لعرض الخبر في المساحة الرئيسية")
                .accessibilityAddTraits(isActive ? [.isSelected] : [])
            }
        }
    }

    private func openArticle(_ article: Article) {
        if opensInReader {
            navigation.openInReader(article)
        } else {
            navigation.openFromReaderContext(article, in: navigation.selectedTab)
        }
    }
}

// MARK: - Unified Live Pulse Strip (شريط النبض الحي الموحّد)

/// يختزل البطاقات العمودية الثقيلة (الاقتصاد، الرياضة، مواعيدك، البطولات) في شريط
/// أفقي تفاعلي رشيق (ارتفاع ~52pt) حتى يصعد قسم «آخر الأخبار» فوراً فوق خط الطي.
struct LivePulseStripView: View {
    private let economyStore = EconomyStore.shared
    @State private var sportsHeadline: SportsHeadline.Headline?
    @State private var nearestMawaeed: MawaeedCard?

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: SabqLayout.space8) {
                economyPill
                mawaeedPill
                sportsPill
                tournamentPill(title: "دوري روشن", icon: "trophy.fill", route: RoshnRoute())
                tournamentPill(title: "كأس الملك", icon: "crown.fill", route: KingsCupRoute())
                tournamentPill(title: "كأس العالم", icon: "globe", route: WorldCupRoute())
            }
            .padding(.horizontal, SabqLayout.pageMargin)
            .padding(.vertical, 8)
        }
        .fixedSize(horizontal: false, vertical: true)
        .background(SabqTheme.surfaceMuted.opacity(0.65))
        .overlay(alignment: .top) {
            Rectangle().fill(SabqTheme.separator).frame(height: 0.75)
        }
        .overlay(alignment: .bottom) {
            Rectangle().fill(SabqTheme.separator).frame(height: 0.75)
        }
        .padding(.horizontal, -SabqLayout.pageMargin)
        .task {
            await economyStore.loadSnapshotIfNeeded(maxAge: 300)
        }
        .task {
            if let payload = try? await APIClient.shared.fetchMawaeed(region: MawaeedPrefs.region) {
                nearestMawaeed = MawaeedLogic.nearestCard(payload.series)
            }
        }
        .task {
            while !Task.isCancelled {
                async let today = try? APIClient.shared.fetchSportsToday()
                async let comps = try? APIClient.shared.fetchSportsCompetitions()
                let fixtures = await today?.today ?? []
                sportsHeadline = SportsHeadline.pick(fixtures, competitions: await comps ?? [])
                try? await Task.sleep(for: .seconds(fixtures.isEmpty ? 300 : 60))
            }
        }
    }

    @ViewBuilder
    private var economyPill: some View {
        ReaderLink(value: EconomyRoute()) {
            HStack(spacing: 8) {
                pulseIcon("chart.line.uptrend.xyaxis", tint: SabqTheme.success)

                if let weekly = economyStore.snapshot?.weekly {
                    VStack(alignment: .leading, spacing: 1) {
                        Text("إنفاق الأسبوع")
                            .font(SabqType.timestamp.font)
                            .foregroundStyle(SabqTheme.textTertiary)
                        HStack(spacing: 5) {
                            Text(EconomyFormat.fmtSar(weekly.totalValue))
                                .font(SabqType.tag.font)
                                .foregroundStyle(SabqTheme.textPrimary)
                                .monospacedDigit()
                            EconomyChangeChip(value: weekly.totalChangePct, hideEmpty: true)
                        }
                    }
                } else if let monthly = economyStore.snapshot?.monthly, let card = monthly.cards.first {
                    VStack(alignment: .leading, spacing: 1) {
                        Text(monthly.monthLabelAr)
                            .font(SabqType.timestamp.font)
                            .foregroundStyle(SabqTheme.textTertiary)
                        Text(card.figure)
                            .font(SabqType.tag.font)
                            .foregroundStyle(SabqTheme.textPrimary)
                            .monospacedDigit()
                    }
                } else {
                    VStack(alignment: .leading, spacing: 1) {
                        Text("الاقتصاد الحي")
                            .font(SabqType.timestamp.font)
                            .foregroundStyle(SabqTheme.textTertiary)
                        Text("إنفاق نقاط البيع")
                            .font(SabqType.tag.font)
                            .foregroundStyle(SabqTheme.textPrimary)
                    }
                }
            }
            .modifier(PulseCardSurface())
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("economy.home.teaser")
    }

    private var mawaeedPill: some View {
        ReaderLink(value: MawaeedRoute()) {
            TimelineView(.periodic(from: .now, by: 60)) { context in
                HStack(spacing: 8) {
                    pulseIcon(nearestMawaeed?.kind.symbol ?? "calendar.badge.clock", tint: SabqTheme.primary)

                    if let card = nearestMawaeed {
                        VStack(alignment: .leading, spacing: 1) {
                            Text(card.seriesTitle.isEmpty ? "مواعيدك" : card.seriesTitle)
                                .font(SabqType.timestamp.font)
                                .foregroundStyle(SabqTheme.textTertiary)
                                .lineLimit(1)
                            Text(MawaeedLogic.countdown(card, now: context.date))
                                .font(SabqType.tag.font)
                                .foregroundStyle(SabqTheme.primary)
                                .monospacedDigit()
                                .lineLimit(1)
                        }
                    } else {
                        VStack(alignment: .leading, spacing: 1) {
                            Text("مواعيدك")
                                .font(SabqType.timestamp.font)
                                .foregroundStyle(SabqTheme.textTertiary)
                            Text("الرواتب والإجازات")
                                .font(SabqType.tag.font)
                                .foregroundStyle(SabqTheme.textPrimary)
                        }
                    }
                }
                .modifier(PulseCardSurface())
            }
        }
        .buttonStyle(.plain)
    }

    private var sportsPill: some View {
        ReaderLink(value: SportsTodayRoute()) {
            HStack(spacing: 8) {
                if sportsHeadline?.live == true {
                    ZStack {
                        RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous)
                            .fill(SabqTheme.breaking.opacity(0.10))
                            .frame(width: 28, height: 28)
                        PulsingDot(color: SabqTheme.breaking)
                    }
                } else {
                    pulseIcon("sportscourt.fill", tint: SabqTheme.teal)
                }

                VStack(alignment: .leading, spacing: 1) {
                    Text(sportsHeadline?.live == true ? "مباشر الآن" : "مركز المباريات")
                        .font(SabqType.timestamp.font)
                        .foregroundStyle(sportsHeadline?.live == true ? SabqTheme.breaking : SabqTheme.textTertiary)

                    if let match = sportsHeadline?.match {
                        HStack(spacing: 4) {
                            Text(match.home.name)
                                .lineLimit(1)
                            if sportsHeadline?.live == true {
                                Text(verbatim: "\(match.goals?.away ?? 0) - \(match.goals?.home ?? 0)")
                                    .monospacedDigit()
                                    .foregroundStyle(SabqTheme.breaking)
                                    .environment(\.layoutDirection, .leftToRight)
                            } else {
                                Text("×")
                                    .foregroundStyle(SabqTheme.textTertiary)
                            }
                            Text(match.away.name)
                                .lineLimit(1)
                        }
                        .font(SabqType.tag.font)
                        .foregroundStyle(SabqTheme.textPrimary)
                    } else {
                        Text(sportsHeadline?.text ?? "مباريات اليوم")
                            .font(SabqType.tag.font)
                            .foregroundStyle(SabqTheme.textPrimary)
                            .lineLimit(1)
                    }
                }
            }
            .modifier(PulseCardSurface())
        }
        .buttonStyle(.plain)
    }

    private func tournamentPill<Route: Hashable>(title: String, icon: String, route: Route) -> some View {
        ReaderLink(value: route) {
            HStack(spacing: 6) {
                Image(systemName: icon)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(SabqTheme.primary)
                Text(title)
                    .font(SabqType.tag.font)
                    .foregroundStyle(SabqTheme.textPrimary)
                    .lineLimit(1)
            }
            .modifier(PulseCardSurface())
        }
        .buttonStyle(.plain)
    }

    private func pulseIcon(_ systemName: String, tint: Color) -> some View {
        Image(systemName: systemName)
            .font(.system(size: 12, weight: .semibold))
            .foregroundStyle(tint)
            .frame(width: 28, height: 28)
            .background(
                RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous)
                    .fill(tint.opacity(0.10))
            )
    }
}

private struct PulseCardSurface: ViewModifier {
    func body(content: Content) -> some View {
        content
            .padding(.horizontal, 11)
            .padding(.vertical, 7)
            .frame(minHeight: 42)
            .background(
                RoundedRectangle(cornerRadius: SabqRadius.small + 4, style: .continuous)
                    .fill(SabqTheme.surface)
            )
            .overlay(
                RoundedRectangle(cornerRadius: SabqRadius.small + 4, style: .continuous)
                    .strokeBorder(SabqTheme.separator, lineWidth: 0.75)
            )
            .contentShape(RoundedRectangle(cornerRadius: SabqRadius.small + 4, style: .continuous))
    }
}
