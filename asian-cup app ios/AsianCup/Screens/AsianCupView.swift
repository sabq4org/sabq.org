import SwiftUI

// الشاشة الرئيسية لتطبيق كأس آسيا — كل شيء في تمريرة تمرير واحدة، مطابق لبنية
// صفحة الويب (AcHero → AcSaudiSpotlight → AcGroups → AcSchedule → AcTeams →
// AcHostShowcase) لكن بهوية iOS. التحديث: .task أول ظهور + .refreshable للسحب.
struct AsianCupView: View {
    @State private var overview: AcOverview?
    @State private var fixtures: [AcFixture] = []
    @State private var teams: [AcTeam] = []
    @State private var groups: [AcGroup] = []
    @State private var loading = true
    @State private var loadError: String?
    @State private var selectedTab: AcTab = .home

    var body: some View {
        TabView(selection: $selectedTab) {
            NavigationStack {
                AcHomeScreen(
                    overview: overview,
                    fixtures: fixtures,
                    teams: teams,
                    groups: groups,
                    loading: loading,
                    loadError: loadError,
                    onSelectTab: { selectedTab = $0 },
                    refresh: { await loadAll(force: true) }
                )
            }
            .tabItem { Label(L("tab.home"), systemImage: "house.fill") }
            .tag(AcTab.home)

            NavigationStack {
                AcMatchesScreen(fixtures: fixtures, loading: loading, refresh: { await loadAll(force: true) })
            }
            .tabItem { Label(L("tab.matches"), systemImage: "calendar") }
            .tag(AcTab.matches)

            NavigationStack {
                AcPredictionsScreen(refreshMainData: { await loadAll(force: true) })
            }
            .tabItem { Label(L("tab.predictions"), systemImage: "sparkles") }
            .tag(AcTab.predictions)

            NavigationStack {
                AcGroupsScreen(groups: groups, loading: loading, refresh: { await loadAll(force: true) })
            }
            .tabItem { Label(L("tab.groups"), systemImage: "rectangle.3.group") }
            .tag(AcTab.groups)

            NavigationStack {
                AcMoreScreen(overview: overview, teams: teams, loading: loading, loadError: loadError, refresh: { await loadAll(force: true) })
            }
            .tabItem { Label(L("tab.more"), systemImage: "square.grid.2x2.fill") }
            .tag(AcTab.more)
        }
        .tint(AcTheme.gold)
        .toolbarBackground(AcTheme.inkBottom, for: .tabBar)
        .toolbarBackground(.visible, for: .tabBar)
        .toolbarColorScheme(.light, for: .tabBar)
        .task { await loadAll() }
    }

    private func loadAll(force: Bool = false) async {
        if !force { loading = true }
        async let o = APIClient.shared.fetchOverview(ignoreCache: force)
        async let f = APIClient.shared.fetchFixtures(ignoreCache: force)
        async let t = APIClient.shared.fetchTeams(ignoreCache: force)
        async let g = APIClient.shared.fetchStandings(ignoreCache: force)
        do {
            let (ov, fx, tm, gr) = try await (o, f, t, g)
            self.overview = ov
            self.fixtures = fx
            self.teams = tm
            self.groups = gr
            self.loadError = nil
        } catch {
            self.loadError = LError(error)
        }
        self.loading = false
    }
}

enum AcTab: Hashable {
    case home
    case matches
    case predictions
    case groups
    case more
}

// MARK: - New App Shell
private struct AcHomeScreen: View {
    let overview: AcOverview?
    let fixtures: [AcFixture]
    let teams: [AcTeam]
    let groups: [AcGroup]
    let loading: Bool
    let loadError: String?
    let onSelectTab: (AcTab) -> Void
    let refresh: () async -> Void

    private var nextFixtures: [AcFixture] {
        fixtures
            .filter { !$0.status.finished }
            .sorted { $0.timestamp < $1.timestamp }
    }

    var body: some View {
        AcScreenScaffold {
            VStack(spacing: 20) {
                AcTopBar(title: L("app.title"), subtitle: L("app.host"), state: overview?.started == true ? L("state.live") : L("state.pre"))

                AcHomeHero(overview: overview, loading: loading)

                if let loadError {
                    AcRefreshBanner(message: loadError, refresh: refresh)
                }

                AcDashboardGrid(
                    overview: overview,
                    fixturesCount: fixtures.count,
                    teams: teams,
                    groups: groups,
                    onSelectTab: onSelectTab
                )

                AcPredictionsBanner { onSelectTab(.predictions) }

                if let saudi = overview?.saudi, !saudi.fixtures.isEmpty || saudi.team != nil {
                    AcSaudiSpotlight(saudi: saudi)
                        .padding(.horizontal, -16)
                }

                AcNextFixturesPreview(fixtures: nextFixtures, onOpenMatches: { onSelectTab(.matches) })

                AcHomeVenuesPreview(overview: overview, onOpenMore: { onSelectTab(.more) })

                AcFooterSignature()
            }
        }
        .refreshable { await refresh() }
        .navigationBarHidden(true)
    }
}

private struct AcMatchesScreen: View {
    let fixtures: [AcFixture]
    let loading: Bool
    let refresh: () async -> Void

    var body: some View {
        AcScreenScaffold {
            VStack(spacing: 18) {
                AcTopBar(title: L("tab.matches"), subtitle: L("matches.subtitle"), state: "\(fixtures.count)")
                AcMatchesHero(fixtures: fixtures)
                AcScheduleSection(fixtures: fixtures)
                    .padding(.horizontal, -16)
                if loading { AcLoadingPanel(title: L("loading.matches")) }
                AcFooterSignature()
            }
        }
        .refreshable { await refresh() }
        .navigationBarHidden(true)
    }
}

private struct AcGroupsScreen: View {
    let groups: [AcGroup]
    let loading: Bool
    let refresh: () async -> Void

    var body: some View {
        AcScreenScaffold {
            VStack(spacing: 18) {
                AcTopBar(title: L("tab.groups"), subtitle: L("groups.subtitle"), state: "\(groups.count)")
                AcGroupsSection(groups: groups)
                if loading { AcLoadingPanel(title: L("loading.standings")) }
                AcFooterSignature()
            }
        }
        .refreshable { await refresh() }
        .navigationBarHidden(true)
        .navigationDestination(for: AcTeam.self) { team in
            AcTeamProfileScreen(teamId: team.id, fallback: team)
        }
    }
}

private enum AcPredictionSegment: String, CaseIterable, Identifiable {
    case matches
    case leaderboard

    var id: String { rawValue }
    var title: String {
        switch self {
        case .matches: return L("tab.matches")
        case .leaderboard: return L("predictions.leaderboard")
        }
    }
}

private struct AcPredictionsScreen: View {
    let refreshMainData: () async -> Void
    @State private var today: AcPredictionsTodayResponse?
    @State private var leaders: [AcPredictionLeader] = []
    @State private var loading = true
    @State private var errorMessage: String?
    @State private var segment: AcPredictionSegment = .matches

    var body: some View {
        AcScreenScaffold {
            VStack(spacing: 18) {
                AcTopBar(title: L("tab.predictions"), subtitle: L("predictions.subtitle"), state: L("state.original"))
                AcPredictionsHero(me: today?.me)

                Picker(L("tab.predictions"), selection: $segment) {
                    ForEach(AcPredictionSegment.allCases) { item in
                        Text(item.title).tag(item)
                    }
                }
                .pickerStyle(.segmented)

                if let errorMessage {
                    AcPredictionUnavailable(message: errorMessage)
                } else if loading {
                    AcLoadingPanel(title: L("loading.predictions"))
                } else {
                    switch segment {
                    case .matches:
                        AcPredictionMatchesList(matches: today?.matches ?? [], me: today?.me)
                    case .leaderboard:
                        AcPredictionLeaderboard(leaders: leaders)
                    }
                }

                AcFooterSignature()
            }
        }
        .task { await load() }
        .refreshable {
            await load(force: true)
            await refreshMainData()
        }
        .navigationBarHidden(true)
    }

    private func load(force: Bool = false) async {
        loading = true
        async let todayResponse = APIClient.shared.fetchAcPredictionsToday(ignoreCache: force)
        async let leadersResponse = APIClient.shared.fetchAcPredictionsLeaderboard(ignoreCache: force)
        do {
            let (t, l) = try await (todayResponse, leadersResponse)
            today = t
            leaders = l
            errorMessage = nil
        } catch {
            errorMessage = LError(error)
        }
        loading = false
    }
}

private struct AcPredictionsHero: View {
    let me: AcPredictionMeStats?

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 12) {
                Image(systemName: "sparkles")
                    .font(.system(size: 24, weight: .bold))
                    .foregroundStyle(AcTheme.emeraldDeep)
                    .frame(width: 54, height: 54)
                    .background(RoundedRectangle(cornerRadius: 17, style: .continuous).fill(AcTheme.gold))
                VStack(alignment: .leading, spacing: 4) {
                    Text(L("predictions.hero.title"))
                        .font(AsianCupFonts.app(size: 17, weight: .bold))
                        .foregroundStyle(AcTheme.onDark)
                    Text(L("predictions.hero.subtitle"))
                        .font(AsianCupFonts.app(size: 12))
                        .foregroundStyle(AcTheme.onDarkDim)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }

            HStack(spacing: 8) {
                AcPredictionStat(value: "\(me?.points ?? 0)", label: L("predictions.stat.points"))
                AcPredictionStat(value: "\(me?.correct ?? 0)", label: L("predictions.stat.correct"))
                AcPredictionStat(value: "\(me?.exact ?? 0)", label: L("predictions.stat.exact"))
                AcPredictionStat(value: "\(me?.currentStreak ?? 0)", label: L("predictions.stat.streak"))
            }
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .fill(LinearGradient(colors: [AcTheme.heroTop, AcTheme.heroBottom], startPoint: .topTrailing, endPoint: .bottomLeading))
        )
        .overlay(AcLatticePattern(spacing: 34).opacity(0.05).clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous)))
        .overlay(RoundedRectangle(cornerRadius: 24, style: .continuous).stroke(AcTheme.outline, lineWidth: 1))
        .shadow(color: .black.opacity(0.07), radius: 14, y: 8)
    }
}

private struct AcPredictionStat: View {
    let value: String
    let label: String

    var body: some View {
        VStack(spacing: 3) {
            Text(value)
                .font(AsianCupFonts.app(size: 18, weight: .bold))
                .foregroundStyle(AcTheme.goldDeep)
                .monospacedDigit()
            Text(label)
                .font(AsianCupFonts.app(size: 10, weight: .semibold))
                .foregroundStyle(AcTheme.onDarkDim)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 10)
        .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(AcTheme.chipFill))
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(AcTheme.outline, lineWidth: 1))
    }
}

private struct AcPredictionMatchesList: View {
    let matches: [AcPredictableMatch]
    let me: AcPredictionMeStats?

    var body: some View {
        VStack(spacing: 12) {
            if matches.isEmpty {
                AcEmptyState(icon: "sparkles.rectangle.stack", title: L("predictions.empty.title"), subtitle: L("predictions.empty.subtitle"))
            } else {
                ForEach(matches) { match in
                    AcPredictionMatchCard(match: match, me: me)
                }
            }
        }
    }
}

private struct AcPredictionMatchCard: View {
    let match: AcPredictableMatch
    let me: AcPredictionMeStats?
    @State private var predHome: Int
    @State private var predAway: Int

    init(match: AcPredictableMatch, me: AcPredictionMeStats?) {
        self.match = match
        self.me = me
        _predHome = State(initialValue: match.myPrediction?.predHome ?? 1)
        _predAway = State(initialValue: match.myPrediction?.predAway ?? 1)
    }

    private var predictedOutcome: String {
        if predHome > predAway { return "home" }
        if predAway > predHome { return "away" }
        return "draw"
    }

    private var selectedProbability: Double {
        switch predictedOutcome {
        case "home": return match.probs.home
        case "away": return match.probs.away
        default: return match.probs.draw
        }
    }

    private var potentialPoints: Int {
        let probability = max(selectedProbability, 0.01)
        let boldness = min(3.0, max(0.5, 0.40 / probability))
        let streak = min(1.5, 1.0 + Double(me?.currentStreak ?? 0) * 0.05)
        return Int((30.0 * boldness * streak).rounded())
    }

    var body: some View {
        VStack(spacing: 14) {
            HStack(spacing: 8) {
                Text(LRound(match.fixture.roundEn, fallback: match.fixture.round))
                    .font(AsianCupFonts.app(size: 11, weight: .semibold))
                    .foregroundStyle(AcTheme.onDarkDim)
                    .lineLimit(1)
                Spacer(minLength: 0)
                Text(match.locked ? L("predictions.locked") : AcFormat.kickoffTime(match.fixture.date))
                    .font(AsianCupFonts.app(size: 11, weight: .bold))
                    .foregroundStyle(match.locked ? AcTheme.crimson : AcTheme.gold)
                    .padding(.horizontal, 9)
                    .padding(.vertical, 4)
                    .background(Capsule().fill((match.locked ? AcTheme.crimson : AcTheme.gold).opacity(0.13)))
            }

            HStack(spacing: 10) {
                AcPredictionTeamPick(team: match.fixture.home, score: $predHome, disabled: match.locked)
                VStack(spacing: 5) {
                    Text("VS")
                        .font(AsianCupFonts.app(size: 11, weight: .bold))
                        .foregroundStyle(AcTheme.onDarkFaint)
                    Text("\(predHome)-\(predAway)")
                        .font(AsianCupFonts.app(size: 18, weight: .bold))
                        .foregroundStyle(AcTheme.onDark)
                        .monospacedDigit()
                        .environment(\.layoutDirection, .leftToRight)
                }
                .frame(width: 54)
                AcPredictionTeamPick(team: match.fixture.away, score: $predAway, disabled: match.locked)
            }

            VStack(spacing: 8) {
                AcProbabilityRow(title: LTeam(String(match.fixture.home.id), fallback: match.fixture.home.name), value: match.probs.home, tint: AcTheme.gold)
                AcProbabilityRow(title: L("predictions.draw"), value: match.probs.draw, tint: AcTheme.teal)
                AcProbabilityRow(title: LTeam(String(match.fixture.away.id), fallback: match.fixture.away.name), value: match.probs.away, tint: AcTheme.emeraldSoft)
            }

            HStack(spacing: 10) {
                AcPredictionMeta(icon: "person.2.fill", value: "\(match.crowd.total)", label: L("predictions.meta.participant"))
                AcPredictionMeta(icon: "target", value: "\(potentialPoints)", label: L("predictions.meta.max"))
                AcPredictionMeta(icon: "chart.bar.fill", value: "\(match.predictionsCount)", label: L("predictions.meta.prediction"))
            }

            Button {
            } label: {
                Text(match.locked ? L("predictions.locked.note") : L("predictions.login.note"))
                    .font(AsianCupFonts.app(size: 13, weight: .bold))
                    .foregroundStyle(match.locked ? AcTheme.onDarkFaint : AcTheme.emeraldDeep)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .background(RoundedRectangle(cornerRadius: AcTheme.buttonRadius, style: .continuous).fill(match.locked ? AcTheme.chipFill : AcTheme.gold))
            }
            .disabled(true)
            .buttonStyle(.plain)
        }
        .padding(14)
        .background(RoundedRectangle(cornerRadius: 22, style: .continuous).fill(AcTheme.cardFillStrong))
        .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).stroke(match.locked ? AcTheme.outline : AcTheme.gold.opacity(0.20), lineWidth: 1))
    }
}

private struct AcPredictionTeamPick: View {
    let team: AcTeam
    @Binding var score: Int
    let disabled: Bool

    var body: some View {
        VStack(spacing: 8) {
            AcTeamLogo(logo: team.logo, size: 42)
            Text(LTeam(String(team.id), fallback: team.name))
                .font(AsianCupFonts.app(size: 12, weight: .bold))
                .foregroundStyle(AcTheme.onDark)
                .lineLimit(1)
                .minimumScaleFactor(0.72)
            Stepper(value: $score, in: 0...9) {
                Text("\(score)")
                    .font(AsianCupFonts.app(size: 22, weight: .bold))
                    .foregroundStyle(AcTheme.gold)
                    .monospacedDigit()
            }
            .labelsHidden()
            .disabled(disabled)
        }
        .frame(maxWidth: .infinity)
    }
}

