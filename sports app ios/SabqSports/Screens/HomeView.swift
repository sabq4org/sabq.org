import SwiftUI

// صبغة هَب روشن تتبع لون التطبيق المحوري؛ البطولات لا تعيد صبغ الشاشة.
private var rslAccent: Color { SpTheme.compAccent("pro-league") }

// ════════════════════════════════════════════════════════════════════════
//  HomeView — تطبيق VARA الرياضي · واجهة «دوري روشن» (إعادة تصميم)
//
//  بديل مباشر لـ Screens/HomeView.swift. يستخدم نفس المكوّنات (SpTheme،
//  SportsFonts، SpTeamLogo، SpMatchCenter…) ونفس نقاط الـAPI القائمة
//  (/api/sports/pro-league/*). التصميم: هيرو مباراة مباشرة جريء + تبويبات
//  نظرة/مباريات/ترتيب/هدّافون، مع نظرة عامة غنية (المفضّل، جولة الأسبوع،
//  سباق اللقب، الهدّافون، الأرقام اللافتة). التحليل العميق عبر SpMatchCenter.
//
//  ملاحظة دمج: انسخ هذا الملف فوق Screens/HomeView.swift (يحتوي NewsView
//  كما هو بالأسفل، فيبقى بديلاً مباشراً).
// ════════════════════════════════════════════════════════════════════════

struct HomeView: View {
    @Environment(\.scenePhase) private var scenePhase
    @Environment(SpLiveStream.self) private var liveStream
    @Environment(SpFavorites.self) private var favorites
    @Environment(SpMatchFollows.self) private var matchFollows
    @Environment(SpAuthStore.self) private var auth

    @State private var comp: SpCompetition?
    @State private var outlook: SpOutlook?
    @State private var matches: SpMatchesResponse?
    @State private var standings: [SpStandingRow] = []
    @State private var scorers: [SpScorer] = []
    @State private var assists: [SpScorer] = []
    @State private var transfers: [SpLeagueTransfer] = []

    // إثراء الهيرو (أفضل جهد) — إحصائيات + xG لمباراة الواجهة المباشرة.
    @State private var featuredDetail: SpMatchDetail?
    @State private var featuredXg: SpXg?
    @State private var featuredMomentum: SpMomentum?
    @State private var featuredPressure: SpPressure?
    @State private var featuredFacts: SpMatchFacts?
    @State private var featuredCommentary: SpCommentary?

    @State private var scorerMode: ScorerMode = .goals
    @State private var selectedMatch: SpFixture?
    @State private var selectedTeam: IDBox?
    @State private var selectedPlayer: IDBox?
    @State private var showAllStandings = false
    @State private var showAllScorers = false
    @State private var showSearch = false
    @State private var showForYou = false
    @State private var showTransferCenter = false
    @State private var loading = true
    @State private var loadError: String?

    enum ScorerMode { case goals, assists }

    /// مباراة الواجهة: إن اختار العضو فريقًا مفضّلًا فالأولوية لمباراته (مباشر/اليوم/
    /// قادم/آخر نتيجة)، وإلا فمباراة الدوري الأبرز بنفس الترتيب.
    private var featured: SpFixture? {
        guard let m = matches else { return nil }
        if let favId = favorites.team?.id, let fm = favoriteLastResult(m, favId) { return fm }
        return m.live.first ?? m.today.first ?? m.upcoming.first ?? m.results.first
    }

    /// أبرز مباراة تخصّ الفريق المفضّل عبر الدلاء بالأولوية.
    private func favoriteMatch(_ m: SpMatchesResponse, _ favId: Int) -> SpFixture? {
        for bucket in [m.live, m.today, m.upcoming, m.results] {
            if let f = bucket.first(where: { $0.home.id == favId || $0.away.id == favId }) { return f }
        }
        return nil
    }

    /// بطاقة «فريقي المفضّل» الكبيرة تعرض آخر مباراة خاضها الفريق فقط.
    private func favoriteLastResult(_ m: SpMatchesResponse, _ favId: Int) -> SpFixture? {
        m.results
            .filter { $0.home.id == favId || $0.away.id == favId }
            .sorted { $0.timestamp > $1.timestamp }
            .first
    }

    /// هل الهيرو الحالي مباراة الفريق المفضّل؟ (لإظهار شارة «فريقي» وإخفاء البطاقة المكرّرة)
    private var heroIsFavorite: Bool {
        guard let favId = favorites.team?.id, let f = featured else { return false }
        return f.home.id == favId || f.away.id == favId
    }

