import SwiftUI
import Combine

// تطبيق «خليجي 27» v4 — 5 تبويبات: الرئيسية · المباريات · التوقعات · البطولة · المزيد
// هوية مونديال سبق بصياغة خليجية (زمردي + ذهبي، بطاقات بيضاء على غسلة خضراء)
// وبنعومة VARA: أسطح مسطّحة، حدود شعرية، حركات ease قصيرة بلا springs.
struct GulfCupView: View {
    @State private var store = GcHubStore()
    @State private var selectedTab: GcTab = .home

    var body: some View {
        TabView(selection: $selectedTab) {
            NavigationStack {
                GcHomeScreen(store: store, onSelectTab: { selectedTab = $0 })
            }
            .tabItem { Label(L("tab.home"), systemImage: "house.fill") }
            .tag(GcTab.home)

            NavigationStack {
                GcMatchesScreen(store: store)
            }
            .tabItem { Label(L("tab.matches"), systemImage: "calendar") }
            .tag(GcTab.matches)

            NavigationStack {
                GcPredictionsHubScreen()
            }
            .tabItem { Label(L("tab.predictions"), systemImage: "sparkles") }
            .tag(GcTab.predictions)

            NavigationStack {
                GcTournamentScreen(store: store)
            }
            .tabItem { Label(L("tab.tournament"), systemImage: "trophy.fill") }
            .tag(GcTab.tournament)

            NavigationStack {
                GcMoreScreen(store: store)
            }
            .tabItem { Label(L("tab.more"), systemImage: "square.grid.2x2.fill") }
            .tag(GcTab.more)
        }
        .tint(GcTheme.emerald)
        .task { await store.loadAll() }
    }
}

enum GcTab: Hashable { case home, matches, predictions, tournament, more }

// MARK: - مخزن بيانات البطولة المشترك بين التبويبات

@MainActor
@Observable
final class GcHubStore {
    var overview: GcOverview?
    var fixtures: [GcFixture] = []
    var teams: [GcTeam] = []
    var groups: [GcGroup] = []
    var scorers: GcScorersBoard?
    var history: GcHistory?
    var loading = true
    var loadError: String?

    var live: [GcFixture] { fixtures.filter { $0.status.live } }
    var upcoming: [GcFixture] {
        fixtures.filter { !$0.status.finished && !$0.status.live }.sorted { $0.timestamp < $1.timestamp }
    }
    var todayFixtures: [GcFixture] {
        fixtures.filter { GcFormat.kickoffDay($0.date) == GcFormat.kickoffDay(GcNow.iso()) }
            .sorted { $0.timestamp < $1.timestamp }
    }

    func loadAll(force: Bool = false) async {
        if !force { loading = fixtures.isEmpty }
        async let o = APIClient.shared.fetchGcOverview(ignoreCache: force)
        async let f = APIClient.shared.fetchGcFixtures(ignoreCache: force)
        async let t = APIClient.shared.fetchGcTeams(ignoreCache: force)
        async let g = APIClient.shared.fetchGcStandings(ignoreCache: force)
        do {
            let (ov, fx, tm, gr) = try await (o, f, t, g)
            overview = ov; fixtures = fx; teams = tm; groups = gr
            loadError = nil
        } catch { loadError = LError(error) }
        loading = false
        // أفضل جهد — لا تُفشل الرئيسية إن غاب المزوّد
        async let sc: Void = loadScorers(force: force)
        async let hi: Void = loadHistory(force: force)
        _ = await (sc, hi)
    }

    func loadScorers(force: Bool = false) async {
        scorers = (try? await APIClient.shared.fetchGcScorers(ignoreCache: force)) ?? scorers
    }

    func loadHistory(force: Bool = false) async {
        history = (try? await APIClient.shared.fetchGcHistory(ignoreCache: force)) ?? history
    }
}

enum GcNow {
    static func iso() -> String {
        ISO8601DateFormatter().string(from: Date())
    }
}

// MARK: - الرئيسية (هوية مونديال سبق + نعومة VARA)

private struct GcHomeScreen: View {
    @Bindable var store: GcHubStore
    let onSelectTab: (GcTab) -> Void

    private var tabBarVis: GcTabBarVisibility { .shared }

    /// مجموعة السعودية أولًا للتيزر، وإلا أول مجموعة.
    private var teaserGroup: GcGroup? {
        if let name = store.overview?.saudi.group,
           let g = store.groups.first(where: { $0.name == name }) {
            return g
        }
        return store.groups.first
    }

    private var heroFixture: GcFixture? {
        store.live.first ?? store.overview?.nextMatch ?? store.upcoming.first
    }

    var body: some View {
        GcScreenScaffold {
            VStack(spacing: 22) {
                GcHomeTopBar(liveCount: store.live.count)
                    .gcReveal()

                GcHomeHeroBlock(store: store, featured: heroFixture)
                    .gcReveal(delay: 0.06)

                if let loadError = store.loadError {
                    GcErrorCard(message: loadError) { await store.loadAll(force: true) }
                }

                let railFixtures = store.live.filter { $0.id != heroFixture?.id }
                if !railFixtures.isEmpty {
                    GcLiveRail(fixtures: railFixtures)
                        .gcReveal(delay: 0.14)
                }

                GcPredictionsBanner { onSelectTab(.predictions) }
                    .gcReveal(delay: 0.22)

                if let saudi = store.overview?.saudi, saudi.team != nil || !saudi.fixtures.isEmpty {
                    GcSaudiSpotlight(saudi: saudi, history: store.history)
                        .gcReveal()
                }

                if let group = teaserGroup {
                    GcStandingsTeaser(group: group) { onSelectTab(.tournament) }
                        .gcReveal()
                }

                if !store.upcoming.isEmpty || store.loading {
                    GcGameweekBoard(
                        fixtures: Array(store.upcoming.prefix(12)),
                        loading: store.loading && store.upcoming.isEmpty
                    ) { onSelectTab(.matches) }
                        .gcReveal()
                }

                if let board = store.scorers, !board.scorers.isEmpty {
                    GcScorersPreview(board: board) { onSelectTab(.tournament) }
                        .gcReveal()
                }

                if let history = store.history {
                    GcHistoryTeaser(history: history) { onSelectTab(.tournament) }
                        .gcReveal()
                }

                GcFooterSignature()
            }
        }
        .gcAutoHideTabBar()
        .toolbar(tabBarVis.hidden ? .hidden : .visible, for: .tabBar)
        .refreshable { await store.loadAll(force: true) }
        .navigationBarHidden(true)
    }
}