private struct AcProbabilityRow: View {
    let title: String
    let value: Double
    let tint: Color

    private var percentText: String {
        "\(Int((value * 100).rounded()))%"
    }

    var body: some View {
        VStack(spacing: 5) {
            HStack {
                Text(title)
                    .font(AsianCupFonts.app(size: 11, weight: .semibold))
                    .foregroundStyle(AcTheme.onDarkDim)
                    .lineLimit(1)
                Spacer()
                Text(percentText)
                    .font(AsianCupFonts.app(size: 11, weight: .bold))
                    .foregroundStyle(tint)
                    .monospacedDigit()
            }
            GeometryReader { proxy in
                ZStack(alignment: .leading) {
                    Capsule().fill(AcTheme.chipFill)
                    Capsule()
                        .fill(tint)
                        .frame(width: proxy.size.width * CGFloat(min(max(value, 0), 1)))
                }
            }
            .frame(height: 6)
        }
    }
}

private struct AcPredictionMeta: View {
    let icon: String
    let value: String
    let label: String

    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: icon)
                .font(.system(size: 11, weight: .bold))
                .foregroundStyle(AcTheme.gold)
            VStack(alignment: .leading, spacing: 0) {
                Text(value)
                    .font(AsianCupFonts.app(size: 13, weight: .bold))
                    .foregroundStyle(AcTheme.onDark)
                    .monospacedDigit()
                Text(label)
                    .font(AsianCupFonts.app(size: 9))
                    .foregroundStyle(AcTheme.onDarkFaint)
            }
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity)
        .padding(10)
        .background(RoundedRectangle(cornerRadius: 13, style: .continuous).fill(AcTheme.chipFill))
        .overlay(RoundedRectangle(cornerRadius: 13, style: .continuous).stroke(AcTheme.outline, lineWidth: 1))
    }
}

private struct AcPredictionLeaderboard: View {
    let leaders: [AcPredictionLeader]

    var body: some View {
        VStack(spacing: 10) {
            if leaders.isEmpty {
                AcEmptyState(icon: "list.number", title: L("leaderboard.empty.title"), subtitle: L("leaderboard.empty.subtitle"))
            } else {
                ForEach(leaders.prefix(20)) { leader in
                    AcLeaderRowView(leader: leader)
                }
            }
        }
    }
}

private struct AcLeaderRowView: View {
    let leader: AcPredictionLeader

    var body: some View {
        HStack(spacing: 12) {
            Text("\(leader.rank)")
                .font(AsianCupFonts.app(size: 15, weight: .bold))
                .foregroundStyle(leader.rank <= 3 ? AcTheme.gold : AcTheme.onDarkDim)
                .frame(width: 34, height: 34)
                .background(Circle().fill(leader.rank <= 3 ? AcTheme.gold.opacity(0.12) : AcTheme.chipFill))
            VStack(alignment: .leading, spacing: 3) {
                Text(leader.name)
                    .font(AsianCupFonts.app(size: 14, weight: .bold))
                    .foregroundStyle(AcTheme.onDark)
                    .lineLimit(1)
                Text(L("leaderboard.row.summary", ["correct": "\(leader.correctCount)", "exact": "\(leader.exactCount)", "acc": "\(Int(leader.accuracy.rounded()))"]))
                    .font(AsianCupFonts.app(size: 11))
                    .foregroundStyle(AcTheme.onDarkDim)
                    .lineLimit(1)
            }
            Spacer(minLength: 0)
            Text("\(leader.totalPoints)")
                .font(AsianCupFonts.app(size: 16, weight: .bold))
                .foregroundStyle(AcTheme.gold)
                .monospacedDigit()
        }
        .padding(13)
        .background(RoundedRectangle(cornerRadius: 18, style: .continuous).fill(AcTheme.cardFill))
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(AcTheme.outline, lineWidth: 1))
    }
}

private struct AcPredictionUnavailable: View {
    let message: String

    var body: some View {
        VStack(spacing: 10) {
            Image(systemName: "sparkles.rectangle.stack")
                .font(.system(size: 30, weight: .bold))
                .foregroundStyle(AcTheme.gold)
            Text(L("predictions.unavailable"))
                .font(AsianCupFonts.app(size: 16, weight: .bold))
                .foregroundStyle(AcTheme.onDark)
            Text(message)
                .font(AsianCupFonts.app(size: 12))
                .foregroundStyle(AcTheme.onDarkDim)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity)
        .padding(20)
        .background(RoundedRectangle(cornerRadius: 22, style: .continuous).fill(AcTheme.cardFill))
        .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).stroke(AcTheme.outline, lineWidth: 1))
    }
}

private struct AcTeamsScreen: View {
    let teams: [AcTeam]
    let loading: Bool
    let refresh: () async -> Void

    var body: some View {
        AcScreenScaffold {
            VStack(spacing: 18) {
                AcTopBar(title: L("teams.title"), subtitle: L("teams.subtitle"), state: "\(teams.count)")
                AcTeamsSection(teams: teams)
                    .padding(.horizontal, -16)
                if loading { AcLoadingPanel(title: L("loading.teams")) }
                AcFooterSignature()
            }
        }
        .refreshable { await refresh() }
        .navigationBarHidden(true)
    }
}

private struct AcMoreScreen: View {
    let overview: AcOverview?
    let teams: [AcTeam]
    let loading: Bool
    let loadError: String?
    let refresh: () async -> Void

    @State private var showLanguage = false

    var body: some View {
        AcScreenScaffold {
            VStack(spacing: 18) {
                AcTopBar(title: L("tab.more"), subtitle: L("more.subtitle"), state: L("brand.sabq"))

                AcMoreHub()

                AcLanguageRow { showLanguage = true }

                if let overview {
                    AcHostShowcase(overview: overview)
                        .padding(.horizontal, -16)
                } else {
                    AcLoadingPanel(title: L("loading.host"))
                }

                AcTeamsSection(teams: teams)
                    .padding(.horizontal, -16)

                if loading {
                    AcLoadingPanel(title: L("loading.teams"))
                }

                if let loadError {
                    AcRefreshBanner(message: loadError, refresh: refresh)
                }

                AcFooterSignature()
            }
        }
        .refreshable { await refresh() }
        .navigationBarHidden(true)
        .navigationDestination(for: AcTeam.self) { team in
            AcTeamProfileScreen(teamId: team.id, fallback: team)
        }
        .sheet(isPresented: $showLanguage) {
            AcLanguagePicker().asianCupRTL()
        }
    }
}

// شبكة روابط «المزيد»: الهدّافون + شجرة الأدوار (نقاط API-Football الإضافية).
private struct AcMoreHub: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            AcSectionHeader(icon: "square.grid.2x2.fill", title: L("more.explore.title"), subtitle: L("more.explore.subtitle"), tint: AcTheme.azure)
            VStack(spacing: 10) {
                NavigationLink { AcScorersScreen() } label: {
                    AcMoreLinkCard(icon: "soccerball.inverse", title: L("scorers.title"), subtitle: L("scorers.subtitle"))
                }
                .buttonStyle(.plain)
                NavigationLink { AcBracketScreen() } label: {
                    AcMoreLinkCard(icon: "trophy.fill", title: L("bracket.title"), subtitle: L("bracket.subtitle"))
                }
                .buttonStyle(.plain)
            }
        }
    }
}

// صفّ يفتح قائمة اختيار اللغة، يعرض اللغة الحالية بعلمها واسمها الأصلي.
private struct AcLanguageRow: View {
    @ObservedObject private var loc = AcLocalization.shared
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 12) {
                ZStack {
                    Circle().fill(AcTheme.teal.opacity(0.14)).frame(width: 38, height: 38)
                    Image(systemName: "globe")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(AcTheme.teal)
                }
                VStack(alignment: .leading, spacing: 2) {
                    Text(L("more.language.row"))
                        .font(AsianCupFonts.app(size: 15, weight: .bold))
                        .foregroundStyle(AcTheme.onDark)
                    Text("\(loc.language.flag)  \(loc.language.nativeName)")
                        .font(AsianCupFonts.app(size: 12, weight: .semibold))
                        .foregroundStyle(AcTheme.onDarkDim)
                }
                Spacer(minLength: 0)
                Image(systemName: "chevron.forward")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(AcTheme.onDarkFaint)
            }
            .padding(14)
            .background(RoundedRectangle(cornerRadius: 18, style: .continuous).fill(AcTheme.cardFillStrong))
            .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(AcTheme.outline, lineWidth: 1))
        }
        .buttonStyle(.plain)
    }
}

// قائمة اختيار اللغة — تعرض كل اللغات المدعومة (لغات المنتخبات الـ24 + العربية).
private struct AcLanguagePicker: View {
    @ObservedObject private var loc = AcLocalization.shared
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 10) {
                    Text(L("language.note"))
                        .font(AsianCupFonts.app(size: 12))
                        .foregroundStyle(AcTheme.onDarkDim)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.bottom, 4)

                    ForEach(AcLanguage.all) { lang in
                        Button {
                            loc.setLanguage(lang)
                        } label: {
                            HStack(spacing: 12) {
                                Text(lang.flag).font(.system(size: 22))
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(lang.nativeName)
                                        .font(AsianCupFonts.app(size: 15, weight: .bold))
                                        .foregroundStyle(AcTheme.onDark)
                                    Text(lang.arabicName)
                                        .font(AsianCupFonts.app(size: 11, weight: .semibold))
                                        .foregroundStyle(AcTheme.onDarkFaint)
                                }
                                Spacer(minLength: 0)
                                if lang.code == loc.language.code {
                                    Image(systemName: "checkmark.circle.fill")
                                        .font(.system(size: 18))
                                        .foregroundStyle(AcTheme.teal)
                                }
                            }
                            .padding(14)
                            .background(
                                RoundedRectangle(cornerRadius: 16, style: .continuous)
                                    .fill(lang.code == loc.language.code ? AcTheme.teal.opacity(0.10) : AcTheme.cardFill)
                            )
                            .overlay(
                                RoundedRectangle(cornerRadius: 16, style: .continuous)
                                    .stroke(lang.code == loc.language.code ? AcTheme.teal.opacity(0.5) : AcTheme.outline, lineWidth: 1)
                            )
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(16)
            }
            .background(AcAmbientBackground())
            .navigationTitle(L("language.title"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button(action: { dismiss() }) {
                        Image(systemName: "xmark.circle.fill")
                            .foregroundStyle(AcTheme.onDarkFaint)
                    }
                }
            }
        }
    }
}

private struct AcScreenScaffold<Content: View>: View {
    @ViewBuilder var content: Content

    var body: some View {
        ScrollView {
            content
                .padding(.horizontal, 16)
                .padding(.top, 18)
                .padding(.bottom, 118)
        }
        .background(AcAmbientBackground())
    }
}

private struct AcTopBar: View {
    let title: String
    let subtitle: String
    let state: String

    var body: some View {
        HStack(spacing: 12) {
            Image("Emblem")
                .resizable()
                .scaledToFit()
                .frame(width: 42, height: 48)
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(AsianCupFonts.app(size: 20, weight: .bold))
                    .foregroundStyle(AcTheme.onDark)
                Text(subtitle)
                    .font(AsianCupFonts.app(size: 11, weight: .semibold))
                    .foregroundStyle(AcTheme.onDarkFaint)
            }
            Spacer(minLength: 0)
            Text(state)
                .font(AsianCupFonts.app(size: 11, weight: .bold))
                .foregroundStyle(AcTheme.goldDeep)
                .padding(.horizontal, 11)
                .padding(.vertical, 6)
                .background(Capsule().fill(AcTheme.gold.opacity(0.14)))
                .overlay(Capsule().stroke(AcTheme.gold.opacity(0.30), lineWidth: 1))
        }
    }
}

private struct AcHomeHero: View {
    let overview: AcOverview?
    let loading: Bool

    var body: some View {
        VStack(spacing: 16) {
            HStack(alignment: .top, spacing: 16) {
                VStack(alignment: .leading, spacing: 10) {
                    HStack(spacing: 8) {
                        AcHeroBadge(icon: "trophy.fill", text: L("hero.badge.special"), tint: AcTheme.gold)
                        if overview?.started == true {
                            AcHeroBadge(icon: "dot.radiowaves.left.and.right", text: L("state.live"), tint: AcTheme.crimson)
                        }
                    }

                    AcTournamentTitle()
                        .frame(maxWidth: .infinity, alignment: .leading)

                    Text(L("hero.subtitle"))
                        .font(AsianCupFonts.app(size: 13))
                        .foregroundStyle(AcTheme.onDarkDim)
                        .lineSpacing(3)
                        .fixedSize(horizontal: false, vertical: true)

                    if let overview {
                        Label(AcFormat.dateRange(startIso: overview.startsAt, endIso: overview.endsAt), systemImage: "calendar")
                            .font(AsianCupFonts.app(size: 12, weight: .semibold))
                            .foregroundStyle(AcTheme.onDark)
                            .labelStyle(.titleAndIcon)
                            .lineLimit(1)
                            .minimumScaleFactor(0.75)
                    }
                }

                AcEmblem(height: 108)
                    .frame(width: 118)
            }

            if let overview {
                AcHeroMetrics(overview: overview)

                if overview.started {
                    AcLiveRibbon()
                } else if let start = overview.startsAt {
                    AcCountdownCard(iso: start)
                } else if let next = overview.nextMatch {
                    AcNextMatchCard(fixture: next)
                }
            } else if loading {
                AcLoadingPanel(title: L("loading.hub"))
            }
        }
        .padding(18)
        .background(
            RoundedRectangle(cornerRadius: 30, style: .continuous)
                .fill(
                    LinearGradient(
                        colors: [
                            AcTheme.heroTop,
                            AcTheme.heroBottom,
                        ],
                        startPoint: .topTrailing,
                        endPoint: .bottomLeading
                    )
                )
        )
        .overlay(AcLatticePattern(spacing: 30).opacity(0.05).clipShape(RoundedRectangle(cornerRadius: 30, style: .continuous)))
        .overlay(
            RoundedRectangle(cornerRadius: 30, style: .continuous)
                .stroke(AcTheme.outline, lineWidth: 1)
        )
        .shadow(color: .black.opacity(0.10), radius: 18, y: 12)
    }
}

private struct AcHeroMetrics: View {
    let overview: AcOverview

    var body: some View {
        HStack(spacing: 0) {
            metric("\(overview.teamsCount)", L("metric.team"))
            divider
            metric("\(overview.groupsCount)", L("metric.groups"))
            divider
            metric("\(overview.venues.count)", L("metric.venues"))
        }
        .padding(.vertical, 12)
        .background(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .fill(AcTheme.chipFill)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .stroke(AcTheme.outline, lineWidth: 1)
        )
    }

    private func metric(_ value: String, _ label: String) -> some View {
        VStack(spacing: 3) {
            Text(value)
                .font(AsianCupFonts.app(size: 22, weight: .bold))
                .foregroundStyle(AcTheme.goldDeep)
                .monospacedDigit()
            Text(label)
                .font(AsianCupFonts.app(size: 11, weight: .semibold))
                .foregroundStyle(AcTheme.onDarkDim)
        }
        .frame(maxWidth: .infinity)
    }

    private var divider: some View {
        Rectangle()
            .fill(AcTheme.outline)
            .frame(width: 1, height: 34)
    }
}

private struct AcDashboardGrid: View {
    let overview: AcOverview?
    let fixturesCount: Int
    let teams: [AcTeam]
    let groups: [AcGroup]
    let onSelectTab: (AcTab) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            AcSectionHeader(icon: "square.grid.2x2.fill", title: L("dashboard.title"), subtitle: L("dashboard.subtitle"), tint: AcTheme.teal)
            HStack(spacing: 10) {
                AcDashboardTile(icon: "calendar", title: L("tab.matches"), value: "\(fixturesCount)", tint: AcTheme.gold) {
                    onSelectTab(.matches)
                }
                AcDashboardTile(icon: "sparkles", title: L("tab.predictions"), value: L("dashboard.value.new"), tint: AcTheme.azure) {
                    onSelectTab(.predictions)
                }
                AcDashboardTile(icon: "rectangle.3.group", title: L("tab.groups"), value: "\(groups.count)", tint: AcTheme.teal) {
                    onSelectTab(.groups)
                }
            }
        }
    }
}

