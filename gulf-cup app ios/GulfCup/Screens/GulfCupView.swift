import SwiftUI
import Combine

// تطبيق «خليجي 27» v3 — 5 تبويبات: الرئيسية · المباريات · التوقعات · البطولة · المزيد
// هوية «ليالي الخليج»: ترويسات زمردية ليلية غامرة، بطاقات مرفوعة بظلّ ناعم،
// بيانات أعمق (هدّافون، سجلّ تاريخي، مركز مباراة كامل، ملفات منتخبات موسّعة).
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

// MARK: - الرئيسية

private struct GcHomeScreen: View {
    @Bindable var store: GcHubStore
    let onSelectTab: (GcTab) -> Void

    var body: some View {
        GcScreenScaffold {
            VStack(spacing: 18) {
                GcHomeHero(store: store)

                if let loadError = store.loadError {
                    GcErrorCard(message: loadError) { await store.loadAll(force: true) }
                }

                if !store.live.isEmpty {
                    GcLiveRail(fixtures: store.live)
                }

                if !store.todayFixtures.isEmpty && store.overview?.started == true {
                    VStack(spacing: 10) {
                        GcSectionHeader(icon: "sun.max.fill", title: L("home.today.title"), tint: GcTheme.amber)
                        GcMatchListCard(fixtures: store.todayFixtures)
                    }
                }

                GcPredictionsBanner { onSelectTab(.predictions) }

                if let saudi = store.overview?.saudi, saudi.team != nil || !saudi.fixtures.isEmpty {
                    GcSaudiSpotlight(saudi: saudi, history: store.history)
                }

                GcNextFixturesPreview(fixtures: Array(store.upcoming.prefix(3)), loading: store.loading, onOpen: { onSelectTab(.matches) })

                if !store.groups.isEmpty {
                    VStack(spacing: 10) {
                        GcSectionHeader(icon: "rectangle.3.group", title: L("home.standings.title"), tint: GcTheme.teal, action: { onSelectTab(.tournament) })
                        ForEach(store.groups) { GcGroupCard(group: $0) }
                    }
                }

                if let board = store.scorers, !board.scorers.isEmpty {
                    GcScorersPreview(board: board) { onSelectTab(.tournament) }
                }

                if let history = store.history {
                    GcHistoryTeaser(history: history) { onSelectTab(.tournament) }
                }

                GcFooterSignature()
            }
        }
        .refreshable { await store.loadAll(force: true) }
        .navigationBarHidden(true)
    }
}

/// الترويسة الغامرة — شعار + عدّ تنازلي قبل الانطلاق، أو حالة البطولة الحيّة.
private struct GcHomeHero: View {
    @Bindable var store: GcHubStore
    @State private var countdown = GcCountdown(days: 0, hours: 0, minutes: 0, seconds: 0, total: 0)
    private let timer = Timer.publish(every: 1, on: .main, in: .common).autoconnect()

    private var started: Bool { store.overview?.started == true }

    var body: some View {
        GcHeroPanel {
            VStack(spacing: 14) {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 3) {
                        Text(L("app.title"))
                            .font(GulfCupFonts.headline(size: 27))
                            .foregroundStyle(GcTheme.goldTitleGradient)
                        Text(L("hero.badge.special"))
                            .font(GulfCupFonts.app(size: 12, weight: .semibold))
                            .foregroundStyle(GcTheme.onHeroDim)
                    }
                    Spacer()
                    GcEmblem(height: 58)
                }

                HStack(spacing: 7) {
                    GcHeroBadge(icon: "mappin.circle.fill", text: L("app.host"), tint: GcTheme.goldLite)
                    if started {
                        HStack(spacing: 5) {
                            GcLiveDot()
                            Text(L("hero.liveNow")).font(GulfCupFonts.app(size: 11, weight: .bold))
                        }
                        .foregroundStyle(.white)
                        .padding(.horizontal, 10).padding(.vertical, 5)
                        .background(Capsule().fill(GcTheme.liveRed))
                    }
                    Spacer()
                }

                if !started {
                    countdownView
                }

                if let next = store.overview?.nextMatch {
                    nextMatchStrip(next)
                } else if let range = store.overview.map({ GcFormat.dateRange(startIso: $0.startsAt, endIso: $0.endsAt) }), !range.isEmpty {
                    Text(range)
                        .font(GulfCupFonts.app(size: 12, weight: .semibold))
                        .foregroundStyle(GcTheme.onHeroFaint)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
            .padding(18)
        }
        .padding(.top, 8)
        .onAppear { tick() }
        .onReceive(timer) { _ in tick() }
    }