/// الشريط العلوي: شعار البطولة الرسمي + الهوية + شارة مباشر.
private struct GcHomeTopBar: View {
    let liveCount: Int

    var body: some View {
        HStack(spacing: 10) {
            Image("Emblem")
                .resizable()
                .scaledToFit()
                .frame(height: 42)
            VStack(alignment: .leading, spacing: 1) {
                Text(L("app.title"))
                    .font(GulfCupFonts.headline(size: 17))
                    .foregroundStyle(GcTheme.ink)
                Text(L("app.host"))
                    .font(GulfCupFonts.app(size: 10.5, weight: .semibold))
                    .foregroundStyle(GcTheme.inkDim)
            }
            Spacer()
            if liveCount > 0 {
                HStack(spacing: 5) {
                    GcLiveDot()
                    Text(liveCount == 1 ? L("state.live") : "\(liveCount) \(L("state.live"))")
                        .font(GulfCupFonts.app(size: 11, weight: .bold))
                }
                .foregroundStyle(.white)
                .padding(.horizontal, 11).padding(.vertical, 5)
                .background(Capsule().fill(GcTheme.liveRed))
            }
        }
        .padding(.top, 6)
    }
}

/// الهيرو الزمردي المضغوط + البطاقة العائمة — توقيع الشاشة الجديدة:
/// لوحة بتدرج المونديال يطفو فوق حافتها السفلية بطاقة المباراة المميزة.
private struct GcHomeHeroBlock: View {
    @Bindable var store: GcHubStore
    let featured: GcFixture?

    private var started: Bool { store.overview?.started == true }
    private var dateRange: String {
        store.overview.map { GcFormat.dateRange(startIso: $0.startsAt, endIso: $0.endsAt) } ?? ""
    }

    var body: some View {
        VStack(spacing: 12) {
            VStack(spacing: 0) {
                heroPanel
                floatCard
                    .padding(.horizontal, 14)
                    .padding(.top, -46)
            }
            if store.todayFixtures.count >= 2 {
                GcHeroTodayStrip(matches: store.todayFixtures, activeId: featured?.id)
            }
        }
    }

    private var heroPanel: some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack(spacing: 7) {
                heroTag("النسخة 27", gold: true)
                heroTag(L("hero.hostedBy"), gold: false)
            }
            .padding(.bottom, 9)
            Text("كأس الخليج العربي")
                .font(GulfCupFonts.headline(size: 22))
                .foregroundStyle(GcTheme.onHero)
            Text(dateRange.isEmpty ? L("app.host") : dateRange)
                .font(GulfCupFonts.app(size: 11.5))
                .foregroundStyle(GcTheme.onHeroDim)
            if !started {
                GcCountdownChips(iso: store.overview?.startsAt, onHero: true)
                    .frame(maxWidth: .infinity)
                    .padding(.top, 14)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(18)
        .padding(.bottom, 58)
        .background(
            RoundedRectangle(cornerRadius: GcTheme.heroRadius, style: .continuous)
                .fill(GcTheme.heroGradient)
                .overlay(
                    GcHeroDecor()
                        .clipShape(RoundedRectangle(cornerRadius: GcTheme.heroRadius, style: .continuous))
                )
        )
        .overlay(
            RoundedRectangle(cornerRadius: GcTheme.heroRadius, style: .continuous)
                .stroke(Color.white.opacity(0.10), lineWidth: 1)
        )
        .shadow(color: GcTheme.heroShadow, radius: 18, y: 8)
    }

    private func heroTag(_ text: String, gold: Bool) -> some View {
        Text(text)
            .font(GulfCupFonts.app(size: 10.5, weight: .bold))
            .foregroundStyle(gold ? GcTheme.forest : Color(red: 0.91, green: 0.96, blue: 0.93))
            .padding(.horizontal, 11).padding(.vertical, 4)
            .background(
                Capsule().fill(gold ? AnyShapeStyle(GcTheme.goldFill) : AnyShapeStyle(Color.white.opacity(0.13)))
            )
    }