private struct AcDashboardTile: View {
    let icon: String
    let title: String
    let value: String
    let tint: Color
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 9) {
                Image(systemName: icon)
                    .font(.system(size: 18, weight: .bold))
                    .foregroundStyle(tint)
                    .frame(width: 42, height: 42)
                    .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(tint.opacity(0.14)))
                Text(value)
                    .font(AsianCupFonts.app(size: 20, weight: .bold))
                    .foregroundStyle(AcTheme.onDark)
                    .monospacedDigit()
                Text(title)
                    .font(AsianCupFonts.app(size: 11, weight: .semibold))
                    .foregroundStyle(AcTheme.onDarkDim)
                    .lineLimit(1)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .background(RoundedRectangle(cornerRadius: 20, style: .continuous).fill(AcTheme.cardFill))
            .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).stroke(AcTheme.outline, lineWidth: 1))
        }
        .buttonStyle(.plain)
    }
}

private struct AcPredictionsBanner: View {
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 14) {
                Image(systemName: "sparkles")
                    .font(.system(size: 22, weight: .bold))
                    .foregroundStyle(AcTheme.emeraldDeep)
                    .frame(width: 52, height: 52)
                    .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(AcTheme.gold))
                VStack(alignment: .leading, spacing: 4) {
                    Text(L("banner.predictions.title"))
                        .font(AsianCupFonts.app(size: 16, weight: .bold))
                        .foregroundStyle(.white)
                    Text(L("banner.predictions.subtitle"))
                        .font(AsianCupFonts.app(size: 12))
                        .foregroundStyle(.white.opacity(0.78))
                        .lineLimit(2)
                }
                Spacer(minLength: 0)
                Image(systemName: "chevron.left")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundStyle(AcTheme.emeraldDeep)
                    .frame(width: 34, height: 34)
                    .background(Circle().fill(.white))
            }
            .padding(16)
            .background(
                RoundedRectangle(cornerRadius: 24, style: .continuous)
                    .fill(LinearGradient(colors: [AcTheme.azure, AcTheme.teal], startPoint: .topTrailing, endPoint: .bottomLeading))
            )
            .overlay(RoundedRectangle(cornerRadius: 24, style: .continuous).stroke(Color.white.opacity(0.22), lineWidth: 1))
            .shadow(color: AcTheme.azure.opacity(0.30), radius: 14, y: 8)
        }
        .buttonStyle(.plain)
    }
}

private struct AcNextFixturesPreview: View {
    let fixtures: [AcFixture]
    let onOpenMatches: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                AcSectionHeader(icon: "clock.fill", title: L("home.next.title"), count: fixtures.isEmpty ? nil : min(fixtures.count, 3), tint: AcTheme.gold)
                Spacer(minLength: 0)
            }

            if fixtures.isEmpty {
                AcEmptyState(icon: "calendar.badge.clock", title: L("home.next.empty.title"), subtitle: L("home.next.empty.subtitle"))
            } else {
                VStack(spacing: 10) {
                    ForEach(fixtures.prefix(3)) { fixture in
                        AcMatchCard(fixture: fixture)
                    }
                }
                Button(action: onOpenMatches) {
                    Label(L("home.next.viewAll"), systemImage: "calendar")
                        .font(AsianCupFonts.app(size: 13, weight: .bold))
                        .foregroundStyle(AcTheme.emeraldDeep)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                        .background(RoundedRectangle(cornerRadius: AcTheme.buttonRadius, style: .continuous).fill(AcTheme.gold))
                }
                .buttonStyle(.plain)
            }
        }
    }
}

private struct AcHomeVenuesPreview: View {
    let overview: AcOverview?
    let onOpenMore: () -> Void

    var body: some View {
        guard let overview, !overview.venues.isEmpty else { return AnyView(EmptyView()) }
        return AnyView(
            VStack(alignment: .leading, spacing: 12) {
                AcSectionHeader(icon: "building.2.fill", title: L("home.venues.title"), subtitle: L("home.venues.subtitle"), count: overview.venues.count, tint: AcTheme.teal)
                VStack(spacing: 8) {
                    ForEach(overview.venues.prefix(3), id: \.name) { venue in
                        HStack(spacing: 10) {
                            Image(systemName: "mappin.and.ellipse")
                                .font(.system(size: 15, weight: .bold))
                                .foregroundStyle(AcTheme.gold)
                                .frame(width: 34, height: 34)
                                .background(RoundedRectangle(cornerRadius: 11, style: .continuous).fill(AcTheme.gold.opacity(0.12)))
                            VStack(alignment: .leading, spacing: 2) {
                                Text(venue.name)
                                    .font(AsianCupFonts.app(size: 13, weight: .bold))
                                    .foregroundStyle(AcTheme.onDark)
                                    .lineLimit(1)
                                Text(venue.city)
                                    .font(AsianCupFonts.app(size: 11))
                                    .foregroundStyle(AcTheme.onDarkDim)
                                    .lineLimit(1)
                            }
                            Spacer(minLength: 0)
                        }
                        .padding(12)
                        .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(AcTheme.cardFill))
                        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(AcTheme.outline, lineWidth: 1))
                    }
                }
                Button(action: onOpenMore) {
                    Text(L("home.venues.all"))
                        .font(AsianCupFonts.app(size: 13, weight: .bold))
                        .foregroundStyle(AcTheme.goldDeep)
                }
                .buttonStyle(.plain)
            }
        )
    }
}

private struct AcMatchesHero: View {
    let fixtures: [AcFixture]

    private var finishedCount: Int { fixtures.filter { $0.status.finished }.count }
    private var liveCount: Int { fixtures.filter { $0.status.live }.count }

    var body: some View {
        HStack(spacing: 10) {
            AcSmallStat(icon: "flag.fill", value: "\(fixtures.count)", label: L("matchesHero.matches"), tint: AcTheme.gold)
            AcSmallStat(icon: "checkmark.seal.fill", value: "\(finishedCount)", label: L("matchesHero.finished"), tint: AcTheme.emeraldSoft)
            AcSmallStat(icon: "dot.radiowaves.left.and.right", value: "\(liveCount)", label: L("state.live"), tint: AcTheme.crimson)
        }
    }
}

private struct AcSmallStat: View {
    let icon: String
    let value: String
    let label: String
    let tint: Color

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: icon)
                .font(.system(size: 13, weight: .bold))
                .foregroundStyle(tint)
            VStack(alignment: .leading, spacing: 1) {
                Text(value)
                    .font(AsianCupFonts.app(size: 17, weight: .bold))
                    .foregroundStyle(AcTheme.onDark)
                Text(label)
                    .font(AsianCupFonts.app(size: 10))
                    .foregroundStyle(AcTheme.onDarkFaint)
            }
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity)
        .padding(12)
        .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(AcTheme.cardFill))
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(AcTheme.outline, lineWidth: 1))
    }
}

private struct AcRefreshBanner: View {
    let message: String
    let refresh: () async -> Void

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: "wifi.exclamationmark")
                .font(.system(size: 17, weight: .bold))
                .foregroundStyle(AcTheme.gold)
                .frame(width: 38, height: 38)
                .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(AcTheme.gold.opacity(0.12)))
            VStack(alignment: .leading, spacing: 3) {
                Text(L("refresh.error.title"))
                    .font(AsianCupFonts.app(size: 13, weight: .bold))
                    .foregroundStyle(AcTheme.onDark)
                Text(message)
                    .font(AsianCupFonts.app(size: 11))
                    .foregroundStyle(AcTheme.onDarkDim)
                    .lineLimit(1)
            }
            Spacer(minLength: 0)
            Button {
                Task { await refresh() }
            } label: {
                Image(systemName: "arrow.clockwise")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(AcTheme.emeraldDeep)
                    .frame(width: 32, height: 32)
                    .background(Circle().fill(AcTheme.gold))
            }
            .buttonStyle(.plain)
        }
        .padding(12)
        .background(RoundedRectangle(cornerRadius: 18, style: .continuous).fill(AcTheme.cardFill))
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(AcTheme.outline, lineWidth: 1))
    }
}

private struct AcLoadingPanel: View {
    let title: String

    var body: some View {
        HStack(spacing: 10) {
            ProgressView().tint(AcTheme.gold)
            Text(title)
                .font(AsianCupFonts.app(size: 13, weight: .semibold))
                .foregroundStyle(AcTheme.onDarkDim)
            Spacer(minLength: 0)
        }
        .padding(14)
        .background(RoundedRectangle(cornerRadius: 18, style: .continuous).fill(AcTheme.cardFill))
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(AcTheme.outline, lineWidth: 1))
    }
}

private struct AcMoreLinkCard: View {
    let icon: String
    let title: String
    let subtitle: String

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 17, weight: .bold))
                .foregroundStyle(AcTheme.gold)
                .frame(width: 42, height: 42)
                .background(RoundedRectangle(cornerRadius: 13, style: .continuous).fill(AcTheme.gold.opacity(0.12)))
            VStack(alignment: .leading, spacing: 3) {
                Text(title)
                    .font(AsianCupFonts.app(size: 14, weight: .bold))
                    .foregroundStyle(AcTheme.onDark)
                Text(subtitle)
                    .font(AsianCupFonts.app(size: 11))
                    .foregroundStyle(AcTheme.onDarkDim)
            }
            Spacer(minLength: 0)
            Image(systemName: "chevron.left")
                .font(.system(size: 12, weight: .bold))
                .foregroundStyle(AcTheme.onDarkFaint)
        }
        .padding(14)
        .background(RoundedRectangle(cornerRadius: 18, style: .continuous).fill(AcTheme.cardFill))
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(AcTheme.outline, lineWidth: 1))
    }
}

private struct AcLiveRibbon: View {
    var body: some View {
        HStack(spacing: 8) {
            Circle()
                .fill(AcTheme.crimson)
                .frame(width: 9, height: 9)
            Text(L("hero.liveNow"))
                .font(AsianCupFonts.app(size: 13, weight: .bold))
                .foregroundStyle(AcTheme.onDark)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(Capsule().fill(AcTheme.crimson.opacity(0.18)))
        .overlay(Capsule().stroke(AcTheme.crimson.opacity(0.35), lineWidth: 1))
    }
}

private struct AcFooterSignature: View {
    var body: some View {
        VStack(spacing: 4) {
                Text(L("hero.fullCoverage"))
                .font(AsianCupFonts.app(size: 12))
                .foregroundStyle(AcTheme.onDarkFaint)
            Text("sabq.org/asian-cup")
                .font(AsianCupFonts.app(size: 11, weight: .semibold))
                .foregroundStyle(AcTheme.gold.opacity(0.75))
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 8)
    }
}

// MARK: - Hero (العدّ التنازلي + مباراة اليوم)
struct AcHero: View {
    let overview: AcOverview?
    let loading: Bool

    var body: some View {
        VStack(spacing: 16) {
            headerStrip

            if let ov = overview {
                if ov.started {
                    liveBanner
                }
                if !ov.started, let start = ov.startsAt {
                    AcCountdownCard(iso: start)
                } else if let next = ov.nextMatch {
                    AcNextMatchCard(fixture: next)
                }
                factsStrip(ov)
            } else if loading {
                AcLoading()
                    .frame(minHeight: 180)
            }
        }
        .padding(.horizontal, 16)
    }

    private var headerStrip: some View {
        VStack(spacing: 12) {
            AcEmblem(height: 138)

            HStack(spacing: 8) {
                AcHeroBadge(icon: "trophy.fill", text: L("hero.badge.special"), tint: AcTheme.gold)
                AcHeroBadge(icon: "mappin.circle.fill", text: L("hero.hostedBy"), tint: AcTheme.emeraldSoft)
            }

            AcTournamentTitle()

            if let ov = overview {
                HStack(spacing: 6) {
                    Image(systemName: "calendar")
                        .font(.system(size: 12))
                        .foregroundStyle(AcTheme.gold)
                    Text(AcFormat.dateRange(startIso: ov.startsAt, endIso: ov.endsAt))
                        .font(AsianCupFonts.app(size: 13))
                        .foregroundStyle(AcTheme.onDarkDim)
                }
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 8)
    }

    private var liveBanner: some View {
        TimelineView(.periodic(from: .now, by: 1)) { ctx in
            let on = Int(ctx.date.timeIntervalSinceReferenceDate) % 2 == 0
            HStack(spacing: 8) {
                Circle()
                    .fill(AcTheme.crimson)
                    .frame(width: 9, height: 9)
                    .opacity(on ? 1 : 0.35)
                Text(L("hero.liveNow"))
                    .font(AsianCupFonts.app(size: 13, weight: .bold))
                    .foregroundStyle(AcTheme.onDark)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 9)
            .background(Capsule().fill(AcTheme.crimson.opacity(0.18)))
            .overlay(Capsule().stroke(AcTheme.crimson.opacity(0.4), lineWidth: 1))
        }
    }

    private func factsStrip(_ ov: AcOverview) -> some View {
        HStack(spacing: 12) {
            fact("\(ov.teamsCount)", L("metric.team"))
            divider
            fact("\(ov.groupsCount)", L("metric.groups"))
            divider
            fact("\(ov.venues.count)", L("metric.venues"))
        }
        .padding(.vertical, 12)
        .padding(.horizontal, 16)
        .frame(maxWidth: .infinity)
        .background(
            RoundedRectangle(cornerRadius: AcTheme.tileRadius, style: .continuous)
                .fill(AcTheme.cardFill)
        )
    }

    private func fact(_ value: String, _ label: String) -> some View {
        VStack(spacing: 2) {
            Text(value).font(AsianCupFonts.app(size: 18, weight: .bold)).foregroundStyle(AcTheme.gold)
            Text(label).font(AsianCupFonts.app(size: 11)).foregroundStyle(AcTheme.onDarkDim)
        }
        .frame(maxWidth: .infinity)
    }
    private var divider: some View { Rectangle().fill(AcTheme.outline).frame(width: 1, height: 28) }
}

// العدّ التنازلي — تصميم مسطّح عصري: خلايا زجاجية رفيعة + أرقام بتدرّج أبيض↔زمردي،
// بلا حشوة ذهبية أو خطوط تعطي إحساسًا ثري-دي/قديمًا.
struct AcCountdownCard: View {
    let iso: String

    private var numberGradient: LinearGradient {
        LinearGradient(colors: [AcTheme.teal, AcTheme.azure],
                       startPoint: .top, endPoint: .bottom)
    }

    var body: some View {
        VStack(spacing: 12) {
            HStack(spacing: 6) {
                Image(systemName: "timer").font(.system(size: 11, weight: .semibold))
                Text(L("countdown.title"))
                    .font(AsianCupFonts.app(size: 12, weight: .semibold))
                    .tracking(1)
            }
            .foregroundStyle(AcTheme.onDarkDim)

            TimelineView(.periodic(from: .now, by: 1)) { _ in
                let c = AcCountdownMath.to(iso: iso)
                HStack(spacing: 10) {
                    cell(c.days, L("countdown.days"))
                    cell(c.hours, L("countdown.hours"))
                    cell(c.minutes, L("countdown.minutes"))
                    cell(c.seconds, L("countdown.seconds"))
                }
                .environment(\.layoutDirection, .leftToRight)
            }
        }
        .frame(maxWidth: .infinity)
    }

    private func cell(_ n: Int, _ label: String) -> some View {
        VStack(spacing: 6) {
            Text(String(format: "%02d", n))
                .font(AsianCupFonts.app(size: 32, weight: .bold))
                .monospacedDigit()
                .foregroundStyle(numberGradient)
                .contentTransition(.numericText(countsDown: true))
            Text(label)
                .font(AsianCupFonts.app(size: 10))
                .foregroundStyle(AcTheme.onDarkFaint)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 16)
        .background(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(AcTheme.chipFill)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(AcTheme.outline, lineWidth: 1)
        )
    }
}

// مباراة اليوم / القادمة (قبل البطولة).
struct AcNextMatchCard: View {
    let fixture: AcFixture