    /// سياق ذكاء VARA — مبنيّ على سلوك المستخدم (المفضّل، المتابَعة، التنبيهات،
    /// ومباراة المفضّل القادمة/الجارية من البيانات المحمّلة).
    private var varaInsightContext: VaraInsightContext {
        let favMatch = favorites.team.flatMap { fav in matches.flatMap { favoriteMatch($0, fav.id) } }
        let activeAlerts = [auth.alertPrefs.kickoff, auth.alertPrefs.goals, auth.alertPrefs.cards,
                            auth.alertPrefs.varReview, auth.alertPrefs.fulltime].filter { $0 }.count
        let upcoming = (favMatch != nil && !favMatch!.started)
        return VaraInsightContext(
            isLoggedIn: auth.isLoggedIn,
            favoriteName: favorites.team?.name,
            followsCount: auth.follows.filter { $0.kind == "team" }.count,
            activeAlerts: activeAlerts,
            favoriteNextTitle: favMatch.map { "\($0.home.name) × \($0.away.name)" },
            favoriteNextKickoff: upcoming ? favMatch?.kickoff : nil,
            favoriteIsLive: favMatch?.status.live ?? false
        )
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 0) {
                    heroSection
                        .padding(.horizontal, 16)
                        .padding(.bottom, 18)

                    if loading && matches == nil && standings.isEmpty {
                        SpLoading().padding(.top, 40)
                    } else if let loadError, matches == nil, standings.isEmpty, outlook == nil {
                        SpEmptyState(icon: "wifi.exclamationmark", title: "تعذّر التحميل", subtitle: loadError)
                            .padding(.horizontal, 16)
                    } else {
                        dashboardContent
                            .padding(.bottom, 28)
                    }
                }
            }
            .autoHideTabBar()
            .background(SpAmbientBackground())
            .navigationTitle("")
            .toolbar(.hidden, for: .navigationBar)
            .navigationDestination(item: $selectedMatch) { f in SpMatchCenter(fixtureId: f.id, preview: f) }
            .navigationDestination(item: $selectedTeam) { box in SpTeamPage(teamId: box.id) }
            .navigationDestination(item: $selectedPlayer) { box in SpPlayerPage(playerId: box.id) }
            .navigationDestination(isPresented: $showAllStandings) { fullStandingsPage }
            .navigationDestination(isPresented: $showAllScorers) { fullScorersPage }
            .navigationDestination(isPresented: $showSearch) { SpSearchView() }
            .navigationDestination(isPresented: $showForYou) { SpForYouView() }
            .navigationDestination(isPresented: $showTransferCenter) { TransferCenterView() }
        }
        .task { await loadAll() }
        .task { await pollHero() }
        // عودة التطبيق للمقدّمة أثناء مباراة جارية = تحديث فوري للهيرو.
        .onChange(of: scenePhase) { _, phase in
            if phase == .active, featured?.status.live == true {
                Task { await refreshHero() }
            }
        }
        // البث الحيّ (SSE): تغيّر ختم مباراة الهيرو = تحديث فوري للنتيجة والمجريات.
        .onChange(of: featured.flatMap { liveStream.stamps["s:\($0.id)"] }) { _, _ in
            Task { await refreshHero() }
        }
        .refreshable { await loadAll(force: true) }
    }

    // MARK: - الاستطلاع الحيّ للهيرو
    //
    // الرئيسية كانت بلا أي استطلاع — نتيجة الهيرو الحية تتجمّد حتى السحب اليدوي.
    // السياسة الموحّدة: حيّ = 10ث (خفيف: المباريات + تفاصيل/تعليق الهيرو)،
    // وقبل الانطلاق ≤ 30 دقيقة = 30ث لالتقاط البداية، وإلا فحص خامل كل 60ث بلا شبكة.
    private func pollHero() async {
        while !Task.isCancelled {
            let f = featured
            let live = f?.status.live == true
            let secsToKickoff = f.map { $0.kickoff.timeIntervalSinceNow } ?? .greatestFiniteMagnitude
            let near = !live && secsToKickoff > 0 && secsToKickoff <= 1800
            let delay: UInt64 = live ? 10_000_000_000 : (near ? 30_000_000_000 : 60_000_000_000)
            try? await Task.sleep(nanoseconds: delay)
            if Task.isCancelled { break }
            if live || near { await refreshHero() }
        }
    }

    /// تحديث حيّ خفيف: قائمة المباريات (تُحرّك النتيجة/الحالة في الهيرو وبقية اللوحة)
    /// + تفاصيل وتعليق مباراة الهيرو الجارية. التحليل الأثقل (xG/زخم/ضغط) يبقى
    /// على loadAll (السحب اليدوي) — الأرقام الحيوية هنا هي النتيجة والأحداث.
    private func refreshHero() async {
        if let m = try? await APIClient.shared.fetchMatches(comp: SportsConstants.defaultComp, ignoreCache: true) {
            matches = m
        }
        if let f = featured, f.started {
            async let detailOpt = try? APIClient.shared.fetchMatchDetail(id: f.id, ignoreCache: true)
            async let commentaryOpt = try? APIClient.shared.fetchCommentary(matchId: f.id, ignoreCache: true)
            self.featuredDetail = await detailOpt
            self.featuredCommentary = f.status.live ? await commentaryOpt : nil
        }
    }

    // MARK: - الهيرو

    @ViewBuilder private var heroSection: some View {
        VStack(spacing: 16) {
            brandBar
            leagueHeader
            // بلوك «فريقي» — مباريات الفريق المفضّل عبر البطولات (خلَف «مبارياتي»
            // الذي انتقل لمركز المباريات). البلوك مكمّل للهيرو لا بديل عنه.
            SpMyTeamCard(
                standings: standings,
                onOpenMatch: { selectedMatch = $0 },
                onOpenTeam: { selectedTeam = IDBox(id: $0) },
                onPickTeam: { showAllStandings = true }
            )
            if let f = featured {
                heroMatch(f)
                    .transition(.opacity)
            } else if let o = outlook, !loading {
                // البطاقة الاحتياطية «بطل الموسم» — تظهر فقط بعد استقرار التحميل
                // ووجود يقينٍ بعدم توفّر مباراة مميّزة. لولا قيد !loading لومضت لحظيًّا
                // قبل أن يُحسم featured ثم قفزت لبطاقة المباراة (الوميض المُبلَّغ عنه).
                SpOutlookCard(outlook: o)
                    .transition(.opacity)
            }
            // أثناء التحميل: لا هيرو احتياطي — مؤشّر SpLoading أسفل القسم يكفي، بلا قفز.
        }
        .animation(.easeInOut(duration: 0.25), value: loading)
    }

    // شعار التطبيق (VARA) أعلى الصفحة الرئيسية — علامة الهوية:
    // الأيقونة + VA(R ذهبية)A + «دقّة الرياضة» (دليل الهوية).
    private var brandBar: some View {
        HStack(spacing: 10) {
            Image("VaraLogo")
                .resizable()
                .scaledToFill()
                .frame(width: 32, height: 32)
                .clipShape(Circle())
                .overlay(Circle().stroke(SpTheme.cardStroke, lineWidth: 1))
            VStack(alignment: .leading, spacing: 0) {
                SpWordmark(size: 18)
                Text("دقّة الرياضة")
                    .font(SportsFonts.app(size: 9.5, weight: .semibold))
                    .foregroundStyle(SpTheme.onDarkDim)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 6)
    }

    // ترويسة الهوية: شعار + «دوري روشن» + الموسم/الجولة.
    private var leagueHeader: some View {
        HStack(spacing: 12) {
            ZStack {
                // شعار دوري روشن الرسمي (أصل محلّي) — ثابت في ترويسة الواجهة.
                Image("RoshnLogo")
                    .resizable()
                    .scaledToFit()
                    .frame(width: 44, height: 44)
                    .clipShape(RoundedRectangle(cornerRadius: 13, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 13, style: .continuous).stroke(SpTheme.cardStroke, lineWidth: 1))
            }
            VStack(alignment: .leading, spacing: 2) {
                (Text("دوري ").foregroundStyle(SpTheme.onDark)
                    + Text("روشن").foregroundStyle(rslAccent))
                    .font(SportsFonts.app(size: 19, weight: .heavy))
                Text(metaText)
                    .font(SportsFonts.app(size: 11, weight: .semibold))
                    .foregroundStyle(SpTheme.onDarkDim)
            }
            Spacer(minLength: 0)
            HStack(spacing: 8) {
                headerButton("magnifyingglass", label: "بحث") { showSearch = true }
                headerButton("bell", label: "لك") { showForYou = true }
            }
        }
    }

    private func headerButton(_ icon: String, label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: icon)
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(SpTheme.onDark)
                .frame(width: 38, height: 38)
                .background(RoundedRectangle(cornerRadius: 11, style: .continuous).fill(SpTheme.surface)
                    .overlay(RoundedRectangle(cornerRadius: 11, style: .continuous).stroke(SpTheme.cardStroke, lineWidth: 1)))
                .contentShape(RoundedRectangle(cornerRadius: 11, style: .continuous))
        }
        .buttonStyle(SpPressStyle())
        .accessibilityLabel(label)
    }

    private var metaText: String {
        "الموسم سينطلق قريبًا"
    }

    // بطاقة الهيرو الفاخرة (فحمي → بترولي) مع المباراة المميّزة.
    private func heroMatch(_ f: SpFixture) -> some View {
        Button { selectedMatch = f } label: {
            VStack(spacing: 16) {
                HStack(alignment: .center) {
                    HStack(spacing: 5) {
                        if heroIsFavorite {
                            Image(systemName: "star.fill").font(.system(size: 9, weight: .bold))
                        }
                        Text(heroIsFavorite
                             ? (f.round.isEmpty ? "فريقي المفضّل" : "فريقي المفضّل · \(f.round)")
                             : (f.round.isEmpty ? "دوري روشن" : "دوري روشن · \(f.round)"))
                            .lineLimit(1)
                    }
                    .font(SportsFonts.app(size: 11, weight: .bold))
                    .foregroundStyle(rslAccent)
                    .padding(.horizontal, 9).padding(.vertical, 4)
                    .background(Capsule().fill(rslAccent.opacity(0.10)))
                    Spacer(minLength: 8)
                    heroStatusBadge(f)
                }

                HStack(alignment: .top, spacing: 8) {
                    heroTeam(f.home)
                    heroScore(f)
                    heroTeam(f.away)
                }

                if let story = heroStoryLine(f) {
                    HStack(spacing: 7) {
                        Image(systemName: f.status.finished ? "checkmark.seal.fill" : "calendar.badge.clock")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(rslAccent)
                        Text(story)
                            .font(SportsFonts.app(size: 11.5, weight: .bold))
                            .foregroundStyle(SpTheme.onDarkDim)
                            .lineLimit(1)
                            .minimumScaleFactor(0.8)
                        Spacer(minLength: 0)
                    }
                    .padding(.horizontal, 10)
                    .padding(.vertical, 7)
                    .background(RoundedRectangle(cornerRadius: 11, style: .continuous).fill(rslAccent.opacity(0.055)))
                }

                let stats = heroStats(f)
                if !stats.isEmpty {
                    HStack(spacing: 7) {
                        ForEach(Array(stats.enumerated()), id: \.offset) { _, s in
                            VStack(spacing: 2) {
                                Text(s.0).font(SportsFonts.app(size: 9.5, weight: .bold)).foregroundStyle(SpTheme.onDarkDim)
                                Text(s.1).font(SportsFonts.app(size: 12, weight: .bold)).foregroundStyle(SpTheme.onDark)
                                    .monospacedDigit().environment(\.layoutDirection, .leftToRight)
                            }
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 7)
                            .background(RoundedRectangle(cornerRadius: 11, style: .continuous).fill(SpTheme.chipFill))
                        }
                    }
                }

                let insights = heroInsightItems(f)
                if !insights.isEmpty {
                    HStack(spacing: 7) {
                        ForEach(Array(insights.enumerated()), id: \.offset) { _, item in
                            heroInsightChip(icon: item.0, title: item.1, value: item.2)
                        }
                    }
                }

                // آخر مجريات المباراة الحيّة — سطر واحد من التعليق العربي.
                if f.status.live, let line = latestCommentLine {
                    HStack(spacing: 7) {
                        Image(systemName: "bolt.horizontal.circle.fill")
                            .font(.system(size: 12, weight: .semibold)).foregroundStyle(rslAccent)
                        Text(line)
                            .font(SportsFonts.app(size: 11, weight: .semibold))
                            .foregroundStyle(SpTheme.onDarkDim)
                            .lineLimit(1)
                        Spacer(minLength: 0)
                    }
                    .padding(.horizontal, 10).padding(.vertical, 7)
                    .background(RoundedRectangle(cornerRadius: 11, style: .continuous).fill(SpTheme.chipFill))
                }

                HStack(spacing: 7) {
                    Image(systemName: "chart.bar.xaxis")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundStyle(rslAccent)
                    Text("اضغط لفتح مركز المباراة والتحليل")
                        .font(SportsFonts.app(size: 11.5, weight: .bold))
                        .foregroundStyle(SpTheme.onDarkDim)
                    Spacer(minLength: 0)
                    Image(systemName: "chevron.left")
                        .font(.system(size: 10, weight: .bold))
                        .foregroundStyle(SpTheme.onDarkFaint)
                }
                .padding(.top, 1)
            }
            .padding(16)
            .background(heroBackground)
            .contentShape(RoundedRectangle(cornerRadius: 26, style: .continuous))
        }
        .buttonStyle(SpPressStyle())
    }

    private func heroStoryLine(_ f: SpFixture) -> String? {
        if f.status.finished, let home = f.goals.home, let away = f.goals.away {
            let margin = abs(home - away)
            if home == away {
                return "تعادل مثير في آخر ظهور لفريقك"
            }
            let visualWinner = away > home ? f.away.name : f.home.name
            return margin >= 3 ? "\(visualWinner) حسمها بفارق \(margin)" : "\(visualWinner) انتصر بفارق \(margin)"
        }
        if f.status.live {
            return "مباراة فريقك مباشرة الآن — التحديث لحظة بلحظة"
        }
        return "\(SpFormat.kickoffDay(f.date)) · \(SpFormat.kickoffTime(f.date))"
    }

    private func heroTeam(_ team: SpTeam) -> some View {
        VStack(spacing: 9) {
            SpTeamLogo(logo: team.logo, size: 56)
            Text(team.name)
                .font(SportsFonts.app(size: 13, weight: .bold))
                .foregroundStyle(SpTheme.onDark)
                .lineLimit(1).minimumScaleFactor(0.75)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
    }

    @ViewBuilder private func heroScore(_ f: SpFixture) -> some View {
        VStack(spacing: 4) {
            if f.started {
                Text("\(f.goals.away ?? 0) - \(f.goals.home ?? 0)")
                    .font(SportsFonts.app(size: 36, weight: .heavy))
                    .foregroundStyle(SpTheme.onDarkStrong).monospacedDigit()
                    .environment(\.layoutDirection, .leftToRight)
                Text(f.status.finished ? "انتهت" : "مباشر")
                    .font(SportsFonts.app(size: 10, weight: .semibold))
                    .foregroundStyle(SpTheme.onDarkFaint)
            } else {
                Text(SpFormat.kickoffTime(f.date))
                    .font(SportsFonts.app(size: 30, weight: .heavy))
                    .foregroundStyle(SpTheme.onDarkStrong)
                    .environment(\.layoutDirection, .leftToRight)
                Text(SpFormat.kickoffDay(f.date))
                    .font(SportsFonts.app(size: 10, weight: .semibold))
                    .foregroundStyle(SpTheme.onDarkDim)
                    .lineLimit(1).minimumScaleFactor(0.7)
            }
        }
        .frame(minWidth: 86)
    }

    @ViewBuilder private func heroStatusBadge(_ f: SpFixture) -> some View {
        if f.status.live {
            HStack(spacing: 6) {
                Circle().fill(.white).frame(width: 6, height: 6)
                Text("مباشر \(liveMinute(f))")
                    .environment(\.layoutDirection, .leftToRight)
            }
            .font(SportsFonts.app(size: 11, weight: .bold))
            .foregroundStyle(.white)
            .padding(.horizontal, 9).padding(.vertical, 5)
            .background(Capsule().fill(SpTheme.crimson))
        } else if f.status.finished {
            Text("انتهت").font(SportsFonts.app(size: 11, weight: .bold))
                .foregroundStyle(SpTheme.onDarkDim)
                .padding(.horizontal, 9).padding(.vertical, 5)
                .background(Capsule().fill(SpTheme.chipFill))
        } else {
            Text("قادمة").font(SportsFonts.app(size: 11, weight: .bold))
                .foregroundStyle(rslAccent)
                .padding(.horizontal, 9).padding(.vertical, 5)
                .background(Capsule().fill(rslAccent.opacity(0.10)))
        }
    }

    private var heroBackground: some View {
        let shape = RoundedRectangle(cornerRadius: 26, style: .continuous)
        return shape
            .fill(SpTheme.card)
            .overlay(shape.stroke(SpTheme.cardStroke, lineWidth: 1))
            .shadow(color: SpTheme.cardShadow, radius: 14, x: 0, y: 6)
    }

    // إحصائيات الهيرو (أفضل جهد): استحواذ + تسديدات (من تفاصيل المباراة) + xG.
    private func heroStats(_ f: SpFixture) -> [(String, String)] {
        guard f.started else { return [] }
        var out: [(String, String)] = []
        if let p = findStat(["possession", "استحواذ"]) { out.append(("استحواذ", p)) }
        if let s = findStat(["total shots", "shots total", "إجمالي التسديدات", "تسديد"]) { out.append(("تسديدات", s)) }
        if let xg = featuredXg, xg.available {
            out.append(("xG", String(format: "%.1f · %.1f", xg.home.xg, xg.away.xg)))
        }
        return Array(out.prefix(3))
    }

    private func heroInsightItems(_ f: SpFixture) -> [(String, String, String)] {
        var out: [(String, String, String)] = []
        if let pressure = featuredPressure, pressure.available, let latest = pressure.latest {
            out.append(("gauge.with.dots.needle.bottom.50percent", "الضغط", "\(pressureSideName(latest.side, fixture: f)) \(Int(latest.value.rounded()))"))
        }
        if let momentum = featuredMomentum, momentum.available, let possession = momentum.possession {
            out.append(("waveform.path.ecg", "الاستحواذ", "\(possession.home)% · \(possession.away)%"))
        }
        if let facts = featuredFacts, facts.available, let weather = facts.weather, let temp = weather.temp {
            out.append(("cloud.sun", "الطقس", "\(temp)°"))
        }
        if let facts = featuredFacts, facts.available, !facts.absentees.isEmpty {
            out.append(("cross.case", "الغيابات", "\(facts.absentees.count)"))
        }
        if let player = featuredXg?.topPlayers.first {
            out.append(("scope", "الأخطر", player.name))
        }
        return Array(out.prefix(3))
    }

    /// آخر مجرى بارز من التعليق الحي: أحدث حدث مهم/هدف ضمن آخر العناصر، وإلا الأحدث مطلقًا.
    private var latestCommentLine: String? {
        guard let items = featuredCommentary?.items, !items.isEmpty else { return nil }
        let sorted = items.sorted { ($0.order, $0.minute) > ($1.order, $1.minute) }
        let pick = sorted.prefix(6).first(where: { $0.important || $0.goal }) ?? sorted.first
        guard let c = pick, !c.textAr.isEmpty else { return nil }
        let minute = c.extraMinute.flatMap { $0 > 0 ? "\(c.minute)+\($0)′" : nil } ?? "\(c.minute)′"
        return "\(minute) · \(c.textAr)"
    }

    private func pressureSideName(_ side: String, fixture: SpFixture) -> String {
        switch side.lowercased() {
        case "home": return fixture.home.name
        case "away": return fixture.away.name
        default: return "متوازن"
        }
    }

    private func heroInsightChip(icon: String, title: String, value: String) -> some View {
        HStack(spacing: 7) {
            Image(systemName: icon)
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(rslAccent)
            VStack(alignment: .leading, spacing: 1) {
                Text(title)
                    .font(SportsFonts.app(size: 9, weight: .bold))
                    .foregroundStyle(SpTheme.onDarkDim)
                Text(value)
                    .font(SportsFonts.app(size: 10.5, weight: .heavy))
                    .foregroundStyle(SpTheme.onDark)
                    .lineLimit(1)
                    .minimumScaleFactor(0.65)
            }
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, minHeight: 42, alignment: .leading)
        .padding(.horizontal, 10)
        .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(rslAccent.opacity(0.055)))
        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(rslAccent.opacity(0.16), lineWidth: 1))
    }

    private func findStat(_ keys: [String]) -> String? {
        guard let rows = featuredDetail?.statistics?.rows else { return nil }
        let row = rows.first { r in
            keys.contains { k in r.type.localizedCaseInsensitiveContains(k) || r.label.localizedCaseInsensitiveContains(k) }
        }
        guard let row, let h = row.home?.text, let a = row.away?.text, h != "—" || a != "—" else { return nil }
        return "\(h) · \(a)"
    }

    private func liveMinute(_ f: SpFixture) -> String {
        guard let e = f.status.elapsed else { return f.status.label }
        if let extra = f.status.extra, extra > 0 { return "\(e)+\(extra)'" }
        return "\(e)'"
    }

    // MARK: - لوحة دوري روشن (تدفّق واحد غنيّ بالأرقام — هادئ، أبيض + أخضر)

    private var favoriteTeamId: Int? { favorites.team?.id }
    private var favoriteTeamName: String? { favorites.team?.name }

    private var displayResults: [SpFixture] {
        let rows = matches?.results ?? []
        guard let favId = favoriteTeamId else { return Array(rows.prefix(4)) }
        return Array(rows.filter { $0.home.id == favId || $0.away.id == favId }.prefix(4))
    }

    private var favoriteStandingRows: [SpStandingRow] {
        guard let favId = favoriteTeamId,
              let idx = standings.firstIndex(where: { $0.team.id == favId }) else {
            return Array(standings.prefix(3))
        }
        let start = max(0, idx - 1)
        let end = min(standings.count, idx + 2)
        return Array(standings[start..<end])
    }

    private var hasDisplayScorers: Bool {
        !displayScorers(for: .goals).isEmpty || !displayScorers(for: .assists).isEmpty
    }

    private func displayScorers(for mode: ScorerMode) -> [SpScorer] {
        let rows = mode == .goals ? scorers : assists
        guard let favId = favoriteTeamId else { return Array(rows.prefix(3)) }
        return Array(rows.filter { $0.team.id == favId }.prefix(3))
    }

    @ViewBuilder private var dashboardContent: some View {
        // فراغ واضح بين بطاقات روشن بدون فصل بصري زائد.
        // (بطاقة «فريقي المفضّل» المصغّرة حُذفت — بلوك «فريقي» أعلى الواجهة يغنيها.)
        VStack(spacing: 28) {
            if !standings.isEmpty || !scorers.isEmpty { leaguePulse }
            if !(matches?.upcoming.isEmpty ?? true) || !(matches?.today.isEmpty ?? true) {
                gameweekStrip
            }
            // تسلسل مبارياتي متماسك: القادمة/اليوم → آخر النتائج → الترتيب (قرار 2026-07-04).
            if !displayResults.isEmpty { recentResultsCard.padding(.horizontal, 16) }
            if !standings.isEmpty { titleRaceCard.padding(.horizontal, 16) }
            if hasDisplayScorers { scorersAssistsCard.padding(.horizontal, 16) }
            if !standings.isEmpty { statSpotlight.padding(.horizontal, 16) }
            if !transfers.isEmpty { transfersCard.padding(.horizontal, 16) }
        }
    }

    // الصفحات الكاملة (تُدفع من روابط «الكل»).
    private var fullStandingsPage: some View {
        ScrollView { standingsContent.padding(16) }
            .background(SpAmbientBackground())
            .navigationTitle("ترتيب دوري روشن")
            .navigationBarTitleDisplayMode(.inline)
    }

    private var fullScorersPage: some View {
        ScrollView { scorersContent.padding(16) }
            .background(SpAmbientBackground())
            .navigationTitle("هدّافو دوري روشن")
            .navigationBarTitleDisplayMode(.inline)
    }

    // MARK: - نبض الدوري (ملخص موجّه + مؤشرات سريعة)

    @ViewBuilder private var leaguePulse: some View {
        let leader = standings.first
        let favoriteRow = favoriteTeamId.flatMap { favId in standings.first(where: { $0.team.id == favId }) }
        let topScorer = favoriteTeamId.flatMap { favId in scorers.first(where: { $0.team.id == favId }) } ?? scorers.first
        let bestAtk = standings.max { $0.goalsFor < $1.goalsFor }
        let bestDef = standings.min { $0.goalsAgainst < $1.goalsAgainst }
        let gap: Int? = standings.count >= 2 ? standings[0].points - standings[1].points : nil

        VStack(alignment: .leading, spacing: 11) {
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    sectionTitle(favoriteTeamName.map { "نبض \($0)" } ?? "نبض الدوري")
                    Spacer()
                    if let row = favoriteRow {
                        Text("المركز \(row.rank)")
                            .font(SportsFonts.app(size: 11, weight: .bold))
                            .foregroundStyle(rslAccent)
                            .padding(.horizontal, 9)
                            .padding(.vertical, 4)
                            .background(Capsule().fill(rslAccent.opacity(0.10)))
                    } else if let g = gap {
                        Text(g == 0 ? "صدارة مشتعلة" : "الفارق \(g) نقطة")
                            .font(SportsFonts.app(size: 11, weight: .bold))
                            .foregroundStyle(rslAccent)
                            .padding(.horizontal, 9)
                            .padding(.vertical, 4)
                            .background(Capsule().fill(rslAccent.opacity(0.10)))
                        }
                }
                Text(favoriteRow.map { favoritePulseSummary(row: $0, topScorer: topScorer) } ?? leaguePulseSummary(leader: leader, topScorer: topScorer, gap: gap))
                    .font(SportsFonts.app(size: 12, weight: .semibold))
                    .foregroundStyle(SpTheme.onDarkDim)
                    .lineLimit(2)
            }
            .padding(.horizontal, 16)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 0) {
                    ForEach(Array(pulseTiles(favoriteRow: favoriteRow, leader: leader, topScorer: topScorer, bestAtk: bestAtk, bestDef: bestDef, gap: gap).enumerated()), id: \.offset) { idx, t in
                        if idx > 0 {
                            Rectangle().fill(SpTheme.outline).frame(width: 1, height: 38)
                        }
                        pulseTile(t.label, t.value, t.sub, logo: t.logo)
                    }
                }
                .background(RoundedRectangle(cornerRadius: SpTheme.tileRadius, style: .continuous).fill(SpTheme.card))
                .padding(.horizontal, 16)
            }
        }
    }

    private typealias PulseTile = (label: String, value: String, sub: String, logo: String?)

    private func pulseTiles(favoriteRow: SpStandingRow?, leader: SpStandingRow?, topScorer: SpScorer?, bestAtk: SpStandingRow?, bestDef: SpStandingRow?, gap: Int?) -> [PulseTile] {
        var tiles: [PulseTile] = []
        if let row = favoriteRow {
            tiles.append(("المركز", "\(row.rank)", "\(row.points) نقطة", row.team.logo))
            tiles.append(("لعب", "\(row.played)", "\(row.win) فوز", nil))
            tiles.append(("سجّل", "\(row.goalsFor)", "هدف", nil))
            tiles.append(("استقبل", "\(row.goalsAgainst)", "هدف", nil))
            if let s = topScorer, s.team.id == row.team.id {
                tiles.append(("هداف الفريق", s.name, "\(s.goals) هدف", s.team.logo))
            }
            return tiles
        }
        if let l = leader { tiles.append(("المتصدّر", l.team.name, "\(l.points) نقطة", l.team.logo)) }
        if let s = topScorer { tiles.append(("الهدّاف", s.name, "\(s.goals) هدف", s.team.logo)) }
        if let a = bestAtk { tiles.append(("أقوى هجوم", a.team.name, "\(a.goalsFor) هدف", a.team.logo)) }
        if let d = bestDef { tiles.append(("أمنع دفاع", d.team.name, "\(d.goalsAgainst) عليه", d.team.logo)) }
        if let g = gap { tiles.append(("فارق الصدارة", g == 0 ? "متساويان" : "\(g) نقطة", "على الوصيف", nil)) }
        return tiles
    }

    private func leaguePulseSummary(leader: SpStandingRow?, topScorer: SpScorer?, gap: Int?) -> String {
        var parts: [String] = []
        if let leader {
            let lead = (gap ?? 0) == 0 ? "يتقاسم الصدارة" : "يتصدر بفارق \(gap ?? 0)"
            parts.append("\(leader.team.name) \(lead)")
        }
        if let topScorer {
            parts.append("\(topScorer.name) يقود سباق الهدافين")
        }
        return parts.isEmpty ? "أهم مؤشرات الدوري في لقطة واحدة." : parts.joined(separator: " · ")
    }

    private func favoritePulseSummary(row: SpStandingRow, topScorer: SpScorer?) -> String {
        var parts = ["\(row.team.name) في المركز \(row.rank) بـ\(row.points) نقطة"]
        parts.append("سجّل \(row.goalsFor) واستقبل \(row.goalsAgainst)")
        if let s = topScorer, s.team.id == row.team.id {
            parts.append("هدافه \(s.name) بـ\(s.goals) هدف")
        }
        return parts.joined(separator: " · ")
    }

    private func pulseTile(_ label: String, _ value: String, _ sub: String, logo: String?) -> some View {
        // «الهدّاف» و«المتصدّر» بلغة التميّز الذهبية المحدودة.
        let highlight = (label == "الهدّاف" || label == "المتصدّر") ? SpTheme.excellence : rslAccent
        return VStack(alignment: .leading, spacing: 5) {
            Text(label).font(SportsFonts.app(size: 9.5, weight: .bold)).foregroundStyle(SpTheme.onDarkDim)
            HStack(spacing: 6) {
                if let logo, !logo.isEmpty { SpTeamLogo(logo: logo, size: 17) }
                Text(value).font(SportsFonts.app(size: 12.5, weight: .heavy)).foregroundStyle(SpTheme.onDark)
                    .lineLimit(1).minimumScaleFactor(0.65)
            }
            Text(sub).font(SportsFonts.app(size: 10, weight: .bold)).foregroundStyle(highlight)
                .lineLimit(1).minimumScaleFactor(0.7)
        }
        .frame(width: 112, alignment: .leading)
        .padding(.horizontal, 13).padding(.vertical, 11)
    }

    // جولة هذا الأسبوع — تمرير أفقي للمباريات القادمة/اليوم.
    private var gameweekStrip: some View {
        let items = Array(((matches?.today ?? []) + (matches?.upcoming ?? [])).prefix(8))
        return VStack(alignment: .leading, spacing: 11) {
            sectionTitle("جولة هذا الأسبوع").padding(.horizontal, 16)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 12) {
                    ForEach(items) { f in gameweekCard(f) }
                }
                .padding(.horizontal, 16)
            }
        }
    }

    private func gameweekCard(_ f: SpFixture) -> some View {
        Button { selectedMatch = f } label: {
            VStack(spacing: 0) {
                HStack {
                    Text(SpFormat.kickoffDay(f.date))
                        .font(SportsFonts.app(size: 11, weight: .bold)).foregroundStyle(rslAccent)
                        .lineLimit(1).minimumScaleFactor(0.7)
                        .padding(.horizontal, 8).padding(.vertical, 3)
                        .background(Capsule().fill(rslAccent.opacity(0.1)))
                    Spacer(minLength: 6)
                    Text(SpFormat.kickoffTime(f.date))
                        .font(SportsFonts.app(size: 12, weight: .bold)).foregroundStyle(SpTheme.onDarkDim)
                        .environment(\.layoutDirection, .leftToRight)
                }
                .padding(.bottom, 11)
                gwTeamLine(f.home)
                Rectangle().fill(SpTheme.outline).frame(height: 1).padding(.vertical, 4)
                gwTeamLine(f.away)
            }
            .padding(13)
            .frame(width: 212)
            .background(RoundedRectangle(cornerRadius: 18, style: .continuous).fill(SpTheme.card))
            .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(SpTheme.cardStroke, lineWidth: 1))
            .shadow(color: SpTheme.cardShadow, radius: 8, x: 0, y: 4)
        }
        .buttonStyle(SpPressStyle())
    }

    private func gwTeamLine(_ team: SpTeam) -> some View {
        HStack(spacing: 9) {
            SpTeamLogo(logo: team.logo, size: 28)
            Text(team.name).font(SportsFonts.app(size: 13.5, weight: .semibold)).foregroundStyle(SpTheme.onDark)
                .lineLimit(1).minimumScaleFactor(0.8)
            Spacer(minLength: 0)
        }
    }

    // سباق اللقب — حول الفريق المفضّل عند اختياره، وإلا أعلى 3.
    private var titleRaceCard: some View {
        let rows = favoriteStandingRows
        let leader = standings.first
        let favId = favoriteTeamId
        return VStack(alignment: .leading, spacing: 11) {
            HStack {
                sectionTitle(favoriteTeamName.map { "ترتيب \($0)" } ?? "سباق اللقب")
                Spacer()
                Button { showAllStandings = true } label: {
                    HStack(spacing: 3) {
                        Text("الترتيب الكامل").font(SportsFonts.app(size: 12, weight: .bold))
                        Image(systemName: "chevron.left").font(.system(size: 10, weight: .bold))
                    }.foregroundStyle(rslAccent)
                }
            }
            VStack(spacing: 0) {
                ForEach(Array(rows.enumerated()), id: \.element.id) { idx, row in
                    let isFavorite = favId == row.team.id
                    if idx > 0 { Rectangle().fill(SpTheme.outline.opacity(0.5)).frame(height: 1) }
                    Button { selectedTeam = IDBox(id: row.team.id) } label: {
                        HStack(spacing: 9) {
                            Text("\(row.rank)").font(SportsFonts.app(size: 13, weight: .heavy))
                                .foregroundStyle(zoneColor(row.rank)).frame(width: 16).monospacedDigit()
                            SpTeamLogo(logo: row.team.logo, size: 28)
                            VStack(alignment: .leading, spacing: 5) {
                                Text(row.team.name).font(SportsFonts.app(size: 13.5, weight: .bold)).foregroundStyle(SpTheme.onDark).lineLimit(1)
                                HStack(spacing: 7) {
                                    titleRaceProgress(row, leaderPoints: leader?.points ?? row.points)
                                    formDots(row.form)
                                }
                            }
                            Spacer(minLength: 6)
                            VStack(alignment: .trailing, spacing: 2) {
                                (Text("\(row.points)").font(SportsFonts.app(size: 15.5, weight: .heavy))
                                    + Text(" نقطة").font(SportsFonts.app(size: 9.5, weight: .semibold)).foregroundStyle(SpTheme.onDarkDim))
                                    .foregroundStyle(SpTheme.onDark).monospacedDigit()
                                Text(titleRaceGap(row, leader: leader))
                                    .font(SportsFonts.app(size: 9.5, weight: .bold))
                                    .foregroundStyle(isFavorite ? rslAccent : row.rank == 1 ? rslAccent : SpTheme.onDarkFaint)
                                    .lineLimit(1)
                            }
                        }
                        .padding(.vertical, 8)
                        .background {
                            if isFavorite {
                                RoundedRectangle(cornerRadius: 13, style: .continuous)
                                    .fill(rslAccent.opacity(0.055))
                            }
                        }
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(SpPressStyle())
                }
            }
            .padding(.horizontal, 15)
            .background(RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous).fill(SpTheme.card))
            .overlay(RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous).stroke(SpTheme.cardStroke, lineWidth: 1))
            .shadow(color: SpTheme.cardShadow, radius: 10, x: 0, y: 6)
        }
    }

    private func titleRaceGap(_ row: SpStandingRow, leader: SpStandingRow?) -> String {
        guard let leader else { return "" }
        let gap = leader.points - row.points
        if row.rank == 1 { return "المتصدر" }
        return gap == 0 ? "متساوٍ" : "-\(gap)"
    }

    private func titleRaceProgress(_ row: SpStandingRow, leaderPoints: Int) -> some View {
        let pct = leaderPoints > 0 ? min(1, max(0.08, CGFloat(row.points) / CGFloat(leaderPoints))) : 0.08
        let isLeader = row.rank == 1
        return GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule().fill(SpTheme.chipFill)
                Capsule()
                    .fill(isLeader
                          ? LinearGradient(colors: [rslAccent, SpTheme.emeraldDeep],
                                           startPoint: .leading, endPoint: .trailing)
                          : LinearGradient(colors: [rslAccent.opacity(0.55), rslAccent.opacity(0.45)],
                                           startPoint: .leading, endPoint: .trailing))
                    .frame(width: geo.size.width * pct)
            }
        }
        .frame(height: 8)
    }

    // نقاط الفورمة (آخر 5): فوز أخضر، تعادل رمادي ممتلئ، خسارة حلقة رمادية. لونان فقط.
    @ViewBuilder private func formDots(_ form: String?) -> some View {
        let chars = Array((form ?? "").replacingOccurrences(of: " ", with: "").suffix(5))
        if chars.isEmpty {
            Text("—").font(SportsFonts.app(size: 11, weight: .semibold)).foregroundStyle(SpTheme.onDarkFaint)
        } else {
            HStack(spacing: 4) {
                ForEach(Array(chars.enumerated()), id: \.offset) { _, c in
                    Group {
                        switch c {
                        case "W", "w": Circle().fill(rslAccent)
                        case "L", "l": Circle().stroke(SpTheme.onDarkFaint, lineWidth: 1.3)
                        default: Circle().fill(SpTheme.onDarkFaint.opacity(0.5))
                        }
                    }
                    .frame(width: 8, height: 8)
                }
            }
        }
    }

    // الهدّافون والصنّاع — مبدّل داخلي. الرقم الأساسي أخضر، الثانوي رمادي.
    private var scorersAssistsCard: some View {
        let rows = displayScorers(for: scorerMode)
        return VStack(alignment: .leading, spacing: 11) {
            HStack {
                let fav = favoriteTeamName
                sectionTitle(scorerMode == .goals
                             ? (fav.map { "هدّافو \($0)" } ?? "الهدّافون")
                             : (fav.map { "صنّاع \($0)" } ?? "صنّاع الأهداف"))
                Spacer()
                Button { showAllScorers = true } label: {
                    HStack(spacing: 3) {
                        Text("الكل").font(SportsFonts.app(size: 12, weight: .bold))
                        Image(systemName: "chevron.left").font(.system(size: 10, weight: .bold))
                    }.foregroundStyle(rslAccent)
                }
            }
            if !assists.isEmpty {
                HStack(spacing: 4) {
                    scorerModeButton("هدّافون", .goals)
                    scorerModeButton("صنّاع", .assists)
                }
                .padding(4)
                .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(SpTheme.chipFill))
            }
            VStack(spacing: 0) {
                ForEach(Array(rows.prefix(3).enumerated()), id: \.element.id) { idx, s in
                    if idx > 0 { Rectangle().fill(SpTheme.outline.opacity(0.5)).frame(height: 1) }
                    scorerRow(s, compact: true)
                }
            }
            .background(RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous).fill(SpTheme.card))
            .overlay(RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous).stroke(SpTheme.cardStroke, lineWidth: 1))
            .shadow(color: SpTheme.cardShadow, radius: 10, x: 0, y: 6)
        }
    }

    private func scorerModeButton(_ label: String, _ mode: ScorerMode) -> some View {
        let active = scorerMode == mode
        return Button { withAnimation(.easeOut(duration: 0.2)) { scorerMode = mode } } label: {
            Text(label)
                .font(SportsFonts.app(size: 12.5, weight: active ? .heavy : .semibold))
                .foregroundStyle(active ? SpTheme.onDarkStrong : SpTheme.onDarkDim)
                .frame(maxWidth: .infinity).padding(.vertical, 7)
                .background {
                    if active {
                        RoundedRectangle(cornerRadius: 9, style: .continuous).fill(SpTheme.surface)
                            .shadow(color: SpTheme.cardShadow, radius: 3, x: 0, y: 1)
                    }
                }
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    // الأرقام اللافتة — مشتقّة من الترتيب (هجوم/دفاع/انتصارات) + أكثر تهديفًا.
    @ViewBuilder private var statSpotlight: some View {
        let topAtk = standings.max { $0.goalsFor < $1.goalsFor }
        let bestDef = standings.min { $0.goalsAgainst < $1.goalsAgainst }
        let mostWin = standings.max { $0.win < $1.win }
        let attacks = Array(standings.sorted { $0.goalsFor > $1.goalsFor }.prefix(4))
        let maxAtk = max(1, attacks.first?.goalsFor ?? 1)

        VStack(alignment: .leading, spacing: 11) {
            sectionTitle("أبرز الأرقام")
            HStack(spacing: 8) {
                if let t = topAtk { statTile("أكثر تهديفًا", t.team.name, "\(t.goalsFor) هدفًا", rslAccent) }
                if let d = bestDef { statTile("أمتن دفاع", d.team.name, "\(d.goalsAgainst) عليه", rslAccent) }
                if let w = mostWin { statTile("أكثر فوزًا", w.team.name, "\(w.win) فوزًا", rslAccent) }
            }
            VStack(alignment: .leading, spacing: 8) {
                Text("الأكثر تهديفًا في الدوري")
                    .font(SportsFonts.app(size: 11, weight: .bold)).foregroundStyle(SpTheme.onDarkDim)
                ForEach(attacks) { row in
                    HStack(spacing: 9) {
                        SpTeamLogo(logo: row.team.logo, size: 22)
                        Text(row.team.name).font(SportsFonts.app(size: 12, weight: .semibold)).foregroundStyle(SpTheme.onDark)
                            .frame(width: 58, alignment: .leading).lineLimit(1).minimumScaleFactor(0.8)
                        GeometryReader { geo in
                            ZStack(alignment: .leading) {
                                Capsule().fill(SpTheme.chipFill).frame(height: 7)
                                Capsule().fill(LinearGradient(colors: [rslAccent, rslAccent], startPoint: .leading, endPoint: .trailing))
                                    .frame(width: geo.size.width * CGFloat(row.goalsFor) / CGFloat(maxAtk), height: 7)
                            }
                        }.frame(height: 7)
                        Text("\(row.goalsFor)").font(SportsFonts.app(size: 13, weight: .heavy)).foregroundStyle(SpTheme.onDark)
                            .frame(width: 24, alignment: .trailing).monospacedDigit()
                    }
                }
            }
            .padding(13)
            .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(SpTheme.card))
            .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(SpTheme.cardStroke, lineWidth: 1))
        }
    }

    // آخر النتائج — قائمة مدمجة لآخر المباريات المنتهية (تفتح مركز المباراة).
    private var recentResultsCard: some View {
        let results = displayResults
        return VStack(alignment: .leading, spacing: 11) {
            sectionTitle(favoriteTeamName.map { "آخر نتائج \($0)" } ?? "آخر النتائج")
            VStack(spacing: 0) {
                ForEach(Array(results.enumerated()), id: \.element.id) { idx, f in
                    if idx > 0 { Rectangle().fill(SpTheme.outline.opacity(0.5)).frame(height: 1) }
                    Button { selectedMatch = f } label: { resultRow(f) }.buttonStyle(SpPressStyle())
                }
            }
            .background(RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous).fill(SpTheme.card))
            .overlay(RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous).stroke(SpTheme.cardStroke, lineWidth: 1))
            .shadow(color: SpTheme.cardShadow, radius: 10, x: 0, y: 6)
        }
    }

    private func resultRow(_ f: SpFixture) -> some View {
        HStack(spacing: 10) {
            HStack(spacing: 7) {
                Text(f.home.name).font(SportsFonts.app(size: 14, weight: .bold)).foregroundStyle(SpTheme.onDark)
                    .lineLimit(1).minimumScaleFactor(0.85).frame(maxWidth: .infinity, alignment: .trailing)
                SpTeamLogo(logo: f.home.logo, size: 26)
            }
            Text("\(f.goals.away ?? 0) - \(f.goals.home ?? 0)")
                .font(SportsFonts.app(size: 15, weight: .heavy)).foregroundStyle(SpTheme.onDark)
                .monospacedDigit().environment(\.layoutDirection, .leftToRight).frame(width: 52)
            HStack(spacing: 7) {
                SpTeamLogo(logo: f.away.logo, size: 26)
                Text(f.away.name).font(SportsFonts.app(size: 14, weight: .bold)).foregroundStyle(SpTheme.onDark)
                    .lineLimit(1).minimumScaleFactor(0.85).frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .padding(.horizontal, 14).padding(.vertical, 11)
        .contentShape(Rectangle())
    }


    // مركز الانتقالات — أعلى الصفقات معاينةً + مدخل للمركز الكامل (سعودي/عالمي،
    // مؤكّد/إشاعات موثّقة المصدر). النقر على صفقة يفتح ناديها؛ «المركز الكامل» يفتح الشاشة.
    private var transfersCard: some View {
        VStack(alignment: .leading, spacing: 11) {
            Button { showTransferCenter = true } label: {
                HStack(spacing: 8) {
                    Text("مركز الانتقالات").font(SportsFonts.app(size: 16, weight: .heavy)).foregroundStyle(SpTheme.onDark)
                    Spacer(minLength: 0)
                    Text("المركز الكامل").font(SportsFonts.app(size: 12, weight: .bold)).foregroundStyle(SpTheme.green)
                    Image(systemName: "chevron.left").font(.system(size: 11, weight: .bold)).foregroundStyle(SpTheme.green)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(SpPressStyle())
            VStack(spacing: 0) {
                ForEach(Array(transfers.prefix(3).enumerated()), id: \.element.id) { idx, t in
                    if idx > 0 { Rectangle().fill(SpTheme.outline.opacity(0.5)).frame(height: 1) }
                    transferRow(t)
                }
            }
            .background(RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous).fill(SpTheme.card))
            .overlay(RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous).stroke(SpTheme.cardStroke, lineWidth: 1))
            .shadow(color: SpTheme.cardShadow, radius: 10, x: 0, y: 6)
        }
    }

    // صفّ انتقال روشن — مطابق لنمط TcConfirmedRow في مركز الانتقالات: شارة
    // «مؤكّدة» + chips الأندية (من ← إلى) + وسم نوع الصفقة (إعارة/انتقال حر).
    // النقر يفتح صفحة النادي الوجهة. المبلغ غير متاح هنا (نموذج iOS بلا feeValue).
    private func transferRow(_ t: SpLeagueTransfer) -> some View {
        let toRoshn = t.inClubId != nil
        let dest = toRoshn ? t.to : t.from
        return Button { selectedTeam = IDBox(id: dest.id) } label: {
            HStack(spacing: 11) {
                playerAvatar(photo: playerPhotoURL(t.player.id), teamLogo: dest.logo, size: 38)
                VStack(alignment: .leading, spacing: 3) {
                    Text(t.player.name).font(SportsFonts.app(size: 14, weight: .bold))
                        .foregroundStyle(SpTheme.onDark).lineLimit(1)
                    HStack(spacing: 6) {
                        TcPartyChip(party: TcParty(from: t.from))
                        Image(systemName: "arrow.left").font(.system(size: 10, weight: .bold))
                            .foregroundStyle(SpTheme.onDarkFaint)
                        TcPartyChip(party: TcParty(from: t.to), emphasize: true)
                    }
                }
                Spacer(minLength: 0)
                VStack(alignment: .trailing, spacing: 4) {
                    TcCertaintyTag(confirmed: true)
                    if t.kind == "loan" {
                        Text("إعارة").font(SportsFonts.app(size: 10, weight: .bold)).foregroundStyle(SpTheme.teal)
                    } else if t.kind == "free" {
                        Text("انتقال حر").font(SportsFonts.app(size: 10, weight: .bold))
                            .foregroundStyle(SpTheme.dyn(Color(red: 0.05, green: 0.55, blue: 0.35), Color(red: 0.30, green: 0.80, blue: 0.55)))
                    }
                }
            }
            .padding(.horizontal, 13).padding(.vertical, 11)
            .frame(maxWidth: .infinity, alignment: .leading)
            .contentShape(Rectangle())
        }
        .buttonStyle(SpPressStyle())
    }

    private func statTile(_ label: String, _ value: String, _ sub: String, _ accent: Color) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(label).font(SportsFonts.app(size: 9.5, weight: .bold)).foregroundStyle(SpTheme.onDarkDim)
            Text(value).font(SportsFonts.app(size: 13, weight: .heavy)).foregroundStyle(SpTheme.onDark).lineLimit(1).minimumScaleFactor(0.65)
            Text(sub).font(SportsFonts.app(size: 10.5, weight: .bold)).foregroundStyle(accent).lineLimit(1).minimumScaleFactor(0.7)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 11).padding(.vertical, 10)
        .background(RoundedRectangle(cornerRadius: 13, style: .continuous).fill(SpTheme.card))
        .overlay(RoundedRectangle(cornerRadius: 13, style: .continuous).stroke(SpTheme.cardStroke, lineWidth: 1))
    }

    private func sectionTitle(_ t: String) -> some View {
        Text(t).font(SportsFonts.app(size: 16, weight: .heavy)).foregroundStyle(SpTheme.onDark)
    }

    // صورة اللاعب الشخصية الدائرية (مكاشّفة لتجنّب وميض AsyncImage في الرئيسية) + شارة فريق صغيرة.
    private func playerAvatar(photo: String, teamLogo: String, size: CGFloat = 40) -> some View {
        SpAvatarImage(
            url: photo, size: size,
            ring: SpTheme.cardStroke,
            placeholderFg: SpTheme.onDarkFaint,
            placeholderBg: SpTheme.chipFill
        )
        .overlay(alignment: .bottomTrailing) {
            SpTeamLogo(logo: teamLogo, size: size * 0.46).offset(x: 2, y: 2)
        }
    }

    // رابط صورة اللاعب من API-Football (لانتقالات لا يرسل الخادم صورتها — نبنيها من المعرّف).
    private func playerPhotoURL(_ id: Int) -> String {
        "https://media.api-sports.io/football/players/\(id).png"
    }

    // MARK: - المباريات


    // MARK: - الترتيب

    @ViewBuilder private var standingsContent: some View {
        if standings.isEmpty {
            SpEmptyState(icon: "list.number", title: "لا يتوفّر ترتيب", subtitle: "قد يكون الموسم لم يبدأ بعد")
        } else {
            VStack(alignment: .leading, spacing: 12) {
                VStack(spacing: 0) {
                    HStack(spacing: 0) {
                        Text("#").font(SportsFonts.app(size: 10, weight: .bold)).foregroundStyle(SpTheme.onDarkFaint).frame(width: 26)
                        Text("النادي").font(SportsFonts.app(size: 10, weight: .bold)).foregroundStyle(SpTheme.onDarkFaint).frame(maxWidth: .infinity, alignment: .leading)
                        Text("لعب").font(SportsFonts.app(size: 10, weight: .bold)).foregroundStyle(SpTheme.onDarkFaint).frame(width: 36)
                        Text("+/-").font(SportsFonts.app(size: 10, weight: .bold)).foregroundStyle(SpTheme.onDarkFaint).frame(width: 40)
                        Text("نقاط").font(SportsFonts.app(size: 10, weight: .bold)).foregroundStyle(SpTheme.onDarkFaint).frame(width: 40)
                    }
                    .padding(.horizontal, 14).padding(.vertical, 10)
                    Rectangle().fill(SpTheme.outline).frame(height: 1)
                    ForEach(Array(standings.enumerated()), id: \.element.id) { idx, row in
                        if idx > 0 { Rectangle().fill(SpTheme.outline.opacity(0.5)).frame(height: 1).padding(.leading, 14) }
                        Button { selectedTeam = IDBox(id: row.team.id) } label: { standingRow(row) }
                            .buttonStyle(.plain)
                    }
                }
                .background(RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous).fill(SpTheme.card))
                .overlay(RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous).stroke(SpTheme.cardStroke, lineWidth: 1))
                .shadow(color: SpTheme.cardShadow, radius: 10, x: 0, y: 6)

                HStack(spacing: 14) {
                    legendChip(rslAccent, "أبطال آسيا")
                    legendChip(SpTheme.crimson, "الهبوط")
                }
                .padding(.horizontal, 4)
            }
        }
    }

    private func standingRow(_ row: SpStandingRow) -> some View {
        HStack(spacing: 0) {
            Text("\(row.rank)").font(SportsFonts.app(size: 13, weight: .heavy))
                .foregroundStyle(zoneColor(row.rank)).monospacedDigit().frame(width: 26)
            HStack(spacing: 9) {
                SpTeamLogo(logo: row.team.logo, size: 26)
                Text(row.team.name).font(SportsFonts.app(size: 13, weight: .semibold)).foregroundStyle(SpTheme.onDark).lineLimit(1).minimumScaleFactor(0.8)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            Text("\(row.played)").font(SportsFonts.app(size: 13)).foregroundStyle(SpTheme.onDarkDim).monospacedDigit().frame(width: 36)
            Text(row.goalsDiff > 0 ? "+\(row.goalsDiff)" : "\(row.goalsDiff)").font(SportsFonts.app(size: 13)).foregroundStyle(SpTheme.onDarkDim).monospacedDigit().frame(width: 40).environment(\.layoutDirection, .leftToRight)
            Text("\(row.points)").font(SportsFonts.app(size: 15, weight: .heavy)).foregroundStyle(SpTheme.onDark).monospacedDigit().frame(width: 40)
        }
        .padding(.horizontal, 14).padding(.vertical, 10)
        .contentShape(Rectangle())
    }

    private func zoneColor(_ rank: Int) -> Color {
        if rank <= 3 { return rslAccent }
        return SpTheme.onDarkFaint
    }

    private func legendChip(_ c: Color, _ t: String) -> some View {
        HStack(spacing: 5) {
            RoundedRectangle(cornerRadius: 2).fill(c).frame(width: 8, height: 8)
            Text(t).font(SportsFonts.app(size: 11, weight: .semibold)).foregroundStyle(SpTheme.onDarkDim)
        }
    }

    // MARK: - الهدّافون

    @ViewBuilder private var scorersContent: some View {
        let rows = scorerMode == .goals ? scorers : assists
        if rows.isEmpty {
            SpEmptyState(icon: "soccerball", title: "لا تتوفّر بيانات", subtitle: "قد يكون الموسم لم يبدأ بعد")
        } else {
            VStack(spacing: 0) {
                ForEach(Array(rows.enumerated()), id: \.element.id) { idx, s in
                    if idx > 0 { Rectangle().fill(SpTheme.outline.opacity(0.5)).frame(height: 1).padding(.leading, 14) }
                    scorerRow(s)
                }
            }
            .background(RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous).fill(SpTheme.card))
            .overlay(RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous).stroke(SpTheme.cardStroke, lineWidth: 1))
            .shadow(color: SpTheme.cardShadow, radius: 10, x: 0, y: 6)
        }
    }

    // صفّ لاعب — الرقم الأساسي (هدف/صناعة حسب المبدّل) أخضر، الثانوي رمادي. بلا ميداليات.
    private func scorerRow(_ s: SpScorer, compact: Bool = false) -> some View {
        let primary = scorerMode == .goals ? s.goals : s.assists
        let primaryLabel = scorerMode == .goals ? "هدف" : "صناعة"
        let secondary = scorerMode == .goals ? s.assists : s.goals
        let secondaryLabel = scorerMode == .goals ? "صناعة" : "هدف"
        let avatarSize: CGFloat = compact ? 34 : 40
        return Button { selectedPlayer = IDBox(id: s.id) } label: {
            HStack(spacing: compact ? 9 : 11) {
                Text("\(s.rank)").font(SportsFonts.app(size: compact ? 12.5 : 13, weight: .heavy))
                    .foregroundStyle(s.rank <= 3 ? rslAccent : SpTheme.onDarkFaint)
                    .monospacedDigit().frame(width: compact ? 18 : 22)
                playerAvatar(photo: s.photo, teamLogo: s.team.logo, size: avatarSize)
                VStack(alignment: .leading, spacing: compact ? 1 : 2) {
                    Text(s.name).font(SportsFonts.app(size: compact ? 13.5 : 14, weight: .bold)).foregroundStyle(SpTheme.onDark).lineLimit(1)
                    Text(s.team.name).font(SportsFonts.app(size: compact ? 10.5 : 11, weight: .semibold)).foregroundStyle(SpTheme.onDarkDim).lineLimit(1)
                }
                Spacer(minLength: 0)
                VStack(spacing: 1) {
                    Text("\(primary)").font(SportsFonts.app(size: compact ? 16 : 18, weight: .heavy)).foregroundStyle(rslAccent).monospacedDigit()
                    Text(primaryLabel).font(SportsFonts.app(size: compact ? 8.5 : 9)).foregroundStyle(SpTheme.onDarkFaint)
                }
                if secondary > 0 {
                    VStack(spacing: 1) {
                        Text("\(secondary)").font(SportsFonts.app(size: compact ? 13.5 : 15, weight: .bold)).foregroundStyle(SpTheme.onDarkDim).monospacedDigit()
                        Text(secondaryLabel).font(SportsFonts.app(size: compact ? 8.5 : 9)).foregroundStyle(SpTheme.onDarkFaint)
                    }
                    .frame(width: compact ? 36 : 42)
                }
            }
            .padding(.horizontal, 14).padding(.vertical, compact ? 8 : 11)
            .contentShape(Rectangle())
        }
        .buttonStyle(SpPressStyle())
    }

    // MARK: - التحميل (متوازٍ)

    private func loadAll(force: Bool = false) async {
        if !force { loading = true }
        let slug = SportsConstants.defaultComp
        async let compsOpt = try? APIClient.shared.fetchCompetitions(ignoreCache: force)
        async let outlookOpt = try? APIClient.shared.fetchOutlook(comp: slug, ignoreCache: force)
        async let matchesOpt = try? APIClient.shared.fetchMatches(comp: slug, ignoreCache: force)
        async let standingsOpt = try? APIClient.shared.fetchStandings(comp: slug, ignoreCache: force)
        async let scorersOpt = try? APIClient.shared.fetchScorers(comp: slug, ignoreCache: force)
        async let assistsOpt = try? APIClient.shared.fetchAssists(comp: slug, ignoreCache: force)
        async let transfersOpt = try? APIClient.shared.fetchLeagueTransfers(ignoreCache: force)

        // نجمع كل النتائج أولًا (الـawait يُعلّق هنا) ثم نُسنِدها دفعةً واحدة بلا await
        // بينها — فيُجري SwiftUI رسمًا واحدًا. يمنع وميض كتلة «بطل الموسم» قبل وصول
        // المباريات (كان `outlook` يُسنَد قبل `matches` فيظهر الهيرو الاحتياطي لحظيًّا).
        let compsRes = await compsOpt
        let outlookRes = await outlookOpt
        let matchesRes = await matchesOpt
        let standingsRes = await standingsOpt
        let scorersRes = await scorersOpt
        let assistsRes = await assistsOpt
        let transfersRes = await transfersOpt

        self.comp = compsRes?.competitions.first { $0.slug == slug }
        self.outlook = outlookRes?.outlook
        self.matches = matchesRes
        self.standings = standingsRes?.standings ?? []
        self.scorers = scorersRes?.scorers ?? []
        self.assists = assistsRes?.assists ?? []
        self.transfers = transfersRes?.transfers ?? []

        if matches == nil && standings.isEmpty && outlook == nil {
            self.loadError = "تعذّر الاتصال بخادم البيانات"
        } else {
            self.loadError = nil
        }
        self.loading = false

        // تحديث حالة/نتيجة المباريات المتابَعة (بطاقة «مبارياتي») من الخادم.
        await matchFollows.refresh()

        // إثراء الهيرو (أفضل جهد) لمباراة بدأت — إحصائيات + xG + زخم/ضغط/طقس + آخر مجريات.
        if let f = featured, f.started {
            async let detailOpt = try? APIClient.shared.fetchMatchDetail(id: f.id, ignoreCache: force)
            async let xgOpt = try? APIClient.shared.fetchXg(matchId: f.id, ignoreCache: force)
            async let momentumOpt = try? APIClient.shared.fetchMomentum(matchId: f.id, ignoreCache: force)
            async let pressureOpt = try? APIClient.shared.fetchPressure(matchId: f.id, ignoreCache: force)
            async let factsOpt = try? APIClient.shared.fetchMatchFacts(matchId: f.id, ignoreCache: force)
            async let commentaryOpt = try? APIClient.shared.fetchCommentary(matchId: f.id, ignoreCache: force)
            self.featuredDetail = await detailOpt
            self.featuredXg = await xgOpt
            self.featuredMomentum = await momentumOpt
            self.featuredPressure = await pressureOpt
            self.featuredFacts = await factsOpt
            self.featuredCommentary = f.status.live ? await commentaryOpt : nil
        } else if let f = featured {
            // قبل المباراة: الوقائع وحدها (الطقس + الغيابات) تُغني شرائح الهيرو.
            self.featuredFacts = try? await APIClient.shared.fetchMatchFacts(matchId: f.id, ignoreCache: force)
            self.featuredDetail = nil
            self.featuredXg = nil
            self.featuredMomentum = nil
            self.featuredPressure = nil
            self.featuredCommentary = nil
        } else {
            self.featuredDetail = nil
            self.featuredXg = nil
            self.featuredMomentum = nil
            self.featuredPressure = nil
            self.featuredFacts = nil
            self.featuredCommentary = nil
        }

        // مزامنة ودجت الشاشة الرئيسية «المباراة القادمة» (أفضل جهد — يكيّش الشعارين).
        await SpWidgetBridge.sync(matches: matchesRes, follows: SpMatchFollows.shared.visibleItems, favoriteId: favorites.team?.id)
    }
}