    @ViewBuilder private var floatCard: some View {
        if let fx = featured {
            // قبل انطلاق البطولة يكفي عدّاد الهيرو — لا نكرّره داخل البطاقة العائمة.
            GcHeroFloatCard(fixture: fx, showCountdown: started)
        } else if store.loading {
            ProgressView()
                .tint(GcTheme.emerald)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 42)
                .background(RoundedRectangle(cornerRadius: GcTheme.floatRadius, style: .continuous).fill(GcTheme.cardBg))
                .overlay(RoundedRectangle(cornerRadius: GcTheme.floatRadius, style: .continuous).stroke(GcTheme.line, lineWidth: 1))
                .shadow(color: GcTheme.raisedShadow, radius: 16, y: 9)
        } else {
            VStack(spacing: 7) {
                Image(systemName: "sparkles")
                    .font(.system(size: 20, weight: .semibold))
                    .foregroundStyle(GcTheme.gold)
                Text("تغطية خليجي 27 تنطلق قريبًا")
                    .font(GulfCupFonts.app(size: 14, weight: .bold))
                    .foregroundStyle(GcTheme.ink)
                Text("الجدول والنتائج الحية ستجدها هنا أولًا بأول")
                    .font(GulfCupFonts.app(size: 11.5))
                    .foregroundStyle(GcTheme.inkDim)
                    .multilineTextAlignment(.center)
            }
            .padding(20)
            .frame(maxWidth: .infinity)
            .background(RoundedRectangle(cornerRadius: GcTheme.floatRadius, style: .continuous).fill(GcTheme.cardBg))
            .overlay(RoundedRectangle(cornerRadius: GcTheme.floatRadius, style: .continuous).stroke(GcTheme.line, lineWidth: 1))
            .shadow(color: GcTheme.raisedShadow, radius: 16, y: 9)
        }
    }
}

/// عدّ تنازلي حي — شرائح LTR (يوم على اليسار)؛ نسخة فاتحة وأخرى فوق الهيرو.
private struct GcCountdownChips: View {
    let iso: String?
    var onHero: Bool = false

    var body: some View {
        TimelineView(.periodic(from: .now, by: 1)) { _ in
            let c = GcCountdownMath.to(iso: iso)
            if c.total <= 0 {
                HStack(spacing: 6) {
                    Circle().fill(onHero ? GcTheme.goldLite : GcTheme.emerald).frame(width: 8, height: 8)
                    Text("حان موعد الانطلاق — التغطية الحية تبدأ خلال لحظات")
                        .font(GulfCupFonts.app(size: 12, weight: .medium))
                        .foregroundStyle(onHero ? GcTheme.onHero : GcTheme.ink)
                }
            } else {
                HStack(spacing: 8) {
                    chip(c.days, L("countdown.days"))
                    chip(c.hours, L("countdown.hours"))
                    chip(c.minutes, L("countdown.minutes"))
                    chip(c.seconds, L("countdown.seconds"))
                }
                .environment(\.layoutDirection, .leftToRight)
            }
        }
    }

    private func chip(_ value: Int, _ label: String) -> some View {
        VStack(spacing: 2) {
            Text("\(value)")
                .font(GulfCupFonts.app(size: 20, weight: .bold))
                .foregroundStyle(onHero ? GcTheme.onHero : GcTheme.ink)
                .monospacedDigit()
            Text(label)
                .font(GulfCupFonts.app(size: 10, weight: .semibold))
                .foregroundStyle(onHero ? GcTheme.onHeroDim : GcTheme.emeraldDeep)
        }
        .frame(minWidth: 52)
        .padding(.vertical, 8)
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(onHero ? Color.white.opacity(0.12) : GcTheme.chipFill)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .stroke(onHero ? Color.white.opacity(0.14) : Color.clear, lineWidth: 1)
        )
    }
}

/// البطاقة العائمة — المباراة المميزة فوق حافة الهيرو (الظلّ الوحيد في الشاشة).
private struct GcHeroFloatCard: View {
    let fixture: GcFixture
    var showCountdown: Bool = true

    private var matchStarted: Bool { fixture.status.live || fixture.status.finished }

    var body: some View {
        NavigationLink {
            GcMatchCenterScreen(fixture: fixture)
        } label: {
            VStack(spacing: 13) {
                HStack(spacing: 6) {
                    Text(eyebrow)
                        .font(GulfCupFonts.app(size: 10.5, weight: .semibold))
                        .foregroundStyle(GcTheme.inkDim)
                        .lineLimit(1)
                    Spacer(minLength: 6)
                    GcStatusPill(fixture: fixture)
                }

                HStack(alignment: .top, spacing: 8) {
                    teamColumn(fixture.home)
                    centerColumn
                    teamColumn(fixture.away)
                }

                if !matchStarted && showCountdown {
                    GcCountdownChips(iso: fixture.date)
                }

                HStack(spacing: 6) {
                    Text("مركز المباراة")
                        .font(GulfCupFonts.app(size: 12.5, weight: .bold))
                    Image(systemName: "chevron.left")
                        .font(.system(size: 10, weight: .bold))
                }
                .foregroundStyle(GcTheme.emeraldDeep)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 9)
                .background(
                    RoundedRectangle(cornerRadius: 13, style: .continuous)
                        .fill(GcTheme.emerald.opacity(0.10))
                )
            }
            .padding(14)
            .background(RoundedRectangle(cornerRadius: GcTheme.floatRadius, style: .continuous).fill(GcTheme.cardBg))
            .overlay(RoundedRectangle(cornerRadius: GcTheme.floatRadius, style: .continuous).stroke(GcTheme.line, lineWidth: 1))
            .shadow(color: GcTheme.raisedShadow, radius: 16, y: 9)
        }
        .buttonStyle(GcPressStyle())
    }

    private var eyebrow: String {
        var parts: [String] = []
        if !fixture.round.isEmpty { parts.append(fixture.round) }
        if !fixture.venue.name.isEmpty { parts.append(fixture.venue.name) }
        return parts.isEmpty ? L("app.title") : parts.joined(separator: " · ")
    }

    private func teamColumn(_ team: GcTeam) -> some View {
        VStack(spacing: 7) {
            GcTeamLogo(logo: team.logo, size: 52)
            Text(team.name)
                .font(GulfCupFonts.app(size: 13, weight: .semibold))
                .foregroundStyle(GcTheme.ink)
                .multilineTextAlignment(.center)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
        }
        .frame(maxWidth: .infinity)
    }

    private var centerColumn: some View {
        VStack(spacing: 5) {
            if matchStarted {
                Text("\(fixture.goals.away ?? 0) - \(fixture.goals.home ?? 0)")
                    .font(GulfCupFonts.app(size: 30, weight: .bold))
                    .foregroundStyle(GcTheme.ink)
                    .monospacedDigit()
                    .environment(\.layoutDirection, .leftToRight)
                if fixture.status.live, !fixture.status.label.isEmpty {
                    Text(fixture.status.label)
                        .font(GulfCupFonts.app(size: 10, weight: .bold))
                        .foregroundStyle(GcTheme.liveRed)
                        .lineLimit(1)
                }
            } else {
                Text(GcFormat.kickoffTime(fixture.date))
                    .font(GulfCupFonts.app(size: 24, weight: .bold))
                    .foregroundStyle(GcTheme.ink)
                    .monospacedDigit()
                    .environment(\.layoutDirection, .leftToRight)
                Text(GcFormat.relativeKickoff(fixture.date))
                    .font(GulfCupFonts.app(size: 10.5))
                    .foregroundStyle(GcTheme.inkDim)
            }
        }
        .frame(minWidth: 96)
    }
}