    var body: some View {
        VStack(spacing: 12) {
            Text(L("countdown.next"))
                .font(AsianCupFonts.subhead(size: 13))
                .foregroundStyle(AcTheme.onDarkDim)

            HStack(spacing: 14) {
                teamSide(fixture.home)
                VStack(spacing: 2) {
                    Text(AcFormat.kickoffDay(fixture.date))
                        .font(AsianCupFonts.app(size: 11))
                        .foregroundStyle(AcTheme.onDarkDim)
                    Text(AcFormat.kickoffTime(fixture.date))
                        .font(AsianCupFonts.app(size: 20, weight: .bold))
                        .foregroundStyle(AcTheme.gold)
                }
                .frame(width: 90)
                teamSide(fixture.away)
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity)
        .background(
            RoundedRectangle(cornerRadius: AcTheme.cardRadius, style: .continuous)
                .fill(AcTheme.cardFill)
                .overlay(
                    RoundedRectangle(cornerRadius: AcTheme.cardRadius, style: .continuous)
                        .stroke(AcTheme.outline, lineWidth: 1)
                )
        )
    }

    private func teamSide(_ team: AcTeam) -> some View {
        VStack(spacing: 6) {
            AcTeamLogo(logo: team.logo, size: 48)
            Text(LTeam(String(team.id), fallback: team.name))
                .font(AsianCupFonts.app(size: 12, weight: .semibold))
                .foregroundStyle(AcTheme.onDark)
                .lineLimit(2)
                .multilineTextAlignment(.center)
                .frame(height: 30)
        }
        .frame(maxWidth: .infinity)
    }
}

// MARK: - مشوار الأخضر (بطاقة مضيف أنيقة مسطّحة)
struct AcSaudiSpotlight: View {
    let saudi: AcSaudi

    var body: some View {
        VStack(spacing: 16) {
            header
            if !saudi.fixtures.isEmpty {
                fixturesBlock
            }
        }
        .padding(18)
        .background(
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .fill(AcTheme.surfaceRaised)
                .overlay(alignment: .topLeading) {
                    // وهج زمردي خفيف في الزاوية بدل التدرّج الثقيل
                    Circle()
                        .fill(AcTheme.emeraldSoft.opacity(0.18))
                        .frame(width: 200, height: 200)
                        .blur(radius: 70)
                        .offset(x: -40, y: -60)
                }
        )
        .overlay(
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .stroke(AcTheme.outline, lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
        .padding(.horizontal, 16)
    }

    private var header: some View {
        HStack(spacing: 14) {
            if let team = saudi.team {
                AcTeamLogo(logo: team.logo, size: 64)
            }
            VStack(alignment: .leading, spacing: 7) {
                HStack(spacing: 5) {
                    Image(systemName: "star.fill").font(.system(size: 10))
                    Text(L("saudi.host")).font(AsianCupFonts.app(size: 11, weight: .bold))
                }
                .foregroundStyle(AcTheme.gold)

                Text(LTeam("\(AsianCupConstants.saudiTeamId)", fallback: saudi.team?.name ?? L("team.saudi")))
                    .font(AsianCupFonts.app(size: 22, weight: .bold))
                    .foregroundStyle(AcTheme.onDark)
                Text(saudi.group.map { L("saudi.subtitle.in", ["group": $0]) } ?? L("saudi.subtitle.fallback"))
                    .font(AsianCupFonts.app(size: 12))
                    .foregroundStyle(AcTheme.onDarkDim)
            }
            Spacer(minLength: 0)
        }
    }

    private var fixturesBlock: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                Rectangle().fill(AcTheme.gold).frame(width: 3, height: 14).clipShape(Capsule())
                Text(L("saudi.matches"))
                    .font(AsianCupFonts.app(size: 13, weight: .bold))
                    .foregroundStyle(AcTheme.onDark)
            }
            ForEach(saudi.fixtures.prefix(6)) { f in
                AcMatchCard(fixture: f)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

// MARK: - المجموعات والترتيب (جدول فاتح واضح مستوحى من شاشة المونديال)

// عروض أعمدة الأرقام — مشتركة بين ترويسة البطاقة وصفوف الترتيب لتُحاذى تمامًا.
private enum AcStandCol {
    static let played: CGFloat = 30
    static let diff: CGFloat = 42
    static let points: CGFloat = 36
    static let trailing: CGFloat = 6
}

struct AcGroupsSection: View {
    let groups: [AcGroup]

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            AcSectionHeader(
                icon: "list.number",
                title: L("standings.section.title"),
                subtitle: L("standings.section.subtitle"),
                count: groups.isEmpty ? nil : groups.count,
                tint: AcTheme.teal
            )

            if groups.isEmpty {
                AcGroupsEmptyCard()
            } else {
                AcStandingsLegend()
                VStack(spacing: 14) {
                    ForEach(Array(groups.enumerated()), id: \.element.id) { idx, g in
                        AcGroupCard(group: g, order: idx + 1)
                    }
                }
            }
        }
    }
}

// مفتاح ألوان الجدول — يوضّح دلالة التظليل قبل قراءة الأرقام.
struct AcStandingsLegend: View {
    var body: some View {
        HStack(spacing: 16) {
            swatch(AcTheme.emeraldSoft, L("standings.legend.qualified"))
            swatch(AcTheme.gold, L("standings.legend.third"))
            Spacer(minLength: 0)
        }
    }

    private func swatch(_ color: Color, _ label: String) -> some View {
        HStack(spacing: 5) {
            RoundedRectangle(cornerRadius: 2, style: .continuous)
                .fill(color)
                .frame(width: 14, height: 8)
            Text(label)
                .font(AsianCupFonts.app(size: 11))
                .foregroundStyle(AcTheme.onDarkDim)
        }
    }
}

struct AcGroupCard: View {
    let group: AcGroup
    var order: Int = 0

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            // ترويسة: شارة هوية المجموعة + عناوين أعمدة محاذية فوق بياناتها.
            HStack(spacing: 8) {
                HStack(spacing: 6) {
                    Image(systemName: "flag.checkered")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundStyle(AcTheme.gold)
                    Text(groupTitle)
                        .font(AsianCupFonts.app(size: 15, weight: .bold))
                        .foregroundStyle(AcTheme.gold)
                }
                .padding(.horizontal, 11)
                .padding(.vertical, 5)
                .background(Capsule().fill(AcTheme.gold.opacity(0.14)))

                Spacer(minLength: 0)

                HStack(spacing: 0) {
                    colHead(L("standings.col.played"), width: AcStandCol.played)
                    colHead(L("standings.col.diff"), width: AcStandCol.diff)
                    colHead(L("standings.col.points"), width: AcStandCol.points)
                }
                .padding(.trailing, AcStandCol.trailing)
            }
            .padding(.bottom, 2)

            VStack(spacing: 4) {
                ForEach(Array(group.rows.enumerated()), id: \.element.id) { index, row in
                    AcGroupRow(row: row, visualRank: index + 1)
                    // فاصل «حدّ التأهل» بعد المركز الثاني (المتأهلَين مباشرة).
                    if index == 1 && group.rows.count > 2 {
                        AcQualifyDivider()
                    }
                }
            }
        }
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .fill(AcTheme.cardFillStrong)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .stroke(AcTheme.outline, lineWidth: 1)
        )
        .shadow(color: .black.opacity(0.10), radius: 14, y: 8)
        .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
    }

    private var groupTitle: String {
        let serverName = group.name.isEmpty ? L("standings.group.fallback") : group.name
        return order > 0 ? LGroup(order, fallback: serverName) : serverName
    }

    private func colHead(_ text: String, width: CGFloat) -> some View {
        Text(text)
            .font(AsianCupFonts.app(size: 10, weight: .semibold))
            .foregroundStyle(AcTheme.onDarkFaint)
            .frame(width: width)
    }
}

// فاصل بصري يوضّح خط التأهل المباشر (الأول والثاني).
struct AcQualifyDivider: View {
    var body: some View {
        HStack(spacing: 8) {
            line
            Text(L("standings.qualifyLine"))
                .font(AsianCupFonts.app(size: 9, weight: .bold))
                .foregroundStyle(AcTheme.emeraldSoft)
                .fixedSize()
            line
        }
        .padding(.vertical, 2)
    }

    private var line: some View {
        Rectangle()
            .fill(AcTheme.emeraldSoft.opacity(0.30))
            .frame(height: 1)
    }
}

struct AcGroupsEmptyCard: View {
    var body: some View {
        VStack(spacing: 10) {
            Image(systemName: "trophy")
                .font(.system(size: 32, weight: .bold))
                .foregroundStyle(AcTheme.gold)
            Text(L("groups.empty.title"))
                .font(AsianCupFonts.app(size: 18, weight: .bold))
                .foregroundStyle(AcTheme.onDark)
            Text(L("groups.empty.subtitle"))
                .font(AsianCupFonts.app(size: 13))
                .foregroundStyle(AcTheme.onDarkDim)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 30)
        .padding(.horizontal, 18)
        .background(RoundedRectangle(cornerRadius: 20, style: .continuous).fill(AcTheme.cardFillStrong))
        .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).stroke(AcTheme.outline, lineWidth: 1))
    }
}

// صفّ ترتيب واحد: شارة رتبة ملوّنة + شعار + اسم | لعب | فارق | نقاط.
struct AcGroupRow: View {
    let row: AcStandingRow
    let visualRank: Int

    private var qualifying: Bool { visualRank <= 2 }
    private var thirdPlace: Bool { visualRank == 3 }

    private var rowFill: Color {
        if qualifying { return AcTheme.emeraldSoft.opacity(0.13) }
        if thirdPlace { return AcTheme.gold.opacity(0.08) }
        return AcTheme.onDark.opacity(0.04)
    }
    private var accent: Color {
        if qualifying { return AcTheme.emeraldSoft }
        if thirdPlace { return AcTheme.goldDeep }
        return .clear
    }

    var body: some View {
        NavigationLink(value: row.team) {
            HStack(spacing: 0) {
                Rectangle()
                    .fill(accent)
                    .frame(width: 3)
                    .clipShape(Capsule())
                    .opacity(accent == .clear ? 0 : 1)
                    .padding(.vertical, 6)

                HStack(spacing: 9) {
                    rankBadge
                    AcTeamLogo(logo: row.team.logo, size: 28)
                    Text(LTeam(String(row.team.id), fallback: row.team.name))
                        .font(AsianCupFonts.app(size: 14, weight: .semibold))
                        .foregroundStyle(AcTheme.onDark)
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                }
                .padding(.leading, 8)
                .frame(maxWidth: .infinity, alignment: .leading)

                Text("\(row.played)")
                    .font(AsianCupFonts.app(size: 13, weight: .semibold)).foregroundStyle(AcTheme.onDarkDim)
                    .monospacedDigit().frame(width: AcStandCol.played)
                Text(diffText)
                    .font(AsianCupFonts.app(size: 13, weight: .semibold)).foregroundStyle(AcTheme.onDarkDim)
                    .monospacedDigit().frame(width: AcStandCol.diff)
                    .environment(\.layoutDirection, .leftToRight)
                Text("\(row.points)")
                    .font(AsianCupFonts.app(size: 16, weight: .bold))
                    .foregroundStyle(AcTheme.onDark)
                    .monospacedDigit().frame(width: AcStandCol.points)
            }
            .padding(.trailing, AcStandCol.trailing)
            .padding(.vertical, 6)
            .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(rowFill))
        }
        .buttonStyle(.plain)
    }

    // شارة الرتبة: المتأهلان دائرة زمردية مملوءة، الثالث دائرة ذهبية محدّدة، والبقية رقم باهت.
    @ViewBuilder private var rankBadge: some View {
        if qualifying {
            Text("\(visualRank)")
                .font(AsianCupFonts.app(size: 12, weight: .bold))
                .foregroundStyle(.white)
                .monospacedDigit()
                .frame(width: 20, height: 20)
                .background(Circle().fill(AcTheme.emeraldSoft))
        } else if thirdPlace {
            Text("\(visualRank)")
                .font(AsianCupFonts.app(size: 12, weight: .bold))
                .foregroundStyle(AcTheme.gold)
                .monospacedDigit()
                .frame(width: 20, height: 20)
                .background(Circle().fill(AcTheme.gold.opacity(0.16)))
                .overlay(Circle().stroke(AcTheme.gold.opacity(0.5), lineWidth: 1))
        } else {
            Text("\(visualRank)")
                .font(AsianCupFonts.app(size: 12, weight: .bold))
                .foregroundStyle(AcTheme.onDarkFaint)
                .monospacedDigit()
                .frame(width: 20, height: 20)
        }
    }

    private var diffText: String {
        row.goalsDiff > 0 ? "+\(row.goalsDiff)" : "\(row.goalsDiff)"
    }
}

// MARK: - جدول المباريات (مرشّحات أدوار + تجميع باليوم — مطابق للويب)
struct AcScheduleSection: View {
    let fixtures: [AcFixture]
    @State private var activeRound: String? = nil

    // نفلتر بـ roundEn القانوني (ثابت عبر اللغات) ونعرّب نص الشريحة فقط.
    private var rounds: [String] {
        var seen: [String] = []
        for f in fixtures where !f.roundEn.isEmpty && !seen.contains(f.roundEn) { seen.append(f.roundEn) }
        return seen
    }

    private var filtered: [AcFixture] {
        guard let activeRound else { return fixtures }
        return fixtures.filter { $0.roundEn == activeRound }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            AcSectionHeader(icon: "calendar", title: L("schedule.title"), count: fixtures.isEmpty ? nil : fixtures.count, tint: AcTheme.gold)

            if rounds.count > 1 {
                roundFilter
            }

            if fixtures.isEmpty {
                AcEmptyState(icon: "sportscourt", title: L("schedule.empty.title"), subtitle: L("schedule.empty.subtitle"))
            } else {
                VStack(spacing: 18) {
                    ForEach(groupedByDay()) { day in
                        AcDayColumn(day: day)
                    }
                }
            }
        }
        .padding(.horizontal, 16)
    }

    private var roundFilter: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                roundChip(title: L("schedule.round.all"), value: nil)
                ForEach(rounds, id: \.self) { r in
                    roundChip(title: LRound(r, fallback: r), value: r)
                }
            }
            .padding(.vertical, 2)
        }
    }

    private func roundChip(title: String, value: String?) -> some View {
        let active = activeRound == value
        return Button {
            withAnimation(.easeOut(duration: 0.2)) { activeRound = value }
        } label: {
            Text(title)
                .font(AsianCupFonts.app(size: 13, weight: .bold))
                .foregroundStyle(active ? AcTheme.emeraldDeep : AcTheme.onDarkDim)
                .padding(.horizontal, 16).padding(.vertical, 8)
                .background(
                    Capsule().fill(active ? AcTheme.gold : AcTheme.chipFill)
                )
        }
        .buttonStyle(.plain)
    }

    private func groupedByDay() -> [AcDayGroup] {
        let grouped = Dictionary(grouping: filtered) { AcFormat.kickoffDay($0.date) }
        return grouped.map { (day, items) in
            AcDayGroup(
                key: day,
                label: day,
                items: items.sorted { $0.timestamp < $1.timestamp }
            )
        }
        .sorted { ($0.items.first?.timestamp ?? 0) < ($1.items.first?.timestamp ?? 0) }
    }
}

// عمود يوم واحد في الجدول — عنوان (نقطة + يوم + عدد) ثم بطاقات.
struct AcDayColumn: View {
    let day: AcDayGroup

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Circle().fill(AcTheme.gold).frame(width: 8, height: 8)
                Text(day.label)
                    .font(AsianCupFonts.subhead(size: 14))
                    .foregroundStyle(AcTheme.onDark)
                Text("(\(day.items.count))")
                    .font(AsianCupFonts.app(size: 12))
                    .foregroundStyle(AcTheme.onDarkFaint)
            }
            ForEach(day.items) { f in
                AcMatchCard(fixture: f)
            }
        }
    }
}

// MARK: - المنتخبات المتأهّلة (بطاقات + شارة مضيف)
struct AcTeamsSection: View {
    let teams: [AcTeam]

