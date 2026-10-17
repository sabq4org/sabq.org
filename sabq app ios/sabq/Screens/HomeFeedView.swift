import SwiftUI

/// Reference wrapper for the live scroll offset. SwiftUI tracks the
/// reference identity; mutating `.value` doesn't invalidate the view
/// body. Lives outside the struct so a @State of this type holds a
/// stable instance for the screen's lifetime.
private final class ScrollOffsetRef {
    var value: CGFloat = 0
}

/// Drives the LoyaltyCelebrationBanner — pairs the active tier with
/// the reason it's showing so the banner can pick the right copy.
struct LoyaltyBannerState: Equatable {
    let tier: LoyaltyTier
    let mode: BannerMode

    enum BannerMode: Equatable {
        case tierUp(previousLevel: Int)
        case nudge
    }
}

struct HomeFeedView: View {
    private static let scrollTopID = "home-feed-top"
    /// مرساة قسم "آخر الأخبار" — شريط "أخبار جديدة" يقفز إليها كي يرى
    /// المستخدم الأخبار الطازجة فوراً بدل القفز لأعلى الصفحة (الهيدر).
    private static let latestSectionID = "home-feed-latest"
    /// Ignore scroll-to-top when the reader is already near the header.
    private static let scrollToTopThreshold: CGFloat = 120

    @Environment(ArticlesStore.self) private var articlesStore
    @Environment(BookmarksStore.self) private var bookmarksStore
    @Environment(AuthStore.self) private var authStore
    @Environment(\.scenePhase) private var scenePhase

    /// فترة استطلاع إشارة إبطال الكاش (بالثواني) — نفس إيقاع الويب.
    /// الجلب الثقيل للرئيسية يحدث فقط عند تغيّر `lastUpdate`.
    private let cacheInvalidationPollInterval: TimeInterval = 30
    /// Mirror of the dark-mode flag in `sabqApp` so the header toggle flips
    /// the scene-level `.preferredColorScheme`. The setting also lives in the
    /// in-app preferences screen; both write to the same UserDefaults key.
    @AppStorage("appAppearance") private var appearanceRaw: String = AppAppearance.system.rawValue
    @State private var isFirstLoad = true
    /// آخر طابع إبطال كاش رُصد — `0` يعني لم يُبذَر بعد (لا نُعيد الجلب عند أول قراءة).
    @State private var lastCacheInvalidation: Double = 0
    /// Rich personal-journey insights (member-session only). Drives the
    /// inline metric tiles + interest chips in personalJourneyBlock.
    @State private var richInsights: APITodayInsights?
    @State private var calendarToday: [APICalendarEvent] = []
    @State private var latestNewsletter: APIAudioNewsletter?
    /// «نشرة سَبْق» الصوتية المعتمدة (`/api/audio-bulletin/current`) — تظهر شريطًا
    /// مدمجًا أعلى الرئيسية فقط عند وجود نشرة منشورة.
    @State private var audioBulletin: APIAudioBulletin?
    @State private var audioPlayer = SabqAudioPlayer.shared
    /// Dashboard-managed breaking strip (شريط الأخبار العاجلة). `nil` until the
    /// background fetch resolves; an empty `headlines` array means no active
    /// topic, in which case we fall back to the single-article breaking card.
    @State private var breakingTicker: APIBreakingTicker?
    /// Reactive handle on the notifications singleton so the header bell's
    /// red unread dot refreshes when push notifications arrive or the
    /// user marks them read.
    @State private var notificationsStore = NotificationsStore.shared
    /// Non-reactive holder for the current scroll Y. Using @State for
    /// this value invalidated the entire VStack body on every pixel
    /// of scroll (the offset is fed by .onScrollGeometryChange, which
    /// fires continuously), which is what made the home feed feel
    /// "heavy" near the bottom — confirmed by Instruments. The value
    /// is only read inside the scroll-to-top guard below, so a class
    /// wrapper that SwiftUI tracks by reference (and therefore never
    /// re-renders on mutation) is the right shape.
    @State private var scrollOffsetRef = ScrollOffsetRef()
    /// تصغير الشعار عند التمرير (#1600) — يتغيّر عند عبور العتبة فقط، لا مع كل بكسل.
    @State private var isHeaderCompact = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    /// لقطة الاقتصاد الحي — تُحمَّل مع الرئيسية كي يظهر البلوك من أول رسم بعد الجلب.
    private let economyStore = EconomyStore.shared
    /// Drives the modal push to "حسابي / نقاطي" when the user taps the
    /// LoyaltyStripView inside the personal-journey block.
    @State private var showLoyaltyAccount = false
    /// Controls whether the "رحلتك المعرفية" card is expanded to show
    /// health, loyalty, reading metrics, and interests.
    @State private var isJourneyExpanded = false
    /// Cached loyalty summary so the journey-block metric row can show
    /// the user's lifetime points. The neighbouring LoyaltyStripView
    /// fetches the same payload on its own; both share Apple's HTTP
    /// cache so the second call is free on warm hits.
    @State private var loyaltySummary: LoyaltySummary?
    /// Active loyalty banner — set when the user just crossed into a
    /// new tier (one-shot) or when the periodic nudge is due. Cleared
    /// on dismiss.
    @State private var loyaltyBanner: LoyaltyBannerState?

    private static let loyaltyLastSeenLevelKey = "sabq_loyalty_last_seen_level"
    private static let loyaltyLastNudgeDateKey = "sabq_loyalty_last_nudge_at"
    private static let nudgeIntervalDays: Int = 5

    private var isContentReady: Bool {
        !articlesStore.allArticles.isEmpty || !articlesStore.featuredArticles.isEmpty
    }

    // Subscribe to the Lite manager so the home screen reactively
    // swaps between the full feed and HomeLiteView. Injected from
    // ContentView. See issue #81 for the full design.
    @Environment(LiteModeManager.self) private var liteManager

    var body: some View {
        // Reactive switch — flipping the manager (manual toggle or
        // auto-trigger) re-renders the home screen without an app
        // restart. The full feed below is unchanged. Banner overlay
        // floats above whichever tree renders.
        ZStack(alignment: .top) {
            if liteManager.isLiteActive {
                HomeLiteView()
            } else {
                fullBody
            }
            LiteBannerView()
        }
        // لا تستخدم .clipped() هنا: يقصّ منطقة الـ rubber-band في أعلى
        // ScrollView فيتعطّل سحب التحديث (.refreshable) بالكامل على iOS.
        // منع السحب الأفقي يتم بتقييد عرض الأبناء داخل القائمة نفسها.
        .frame(maxWidth: .infinity)
        .task { await economyStore.loadSnapshotIfNeeded(maxAge: 300) }
    }