/// شريط مباريات اليوم أسفل الهيرو.
private struct GcHeroTodayStrip: View {
    let matches: [GcFixture]
    let activeId: Int?

    var body: some View {
        VStack(spacing: 10) {
            HStack(spacing: 5) {
                Image(systemName: "calendar")
                    .font(.system(size: 11, weight: .semibold))
                Text(L("home.today.title"))
                    .font(GulfCupFonts.app(size: 11, weight: .semibold))
                Text("(\(matches.count))")
                    .font(GulfCupFonts.app(size: 12))
                    .foregroundStyle(GcTheme.inkDim)
            }
            .foregroundStyle(GcTheme.emerald)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(matches) { fx in
                        NavigationLink {
                            GcMatchCenterScreen(fixture: fx)
                        } label: {
                            HStack(spacing: 8) {
                                GcTeamLogo(logo: fx.home.logo, size: 22)
                                if fx.status.live || fx.status.finished {
                                    Text("\(fx.goals.away ?? 0)-\(fx.goals.home ?? 0)")
                                        .font(GulfCupFonts.app(size: 13, weight: .bold))
                                        .monospacedDigit()
                                        .environment(\.layoutDirection, .leftToRight)
                                } else {
                                    Text(GcFormat.kickoffTime(fx.date))
                                        .font(GulfCupFonts.app(size: 12, weight: .bold))
                                        .monospacedDigit()
                                        .environment(\.layoutDirection, .leftToRight)
                                }
                                GcTeamLogo(logo: fx.away.logo, size: 22)
                            }
                            .foregroundStyle(GcTheme.ink)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 10)
                            .background(
                                RoundedRectangle(cornerRadius: 16, style: .continuous)
                                    .fill(fx.id == activeId ? GcTheme.emerald.opacity(0.12) : GcTheme.chipFill)
                            )
                            .overlay(
                                RoundedRectangle(cornerRadius: 16, style: .continuous)
                                    .stroke(fx.id == activeId ? GcTheme.emerald.opacity(0.35) : Color.clear, lineWidth: 1)
                            )
                        }
                        .buttonStyle(GcPressStyle())
                    }
                }
            }
        }
    }
}

/// شريط المباشر — بطاقات أفقية للمباريات الجارية غير المعروضة في الهيرو.
private struct GcLiveRail: View {
    let fixtures: [GcFixture]
    var body: some View {
        VStack(spacing: 12) {
            GcSectionHeader(icon: "dot.radiowaves.left.and.right", title: L("home.live.title"), tint: GcTheme.liveRed)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 10) {
                    ForEach(fixtures) { fx in
                        NavigationLink {
                            GcMatchCenterScreen(fixture: fx)
                        } label: {
                            VStack(spacing: 10) {
                                HStack(spacing: 5) {
                                    GcLiveDot()
                                    Text(fx.status.elapsed.map { "\($0)'" } ?? L("state.live"))
                                        .font(GulfCupFonts.app(size: 10, weight: .bold))
                                }
                                .foregroundStyle(.white)
                                .padding(.horizontal, 8).padding(.vertical, 3)
                                .background(Capsule().fill(GcTheme.liveRed))

                                HStack(spacing: 10) {
                                    GcTeamLogo(logo: fx.home.logo, size: 26)
                                    Text("\(fx.goals.away ?? 0) - \(fx.goals.home ?? 0)")
                                        .font(GulfCupFonts.app(size: 17, weight: .bold))
                                        .foregroundStyle(GcTheme.ink)
                                        .monospacedDigit()
                                        .environment(\.layoutDirection, .leftToRight)
                                    GcTeamLogo(logo: fx.away.logo, size: 26)
                                }
                            }
                            .padding(14)
                            .frame(width: 148)
                            .gcCard(radius: GcTheme.cardRadius, stroke: GcTheme.liveRed.opacity(0.28))
                        }
                        .buttonStyle(GcPressStyle())
                    }
                }
            }
        }
    }
}