    private let cols = [GridItem(.adaptive(minimum: 100), spacing: 12)]

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            AcSectionHeader(icon: "person.3.fill", title: L("teams.section.title"), count: teams.isEmpty ? nil : teams.count, tint: AcTheme.emeraldSoft)

            if teams.isEmpty {
                AcEmptyState(icon: "person.3", title: L("teams.empty.title"), subtitle: L("teams.empty.subtitle"))
            } else {
                LazyVGrid(columns: cols, spacing: 12) {
                    ForEach(teams) { t in AcTeamChip(team: t) }
                }
            }
        }
        .padding(.horizontal, 16)
    }
}

struct AcTeamChip: View {
    let team: AcTeam

    private var isHost: Bool { team.id == AsianCupConstants.saudiTeamId }

    var body: some View {
        NavigationLink(value: team) {
            VStack(spacing: 10) {
                AcTeamLogo(logo: team.logo, size: 54)
                Text(LTeam(String(team.id), fallback: team.name))
                    .font(AsianCupFonts.app(size: 12, weight: .semibold))
                    .foregroundStyle(AcTheme.onDark)
                    .lineLimit(2)
                    .multilineTextAlignment(.center)
                    .frame(height: 30)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .background(
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .fill(isHost ? AcTheme.gold.opacity(0.08) : AcTheme.cardFill)
                    .overlay(
                        RoundedRectangle(cornerRadius: 18, style: .continuous)
                            .stroke(isHost ? AcTheme.gold.opacity(0.5) : AcTheme.outline, lineWidth: isHost ? 1.5 : 1)
                    )
            )
            .overlay(alignment: .topTrailing) {
                if isHost {
                    HStack(spacing: 3) {
                        Image(systemName: "star.fill").font(.system(size: 8))
                        Text(L("teams.host.badge")).font(AsianCupFonts.app(size: 9, weight: .bold))
                    }
                    .foregroundStyle(AcTheme.emeraldDeep)
                    .padding(.horizontal, 7).padding(.vertical, 3)
                    .background(Capsule().fill(AcTheme.gold))
                    .padding(6)
                }
            }
        }
        .buttonStyle(.plain)
    }
}

// MARK: - ملاعب الاستضافة
struct AcHostShowcase: View {
    let overview: AcOverview

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            AcSectionHeader(icon: "building.2.fill", title: L("venues.section.title"), count: overview.venues.isEmpty ? nil : overview.venues.count, tint: AcTheme.gold)

            if overview.venues.isEmpty {
                AcEmptyState(icon: "building.2", title: L("venues.empty.title"), subtitle: L("venues.empty.subtitle"))
            } else {
                VStack(spacing: 10) {
                    ForEach(overview.venues, id: \.name) { v in
                        HStack(spacing: 12) {
                            Image(systemName: "mappin.and.ellipse")
                                .font(.system(size: 18))
                                .foregroundStyle(AcTheme.gold)
                                .frame(width: 42, height: 42)
                                .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(AcTheme.gold.opacity(0.12)))
                            VStack(alignment: .leading, spacing: 2) {
                                Text(v.name).font(AsianCupFonts.app(size: 14, weight: .bold)).foregroundStyle(AcTheme.onDark)
                                if !v.city.isEmpty {
                                    Text(v.city).font(AsianCupFonts.app(size: 12)).foregroundStyle(AcTheme.onDarkDim)
                                }
                            }
                            Spacer(minLength: 0)
                        }
                        .padding(12)
                        .background(
                            RoundedRectangle(cornerRadius: 16, style: .continuous)
                                .fill(AcTheme.cardFill)
                                .overlay(
                                    RoundedRectangle(cornerRadius: 16, style: .continuous)
                                        .stroke(AcTheme.outline, lineWidth: 1)
                                )
                        )
                    }
                }
            }
        }
        .padding(.horizontal, 16)
    }
}

// MARK: - شاشة الهدّافين
struct AcScorersScreen: View {
    @State private var scorers: [AcScorer] = []
    @State private var loading = true
    @State private var errorMessage: String?

    var body: some View {
        AcScreenScaffold {
            VStack(spacing: 16) {
                AcTopBar(title: L("scorers.title"), subtitle: L("scorers.subtitle"), state: scorers.isEmpty ? "—" : "\(scorers.count)")

                if let errorMessage {
                    AcEmptyState(icon: "wifi.exclamationmark", title: L("scorers.empty.title"), subtitle: errorMessage)
                } else if loading {
                    AcLoadingPanel(title: L("loading.scorers"))
                } else if scorers.isEmpty {
                    AcEmptyState(icon: "soccerball", title: L("scorers.empty.title"), subtitle: L("scorers.empty.subtitle"))
                } else {
                    VStack(spacing: 10) {
                        ForEach(scorers, id: \.rank) { s in
                            NavigationLink {
                                AcPlayerProfileScreen(
                                    playerId: s.id,
                                    fallbackName: LName(s.name, s.nameEn),
                                    fallbackPhoto: s.photo,
                                    fallbackSubtitle: LTeam(String(s.team.id), fallback: s.team.name),
                                    fallbackTeam: s.team
                                )
                            } label: {
                                AcScorerRow(scorer: s)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
                AcFooterSignature()
            }
        }
        .navigationBarHidden(true)
        .task { await load() }
        .refreshable { await load(force: true) }
        .navigationDestination(for: AcTeam.self) { team in
            AcTeamProfileScreen(teamId: team.id, fallback: team)
        }
    }

    private func load(force: Bool = false) async {
        loading = true
        do {
            scorers = try await APIClient.shared.fetchAcScorers(ignoreCache: force)
            errorMessage = nil
        } catch {
            errorMessage = LError(error)
        }
        loading = false
    }
}

private struct AcScorerRow: View {
    let scorer: AcScorer

    private var rankTint: Color { scorer.rank <= 3 ? AcTheme.gold : AcTheme.onDarkDim }

    var body: some View {
        HStack(spacing: 12) {
            Text("\(scorer.rank)")
                .font(AsianCupFonts.app(size: 14, weight: .bold))
                .foregroundStyle(scorer.rank <= 3 ? AcTheme.emeraldDeep : AcTheme.onDarkDim)
                .monospacedDigit()
                .frame(width: 30, height: 30)
                .background(Circle().fill(scorer.rank <= 3 ? AcTheme.gold : AcTheme.chipFill))

            ZStack {
                Circle().fill(AcTheme.chipFill)
                Image(systemName: "person.fill").font(.system(size: 18)).foregroundStyle(AcTheme.onDarkFaint)
                AcRemoteImage(url: scorer.photo).clipShape(Circle())
            }
            .frame(width: 42, height: 42)
            .overlay(Circle().stroke(AcTheme.outline, lineWidth: 1))

            VStack(alignment: .leading, spacing: 3) {
                Text(LName(scorer.name, scorer.nameEn))
                    .font(AsianCupFonts.app(size: 14, weight: .bold))
                    .foregroundStyle(AcTheme.onDark)
                    .lineLimit(1).minimumScaleFactor(0.75)
                HStack(spacing: 5) {
                    AcTeamLogo(logo: scorer.team.logo, size: 16)
                    Text(LTeam(String(scorer.team.id), fallback: scorer.team.name))
                        .font(AsianCupFonts.app(size: 11))
                        .foregroundStyle(AcTheme.onDarkDim)
                        .lineLimit(1)
                }
            }
            Spacer(minLength: 0)

            if scorer.assists > 0 {
                statPill(value: "\(scorer.assists)", label: L("scorers.assists"), tint: AcTheme.teal)
            }
            VStack(spacing: 1) {
                Text("\(scorer.goals)")
                    .font(AsianCupFonts.app(size: 20, weight: .bold))
                    .foregroundStyle(AcTheme.goldDeep)
                    .monospacedDigit()
                Text(L("scorers.goals"))
                    .font(AsianCupFonts.app(size: 9))
                    .foregroundStyle(AcTheme.onDarkFaint)
            }
            .frame(minWidth: 38)
        }
        .padding(12)
        .background(RoundedRectangle(cornerRadius: 18, style: .continuous).fill(AcTheme.cardFill))
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(AcTheme.outline, lineWidth: 1))
    }

    private func statPill(value: String, label: String, tint: Color) -> some View {
        VStack(spacing: 1) {
            Text(value)
                .font(AsianCupFonts.app(size: 14, weight: .bold))
                .foregroundStyle(tint)
                .monospacedDigit()
            Text(label)
                .font(AsianCupFonts.app(size: 9))
                .foregroundStyle(AcTheme.onDarkFaint)
        }
        .frame(minWidth: 34)
    }
}

// MARK: - شاشة شجرة الأدوار الإقصائية
struct AcBracketScreen: View {
    @State private var bracket: AcBracket?
    @State private var loading = true
    @State private var errorMessage: String?

    private var hasRounds: Bool { (bracket?.rounds.isEmpty == false) }

    var body: some View {
        AcScreenScaffold {
            VStack(spacing: 18) {
                AcTopBar(title: L("bracket.title"), subtitle: L("bracket.subtitle"), state: hasRounds ? "\(bracket?.rounds.count ?? 0)" : "—")

                if let errorMessage {
                    AcEmptyState(icon: "wifi.exclamationmark", title: L("bracket.empty.title"), subtitle: errorMessage)
                } else if loading {
                    AcLoadingPanel(title: L("loading.bracket"))
                } else if !hasRounds {
                    AcEmptyState(icon: "trophy", title: L("bracket.empty.title"), subtitle: L("bracket.empty.subtitle"))
                } else {
                    ForEach(bracket!.rounds) { round in
                        VStack(alignment: .leading, spacing: 12) {
                            AcSectionHeader(icon: "flag.checkered", title: LRound(round.roundEn, fallback: round.round), count: round.matches.count, tint: AcTheme.gold)
                            VStack(spacing: 10) {
                                ForEach(round.matches) { f in
                                    AcMatchCard(fixture: f)
                                }
                            }
                        }
                    }
                }
                AcFooterSignature()
            }
        }
        .navigationBarHidden(true)
        .task { await load() }
        .refreshable { await load(force: true) }
    }

    private func load(force: Bool = false) async {
        loading = true
        do {
            bracket = try await APIClient.shared.fetchAcBracket(ignoreCache: force)
            errorMessage = nil
        } catch {
            errorMessage = LError(error)
        }
        loading = false
    }
}

// MARK: - صفحة المنتخب
struct AcTeamProfileScreen: View {
    let teamId: Int
    let fallback: AcTeam
    @State private var profile: AcTeamProfile?
    @State private var loading = true
    @State private var errorMessage: String?

    private var team: AcTeam { profile?.team ?? fallback }

    var body: some View {
        AcScreenScaffold {
            VStack(spacing: 18) {
                header

                if let errorMessage {
                    AcRefreshBanner(message: errorMessage, refresh: { await load(force: true) })
                } else if loading && profile == nil {
                    AcLoadingPanel(title: L("loading.team"))
                }

                NavigationLink {
                    AcQualificationTimelineScreen(team: team)
                } label: {
                    AcQualificationEntryCard(team: team)
                }
                .buttonStyle(.plain)

                if let profile {
                    AcTeamSummaryCard(profile: profile)

                    if let next = profile.nextMatch ?? profile.fixtures.first(where: { !$0.status.finished }) {
                        AcTeamNextMatchFeature(fixture: next, teamId: teamId)
                    }

                    if !profile.fixtures.isEmpty {
                        AcTeamJourneySection(fixtures: profile.fixtures, teamId: teamId)
                    }

                    if let group = profile.group {
                        VStack(alignment: .leading, spacing: 12) {
                            AcSectionHeader(icon: "list.number", title: L("team.group"), tint: AcTheme.goldDeep)
                            AcStandingsLegend()
                            AcGroupCard(group: group)
                        }
                    }

                    if !profile.squad.isEmpty {
                        AcSquadSection(squad: profile.squad, team: profile.team)
                    }
                }

                AcFooterSignature()
            }
        }
        .navigationBarHidden(true)
        .task { await load() }
        .refreshable { await load(force: true) }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack(alignment: .center, spacing: 16) {
                AcTeamLogo(logo: team.logo, size: 84)
                    .shadow(color: .black.opacity(0.08), radius: 12, y: 6)

                VStack(alignment: .leading, spacing: 7) {
                    Text(LTeam(String(team.id), fallback: team.name))
                        .font(AsianCupFonts.app(size: 30, weight: .bold))
                        .foregroundStyle(AcTheme.onDarkStrong)
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)

                    if let badge = rankBadge {
                        Text("\(badge.groupName) · \(L("team.rank", ["rank": "\(badge.rank)"]))")
                            .font(AsianCupFonts.app(size: 13, weight: .bold))
                            .foregroundStyle(AcTheme.onDarkDim)
                            .lineLimit(1)
                    } else {
                        Text(L("teams.subtitle"))
                            .font(AsianCupFonts.app(size: 13, weight: .semibold))
                            .foregroundStyle(AcTheme.onDarkDim)
                            .lineLimit(1)
                    }
                }

                Spacer(minLength: 0)
            }

            HStack(spacing: 8) {
                if teamId == AsianCupConstants.saudiTeamId {
                    AcHeaderChip(icon: "star.fill", text: L("saudi.host"), tint: AcTheme.goldDeep)
                }
                if let coach = profile?.coach, !coach.isEmpty {
                    AcHeaderChip(icon: "person.fill.viewfinder", text: coach, tint: AcTheme.onDarkDim)
                }
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 4)
        .padding(.bottom, 6)
    }

    private var rankBadge: (groupName: String, rank: Int)? {
        if let stats = profile?.stats, let rank = stats.rank, let groupName = stats.groupName {
            return (groupName, rank)
        }
        guard let group = profile?.group, let row = group.rows.first(where: { $0.team.id == teamId }) else {
            return nil
        }
        return (group.name, row.rank)
    }

    private func load(force: Bool = false) async {
        loading = true
        do {
            profile = try await APIClient.shared.fetchAcTeamProfile(teamId, ignoreCache: force)
            errorMessage = nil
        } catch {
            errorMessage = LError(error)
        }
        loading = false
    }
}

private struct AcQualificationEntryCard: View {
    let team: AcTeam

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: "point.topleft.down.curvedto.point.bottomright.up.fill")
                .font(.system(size: 18, weight: .bold))
                .foregroundStyle(AcTheme.goldDeep)
                .frame(width: 44, height: 44)
                .background(RoundedRectangle(cornerRadius: 13, style: .continuous).fill(AcTheme.chipFill))

            VStack(alignment: .leading, spacing: 4) {
                Text(L("team.qualification"))
                    .font(AsianCupFonts.app(size: 16, weight: .bold))
                    .foregroundStyle(AcTheme.onDarkStrong)
                Text(L("team.qualification.subtitle"))
                    .font(AsianCupFonts.app(size: 11, weight: .semibold))
                    .foregroundStyle(AcTheme.onDarkDim)
                    .lineLimit(1)
            }

            Spacer(minLength: 0)

            HStack(spacing: 8) {
                AcTeamLogo(logo: team.logo, size: 30)
                Image(systemName: "chevron.left")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundStyle(AcTheme.onDarkFaint)
            }
        }
        .padding(14)
        .background(RoundedRectangle(cornerRadius: 18, style: .continuous).fill(AcTheme.cardFillStrong))
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(AcTheme.outline, lineWidth: 1))
    }
}

private struct AcQualificationTimelineScreen: View {
    let team: AcTeam
    @State private var journey: AcQualificationJourney?
    @State private var loading = true
    @State private var errorMessage: String?

    var body: some View {
        AcScreenScaffold {
            VStack(spacing: 26) {
                header

                if let errorMessage {
                    AcRefreshBanner(message: errorMessage, refresh: { await load(force: true) })
                } else if loading && journey == nil {
                    AcLoadingPanel(title: L("loading.team"))
                }

                if let journey {
                    AcQualificationLead(team: team, journey: journey)
                    AcQualificationTimelineList(items: journey.timeline)
                }

                AcFooterSignature()
            }
        }
        .navigationBarHidden(true)
        .task { await load() }
        .refreshable { await load(force: true) }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .center, spacing: 12) {
                AcTeamLogo(logo: team.logo, size: 54)
                VStack(alignment: .leading, spacing: 3) {
                    Text(LTeam(String(team.id), fallback: team.name))
                        .font(AsianCupFonts.app(size: 13, weight: .bold))
                        .foregroundStyle(AcTheme.goldDeep)
                    Text(L("team.qualification"))
                        .font(AsianCupFonts.app(size: 34, weight: .bold))
                        .foregroundStyle(AcTheme.onDarkStrong)
                        .lineLimit(1)
                        .minimumScaleFactor(0.72)
                }
                Spacer(minLength: 0)
            }

