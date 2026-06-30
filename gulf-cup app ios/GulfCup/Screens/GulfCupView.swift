import SwiftUI
import AuthenticationServices

// تطبيق «خليجي 27» — 5 تبويبات: الرئيسية · المباريات · التوقعات · المجموعات · المزيد
struct GulfCupView: View {
    @State private var overview: GcOverview?
    @State private var fixtures: [GcFixture] = []
    @State private var teams: [GcTeam] = []
    @State private var groups: [GcGroup] = []
    @State private var loading = true
    @State private var loadError: String?
    @State private var selectedTab: GcTab = .home

    var body: some View {
        TabView(selection: $selectedTab) {
            NavigationStack {
                GcHomeScreen(
                    overview: overview, fixtures: fixtures, teams: teams, groups: groups,
                    loading: loading, loadError: loadError,
                    onSelectTab: { selectedTab = $0 },
                    refresh: { await loadAll(force: true) }
                )
            }
            .tabItem { Label(L("tab.home"), systemImage: "house.fill") }
            .tag(GcTab.home)

            NavigationStack {
                GcMatchesScreen(fixtures: fixtures, loading: loading, refresh: { await loadAll(force: true) })
            }
            .tabItem { Label(L("tab.matches"), systemImage: "calendar") }
            .tag(GcTab.matches)

            NavigationStack {
                GcPredictionsScreen(refreshMain: { await loadAll(force: true) })
            }
            .tabItem { Label(L("tab.predictions"), systemImage: "sparkles") }
            .tag(GcTab.predictions)

            NavigationStack {
                GcGroupsScreen(groups: groups, loading: loading, refresh: { await loadAll(force: true) })
            }
            .tabItem { Label(L("tab.groups"), systemImage: "rectangle.3.group") }
            .tag(GcTab.groups)

            NavigationStack {
                GcMoreScreen(overview: overview, teams: teams, fixtures: fixtures, loading: loading, refresh: { await loadAll(force: true) })
            }
            .tabItem { Label(L("tab.more"), systemImage: "square.grid.2x2.fill") }
            .tag(GcTab.more)
        }
        .tint(GcTheme.emerald)
        .toolbarBackground(GcTheme.graphiteHi, for: .tabBar)
        .toolbarBackground(.visible, for: .tabBar)
        .task { await loadAll() }
    }

    private func loadAll(force: Bool = false) async {
        if !force { loading = true }
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
    }
}

enum GcTab: Hashable { case home, matches, predictions, groups, more }

// MARK: - الرئيسية

private struct GcHomeScreen: View {
    let overview: GcOverview?
    let fixtures: [GcFixture]
    let teams: [GcTeam]
    let groups: [GcGroup]
    let loading: Bool
    let loadError: String?
    let onSelectTab: (GcTab) -> Void
    let refresh: () async -> Void

    private var upcoming: [GcFixture] {
        fixtures.filter { !$0.status.finished }.sorted { $0.timestamp < $1.timestamp }
    }

    var body: some View {
        GcScreenScaffold {
            VStack(spacing: 20) {
                GcTopBar(title: L("app.title"), subtitle: L("app.host"), live: overview?.started == true)
                GcHomeHero(overview: overview, loading: loading)
                if let loadError {
                    GcRefreshBanner(message: loadError, refresh: refresh)
                }
                GcDashboardGrid(overview: overview, fixturesCount: fixtures.count, groups: groups, onSelectTab: onSelectTab)
                GcPredictionsBanner { onSelectTab(.predictions) }
                if let saudi = overview?.saudi, saudi.team != nil || !saudi.fixtures.isEmpty {
                    GcSaudiSpotlight(saudi: saudi)
                }
                GcNextFixturesPreview(fixtures: upcoming, onOpen: { onSelectTab(.matches) })
                if let ov = overview, !ov.venues.isEmpty {
                    GcVenuesPreview(venues: ov.venues, onOpen: { onSelectTab(.more) })
                }
                GcFooterSignature()
            }
        }
        .refreshable { await refresh() }
        .navigationBarHidden(true)
    }
}

private struct GcTopBar: View {
    let title: String
    let subtitle: String
    var live: Bool = false
    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 3) {
                Text(title).font(GulfCupFonts.headline(size: 26)).foregroundStyle(GcTheme.onDark)
                Text(subtitle).font(GulfCupFonts.app(size: 12)).foregroundStyle(GcTheme.onDarkDim)
            }
            Spacer()
            if live {
                GcHeroBadge(icon: "dot.radiowaves.left.and.right", text: L("state.live"), tint: GcTheme.crimson, onDark: false)
            }
        }
        .padding(.top, 8)
    }
}