/// بانر التوقعات — تدرج زمردي بتوهّج ذهبي، والفعل كبسولة ذهبية (الذهب للوجاهة).
private struct GcPredictionsBanner: View {
    let action: () -> Void
    var body: some View {
        Button(action: action) {
            HStack(spacing: 12) {
                Image(systemName: "trophy.fill")
                    .font(.system(size: 19, weight: .semibold))
                    .foregroundStyle(GcTheme.goldLite)
                    .frame(width: 44, height: 44)
                    .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(Color.white.opacity(0.12)))
                    .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(GcTheme.goldLite.opacity(0.45), lineWidth: 1))
                VStack(alignment: .leading, spacing: 3) {
                    Text(L("predictions.hero.title"))
                        .font(GulfCupFonts.app(size: 14, weight: .bold))
                        .foregroundStyle(.white)
                    Text(L("predictions.subtitle"))
                        .font(GulfCupFonts.app(size: 10.5))
                        .foregroundStyle(GcTheme.onHeroDim)
                        .lineLimit(1)
                }
                Spacer(minLength: 8)
                Text("توقّع الآن")
                    .font(GulfCupFonts.app(size: 11.5, weight: .bold))
                    .foregroundStyle(GcTheme.forest)
                    .padding(.horizontal, 14).padding(.vertical, 8)
                    .background(Capsule().fill(GcTheme.goldFill))
            }
            .padding(14)
            .background(
                RoundedRectangle(cornerRadius: 20, style: .continuous)
                    .fill(GcTheme.heroGradient)
                    .overlay(
                        GeometryReader { geo in
                            RadialGradient(
                                colors: [GcTheme.goldLite.opacity(0.26), .clear],
                                center: .topLeading, startRadius: 0, endRadius: geo.size.width * 0.45
                            )
                        }
                        .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
                    )
            )
            .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).stroke(Color.white.opacity(0.10), lineWidth: 1))
        }
        .buttonStyle(GcPressStyle())
    }
}

private struct GcSaudiSpotlight: View {
    let saudi: GcSaudi
    let history: GcHistory?

    private var saudiTitles: Int {
        history?.titles.first(where: { $0.team.id == GulfCupConstants.saudiTeamId })?.titles ?? 0
    }

    var body: some View {
        VStack(spacing: 12) {
            GcSectionHeader(icon: "flag.fill", title: L("saudi.title"), subtitle: saudi.group, tint: GcTheme.emerald)
            if let team = saudi.team {
                NavigationLink {
                    GcTeamProfileScreen(teamId: team.id, fallback: team)
                } label: {
                    HStack(spacing: 12) {
                        GcTeamLogo(logo: team.logo, size: 46)
                            .overlay(Circle().stroke(GcTheme.emerald.opacity(0.40), lineWidth: 1.5))
                        VStack(alignment: .leading, spacing: 5) {
                            Text(team.name).font(GulfCupFonts.app(size: 16, weight: .bold)).foregroundStyle(GcTheme.ink)
                            HStack(spacing: 6) {
                                GcChip(text: L("saudi.host"), icon: "star.fill", tint: GcTheme.goldDeep)
                                if saudiTitles > 0 {
                                    GcChip(text: "\(saudiTitles) \(L("history.titles.unit"))", icon: "trophy.fill", tint: GcTheme.emerald)
                                }
                            }
                        }
                        Spacer()
                        Image(systemName: "chevron.left").font(.system(size: 12, weight: .bold)).foregroundStyle(GcTheme.inkFaint)
                    }
                    .padding(14)
                    .gcCard(stroke: GcTheme.gold.opacity(0.20))
                }
                .buttonStyle(GcPressStyle())
            }
            if !saudi.fixtures.isEmpty {
                GcMatchListCard(fixtures: Array(saudi.fixtures.prefix(3)))
            }
        }
    }
}

/// تيزر ترتيب حي — مجموعة واحدة (حتى 4 صفوف) بمؤشّرات لحظية أثناء المباريات.
private struct GcStandingsTeaser: View {
    let group: GcGroup
    let onOpen: () -> Void

    private var rows: [GcStandingRow] { Array(group.rows.prefix(4)) }
    private var anyLive: Bool { rows.contains { $0.live == true } }

    var body: some View {
        VStack(spacing: 12) {
            GcSectionHeader(
                icon: "list.number",
                title: L("home.standings.title"),
                subtitle: group.name,
                tint: anyLive ? GcTheme.liveRed : GcTheme.emerald,
                action: onOpen
            )
            VStack(spacing: 0) {
                ForEach(Array(rows.enumerated()), id: \.element.id) { idx, row in
                    if idx > 0 { Rectangle().fill(GcTheme.outline).frame(height: 1).padding(.leading, 16) }
                    NavigationLink {
                        GcTeamProfileScreen(teamId: row.team.id, fallback: row.team)
                    } label: {
                        standingRow(row)
                    }
                    .buttonStyle(.plain)
                    .disabled(row.team.id <= 0)
                }
            }
            .gcCard()
        }
    }