            Text(journey?.subtitle ?? L("team.qualification.subtitle"))
                .font(AsianCupFonts.app(size: 13, weight: .semibold))
                .foregroundStyle(AcTheme.onDarkDim)
                .lineLimit(2)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.top, 4)
    }

    private func load(force: Bool = false) async {
        loading = true
        do {
            journey = try await APIClient.shared.fetchAcQualificationJourney(team.id, ignoreCache: force)
            errorMessage = nil
        } catch {
            errorMessage = LError(error)
        }
        loading = false
    }
}

private struct AcQualificationLead: View {
    let team: AcTeam
    let journey: AcQualificationJourney

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            VStack(alignment: .leading, spacing: 6) {
                Text(journey.source)
                    .font(AsianCupFonts.app(size: 11, weight: .bold))
                    .foregroundStyle(AcTheme.goldDeep)
                    .lineLimit(1)
                Text(journey.title)
                    .font(AsianCupFonts.app(size: 27, weight: .bold))
                    .foregroundStyle(AcTheme.onDarkStrong)
                    .lineLimit(2)
                    .minimumScaleFactor(0.78)
            }

            HStack(alignment: .firstTextBaseline, spacing: 22) {
                AcQualificationNumber(value: "\(journey.stats.played)", label: L("standings.col.played"))
                AcQualificationNumber(value: "\(journey.stats.win)", label: L("team.win"))
                AcQualificationNumber(value: "\(journey.stats.draw)", label: L("team.draw"))
                AcQualificationNumber(value: "\(journey.stats.lose)", label: L("team.loss"))
                Spacer(minLength: 0)
            }

            Divider().overlay(AcTheme.outlineStrong.opacity(0.7))
        }
    }
}

private struct AcQualificationNumber: View {
    let value: String
    let label: String

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(value)
                .font(AsianCupFonts.app(size: 29, weight: .bold))
                .foregroundStyle(AcTheme.onDarkStrong)
                .monospacedDigit()
            Text(label)
                .font(AsianCupFonts.app(size: 10, weight: .semibold))
                .foregroundStyle(AcTheme.onDarkFaint)
        }
    }
}

private struct AcQualificationTimelineList: View {
    let items: [AcQualificationTimelineItem]

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            AcEditorialSectionTitle(title: L("team.qualification.timeline"), count: items.count)

            VStack(spacing: 0) {
                ForEach(Array(items.enumerated()), id: \.element.id) { index, item in
                    AcQualificationTimelineRow(item: item, isLast: index == items.count - 1)
                }
            }
        }
    }
}

private struct AcQualificationTimelineRow: View {
    let item: AcQualificationTimelineItem
    let isLast: Bool

    var body: some View {
        HStack(alignment: .top, spacing: 15) {
            VStack(alignment: .trailing, spacing: 5) {
                Text(dateText)
                    .font(AsianCupFonts.app(size: 11, weight: .bold))
                    .foregroundStyle(AcTheme.onDark)
                    .lineLimit(1)
                if let scoreText {
                    Text(scoreText)
                        .font(AsianCupFonts.app(size: 18, weight: .bold))
                        .foregroundStyle(AcTheme.goldDeep)
                        .monospacedDigit()
                } else if let status = item.status, !status.isEmpty {
                    Text(status)
                        .font(AsianCupFonts.app(size: 10, weight: .bold))
                        .foregroundStyle(AcTheme.onDarkFaint)
                        .lineLimit(1)
                }
            }
            .frame(width: 78, alignment: .trailing)
            .padding(.top, 1)

            VStack(spacing: 0) {
                Circle()
                    .fill(dotFill)
                    .frame(width: 11, height: 11)
                if !isLast {
                    Rectangle()
                        .fill(AcTheme.goldDeep.opacity(0.28))
                        .frame(width: 1.5)
                        .frame(minHeight: 130)
                }
            }
            .frame(width: 14)
            .padding(.top, 6)

            VStack(alignment: .leading, spacing: 8) {
                Text(item.title)
                    .font(AsianCupFonts.app(size: 25, weight: .bold))
                    .foregroundStyle(AcTheme.onDarkStrong)
                    .lineLimit(2)
                    .minimumScaleFactor(0.72)

                if let subtitle = item.subtitle, !subtitle.isEmpty {
                    Text(subtitle)
                        .font(AsianCupFonts.app(size: 12, weight: .semibold))
                        .foregroundStyle(AcTheme.onDarkDim)
                        .lineLimit(2)
                }

                HStack(alignment: .center, spacing: 8) {
                    if let opponent = item.opponent {
                        AcTeamLogo(logo: opponent.logo, size: 24)
                    }
                    if let round = item.round, !round.isEmpty {
                        Text(round)
                            .font(AsianCupFonts.app(size: 10, weight: .bold))
                            .foregroundStyle(AcTheme.onDarkFaint)
                            .lineLimit(1)
                    }
                    Spacer(minLength: 0)
                }
            }
            .padding(.bottom, isLast ? 0 : 28)
        }
    }

    private var dotFill: Color {
        if item.kind == "host" || item.kind == "qualified" { return AcTheme.goldDeep }
        return item.result == nil ? AcTheme.outlineStrong : AcTheme.onDarkDim
    }

    private var dateText: String {
        if let date = item.date, !date.isEmpty {
            return AcFormat.kickoffDay(date)
        }
        return item.status ?? ""
    }

    private var scoreText: String? {
        guard let own = item.goals.for, let against = item.goals.against else { return nil }
        return "\(own)-\(against)"
    }
}

private struct AcEditorialSectionTitle: View {
    let title: String
    var count: Int? = nil

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            Rectangle()
                .fill(AcTheme.goldDeep)
                .frame(width: 3, height: 23)
            Text(title)
                .font(AsianCupFonts.app(size: 19, weight: .bold))
                .foregroundStyle(AcTheme.onDarkStrong)
            if let count {
                Text("\(count)")
                    .font(AsianCupFonts.app(size: 11, weight: .bold))
                    .foregroundStyle(AcTheme.goldDeep)
            }
            Spacer(minLength: 0)
        }
    }
}

private struct AcTeamSummaryCard: View {
    let profile: AcTeamProfile

    private var stats: AcTeamStats {
        profile.stats ?? Self.fallbackStats(profile)
    }

    private static func fallbackStats(_ profile: AcTeamProfile) -> AcTeamStats {
        if let group = profile.group, let row = group.rows.first(where: { $0.team.id == profile.team.id }) {
            return AcTeamStats(
                groupName: group.name,
                rank: row.rank,
                played: row.played,
                win: row.win,
                draw: row.draw,
                lose: row.lose,
                goalsFor: row.goalsFor,
                goalsAgainst: row.goalsAgainst,
                goalsDiff: row.goalsDiff,
                points: row.points,
                form: form(from: profile.fixtures, teamId: profile.team.id)
            )
        }

        var played = 0, win = 0, draw = 0, lose = 0, goalsFor = 0, goalsAgainst = 0, points = 0
        for fixture in profile.fixtures where fixture.status.finished {
            guard let homeGoals = fixture.goals.home, let awayGoals = fixture.goals.away else { continue }
            let own = fixture.home.id == profile.team.id ? homeGoals : awayGoals
            let against = fixture.home.id == profile.team.id ? awayGoals : homeGoals
            played += 1
            goalsFor += own
            goalsAgainst += against
            if own > against {
                win += 1
                points += 3
            } else if own == against {
                draw += 1
                points += 1
            } else {
                lose += 1
            }
        }

        return AcTeamStats(
            groupName: nil,
            rank: nil,
            played: played,
            win: win,
            draw: draw,
            lose: lose,
            goalsFor: goalsFor,
            goalsAgainst: goalsAgainst,
            goalsDiff: goalsFor - goalsAgainst,
            points: points,
            form: form(from: profile.fixtures, teamId: profile.team.id)
        )
    }

    private static func form(from fixtures: [AcFixture], teamId: Int) -> [String] {
        fixtures
            .filter { $0.status.finished && $0.goals.home != nil && $0.goals.away != nil }
            .sorted { $0.timestamp > $1.timestamp }
            .prefix(5)
            .compactMap { fixture in
                let own = fixture.home.id == teamId ? fixture.goals.home! : fixture.goals.away!
                let against = fixture.home.id == teamId ? fixture.goals.away! : fixture.goals.home!
                if own > against { return "W" }
                if own < against { return "L" }
                return "D"
            }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 13) {
            AcSectionHeader(icon: "chart.bar.xaxis", title: L("team.snapshot"), subtitle: stats.groupName, tint: AcTheme.goldDeep)

            HStack(spacing: 8) {
                AcTeamMetricTile(value: "\(stats.points)", label: L("team.points"))
                AcTeamMetricTile(value: stats.rank.map { "#\($0)" } ?? "—", label: L("team.rank.short"))
                AcTeamMetricTile(value: signed(stats.goalsDiff), label: L("team.goalDiff"))
            }

            HStack(spacing: 8) {
                AcTeamRecordPill(value: "\(stats.win)", label: L("team.win"))
                AcTeamRecordPill(value: "\(stats.draw)", label: L("team.draw"))
                AcTeamRecordPill(value: "\(stats.lose)", label: L("team.loss"))
                AcTeamRecordPill(value: "\(stats.goalsFor)", label: L("team.goalsFor"))
            }

            HStack(spacing: 8) {
                Text(L("team.form"))
                    .font(AsianCupFonts.app(size: 12, weight: .bold))
                    .foregroundStyle(AcTheme.onDarkDim)
                if stats.form.isEmpty {
                    Text(L("team.noForm"))
                        .font(AsianCupFonts.app(size: 12))
                        .foregroundStyle(AcTheme.onDarkFaint)
                } else {
                    ForEach(Array(stats.form.enumerated()), id: \.offset) { _, item in
                        Text(formText(item))
                            .font(AsianCupFonts.app(size: 11, weight: .bold))
                            .foregroundStyle(AcTheme.onDarkStrong)
                            .frame(width: 24, height: 24)
                            .background(Circle().fill(AcTheme.chipFill))
                            .overlay(Circle().stroke(AcTheme.outline, lineWidth: 1))
                    }
                }
                Spacer(minLength: 0)
            }
            .padding(.top, 2)
        }
        .padding(15)
        .background(RoundedRectangle(cornerRadius: 22, style: .continuous).fill(AcTheme.cardFillStrong))
        .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).stroke(AcTheme.outline, lineWidth: 1))
    }

    private func signed(_ value: Int) -> String {
        value > 0 ? "+\(value)" : "\(value)"
    }

    private func formText(_ value: String) -> String {
        switch value {
        case "W": return L("team.form.win")
        case "D": return L("team.form.draw")
        case "L": return L("team.form.loss")
        default: return value
        }
    }

}

private struct AcHeaderChip: View {
    let icon: String
    let text: String
    let tint: Color

    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: icon)
                .font(.system(size: 11, weight: .bold))
            Text(text)
                .font(AsianCupFonts.app(size: 12, weight: .bold))
                .lineLimit(1)
                .minimumScaleFactor(0.8)
        }
        .foregroundStyle(tint)
        .padding(.horizontal, 11)
        .padding(.vertical, 7)
        .background(Capsule().fill(AcTheme.cardFill))
        .overlay(Capsule().stroke(AcTheme.outline, lineWidth: 1))
    }
}

private struct AcTeamMetricTile: View {
    let value: String
    let label: String

    var body: some View {
        VStack(spacing: 3) {
            Text(value)
                .font(AsianCupFonts.app(size: 20, weight: .bold))
                .foregroundStyle(AcTheme.onDarkStrong)
                .monospacedDigit()
                .lineLimit(1)
                .minimumScaleFactor(0.75)
            Text(label)
                .font(AsianCupFonts.app(size: 10, weight: .semibold))
                .foregroundStyle(AcTheme.onDarkDim)
                .lineLimit(1)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 11)
        .background(RoundedRectangle(cornerRadius: 15, style: .continuous).fill(AcTheme.chipFill))
        .overlay(RoundedRectangle(cornerRadius: 15, style: .continuous).stroke(AcTheme.outline, lineWidth: 1))
    }
}

private struct AcTeamRecordPill: View {
    let value: String
    let label: String

    var body: some View {
        HStack(spacing: 5) {
            Text(value)
                .font(AsianCupFonts.app(size: 13, weight: .bold))
                .foregroundStyle(AcTheme.goldDeep)
                .monospacedDigit()
            Text(label)
                .font(AsianCupFonts.app(size: 10, weight: .semibold))
                .foregroundStyle(AcTheme.onDarkDim)
                .lineLimit(1)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 8)
        .background(RoundedRectangle(cornerRadius: 13, style: .continuous).fill(AcTheme.cardFill))
        .overlay(RoundedRectangle(cornerRadius: 13, style: .continuous).stroke(AcTheme.outline, lineWidth: 1))
    }
}

private struct AcTeamNextMatchFeature: View {
    let fixture: AcFixture
    let teamId: Int
    @State private var showDetail = false

    private var sideText: String {
        fixture.home.id == teamId ? L("team.home") : L("team.away")
    }

    var body: some View {
        Button {
            showDetail = true
        } label: {
            VStack(spacing: 15) {
                HStack(spacing: 10) {
                    Image(systemName: "calendar.badge.clock")
                        .font(.system(size: 15, weight: .bold))
                        .foregroundStyle(AcTheme.goldDeep)
                        .frame(width: 36, height: 36)
                        .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(AcTheme.chipFill))

                    VStack(alignment: .leading, spacing: 2) {
                        Text(L("team.nextMatch"))
                            .font(AsianCupFonts.app(size: 18, weight: .bold))
                            .foregroundStyle(AcTheme.onDarkStrong)
                        Text("\(LRound(fixture.roundEn, fallback: fixture.round)) · \(sideText)")
                            .font(AsianCupFonts.app(size: 11, weight: .semibold))
                            .foregroundStyle(AcTheme.onDarkDim)
                            .lineLimit(1)
                    }

                    Spacer(minLength: 0)
                }

                HStack(alignment: .center, spacing: 10) {
                    teamColumn(fixture.home, leading: true)

                    VStack(spacing: 5) {
                        Text(AcFormat.kickoffTime(fixture.date))
                            .font(AsianCupFonts.app(size: 26, weight: .bold))
                            .foregroundStyle(AcTheme.goldDeep)
                            .monospacedDigit()
                            .environment(\.layoutDirection, .leftToRight)

                        Text(AcFormat.kickoffDay(fixture.date))
                            .font(AsianCupFonts.app(size: 11, weight: .bold))
                            .foregroundStyle(AcTheme.onDarkDim)
                            .lineLimit(1)
                            .minimumScaleFactor(0.75)

                        Text("VS")
                            .font(AsianCupFonts.app(size: 10, weight: .bold))
                            .foregroundStyle(AcTheme.onDarkFaint)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 3)
                            .background(Capsule().fill(AcTheme.chipFill))
                    }
                    .frame(width: 96)

                    teamColumn(fixture.away, leading: false)
                }

                venueLine
            }
            .padding(16)
            .background(
                RoundedRectangle(cornerRadius: 22, style: .continuous)
                    .fill(AcTheme.cardFillStrong)
            )
            .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).stroke(AcTheme.outline, lineWidth: 1))
            .shadow(color: .black.opacity(0.035), radius: 8, y: 4)
        }
        .buttonStyle(.plain)
        .sheet(isPresented: $showDetail) {
            AcMatchDetailSheet(fixture: fixture)
        }
    }

    private func teamColumn(_ team: AcTeam, leading: Bool) -> some View {
        let isFocus = team.id == teamId
        return VStack(alignment: leading ? .leading : .trailing, spacing: 8) {
            AcTeamLogo(logo: team.logo, size: isFocus ? 58 : 52)
                .overlay(Circle().stroke(isFocus ? AcTheme.outlineStrong : .clear, lineWidth: 2))
            Text(LTeam(String(team.id), fallback: team.name))
                .font(AsianCupFonts.app(size: 14, weight: isFocus ? .bold : .semibold))
                .foregroundStyle(isFocus ? AcTheme.onDarkStrong : AcTheme.onDark)
                .lineLimit(2)
                .minimumScaleFactor(0.72)
                .multilineTextAlignment(leading ? .leading : .trailing)
                .frame(height: 36, alignment: leading ? .leading : .trailing)
        }
        .frame(maxWidth: .infinity, alignment: leading ? .leading : .trailing)
    }

    private var venueLine: some View {
        HStack(spacing: 7) {
            Image(systemName: "mappin.and.ellipse")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(AcTheme.goldDeep)
            Text(venueText)
                .font(AsianCupFonts.app(size: 11, weight: .semibold))
                .foregroundStyle(AcTheme.onDarkDim)
                .lineLimit(1)
            Spacer(minLength: 0)
            Image(systemName: "chevron.left")
                .font(.system(size: 11, weight: .bold))
                .foregroundStyle(AcTheme.onDarkFaint)
        }
        .padding(.horizontal, 11)
        .padding(.vertical, 8)
        .background(RoundedRectangle(cornerRadius: 13, style: .continuous).fill(AcTheme.chipFill))
    }

    private var venueText: String {
        if fixture.venue.name.isEmpty { return L("match.stadium") }
        if fixture.venue.city.isEmpty { return fixture.venue.name }
        return "\(fixture.venue.name) · \(fixture.venue.city)"
    }
}