private struct GcHomeHero: View {
    let overview: GcOverview?
    let loading: Bool
    @State private var countdown = GcCountdown(days: 0, hours: 0, minutes: 0, seconds: 0, total: 0)
    let timer = Timer.publish(every: 1, on: .main, in: .common).autoconnect()

    var body: some View {
        VStack(spacing: 16) {
            ZStack {
                RoundedRectangle(cornerRadius: 28, style: .continuous).fill(GcTheme.heroGradient)
                GcLatticePattern(spacing: 32).opacity(0.05).clipShape(RoundedRectangle(cornerRadius: 28, style: .continuous))
                Circle().fill(GcTheme.emerald.opacity(0.25)).frame(width: 220).blur(radius: 60).offset(x: -80, y: -60)
                Circle().fill(GcTheme.gold.opacity(0.12)).frame(width: 180).blur(radius: 50).offset(x: 90, y: 70)

                VStack(spacing: 14) {
                    GcEmblem(height: 100)
                    HStack(spacing: 8) {
                        GcHeroBadge(icon: "trophy.fill", text: L("hero.badge.special"))
                        GcHeroBadge(icon: "mappin.circle.fill", text: L("hero.hostedBy"), tint: GcTheme.emeraldSoft)
                    }
                    Text(L("hero.subtitle"))
                        .font(GulfCupFonts.app(size: 13))
                        .foregroundStyle(GcTheme.onHeroDim)
                        .multilineTextAlignment(.center)

                    if overview?.started == true {
                        Text(L("hero.liveNow"))
                            .font(GulfCupFonts.app(size: 15, weight: .bold))
                            .foregroundStyle(GcTheme.amber)
                    } else {
                        countdownView
                    }

                    if let range = overview.map({ GcFormat.dateRange(startIso: $0.startsAt, endIso: $0.endsAt) }), !range.isEmpty {
                        Text(range).font(GulfCupFonts.app(size: 12, weight: .semibold)).foregroundStyle(GcTheme.onHeroFaint)
                    }
                }
                .padding(20)
            }
            .frame(minHeight: 320)
            .overlay(RoundedRectangle(cornerRadius: 28, style: .continuous).stroke(GcTheme.gold.opacity(0.2), lineWidth: 1))

            if loading { GcLoadingPanel(title: L("loading.hub")) }
        }
        .onAppear { tick() }
        .onReceive(timer) { _ in tick() }
    }

    private var countdownView: some View {
        VStack(spacing: 8) {
            Text(L("countdown.title")).font(GulfCupFonts.app(size: 11, weight: .semibold)).foregroundStyle(GcTheme.onHeroFaint)
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
        }
    }

    private var cdSep: some View {
        Text(":").font(GulfCupFonts.app(size: 22, weight: .black)).foregroundStyle(GcTheme.emeraldSoft.opacity(0.5)).padding(.bottom, 16)
    }

    private func cdUnit(_ v: Int, _ label: String) -> some View {
        VStack(spacing: 4) {
            Text(String(format: "%02d", v))
                .font(GulfCupFonts.app(size: 28, weight: .bold))
                .foregroundStyle(.white)
                .monospacedDigit()
                .frame(minWidth: 52)
                .padding(.vertical, 8)
                .background(RoundedRectangle(cornerRadius: 14).fill(.white.opacity(0.08)))
                .overlay(RoundedRectangle(cornerRadius: 14).stroke(GcTheme.gold.opacity(0.25), lineWidth: 1))
            Text(label).font(GulfCupFonts.app(size: 10, weight: .semibold)).foregroundStyle(GcTheme.onHeroFaint)
        }
    }

    private func tick() {
        countdown = GcCountdownMath.to(iso: overview?.startsAt)
    }
}

private struct GcDashboardGrid: View {
    let overview: GcOverview?
    let fixturesCount: Int
    let groups: [GcGroup]
    let onSelectTab: (GcTab) -> Void