    private func standingRow(_ row: GcStandingRow) -> some View {
        let qualifies = row.rank <= 2
        let isLive = row.live == true
        let delta = row.liveDelta ?? 0
        return HStack(spacing: 10) {
            Text("\(row.rank)")
                .font(GulfCupFonts.app(size: 12, weight: .bold))
                .foregroundStyle(qualifies ? GcTheme.emeraldDeep : GcTheme.inkFaint)
                .frame(width: 22, height: 22)
                .background(
                    RoundedRectangle(cornerRadius: 7, style: .continuous)
                        .fill(qualifies ? GcTheme.emerald.opacity(0.13) : GcTheme.chipFill)
                )
            GcTeamLogo(logo: row.team.logo, size: 28)
            Text(row.team.name)
                .font(GulfCupFonts.app(size: 13.5, weight: qualifies ? .bold : .regular))
                .foregroundStyle(GcTheme.ink)
                .lineLimit(1)
            if isLive {
                HStack(spacing: 4) {
                    Text(L("state.live"))
                        .font(GulfCupFonts.app(size: 8, weight: .bold))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 6).padding(.vertical, 1.5)
                        .background(Capsule().fill(GcTheme.liveRed))
                    Image(systemName: delta > 0 ? "arrow.up" : delta < 0 ? "arrow.down" : "minus")
                        .font(.system(size: 9, weight: .bold))
                        .foregroundStyle(delta > 0 ? GcTheme.emerald : delta < 0 ? GcTheme.crimson : GcTheme.inkFaint)
                }
            }
            Spacer(minLength: 0)
            Text("\(row.points)")
                .font(GulfCupFonts.app(size: 16, weight: .bold))
                .foregroundStyle(GcTheme.ink)
                .monospacedDigit()
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 11)
        .background(
            isLive ? GcTheme.liveRed.opacity(0.04)
                : row.team.id == GulfCupConstants.saudiTeamId ? GcTheme.emerald.opacity(0.05) : Color.clear
        )
        .contentShape(Rectangle())
    }
}

/// جولة المباريات — رقاقات أيام + صفوف اليوم المختار (بدل الشريط الأفقي).
private struct GcGameweekBoard: View {
    let fixtures: [GcFixture]
    let loading: Bool
    let onOpenAll: () -> Void
    @State private var selectedDay: String?

    var body: some View {
        let days = GcFixtureMath.groupByDay(fixtures)
        let active = days.first(where: { $0.label == selectedDay }) ?? days.first
        VStack(spacing: 12) {
            GcSectionHeader(
                icon: "calendar",
                title: L("home.next.title"),
                tint: GcTheme.emerald,
                action: fixtures.isEmpty ? nil : onOpenAll
            )
            if loading {
                GcLoadingPanel(title: L("loading.matches"))
            } else if fixtures.isEmpty {
                GcEmptyState(icon: "calendar.badge.clock", title: L("home.next.empty.title"), subtitle: L("home.next.empty.subtitle"))
            } else {
                if days.count > 1 {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            ForEach(days) { day in
                                let isOn = day.label == active?.label
                                Button {
                                    withAnimation(.easeOut(duration: 0.2)) { selectedDay = day.label }
                                } label: {
                                    Text(day.label)
                                        .font(GulfCupFonts.app(size: 12, weight: .semibold))
                                        .foregroundStyle(isOn ? .white : GcTheme.inkDim)
                                        .padding(.horizontal, 14).padding(.vertical, 7)
                                        .background(Capsule().fill(isOn ? GcTheme.emerald : GcTheme.chipFill))
                                }
                                .buttonStyle(GcPressStyle())
                            }
                        }
                    }
                }
                if let active {
                    GcMatchListCard(fixtures: Array(active.items.prefix(4)))
                }
            }
        }
    }
}

/// أعلى 3 هدّافين — ميدالية ذهبية للأول (الذهب للتتويج فقط).
private struct GcScorersPreview: View {
    let board: GcScorersBoard
    let onOpen: () -> Void

    var body: some View {
        VStack(spacing: 12) {
            GcSectionHeader(
                icon: "soccerball",
                title: L("home.scorers.title"),
                subtitle: board.isCurrent ? nil : L("scorers.lastEdition"),
                tint: GcTheme.goldDeep,
                action: onOpen
            )
            VStack(spacing: 0) {
                ForEach(Array(board.scorers.prefix(3).enumerated()), id: \.element.id) { idx, s in
                    if idx > 0 { Rectangle().fill(GcTheme.outline).frame(height: 1).padding(.leading, 14) }
                    HStack(spacing: 11) {
                        Text("\(s.rank)")
                            .font(GulfCupFonts.app(size: 12, weight: .bold))
                            .foregroundStyle(s.rank == 1 ? GcTheme.forest : GcTheme.inkDim)
                            .frame(width: 26, height: 26)
                            .background(
                                RoundedRectangle(cornerRadius: 9, style: .continuous)
                                    .fill(s.rank == 1 ? AnyShapeStyle(GcTheme.goldFill) : AnyShapeStyle(GcTheme.chipFill))
                            )
                        GcPlayerPhoto(url: s.photo, size: 38)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(s.name).font(GulfCupFonts.app(size: 13, weight: .bold)).foregroundStyle(GcTheme.ink).lineLimit(1)
                            Text(s.team.name).font(GulfCupFonts.app(size: 10.5)).foregroundStyle(GcTheme.inkDim)
                        }
                        Spacer()
                        VStack(spacing: 1) {
                            Text("\(s.goals)").font(GulfCupFonts.app(size: 16, weight: .bold)).foregroundStyle(GcTheme.emeraldDeep).monospacedDigit()
                            Text(L("scorers.goals")).font(GulfCupFonts.app(size: 9)).foregroundStyle(GcTheme.inkFaint)
                        }
                    }
                    .padding(.horizontal, 14).padding(.vertical, 10)
                }
            }
            .gcCard()
        }
    }
}

/// حامل اللقب + الأكثر تتويجًا — بوّابة سجلّ البطولة.
private struct GcHistoryTeaser: View {
    let history: GcHistory
    let onOpen: () -> Void

    private var holder: GcEdition? {
        history.editions.first(where: { !$0.upcoming && $0.champion != nil })
    }
    private var mostTitled: GcTitleRow? { history.titles.first }

