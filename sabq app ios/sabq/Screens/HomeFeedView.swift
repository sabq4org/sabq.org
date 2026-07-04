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

    /// فترة الفحص الصامت للأخبار الجديدة (بالثواني)
    private let newArticlesPollInterval: TimeInterval = 60
    /// Mirror of the dark-mode flag in `sabqApp` so the header toggle flips
    /// the scene-level `.preferredColorScheme`. The setting also lives in the
    /// in-app preferences screen; both write to the same UserDefaults key.
    @AppStorage("appAppearance") private var appearanceRaw: String = AppAppearance.system.rawValue
    @State private var isFirstLoad = true
    @State private var todayInsights: [String: String] = [:]
    /// Rich personal-journey insights (member-session only). Drives the
    /// inline metric tiles + interest chips in personalJourneyBlock.
    @State private var richInsights: APITodayInsights?
    @State private var calendarToday: [APICalendarEvent] = []
    @State private var latestNewsletter: APIAudioNewsletter?
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
    /// Drives the custom page-indicator row under the featured carousel.
    /// We hide TabView's built-in dots (they sit at the bottom of the
    /// TabView frame, which leaves a visible gap above them on short
    /// cards) and render our own tight against the card bottom.
    @State private var featuredIndex: Int = 0
    /// Drives the modal push to "حسابي / نقاطي" when the user taps the
    /// LoyaltyStripView inside the personal-journey block.
    @State private var showLoyaltyAccount = false
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
        // Prevent horizontal scrolling — reported 2026-05-24. One of
        // the inner blocks (LoyaltyCelebrationBanner or the featured
        // TabView) renders slightly wider than the screen on some
        // devices, which let the user drag the entire page left/right.
        // clipped() + contentShape ensures only the visible frame
        // receives touches.
        .frame(maxWidth: .infinity)
        .clipped()
        .contentShape(Rectangle())
    }

    private var fullBody: some View {
        ScrollViewReader { scrollProxy in
            ScrollView(showsIndicators: false) {
                if isContentReady {
                    // 26pt outer spacing — gives the home feed enough
                    // breathing room between visually heterogeneous blocks
                    // (raw header → padded greeting card → breaking pill
                    // → stories rail → 420pt featured carousel → analytic
                    // cards → section previews). 20pt felt cramped right
                    // around the cards-to-section-preview transition.
                    VStack(alignment: .leading, spacing: 26) {
                        Color.clear
                            .frame(height: 0)
                            .id(Self.scrollTopID)

                        headerSection

                    // Tier-up celebration or periodic engagement nudge.
                    // Slides in from the top, dismissible, tap routes
                    // to LoyaltyAccountView.
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

                    NavigationLink(value: DailyBriefRoute()) {
                        greetingBlock
                    }
                    .buttonStyle(.plain)
                    .animatedAppear(index: 0)

                    // Editorial breaking strip (شريط الأخبار العاجلة) takes the
                    // top slot when the dashboard has an active topic; otherwise
                    // fall back to the single breaking-article card.
                    if let ticker = breakingTicker, !ticker.headlines.isEmpty {
                        BreakingTickerBar(headlines: ticker.headlines)
                            .animatedAppear(index: 1)
                    } else if !articlesStore.breakingNews.isEmpty {
                        breakingNewsSection
                            .animatedAppear(index: 1)
                    }

                    // شريط كأس العالم 2026 — يختفي كليًا عند غياب البيانات
                    WorldCupHomeStrip()
                        .animatedAppear(index: 1)

                    // شريط كأس الملك — يظهر عند تفعيله من إعدادات النظام
                    // (blockHidden) ويختفي كليًا خلاف ذلك أو عند غياب البيانات
                    KingsCupHomeStrip()
                        .animatedAppear(index: 1)

                    if !articlesStore.stories.isEmpty {
                        storiesSection
                            .animatedAppear(index: 2)
                    }

                    featuredSection
                        .animatedAppear(index: 3)

                    // Personal "knowledge journey" inline panel — signed-in
                    // users only. Renders the four metric tiles + interest
                    // chips directly (no navigation), mirroring the web's
                    // SmartSummaryBlock. Logged-out readers see nothing in
                    // this slot.
                    if authStore.isLoggedIn {
                        personalJourneyBlock
                            .animatedAppear(index: 4)
                    }

                    // "صدى الحج" — seasonal block right below the
                    // personal journey card. Renders to an EmptyView
                    // when the dashboard hasn't enabled it / we're
                    // outside the season window / no matching
                    // articles, so it leaves zero footprint the rest
                    // of the year.
                    HajjBlockView()
                        .animatedAppear(index: 4)

                    if !calendarToday.isEmpty {
                        calendarTodayCard
                            .animatedAppear(index: 5)
                    }

                    if latestNewsletter != nil {
                        audioNewsletterCard
                            .animatedAppear(index: 6)
                    }

                    trendingPreviewSection
                        .animatedAppear(index: 8)

                    // Category chips removed from the homepage per user
                    // direction — categories are now reached via Explore tab.
                    // The `categoryChipsSection` view + filtering state remain
                    // intact in case we re-introduce them in a sheet later.

                    latestArticlesSection
                        .id(Self.latestSectionID)
                        .animatedAppear(index: 10)

                    // مقالات الرأي و«مُقترب» تُعرضان أسفل «آخر الأخبار».
                    opinionsPreviewSection
                        .animatedAppear(index: 11)

                    // شريط «مُقترب» — زوايا تحليلية بأقلام الكتّاب. يختفي
                    // كليًا عند غياب المواضيع المميّزة.
                    MuqtarabHomeStrip()
                        .animatedAppear(index: 12)
                }
                .padding(.horizontal, 16)
                .padding(.top, 18)
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
            }
            .sabqAutoHideTabBar()
            .refreshable {
                SabqHaptics.medium()
                await articlesStore.loadArticles(ignoreCache: true)
                // أعد جلب شريط العاجل أيضاً حتى ينعكس أي تفعيل/تعطيل من لوحة
                // التحكم فور السحب للتحديث.
                breakingTicker = (try? await APIClient.shared.fetchBreakingTicker()) ?? nil
                // الخبر الجديد في الكاروسيل يُدرج في الموضع 0 — نرجع المؤشر
                // للبطاقة الأولى حتى يراه المحرر فور السحب للتحديث.
                featuredIndex = 0
            }
            // شريط "⬆️ X أخبار جديدة" عائم فوق القائمة — بديل السحب المتكرر
            .overlay(alignment: .top) {
                newArticlesBanner(proxy: scrollProxy)
            }
            // فحص دوري صامت للأخبار الجديدة طوال ظهور الشاشة وتفعيل
            // التطبيق. نفحص فوراً عند التفعيل (خصوصاً عند العودة من
            // الخلفية) حتى يظهر الشريط بسرعة لو نزلت أخبار والمستخدم
            // برّا. تأخير أولي 3ث يترك شبكة الإقلاع تخلّص أولاً دون تزاحم.
            .task(id: scenePhase) {
                guard scenePhase == .active else { return }
                try? await Task.sleep(for: .seconds(3))
                if Task.isCancelled { return }
                await articlesStore.checkForNewArticles()
                while !Task.isCancelled {
                    try? await Task.sleep(for: .seconds(newArticlesPollInterval))
                    if Task.isCancelled { break }
                    await articlesStore.checkForNewArticles()
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
            async let insights: [String: String]? = try? await APIClient.shared.fetchTodayInsights()
            async let upcoming: [APICalendarEvent]? = try? await APIClient.shared.fetchUpcomingCalendarEvents(days: 14)
            async let newsletters: [APIAudioNewsletter]? = try? await APIClient.shared.fetchAudioNewsletters()
            async let breaking = (try? await APIClient.shared.fetchBreakingTicker()) ?? nil
            // Rich personal-journey insights (member-session only). Returns
            // nil for logged-out users so the block stays hidden cleanly.
            async let richJourney: APITodayInsights? = authStore.isLoggedIn
                ? (try? await APIClient.shared.fetchTodayInsightsRich())
                : nil

            if let v = await insights { todayInsights = v }
            calendarToday = (await upcoming) ?? []
            latestNewsletter = (await newsletters)?.first
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
                        .font(SabqFonts.app(size: 13, weight: .bold))
                    Text(newArticlesBannerText)
                        .font(SabqFonts.app(size: 14, weight: .bold))
                }
                .foregroundStyle(.white)
                .padding(.horizontal, 18)
                .padding(.vertical, 10)
                .background(
                    Capsule().fill(
                        LinearGradient(
                            colors: [SabqTheme.primaryStart, SabqTheme.primaryEnd],
                            startPoint: .leading,
                            endPoint: .trailing
                        )
                    )
                )
                .shadow(color: SabqTheme.primaryEnd.opacity(0.35), radius: 10, x: 0, y: 4)
            }
            .buttonStyle(.plain)
            .padding(.top, 8)
            .transition(.move(edge: .top).combined(with: .opacity))
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
        HStack(alignment: .center, spacing: 14) {
            Image("SabqLogo")
                .renderingMode(.original)
                .resizable()
                .aspectRatio(contentMode: .fit)
                .frame(height: 48)

            Spacer(minLength: 0)

            HStack(spacing: 10) {
                NavigationLink(value: SearchRoute()) {
                    headerIcon("magnifyingglass")
                }
                .buttonStyle(.plain)
                .accessibilityLabel("البحث")

                // Editorial notifications bell — fast access to the user's
                // own notifications (article scheduled/published/rejected/
                // needs_revision/archived). Red dot when unread > 0. Visible
                // only when signed in; readers without editorial roles still
                // see it but its history is naturally empty.
                if authStore.isLoggedIn {
                    NavigationLink(value: EditorialNotificationsRoute()) {
                        ZStack(alignment: .topTrailing) {
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
                                Image(systemName: "bell.fill")
                                    .font(SabqFonts.app(size: 17, weight: .semibold))
                                    .foregroundStyle(SabqTheme.primaryEnd)
                            }
                            // Red unread dot — driven by NotificationsStore's
                            // `unreadCount` which the EditorialNotificationsView
                            // updates on every fetch.
                            if notificationsStore.unreadCount > 0 {
                                Circle()
                                    .fill(SabqTheme.coral)
                                    .frame(width: 10, height: 10)
                                    .overlay(
                                        Circle()
                                            .stroke(SabqTheme.background, lineWidth: 2)
                                    )
                                    .offset(x: 4, y: -4)
                            }
                        }
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(notificationsStore.unreadCount > 0
                        ? "الإشعارات — لديك إشعارات غير مقروءة"
                        : "الإشعارات")
                }

                // "لحظة بلحظة" entry point. The red pulsing dot was removed
                // to avoid confusing it with the editorial-notifications
                // unread indicator on the bell next to it — same colour
                // would have meant two different things side by side.
                NavigationLink(value: MomentByMomentRoute()) {
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

                        Image(systemName: "dot.radiowaves.left.and.right")
                            .font(SabqFonts.app(size: 18, weight: .semibold))
                            .foregroundStyle(SabqTheme.primaryEnd)
                    }
                }
                .buttonStyle(.plain)
                .accessibilityLabel("لحظة بلحظة — التغطية المباشرة")

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
            }
        }
    }

    private func headerIcon(_ systemName: String) -> some View {
        Circle()
            .fill(
                LinearGradient(
                    colors: [SabqTheme.primaryStart.opacity(0.10), SabqTheme.primaryEnd.opacity(0.05)],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            )
            .frame(width: 44, height: 44)
            .overlay {
                Image(systemName: systemName)
                    .font(SabqFonts.app(size: 18, weight: .semibold))
                    .foregroundStyle(SabqTheme.primaryEnd)
            }
    }

    // MARK: - Breaking News

    @ViewBuilder
    private var breakingNewsSection: some View {
        if let article = articlesStore.breakingNews.first {
            NavigationLink(value: article) {
                HStack(spacing: 12) {
                    PulsingDot(color: SabqTheme.coral)

                    Text("عاجل")
                        .font(SabqFonts.app(size: 13, weight: .heavy))
                        .foregroundStyle(SabqTheme.coral)

                    Text(article.title)
                        .font(SabqFonts.app(size: 15, weight: .semibold))
                        .foregroundStyle(SabqTheme.ink)
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)

                    Spacer(minLength: 0)

                    Image(systemName: "chevron.left")
                        .font(SabqFonts.app(size: 12, weight: .bold))
                        .foregroundStyle(SabqTheme.coral.opacity(0.6))
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 14)
                .background(
                    RoundedRectangle(cornerRadius: SabqTheme.tileRadius, style: .continuous)
                        .fill(
                            LinearGradient(
                                colors: [SabqTheme.coral.opacity(0.06), SabqTheme.coral.opacity(0.02)],
                                startPoint: .leading,
                                endPoint: .trailing
                            )
                        )
                )
                .overlay(
                    RoundedRectangle(cornerRadius: SabqTheme.tileRadius, style: .continuous)
                        .stroke(SabqTheme.coral.opacity(0.15), lineWidth: 1)
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

    private var featuredSection: some View {
        let featured = Array(articlesStore.featuredArticles.prefix(3))
        return VStack(spacing: 10) {
            TabView(selection: $featuredIndex) {
                ForEach(Array(featured.enumerated()), id: \.element.id) { idx, article in
                    // VStack + trailing Spacer anchors the card to the top
                    // of its TabView page. Without this, TabView's default
                    // center-alignment lets a tall (3-line-title) card
                    // slide upward and clip against the section above it.
                    VStack(spacing: 0) {
                        NavigationLink(value: article) {
                            FeaturedArticleCard(
                                article: article,
                                onBookmark: { bookmarksStore.toggle(article.id, article: article) },
                                isBookmarked: bookmarksStore.isBookmarked(article.id)
                            )
                        }
                        .buttonStyle(.plain)
                        Spacer(minLength: 0)
                    }
                    .padding(.horizontal, 4)
                    .tag(idx)
                }
            }
            // System dots are hidden; we draw our own immediately below the
            // TabView so the indicator hugs the card instead of floating at
            // the bottom of the TabView frame with a Spacer-sized gap above.
            .tabViewStyle(.page(indexDisplayMode: .never))
            .id(articlesStore.featuredCarouselRevision)
            // 470pt covers the worst-case featured card. Hero is now a
            // 16:10 aspect frame (≈234pt on iPhone std, up to ~269pt on
            // Pro Max-class widths) instead of the previous fixed 200pt,
            // plus 40pt vertical padding + 3-line title (~80pt) + 12pt +
            // 2-line excerpt (~45pt) + 12pt + 30pt meta row + slack.
            // Spacer inside still absorbs the remainder so the card top
            // stays pinned. Reported 2026-05-24.
            .frame(height: 470)

            if featured.count > 1 {
                HStack(spacing: 7) {
                    ForEach(featured.indices, id: \.self) { i in
                        Circle()
                            .fill(i == featuredIndex
                                  ? SabqTheme.primaryEnd
                                  : SabqTheme.ink.opacity(0.30))
                            .frame(width: 7, height: 7)
                            .animation(.easeInOut(duration: 0.2), value: featuredIndex)
                    }
                }
                .frame(maxWidth: .infinity)
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
            VStack(alignment: .leading, spacing: 12) {
                HStack(alignment: .top) {
                    HStack(alignment: .top, spacing: 8) {
                        Image(systemName: "flame.fill")
                            .font(SabqFonts.app(size: 16, weight: .semibold))
                            .foregroundStyle(.orange)
                            .padding(.top, 2)
                        VStack(alignment: .leading, spacing: 2) {
                            Text("الأكثر تداولاً")
                                .font(SabqFonts.app(size: 17, weight: .bold))
                                .foregroundStyle(SabqTheme.ink)
                            Text("خلال آخر 48 ساعة")
                                .font(SabqFonts.app(size: 11, weight: .medium))
                                .foregroundStyle(SabqTheme.tertiaryInk)
                        }
                    }

                    Spacer()

                    NavigationLink(value: TrendingRoute()) {
                        HStack(spacing: 4) {
                            Text("المزيد")
                                .font(SabqFonts.app(size: 13, weight: .semibold))
                            Image(systemName: "chevron.left")
                                .font(SabqFonts.app(size: 11, weight: .semibold))
                        }
                        .foregroundStyle(SabqTheme.primaryEnd)
                    }
                    .buttonStyle(.plain)
                }

                SurfaceCard {
                    ForEach(Array(articlesStore.trendingArticles.prefix(3).enumerated()), id: \.element.id) { index, article in
                        if index > 0 {
                            Divider().foregroundStyle(SabqTheme.outline)
                        }

                        NavigationLink(value: article) {
                            HStack(spacing: 12) {
                                Text("\(index + 1)")
                                    .font(SabqFonts.app(size: 18, weight: .heavy))
                                    .foregroundStyle(index < 3 ? .orange : SabqTheme.tertiaryInk)
                                    .frame(width: 28)

                                Text(article.title)
                                    .font(SabqFonts.app(size: 14, weight: .semibold))
                                    .foregroundStyle(SabqTheme.ink)
                                    .lineLimit(2)
                                    .multilineTextAlignment(.leading)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                            }
                            .padding(.vertical, 4)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
    }

    // MARK: - Opinions Preview

    @ViewBuilder
    private var opinionsPreviewSection: some View {
        if !articlesStore.opinions.isEmpty {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    HStack(spacing: 8) {
                        ZStack {
                            Circle()
                                .fill(SabqTheme.gold.opacity(0.15))
                                .frame(width: 28, height: 28)
                            Image(systemName: "quote.opening")
                                .font(SabqFonts.app(size: 12, weight: .bold))
                                .foregroundStyle(SabqTheme.gold)
                        }
                        Text("آراء وأقلام")
                            .font(SabqFonts.app(size: 17, weight: .bold))
                            .foregroundStyle(SabqTheme.ink)
                    }

                    Spacer()

                    NavigationLink(value: OpinionsRoute()) {
                        HStack(spacing: 4) {
                            Text("جميع المقالات")
                                .font(SabqFonts.app(size: 13, weight: .semibold))
                            Image(systemName: "chevron.left")
                                .font(SabqFonts.app(size: 11, weight: .semibold))
                        }
                        .foregroundStyle(SabqTheme.primaryEnd)
                    }
                    .buttonStyle(.plain)
                }

                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 14) {
                        ForEach(articlesStore.opinions.prefix(5)) { opinion in
                            NavigationLink(value: opinion) {
                                opinionCard(opinion)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(.vertical, 2)
                }
            }
        }
    }

    private func opinionCard(_ opinion: OpinionArticle) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            ZStack(alignment: .bottomLeading) {
                if let urlString = opinion.imageURL, let url = URL(string: urlString) {
                    FocalCachedAsyncImage(url: url, focalPoint: opinion.imageFocalPoint) {
                        opinionCardPlaceholder
                    }
                    .frame(width: 200, height: 120)
                    .clipped()
                } else {
                    opinionCardPlaceholder
                }

                LinearGradient(
                    colors: [.black.opacity(0.7), .clear],
                    startPoint: .bottom,
                    endPoint: .top
                )
                .frame(height: 60)

                HStack(spacing: 6) {
                    opinionAuthorAvatar(opinion, size: 24)
                    Text(opinion.authorName)
                        .font(SabqFonts.app(size: 11, weight: .semibold))
                        .foregroundStyle(.white)
                        .lineLimit(1)
                }
                .padding(8)
            }
            .frame(width: 200, height: 120)
            .clipShape(UnevenRoundedRectangle(topLeadingRadius: 12, bottomLeadingRadius: 0, bottomTrailingRadius: 0, topTrailingRadius: 12))
            .aiImageBadgeOverlay(
                isVisible: opinion.isAiGeneratedImage,
                model: opinion.aiImageModel,
                inset: 6,
                sizeScale: 0.7
            )

            VStack(alignment: .leading, spacing: 6) {
                Text(opinion.title)
                    .font(SabqFonts.app(size: 13, weight: .semibold))
                    .foregroundStyle(SabqTheme.ink)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
                    .frame(height: 36, alignment: .top)

                HStack(spacing: 8) {
                    HStack(spacing: 4) {
                        Image(systemName: "clock")
                            .font(SabqFonts.app(size: 10, weight: .medium))
                        Text(opinion.readingTime)
                            .font(SabqFonts.app(size: 10, weight: .medium))
                    }
                    .foregroundStyle(SabqTheme.tertiaryInk)

                    Spacer()

                    Text(opinion.relativeDate)
                        .font(SabqFonts.app(size: 10, weight: .medium))
                        .foregroundStyle(SabqTheme.tertiaryInk)
                }
            }
            .padding(10)
            .frame(width: 200)
            .background(SabqTheme.surface)
        }
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .shadow(color: .black.opacity(0.06), radius: 8, x: 0, y: 2)
    }

    private var opinionCardPlaceholder: some View {
        Rectangle()
            .fill(
                LinearGradient(
                    colors: [SabqTheme.gold.opacity(0.2), SabqTheme.primaryEnd.opacity(0.1)],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            )
            .frame(width: 200, height: 120)
            .overlay {
                Image(systemName: "text.quote")
                    .font(SabqFonts.app(size: 32, weight: .light))
                    .foregroundStyle(SabqTheme.gold.opacity(0.4))
            }
    }

    private func opinionAuthorAvatar(_ opinion: OpinionArticle, size: CGFloat) -> some View {
        Group {
            if let urlString = opinion.authorImageURL, let url = URL(string: urlString) {
                CachedAsyncImage(url: url, contentMode: .fill) {
                    authorInitialsView(opinion.authorName, size: size)
                }
                .frame(width: size, height: size)
                .clipShape(Circle())
            } else {
                authorInitialsView(opinion.authorName, size: size)
            }
        }
    }

    private func authorInitialsView(_ name: String, size: CGFloat) -> some View {
        Circle()
            .fill(
                LinearGradient(
                    colors: [SabqTheme.gold, SabqTheme.primaryEnd],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            )
            .frame(width: size, height: size)
            .overlay {
                Text(String(name.prefix(1)))
                    .font(SabqFonts.app(size: size * 0.45, weight: .bold))
                    .foregroundStyle(.white)
            }
    }

    // MARK: - Latest Articles

    private var latestArticlesSection: some View {
        VStack(alignment: .leading, spacing: 14) {
            SectionHeader(
                title: articlesStore.selectedCategory?.title ?? "آخر الأخبار",
                subtitle: articlesStore.selectedCategory?.subtitle ?? "تابع أحدث الأخبار المحلية والعالمية",
                icon: "newspaper.fill",
                tint: articlesStore.selectedCategory?.tint ?? SabqTheme.primaryEnd
            )

            SurfaceCard {
                // LazyVStack so the home feed only materialises rows
                // for articles entering the viewport — previous plain
                // VStack rendered all ~15-50 CompactArticleRow views
                // upfront on every paginated `تحميل المزيد` tap.
                LazyVStack(alignment: .leading, spacing: 0) {
                    ForEach(Array(articlesStore.filteredArticles.enumerated()), id: \.element.id) { index, article in
                        NavigationLink(value: article) {
                            CompactArticleRow(
                                article: article,
                                onBookmark: { bookmarksStore.toggle(article.id, article: article) },
                                isBookmarked: bookmarksStore.isBookmarked(article.id),
                                isNew: articlesStore.isRecentlyAdded(article.id)
                            )
                        }
                        .buttonStyle(.plain)
                        .padding(.vertical, 4)
                        .onAppear {
                            // Prefetch images for the next 5 articles
                            let allArticles = articlesStore.filteredArticles
                            let upcoming = allArticles.dropFirst(index + 1).prefix(5)
                            let urls = upcoming.compactMap { $0.imageURL.flatMap(URL.init(string:)) }
                            if !urls.isEmpty { ImageCache.prefetch(urls: urls, maxPixelSize: 1200) }
                        }
                    }
                }

                if articlesStore.hasMore && articlesStore.selectedCategory == nil {
                    Button {
                        Task { await articlesStore.loadMore() }
                    } label: {
                        HStack(spacing: 8) {
                            if articlesStore.isLoading {
                                ProgressView()
                                    .tint(SabqTheme.primaryEnd)
                            }
                            Text("تحميل المزيد")
                                .font(SabqFonts.app(size: 14, weight: .semibold))
                                .foregroundStyle(SabqTheme.primaryEnd)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                    }
                    .buttonStyle(.plain)
                    .disabled(articlesStore.isLoading)
                }
            }
        }
    }

    // MARK: - Greeting Block (Phase 2)

    /// Time-aware Arabic greeting. The greeting + sub-message is the first
    /// piece the reader sees, framing the day's content as something curated
    /// rather than a dump of articles.
    private var greetingBlock: some View {
        let hour = Calendar.current.component(.hour, from: Date())
        let greeting: String
        let icon: String
        let tint: Color
        switch hour {
        case 5..<12:
            greeting = "صباح الخير"
            icon = "sun.max.fill"
            tint = Color(red: 0.96, green: 0.72, blue: 0.18)
        case 12..<17:
            greeting = "نهارك سعيد"
            icon = "sun.haze.fill"
            tint = Color(red: 0.93, green: 0.58, blue: 0.22)
        case 17..<21:
            // Evening = the sun setting. `sunset.fill` reads as dusk far more
            // clearly than the previous `sun.dust.fill` (which most users see
            // as a daytime haze icon). Warmer orange tint matches the sunset.
            greeting = "مساء الخير"
            icon = "sunset.fill"
            tint = Color(red: 0.95, green: 0.45, blue: 0.20)
        default:
            greeting = "ليلة هادئة"
            icon = "moon.stars.fill"
            tint = Color(red: 0.46, green: 0.52, blue: 0.95)
        }

        // Stable seed keyed off the calendar day so the rotated headline +
        // tip don't flicker between renders. Day of year drives the tip
        // (different tip each day); (day + hour-of-day quarter) drives the
        // headline (different headline each quarter of the day).
        let dayOfYear = Calendar.current.ordinality(of: .day, in: .year, for: Date()) ?? 1
        let quarterIndex: Int
        switch hour {
        case 5..<12:  quarterIndex = 0
        case 12..<17: quarterIndex = 1
        case 17..<21: quarterIndex = 2
        default:      quarterIndex = 3
        }

        // Prefer the backend-generated AI line when it actually comes back
        // with something — falls through to a SABQ-AI-branded static line
        // otherwise so the block never looks empty or generic.
        let backendAIPhrase = (todayInsights["phrase"]
            ?? todayInsights["headline"]
            ?? todayInsights["summary"]) ?? ""
        let headline: String = {
            let trimmed = backendAIPhrase.trimmingCharacters(in: .whitespacesAndNewlines)
            if !trimmed.isEmpty { return trimmed }
            return Self.sabqHeadlines[(dayOfYear + quarterIndex) % Self.sabqHeadlines.count]
        }()

        let tip = Self.sabqTips[dayOfYear % Self.sabqTips.count]

        return HStack(alignment: .top, spacing: 14) {
            ZStack {
                Circle()
                    .fill(tint.opacity(0.14))
                    .frame(width: 52, height: 52)
                Image(systemName: icon)
                    .font(SabqFonts.app(size: 22, weight: .semibold))
                    .foregroundStyle(tint)
                    .symbolRenderingMode(.hierarchical)
            }

            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 6) {
                    Text(greeting)
                        .font(SabqFonts.app(size: 13, weight: .semibold))
                        .foregroundStyle(SabqTheme.secondaryInk)
                    // Tiny "SABQ AI" pill so the headline below clearly
                    // reads as machine-curated rather than editorial copy.
                    HStack(spacing: 3) {
                        Image(systemName: "sparkles")
                            .font(SabqFonts.app(size: 8, weight: .bold))
                        Text("SABQ AI")
                            .font(SabqFonts.app(size: 9, weight: .heavy))
                    }
                    .foregroundStyle(.white)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(
                        Capsule().fill(
                            LinearGradient(
                                colors: [SabqTheme.primaryEnd, tint],
                                startPoint: .leading,
                                endPoint: .trailing
                            )
                        )
                    )
                }

                Text(headline)
                    .font(SabqFonts.app(size: 16, weight: .heavy))
                    .foregroundStyle(SabqTheme.ink)
                    .lineLimit(3)
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)

                Text(tip)
                    .font(SabqFonts.app(size: 11, weight: .medium))
                    .foregroundStyle(SabqTheme.tertiaryInk)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: SabqTheme.cardRadius, style: .continuous)
                .fill(.ultraThinMaterial)
                .overlay(
                    RoundedRectangle(cornerRadius: SabqTheme.cardRadius, style: .continuous)
                        .fill(tint.opacity(0.05))
                )
        )
        .overlay(
            RoundedRectangle(cornerRadius: SabqTheme.cardRadius, style: .continuous)
                .stroke(tint.opacity(0.18), lineWidth: 0.5)
        )
        .shadow(color: tint.opacity(0.08), radius: 14, x: 0, y: 6)
    }

    // MARK: - Personal Journey Block (auth-gated)

    /// Compact inline "knowledge journey" panel for signed-in users —
    /// mirrors the web's SmartSummaryBlock. Renders the four metric tiles
    /// (reading time / completion / likes / comments) + interest chips
    /// directly on the home feed, no navigation. Uses the backend greeting
    /// when available so the user sees their actual name, falls back to a
    /// device-local time greeting otherwise.
    private var personalJourneyBlock: some View {
        VStack(alignment: .leading, spacing: 14) {
            journeyHeader
            KnowledgeJourneyHealthCard()
            LoyaltyStripView(onTap: { showLoyaltyAccount = true })
            journeyMetrics
            journeyInterests
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        // Solid surface + soft drop shadow instead of `.ultraThinMaterial`.
        // The material blended too closely with the page background
        // (SabqTheme.background sits ~5% above pure white in light mode,
        // and the material averaged to the same tone), so the block
        // disappeared into the feed. Reported 2026-05-24. Matching the
        // surface used by every other home card gives the journey block
        // a clear edge without competing with the cards inside it.
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

    // MARK: Journey sub-views

    private var journeyHeader: some View {
        HStack(spacing: 12) {
            ZStack {
                Circle()
                    .fill(
                        LinearGradient(
                            colors: [
                                Color(red: 0.55, green: 0.36, blue: 0.92),
                                SabqTheme.primaryEnd
                            ],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .frame(width: 40, height: 40)
                Image(systemName: "sparkles")
                    .font(SabqFonts.app(size: 16, weight: .bold))
                    .foregroundStyle(.white)
            }

            VStack(alignment: .leading, spacing: 2) {
                Text(journeyGreeting)
                    .font(SabqFonts.app(size: 15, weight: .heavy))
                    .foregroundStyle(SabqTheme.ink)
                    .lineLimit(1)
                    .minimumScaleFactor(0.85)
                Text("رحلتك المعرفية في سبق اليوم باختصار")
                    .font(SabqFonts.app(size: 11, weight: .medium))
                    .foregroundStyle(SabqTheme.secondaryInk)
                    .lineLimit(1)
                    .minimumScaleFactor(0.9)
            }
            Spacer(minLength: 0)
        }
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
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(SabqTheme.paleFill.opacity(0.5))
        )
    }

    private func metricCell(value: String, unit: String?, label: String) -> some View {
        VStack(spacing: 4) {
            HStack(alignment: .firstTextBaseline, spacing: 2) {
                Text(value)
                    .font(SabqFonts.app(size: 17, weight: .heavy))
                    .foregroundStyle(SabqTheme.ink)
                    .monospacedDigit()
                    .minimumScaleFactor(0.7)
                    .lineLimit(1)
                if let unit {
                    Text(unit)
                        .font(SabqFonts.app(size: 11, weight: .semibold))
                        .foregroundStyle(SabqTheme.tertiaryInk)
                }
            }
            Text(label)
                .font(SabqFonts.app(size: 10, weight: .medium))
                .foregroundStyle(SabqTheme.tertiaryInk)
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
                    .font(SabqFonts.app(size: 11, weight: .semibold))
                    .foregroundStyle(SabqTheme.tertiaryInk)
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 6) {
                        ForEach(interests, id: \.self) { name in
                            Text(name)
                                .font(SabqFonts.app(size: 11, weight: .semibold))
                                .foregroundStyle(SabqTheme.secondaryInk)
                                .padding(.horizontal, 9)
                                .padding(.vertical, 4)
                                .background(Capsule().fill(SabqTheme.paleFill))
                                .overlay(Capsule().stroke(SabqTheme.outline.opacity(0.5), lineWidth: 0.5))
                        }
                    }
                }
            }
        }
    }

    /// SABQ-AI-branded headlines for the greeting block. Picked by a stable
    /// (day-of-year + quarter-of-day) index so the line cycles four times a
    /// day without flickering between renders. Wording is deliberately
    /// product-flavoured — the user asked for "phrases related to the
    /// newspaper" rather than the previous editorial-tone copy.
    nonisolated static let sabqHeadlines: [String] = [
        "موجزك ينتظر اهتماماتك",
        "اختر ما يهمك وسبق ترتّب الباقي",
        "صفحتك الشخصية تبدأ من هنا",
        "أخبارك اليومية في مساحة واحدة",
        "اقتراحات أذكى كلما قرأت أكثر",
        "احفظ، تابع، واكتشف من حسابك",
        "موجز خاص بك داخل سبق",
        "ابدأ تجربة قراءة مصممة لك",
    ]

    /// Rotating in-app announcements / feature tips shown as the small line
    /// under the headline. Indexed by day-of-year so users see a different
    /// tip each day. Keep these short, action-oriented, and feature-true.
    nonisolated static let sabqTips: [String] = [
        "أنشئ حسابك لاختيار المحليات والرياضة والاقتصاد وما يهمك",
        "بعد التسجيل يظهر لك موجز يومي مبني على اهتماماتك",
        "حسابك يحفظ المقالات ويعيدها لك من أي جهاز",
        "كل قراءة تساعد سبق AI على تحسين الاقتراحات لك",
        "صفحة حسابك تجمع اهتماماتك ومحفوظاتك وإحصاءاتك",
        "اضغط هنا لمعاينة مزايا العضوية قبل التسجيل",
        "الموجز الشخصي يختصر لك أهم ما فاتك",
        "ابدأ بعضوية مجانية واجعل الصفحة الرئيسية أقرب لك",
        "اختر اهتماماتك مرة، ودع سبق ترتّب الأخبار لك",
    ]

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
                        .font(SabqFonts.app(size: 11, weight: .heavy))
                        .foregroundStyle(gold)
                }
            }
            VStack(spacing: 10) {
                ForEach(Array(preview.enumerated()), id: \.offset) { _, event in
                    HStack(spacing: 10) {
                        RoundedRectangle(cornerRadius: 3).fill(gold).frame(width: 3, height: 28)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(event.title)
                                .font(SabqFonts.app(size: 13, weight: .bold))
                                .foregroundStyle(SabqTheme.ink)
                                .lineLimit(1)
                            if let imp = event.importance, imp >= 4 {
                                Text("حدث بارز")
                                    .font(SabqFonts.app(size: 10, weight: .medium))
                                    .foregroundStyle(SabqTheme.tertiaryInk)
                            }
                        }
                        Spacer(minLength: 0)
                    }
                }
            }
            .padding(14)
            .background(
                RoundedRectangle(cornerRadius: SabqTheme.tileRadius, style: .continuous)
                    .fill(SabqTheme.surface)
            )
            .overlay(
                RoundedRectangle(cornerRadius: SabqTheme.tileRadius, style: .continuous)
                    .stroke(gold.opacity(0.18), lineWidth: 0.5)
            )
        }
    }

    // MARK: - Audio newsletter card

    @ViewBuilder
    private var audioNewsletterCard: some View {
        if let n = latestNewsletter {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    sectionHeading(
                        title: "النشرات الصوتية",
                        icon: "waveform",
                        tint: SabqTheme.coral
                    )
                    NavigationLink(value: AudioNewslettersRoute()) {
                        Text("الكل")
                            .font(SabqFonts.app(size: 11, weight: .heavy))
                            .foregroundStyle(SabqTheme.coral)
                    }
                }
                NavigationLink(value: AudioNewslettersRoute()) {
                    HStack(spacing: 14) {
                        ZStack {
                            RoundedRectangle(cornerRadius: 14, style: .continuous)
                                .fill(LinearGradient(
                                    colors: [SabqTheme.coral.opacity(0.30), SabqTheme.primaryEnd.opacity(0.18)],
                                    startPoint: .topLeading,
                                    endPoint: .bottomTrailing))
                            Image(systemName: "waveform")
                                .font(SabqFonts.app(size: 20, weight: .light))
                                .foregroundStyle(.white.opacity(0.8))
                        }
                        .frame(width: 54, height: 54)
                        VStack(alignment: .leading, spacing: 4) {
                            Text(n.title)
                                .font(SabqFonts.app(size: 14, weight: .heavy))
                                .foregroundStyle(SabqTheme.ink)
                                .lineLimit(2)
                                .multilineTextAlignment(.leading)
                            if let d = n.duration {
                                Text("\(d / 60) دقيقة استماع")
                                    .font(SabqFonts.app(size: 11, weight: .medium))
                                    .foregroundStyle(SabqTheme.tertiaryInk)
                                    .monospacedDigit()
                            }
                        }
                        Spacer(minLength: 0)
                        Image(systemName: "play.circle.fill")
                            .font(SabqFonts.app(size: 28))
                            .foregroundStyle(SabqTheme.coral)
                    }
                    .padding(14)
                    .background(
                        RoundedRectangle(cornerRadius: SabqTheme.tileRadius, style: .continuous)
                            .fill(SabqTheme.surface)
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: SabqTheme.tileRadius, style: .continuous)
                            .stroke(SabqTheme.coral.opacity(0.18), lineWidth: 0.5)
                    )
                }
                .buttonStyle(.plain)
            }
        }
    }

    private func sectionHeading(title: String, icon: String, tint: Color) -> some View {
        HStack(spacing: 8) {
            ZStack {
                Circle()
                    .fill(tint.opacity(0.14))
                    .frame(width: 26, height: 26)
                Image(systemName: icon)
                    .font(SabqFonts.app(size: 12, weight: .semibold))
                    .foregroundStyle(tint)
            }
            Text(title)
                .font(SabqFonts.app(size: 16, weight: .heavy))
                .foregroundStyle(SabqTheme.ink)
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
                .font(SabqFonts.app(size: 11, weight: .semibold))
                .foregroundStyle(SabqTheme.ink)
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