    var body: some View {
        VStack(spacing: 12) {
            GcSectionHeader(icon: "square.grid.2x2.fill", title: L("dashboard.title"), subtitle: L("dashboard.subtitle"), tint: GcTheme.emerald)
            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
                tile("calendar", L("tab.matches"), "\(fixturesCount)", GcTheme.gold) { onSelectTab(.matches) }
                tile("sparkles", L("tab.predictions"), L("dashboard.value.new"), GcTheme.emerald) { onSelectTab(.predictions) }
                tile("rectangle.3.group", L("tab.groups"), "\(groups.count)", GcTheme.teal) { onSelectTab(.groups) }
                tile("flag.fill", L("metric.team"), "\(overview?.teamsCount ?? 8)", GcTheme.goldDeep) { onSelectTab(.more) }
            }
        }
    }

    private func tile(_ icon: String, _ title: String, _ value: String, _ tint: Color, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 8) {
                Image(systemName: icon).font(.system(size: 20, weight: .semibold)).foregroundStyle(tint)
                Text(value).font(GulfCupFonts.app(size: 22, weight: .bold)).foregroundStyle(GcTheme.onDark)
                Text(title).font(GulfCupFonts.app(size: 12, weight: .semibold)).foregroundStyle(GcTheme.onDarkDim)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(14)
            .background(RoundedRectangle(cornerRadius: GcTheme.tileRadius, style: .continuous).fill(GcTheme.cardFillStrong))
            .overlay(RoundedRectangle(cornerRadius: GcTheme.tileRadius, style: .continuous).stroke(GcTheme.outline, lineWidth: 1))
        }
        .buttonStyle(.plain)
    }
}

private struct GcPredictionsBanner: View {
    let action: () -> Void
    var body: some View {
        Button(action: action) {
            HStack(spacing: 14) {
                Image(systemName: "sparkles")
                    .font(.system(size: 26, weight: .bold))
                    .foregroundStyle(GcTheme.emeraldDeep)
                    .frame(width: 52, height: 52)
                    .background(RoundedRectangle(cornerRadius: 16).fill(GcTheme.gold))
                VStack(alignment: .leading, spacing: 4) {
                    Text(L("banner.predictions.title")).font(GulfCupFonts.app(size: 16, weight: .bold)).foregroundStyle(GcTheme.onDark)
                    Text(L("banner.predictions.subtitle")).font(GulfCupFonts.app(size: 12)).foregroundStyle(GcTheme.onDarkDim)
                }
                Spacer()
                Image(systemName: "chevron.left").foregroundStyle(GcTheme.emerald)
            }
            .padding(14)
            .background(
                LinearGradient(colors: [GcTheme.gold.opacity(0.18), GcTheme.emerald.opacity(0.10)], startPoint: .topTrailing, endPoint: .bottomLeading)
            )
            .clipShape(RoundedRectangle(cornerRadius: GcTheme.cardRadius, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: GcTheme.cardRadius, style: .continuous).stroke(GcTheme.gold.opacity(0.25), lineWidth: 1))
        }
        .buttonStyle(.plain)
    }
}

private struct GcSaudiSpotlight: View {
    let saudi: GcSaudi
    var body: some View {
        VStack(spacing: 12) {
            GcSectionHeader(icon: "flag.fill", title: L("team.saudi"), subtitle: saudi.group.map { L("saudi.subtitle.in", ["group": $0]) } ?? L("saudi.subtitle.fallback"), tint: GcTheme.emerald)
            if let team = saudi.team {
                HStack(spacing: 12) {
                    GcTeamLogo(logo: team.logo, size: 52)
                    VStack(alignment: .leading, spacing: 4) {
                        Text(team.name).font(GulfCupFonts.app(size: 18, weight: .bold)).foregroundStyle(GcTheme.onDark)
                        GcHeroBadge(icon: "star.fill", text: L("saudi.host"), tint: GcTheme.goldDeep, onDark: false)
                    }
                    Spacer()
                }
                .padding(14)
                .background(RoundedRectangle(cornerRadius: GcTheme.cardRadius).fill(GcTheme.cardFillStrong))
                .overlay(RoundedRectangle(cornerRadius: GcTheme.cardRadius).stroke(GcTheme.emerald.opacity(0.2), lineWidth: 1))
            }
            if !saudi.fixtures.isEmpty {
                Text(L("saudi.matches")).font(GulfCupFonts.app(size: 13, weight: .semibold)).foregroundStyle(GcTheme.onDarkDim).frame(maxWidth: .infinity, alignment: .leading)
                ForEach(saudi.fixtures.prefix(3)) { GcMatchCard(fixture: $0) }
            }
        }
    }
}