    var body: some View {
        Button(action: onOpen) {
            VStack(spacing: 12) {
                GcSectionHeader(icon: "crown.fill", title: L("home.history.title"), subtitle: L("home.history.subtitle"), tint: GcTheme.goldDeep)
                HStack(spacing: 10) {
                    if let holder, let champ = holder.champion {
                        legacyTile(logo: champ.logo, title: champ.name, caption: "\(L("home.holder")) · \(holder.title)")
                    }
                    if let mostTitled {
                        legacyTile(logo: mostTitled.team.logo, title: mostTitled.team.name, caption: "\(L("home.mostTitles")) · \(mostTitled.titles) \(L("history.titles.unit"))")
                    }
                }
            }
            .padding(14)
            .gcCard()
        }
        .buttonStyle(GcPressStyle())
    }

    private func legacyTile(logo: String, title: String, caption: String) -> some View {
        VStack(spacing: 7) {
            GcTeamLogo(logo: logo, size: 40)
            Text(title)
                .font(GulfCupFonts.app(size: 13, weight: .bold))
                .foregroundStyle(GcTheme.ink)
                .lineLimit(1)
            Text(caption)
                .font(GulfCupFonts.app(size: 10))
                .foregroundStyle(GcTheme.inkDim)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 14).padding(.horizontal, 10)
        .background(RoundedRectangle(cornerRadius: GcTheme.tileRadius, style: .continuous).fill(GcTheme.cardBgSubtle))
        .overlay(RoundedRectangle(cornerRadius: GcTheme.tileRadius, style: .continuous).stroke(GcTheme.gold.opacity(0.18), lineWidth: 1))
    }
}

// MARK: - المباريات

private struct GcMatchesScreen: View {
    @Bindable var store: GcHubStore
    @State private var dayFilter: String?
    @State private var roundFilter: String?

    private var days: [(key: String, label: String)] {
        var seen = Set<String>()
        var result: [(String, String)] = []
        for f in store.fixtures.sorted(by: { $0.timestamp < $1.timestamp }) {
            let key = String(f.date.prefix(10))
            if seen.insert(key).inserted {
                result.append((key, GcFormat.kickoffDayShort(f.date)))
            }
        }
        return result
    }

    private var rounds: [String] {
        var seen = Set<String>()
        return store.fixtures
            .sorted { $0.timestamp < $1.timestamp }
            .compactMap { seen.insert($0.roundEn).inserted ? $0.roundEn : nil }
    }

    private var filtered: [GcFixture] {
        store.fixtures.filter { f in
            (dayFilter == nil || String(f.date.prefix(10)) == dayFilter)
                && (roundFilter == nil || f.roundEn == roundFilter)
        }
    }

    private func roundLabel(_ en: String) -> String {
        store.fixtures.first(where: { $0.roundEn == en })?.round ?? en
    }

    var body: some View {
        GcScreenScaffold {
            VStack(spacing: 14) {
                GcHeroPanel(radius: GcTheme.cardRadius) {
                    VStack(spacing: 10) {
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(L("tab.matches")).font(GulfCupFonts.headline(size: 22)).foregroundStyle(.white)
                                Text(L("matches.subtitle")).font(GulfCupFonts.app(size: 11.5)).foregroundStyle(GcTheme.onHeroDim)
                            }
                            Spacer()
                            Image(systemName: "calendar").font(.system(size: 26)).foregroundStyle(GcTheme.goldLite.opacity(0.7))
                        }
                        HStack(spacing: 14) {
                            heroMetric("\(store.fixtures.count)", L("matchesHero.matches"))
                            heroMetric("\(store.fixtures.filter { $0.status.finished }.count)", L("matchesHero.finished"))
                            heroMetric("\(store.live.count)", L("state.live"), highlight: !store.live.isEmpty)
                            Spacer()
                        }
                    }
                    .padding(16)
                }
                .padding(.top, 8)

                if days.count > 1 {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            dayChip(L("schedule.day.all"), nil)
                            ForEach(days, id: \.key) { d in dayChip(d.label, d.key) }
                        }
                    }
                }

                if rounds.count > 1 {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            roundChip(L("schedule.round.all"), nil)
                            ForEach(rounds, id: \.self) { r in roundChip(roundLabel(r), r) }
                        }
                    }
                }

                if filtered.isEmpty && !store.loading {
                    GcEmptyState(icon: "sportscourt", title: L("schedule.empty.title"), subtitle: L("schedule.empty.subtitle"))
                } else {
                    ForEach(GcFixtureMath.groupByDay(filtered)) { day in
                        VStack(alignment: .leading, spacing: 8) {
                            HStack(spacing: 6) {
                                Circle().fill(GcTheme.emerald).frame(width: 6, height: 6)
                                Text(day.label).font(GulfCupFonts.app(size: 13, weight: .bold)).foregroundStyle(GcTheme.emerald)
                            }
                            GcMatchListCard(fixtures: day.items)
                        }
                    }
                }
                if store.loading && store.fixtures.isEmpty {
                    GcLoadingPanel(title: L("loading.matches"))
                }
                GcFooterSignature()
            }
        }
        .refreshable { await store.loadAll(force: true) }
        .navigationBarHidden(true)
    }

    private func heroMetric(_ value: String, _ label: String, highlight: Bool = false) -> some View {
        HStack(spacing: 5) {
            Text(value).font(GulfCupFonts.app(size: 16, weight: .bold)).foregroundStyle(highlight ? GcTheme.goldLite : .white).monospacedDigit()
            Text(label).font(GulfCupFonts.app(size: 10.5)).foregroundStyle(GcTheme.onHeroFaint)
        }
    }

    private func dayChip(_ title: String, _ value: String?) -> some View {
        filterChip(title, selected: dayFilter == value) { dayFilter = value }
    }

    private func roundChip(_ title: String, _ value: String?) -> some View {
        filterChip(title, selected: roundFilter == value) { roundFilter = value }
    }

    private func filterChip(_ title: String, selected: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title).font(GulfCupFonts.app(size: 12, weight: .semibold))
                .foregroundStyle(selected ? .white : GcTheme.inkDim)
                .padding(.horizontal, 13).padding(.vertical, 7)
                .background(Capsule().fill(selected ? GcTheme.emerald : GcTheme.chipFill))
        }
        .buttonStyle(GcPressStyle())
    }
}