    private func nextMatchStrip(_ fx: GcFixture) -> some View {
        NavigationLink {
            GcMatchCenterScreen(fixture: fx)
        } label: {
            HStack(spacing: 10) {
                VStack(alignment: .leading, spacing: 1) {
                    Text(L("home.next.title")).font(GulfCupFonts.app(size: 10, weight: .bold)).foregroundStyle(GcTheme.onHeroFaint)
                    Text(GcFormat.relativeKickoff(fx.date)).font(GulfCupFonts.app(size: 11, weight: .bold)).foregroundStyle(.white)
                }
                Spacer()
                GcTeamLogo(logo: fx.home.logo, size: 27)
                Text(fx.home.name).font(GulfCupFonts.app(size: 12.5, weight: .bold)).foregroundStyle(.white).lineLimit(1)
                Text(GcFormat.kickoffTime(fx.date))
                    .font(GulfCupFonts.app(size: 12, weight: .bold)).foregroundStyle(GcTheme.goldLite)
                    .monospacedDigit().environment(\.layoutDirection, .leftToRight)
                Text(fx.away.name).font(GulfCupFonts.app(size: 12.5, weight: .bold)).foregroundStyle(.white).lineLimit(1)
                GcTeamLogo(logo: fx.away.logo, size: 27)
            }
            .padding(11)
            .background(RoundedRectangle(cornerRadius: 13, style: .continuous).fill(.white.opacity(0.08)))
            .overlay(RoundedRectangle(cornerRadius: 13, style: .continuous).stroke(.white.opacity(0.07), lineWidth: 1))
        }
        .buttonStyle(GcPressStyle())
    }

    private var countdownView: some View {
        HStack(spacing: 6) {
            cdUnit(countdown.days, L("countdown.days"))
            cdSep
            cdUnit(countdown.hours, L("countdown.hours"))
            cdSep
            cdUnit(countdown.minutes, L("countdown.minutes"))
            cdSep
            cdUnit(countdown.seconds, L("countdown.seconds"))
        }
        .environment(\.layoutDirection, .leftToRight)
        .frame(maxWidth: .infinity)
    }

    private var cdSep: some View {
        Text(":").font(GulfCupFonts.app(size: 18, weight: .black)).foregroundStyle(GcTheme.goldLite.opacity(0.4)).padding(.bottom, 14)
    }

    private func cdUnit(_ v: Int, _ label: String) -> some View {
        VStack(spacing: 4) {
            Text(String(format: "%02d", v))
                .font(GulfCupFonts.app(size: 23, weight: .bold))
                .foregroundStyle(.white)
                .monospacedDigit()
                .frame(minWidth: 46)
                .padding(.vertical, 8)
                .background(RoundedRectangle(cornerRadius: 11, style: .continuous).fill(.white.opacity(0.09)))
                .overlay(RoundedRectangle(cornerRadius: 11, style: .continuous).stroke(GcTheme.goldLite.opacity(0.14), lineWidth: 1))
            Text(label).font(GulfCupFonts.app(size: 9.5, weight: .semibold)).foregroundStyle(GcTheme.onHeroFaint)
        }
    }

    private func tick() {
        countdown = GcCountdownMath.to(iso: store.overview?.startsAt)
    }
}

/// شريط المباشر — بطاقات أفقية تفتح مركز المباراة.
private struct GcLiveRail: View {
    let fixtures: [GcFixture]
    var body: some View {
        VStack(spacing: 10) {
            GcSectionHeader(icon: "dot.radiowaves.left.and.right", title: L("home.live.title"), tint: GcTheme.liveRed)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 10) {
                    ForEach(fixtures) { fx in
                        NavigationLink {
                            GcMatchCenterScreen(fixture: fx)
                        } label: {
                            VStack(spacing: 9) {
                                HStack(spacing: 5) {
                                    GcLiveDot()
                                    Text(fx.status.elapsed.map { "\($0)'" } ?? L("state.live"))
                                        .font(GulfCupFonts.app(size: 10, weight: .bold))
                                }
                                .foregroundStyle(.white)
                                .padding(.horizontal, 8).padding(.vertical, 3)
                                .background(Capsule().fill(GcTheme.liveRed))

                                HStack(spacing: 9) {
                                    GcTeamLogo(logo: fx.home.logo, size: 24)
                                    Text("\(fx.goals.away ?? 0) - \(fx.goals.home ?? 0)")
                                        .font(GulfCupFonts.app(size: 17, weight: .bold))
                                        .foregroundStyle(GcTheme.ink)
                                        .monospacedDigit()
                                        .environment(\.layoutDirection, .leftToRight)
                                    GcTeamLogo(logo: fx.away.logo, size: 24)
                                }
                            }
                            .padding(12)
                            .frame(width: 140)
                            .gcCard(stroke: GcTheme.liveRed.opacity(0.35))
                        }
                        .buttonStyle(GcPressStyle())
                    }
                }
            }
        }
    }
}