private struct GcNextFixturesPreview: View {
    let fixtures: [GcFixture]
    let onOpen: () -> Void
    var body: some View {
        VStack(spacing: 12) {
            GcSectionHeader(icon: "clock.fill", title: L("home.next.title"), count: fixtures.isEmpty ? nil : min(fixtures.count, 3), tint: GcTheme.gold)
            if fixtures.isEmpty {
                GcEmptyState(icon: "calendar.badge.clock", title: L("home.next.empty.title"), subtitle: L("home.next.empty.subtitle"))
            } else {
                ForEach(fixtures.prefix(3)) { GcMatchCard(fixture: $0) }
                Button(action: onOpen) {
                    Label(L("home.next.viewAll"), systemImage: "calendar")
                        .font(GulfCupFonts.app(size: 13, weight: .bold))
                        .foregroundStyle(GcTheme.emerald)
                        .frame(maxWidth: .infinity).padding(.vertical, 12)
                        .background(RoundedRectangle(cornerRadius: GcTheme.buttonRadius).fill(GcTheme.chipFill))
                }
                .buttonStyle(.plain)
            }
        }
    }
}

private struct GcVenuesPreview: View {
    let venues: [GcVenue]
    let onOpen: () -> Void
    var body: some View {
        VStack(spacing: 10) {
            GcSectionHeader(icon: "building.2.fill", title: L("home.venues.title"), subtitle: L("home.venues.subtitle"), count: venues.count, tint: GcTheme.teal)
            ForEach(Array(venues.enumerated()), id: \.offset) { _, v in
                HStack(spacing: 10) {
                    Image(systemName: "sportscourt.fill").foregroundStyle(GcTheme.emerald)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(v.name).font(GulfCupFonts.app(size: 14, weight: .semibold)).foregroundStyle(GcTheme.onDark)
                        Text(v.city).font(GulfCupFonts.app(size: 11)).foregroundStyle(GcTheme.onDarkDim)
                    }
                    Spacer()
                }
                .padding(12)
                .background(RoundedRectangle(cornerRadius: 14).fill(GcTheme.cardFill))
            }
            Button(L("home.venues.all"), action: onOpen)
                .font(GulfCupFonts.app(size: 13, weight: .bold))
                .foregroundStyle(GcTheme.emerald)
        }
    }
}

private struct GcRefreshBanner: View {
    let message: String
    let refresh: () async -> Void
    var body: some View {
        VStack(spacing: 8) {
            Text(L("refresh.error.title")).font(GulfCupFonts.app(size: 14, weight: .bold)).foregroundStyle(GcTheme.crimson)
            Text(message).font(GulfCupFonts.app(size: 12)).foregroundStyle(GcTheme.onDarkDim).multilineTextAlignment(.center)
            Button("إعادة المحاولة") { Task { await refresh() } }
                .font(GulfCupFonts.app(size: 13, weight: .bold)).foregroundStyle(GcTheme.emerald)
        }
        .padding(14)
        .background(RoundedRectangle(cornerRadius: 16).fill(GcTheme.cardFill))
    }
}

// MARK: - المباريات

private struct GcMatchesScreen: View {
    let fixtures: [GcFixture]
    let loading: Bool
    let refresh: () async -> Void
    @State private var roundFilter: String?

    private var rounds: [String] {
        Array(Set(fixtures.map(\.roundEn))).sorted()
    }

    private var filtered: [GcFixture] {
        guard let r = roundFilter else { return fixtures }
        return fixtures.filter { $0.roundEn == r }
    }

    var body: some View {
        GcScreenScaffold {
            VStack(spacing: 16) {
                GcTopBar(title: L("tab.matches"), subtitle: L("matches.subtitle"))
                statsRow
                if rounds.count > 1 {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            filterChip(L("schedule.round.all"), nil)
                            ForEach(rounds, id: \.self) { filterChip($0, $0) }
                        }
                    }
                }
                GcSectionHeader(icon: "calendar", title: L("schedule.title"), count: filtered.count, tint: GcTheme.gold)
                if filtered.isEmpty && !loading {
                    GcEmptyState(icon: "sportscourt", title: L("schedule.empty.title"), subtitle: L("schedule.empty.subtitle"))
                } else {
                    ForEach(GcFixtureMath.groupByDay(filtered)) { day in
                        VStack(alignment: .leading, spacing: 8) {
                            Text(day.label).font(GulfCupFonts.app(size: 14, weight: .bold)).foregroundStyle(GcTheme.emerald)
                            ForEach(day.items) { GcMatchCard(fixture: $0) }
                        }
                    }
                }
                if loading { GcLoadingPanel(title: L("loading.matches")) }
                GcFooterSignature()
            }
        }
        .refreshable { await refresh() }
        .navigationBarHidden(true)
    }

    private var statsRow: some View {
        HStack(spacing: 8) {
            stat("\(fixtures.count)", L("matchesHero.matches"), GcTheme.gold)
            stat("\(fixtures.filter { $0.status.finished }.count)", L("matchesHero.finished"), GcTheme.emeraldSoft)
            stat("\(fixtures.filter { $0.status.live }.count)", L("state.live"), GcTheme.crimson)
        }
    }

    private func stat(_ v: String, _ l: String, _ c: Color) -> some View {
        VStack(spacing: 3) {
            Text(v).font(GulfCupFonts.app(size: 18, weight: .bold)).foregroundStyle(c).monospacedDigit()
            Text(l).font(GulfCupFonts.app(size: 10)).foregroundStyle(GcTheme.onDarkDim)
        }
        .frame(maxWidth: .infinity).padding(.vertical, 10)
        .background(RoundedRectangle(cornerRadius: 14).fill(GcTheme.cardFill))
    }

    private func filterChip(_ title: String, _ value: String?) -> some View {
        Button { roundFilter = value } label: {
            Text(title).font(GulfCupFonts.app(size: 12, weight: .semibold))
                .foregroundStyle(roundFilter == value ? .white : GcTheme.onDarkDim)
                .padding(.horizontal, 12).padding(.vertical, 7)
                .background(Capsule().fill(roundFilter == value ? GcTheme.emerald : GcTheme.chipFill))
        }
        .buttonStyle(.plain)
    }
}