// MARK: - المزيد

private struct GcMoreScreen: View {
    @Bindable var store: GcHubStore

    var body: some View {
        GcScreenScaffold {
            VStack(spacing: 16) {
                GcHeroPanel(radius: GcTheme.cardRadius) {
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(L("tab.more")).font(GulfCupFonts.headline(size: 22)).foregroundStyle(.white)
                            Text(L("more.subtitle")).font(GulfCupFonts.app(size: 11.5)).foregroundStyle(GcTheme.onHeroDim)
                        }
                        Spacer()
                        GcEmblem(height: 44)
                    }
                    .padding(16)
                }
                .padding(.top, 8)

                GcAccountCard()

                GcSectionHeader(icon: "person.3.fill", title: L("teams.section.title"), count: store.teams.count, tint: GcTheme.emerald)
                if store.teams.isEmpty && !store.loading {
                    GcEmptyState(icon: "person.3", title: L("teams.empty.title"), subtitle: L("teams.empty.subtitle"))
                } else {
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 100))], spacing: 10) {
                        ForEach(store.teams) { t in
                            NavigationLink {
                                GcTeamProfileScreen(teamId: t.id, fallback: t)
                            } label: {
                                VStack(spacing: 8) {
                                    GcTeamLogo(logo: t.logo, size: 46)
                                    Text(t.name).font(GulfCupFonts.app(size: 11.5, weight: .bold)).foregroundStyle(GcTheme.ink).lineLimit(2).multilineTextAlignment(.center)
                                    if t.id == GulfCupConstants.saudiTeamId {
                                        GcChip(text: L("teams.host.badge"), icon: "star.fill", tint: GcTheme.goldDeep)
                                    }
                                }
                                .frame(maxWidth: .infinity)
                                .padding(12)
                                .gcCard(radius: GcTheme.tileRadius)
                            }
                            .buttonStyle(GcPressStyle())
                        }
                    }
                }

                if let ov = store.overview, !ov.venues.isEmpty {
                    GcSectionHeader(icon: "building.2.fill", title: L("venues.section.title"), count: ov.venues.count, tint: GcTheme.teal)
                    VStack(spacing: 0) {
                        ForEach(Array(ov.venues.enumerated()), id: \.offset) { idx, v in
                            if idx > 0 { Rectangle().fill(GcTheme.outline).frame(height: 1).padding(.leading, 14) }
                            HStack(spacing: 10) {
                                Image(systemName: "sportscourt.fill").foregroundStyle(GcTheme.emerald)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(v.name).font(GulfCupFonts.app(size: 13, weight: .semibold)).foregroundStyle(GcTheme.ink)
                                    Text(v.city).font(GulfCupFonts.app(size: 11)).foregroundStyle(GcTheme.inkDim)
                                }
                                Spacer()
                            }
                            .padding(.horizontal, 14).padding(.vertical, 11)
                        }
                    }
                    .gcCard()
                }

                GcSectionHeader(icon: "info.circle.fill", title: L("more.about.title"), tint: GcTheme.gold)
                Text(L("more.about.body"))
                    .font(GulfCupFonts.app(size: 12.5))
                    .foregroundStyle(GcTheme.inkDim)
                    .lineSpacing(4)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(14)
                    .gcCard()

                GcFooterSignature()
            }
        }
        .refreshable { await store.loadAll(force: true) }
        .navigationBarHidden(true)
    }
}

private struct GcAccountCard: View {
    @Environment(GcAuthStore.self) private var auth

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            GcSectionHeader(icon: "person.crop.circle.fill", title: L("account.title"), subtitle: L("account.subtitle"), tint: GcTheme.gold)
            if auth.isLoggedIn {
                HStack(spacing: 12) {
                    Image(systemName: "checkmark.seal.fill").font(.system(size: 26)).foregroundStyle(GcTheme.emerald)
                    VStack(alignment: .leading, spacing: 3) {
                        Text(auth.member?.name ?? L("account.member.fallback")).font(GulfCupFonts.app(size: 14, weight: .bold)).foregroundStyle(GcTheme.ink)
                        Text(auth.member?.email ?? L("account.signedIn")).font(GulfCupFonts.app(size: 11)).foregroundStyle(GcTheme.inkDim)
                    }
                    Spacer()
                    Button(L("account.signout")) { auth.signOut() }
                        .font(GulfCupFonts.app(size: 12, weight: .bold))
                        .foregroundStyle(GcTheme.crimson)
                }
            } else {
                Text(L("account.signin.note"))
                    .font(GulfCupFonts.app(size: 12))
                    .foregroundStyle(GcTheme.inkDim)
                GcAppleSignInButton()
            }
            if auth.isLoading {
                ProgressView().tint(GcTheme.emerald)
            }
            if let err = auth.errorMessage {
                Text(err).font(GulfCupFonts.app(size: 11)).foregroundStyle(GcTheme.crimson)
            }
        }
        .padding(14)
        .gcCard()
    }
}