private struct AcTeamJourneySection: View {
    let fixtures: [AcFixture]
    let teamId: Int

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            AcSectionHeader(icon: "point.topleft.down.curvedto.point.bottomright.up", title: L("team.path"), count: fixtures.count, tint: AcTheme.goldDeep)
            VStack(spacing: 8) {
                ForEach(fixtures) { fixture in
                    AcTeamJourneyRow(fixture: fixture, teamId: teamId)
                }
            }
        }
    }
}

private struct AcTeamJourneyRow: View {
    let fixture: AcFixture
    let teamId: Int
    @State private var showDetail = false

    private var opponent: AcTeam { fixture.home.id == teamId ? fixture.away : fixture.home }
    private var isHome: Bool { fixture.home.id == teamId }
    private var ownGoals: Int? { isHome ? fixture.goals.home : fixture.goals.away }
    private var opponentGoals: Int? { isHome ? fixture.goals.away : fixture.goals.home }

    private var result: String? {
        guard fixture.status.finished, let ownGoals, let opponentGoals else { return nil }
        if ownGoals > opponentGoals { return L("team.form.win") }
        if ownGoals < opponentGoals { return L("team.form.loss") }
        return L("team.form.draw")
    }

    private var resultTint: Color {
        guard fixture.status.finished else {
            return fixture.status.live ? AcTheme.goldDeep : AcTheme.onDarkDim
        }
        return AcTheme.onDarkDim
    }

    var body: some View {
        Button {
            showDetail = true
        } label: {
            HStack(spacing: 11) {
                VStack(spacing: 3) {
                    Text(AcFormat.kickoffTime(fixture.date))
                        .font(AsianCupFonts.app(size: 12, weight: .bold))
                        .foregroundStyle(AcTheme.onDark)
                        .monospacedDigit()
                    Text(AcFormat.kickoffDay(fixture.date))
                        .font(AsianCupFonts.app(size: 9))
                        .foregroundStyle(AcTheme.onDarkFaint)
                        .lineLimit(1)
                }
                .frame(width: 74)

                Circle()
                    .fill(fixture.status.live ? AcTheme.goldDeep : AcTheme.outlineStrong)
                    .frame(width: 10, height: 10)
                    .overlay(Circle().stroke(.white.opacity(0.65), lineWidth: 2))

                AcTeamLogo(logo: opponent.logo, size: 34)
                VStack(alignment: .leading, spacing: 3) {
                    Text(LTeam(String(opponent.id), fallback: opponent.name))
                        .font(AsianCupFonts.app(size: 13, weight: .bold))
                        .foregroundStyle(AcTheme.onDark)
                        .lineLimit(1)
                    Text(LRound(fixture.roundEn, fallback: fixture.round))
                        .font(AsianCupFonts.app(size: 10))
                        .foregroundStyle(AcTheme.onDarkFaint)
                        .lineLimit(1)
                }
                Spacer(minLength: 0)
                Text(result ?? fixture.status.label)
                    .font(AsianCupFonts.app(size: 11, weight: .bold))
                    .foregroundStyle(resultTint)
                    .padding(.horizontal, 9)
                    .padding(.vertical, 5)
                    .background(Capsule().fill(AcTheme.chipFill))
            }
            .padding(12)
            .background(RoundedRectangle(cornerRadius: 17, style: .continuous).fill(AcTheme.cardFill))
            .overlay(RoundedRectangle(cornerRadius: 17, style: .continuous).stroke(AcTheme.outline, lineWidth: 1))
        }
        .buttonStyle(.plain)
        .sheet(isPresented: $showDetail) {
            AcMatchDetailSheet(fixture: fixture)
        }
    }
}

// MARK: - ملف اللاعب
private struct AcPlayerProfileScreen: View {
    let playerId: Int
    let fallbackName: String
    let fallbackPhoto: String
    let fallbackSubtitle: String
    var fallbackPosition: String?
    var fallbackNumber: Int?
    var fallbackAge: Int?
    var fallbackTeam: AcTeam?
    @State private var player: AcPlayerCard?
    @State private var loading = true
    @State private var errorMessage: String?

    var body: some View {
        AcScreenScaffold {
            VStack(spacing: 28) {
                header

                if loading && player == nil {
                    AcLoadingPanel(title: L("player.profile"))
                }

                if let player {
                    AcPlayerFactSheet(player: player)
                    if let stats = player.stats {
                        AcPlayerStatsLine(stats: stats, isGoalkeeper: player.positionEn == "Goalkeeper")
                    }
                    AcPlayerOpenInfoLine(
                        icon: "chart.line.uptrend.xyaxis",
                        title: L("player.market"),
                        value: player.market.available && player.market.value != nil ? "\(player.market.value!) \(player.market.currency)" : L("player.market.unavailable")
                    )
                    if !player.career.isEmpty {
                        AcPlayerOpenSection(icon: "building.columns.fill", title: L("player.career")) {
                            ForEach(Array(player.career.prefix(8))) { item in
                                AcPlayerOpenRow(logo: item.logo, title: item.team, subtitle: seasonRange(item.seasons))
                            }
                        }
                    }
                    if !player.trophies.isEmpty {
                        AcPlayerOpenSection(icon: "trophy.fill", title: L("player.trophies")) {
                            ForEach(Array(player.trophies.prefix(8))) { item in
                                AcPlayerOpenRow(logo: "", title: item.competition, subtitle: "\(item.place) · \(item.season)")
                            }
                        }
                    }
                    if !player.transfers.isEmpty {
                        AcPlayerOpenSection(icon: "arrow.left.arrow.right", title: L("player.transfers")) {
                            ForEach(Array(player.transfers.prefix(6))) { item in
                                AcPlayerOpenRow(logo: item.to?.logo ?? "", title: item.to?.name ?? item.type, subtitle: [item.type, formatDateOnly(item.date)].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · "))
                            }
                        }
                    }
                    if let injury = player.injury {
                        AcPlayerOpenInfoLine(icon: "cross.case.fill", title: L("player.injury"), value: injury.reason)
                    }
                } else {
                    AcPlayerFallbackProfile(
                        position: fallbackPosition,
                        number: fallbackNumber,
                        age: fallbackAge,
                        team: fallbackTeam
                    )
                    if let errorMessage {
                        AcRefreshBanner(message: errorMessage, refresh: { await load(force: true) })
                    }
                }

                AcFooterSignature()
            }
        }
        .navigationBarHidden(true)
        .task { await load() }
        .refreshable { await load(force: true) }
    }

    private var header: some View {
        AcPlayerHero(
            name: player?.name ?? fallbackName,
            subtitle: player?.fullName ?? player?.position ?? (fallbackSubtitle.isEmpty ? L("player.profile") : fallbackSubtitle),
            photo: player?.photo ?? fallbackPhoto,
            team: player?.currentTeam ?? fallbackTeam,
            number: fallbackNumber,
            position: player?.position ?? fallbackPosition,
            age: player?.age ?? fallbackAge
        )
    }

    private func load(force: Bool = false) async {
        loading = true
        do {
            player = try await APIClient.shared.fetchAcPlayerCard(playerId, ignoreCache: force)
            errorMessage = nil
        } catch {
            errorMessage = LError(error)
        }
        loading = false
    }
}

private struct AcPlayerHero: View {
    let name: String
    let subtitle: String
    let photo: String
    let team: AcTeam?
    let number: Int?
    let position: String?
    let age: Int?

    var body: some View {
        VStack(alignment: .leading, spacing: 22) {
            HStack(alignment: .center, spacing: 18) {
                ZStack {
                    Circle().fill(AcTheme.cardFillStrong)
                    Image(systemName: "person.fill")
                        .font(.system(size: 36, weight: .semibold))
                        .foregroundStyle(AcTheme.onDarkFaint)
                    AcRemoteImage(url: photo, contentMode: .fill)
                        .clipShape(Circle())
                }
                .frame(width: 112, height: 112)
                .overlay(Circle().stroke(AcTheme.outlineStrong, lineWidth: 1))

                VStack(alignment: .leading, spacing: 8) {
                    Text(L("player.profile"))
                        .font(AsianCupFonts.app(size: 11, weight: .bold))
                        .foregroundStyle(AcTheme.goldDeep)
                    Text(name)
                        .font(AsianCupFonts.app(size: 38, weight: .bold))
                        .foregroundStyle(AcTheme.onDarkStrong)
                        .lineLimit(2)
                        .minimumScaleFactor(0.62)
                    Text(subtitle)
                        .font(AsianCupFonts.app(size: 13, weight: .semibold))
                        .foregroundStyle(AcTheme.onDarkDim)
                        .lineLimit(1)
                }

                Spacer(minLength: 0)
            }

            HStack(alignment: .center, spacing: 14) {
                if let team {
                    AcTeamLogo(logo: team.logo, size: 26)
                    Text(LTeam(String(team.id), fallback: team.name))
                        .font(AsianCupFonts.app(size: 12, weight: .bold))
                        .foregroundStyle(AcTheme.onDark)
                        .lineLimit(1)
                }
                if let position, !position.isEmpty {
                    AcPlayerMetaText(position)
                }
                if let number {
                    AcPlayerMetaText("#\(number)")
                }
                if let age {
                    AcPlayerMetaText(L("team.age", ["age": "\(age)"]))
                }
                Spacer(minLength: 0)
            }

            Divider().overlay(AcTheme.outlineStrong.opacity(0.75))
        }
    }
}

private struct AcPlayerMetaText: View {
    let text: String

    init(_ text: String) {
        self.text = text
    }

    var body: some View {
        Text(text)
            .font(AsianCupFonts.app(size: 11, weight: .bold))
            .foregroundStyle(AcTheme.onDarkDim)
            .lineLimit(1)
    }
}

private struct AcPlayerFactSheet: View {
    let player: AcPlayerCard

    private var rows: [(String, String?)] {
        [
            (L("player.nationality"), player.nationality),
            (L("player.birth"), formatDateOnly(player.birthDate)),
            (L("player.birthPlace"), player.birthPlace),
            (L("player.height"), player.height.map { "\($0) سم" }),
            (L("player.weight"), player.weight.map { "\($0) كجم" }),
            (L("player.currentTeam"), player.currentTeam.map { LTeam(String($0.id), fallback: $0.name) })
        ]
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            AcEditorialSectionTitle(title: L("player.bio"))
            ForEach(Array(rows.enumerated()), id: \.offset) { index, row in
                AcPlayerFactLine(label: row.0, value: row.1)
                if index < rows.count - 1 {
                    Divider().overlay(AcTheme.outline.opacity(0.7))
                }
            }
        }
    }
}

private struct AcPlayerFactLine: View {
    let label: String
    let value: String?

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 18) {
            Text(label)
                .font(AsianCupFonts.app(size: 11, weight: .bold))
                .foregroundStyle(AcTheme.onDarkFaint)
                .frame(width: 104, alignment: .leading)
                .lineLimit(1)
            Text((value?.isEmpty == false ? value : "—") ?? "—")
                .font(AsianCupFonts.app(size: 16, weight: .bold))
                .foregroundStyle(AcTheme.onDarkStrong)
                .lineLimit(2)
                .minimumScaleFactor(0.78)
            Spacer(minLength: 0)
        }
        .padding(.vertical, 8)
    }
}

private struct AcPlayerStatsLine: View {
    let stats: AcPlayerTournamentStats
    let isGoalkeeper: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            AcEditorialSectionTitle(title: L("player.stats"))

            HStack(alignment: .top, spacing: 20) {
                AcPlayerBigNumber(value: "\(stats.matches)", label: L("player.matches"))
                AcPlayerBigNumber(value: "\(stats.minutes)", label: L("player.minutes"))
                AcPlayerBigNumber(value: stats.rating.map { String(format: "%.2f", $0) } ?? "—", label: L("player.rating"))
            }

            HStack(alignment: .top, spacing: 18) {
                if isGoalkeeper {
                    AcPlayerSmallNumber(value: "\(stats.saves)", label: L("player.saves"))
                    AcPlayerSmallNumber(value: "\(stats.conceded)", label: "استقبل")
                } else {
                    AcPlayerSmallNumber(value: "\(stats.goals)", label: L("player.goals"))
                    AcPlayerSmallNumber(value: "\(stats.assists)", label: L("player.assists"))
                }
                AcPlayerSmallNumber(value: "\(stats.lineups)", label: L("player.lineups"))
                AcPlayerSmallNumber(value: "\(stats.yellow + stats.red)", label: L("player.cards"))
                Spacer(minLength: 0)
            }
        }
        .padding(.vertical, 2)
    }
}

private struct AcPlayerBigNumber: View {
    let value: String
    let label: String

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(value)
                .font(AsianCupFonts.app(size: 30, weight: .bold))
                .foregroundStyle(AcTheme.onDarkStrong)
                .monospacedDigit()
                .lineLimit(1)
                .minimumScaleFactor(0.75)
            Text(label)
                .font(AsianCupFonts.app(size: 10, weight: .semibold))
                .foregroundStyle(AcTheme.onDarkFaint)
                .lineLimit(1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

private struct AcPlayerSmallNumber: View {
    let value: String
    let label: String

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 5) {
            Text(value)
                .font(AsianCupFonts.app(size: 15, weight: .bold))
                .foregroundStyle(AcTheme.goldDeep)
                .monospacedDigit()
            Text(label)
                .font(AsianCupFonts.app(size: 10, weight: .semibold))
                .foregroundStyle(AcTheme.onDarkFaint)
                .lineLimit(1)
        }
    }
}

private struct AcPlayerFallbackProfile: View {
    let position: String?
    let number: Int?
    let age: Int?
    let team: AcTeam?

    private var rows: [(String, String?)] {
        [
            (L("player.currentTeam"), team.map { LTeam(String($0.id), fallback: $0.name) }),
            (L("player.profile"), position),
            ("#", number.map { "\($0)" }),
            (L("player.age"), age.map { L("team.age", ["age": "\($0)"]) })
        ]
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            VStack(alignment: .leading, spacing: 14) {
                AcEditorialSectionTitle(title: L("player.bio"))
                Text(L("player.source"))
                    .font(AsianCupFonts.app(size: 11, weight: .semibold))
                    .foregroundStyle(AcTheme.onDarkFaint)
                ForEach(Array(rows.enumerated()), id: \.offset) { index, row in
                    AcPlayerFactLine(label: row.0, value: row.1)
                    if index < rows.count - 1 {
                        Divider().overlay(AcTheme.outline.opacity(0.7))
                    }
                }
            }

            Text(L("player.market.unavailable"))
                .font(AsianCupFonts.app(size: 12, weight: .semibold))
                .foregroundStyle(AcTheme.onDarkFaint)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

private struct AcPlayerOpenSection<Content: View>: View {
    let icon: String
    let title: String
    var subtitle: String?
    @ViewBuilder let content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            AcEditorialSectionTitle(title: title)
            if let subtitle {
                Text(subtitle)
                    .font(AsianCupFonts.app(size: 11, weight: .semibold))
                    .foregroundStyle(AcTheme.onDarkFaint)
            }
            VStack(alignment: .leading, spacing: 0) {
                content
            }
        }
        .padding(.vertical, 4)
    }
}