// MARK: - المجموعات

private struct GcGroupsScreen: View {
    let groups: [GcGroup]
    let loading: Bool
    let refresh: () async -> Void

    var body: some View {
        GcScreenScaffold {
            VStack(spacing: 16) {
                GcTopBar(title: L("tab.groups"), subtitle: L("groups.subtitle"))
                GcSectionHeader(icon: "rectangle.3.group", title: L("standings.section.title"), subtitle: L("standings.section.subtitle"), count: groups.count, tint: GcTheme.emerald)
                if groups.isEmpty && !loading {
                    GcEmptyState(icon: "tablecells", title: L("groups.empty.title"), subtitle: L("groups.empty.subtitle"))
                } else {
                    ForEach(groups) { GcGroupCard(group: $0) }
                }
                if loading { GcLoadingPanel(title: L("loading.standings")) }
                GcFooterSignature()
            }
        }
        .refreshable { await refresh() }
        .navigationBarHidden(true)
    }
}

// MARK: - التوقعات

private enum GcPredSegment: String, CaseIterable, Identifiable {
    case matches, leaderboard, long
    var id: String { rawValue }
    var title: String {
        switch self {
        case .matches: return L("tab.matches")
        case .leaderboard: return L("predictions.leaderboard")
        case .long: return L("predictions.long")
        }
    }
}

private struct GcPredictionsScreen: View {
    let refreshMain: () async -> Void
    @State private var today: GcPredictionsTodayResponse?
    @State private var leaders: [GcPredictionLeader] = []
    @State private var longData: GcLongData?
    @State private var loading = true
    @State private var errorMessage: String?
    @State private var segment: GcPredSegment = .matches

    var body: some View {
        GcScreenScaffold {
            VStack(spacing: 16) {
                GcTopBar(title: L("tab.predictions"), subtitle: L("predictions.subtitle"))
                GcPredictionsHero(me: today?.me, jackpot: today?.jackpot ?? 0)
                Picker("", selection: $segment) {
                    ForEach(GcPredSegment.allCases) { Text($0.title).tag($0) }
                }
                .pickerStyle(.segmented)

                if let errorMessage {
                    GcPredUnavailable(message: errorMessage)
                } else if loading {
                    GcLoadingPanel(title: L("loading.predictions"))
                } else {
                    switch segment {
                    case .matches:
                        GcPredMatchesList(matches: today?.matches ?? [], reload: { await load(force: true) })
                    case .leaderboard: GcPredLeaderboard(leaders: leaders)
                    case .long: GcLongPredictionsView(data: longData, reload: { await load(force: true) })
                    }
                }
                GcFooterSignature()
            }
        }
        .task { await load() }
        .refreshable { await load(force: true); await refreshMain() }
        .navigationBarHidden(true)
    }

    private func load(force: Bool = false) async {
        loading = true
        do {
            async let t = APIClient.shared.fetchGcPredictionsToday(ignoreCache: force)
            async let l = APIClient.shared.fetchGcPredictionsLeaderboard(ignoreCache: force)
            async let lg = APIClient.shared.fetchGcLongPredictions(ignoreCache: force)
            today = try await t
            leaders = try await l
            longData = try await lg
            errorMessage = nil
        } catch let err as APIError {
            if case .server(503, _) = err { errorMessage = L("predictions.unavailable") }
            else { errorMessage = LError(err) }
        } catch { errorMessage = LError(error) }
        loading = false
    }
}