// MARK: - تبويب الأخبار (كما هو — يبقى الملف بديلاً مباشرًا) + بحث

struct NewsView: View {
    @State private var news: [SpArticle] = []
    @State private var query = ""
    @State private var loading = true
    @State private var loadError: String?

    private var filtered: [SpArticle] {
        let q = query.trimmingCharacters(in: .whitespaces)
        guard !q.isEmpty else { return news }
        return news.filter { $0.title.localizedCaseInsensitiveContains(q) }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    searchField

                    if loading {
                        SpLoading()
                    } else if let loadError {
                        SpEmptyState(icon: "wifi.exclamationmark", title: "تعذّر التحميل", subtitle: loadError)
                    } else if filtered.isEmpty {
                        SpEmptyState(icon: "newspaper", title: "لا نتائج", subtitle: query.isEmpty ? "لا أخبار حاليًا" : "جرّب كلمة بحث أخرى")
                    } else {
                        ForEach(filtered.prefix(40)) { a in SpNewsCard(article: a) }
                    }
                }
                .padding(16)
            }
            .autoHideTabBar()
            .background(SpAmbientBackground())
            .navigationTitle("الأخبار الرياضية")
            .navigationBarTitleDisplayMode(.inline)
        }
        .task { await load() }
        .refreshable { await load(force: true) }
    }

    private var searchField: some View {
        HStack(spacing: 10) {
            Image(systemName: "magnifyingglass").font(.system(size: 14)).foregroundStyle(SpTheme.onDarkFaint)
            TextField("", text: $query, prompt: Text("ابحث في الأخبار").foregroundStyle(SpTheme.onDarkFaint))
                .font(SportsFonts.app(size: 15)).foregroundStyle(SpTheme.onDark).tint(rslAccent)
                .autocorrectionDisabled()
            if !query.isEmpty {
                Button { query = "" } label: { Image(systemName: "xmark.circle.fill").foregroundStyle(SpTheme.onDarkFaint) }
            }
        }
        .padding(.horizontal, 14).padding(.vertical, 12)
        .background(RoundedRectangle(cornerRadius: SpTheme.tileRadius, style: .continuous)
            .fill(SpTheme.cardFill)
            .overlay(RoundedRectangle(cornerRadius: SpTheme.tileRadius, style: .continuous).stroke(SpTheme.outline, lineWidth: 1)))
    }

    private func load(force: Bool = false) async {
        if !force { loading = true }
        do {
            self.news = try await APIClient.shared.fetchSportsNews(ignoreCache: force).articles
            self.loadError = nil
        } catch {
            self.loadError = error.localizedDescription
        }
        self.loading = false
    }
}