private struct GcPredictionsBanner: View {
    let action: () -> Void
    var body: some View {
        Button(action: action) {
            HStack(spacing: 12) {
                Image(systemName: "sparkles")
                    .font(.system(size: 19, weight: .bold))
                    .foregroundStyle(GcTheme.heroDeep)
                    .frame(width: 44, height: 44)
                    .background(RoundedRectangle(cornerRadius: 13, style: .continuous).fill(GcTheme.goldFill))
                VStack(alignment: .leading, spacing: 3) {
                    Text(L("predictions.hero.title")).font(GulfCupFonts.app(size: 14.5, weight: .bold)).foregroundStyle(GcTheme.ink)
                    Text(L("predictions.subtitle")).font(GulfCupFonts.app(size: 11)).foregroundStyle(GcTheme.inkDim)
                }
                Spacer()
                Image(systemName: "chevron.left").font(.system(size: 12, weight: .bold)).foregroundStyle(GcTheme.gold)
            }
            .padding(13)
            .gcCard(stroke: GcTheme.gold.opacity(0.30))
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
        VStack(spacing: 10) {
            GcSectionHeader(icon: "flag.fill", title: L("saudi.title"), subtitle: saudi.group, tint: GcTheme.emerald)
            if let team = saudi.team {
                NavigationLink {
                    GcTeamProfileScreen(teamId: team.id, fallback: team)
                } label: {
                    HStack(spacing: 12) {
                        GcTeamLogo(logo: team.logo, size: 46)
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
                    .padding(13)
                    .gcCard(stroke: GcTheme.gold.opacity(0.22))
                }
                .buttonStyle(GcPressStyle())
            }
            if !saudi.fixtures.isEmpty {
                GcMatchListCard(fixtures: Array(saudi.fixtures.prefix(3)))
            }
        }
    }
}

private struct GcNextFixturesPreview: View {
    let fixtures: [GcFixture]
    let loading: Bool
    let onOpen: () -> Void
    var body: some View {
        VStack(spacing: 10) {
            GcSectionHeader(icon: "clock.fill", title: L("home.next.title"), tint: GcTheme.gold, action: fixtures.isEmpty ? nil : onOpen)
            if loading && fixtures.isEmpty {
                GcLoadingPanel(title: L("loading.matches"))
            } else if fixtures.isEmpty {
                GcEmptyState(icon: "calendar.badge.clock", title: L("home.next.empty.title"), subtitle: L("home.next.empty.subtitle"))
            } else {
                GcMatchListCard(fixtures: fixtures)
            }
        }
    }
}

/// أعلى 3 هدّافين — معاينة نحو تبويب البطولة.
private struct GcScorersPreview: View {
    let board: GcScorersBoard
    let onOpen: () -> Void

    var body: some View {
        VStack(spacing: 10) {
            GcSectionHeader(
                icon: "soccerball",
                title: L("home.scorers.title"),
                subtitle: board.isCurrent ? nil : L("scorers.lastEdition"),
                tint: GcTheme.emerald,
                action: onOpen
            )
            VStack(spacing: 0) {
                ForEach(Array(board.scorers.prefix(3).enumerated()), id: \.element.id) { idx, s in
                    if idx > 0 { Rectangle().fill(GcTheme.outline).frame(height: 1).padding(.leading, 14) }
                    HStack(spacing: 11) {
                        Text("\(s.rank)")
                            .font(GulfCupFonts.app(size: 13, weight: .bold))
                            .foregroundStyle(s.rank == 1 ? GcTheme.goldDeep : GcTheme.inkFaint)
                            .frame(width: 18)
                        GcPlayerPhoto(url: s.photo, size: 38)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(s.name).font(GulfCupFonts.app(size: 13, weight: .bold)).foregroundStyle(GcTheme.ink).lineLimit(1)
                            Text(s.team.name).font(GulfCupFonts.app(size: 10.5)).foregroundStyle(GcTheme.inkDim)
                        }
                        Spacer()
                        VStack(spacing: 1) {
                            Text("\(s.goals)").font(GulfCupFonts.app(size: 16, weight: .bold)).foregroundStyle(GcTheme.emerald).monospacedDigit()
                            Text(L("scorers.goals")).font(GulfCupFonts.app(size: 9)).foregroundStyle(GcTheme.inkFaint)
                        }
                    }
                    .padding(.horizontal, 14).padding(.vertical, 9)
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
            .padding(13)
            .gcCard()
        }
        .buttonStyle(GcPressStyle())
    }

    private func legacyTile(logo: String, title: String, caption: String) -> some View {
        HStack(spacing: 9) {
            GcTeamLogo(logo: logo, size: 34)
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(GulfCupFonts.app(size: 12.5, weight: .bold)).foregroundStyle(GcTheme.ink).lineLimit(1)
                Text(caption).font(GulfCupFonts.app(size: 9.5)).foregroundStyle(GcTheme.inkDim).lineLimit(1)
            }
            Spacer(minLength: 0)
        }
        .padding(10)
        .frame(maxWidth: .infinity)
        .background(RoundedRectangle(cornerRadius: GcTheme.tileRadius, style: .continuous).fill(GcTheme.cardBgSubtle))
        .overlay(RoundedRectangle(cornerRadius: GcTheme.tileRadius, style: .continuous).stroke(GcTheme.gold.opacity(0.16), lineWidth: 1))
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