private struct GcPredictionsHero: View {
    let me: GcPredictionMeStats?
    let jackpot: Int
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 12) {
                Image(systemName: "sparkles").font(.system(size: 24, weight: .bold)).foregroundStyle(GcTheme.emeraldDeep)
                    .frame(width: 52, height: 52).background(RoundedRectangle(cornerRadius: 16).fill(GcTheme.gold))
                VStack(alignment: .leading, spacing: 4) {
                    Text(L("predictions.hero.title")).font(GulfCupFonts.app(size: 16, weight: .bold)).foregroundStyle(GcTheme.onDark)
                    Text(L("predictions.hero.subtitle")).font(GulfCupFonts.app(size: 11)).foregroundStyle(GcTheme.onDarkDim)
                }
            }
            HStack(spacing: 8) {
                predStat("\(me?.points ?? 0)", L("predictions.stat.points"))
                predStat("\(me?.exact ?? 0)", L("predictions.stat.exact"))
                predStat("\(jackpot)", L("predictions.jackpot"))
            }
        }
        .padding(14)
        .background(RoundedRectangle(cornerRadius: 24).fill(GcTheme.cardFillStrong))
        .overlay(RoundedRectangle(cornerRadius: 24).stroke(GcTheme.outline, lineWidth: 1))
    }

    private func predStat(_ v: String, _ l: String) -> some View {
        VStack(spacing: 2) {
            Text(v).font(GulfCupFonts.app(size: 17, weight: .bold)).foregroundStyle(GcTheme.goldDeep).monospacedDigit()
            Text(l).font(GulfCupFonts.app(size: 9, weight: .semibold)).foregroundStyle(GcTheme.onDarkDim)
        }
        .frame(maxWidth: .infinity).padding(.vertical, 8)
        .background(RoundedRectangle(cornerRadius: 12).fill(GcTheme.chipFill))
    }
}

private struct GcPredMatchesList: View {
    let matches: [GcPredictableMatch]
    let reload: () async -> Void

    var body: some View {
        VStack(spacing: 12) {
            if matches.isEmpty {
                GcEmptyState(icon: "sparkles.rectangle.stack", title: L("predictions.empty.title"), subtitle: L("predictions.empty.subtitle"))
            } else {
                ForEach(matches) { match in
                    GcPredictionMatchCard(match: match, onSubmitted: reload)
                }
            }
        }
    }
}

private struct GcPredLeaderboard: View {
    let leaders: [GcPredictionLeader]
    var body: some View {
        VStack(spacing: 10) {
            if leaders.isEmpty {
                GcEmptyState(icon: "list.number", title: L("leaderboard.empty.title"), subtitle: L("leaderboard.empty.subtitle"))
            } else {
                ForEach(leaders.prefix(25)) { row in
                    HStack(spacing: 12) {
                        Text("\(row.rank)").font(GulfCupFonts.app(size: 15, weight: .bold))
                            .foregroundStyle(row.rank <= 3 ? GcTheme.gold : GcTheme.onDarkDim)
                            .frame(width: 32, height: 32)
                            .background(Circle().fill(row.rank <= 3 ? GcTheme.gold.opacity(0.15) : GcTheme.chipFill))
                        VStack(alignment: .leading, spacing: 2) {
                            Text(row.name).font(GulfCupFonts.app(size: 14, weight: .bold)).lineLimit(1)
                            Text("\(row.correctCount) صحيحة · \(row.exactCount) دقيقة")
                                .font(GulfCupFonts.app(size: 11)).foregroundStyle(GcTheme.onDarkDim)
                        }
                        Spacer()
                        Text("\(row.totalPoints)").font(GulfCupFonts.app(size: 16, weight: .bold)).foregroundStyle(GcTheme.goldDeep).monospacedDigit()
                    }
                    .padding(12)
                    .background(RoundedRectangle(cornerRadius: 16).fill(GcTheme.cardFill))
                }
            }
        }
    }
}

private struct GcLongPredictionsView: View {
    let data: GcLongData?
    let reload: () async -> Void
    @Environment(GcAuthStore.self) private var auth
    @State private var submitting = false
    @State private var message: String?