private struct AcPlayerOpenRow: View {
    let logo: String
    let title: String
    let subtitle: String

    var body: some View {
        HStack(spacing: 10) {
            if logo.isEmpty {
                Circle()
                    .fill(AcTheme.outline.opacity(0.5))
                    .frame(width: 34, height: 34)
            } else {
                AcTeamLogo(logo: logo, size: 34)
            }

            VStack(alignment: .leading, spacing: 3) {
                Text(title)
                    .font(AsianCupFonts.app(size: 13, weight: .bold))
                    .foregroundStyle(AcTheme.onDarkStrong)
                    .lineLimit(1)
                Text(subtitle.isEmpty ? "—" : subtitle)
                    .font(AsianCupFonts.app(size: 10, weight: .semibold))
                    .foregroundStyle(AcTheme.onDarkFaint)
                    .lineLimit(1)
            }

            Spacer(minLength: 0)
        }
        .padding(.vertical, 9)
        .overlay(alignment: .bottom) {
            Divider().overlay(AcTheme.outline.opacity(0.7))
        }
    }
}

private struct AcPlayerOpenInfoLine: View {
    let icon: String
    let title: String
    let value: String

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            AcEditorialSectionTitle(title: title)
            HStack(alignment: .top, spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 15, weight: .bold))
                .foregroundStyle(AcTheme.goldDeep)
                .frame(width: 28, height: 28)
                Text(value)
                    .font(AsianCupFonts.app(size: 14, weight: .bold))
                    .foregroundStyle(AcTheme.onDarkDim)
                    .lineLimit(2)
            Spacer(minLength: 0)
            }
            Divider().overlay(AcTheme.outline.opacity(0.7))
        }
        .padding(.vertical, 6)
    }
}

private struct AcPlayerBioCard: View {
    let player: AcPlayerCard

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            AcSectionHeader(icon: "person.text.rectangle.fill", title: L("player.bio"), tint: AcTheme.goldDeep)
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 2), spacing: 8) {
                AcPlayerBioTile(label: L("player.nationality"), value: player.nationality)
                AcPlayerBioTile(label: L("player.birth"), value: formatDateOnly(player.birthDate))
                AcPlayerBioTile(label: L("player.birthPlace"), value: player.birthPlace)
                AcPlayerBioTile(label: L("player.height"), value: player.height.map { "\($0) سم" })
                AcPlayerBioTile(label: L("player.weight"), value: player.weight.map { "\($0) كجم" })
                AcPlayerBioTile(label: L("player.currentTeam"), value: player.currentTeam?.name)
            }
        }
        .padding(15)
        .background(RoundedRectangle(cornerRadius: 22, style: .continuous).fill(AcTheme.cardFillStrong))
        .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).stroke(AcTheme.outline, lineWidth: 1))
    }
}

private struct AcPlayerBioTile: View {
    let label: String
    let value: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(label)
                .font(AsianCupFonts.app(size: 10, weight: .semibold))
                .foregroundStyle(AcTheme.onDarkFaint)
                .lineLimit(1)
            Text((value?.isEmpty == false ? value : "—") ?? "—")
                .font(AsianCupFonts.app(size: 12, weight: .bold))
                .foregroundStyle(AcTheme.onDarkStrong)
                .lineLimit(2)
                .minimumScaleFactor(0.72)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(10)
        .background(RoundedRectangle(cornerRadius: 13, style: .continuous).fill(AcTheme.cardFill))
        .overlay(RoundedRectangle(cornerRadius: 13, style: .continuous).stroke(AcTheme.outline, lineWidth: 1))
    }
}

private struct AcPlayerFallbackCard: View {
    let position: String?
    let number: Int?
    let age: Int?
    let team: AcTeam?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            AcSectionHeader(icon: "person.text.rectangle.fill", title: L("player.bio"), subtitle: L("player.source"), tint: AcTheme.goldDeep)
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 2), spacing: 8) {
                AcPlayerBioTile(label: L("player.currentTeam"), value: team?.name)
                AcPlayerBioTile(label: L("player.profile"), value: position)
                AcPlayerBioTile(label: "#", value: number.map { "\($0)" })
                AcPlayerBioTile(label: L("player.age"), value: age.map { L("team.age", ["age": "\($0)"]) })
            }
            Text(L("player.market.unavailable"))
                .font(AsianCupFonts.app(size: 11, weight: .semibold))
                .foregroundStyle(AcTheme.onDarkFaint)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.top, 2)
        }
        .padding(15)
        .background(RoundedRectangle(cornerRadius: 22, style: .continuous).fill(AcTheme.cardFillStrong))
        .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).stroke(AcTheme.outline, lineWidth: 1))
    }
}

private struct AcPlayerStatsCard: View {
    let stats: AcPlayerTournamentStats
    let isGoalkeeper: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 13) {
            AcSectionHeader(icon: "chart.bar.doc.horizontal.fill", title: L("player.stats"), tint: AcTheme.goldDeep)
            HStack(spacing: 8) {
                AcTeamMetricTile(value: "\(stats.matches)", label: L("player.matches"))
                AcTeamMetricTile(value: "\(stats.minutes)", label: L("player.minutes"))
                AcTeamMetricTile(value: stats.rating.map { String(format: "%.2f", $0) } ?? "—", label: L("player.rating"))
            }
            HStack(spacing: 8) {
                if isGoalkeeper {
                    AcTeamRecordPill(value: "\(stats.saves)", label: L("player.saves"))
                    AcTeamRecordPill(value: "\(stats.conceded)", label: "استقبل")
                } else {
                    AcTeamRecordPill(value: "\(stats.goals)", label: L("player.goals"))
                    AcTeamRecordPill(value: "\(stats.assists)", label: L("player.assists"))
                }
                AcTeamRecordPill(value: "\(stats.lineups)", label: L("player.lineups"))
                AcTeamRecordPill(value: "\(stats.yellow + stats.red)", label: L("player.cards"))
            }
        }
        .padding(15)
        .background(RoundedRectangle(cornerRadius: 22, style: .continuous).fill(AcTheme.cardFillStrong))
        .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).stroke(AcTheme.outline, lineWidth: 1))
    }
}

private struct AcPlayerMarketCard: View {
    let market: AcPlayerMarket

    var body: some View {
        AcPlayerInfoBand(
            icon: "chart.line.uptrend.xyaxis",
            title: L("player.market"),
            value: market.available && market.value != nil ? "\(market.value!) \(market.currency)" : L("player.market.unavailable")
        )
    }
}

private struct AcPlayerCareerCard: View {
    let career: [AcPlayerCareerStop]

    var body: some View {
        AcPlayerListCard(icon: "building.columns.fill", title: L("player.career")) {
            ForEach(career.prefix(8)) { item in
                AcPlayerSimpleRow(logo: item.logo, title: item.team, subtitle: seasonRange(item.seasons))
            }
        }
    }
}

private struct AcPlayerTrophiesCard: View {
    let trophies: [AcPlayerTrophy]

    var body: some View {
        AcPlayerListCard(icon: "trophy.fill", title: L("player.trophies")) {
            ForEach(trophies.prefix(8)) { item in
                AcPlayerSimpleRow(logo: "", title: item.competition, subtitle: "\(item.place) · \(item.season)")
            }
        }
    }
}

private struct AcPlayerTransfersCard: View {
    let transfers: [AcPlayerTransfer]

    var body: some View {
        AcPlayerListCard(icon: "arrow.left.arrow.right", title: L("player.transfers")) {
            ForEach(transfers.prefix(6)) { item in
                AcPlayerSimpleRow(logo: item.to?.logo ?? "", title: item.to?.name ?? item.type, subtitle: [item.type, formatDateOnly(item.date)].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · "))
            }
        }
    }
}

private struct AcPlayerListCard<Content: View>: View {
    let icon: String
    let title: String
    @ViewBuilder let content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            AcSectionHeader(icon: icon, title: title, tint: AcTheme.goldDeep)
            VStack(spacing: 7) { content }
        }
        .padding(15)
        .background(RoundedRectangle(cornerRadius: 22, style: .continuous).fill(AcTheme.cardFillStrong))
        .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).stroke(AcTheme.outline, lineWidth: 1))
    }
}

private struct AcPlayerSimpleRow: View {
    let logo: String
    let title: String
    let subtitle: String

    var body: some View {
        HStack(spacing: 10) {
            if logo.isEmpty {
                Circle().fill(AcTheme.chipFill).frame(width: 34, height: 34)
            } else {
                AcTeamLogo(logo: logo, size: 34)
            }
            VStack(alignment: .leading, spacing: 3) {
                Text(title)
                    .font(AsianCupFonts.app(size: 12, weight: .bold))
                    .foregroundStyle(AcTheme.onDarkStrong)
                    .lineLimit(1)
                Text(subtitle.isEmpty ? "—" : subtitle)
                    .font(AsianCupFonts.app(size: 10, weight: .semibold))
                    .foregroundStyle(AcTheme.onDarkFaint)
                    .lineLimit(1)
            }
            Spacer(minLength: 0)
        }
        .padding(10)
        .background(RoundedRectangle(cornerRadius: 13, style: .continuous).fill(AcTheme.cardFill))
        .overlay(RoundedRectangle(cornerRadius: 13, style: .continuous).stroke(AcTheme.outline, lineWidth: 1))
    }
}

private struct AcPlayerInfoBand: View {
    let icon: String
    let title: String
    let value: String

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 16, weight: .bold))
                .foregroundStyle(AcTheme.goldDeep)
                .frame(width: 40, height: 40)
                .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(AcTheme.chipFill))
            VStack(alignment: .leading, spacing: 3) {
                Text(title)
                    .font(AsianCupFonts.app(size: 13, weight: .bold))
                    .foregroundStyle(AcTheme.onDarkStrong)
                Text(value)
                    .font(AsianCupFonts.app(size: 11, weight: .semibold))
                    .foregroundStyle(AcTheme.onDarkDim)
                    .lineLimit(2)
            }
            Spacer(minLength: 0)
        }
        .padding(14)
        .background(RoundedRectangle(cornerRadius: 18, style: .continuous).fill(AcTheme.cardFillStrong))
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(AcTheme.outline, lineWidth: 1))
    }
}

private func formatDateOnly(_ value: String?) -> String? {
    guard let value, !value.isEmpty else { return nil }
    let input = DateFormatter()
    input.calendar = Calendar(identifier: .gregorian)
    input.locale = Locale(identifier: "en_US_POSIX")
    input.dateFormat = "yyyy-MM-dd"
    guard let date = input.date(from: value) else { return value }
    let output = DateFormatter()
    output.calendar = Calendar(identifier: .gregorian)
    output.locale = Locale(identifier: "\(AcLocalization.shared.language.localeIdentifier)@calendar=gregorian;numbers=latn")
    output.dateFormat = "d MMMM yyyy"
    return output.string(from: date)
}

private func seasonRange(_ seasons: [Int]) -> String {
    guard let first = seasons.first, let last = seasons.last else { return "" }
    return first == last ? "\(first)" : "\(first)-\(last)"
}

// قائمة اللاعبين مُجمّعة حسب المركز.
private struct AcSquadSection: View {
    let squad: [AcSquadPlayer]
    let team: AcTeam

    private let order = ["Goalkeeper", "Defender", "Midfielder", "Attacker"]

    private func groupKey(_ p: AcSquadPlayer) -> String {
        order.contains(p.positionEn) ? p.positionEn : "Other"
    }

    private var groups: [(key: String, players: [AcSquadPlayer])] {
        let grouped = Dictionary(grouping: squad, by: groupKey)
        let keys = order + ["Other"]
        return keys.compactMap { key in
            guard let players = grouped[key], !players.isEmpty else { return nil }
            return (key, players.sorted { ($0.number ?? 99) < ($1.number ?? 99) })
        }
    }

    private func positionTitle(_ key: String) -> String {
        switch key {
        case "Goalkeeper": return L("position.goalkeeper")
        case "Defender": return L("position.defender")
        case "Midfielder": return L("position.midfielder")
        case "Attacker": return L("position.attacker")
        default: return L("position.other")
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            AcSectionHeader(icon: "person.3.fill", title: L("team.squad"), count: squad.count, tint: AcTheme.goldDeep)
            ForEach(groups, id: \.key) { group in
                VStack(alignment: .leading, spacing: 8) {
                    Text(positionTitle(group.key))
                        .font(AsianCupFonts.app(size: 12, weight: .bold))
                        .foregroundStyle(AcTheme.onDarkDim)
                    VStack(spacing: 6) {
                        ForEach(group.players, id: \.self) { p in
                            if p.id > 0 {
                            NavigationLink {
                                    AcPlayerProfileScreen(
                                        playerId: p.id,
                                        fallbackName: LName(p.name, p.nameEn),
                                        fallbackPhoto: p.photo,
                                        fallbackSubtitle: LName(p.position, p.positionEn),
                                        fallbackPosition: LName(p.position, p.positionEn),
                                        fallbackNumber: p.number,
                                        fallbackAge: p.age,
                                        fallbackTeam: team
                                    )
                                } label: {
                                    AcSquadPlayerRow(player: p)
                                }
                                .buttonStyle(.plain)
                            } else {
                                AcSquadPlayerRow(player: p)
                            }
                        }
                    }
                }
            }
        }
    }
}

private struct AcSquadPlayerRow: View {
    let player: AcSquadPlayer

    var body: some View {
        HStack(spacing: 11) {
            AcSquadPlayerPhoto(player: player)

            VStack(alignment: .leading, spacing: 3) {
                Text(LName(player.name, player.nameEn))
                    .font(AsianCupFonts.app(size: 13, weight: .semibold))
                    .foregroundStyle(AcTheme.onDark)
                    .lineLimit(1).minimumScaleFactor(0.75)

                Text(LName(player.position, player.positionEn))
                    .font(AsianCupFonts.app(size: 10, weight: .semibold))
                    .foregroundStyle(AcTheme.onDarkFaint)
                    .lineLimit(1)
            }

            Spacer(minLength: 0)

            if let age = player.age {
                Text(L("team.age", ["age": "\(age)"]))
                    .font(AsianCupFonts.app(size: 10))
                    .foregroundStyle(AcTheme.onDarkFaint)
            }
        }
        .padding(.horizontal, 12).padding(.vertical, 9)
        .background(RoundedRectangle(cornerRadius: 13, style: .continuous).fill(AcTheme.cardFill))
        .overlay(RoundedRectangle(cornerRadius: 13, style: .continuous).stroke(AcTheme.outline, lineWidth: 1))
    }
}

private struct AcSquadPlayerPhoto: View {
    let player: AcSquadPlayer

    var body: some View {
        ZStack(alignment: .bottomTrailing) {
            ZStack {
                Circle().fill(AcTheme.chipFill)
                Image(systemName: "person.fill")
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(AcTheme.onDarkFaint)
                AcRemoteImage(url: player.photo, contentMode: .fill)
                    .clipShape(Circle())
            }
            .frame(width: 42, height: 42)
            .overlay(Circle().stroke(AcTheme.outline, lineWidth: 1))

            Text(player.number.map { "\($0)" } ?? "-")
                .font(AsianCupFonts.app(size: 9, weight: .bold))
                .foregroundStyle(AcTheme.onDarkStrong)
                .monospacedDigit()
                .frame(width: 18, height: 18)
                .background(Circle().fill(AcTheme.cardFillStrong))
                .overlay(Circle().stroke(AcTheme.outline, lineWidth: 1))
                .offset(x: 3, y: 3)
        }
        .frame(width: 46, height: 46)
    }
}