    private var fullBody: some View {
        GeometryReader { container in
        ScrollViewReader { scrollProxy in
            ScrollView(showsIndicators: false) {
                if isContentReady {
                    // Newspaper-first home: عاجل → هيرو → رياضة → رحلة → آخر الأخبار.
                    // Secondary blocks (ستوريز، تقويم، نشرة، ترند…) live in
                    // a collapsed «المزيد اليوم» disclosure.
                    CollapsingVStack(spacing: SabqLayout.space16) {
                        Color.clear
                            .frame(height: 0)
                            .id(Self.scrollTopID)

                        headerSection

                    // لمسة السدو الموسمية: شريط رفيع تحت الرأس وحده. لا يقع
                    // خلف نصوص الأخبار، ولا يتكرّر في البطاقات. يختفي تمامًا
                    // عند إطفاء المفتاح.
                    NationalDayHeaderAccent()

                    // Tier-up celebration or periodic engagement nudge.
                    if let banner = loyaltyBanner {
                        LoyaltyCelebrationBanner(
                            tier: banner.tier,
                            mode: bannerMode(from: banner.mode),
                            onTap: {
                                showLoyaltyAccount = true
                                dismissLoyaltyBanner()
                            },
                            onDismiss: { dismissLoyaltyBanner() }
                        )
                    }

                    // «نشرة سَبْق» الصوتية — شريط مدمج أعلى الرئيسية يظهر فقط عند توفر نشرة.
                    if let bulletin = audioBulletin, !bulletin.audioUrl.isEmpty {
                        audioBulletinTopBar(bulletin)
                    } else if let newsletter = latestNewsletter, newsletter.audioUrl != nil {
                        compactLegacyNewsletterTopBar(newsletter)
                    }

                    // عاجل — يظهر في الأعلى وفوق الخبر الرئيسي مباشرة.
                    if let ticker = breakingTicker, !ticker.headlines.isEmpty {
                        BreakingTickerBar(headlines: ticker.headlines)

                    } else if !articlesStore.breakingNews.isEmpty {
                        breakingNewsSection

                    }

                    featuredSection

                    // مدخل الرياضة تحت الهيرو كما في الويب (SportsPortalStrip): أهم مباراة الآن أو اليوم.
                    SportsPortalStrip()
                        .padding(.horizontal, -SabqLayout.pageMargin)

                    SabqSectionBand()

                    // الاقتصاد الحي: «أين أنفق السعوديون…» أو «السعوديون في شهر بالأرقام»
                    // عند نشرة جديدة — يختفي ذاتيًا بلا بيانات (نقل الويب #1493–#1506).
                    // الشرط هنا لا داخل البلوك: Group بمحتوى EmptyView لا يشغّل .task
                    // ولا يجب أن يحجز فراغ VStack عندما لا بيانات.
                    if EconomyFormat.homeMode(economyStore.snapshot) != .hidden {
                        EconomyHomeBlock()
                    }

                    // بطاقات البطولات تأتي بعد بطاقة الاقتصاد، وتختفي ذاتيًا بلا بيانات.
                    WorldCupHomeStrip()

                    AsianCupHomeStrip()

                    KingsCupHomeStrip()

                    RoshnHomeStrip()

                    // رحلة معرفية: ولاء + مقاييس قراءة + HealthKit (خطوات/نوم)
                    if authStore.isLoggedIn {
                        personalJourneyBlock
                    }

                    SabqSectionBand()

                    latestArticlesSection
                        .id(Self.latestSectionID)

                    opinionsPreviewSection

                    MuqtarabHomeStrip()

                    // «الأكثر تداولًا» ظاهر مباشرة بدل طيّه خلف «المزيد اليوم»،
                    // وبعده البلوكات الاختيارية حين تتوفر لها بيانات فقط.
                    trendingPreviewSection


                    if !articlesStore.stories.isEmpty {
                        storiesSection
                    }

                    HajjBlockView()

                    if !calendarToday.isEmpty {
                        calendarTodayCard
                    }
                }
                .frame(width: max(0, container.size.width - 32), alignment: .leading)
                .padding(.horizontal, 16)
                // 18 + مسافة العمود (20) التي كان VStack يحجزها بعد مرساة التمرير
                // الصفرية؛ CollapsingVStack لا يحجزها فنعوّضها هنا لبقاء الرأس مكانه.
                .padding(.top, SabqLayout.space16)
                .padding(.bottom, 40)
                .frame(maxWidth: .infinity, alignment: .leading)
                } else {
                    VStack(spacing: 0) {
                        Color.clear
                            .frame(height: 0)
                            .id(Self.scrollTopID)

                        // فشل التحميل الكامل (أوفلاين/عطل خادم): حالة خطأ
                        // بزر إعادة محاولة بدل skeleton يومض للأبد بصمت.
                        if articlesStore.errorMessage != nil {
                            EmptyStateView(
                                icon: "wifi.exclamationmark",
                                tint: SabqTheme.coral,
                                title: "تعذر تحميل الأخبار",
                                subtitle: articlesStore.errorMessage ?? "تحقق من اتصالك بالإنترنت ثم أعد المحاولة",
                                action: { Task { await articlesStore.loadArticles(ignoreCache: true) } },
                                actionTitle: "إعادة المحاولة"
                            )
                            .padding(.top, 80)
                        } else {
                            HomeFeedSkeleton()
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.top, 18)
                    .padding(.bottom, 40)
                }
            }
            .sabqScrollOffsetTracker { y in
                scrollOffsetRef.value = y
                let compact = HomeHeaderCompact.next(current: isHeaderCompact, y: y)
                if compact != isHeaderCompact {
                    withAnimation(reduceMotion ? nil : .easeOut(duration: 0.18)) { isHeaderCompact = compact }
                }
            }
            .sabqAutoHideTabBar()
            .refreshable {
                SabqHaptics.medium()
                await articlesStore.loadArticles(ignoreCache: true)
                // أعد جلب شريط العاجل أيضاً حتى ينعكس أي تفعيل/تعطيل من لوحة
                // التحكم فور السحب للتحديث.
                breakingTicker = (try? await APIClient.shared.fetchBreakingTicker(ignoreCache: true)) ?? nil
                audioBulletin = (try? await APIClient.shared.fetchCurrentAudioBulletin(ignoreCache: true)) ?? nil
            }
            // شريط "⬆️ X أخبار جديدة" عائم أسفل الشاشة فوق شريط التبويبات —
            // في الأعلى كان يغطي زر البحث في رأس الرئيسية. يسمح باللمس فقط
            // عندما يظهر الشريط.
            .overlay(alignment: .bottom) {
                newArticlesBanner(proxy: scrollProxy)
                    .allowsHitTesting(articlesStore.newArticlesCount > 0)
            }
            // استطلاع خفيف لإشارة إبطال الكاش (نفس نمط الويب):
            // GET /api/cache-invalidation/check كل 30ث — وجلب الرئيسية فقط
            // عند تغيّر lastUpdate بعد نشر في الصحيفة. الهيرو يتحدّث فوراً
            // عبر checkForNewArticles دون إجبار المستخدم على السحب المتكرر.
            // شبكة أمان: حتى لو لم تتحرك الإشارة، نفحص الهيرو كل 60ث.
            .task(id: scenePhase) {
                guard scenePhase == .active else { return }
                // تأخير أولي عند أول ظهور يترك شبكة الإقلاع تخلّص؛ عند
                // العودة من الخلفية نفحص فوراً إن كان lastUpdate مُبذّراً.
                if lastCacheInvalidation == 0 {
                    try? await Task.sleep(for: .seconds(3))
                    if Task.isCancelled { return }
                }
                var lastForcedHeroCheck = Date.distantPast
                _ = await pollCacheInvalidationAndRefreshIfNeeded()
                while !Task.isCancelled {
                    try? await Task.sleep(for: .seconds(cacheInvalidationPollInterval))
                    if Task.isCancelled { break }
                    let didRefresh = await pollCacheInvalidationAndRefreshIfNeeded()
                    if didRefresh {
                        lastForcedHeroCheck = Date()
                    } else if Date().timeIntervalSince(lastForcedHeroCheck) >= 60 {
                        await articlesStore.checkForNewArticles()
                        if let ticker = try? await APIClient.shared.fetchBreakingTicker(ignoreCache: true) {
                            breakingTicker = ticker
                        } else {
                            breakingTicker = nil
                        }
                        audioBulletin = (try? await APIClient.shared.fetchCurrentAudioBulletin(ignoreCache: true)) ?? nil
                        lastForcedHeroCheck = Date()
                    }
                }
            }
            .onReceive(NotificationCenter.default.publisher(for: .sabqHomeScrollToTop)) { _ in
                guard scrollOffsetRef.value > Self.scrollToTopThreshold else { return }
                withAnimation(.easeOut(duration: 0.28)) {
                    scrollProxy.scrollTo(Self.scrollTopID, anchor: .top)
                }
            }
        }
        .background(SabqTheme.background)
        .sabqRTL()
        .sabqScreen("Home")
        // Notifications sheet removed from this screen — the header now
        // surfaces the live-coverage entry point instead. The notifications
        // page is still reachable from the Settings tab.
        .onChange(of: isContentReady) { _, ready in
            if ready && isFirstLoad {
                isFirstLoad = false
            }
        }
        .task {
            // Phase-4 + Phase-5 background fetches. All best-effort: silent
            // on failure so the home screen still renders.
            async let upcoming: [APICalendarEvent]? = try? await APIClient.shared.fetchUpcomingCalendarEvents(days: 14)
            async let newsletters: [APIAudioNewsletter]? = try? await APIClient.shared.fetchAudioNewsletters()
            async let bulletin = (try? await APIClient.shared.fetchCurrentAudioBulletin()) ?? nil
            async let breaking = (try? await APIClient.shared.fetchBreakingTicker()) ?? nil
            // Rich personal-journey insights (member-session only). Returns
            // nil for logged-out users so the block stays hidden cleanly.
            async let richJourney: APITodayInsights? = authStore.isLoggedIn
                ? (try? await APIClient.shared.fetchTodayInsightsRich())
                : nil

            calendarToday = (await upcoming) ?? []
            latestNewsletter = (await newsletters)?.first
            audioBulletin = await bulletin
            breakingTicker = await breaking
            richInsights = await richJourney

            // Fetch unread editorial-notification count so the header bell's
            // red dot reflects reality on first home-screen render after
            // launch (and on every pull-to-refresh).
            if authStore.isLoggedIn {
                await notificationsStore.refreshUnreadCount()
                // Loyalty summary for the journey-metric "نقاط الولاء"
                // cell. Best-effort: nil → cell shows 0.
                loyaltySummary = try? await APIClient.shared.fetchLoyaltySummary()
                if let summary = loyaltySummary {
                    evaluateLoyaltyBanner(for: summary)
                }
            }
        }
        .sheet(isPresented: $showLoyaltyAccount) {
            NavigationStack {
                LoyaltyAccountView()
                    .environment(authStore)
                    .toolbar {
                        ToolbarItem(placement: .topBarTrailing) {
                            Button("إغلاق") { showLoyaltyAccount = false }
                        }
                    }
            }
        }
        }
    }

    // MARK: - Cache Invalidation Poll

    /// يستطلع إشارة النشر الخفيفة؛ يجلب الهيرو/الأخبار فقط عند تغيّر الطابع.
    /// - Returns: `true` إذا أُعيد جلب المحتوى بسبب تغيّر الإشارة.
    @discardableResult
    private func pollCacheInvalidationAndRefreshIfNeeded() async -> Bool {
        guard let check = try? await APIClient.shared.fetchCacheInvalidationCheck() else { return false }
        let stamp = check.lastUpdate
        guard stamp > 0 else { return false }

        let previous = lastCacheInvalidation
        lastCacheInvalidation = stamp

        // أول قراءة: بذر الطابع فقط — الرئيسية محمّلة أصلاً عند الإقلاع.
        guard previous > 0, stamp > previous else { return false }

        await articlesStore.checkForNewArticles()
        // شريط العاجل من لوحة التحكم — تجاوز الكاش حتى يظهر فور التفعيل/التعديل.
        if let ticker = try? await APIClient.shared.fetchBreakingTicker(ignoreCache: true) {
            breakingTicker = ticker
        } else {
            breakingTicker = nil
        }
        audioBulletin = (try? await APIClient.shared.fetchCurrentAudioBulletin(ignoreCache: true)) ?? nil
        return true
    }

    // MARK: - New Articles Banner ("⬆️ X أخبار جديدة")

    @ViewBuilder
    private func newArticlesBanner(proxy: ScrollViewProxy) -> some View {
        if articlesStore.newArticlesCount > 0 {
            Button {
                SabqHaptics.medium()
                withAnimation(.spring(response: 0.4, dampingFraction: 0.8)) {
                    articlesStore.applyPendingArticles()
                    // ننزل لقسم "آخر الأخبار" حيث أُدرجت الأخبار الطازجة في
                    // الأعلى — لا للهيدر. هكذا يرى المستخدم الجديد مباشرة.
                    proxy.scrollTo(Self.latestSectionID, anchor: .top)
                }
            } label: {
                HStack(spacing: 8) {
                    Image(systemName: "arrow.up")
                        .font(SabqFonts.app(size: 12, weight: .medium))
                    Text(newArticlesBannerText)
                        .font(SabqFonts.app(size: 14, weight: .bold))
                }
                .foregroundStyle(.white)
                .padding(.horizontal, 16)
                .padding(.vertical, 10)
                .background(
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .fill(SabqTheme.actionFill)
                )
            }
            .buttonStyle(.plain)
            .padding(.bottom, 14)
            .contentShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            .transition(.move(edge: .bottom).combined(with: .opacity))
        }
    }

    private var newArticlesBannerText: String {
        let count = articlesStore.newArticlesCount
        switch count {
        case 1:  return "خبر جديد"
        case 2:  return "خبران جديدان"
        case 3...10: return "\(count) أخبار جديدة"
        default: return "\(count) خبرًا جديدًا"
        }
    }

    // MARK: - Loyalty banner

    /// Sets `loyaltyBanner` if the user just crossed a tier (one-shot
    /// per level) or if enough time has elapsed since the last nudge.
    /// Called once after the loyalty summary lands.
    private func evaluateLoyaltyBanner(for summary: LoyaltySummary) {
        let defaults = UserDefaults.standard
        let currentLevel = summary.points?.rankLevel ?? summary.resolvedTier.level
        let lastSeenLevel = defaults.integer(forKey: Self.loyaltyLastSeenLevelKey)

        // 1) Tier-up takes priority: if currentLevel > lastSeenLevel,
        //    show the celebration. lastSeenLevel = 0 the first run,
        //    so a brand-new user crossing into L2 sees the banner.
        if currentLevel > lastSeenLevel && currentLevel > 1 {
            let tier = LoyaltyTiers.tier(forLevel: currentLevel)
            withAnimation(.spring(response: 0.55, dampingFraction: 0.85)) {
                loyaltyBanner = LoyaltyBannerState(
                    tier: tier,
                    mode: .tierUp(previousLevel: lastSeenLevel)
                )
            }
            return
        }

        // 2) Periodic nudge: if at least `nudgeIntervalDays` have
        //    passed since the last one (or no nudge has ever shown).
        let lastNudge = defaults.object(forKey: Self.loyaltyLastNudgeDateKey) as? Date
        let nudgeWindow = TimeInterval(Self.nudgeIntervalDays * 24 * 60 * 60)
        let shouldNudge: Bool = {
            guard let lastNudge else { return true }
            return Date().timeIntervalSince(lastNudge) > nudgeWindow
        }()
        if shouldNudge {
            let tier = LoyaltyTiers.tier(forLevel: max(1, currentLevel))
            withAnimation(.spring(response: 0.55, dampingFraction: 0.85)) {
                loyaltyBanner = LoyaltyBannerState(tier: tier, mode: .nudge)
            }
        }
    }

    private func bannerMode(from state: LoyaltyBannerState.BannerMode) -> LoyaltyCelebrationBanner.Mode {
        switch state {
        case .tierUp(let prev): return .tierUp(previousLevel: prev)
        case .nudge:            return .nudge
        }
    }

    /// Records the dismissal so the same banner doesn't reappear next
    /// time. Tier-up dismissals advance lastSeenLevel to the current
    /// tier; nudge dismissals stamp the current date.
    private func dismissLoyaltyBanner() {
        guard let banner = loyaltyBanner else { return }
        let defaults = UserDefaults.standard
        switch banner.mode {
        case .tierUp:
            defaults.set(banner.tier.level, forKey: Self.loyaltyLastSeenLevelKey)
            // Also stamp the nudge date — we don't want a tier-up
            // followed by a nudge on the next open.
            defaults.set(Date(), forKey: Self.loyaltyLastNudgeDateKey)
        case .nudge:
            defaults.set(Date(), forKey: Self.loyaltyLastNudgeDateKey)
        }
        withAnimation(.easeInOut(duration: 0.25)) {
            loyaltyBanner = nil
        }
    }

    // MARK: - Header

    private var headerSection: some View {
        HStack(alignment: .center, spacing: SabqLayout.space12) {
            SabqBrandLogo(height: 40)

            Spacer(minLength: 0)

            HStack(spacing: SabqLayout.space4) {
                // Appearance cycle — taps walk system → light → dark →
                // system. The full 3-state picker lives in Settings; this
                // button is the quick-access affordance and shows the
                // current mode's icon.
                Button {
                    SabqHaptics.light()
                    withAnimation(.spring(response: 0.4, dampingFraction: 0.86)) {
                        let current = AppAppearance(rawValue: appearanceRaw) ?? .system
                        appearanceRaw = current.next.rawValue
                    }
                } label: {
                    let mode = AppAppearance(rawValue: appearanceRaw) ?? .system
                    headerIcon(mode.iconName)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("تبديل المظهر — الحالي: \((AppAppearance(rawValue: appearanceRaw) ?? .system).arabicLabel)")

                // «مواعيدك» — رابط رئيسي في رأس الويب: الرواتب والدعم والإجازات.
                NavigationLink(value: MawaeedRoute()) {
                    headerIcon("calendar")
                }
                .buttonStyle(.plain)
                .accessibilityLabel("مواعيدك — الرواتب والدعم والإجازات")

                // "لحظة بلحظة" entry point. The red pulsing dot was removed
                // to avoid confusing it with the editorial-notifications
                // unread indicator on the bell next to it — same colour
                // would have meant two different things side by side.
                NavigationLink(value: MomentByMomentRoute()) {
                    headerIcon("dot.radiowaves.left.and.right")
                }
                .buttonStyle(.plain)
                .accessibilityLabel("لحظة بلحظة — التغطية المباشرة")

                // جرس الإشعارات — صندوق القارئ (/v1/inbox)، وفي أعلاه للكتّاب
                // صفّ «إشعاراتي التحريرية». النقطة الحمراء = غير المقروء في الاثنين.
                if authStore.isLoggedIn {
                    NavigationLink(value: ReaderInboxRoute()) {
                        headerIcon("bell")
                            .overlay(alignment: .topTrailing) {
                                // Red unread dot — driven by NotificationsStore's
                                // `unreadCount` which the EditorialNotificationsView
                                // updates on every fetch.
                                if notificationsStore.totalUnread > 0 {
                                    Circle()
                                        .fill(SabqTheme.breaking)
                                        .frame(width: 10, height: 10)
                                        .overlay(
                                            Circle()
                                                .stroke(SabqTheme.background, lineWidth: 2)
                                        )
                                        .padding(10)
                                }
                            }
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(notificationsStore.totalUnread > 0
                        ? "الإشعارات — لديك إشعارات غير مقروءة"
                        : "الإشعارات")
                }

                NavigationLink(value: SearchRoute()) {
                    headerIcon("magnifyingglass")
                }
                .buttonStyle(.plain)
                .accessibilityLabel("البحث")
            }
        }
    }

    private func headerIcon(_ systemName: String) -> some View {
        Image(systemName: systemName)
            .font(.system(size: 19, weight: .regular))
            .foregroundStyle(SabqTheme.textPrimary)
            .frame(width: SabqLayout.touchTarget, height: SabqLayout.touchTarget)
            .contentShape(Rectangle())
    }

    // MARK: - Breaking News

    /// خبر العاجل المعروض في بطاقته (حين لا يعمل شريط اللوحة). يُستبعد من
    /// «آخر الأخبار» فقط؛ الهيرو يعرضه أيضًا.
    private var displayedBreakingArticle: Article? {
        if let ticker = breakingTicker, !ticker.headlines.isEmpty { return nil }
        return articlesStore.breakingNews.first
    }

    @ViewBuilder
    private var breakingNewsSection: some View {
        if let article = articlesStore.breakingNews.first {
            NavigationLink(value: article) {
                HStack(alignment: .top, spacing: 12) {
                    VStack(spacing: 2) {
                        HStack(spacing: 4) {
                            PulsingDot(color: SabqTheme.breaking)
                            Text("عاجل")
                                .font(SabqType.metaEmphasis.font)
                                .foregroundStyle(SabqTheme.breaking)
                        }
                        Text("\(SabqFormatters.riyadhHourMinute.string(from: article.publishDate)) \(SabqFormatters.riyadhPeriod.string(from: article.publishDate))")
                            .font(SabqType.tag.font)
                            .foregroundStyle(SabqTheme.textTertiary)
                            .monospacedDigit()
                    }
                    .fixedSize()

                    SabqRTLText(
                        article.title,
                        uiFont: SabqType.rowTitle.uiFont,
                        color: SabqTheme.textPrimary,
                        lineLimit: dynamicTypeSize.isAccessibilitySize ? 0 : 3,
                        lineSpacing: SabqType.rowTitle.lineSpacing,
                        textStyle: SabqType.rowTitle.uiTextStyle
                    )
                }
                .padding(.horizontal, SabqLayout.space16)
                .padding(.vertical, SabqLayout.space12)
                .background(
                    RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous)
                        .fill(SabqTheme.breaking.opacity(0.07))
                )
            }
            .buttonStyle(.plain)
        }
    }

    // MARK: - Stories

    private var storiesSection: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 14) {
                ForEach(articlesStore.stories) { story in
                    StoryBubble(story: story)
                }
            }
            .padding(.vertical, 6)
        }
    }

    // MARK: - Featured

    /// خبر العاجل يبقى في الهيرو أيضًا مع شريطه (قرار المالك 2026-10-13)؛
    /// يُستبعد من «آخر الأخبار» فقط.
    private var heroArticles: [Article] {
        Array(articlesStore.featuredArticles.prefix(3))
    }

    /// الخبر الرئيسي بصورته وعنوانه الكبير، ثم بقية المميّزة صفوفًا تحته.
    private var featuredSection: some View {
        let featured = heroArticles
        return VStack(alignment: .leading, spacing: 0) {
            if let lead = featured.first {
                NavigationLink(value: lead) {
                    FeaturedArticleCard(
                        article: lead,
                        onBookmark: { bookmarksStore.toggle(lead.id, article: lead) },
                        isBookmarked: bookmarksStore.isBookmarked(lead.id)
                    )
                }
                .buttonStyle(.plain)
                .padding(.bottom, SabqLayout.space8)
            }
            ForEach(Array(featured.dropFirst().enumerated()), id: \.element.id) { index, article in
                if index > 0 || featured.first != nil { SidebarRowDivider() }
                NavigationLink(value: article) {
                    CompactArticleRow(
                        article: article,
                        onBookmark: { bookmarksStore.toggle(article.id, article: article) },
                        isBookmarked: bookmarksStore.isBookmarked(article.id)
                    )
                }
                .buttonStyle(.plain)
                .contextMenu {
                    Button {
                        bookmarksStore.toggle(article.id, article: article)
                    } label: {
                        Label(
                            bookmarksStore.isBookmarked(article.id) ? "إزالة من المحفوظات" : "حفظ المقال",
                            systemImage: bookmarksStore.isBookmarked(article.id) ? "bookmark.slash" : "bookmark"
                        )
                    }
                }
            }
        }
    }

    // MARK: - Category Chips

    private var categoryChipsSection: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 10) {
                CategoryChip(
                    title: "الكل",
                    isSelected: articlesStore.selectedCategory == nil
                ) {
                    withAnimation(.spring(response: 0.3)) {
                        articlesStore.selectedCategory = nil
                    }
                }

                ForEach(ArticleCategory.allCases) { category in
                    CategoryChip(
                        title: category.title,
                        isSelected: articlesStore.selectedCategory == category
                    ) {
                        withAnimation(.spring(response: 0.3)) {
                            articlesStore.selectedCategory = category
                        }
                    }
                }
            }
            .padding(.vertical, 2)
        }
    }

    // MARK: - Trending Preview

    @ViewBuilder
    private var trendingPreviewSection: some View {
        if !articlesStore.trendingArticles.isEmpty {
            HomeSectionCard(title: "الأكثر تداولًا", context: "آخر 48 ساعة") {
                NavigationLink(value: TrendingRoute()) {
                    HomeSectionLinkLabel()
                }
                .buttonStyle(.plain)
            } content: {
                ForEach(Array(articlesStore.trendingArticles.prefix(3).enumerated()), id: \.element.id) { index, article in
                    if index > 0 {
                        SidebarRowDivider()
                    }

                    NavigationLink(value: article) {
                        HStack(alignment: .top, spacing: 12) {
                            Text("\(index + 1)")
                                .font(SabqType.metaEmphasis.font)
                                .foregroundStyle(SabqTheme.primary)
                                .monospacedDigit()
                                .frame(width: 28, height: 28)
                                .background(
                                    RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous)
                                        .fill(SabqTheme.skyTint)
                                )
                                .overlay(
                                    RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous)
                                        .strokeBorder(SabqTheme.skyOutline, lineWidth: 0.75)
                                )

                            SabqRTLText(
                                article.title,
                                uiFont: SabqType.rowTitle.uiFont,
                                color: SabqTheme.textPrimary,
                                lineLimit: dynamicTypeSize.isAccessibilitySize ? 0 : 3,
                                lineSpacing: SabqType.rowTitle.lineSpacing,
                                textStyle: SabqType.rowTitle.uiTextStyle
                            )
                        }
                        .padding(.vertical, 13)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    // MARK: - Opinions Preview

    // «آراء تستحق القراءة» — قائمة يقودها الكاتب على بطاقة سماوية بهوية سبق:
    // خمسة صفوف متساوية بلا مقال بارز، في كل صف صورة الكاتب واسمه الكامل
    // والعنوان (قرار المالك 2026-10-09، بدل شبكة العمودين التي كانت تقصّ الأسماء).
    @ViewBuilder
    private var opinionsPreviewSection: some View {
        let opinions = Array(articlesStore.opinions.prefix(5))
        if !opinions.isEmpty {
            SabqSectionBand()
            HomeSectionCard(title: "آراء تستحق القراءة") {
                NavigationLink(value: OpinionsRoute()) {
                    HomeSectionLinkLabel()
                }
                .buttonStyle(.plain)
            } content: {
                VStack(alignment: .leading, spacing: 0) {
                    ForEach(Array(opinions.enumerated()), id: \.element.id) { index, opinion in
                        if index > 0 {
                            OpinionRowDivider()
                        }
                        NavigationLink(value: opinion) {
                            OpinionWriterRow(opinion: opinion)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, SabqLayout.space16)
                .padding(.vertical, SabqLayout.space4)
                .sabqSkyCardSurface()
                .padding(.top, SabqLayout.space8)
            }
        }
    }

    // MARK: - Latest Articles

    /// «آخر الأخبار» بلا خبر العاجل المعروض فوقها، وبلا مقالات الهيرو/الرأي: بعض
    /// مصادر القائمة لا ترسل نوع المقال فيتسرّب الرأي إليها، فنستبعده بمعرّفه.
    private var latestTimelineArticles: [Article] {
        let skip = displayedBreakingArticle?.id
        let opinionIDs = Set(articlesStore.opinions.map(\.id))
        let heroIDs = articlesStore.selectedCategory == nil ? Set(heroArticles.map(\.id)) : []
        return articlesStore.filteredArticles.filter {
            $0.id != skip && !opinionIDs.contains($0.id) && !heroIDs.contains($0.id)
        }
    }

    private var latestArticlesSection: some View {
        let articles = latestTimelineArticles
        return HomeSectionCard(
            title: articlesStore.selectedCategory?.title ?? "آخر الأخبار",
            lazy: true
        ) {
            EmptyView()
        } content: {
            ForEach(Array(articles.enumerated()), id: \.element.id) { index, article in
                if index > 0 {
                    SidebarRowDivider()
                }

                NavigationLink(value: article) {
                    CompactArticleRow(
                        article: article,
                        onBookmark: { bookmarksStore.toggle(article.id, article: article) },
                        isBookmarked: bookmarksStore.isBookmarked(article.id),
                        isNew: articlesStore.isRecentlyAdded(article.id),
                        showsCategory: articlesStore.selectedCategory == nil
                    )
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("home.article.\(article.id)")
                .contextMenu {
                    Button {
                        bookmarksStore.toggle(article.id, article: article)
                    } label: {
                        Label(
                            bookmarksStore.isBookmarked(article.id) ? "إزالة من المحفوظات" : "حفظ المقال",
                            systemImage: bookmarksStore.isBookmarked(article.id) ? "bookmark.slash" : "bookmark"
                        )
                    }
                }
                .onAppear {
                    // Prefetch images for the next 5 articles
                    let upcoming = articles.dropFirst(index + 1).prefix(5)
                    let urls = upcoming.compactMap { $0.imageURL.flatMap(URL.init(string:)) }
                    if !urls.isEmpty { ImageCache.prefetch(urls: urls, maxPixelSize: LatestTimelineStyle.thumbnailPixels) }
                }
            }

            if articlesStore.hasMore && articlesStore.selectedCategory == nil {
                SidebarRowDivider()

                VStack(spacing: 6) {
                    // فشل شبكي أثناء "تحميل المزيد": رسالة صريحة بدل
                    // إخفاء الزر بصمت كأن القائمة انتهت (تدقيق err-1).
                    if articlesStore.loadMoreFailed {
                        Text("تعذر تحميل المزيد. تحقق من اتصالك")
                            .font(SabqType.meta.font)
                            .foregroundStyle(SabqTheme.danger)
                            .padding(.top, 4)
                    }
                    Button {
                        Task { await articlesStore.loadMore() }
                    } label: {
                        HStack(spacing: 8) {
                            if articlesStore.isLoading {
                                ProgressView()
                                    .tint(SabqTheme.primary)
                            }
                            Text(articlesStore.loadMoreFailed ? "إعادة المحاولة" : "تحميل المزيد")
                                .font(SabqType.button.font)
                                .foregroundStyle(articlesStore.loadMoreFailed ? SabqTheme.danger : SabqTheme.primary)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                        .background(
                            RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous)
                                .fill(SabqTheme.surfaceMuted)
                        )
                    }
                    .buttonStyle(.plain)
                    .disabled(articlesStore.isLoading)
                }
                .padding(.top, 10)
                .padding(.bottom, 8)
            }
        }
    }

    // MARK: - Personal Journey Block (auth-gated)

    /// Compact inline "knowledge journey" panel for signed-in users —
    /// mirrors the web's SmartSummaryBlock. Renders the four metric tiles
    /// (reading time / completion / likes / comments) + interest chips
    /// directly on the home feed, no navigation. Uses the backend greeting
    /// when available so the user sees their actual name, falls back to a
    /// device-local time greeting otherwise.
    private var personalJourneyBlock: some View {
        VStack(alignment: .leading, spacing: 12) {
            journeyHeader
            if isJourneyExpanded {
                KnowledgeJourneyHealthCard()
                    .transition(.opacity.combined(with: .move(edge: .top)))
                LoyaltyStripView(onTap: { showLoyaltyAccount = true })
                    .transition(.opacity.combined(with: .move(edge: .top)))
                journeyMetrics
                    .transition(.opacity.combined(with: .move(edge: .top)))
                journeyInterests
                    .transition(.opacity.combined(with: .move(edge: .top)))
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .sabqBlockSurface()
    }

    private func toggleJourney() {
        SabqHaptics.light()
        withAnimation(reduceMotion ? nil : .snappy(duration: 0.28)) {
            isJourneyExpanded.toggle()
        }
    }

    // MARK: Journey sub-views

    private var journeyHeader: some View {
        Button(action: toggleJourney) {
            HStack(spacing: 12) {
                ZStack {
                    Circle()
                        .fill(SabqTheme.surface)
                        .frame(width: 40, height: 40)
                    Image(systemName: "sparkles")
                        .font(SabqType.label)
                        .foregroundStyle(SabqTheme.primary)
                }

                VStack(alignment: .leading, spacing: 2) {
                    Text(journeyGreeting)
                        .font(SabqType.label)
                        .foregroundStyle(SabqTheme.textPrimary)
                        .lineLimit(1)
                        .minimumScaleFactor(0.85)
                    Text("رحلتك المعرفية باختصار")
                        .font(SabqType.meta.font)
                        .foregroundStyle(SabqTheme.textSecondary)
                        .lineLimit(1)
                        .minimumScaleFactor(0.9)
                }

                Spacer(minLength: 0)

                Image(systemName: "chevron.down")
                    .font(SabqType.metaEmphasis.font)
                    .foregroundStyle(SabqTheme.primary)
                    .rotationEffect(.degrees(isJourneyExpanded ? 180 : 0))
                    .frame(width: SabqLayout.touchTarget, height: SabqLayout.touchTarget)
                    .contentShape(Rectangle())
                    .padding(.vertical, -8)
                    .padding(.trailing, -8)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(isJourneyExpanded ? "إخفاء رحلتك المعرفية" : "عرض البطاقة كاملة")
    }

    /// Backend greeting wins (includes the user's name); falls back to a
    /// device-local time greeting + firstName when offline.
    private var journeyGreeting: String {
        // Greeting word is ALWAYS computed from the device's local clock
        // — never from the backend. The Railway server runs in UTC, so
        // `new Date().getHours()` there returned 11 at 2 PM Riyadh and
        // sent back "صباح الخير" for the entire afternoon. The user's
        // own device knows their actual hour-of-day, so we trust it.
        // We still prefer the backend's *name* if it embeds one in the
        // greeting string (e.g. "صباح الخير يا علي" → pluck "علي").
        let hour = Calendar.current.component(.hour, from: Date())
        let word: String
        switch hour {
        case 5..<12:  word = "صباح الخير"
        case 12..<17: word = "نهارك سعيد"
        case 17..<21: word = "مساء الخير"
        default:      word = "ليلة سعيدة"
        }

        // Try to pluck the name from a backend greeting like
        // "صباح الخير يا علي" so we don't lose personalization. Falls
        // back to AuthStore's cached firstName, then to no-name.
        let nameFromBackend: String? = {
            let raw = (richInsights?.greeting ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            guard let range = raw.range(of: " يا ") else { return nil }
            let candidate = String(raw[range.upperBound...]).trimmingCharacters(in: .whitespacesAndNewlines)
            return candidate.isEmpty ? nil : candidate
        }()

        let firstName = nameFromBackend
            ?? authStore.currentUser?.firstName?.trimmingCharacters(in: .whitespacesAndNewlines)
            ?? ""
        return firstName.isEmpty ? word : "\(word) يا \(firstName)"
    }

    /// Four metric cells in a single row — intentionally bare. No per-cell
    /// icons or coloured backgrounds (the user explicitly asked us to stop
    /// "كثرة الأيقونات والألوان"). Just a number + label per cell, with a
    /// hairline divider between them and one accent for the unit.
    private var journeyMetrics: some View {
        HStack(spacing: 0) {
            metricCell(value: "\(richInsights?.metrics.readingTime ?? 0)", unit: "د", label: "وقت القراءة")
            metricDivider
            metricCell(value: "\(richInsights?.metrics.completionRate ?? 0)%", unit: nil, label: "الإكمال")
            metricDivider
            metricCell(value: "\(richInsights?.metrics.likes ?? 0)", unit: nil, label: "إعجابات")
            metricDivider
            // Loyalty points replaces the comments-count cell (per
            // 2026-05-19 editorial preference). lifetimePoints stays
            // monotonic so this number only grows, which reads as
            // gentler than a comment-count that can hit 0.
            metricCell(
                value: "\(loyaltySummary?.points?.lifetimePoints ?? 0)",
                unit: nil,
                label: "نقاط الولاء"
            )
        }
        .padding(.vertical, 10)
        .padding(.horizontal, 4)
        .background(
            RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous)
                .fill(SabqTheme.surface)
        )
    }

    private func metricCell(value: String, unit: String?, label: String) -> some View {
        VStack(spacing: 4) {
            HStack(alignment: .firstTextBaseline, spacing: 2) {
                Text(value)
                    .font(SabqType.rowTitle.font)
                    .foregroundStyle(SabqTheme.textPrimary)
                    .monospacedDigit()
                    .minimumScaleFactor(0.7)
                    .lineLimit(1)
                if let unit {
                    Text(unit)
                        .font(SabqType.tag.font)
                        .foregroundStyle(SabqTheme.textTertiary)
                }
            }
            Text(label)
                .font(SabqType.tag.font)
                .foregroundStyle(SabqTheme.textTertiary)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
        }
        .frame(maxWidth: .infinity)
    }

    private var metricDivider: some View {
        Rectangle()
            .fill(SabqTheme.outline.opacity(0.5))
            .frame(width: 0.5, height: 28)
    }

    /// Top-3 interest chips — minimal styling, one neutral capsule treatment
    /// (no per-chip colours).
    @ViewBuilder
    private var journeyInterests: some View {
        if let interests = richInsights?.topInterests, !interests.isEmpty {
            HStack(spacing: 6) {
                Text("اهتماماتك اليوم:")
                    .font(SabqType.tag.font)
                    .foregroundStyle(SabqTheme.textTertiary)
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 6) {
                        ForEach(interests, id: \.self) { name in
                            Text(name)
                                .font(SabqType.tag.font)
                                .foregroundStyle(SabqTheme.textSecondary)
                                .padding(.horizontal, 9)
                                .padding(.vertical, 4)
                                .background(Capsule().fill(SabqTheme.surface))
                                .overlay(Capsule().stroke(SabqTheme.outline.opacity(0.5), lineWidth: 0.5))
                        }
                    }
                }
            }
        }
    }

    // MARK: - Calendar today card

    private var calendarTodayCard: some View {
        let gold = SabqTheme.gold
        let preview = calendarToday.prefix(3)
        return VStack(alignment: .leading, spacing: 12) {
            HStack {
                sectionHeading(
                    title: "أحداث اليوم القادمة",
                    icon: "calendar",
                    tint: gold
                )
                NavigationLink(value: CalendarRoute()) {
                    Text("الكل")
                        .font(SabqType.tag.font)
                        .foregroundStyle(gold)
                }
            }
            VStack(spacing: 10) {
                ForEach(Array(preview.enumerated()), id: \.offset) { _, event in
                    HStack(spacing: 10) {
                        Capsule().fill(gold).frame(width: 3, height: 28)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(event.title)
                                .font(SabqType.metaEmphasis.font)
                                .foregroundStyle(SabqTheme.textPrimary)
                                .lineLimit(1)
                            if let imp = event.importance, imp >= 4 {
                                Text("حدث بارز")
                                    .font(SabqType.tag.font)
                                    .foregroundStyle(SabqTheme.textTertiary)
                            }
                        }
                        Spacer(minLength: 0)
                    }
                }
            }
            .padding(14)
            .sabqBlockSurface()
        }
    }

    // MARK: - Compact Audio Bulletin Top Bar

    private func audioBulletinKey(_ id: String) -> String {
        "audio-bulletin:\(id)"
    }

    private func audioBulletinTopBar(_ bulletin: APIAudioBulletin) -> some View {
        let key = audioBulletinKey(bulletin.id)
        let isCurrent = audioPlayer.currentKey == key
        let isPlaying = audioPlayer.isPlaying(key: key)
        let elapsed = isCurrent ? audioPlayer.currentTime : 0
        let total = max(1, Double(bulletin.durationSec))
        let duration = (isCurrent && audioPlayer.currentDuration > 0) ? audioPlayer.currentDuration : total
        let progress = min(1.0, max(0.0, elapsed / duration))
        let activeSubtitle: String = {
            if (isPlaying || elapsed > 0), let active = bulletin.activeChapter(at: elapsed) {
                return active.chapter.label
            }
            return bulletin.title
        }()
        let minutes = max(1, Int(round(Double(bulletin.durationSec) / 60.0)))
        let durationLabel: String = {
            if isPlaying || elapsed > 0 {
                return "\(formatBulletinClock(elapsed)) / \(formatBulletinClock(duration))"
            }
            return minutes == 1 ? "دقيقة" : (minutes == 2 ? "دقيقتان" : "\(minutes) د")
        }()

        return Button {
            guard let url = URL(string: bulletin.audioUrl) else { return }
            SabqHaptics.medium()
            audioPlayer.toggle(
                SabqAudioPlayer.Item(
                    key: key,
                    url: url,
                    title: bulletin.title,
                    subtitle: "نشرة سَبْق الصوتية",
                    artworkURL: nil,
                    delivery: .stream
                )
            )
        } label: {
            VStack(spacing: isCurrent ? 6 : 0) {
                HStack(spacing: 10) {
                    ZStack {
                        Circle()
                            .fill(SabqTheme.primary)
                            .frame(width: 30, height: 30)
                        Image(systemName: isPlaying ? "pause.fill" : "play.fill")
                            .font(.system(size: 11, weight: .bold))
                            .foregroundStyle(SabqTheme.onAction)
                    }

                    HStack(spacing: 6) {
                        Text("نشرة سَبْق")
                            .font(SabqType.tag.font)
                            .foregroundStyle(SabqTheme.primary)
                            .padding(.horizontal, 7)
                            .padding(.vertical, 2)
                            .background(
                                Capsule(style: .continuous)
                                    .fill(SabqTheme.surface)
                            )

                        Text(activeSubtitle)
                            .font(SabqType.metaEmphasis.font)
                            .foregroundStyle(SabqTheme.textPrimary)
                            .lineLimit(1)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)

                    Text(durationLabel)
                        .font(SabqType.tag.font)
                        .foregroundStyle(SabqTheme.textSecondary)
                        .monospacedDigit()
                        .environment(\.layoutDirection, .leftToRight)
                }

                if isCurrent {
                    GeometryReader { geo in
                        ZStack(alignment: .leading) {
                            Capsule(style: .continuous)
                                .fill(SabqTheme.primary.opacity(0.18))
                                .frame(height: 3)
                            Capsule(style: .continuous)
                                .fill(SabqTheme.primary)
                                .frame(width: max(4, geo.size.width * progress), height: 3)
                        }
                    }
                    .frame(height: 3)
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .sabqSkyCardSurface()
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(isPlaying ? "إيقاف نشرة سبق الصوتية: \(activeSubtitle)" : "تشغيل نشرة سبق الصوتية: \(bulletin.title)")
    }

    private func compactLegacyNewsletterTopBar(_ newsletter: APIAudioNewsletter) -> some View {
        let key = "newsletter:\(newsletter.id)"
        let isPlaying = audioPlayer.isPlaying(key: key)
        return Button {
            guard let raw = newsletter.audioUrl, let url = URL(string: raw) else { return }
            SabqHaptics.medium()
            audioPlayer.toggle(
                SabqAudioPlayer.Item(
                    key: key,
                    url: url,
                    title: newsletter.title,
                    subtitle: "النشرة الصوتية · سبق",
                    artworkURL: newsletter.coverImageUrl.flatMap(URL.init(string:)),
                    delivery: .stream
                )
            )
        } label: {
            HStack(spacing: 10) {
                ZStack {
                    Circle()
                        .fill(SabqTheme.primary)
                        .frame(width: 30, height: 30)
                    Image(systemName: isPlaying ? "pause.fill" : "play.fill")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundStyle(SabqTheme.onAction)
                }

                HStack(spacing: 6) {
                    Text("نشرة صوتية")
                        .font(SabqType.tag.font)
                        .foregroundStyle(SabqTheme.primary)
                        .padding(.horizontal, 7)
                        .padding(.vertical, 2)
                        .background(
                            Capsule(style: .continuous)
                                .fill(SabqTheme.surface)
                        )

                    Text(newsletter.title)
                        .font(SabqType.metaEmphasis.font)
                        .foregroundStyle(SabqTheme.textPrimary)
                        .lineLimit(1)
                }
                .frame(maxWidth: .infinity, alignment: .leading)

                if let d = newsletter.duration, d > 0 {
                    Text("\(max(1, d / 60)) د")
                        .font(SabqType.tag.font)
                        .foregroundStyle(SabqTheme.textSecondary)
                        .monospacedDigit()
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .sabqSkyCardSurface()
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private func formatBulletinClock(_ seconds: Double) -> String {
        let s = max(0, Int(seconds.rounded(.down)))
        return String(format: "%d:%02d", s / 60, s % 60)
    }

    private func sectionHeading(title: String, icon: String, tint: Color) -> some View {
        HStack(spacing: 8) {
            ZStack {
                Circle()
                    .fill(tint.opacity(0.14))
                    .frame(width: 26, height: 26)
                Image(systemName: icon)
                    .font(SabqType.tag.font)
                    .foregroundStyle(tint)
            }
            Text(title)
                .font(SabqType.rowTitle.font)
                .foregroundStyle(SabqTheme.textPrimary)
            Spacer(minLength: 0)
        }
    }
}

// MARK: - Pulsing Dot

// TimelineView-driven pulse — smoother than withAnimation.repeatForever
// because it ties the animation to the frame clock rather than a fixed
// duration. Two halos with phase offset give a more organic, heartbeat feel.
struct PulsingDot: View {
    let color: Color

    var body: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 60.0, paused: false)) { context in
            let t = context.date.timeIntervalSinceReferenceDate
            let phase1 = 0.5 + 0.5 * sin(t * 2.4)              // 0 → 1 → 0
            let phase2 = 0.5 + 0.5 * sin(t * 2.4 + .pi / 2.5)  // offset phase

            ZStack {
                Circle()
                    .fill(color.opacity(0.20))
                    .frame(width: 18, height: 18)
                    .scaleEffect(0.85 + phase1 * 0.45)
                    .opacity(1 - phase1)

                Circle()
                    .fill(color.opacity(0.30))
                    .frame(width: 12, height: 12)
                    .scaleEffect(0.9 + phase2 * 0.3)
                    .opacity(1 - phase2 * 0.6)

                Circle()
                    .fill(color)
                    .frame(width: 8, height: 8)
            }
        }
    }
}

// MARK: - Story Bubble

struct StoryBubble: View {
    let story: APIStory

    var body: some View {
        VStack(spacing: 8) {
            ZStack {
                Circle()
                    .stroke(
                        LinearGradient(
                            colors: [SabqTheme.primaryStart, SabqTheme.primaryEnd],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        ),
                        lineWidth: 2.5
                    )
                    .frame(width: 68, height: 68)

                if let urlString = story.imageUrl, let url = URL(string: urlString) {
                    CachedAsyncImage(url: url, contentMode: .fill) {
                        storyPlaceholder
                    }
                    .frame(width: 60, height: 60)
                    .clipShape(Circle())
                } else {
                    storyPlaceholder
                }
            }

            Text(story.title)
                .font(SabqType.tag.font)
                .foregroundStyle(SabqTheme.textPrimary)
                .lineLimit(1)
                .frame(width: 72)
        }
    }

    private var storyPlaceholder: some View {
        Circle()
            .fill(
                LinearGradient(
                    colors: [SabqTheme.primaryEnd.opacity(0.15), SabqTheme.primaryStart.opacity(0.05)],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            )
            .frame(width: 60, height: 60)
            .overlay {
                Image(systemName: "doc.text.fill")
                    .font(SabqFonts.app(size: 22, weight: .light))
                    .foregroundStyle(SabqTheme.primaryEnd.opacity(0.5))
            }
    }
}


extension Notification.Name {
    /// Posted when the user re-taps the Home tab while already on the feed.
    static let sabqHomeScrollToTop = Notification.Name("sabq.home.scrollToTop")
}

/// عتبتان لتصغير شعار الرأس (72 للتصغير، 16 للعودة) كي لا يعيد تغيّر ارتفاع
/// الرأس نفسه تفعيل التبديل عبر تثبيت التمرير — نقل Header.tsx (#1600).
nonisolated enum HomeHeaderCompact {
    static func next(current: Bool, y: CGFloat) -> Bool {
        if y > 72 { return true }
        if y <= 16 { return false }
        return current
    }
}