    var body: some View {
        VStack(spacing: 14) {
            if let data {
                longPoolCard("توقّع البطل", pool: data.pools.champion, votes: data.championVotes)
                if let mine = data.mine.first(where: { $0.kind == "champion" }), let name = mine.teamName {
                    Text("توقّعك: \(name)").font(GulfCupFonts.app(size: 13, weight: .bold)).foregroundStyle(GcTheme.emerald)
                }
                VStack(alignment: .leading, spacing: 8) {
                    Text("اختر بطل البطولة").font(GulfCupFonts.app(size: 13, weight: .bold)).foregroundStyle(GcTheme.onDarkDim)
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 88))], spacing: 10) {
                        ForEach(data.teams) { t in
                            Button {
                                Task { await pickChampion(t.id) }
                            } label: {
                                VStack(spacing: 6) {
                                    GcTeamLogo(logo: t.logo, size: 40)
                                    Text(t.name).font(GulfCupFonts.app(size: 10, weight: .semibold)).lineLimit(2).multilineTextAlignment(.center)
                                }
                                .padding(8)
                                .background(RoundedRectangle(cornerRadius: 12).fill(GcTheme.cardFill))
                            }
                            .buttonStyle(.plain)
                            .disabled(!auth.isLoggedIn || submitting)
                        }
                    }
                }
                if !auth.isLoggedIn {
                    SignInWithAppleButton(.signIn) { auth.startAppleSignIn() }
                        .signInWithAppleButtonStyle(.black)
                        .frame(height: 44)
                        .clipShape(RoundedRectangle(cornerRadius: GcTheme.buttonRadius))
                }
                if let message {
                    Text(message).font(GulfCupFonts.app(size: 12)).foregroundStyle(GcTheme.crimson)
                }
            } else {
                GcEmptyState(icon: "trophy", title: "التوقعات طويلة المدى", subtitle: L("predictions.unavailable"))
            }
        }
    }

    private func pickChampion(_ teamId: Int) async {
        submitting = true
        message = nil
        do {
            try await APIClient.shared.submitGcLongPrediction(kind: "champion", teamId: teamId)
            message = "تم حفظ توقّع البطل"
            await reload()
        } catch let e as APIError {
            message = e.errorDescription
        } catch {
            message = "تعذّر الحفظ"
        }
        submitting = false
    }

    private func longPoolCard(_ title: String, pool: Int, votes: [GcLongVote]) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title).font(GulfCupFonts.app(size: 15, weight: .bold)).foregroundStyle(GcTheme.onDark)
            Text("البركة: \(pool) نقطة").font(GulfCupFonts.app(size: 13)).foregroundStyle(GcTheme.goldDeep)
            ForEach(Array(votes.prefix(5).enumerated()), id: \.offset) { _, v in
                if let tid = v.teamId, let team = data?.teams.first(where: { $0.id == tid }) {
                    HStack {
                        GcTeamLogo(logo: team.logo, size: 22)
                        Text(team.name).font(GulfCupFonts.app(size: 12))
                        Spacer()
                        Text("\(v.n)").font(GulfCupFonts.app(size: 12, weight: .bold)).foregroundStyle(GcTheme.onDarkDim)
                    }
                }
            }
        }
        .padding(14)
        .background(RoundedRectangle(cornerRadius: 18).fill(GcTheme.cardFillStrong))
        .overlay(RoundedRectangle(cornerRadius: 18).stroke(GcTheme.outline, lineWidth: 1))
    }
}

private struct GcPredUnavailable: View {
    let message: String
    var body: some View {
        VStack(spacing: 10) {
            Image(systemName: "sparkles.rectangle.stack").font(.system(size: 28)).foregroundStyle(GcTheme.gold)
            Text(L("predictions.unavailable")).font(GulfCupFonts.app(size: 15, weight: .bold))
            Text(message).font(GulfCupFonts.app(size: 12)).foregroundStyle(GcTheme.onDarkDim).multilineTextAlignment(.center)
        }
        .padding(20).frame(maxWidth: .infinity)
        .background(RoundedRectangle(cornerRadius: 20).fill(GcTheme.cardFill))
    }
}

// MARK: - المزيد

private struct GcMoreScreen: View {
    let overview: GcOverview?
    let teams: [GcTeam]
    let fixtures: [GcFixture]
    let loading: Bool
    let refresh: () async -> Void

    private var knockout: [GcFixture] { GcFixtureMath.knockout(from: fixtures) }

    var body: some View {
        GcScreenScaffold {
            VStack(spacing: 18) {
                GcTopBar(title: L("tab.more"), subtitle: L("more.subtitle"))
                GcAccountCard()
                GcSectionHeader(icon: "person.3.fill", title: L("teams.section.title"), count: teams.count, tint: GcTheme.emerald)
                if teams.isEmpty && !loading {
                    GcEmptyState(icon: "person.3", title: L("teams.empty.title"), subtitle: L("teams.empty.subtitle"))
                } else {
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 100))], spacing: 10) {
                        ForEach(teams) { t in
                            NavigationLink {
                                GcTeamProfileScreen(teamId: t.id, fallback: t)
                            } label: {
                                VStack(spacing: 8) {
                                    GcTeamLogo(logo: t.logo, size: 48)
                                    Text(t.name).font(GulfCupFonts.app(size: 11, weight: .bold)).lineLimit(2).multilineTextAlignment(.center)
                                    if t.id == GulfCupConstants.saudiTeamId {
                                        Text(L("teams.host.badge")).font(GulfCupFonts.app(size: 9, weight: .bold)).foregroundStyle(GcTheme.goldDeep)
                                    }
                                }
                                .padding(10)
                                .background(RoundedRectangle(cornerRadius: 14).fill(GcTheme.cardFillStrong))
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
                if let ov = overview, !ov.venues.isEmpty {
                    GcSectionHeader(icon: "building.2.fill", title: L("venues.section.title"), count: ov.venues.count, tint: GcTheme.teal)
                    ForEach(Array(ov.venues.enumerated()), id: \.offset) { _, v in
                        HStack {
                            Image(systemName: "mappin.circle.fill").foregroundStyle(GcTheme.emerald)
                            VStack(alignment: .leading) {
                                Text(v.name).font(GulfCupFonts.app(size: 14, weight: .semibold))
                                Text(v.city).font(GulfCupFonts.app(size: 11)).foregroundStyle(GcTheme.onDarkDim)
                            }
                            Spacer()
                        }
                        .padding(12).background(RoundedRectangle(cornerRadius: 14).fill(GcTheme.cardFill))
                    }
                }
                GcSectionHeader(icon: "flag.checkered", title: L("bracket.title"), subtitle: L("bracket.subtitle"), tint: GcTheme.gold)
                if knockout.isEmpty {
                    GcEmptyState(icon: "trophy", title: L("bracket.empty.title"), subtitle: L("bracket.empty.subtitle"))
                } else {
                    ForEach(knockout) { GcMatchCard(fixture: $0) }
                }
                if loading { GcLoadingPanel(title: L("loading.host")) }
                GcFooterSignature()
            }
        }
        .refreshable { await refresh() }
        .navigationBarHidden(true)
    }
}

private struct GcAccountCard: View {
    @Environment(GcAuthStore.self) private var auth

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            GcSectionHeader(icon: "person.crop.circle.fill", title: "حسابي", subtitle: "لحفظ التوقعات والمشاركة في البركة", tint: GcTheme.gold)
            if auth.isLoggedIn {
                HStack(spacing: 12) {
                    Image(systemName: "checkmark.seal.fill").font(.system(size: 28)).foregroundStyle(GcTheme.emerald)
                    VStack(alignment: .leading, spacing: 3) {
                        Text(auth.member?.name ?? "عضو سبق").font(GulfCupFonts.app(size: 15, weight: .bold))
                        Text(auth.member?.email ?? "مسجّل الدخول").font(GulfCupFonts.app(size: 11)).foregroundStyle(GcTheme.onDarkDim)
                    }
                    Spacer()
                    Button("خروج") { auth.signOut() }
                        .font(GulfCupFonts.app(size: 12, weight: .bold))
                        .foregroundStyle(GcTheme.crimson)
                }
            } else {
                Text("سجّل الدخول بحساب Apple لحفظ توقّعاتك في مسابقة خليجي 27")
                    .font(GulfCupFonts.app(size: 12))
                    .foregroundStyle(GcTheme.onDarkDim)
                SignInWithAppleButton(.signIn) { auth.startAppleSignIn() }
                    .signInWithAppleButtonStyle(.black)
                    .frame(height: 44)
                    .clipShape(RoundedRectangle(cornerRadius: GcTheme.buttonRadius))
            }
            if auth.isLoading {
                ProgressView().tint(GcTheme.emerald)
            }
            if let err = auth.errorMessage {
                Text(err).font(GulfCupFonts.app(size: 11)).foregroundStyle(GcTheme.crimson)
            }
        }
        .padding(14)
        .background(RoundedRectangle(cornerRadius: GcTheme.cardRadius).fill(GcTheme.cardFillStrong))
        .overlay(RoundedRectangle(cornerRadius: GcTheme.cardRadius).stroke(GcTheme.outline, lineWidth: 1))
    }
}
