import SwiftUI
import UserNotifications

// الشاشة الرئيسية لتطبيق كأس آسيا — نظرة عامة محايدة لكل المنتخبات.
// التحديث: .task أول ظهور + .refreshable للسحب.
struct AsianCupView: View {
    @State private var overview: AcOverview?
    @State private var fixtures: [AcFixture] = []
    @State private var teams: [AcTeam] = []
    @State private var groups: [AcGroup] = []
    @State private var loading = true
    @State private var loadError: String?
    @State private var selectedTab: AcTab = .home
    @State private var deepLink: AcDeepLink?

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
                AcGroupsScreen(groups: groups, teams: teams, loading: loading, refresh: { await loadAll(force: true) })
            }
            .tabItem { Label(L("tab.groups"), systemImage: "rectangle.3.group") }
            .tag(AcTab.groups)

            NavigationStack {
                AcMoreScreen(overview: overview, teams: teams, fixtures: fixtures, loading: loading, loadError: loadError, refresh: { await loadAll(force: true) })
            }
            .tabItem { Label(L("tab.more"), systemImage: "person.crop.circle.fill") }
            .tag(AcTab.more)
        }
        .tint(AcTheme.emerald)
        .toolbarBackground(AcTheme.inkBottom, for: .tabBar)
        .toolbarBackground(.visible, for: .tabBar)
        .onChange(of: selectedTab) { _, _ in
            UIImpactFeedbackGenerator(style: .light).impactOccurred(intensity: 0.7)
        }
        .task { await loadAll() }
        // شاشة حيّة: ما دامت هناك مباراة مباشرة، حدّث النتائج تلقائيًا كل دقيقة.
        .task(id: hasLiveFixtures) {
            guard hasLiveFixtures else { return }
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 60_000_000_000)
                guard !Task.isCancelled else { return }
                await loadAll(force: true)
            }
        }
        .sheet(isPresented: languageOnboardingBinding) {
            AcLanguageOnboarding { languageChosen = true }
                .asianCupRTL()
        }
        .onOpenURL(perform: openDeepLink)
        .onReceive(NotificationCenter.default.publisher(for: .acDeepLink)) { note in
            if let url = note.object as? URL { openDeepLink(url) }
        }
        .sheet(item: $deepLink) { link in
            NavigationStack { deepLinkDestination(link) }
                .asianCupRTL()
        }
    }

    @ViewBuilder
    private func deepLinkDestination(_ link: AcDeepLink) -> some View {
        switch link {
        case .match(let id):
            if let fixture = fixtures.first(where: { $0.id == id }) {
                AcMatchDetailSheet(fixture: fixture)
            } else {
                AcEmptyState(icon: "calendar.badge.exclamationmark", title: L("error.notFound"), subtitle: L("error.generic"))
                    .padding()
            }
        case .team(let id):
            let fallback = teams.first(where: { $0.id == id })
                ?? AcTeam(id: id, name: "", nameEn: nil, logo: "")
            AcTeamProfileScreen(teamId: id, fallback: fallback)
        case .player(let id):
            AcPlayerProfileScreen(
                playerId: id,
                fallbackName: "",
                fallbackPhoto: "",
                fallbackSubtitle: L("player.profile")
            )
        case .predictions:
            AcPredictionsScreen(refreshMainData: { await loadAll(force: true) })
        }
    }

    private func openDeepLink(_ url: URL) {
        let parts = url.pathComponents.filter { $0 != "/" }
        guard let cupIndex = parts.firstIndex(of: "asian-cup") else { return }
        let tail = Array(parts.dropFirst(cupIndex + 1))
        if tail.first == "predictions" {
            selectedTab = .predictions
            deepLink = .predictions
        } else if tail.count >= 2, let id = Int(tail[1]) {
            switch tail[0] {
            case "match": deepLink = .match(id)
            case "team": deepLink = .team(id)
            case "player": deepLink = .player(id)
            default: break
            }
        } else {
            selectedTab = .home
        }
    }

    private var hasLiveFixtures: Bool {
        fixtures.contains { $0.status.live }
    }

    // بوابة اللغة عند أول تشغيل — تخدم الجمهور غير العربي من أول ثانية.
    @AppStorage("ac.languageChosen") private var languageChosen = false

    private var languageOnboardingBinding: Binding<Bool> {
        Binding(
            get: { !languageChosen },
            set: { presented in if !presented { languageChosen = true } }
        )
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

private enum AcDeepLink: Identifiable {
    case match(Int)
    case team(Int)
    case player(Int)
    case predictions

    var id: String {
        switch self {
        case .match(let id): return "match-\(id)"
        case .team(let id): return "team-\(id)"
        case .player(let id): return "player-\(id)"
        case .predictions: return "predictions"
        }
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

    @AppStorage("ac.favoriteTeam") private var favoriteTeamId = 0

    private var nextFixtures: [AcFixture] {
        fixtures
            .filter { !$0.status.finished }
            .sorted { $0.timestamp < $1.timestamp }
    }

    private var liveFixtures: [AcFixture] {
        fixtures
            .filter { $0.status.live }
            .sorted { $0.timestamp < $1.timestamp }
    }

    // مباراة «تحت الضوء»: منتخب المستخدم المفضل أولًا، ثم المضيف (الأخضر)، ثم أقرب مباراة.
    private var spotlightFixture: AcFixture? {
        func involves(_ teamId: Int, _ f: AcFixture) -> Bool {
            f.home.id == teamId || f.away.id == teamId
        }
        if favoriteTeamId != 0, let fav = nextFixtures.first(where: { involves(favoriteTeamId, $0) }) {
            return fav
        }
        if let saudi = nextFixtures.first(where: { involves(AcTheme.saudiId, $0) }) {
            return saudi
        }
        return nextFixtures.first
    }

    // المباراتان التاليتان بعد مباراة الضوء — تُعرضان مصغّرتين تحت البطاقة.
    private var spotlightCompanions: [AcFixture] {
        guard let featured = spotlightFixture else { return [] }
        return Array(nextFixtures.filter { $0.id != featured.id }.prefix(2))
    }

    var body: some View {
        AcScreenScaffold {
            VStack(spacing: 22) {
                AcHomeHero(overview: overview, loading: loading)

                if let loadError {
                    AcRefreshBanner(message: loadError, refresh: refresh)
                }

                // القلب الحيّ للرئيسية: مباشر الآن يتصدّر؛ وإلا فالعدّ التنازلي وفوقه مباراة الضوء.
                // المباريات المتزامنة الأخرى صفوف مصغّرة فاتحة تحت البطاقة الكبيرة.
                if !liveFixtures.isEmpty {
                    AcLiveNowSection(fixtures: liveFixtures, onOpenMatches: { onSelectTab(.matches) })
                } else {
                    if overview?.started != true {
                        AcCountdownCard(iso: overview?.startsAt ?? AsianCupConstants.tournamentStartsAt)
                    }
                    if let spotlightFixture {
                        AcSpotlightSection(
                            featured: spotlightFixture,
                            companions: spotlightCompanions,
                            onOpenMatches: { onSelectTab(.matches) }
                        )
                    }
                }

                AcDashboardGrid(
                    overview: overview,
                    fixturesCount: fixtures.count,
                    teams: teams,
                    groups: groups,
                    onSelectTab: onSelectTab
                )

                AcPredictionsBanner { onSelectTab(.predictions) }

                AcLegacyPreview()

                AcHomeVenuesPreview(overview: overview)

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
                AcStatsHub()
                AcScheduleSection(fixtures: fixtures)
                    .padding(.horizontal, -16)
                AcBracketSection(fixtures: fixtures)
                    .padding(.horizontal, -16)
                if loading { AcLoadingPanel(title: L("loading.matches")) }
            }
        }
        .refreshable { await refresh() }
        .navigationBarHidden(true)
    }
}

private struct AcGroupsScreen: View {
    let groups: [AcGroup]
    let teams: [AcTeam]
    let loading: Bool
    let refresh: () async -> Void

    var body: some View {
        AcScreenScaffold {
            VStack(spacing: 18) {
                AcTopBar(title: L("tab.groups"), subtitle: L("groups.subtitle"), state: "\(groups.count)")
                AcGroupsSection(groups: groups)
                AcTeamsSection(teams: teams)
                    .padding(.horizontal, -16)
                if loading { AcLoadingPanel(title: L("loading.standings")) }
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
                    .foregroundStyle(.white)
                    .frame(width: 54, height: 54)
                    .background(RoundedRectangle(cornerRadius: AcTheme.cardRadius, style: .continuous).fill(AcTheme.emerald))
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
                AcStatTile(value: "\(me?.points ?? 0)", label: L("predictions.stat.points"), size: .small)
                AcStatTile(value: "\(me?.correct ?? 0)", label: L("predictions.stat.correct"), size: .small)
                AcStatTile(value: "\(me?.exact ?? 0)", label: L("predictions.stat.exact"), size: .small)
                AcStatTile(value: "\(me?.currentStreak ?? 0)", label: L("predictions.stat.streak"), size: .small)
            }
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: AcTheme.cardRadius, style: .continuous)
                .fill(LinearGradient(colors: [AcTheme.heroTop, AcTheme.heroBottom], startPoint: .topTrailing, endPoint: .bottomLeading))
        )
        .overlay(AcLatticePattern(spacing: 34).opacity(0.05).clipShape(RoundedRectangle(cornerRadius: AcTheme.cardRadius, style: .continuous)))
        .overlay(RoundedRectangle(cornerRadius: AcTheme.cardRadius, style: .continuous).stroke(AcTheme.outline, lineWidth: 1))
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
    @Environment(AcAuthStore.self) private var auth
    @State private var predHome: Int
    @State private var predAway: Int
    @State private var savedPrediction: AcMyPrediction?
    @State private var submitting = false
    @State private var submitError: String?
    @State private var showLogin = false

    init(match: AcPredictableMatch, me: AcPredictionMeStats?) {
        self.match = match
        self.me = me
        _predHome = State(initialValue: match.myPrediction?.predHome ?? 1)
        _predAway = State(initialValue: match.myPrediction?.predAway ?? 1)
        _savedPrediction = State(initialValue: match.myPrediction)
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
                    .foregroundStyle(match.locked ? AcTheme.crimson : AcTheme.amberDeep)
                    .padding(.horizontal, 9)
                    .padding(.vertical, 4)
                    .background(Capsule().fill((match.locked ? AcTheme.crimson : AcTheme.amber).opacity(0.13)))
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
                AcProbabilityRow(title: LTeam(String(match.fixture.home.id), fallback: match.fixture.home.name), value: match.probs.home, tint: AcTheme.emerald)
                AcProbabilityRow(title: L("predictions.draw"), value: match.probs.draw, tint: AcTheme.amber)
                AcProbabilityRow(title: LTeam(String(match.fixture.away.id), fallback: match.fixture.away.name), value: match.probs.away, tint: AcTheme.emeraldSoft)
            }

            HStack(spacing: 10) {
                AcIconStat(icon: "person.2.fill", value: "\(match.crowd.total)", label: L("predictions.meta.participant"))
                AcIconStat(icon: "target", value: "\(potentialPoints)", label: L("predictions.meta.max"))
                AcIconStat(icon: "chart.bar.fill", value: "\(match.predictionsCount)", label: L("predictions.meta.prediction"))
            }

            if let submitError {
                Text(submitError)
                    .font(AsianCupFonts.app(size: 11, weight: .semibold))
                    .foregroundStyle(AcTheme.crimson)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }

            // مسجّل الدخول يحفظ توقعه؛ وغير المسجّل يفتح ورقة الدخول (جوال / بريد).
            Button {
                if auth.isLoggedIn {
                    Task { await submit() }
                } else {
                    showLogin = true
                }
            } label: {
                Text(buttonTitle)
                    .font(AsianCupFonts.app(size: 13, weight: .bold))
                    .foregroundStyle(match.locked ? AcTheme.onDarkFaint : .white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .background(
                        RoundedRectangle(cornerRadius: AcTheme.buttonRadius, style: .continuous)
                            .fill(match.locked ? AcTheme.chipFill : AcTheme.emerald)
                    )
            }
            .disabled(match.locked || submitting)
            .buttonStyle(AcPressableStyle())
        }
        .padding(16)
        .background(RoundedRectangle(cornerRadius: AcTheme.cardRadius, style: .continuous).fill(AcTheme.cardFillStrong))
        .overlay(RoundedRectangle(cornerRadius: AcTheme.cardRadius, style: .continuous).stroke(match.locked ? AcTheme.outline : AcTheme.emerald.opacity(0.25), lineWidth: 1))
        .sheet(isPresented: $showLogin) { AcLoginSheet() }
    }

    private var buttonTitle: String {
        if match.locked { return L("predictions.locked.note") }
        if submitting { return L("predictions.saving") }
        if savedPrediction?.predHome == predHome && savedPrediction?.predAway == predAway {
            return L("predictions.saved")
        }
        return auth.isLoggedIn ? L("predictions.save") : L("predictions.login.note")
    }

    @MainActor
    private func submit() async {
        submitting = true
        submitError = nil
        defer { submitting = false }
        do {
            savedPrediction = try await APIClient.shared.submitAcPrediction(
                fixtureId: match.fixture.id,
                predHome: predHome,
                predAway: predAway
            )
        } catch {
            submitError = LError(error)
        }
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
            // أزرار توقّع مخصصة بدل Stepper النظامي الرمادي — نجمة التطبيق تستحق تحكّمًا يليق بها.
            HStack(spacing: 12) {
                scoreButton(icon: "minus") { if score > 0 { score -= 1 } }
                Text("\(score)")
                    .font(AsianCupFonts.app(size: 22, weight: .bold))
                    .foregroundStyle(AcTheme.emeraldInk)
                    .monospacedDigit()
                    .frame(minWidth: 26)
                    .contentTransition(.numericText())
                scoreButton(icon: "plus") { if score < 9 { score += 1 } }
            }
            .disabled(disabled)
            .opacity(disabled ? 0.4 : 1)
        }
        .frame(maxWidth: .infinity)
    }

    private func scoreButton(icon: String, action: @escaping () -> Void) -> some View {
        Button {
            withAnimation(.easeOut(duration: 0.15)) { action() }
            UISelectionFeedbackGenerator().selectionChanged()
        } label: {
            Image(systemName: icon)
                .font(.system(size: 13, weight: .bold))
                .foregroundStyle(AcTheme.emeraldInk)
                .frame(width: 30, height: 30)
                .background(Circle().fill(AcTheme.emerald.opacity(0.12)))
                .overlay(Circle().stroke(AcTheme.emerald.opacity(0.30), lineWidth: 1))
        }
        .buttonStyle(AcPressableStyle())
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
                .foregroundStyle(leader.rank <= 3 ? AcTheme.amberDeep : AcTheme.onDarkDim)
                .frame(width: 34, height: 34)
                .background(Circle().fill(leader.rank <= 3 ? AcTheme.amber.opacity(0.12) : AcTheme.chipFill))
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
                .foregroundStyle(AcTheme.amberDeep)
                .monospacedDigit()
        }
        .padding(12)
        .background(RoundedRectangle(cornerRadius: AcTheme.cardRadius, style: .continuous).fill(AcTheme.cardFill))
        .overlay(RoundedRectangle(cornerRadius: AcTheme.cardRadius, style: .continuous).stroke(AcTheme.outline, lineWidth: 1))
    }
}

private struct AcPredictionUnavailable: View {
    let message: String

    var body: some View {
        VStack(spacing: 10) {
            Image(systemName: "sparkles.rectangle.stack")
                .font(.system(size: 30, weight: .bold))
                .foregroundStyle(AcTheme.emerald)
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
        .background(RoundedRectangle(cornerRadius: AcTheme.cardRadius, style: .continuous).fill(AcTheme.cardFill))
        .overlay(RoundedRectangle(cornerRadius: AcTheme.cardRadius, style: .continuous).stroke(AcTheme.outline, lineWidth: 1))
    }
}

private struct AcTeamsScreen: View {
    let teams: [AcTeam]
    let loading: Bool
    let refresh: () async -> Void
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        AcScreenScaffold(onBack: { dismiss() }) {
            VStack(spacing: 18) {
                AcTopBar(title: L("teams.title"), subtitle: L("teams.subtitle"), state: "\(teams.count)")
                AcTeamsSection(teams: teams)
                    .padding(.horizontal, -16)
                if loading { AcLoadingPanel(title: L("loading.teams")) }
            }
        }
        .refreshable { await refresh() }
        .navigationBarHidden(true)
    }
}

private struct AcMoreScreen: View {
    let overview: AcOverview?
    let teams: [AcTeam]
    let fixtures: [AcFixture]
    let loading: Bool
    let loadError: String?
    let refresh: () async -> Void

    @State private var showLanguage = false

    var body: some View {
        AcScreenScaffold {
            VStack(spacing: 18) {
                AcTopBar(title: L("tab.more"), subtitle: L("more.subtitle"), state: acAppVersion())

                AcAccountCard()

                AcControlHub(teams: teams, fixtures: fixtures, onOpenLanguage: { showLanguage = true })

                if let loadError {
                    AcRefreshBanner(message: loadError, refresh: refresh)
                }

                AcAboutSection()

            }
        }
        .refreshable { await refresh() }
        .navigationBarHidden(true)
        .navigationDestination(for: AcTeam.self) { team in
            AcTeamProfileScreen(teamId: team.id, fallback: team)
        }
        .navigationDestination(isPresented: $showLanguage) {
            AcLanguagePicker().asianCupRTL()
        }
    }
}

// MARK: - حسابي — دخول بجوال OTP أو بريد/كلمة مرور + تفعيل الإشعارات
private struct AcAccountCard: View {
    @Environment(AcAuthStore.self) private var auth
    @State private var push = AcPushManager.shared

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            AcSectionHeader(
                icon: "person.crop.circle.fill",
                title: auth.isLoggedIn ? L("auth.account") : L("auth.cta.signin"),
                subtitle: auth.isLoggedIn ? L("auth.signedIn") : L("auth.subtitle")
            )
            AcGroupedCard {
                if auth.isLoggedIn {
                    VStack(spacing: 12) {
                        HStack(spacing: 12) {
                            Image(systemName: "checkmark.seal.fill")
                                .font(.system(size: 25, weight: .bold))
                                .foregroundStyle(AcTheme.emerald)
                            VStack(alignment: .leading, spacing: 3) {
                                Text(auth.member?.name ?? L("auth.signedIn"))
                                    .font(AsianCupFonts.app(size: 15, weight: .bold))
                                    .foregroundStyle(AcTheme.onDark)
                                if let email = auth.member?.email,
                                   !email.isEmpty,
                                   !email.contains("@phone.sabq.org") {
                                    Text(email)
                                        .font(AsianCupFonts.app(size: 11))
                                        .foregroundStyle(AcTheme.onDarkDim)
                                } else if let phone = auth.member?.phone, !phone.isEmpty {
                                    Text(phone)
                                        .font(AsianCupFonts.app(size: 11))
                                        .foregroundStyle(AcTheme.onDarkDim)
                                        .environment(\.layoutDirection, .leftToRight)
                                }
                            }
                            Spacer()
                            Button(L("auth.signOut")) { auth.signOut() }
                                .font(AsianCupFonts.app(size: 12, weight: .bold))
                                .foregroundStyle(AcTheme.crimson)
                        }
                        Button {
                            Task {
                                if await push.requestAuthorization() {
                                    await push.syncWithSession()
                                }
                            }
                        } label: {
                            Label(
                                push.isAuthorized ? L("notifications.enabled") : L("notifications.enable"),
                                systemImage: push.isAuthorized ? "bell.badge.fill" : "bell.badge"
                            )
                            .font(AsianCupFonts.app(size: 13, weight: .bold))
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 11)
                            .foregroundStyle(push.isAuthorized ? AcTheme.emeraldInk : .white)
                            .background(
                                RoundedRectangle(cornerRadius: AcTheme.buttonRadius, style: .continuous)
                                    .fill(push.isAuthorized ? AcTheme.emerald.opacity(0.12) : AcTheme.emerald)
                            )
                        }
                        .disabled(push.isAuthorized)
                        .buttonStyle(AcPressableStyle())

                        NavigationLink {
                            AcMatchEventNotificationsView()
                        } label: {
                            Label(L("notifications.prefs.type"), systemImage: "slider.horizontal.3")
                                .font(AsianCupFonts.app(size: 13, weight: .bold))
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 11)
                                .foregroundStyle(AcTheme.emeraldInk)
                                .background(
                                    RoundedRectangle(cornerRadius: AcTheme.buttonRadius, style: .continuous)
                                        .fill(AcTheme.emerald.opacity(0.12))
                                )
                        }
                        .buttonStyle(AcPressableStyle())
                    }
                    .padding(14)
                } else {
                    AcLoginForm()
                        .padding(14)
                }
            }
        }
    }
}

// MARK: - نموذج الدخول (جوال OTP | بريد + كلمة مرور) — بدون Apple / بدون علامة سبق

enum AcLoginMode { case phone, email }

struct AcLoginForm: View {
    @Environment(AcAuthStore.self) private var auth
    @State private var mode: AcLoginMode = .phone
    @State private var email = ""
    @State private var password = ""

    var body: some View {
        VStack(spacing: 14) {
            modeTabs
            if mode == .phone {
                AcPhoneLoginFlow()
            } else {
                emailFields
            }
        }
    }

    private var modeTabs: some View {
        HStack(spacing: 6) {
            modeTab(L("auth.tab.phone"), icon: "iphone", value: .phone)
            modeTab(L("auth.tab.email"), icon: "envelope", value: .email)
        }
        .padding(4)
        .background(RoundedRectangle(cornerRadius: AcTheme.tileRadius, style: .continuous).fill(AcTheme.chipFill))
    }

    private func modeTab(_ title: String, icon: String, value: AcLoginMode) -> some View {
        let active = mode == value
        return Button {
            withAnimation(.easeOut(duration: 0.2)) { mode = value }
        } label: {
            HStack(spacing: 6) {
                Image(systemName: icon).font(.system(size: 12, weight: .bold))
                Text(title).font(AsianCupFonts.app(size: 13, weight: .bold))
            }
            .foregroundStyle(active ? AcTheme.emeraldInk : AcTheme.onDarkDim)
            .frame(maxWidth: .infinity).frame(height: 38)
            .background(
                RoundedRectangle(cornerRadius: AcTheme.tileRadius - 2, style: .continuous)
                    .fill(active ? AcTheme.emerald.opacity(0.14) : Color.clear)
            )
        }
        .buttonStyle(.plain)
    }

    private var emailFields: some View {
        VStack(spacing: 12) {
            loginField(text: $email, placeholder: L("auth.field.email"), icon: "envelope", secure: false)
            loginField(text: $password, placeholder: L("auth.field.password"), icon: "lock", secure: true)

            Button {
                Task { await auth.loginWithCredentials(identifier: email, password: password) }
            } label: {
                HStack(spacing: 8) {
                    if auth.isLoading && auth.errorSource != .phone {
                        ProgressView().tint(.white)
                    }
                    Text(L("auth.cta.signin"))
                        .font(AsianCupFonts.app(size: 15, weight: .bold))
                }
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity).frame(height: 48)
                .background(
                    RoundedRectangle(cornerRadius: AcTheme.buttonRadius, style: .continuous)
                        .fill(AcTheme.emerald)
                )
            }
            .buttonStyle(AcPressableStyle())
            .disabled(auth.isLoading)

            if auth.errorSource == .credentials, let err = auth.errorMessage {
                Text(err)
                    .font(AsianCupFonts.app(size: 12))
                    .foregroundStyle(AcTheme.crimson)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: .infinity)
            }
        }
    }

    @ViewBuilder
    private func loginField(text: Binding<String>, placeholder: String, icon: String, secure: Bool) -> some View {
        HStack(spacing: 10) {
            Image(systemName: icon)
                .font(.system(size: 14))
                .foregroundStyle(AcTheme.onDarkFaint)
                .frame(width: 18)
            Group {
                if secure {
                    SecureField("", text: text, prompt: Text(placeholder).foregroundStyle(AcTheme.onDarkFaint))
                } else {
                    TextField("", text: text, prompt: Text(placeholder).foregroundStyle(AcTheme.onDarkFaint))
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .keyboardType(.emailAddress)
                        .textContentType(.emailAddress)
                }
            }
            .font(AsianCupFonts.app(size: 15))
            .foregroundStyle(AcTheme.onDark)
            .tint(AcTheme.emerald)
        }
        .padding(.horizontal, 14).padding(.vertical, 13)
        .background(
            RoundedRectangle(cornerRadius: AcTheme.tileRadius, style: .continuous)
                .fill(AcTheme.cardFill)
                .overlay(
                    RoundedRectangle(cornerRadius: AcTheme.tileRadius, style: .continuous)
                        .stroke(AcTheme.outline, lineWidth: 1)
                )
        )
    }
}

struct AcPhoneLoginFlow: View {
    @Environment(AcAuthStore.self) private var auth
    private enum Step { case phone, code }
    @State private var step: Step = .phone
    @State private var country: AcDialCountry = .saudi
    @State private var number = ""
    @State private var code = ""
    @State private var resend = 0
    @FocusState private var phoneFocused: Bool

    private var maxNational: Int { country.nationalLength.upperBound }
    private var normalized: String { String(number.filter(\.isNumber).prefix(maxNational)) }
    private var phoneValid: Bool { country.nationalLength.contains(normalized.count) }
    private var e164: String { "+\(country.dial)\(normalized)" }
    private var e164Display: String { "+\(country.dial) \(normalized)" }

    var body: some View {
        VStack(spacing: 12) {
            if step == .phone { phoneStep } else { codeStep }
        }
    }

    private var phoneStep: some View {
        VStack(spacing: 12) {
            HStack(spacing: 10) {
                Menu {
                    ForEach(AcDialCountry.all) { item in
                        Button {
                            country = item
                            number = String(number.filter(\.isNumber).prefix(item.nationalLength.upperBound))
                        } label: {
                            Text("\(item.flag)  \(item.name)  +\(item.dial)")
                        }
                    }
                } label: {
                    HStack(spacing: 4) {
                        Text(country.flag).font(.system(size: 16))
                        Text("+\(country.dial)")
                            .font(AsianCupFonts.app(size: 15, weight: .bold))
                            .foregroundStyle(AcTheme.onDark)
                        Image(systemName: "chevron.down")
                            .font(.system(size: 10, weight: .bold))
                            .foregroundStyle(AcTheme.onDarkDim)
                    }
                    .padding(.trailing, 2)
                }
                .accessibilityLabel(L("auth.phone.pickCountry"))
                .environment(\.layoutDirection, .leftToRight)

                Rectangle().fill(AcTheme.outline).frame(width: 1, height: 22)

                TextField(
                    "",
                    text: $number,
                    prompt: Text(verbatim: country.placeholder).foregroundStyle(AcTheme.onDarkFaint)
                )
                    .keyboardType(.numberPad)
                    .textContentType(.telephoneNumber)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .font(.system(size: 17, weight: .semibold, design: .rounded).monospacedDigit())
                    .foregroundStyle(AcTheme.onDark)
                    .tint(AcTheme.emerald)
                    .multilineTextAlignment(.leading)
                    .focused($phoneFocused)
                    .onChange(of: number) { _, v in
                        number = String(v.filter(\.isNumber).prefix(maxNational))
                    }
            }
            .environment(\.layoutDirection, .leftToRight)
            .padding(.horizontal, 14).padding(.vertical, 13)
            .background(fieldBg)
            .contentShape(Rectangle())
            .onTapGesture { phoneFocused = true }
            .onAppear { phoneFocused = true }

            Text(L("auth.phone.hint"))
                .font(AsianCupFonts.app(size: 11.5))
                .foregroundStyle(AcTheme.onDarkFaint)
                .frame(maxWidth: .infinity, alignment: .center)

            primaryButton(L("auth.phone.send"), enabled: phoneValid) { Task { await send() } }
            phoneError
        }
    }

    private var codeStep: some View {
        VStack(spacing: 14) {
            VStack(spacing: 4) {
                Text(L("auth.phone.enterCode"))
                    .font(AsianCupFonts.app(size: 15, weight: .bold))
                    .foregroundStyle(AcTheme.onDark)
                HStack(spacing: 5) {
                    Text(L("auth.phone.sentTo"))
                    Text(e164Display).environment(\.layoutDirection, .leftToRight)
                    Button(L("auth.phone.edit")) {
                        withAnimation { step = .phone; code = "" }
                    }
                    .foregroundStyle(AcTheme.emerald)
                }
                .font(AsianCupFonts.app(size: 12))
                .foregroundStyle(AcTheme.onDarkDim)
            }

            AcOtpBoxes(code: $code) { Task { await verify() } }

            if resend > 0 {
                Text(L("auth.phone.resendIn", ["n": "\(resend)"]))
                    .font(AsianCupFonts.app(size: 12))
                    .foregroundStyle(AcTheme.onDarkFaint)
            } else {
                Button(L("auth.phone.resend")) { Task { await send() } }
                    .buttonStyle(.plain)
                    .font(AsianCupFonts.app(size: 13, weight: .bold))
                    .foregroundStyle(AcTheme.emerald)
            }

            primaryButton(L("auth.phone.verify"), enabled: code.count == 6) { Task { await verify() } }
            phoneError
        }
    }

    private func send() async {
        let result = await auth.sendPhoneCode(e164)
        if result.ok {
            withAnimation { step = .code }
            startResend()
        }
    }

    private func verify() async {
        guard code.count == 6 else { return }
        _ = await auth.verifyPhoneCode(e164, code: code)
    }

    private func startResend() {
        resend = 60
        Task { @MainActor in
            while resend > 0 {
                try? await Task.sleep(nanoseconds: 1_000_000_000)
                if resend > 0 { resend -= 1 }
            }
        }
    }

    private var fieldBg: some View {
        RoundedRectangle(cornerRadius: AcTheme.tileRadius, style: .continuous)
            .fill(AcTheme.cardFill)
            .overlay(
                RoundedRectangle(cornerRadius: AcTheme.tileRadius, style: .continuous)
                    .stroke(AcTheme.outline, lineWidth: 1)
            )
    }

    private func primaryButton(_ title: String, enabled: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 8) {
                if auth.isLoading { ProgressView().tint(.white) }
                Text(title).font(AsianCupFonts.app(size: 15, weight: .bold))
            }
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity).frame(height: 48)
            .background(
                RoundedRectangle(cornerRadius: AcTheme.buttonRadius, style: .continuous)
                    .fill(enabled ? AcTheme.emerald : AcTheme.emerald.opacity(0.4))
            )
        }
        .buttonStyle(AcPressableStyle())
        .disabled(!enabled || auth.isLoading)
    }

    @ViewBuilder private var phoneError: some View {
        if auth.errorSource == .phone, let err = auth.errorMessage {
            Text(err)
                .font(AsianCupFonts.app(size: 12))
                .foregroundStyle(AcTheme.crimson)
                .multilineTextAlignment(.center)
                .frame(maxWidth: .infinity)
        }
    }
}

struct AcOtpBoxes: View {
    @Binding var code: String
    var onComplete: () -> Void
    private let length = 6
    @FocusState private var focused: Bool

    var body: some View {
        ZStack {
            HStack(spacing: 8) {
                ForEach(0..<length, id: \.self) { i in box(i) }
            }
            .environment(\.layoutDirection, .leftToRight)
            .allowsHitTesting(false)

            TextField("", text: $code)
                .keyboardType(.numberPad)
                .textContentType(.oneTimeCode)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .font(.system(size: 22, weight: .heavy, design: .rounded).monospacedDigit())
                .foregroundStyle(.clear)
                .tint(.clear)
                .multilineTextAlignment(.center)
                .focused($focused)
                .opacity(0.02)
                .frame(maxWidth: .infinity)
                .frame(height: 54)
                .onChange(of: code) { _, v in
                    let digits = String(v.filter(\.isNumber).prefix(length))
                    if digits != code { code = digits }
                    if digits.count == length { focused = false; onComplete() }
                }
        }
        .frame(maxWidth: .infinity)
        .contentShape(Rectangle())
        .onTapGesture { focused = true }
        .onAppear { focused = true }
    }

    private func box(_ i: Int) -> some View {
        let chars = Array(code)
        let digit: String = i < chars.count ? String(chars[i]) : ""
        let active = i == chars.count
        return Text(digit)
            .font(.system(size: 22, weight: .heavy, design: .rounded).monospacedDigit())
            .foregroundStyle(AcTheme.onDark)
            .frame(maxWidth: .infinity).frame(height: 54)
            .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(AcTheme.chipFill))
            .overlay(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .stroke(active ? AcTheme.emerald : AcTheme.outline, lineWidth: active ? 2 : 1)
            )
    }
}

struct AcLoginSheet: View {
    @Environment(AcAuthStore.self) private var auth
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    Text(L("auth.subtitle"))
                        .font(AsianCupFonts.app(size: 13))
                        .foregroundStyle(AcTheme.onDarkDim)
                        .multilineTextAlignment(.center)
                        .frame(maxWidth: .infinity)
                    AcLoginForm()
                }
                .padding(20)
            }
            .background(AcAmbientBackground())
            .navigationTitle(L("auth.cta.signin"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(L("auth.close")) { dismiss() }
                }
            }
        }
        .presentationDetents([.large])
        .onChange(of: auth.isLoggedIn) { _, loggedIn in
            if loggedIn { dismiss() }
        }
    }
}

func acAppVersion() -> String {
    let v = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0"
    return "v\(v)"
}

// MARK: - مركز التحكم — تفضيلات المستخدم في مكان واحد
// المظهر وحجم الخط يُطبَّقان من AsianCupApp عبر AppStorage نفسه؛
// التذكيرات إشعارات محلية تُجدوَل على الجهاز بلا خادم.
private struct AcControlHub: View {
    let teams: [AcTeam]
    let fixtures: [AcFixture]
    let onOpenLanguage: () -> Void

    @AppStorage("ac.appearance") private var appearanceRaw = "light"
    @AppStorage("ac.textScale") private var textScaleRaw = "system"
    @AppStorage("ac.matchReminders") private var remindersOn = false
    @AppStorage("ac.favoriteTeam") private var favoriteTeamId = 0
    @ObservedObject private var loc = AcLocalization.shared

    private var favoriteTeam: AcTeam? { teams.first { $0.id == favoriteTeamId } }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            AcSectionHeader(icon: "slider.horizontal.3", title: L("more.settings.title"), subtitle: L("more.settings.subtitle"))
            AcGroupedCard {
                segmentedRow(
                    icon: "circle.lefthalf.filled",
                    title: L("settings.appearance"),
                    subtitle: L("settings.appearance.subtitle"),
                    selection: $appearanceRaw,
                    options: [("light", L("appearance.light")), ("dark", L("appearance.dark")), ("system", L("appearance.system"))]
                )
                AcRowDivider()
                segmentedRow(
                    icon: "textformat.size",
                    title: L("settings.textSize"),
                    subtitle: L("settings.textSize.subtitle"),
                    selection: $textScaleRaw,
                    options: [("system", L("textsize.system")), ("normal", L("textsize.normal")), ("large", L("textsize.large")), ("xlarge", L("textsize.xlarge"))]
                )
                AcRowDivider()
                remindersRow
                AcRowDivider()
                NavigationLink {
                    AcMatchEventNotificationsView()
                } label: {
                    controlRow(
                        icon: "bell.badge.fill",
                        title: L("notifications.prefs.title"),
                        subtitle: L("notifications.prefs.subtitle")
                    ) {
                        chevron
                    }
                }
                .buttonStyle(AcPressableStyle())
                AcRowDivider()
                NavigationLink {
                    AcFavoriteTeamPicker(teams: teams).asianCupRTL()
                } label: {
                    controlRow(
                        icon: "heart.fill",
                        title: L("settings.favorite"),
                        subtitle: favoriteTeam.map { LTeam(String($0.id), fallback: $0.name) } ?? L("favorite.all")
                    ) {
                        if let favoriteTeam { AcTeamLogo(logo: favoriteTeam.logo, size: 26) }
                        chevron
                    }
                }
                .buttonStyle(AcPressableStyle())
                AcRowDivider()
                Button(action: onOpenLanguage) {
                    controlRow(icon: "globe", title: L("more.language.row"), subtitle: "\(loc.language.flag)  \(loc.language.nativeName)") {
                        chevron
                    }
                }
                .buttonStyle(AcPressableStyle())
            }
        }
        .onChange(of: remindersOn) { _, on in
            Task {
                let ok = await AcReminders.sync(enabled: on, fixtures: fixtures, favoriteTeamId: favoriteTeamId)
                if on && !ok { remindersOn = false }
            }
        }
        .onChange(of: favoriteTeamId) { _, newValue in
            guard remindersOn else { return }
            Task { _ = await AcReminders.sync(enabled: true, fixtures: fixtures, favoriteTeamId: newValue) }
        }
    }

    private var chevron: some View {
        Image(systemName: "chevron.forward")
            .font(.system(size: 12, weight: .bold))
            .foregroundStyle(AcTheme.onDarkFaint)
    }

    private func controlIcon(_ name: String) -> some View {
        Image(systemName: name)
            .font(.system(size: 15, weight: .bold))
            .foregroundStyle(AcTheme.emerald)
            .frame(width: 36, height: 36)
            .background(RoundedRectangle(cornerRadius: AcTheme.chipRadius, style: .continuous).fill(AcTheme.emerald.opacity(0.12)))
    }

    private func rowTitles(_ title: String, _ subtitle: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title)
                .font(AsianCupFonts.app(size: 14, weight: .bold))
                .foregroundStyle(AcTheme.onDark)
            Text(subtitle)
                .font(AsianCupFonts.app(size: 11))
                .foregroundStyle(AcTheme.onDarkDim)
                .lineLimit(1)
        }
    }

    private func controlRow<Trailing: View>(
        icon: String,
        title: String,
        subtitle: String,
        @ViewBuilder trailing: () -> Trailing
    ) -> some View {
        HStack(spacing: 12) {
            controlIcon(icon)
            rowTitles(title, subtitle)
            Spacer(minLength: 8)
            trailing()
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .contentShape(Rectangle())
    }

    private func segmentedRow(
        icon: String,
        title: String,
        subtitle: String,
        selection: Binding<String>,
        options: [(String, String)]
    ) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 12) {
                controlIcon(icon)
                rowTitles(title, subtitle)
                Spacer(minLength: 0)
            }
            Picker(title, selection: selection) {
                ForEach(options, id: \.0) { value, label in
                    Text(label).tag(value)
                }
            }
            .pickerStyle(.segmented)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
    }

    private var remindersRow: some View {
        HStack(spacing: 12) {
            controlIcon("bell.badge.fill")
            rowTitles(L("settings.reminders"), L("settings.reminders.subtitle"))
            Spacer(minLength: 8)
            Toggle(L("settings.reminders"), isOn: $remindersOn)
                .labelsHidden()
                .tint(AcTheme.emerald)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
    }
}

// اختيار المنتخب المفضل — يخصّص التذكيرات، و«كل المنتخبات» يعيد الشمول.
private struct AcFavoriteTeamPicker: View {
    let teams: [AcTeam]
    @AppStorage("ac.favoriteTeam") private var favoriteTeamId = 0

    var body: some View {
        ScrollView {
            VStack(spacing: 10) {
                Text(L("settings.favorite.subtitle"))
                    .font(AsianCupFonts.app(size: 12))
                    .foregroundStyle(AcTheme.onDarkDim)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.bottom, 4)

                row(id: 0, title: L("favorite.all"), logo: nil)
                ForEach(teams) { team in
                    row(id: team.id, title: LTeam(String(team.id), fallback: team.name), logo: team.logo)
                }
            }
            .padding(16)
        }
        .background(AcAmbientBackground())
        .navigationTitle(L("settings.favorite"))
        .navigationBarTitleDisplayMode(.inline)
    }

    @ViewBuilder private func row(id: Int, title: String, logo: String?) -> some View {
        let selected = favoriteTeamId == id
        Button {
            favoriteTeamId = id
            UISelectionFeedbackGenerator().selectionChanged()
        } label: {
            HStack(spacing: 12) {
                if let logo {
                    AcTeamLogo(logo: logo, size: 34)
                } else {
                    Image(systemName: "globe.asia.australia.fill")
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundStyle(AcTheme.emerald)
                        .frame(width: 34, height: 34)
                        .background(Circle().fill(AcTheme.emerald.opacity(0.12)))
                }
                Text(title)
                    .font(AsianCupFonts.app(size: 14, weight: .bold))
                    .foregroundStyle(AcTheme.onDark)
                Spacer(minLength: 0)
                if selected {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.system(size: 18))
                        .foregroundStyle(AcTheme.emerald)
                }
            }
            .padding(16)
            .background(
                RoundedRectangle(cornerRadius: AcTheme.cardRadius, style: .continuous)
                    .fill(selected ? AcTheme.emerald.opacity(0.10) : AcTheme.cardFill)
            )
            .overlay(
                RoundedRectangle(cornerRadius: AcTheme.cardRadius, style: .continuous)
                    .stroke(selected ? AcTheme.emerald.opacity(0.5) : AcTheme.outline, lineWidth: 1)
            )
        }
        .buttonStyle(AcPressableStyle())
    }
}

// MARK: - تذكيرات المباريات (إشعارات محلية تُجدوَل على الجهاز — لا تحتاج خادمًا)
enum AcReminders {
    private static let idPrefix = "ac.match."

    /// يمسح المجدول القديم دائمًا ثم يجدول القادم إن كانت التذكيرات مفعّلة.
    /// يعيد false إذا كان إذن الإشعارات مرفوضًا (لإرجاع المفتاح بصريًّا).
    @MainActor
    static func sync(enabled: Bool, fixtures: [AcFixture], favoriteTeamId: Int) async -> Bool {
        let center = UNUserNotificationCenter.current()
        let stale = await center.pendingNotificationRequests()
            .map(\.identifier)
            .filter { $0.hasPrefix(idPrefix) }
        center.removePendingNotificationRequests(withIdentifiers: stale)
        guard enabled else { return true }

        let settings = await center.notificationSettings()
        switch settings.authorizationStatus {
        case .notDetermined:
            let granted = (try? await center.requestAuthorization(options: [.alert, .sound, .badge])) ?? false
            guard granted else { return false }
        case .denied:
            return false
        default:
            break
        }

        let now = Date().timeIntervalSince1970
        let upcoming = fixtures
            .filter { !$0.status.finished && !$0.status.live && Double($0.timestamp) - 3600 > now }
            .filter { favoriteTeamId == 0 || $0.home.id == favoriteTeamId || $0.away.id == favoriteTeamId }
            .sorted { $0.timestamp < $1.timestamp }
            .prefix(40) // سقف iOS: 64 إشعارًا معلّقًا لكل تطبيق — نُبقي هامشًا

        for fixture in upcoming {
            let content = UNMutableNotificationContent()
            content.title = "\(LTeam(String(fixture.home.id), fallback: fixture.home.name)) × \(LTeam(String(fixture.away.id), fallback: fixture.away.name))"
            content.body = L("reminder.body", ["time": AcFormat.kickoffTime(fixture.date)])
            content.sound = .default
            let trigger = UNTimeIntervalNotificationTrigger(
                timeInterval: Double(fixture.timestamp) - 3600 - now,
                repeats: false
            )
            try? await center.add(
                UNNotificationRequest(identifier: idPrefix + String(fixture.id), content: content, trigger: trigger)
            )
        }
        return true
    }
}

// MARK: - عن التطبيق
private struct AcAboutSection: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            AcSectionHeader(icon: "info.circle.fill", title: L("about.title"))
            AcGroupedCard {
                AcNavRow(icon: "number", title: L("about.version"), subtitle: acAppVersion(), showChevron: false)
            }
        }
    }
}

// الهدّافون — رابط سريع أعلى المباريات (الشجرة نفسها مدمجة أسفل الجدول).
private struct AcStatsHub: View {
    var body: some View {
        AcGroupedCard {
            NavigationLink { AcScorersScreen() } label: {
                AcNavRow(icon: "soccerball.inverse", tint: AcTheme.amber, title: L("scorers.title"), subtitle: L("scorers.subtitle"))
            }
            .buttonStyle(AcPressableStyle())
        }
    }
}

// قائمة اختيار اللغة — تعرض كل اللغات المدعومة (لغات المنتخبات الـ24 + العربية).
private struct AcLanguagePicker: View {
    @ObservedObject private var loc = AcLocalization.shared

    var body: some View {
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
                                        .foregroundStyle(AcTheme.emerald)
                                }
                            }
                            .padding(16)
                            .background(
                                RoundedRectangle(cornerRadius: AcTheme.cardRadius, style: .continuous)
                                    .fill(lang.code == loc.language.code ? AcTheme.emerald.opacity(0.10) : AcTheme.cardFill)
                            )
                            .overlay(
                                RoundedRectangle(cornerRadius: AcTheme.cardRadius, style: .continuous)
                                    .stroke(lang.code == loc.language.code ? AcTheme.emerald.opacity(0.5) : AcTheme.outline, lineWidth: 1)
                            )
                        }
                        .buttonStyle(AcPressableStyle())
                    }
                }
                .padding(16)
            }
            .background(AcAmbientBackground())
            .navigationTitle(L("language.title"))
            .navigationBarTitleDisplayMode(.inline)
    }
}

private struct AcScreenScaffold<Content: View>: View {
    var onBack: (() -> Void)? = nil
    @ViewBuilder var content: Content

    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                if let onBack {
                    AcBackBar(action: onBack)
                        .padding(.horizontal, 16)
                        .padding(.top, 10)
                        .padding(.bottom, 4)
                }
                content
                    .padding(.horizontal, 16)
                    .padding(.top, onBack == nil ? 18 : 6)
                    .padding(.bottom, 118)
            }
        }
        .background(AcAmbientBackground())
    }
}

// زر العودة الموحّد لكل الصفحات الداخلية (يدفعها كصفحات مستقلة لا منبثقة).
private struct AcBackBar: View {
    let action: () -> Void

    var body: some View {
        HStack {
            Button(action: action) {
                HStack(spacing: 6) {
                    Image(systemName: "chevron.backward")
                        .font(.system(size: 14, weight: .bold))
                    Text(L("common.back"))
                        .font(AsianCupFonts.app(size: 14, weight: .bold))
                }
                .foregroundStyle(AcTheme.emeraldInk)
                .padding(.vertical, 8)
                .padding(.horizontal, 14)
                .background(Capsule().fill(AcTheme.cardFillStrong))
                .overlay(Capsule().stroke(AcTheme.outline, lineWidth: 1))
            }
            .buttonStyle(AcPressableStyle())
            Spacer(minLength: 0)
        }
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
                .foregroundStyle(AcTheme.emeraldInk)
                .padding(.horizontal, 11)
                .padding(.vertical, 6)
                .background(Capsule().fill(AcTheme.emerald.opacity(0.12)))
                .overlay(Capsule().stroke(AcTheme.emerald.opacity(0.30), lineWidth: 1))
        }
    }
}

private struct AcHomeHero: View {
    let overview: AcOverview?
    let loading: Bool

    var body: some View {
        VStack(spacing: 14) {
            HStack(alignment: .center, spacing: 12) {
                VStack(alignment: .leading, spacing: 6) {
                    HStack(spacing: 6) {
                        AcHeroBadge(icon: "trophy.fill", text: L("hero.badge.special"), tint: AcTheme.emerald)
                        if overview?.started == true {
                            AcHeroBadge(icon: "dot.radiowaves.left.and.right", text: L("state.live"), tint: AcTheme.crimson)
                        }
                    }

                    AcTournamentTitle()
                        .frame(maxWidth: .infinity, alignment: .leading)

                    Label(L("hero.hostedBy"), systemImage: "mappin.and.ellipse")
                        .font(AsianCupFonts.app(size: 12, weight: .semibold))
                        .foregroundStyle(AcTheme.emeraldInk)
                        .labelStyle(.titleAndIcon)
                        .lineLimit(1)
                        .minimumScaleFactor(0.85)

                    Label(
                        AcFormat.dateRange(
                            startIso: AsianCupConstants.tournamentStartsAt,
                            endIso: AsianCupConstants.tournamentEndsAt
                        ),
                        systemImage: "calendar"
                    )
                    .font(AsianCupFonts.app(size: 12, weight: .semibold))
                    .foregroundStyle(AcTheme.onDarkDim)
                    .labelStyle(.titleAndIcon)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
                }

                AcEmblem(height: 72)
                    .frame(width: 78)
            }

            if let overview {
                AcHeroMetrics(overview: overview)
            } else if loading {
                AcLoadingPanel(title: L("loading.hub"))
            }
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: AcTheme.cardRadius, style: .continuous)
                .fill(AcTheme.heroGradient)
        )
        .overlay(
            RoundedRectangle(cornerRadius: AcTheme.cardRadius, style: .continuous)
                .stroke(AcTheme.outline, lineWidth: AcTheme.borderWidth)
        )
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
        .padding(.vertical, 8)
        .background(
            RoundedRectangle(cornerRadius: AcTheme.tileRadius, style: .continuous)
                .fill(AcTheme.chipFill)
        )
        .overlay(
            RoundedRectangle(cornerRadius: AcTheme.tileRadius, style: .continuous)
                .stroke(AcTheme.outline, lineWidth: AcTheme.borderWidth)
        )
    }

    private func metric(_ value: String, _ label: String) -> some View {
        HStack(spacing: 5) {
            Text(value)
                .font(AsianCupFonts.app(size: 16, weight: .bold))
                .foregroundStyle(AcTheme.emeraldInk)
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
            .frame(width: 1, height: 18)
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
            AcSectionHeader(icon: "square.grid.2x2.fill", title: L("dashboard.title"), subtitle: nil, tint: AcTheme.emerald)
            HStack(spacing: 10) {
                AcDashboardTile(icon: "calendar", title: L("tab.matches"), value: "\(fixturesCount)", tint: AcTheme.amber) {
                    onSelectTab(.matches)
                }
                AcDashboardTile(icon: "sparkles", title: L("tab.predictions"), value: L("dashboard.value.new"), tint: AcTheme.emerald) {
                    onSelectTab(.predictions)
                }
                AcDashboardTile(icon: "rectangle.3.group", title: L("tab.groups"), value: "\(groups.count)", tint: AcTheme.emerald) {
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
            HStack(spacing: 8) {
                Image(systemName: icon)
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(tint)
                    .frame(width: 28, height: 28)
                    .background(RoundedRectangle(cornerRadius: AcTheme.chipRadius, style: .continuous).fill(tint.opacity(0.14)))

                VStack(alignment: .leading, spacing: 1) {
                    Text(value)
                        .font(AsianCupFonts.app(size: 15, weight: .bold))
                        .foregroundStyle(AcTheme.onDark)
                        .monospacedDigit()
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                    Text(title)
                        .font(AsianCupFonts.app(size: 11, weight: .semibold))
                        .foregroundStyle(AcTheme.onDarkDim)
                        .lineLimit(1)
                }
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 10)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: AcTheme.tileRadius, style: .continuous).fill(AcTheme.cardFillStrong))
            .overlay(RoundedRectangle(cornerRadius: AcTheme.tileRadius, style: .continuous).stroke(AcTheme.outline, lineWidth: AcTheme.borderWidth))
        }
        .buttonStyle(AcPressableStyle())
    }
}

private struct AcPredictionsBanner: View {
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 10) {
                Image(systemName: "sparkles")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundStyle(AcTheme.emerald)
                    .frame(width: 34, height: 34)
                    .background(RoundedRectangle(cornerRadius: AcTheme.chipRadius, style: .continuous).fill(.white))
                VStack(alignment: .leading, spacing: 2) {
                    Text(L("banner.predictions.title"))
                        .font(AsianCupFonts.app(size: 14, weight: .bold))
                        .foregroundStyle(.white)
                        .lineLimit(1)
                    Text(L("banner.predictions.subtitle"))
                        .font(AsianCupFonts.app(size: 11))
                        .foregroundStyle(.white.opacity(0.82))
                        .lineLimit(1)
                }
                Spacer(minLength: 0)
                Image(systemName: "chevron.forward")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundStyle(AcTheme.emeraldInk)
                    .frame(width: 28, height: 28)
                    .background(Circle().fill(.white))
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .background(
                RoundedRectangle(cornerRadius: AcTheme.tileRadius, style: .continuous)
                    .fill(LinearGradient(colors: [AcTheme.emeraldDeep, AcTheme.emerald], startPoint: .topTrailing, endPoint: .bottomLeading))
            )
        }
        .buttonStyle(AcPressableStyle())
    }
}

private struct AcHomeVenuesPreview: View {
    let overview: AcOverview?

    var body: some View {
        guard let overview, !overview.venues.isEmpty else { return AnyView(EmptyView()) }
        let venues = Array(overview.venues.prefix(3))
        return AnyView(
            VStack(alignment: .leading, spacing: 12) {
                AcSectionHeader(icon: "building.2.fill", title: L("home.venues.title"), subtitle: nil, count: overview.venues.count, tint: AcTheme.emerald)
                VStack(spacing: 12) {
                    ForEach(venues, id: \.name) { venue in
                        HStack(spacing: 10) {
                            Image(systemName: "mappin.and.ellipse")
                                .font(.system(size: 14, weight: .bold))
                                .foregroundStyle(AcTheme.emerald)
                                .frame(width: 30, height: 30)
                                .background(RoundedRectangle(cornerRadius: AcTheme.chipRadius, style: .continuous).fill(AcTheme.emerald.opacity(0.12)))
                            VStack(alignment: .leading, spacing: 2) {
                                Text(venue.name)
                                    .font(AsianCupFonts.app(size: 13, weight: .bold))
                                    .foregroundStyle(AcTheme.onDarkStrong)
                                    .lineLimit(1)
                                Text(venue.city)
                                    .font(AsianCupFonts.app(size: 11))
                                    .foregroundStyle(AcTheme.onDarkDim)
                                    .lineLimit(1)
                            }
                            Spacer(minLength: 0)
                        }
                        .padding(.horizontal, 12)
                        .padding(.vertical, 10)
                        .background(
                            RoundedRectangle(cornerRadius: AcTheme.tileRadius, style: .continuous)
                                .fill(AcTheme.cardFillStrong)
                        )
                        .overlay(
                            RoundedRectangle(cornerRadius: AcTheme.tileRadius, style: .continuous)
                                .stroke(AcTheme.outline, lineWidth: AcTheme.borderWidth)
                        )
                    }
                }
                NavigationLink {
                    AcVenuesScreen(overview: overview)
                } label: {
                    AcViewAllLabel(title: L("home.venues.all"))
                }
                .buttonStyle(AcPressableStyle())
            }
        )
    }
}

// شاشة الملاعب الكاملة — تُفتح من معاينة الرئيسية.
private struct AcVenuesScreen: View {
    let overview: AcOverview
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        AcScreenScaffold(onBack: { dismiss() }) {
            VStack(spacing: 18) {
                AcTopBar(title: L("venues.section.title"), subtitle: L("hero.hostedBy"), state: "\(overview.venues.count)")
                AcHostShowcase(overview: overview)
                    .padding(.horizontal, -16)
            }
        }
        .navigationBarHidden(true)
    }
}

// MARK: - إرث البطولة — سجل تاريخي مدمج (يعمل دون اتصال) + حقائق حيّة من الخادم

/// نسخة تاريخية واحدة. الأسماء بالعربية والإنجليزية وتُعرض عبر LName حسب لغة الواجهة.
struct AcLegacyEdition: Identifiable {
    let year: Int
    let hostAr: String, hostEn: String
    let championAr: String, championEn: String
    let runnerAr: String, runnerEn: String
    let scoreAr: String, scoreEn: String

    var id: Int { year }
    var saudiTitle: Bool { championEn == "Saudi Arabia" }
}

struct AcLegacyRecord: Identifiable {
    let icon: String
    let labelAr: String, labelEn: String
    let valueAr: String, valueEn: String

    var id: String { labelEn }
}

enum AcLegacy {
    // النسخ الـ18 من الأحدث للأقدم. ملاحظة تحريرية: نسخ 1956–1964 تتضمن
    // مشاركات تاريخية حساسة — القرار النهائي بإبقائها أو حذفها للمالك.
    static let editions: [AcLegacyEdition] = [
        AcLegacyEdition(year: 2023, hostAr: "قطر", hostEn: "Qatar", championAr: "قطر", championEn: "Qatar", runnerAr: "الأردن", runnerEn: "Jordan", scoreAr: "3–1", scoreEn: "3–1"),
        AcLegacyEdition(year: 2019, hostAr: "الإمارات", hostEn: "UAE", championAr: "قطر", championEn: "Qatar", runnerAr: "اليابان", runnerEn: "Japan", scoreAr: "3–1", scoreEn: "3–1"),
        AcLegacyEdition(year: 2015, hostAr: "أستراليا", hostEn: "Australia", championAr: "أستراليا", championEn: "Australia", runnerAr: "كوريا الجنوبية", runnerEn: "South Korea", scoreAr: "2–1 بعد التمديد", scoreEn: "2–1 aet"),
        AcLegacyEdition(year: 2011, hostAr: "قطر", hostEn: "Qatar", championAr: "اليابان", championEn: "Japan", runnerAr: "أستراليا", runnerEn: "Australia", scoreAr: "1–0 بعد التمديد", scoreEn: "1–0 aet"),
        AcLegacyEdition(year: 2007, hostAr: "جنوب شرق آسيا", hostEn: "Southeast Asia", championAr: "العراق", championEn: "Iraq", runnerAr: "السعودية", runnerEn: "Saudi Arabia", scoreAr: "1–0", scoreEn: "1–0"),
        AcLegacyEdition(year: 2004, hostAr: "الصين", hostEn: "China", championAr: "اليابان", championEn: "Japan", runnerAr: "الصين", runnerEn: "China", scoreAr: "3–1", scoreEn: "3–1"),
        AcLegacyEdition(year: 2000, hostAr: "لبنان", hostEn: "Lebanon", championAr: "اليابان", championEn: "Japan", runnerAr: "السعودية", runnerEn: "Saudi Arabia", scoreAr: "1–0", scoreEn: "1–0"),
        AcLegacyEdition(year: 1996, hostAr: "الإمارات", hostEn: "UAE", championAr: "السعودية", championEn: "Saudi Arabia", runnerAr: "الإمارات", runnerEn: "UAE", scoreAr: "0–0 (4–2 ركلات)", scoreEn: "0–0 (4–2 pens)"),
        AcLegacyEdition(year: 1992, hostAr: "اليابان", hostEn: "Japan", championAr: "اليابان", championEn: "Japan", runnerAr: "السعودية", runnerEn: "Saudi Arabia", scoreAr: "1–0", scoreEn: "1–0"),
        AcLegacyEdition(year: 1988, hostAr: "قطر", hostEn: "Qatar", championAr: "السعودية", championEn: "Saudi Arabia", runnerAr: "كوريا الجنوبية", runnerEn: "South Korea", scoreAr: "0–0 (4–3 ركلات)", scoreEn: "0–0 (4–3 pens)"),
        AcLegacyEdition(year: 1984, hostAr: "سنغافورة", hostEn: "Singapore", championAr: "السعودية", championEn: "Saudi Arabia", runnerAr: "الصين", runnerEn: "China", scoreAr: "2–0", scoreEn: "2–0"),
        AcLegacyEdition(year: 1980, hostAr: "الكويت", hostEn: "Kuwait", championAr: "الكويت", championEn: "Kuwait", runnerAr: "كوريا الجنوبية", runnerEn: "South Korea", scoreAr: "3–0", scoreEn: "3–0"),
        AcLegacyEdition(year: 1976, hostAr: "إيران", hostEn: "Iran", championAr: "إيران", championEn: "Iran", runnerAr: "الكويت", runnerEn: "Kuwait", scoreAr: "1–0", scoreEn: "1–0"),
        AcLegacyEdition(year: 1972, hostAr: "تايلاند", hostEn: "Thailand", championAr: "إيران", championEn: "Iran", runnerAr: "كوريا الجنوبية", runnerEn: "South Korea", scoreAr: "2–1 بعد التمديد", scoreEn: "2–1 aet"),
        AcLegacyEdition(year: 1968, hostAr: "إيران", hostEn: "Iran", championAr: "إيران", championEn: "Iran", runnerAr: "بورما", runnerEn: "Burma", scoreAr: "بنظام الدوري", scoreEn: "League format"),
        AcLegacyEdition(year: 1964, hostAr: "إسرائيل", hostEn: "Israel", championAr: "إسرائيل", championEn: "Israel", runnerAr: "الهند", runnerEn: "India", scoreAr: "بنظام الدوري", scoreEn: "League format"),
        AcLegacyEdition(year: 1960, hostAr: "كوريا الجنوبية", hostEn: "South Korea", championAr: "كوريا الجنوبية", championEn: "South Korea", runnerAr: "إسرائيل", runnerEn: "Israel", scoreAr: "بنظام الدوري", scoreEn: "League format"),
        AcLegacyEdition(year: 1956, hostAr: "هونغ كونغ", hostEn: "Hong Kong", championAr: "كوريا الجنوبية", championEn: "South Korea", runnerAr: "إسرائيل", runnerEn: "Israel", scoreAr: "بنظام الدوري", scoreEn: "League format"),
    ]

    static let records: [AcLegacyRecord] = [
        AcLegacyRecord(icon: "trophy.fill", labelAr: "الأكثر تتويجًا", labelEn: "Most titles", valueAr: "اليابان · 4 ألقاب", valueEn: "Japan · 4 titles"),
        AcLegacyRecord(icon: "star.fill", labelAr: "ألقاب الأخضر", labelEn: "Saudi titles", valueAr: "3 (1984، 1988، 1996)", valueEn: "3 (1984, 1988, 1996)"),
        AcLegacyRecord(icon: "soccerball", labelAr: "الهدّاف التاريخي", labelEn: "All-time top scorer", valueAr: "علي دائي · 14 هدفًا", valueEn: "Ali Daei · 14 goals"),
        AcLegacyRecord(icon: "flame.fill", labelAr: "أهداف في نسخة واحدة", labelEn: "Goals in one edition", valueAr: "المعز علي · 9 (2019)", valueEn: "Almoez Ali · 9 (2019)"),
        AcLegacyRecord(icon: "bolt.fill", labelAr: "أكبر فوز", labelEn: "Biggest win", valueAr: "إيران 8–0 اليمن الجنوبي (1976)", valueEn: "Iran 8–0 South Yemen (1976)"),
        AcLegacyRecord(icon: "sparkles", labelAr: "النسخة 19", labelEn: "19th edition", valueAr: "الأولى على أرض السعودية", valueEn: "First on Saudi soil"),
    ]
}

// شريط الحقائق الحيّة (حامل اللقب / الأكثر تتويجًا / المضيف) — من /facts.
struct AcFactsStrip: View {
    let facts: AcFacts

    var body: some View {
        HStack(spacing: 8) {
            if let holder = facts.titleHolder {
                AcIconStat(icon: "trophy.fill", value: withCount(holder.name, holder.titles), label: L("facts.holder"), tint: AcTheme.amberDeep)
            }
            if let most = facts.mostTitles, let first = most.names.first {
                AcIconStat(icon: "crown.fill", value: withCount(first, most.titles), label: L("facts.most"), tint: AcTheme.amberDeep)
            }
            if let host = facts.host, !host.isEmpty {
                AcIconStat(icon: "mappin.and.ellipse", value: host, label: L("facts.host"))
            }
        }
    }

    private func withCount(_ name: String, _ count: Int?) -> String {
        guard let count else { return name }
        return "\(name) · \(count)"
    }
}

// معاينة الإرث على الرئيسية: الحقائق الحيّة + مدخل السجل الكامل.
private struct AcLegacyPreview: View {
    @State private var facts: AcFacts?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            AcSectionHeader(icon: "crown.fill", title: L("legacy.title"), subtitle: L("legacy.subtitle"), tint: AcTheme.amberDeep)

            if let facts, facts.available {
                AcFactsStrip(facts: facts)
            }

            NavigationLink {
                AcLegacyScreen()
            } label: {
                AcViewAllLabel(title: L("legacy.viewAll"))
            }
            .buttonStyle(AcPressableStyle())
        }
        .task {
            facts = try? await APIClient.shared.fetchAcFacts()
        }
    }
}

// شاشة الإرث الكاملة: حقائق حيّة + أرقام قياسية + سجل الأبطال الـ18.
struct AcLegacyScreen: View {
    @Environment(\.dismiss) private var dismiss
    @State private var facts: AcFacts?

    var body: some View {
        AcScreenScaffold(onBack: { dismiss() }) {
            VStack(spacing: 18) {
                AcTopBar(title: L("legacy.title"), subtitle: L("legacy.subtitle"), state: "19")

                if let facts, facts.available {
                    AcFactsStrip(facts: facts)
                }

                VStack(alignment: .leading, spacing: 12) {
                    AcSectionHeader(icon: "chart.bar.fill", title: L("legacy.records"), tint: AcTheme.amberDeep)
                    LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 2), spacing: 8) {
                        ForEach(AcLegacy.records) { record in
                            recordTile(record)
                        }
                    }
                }

                VStack(alignment: .leading, spacing: 12) {
                    AcSectionHeader(icon: "crown.fill", title: L("legacy.champions"), count: AcLegacy.editions.count)
                    VStack(spacing: 8) {
                        ForEach(AcLegacy.editions) { edition in
                            editionRow(edition)
                        }
                    }
                }
            }
        }
        .navigationBarHidden(true)
        .task {
            facts = try? await APIClient.shared.fetchAcFacts()
        }
    }

    private func recordTile(_ record: AcLegacyRecord) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                Image(systemName: record.icon)
                    .font(.system(size: 12, weight: .bold))
                    .foregroundStyle(AcTheme.amberDeep)
                Text(LName(record.labelAr, record.labelEn))
                    .font(AsianCupFonts.app(size: 11, weight: .semibold))
                    .foregroundStyle(AcTheme.onDarkDim)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
            }
            Text(LName(record.valueAr, record.valueEn))
                .font(AsianCupFonts.app(size: 13, weight: .bold))
                .foregroundStyle(AcTheme.onDarkStrong)
                .lineLimit(2)
                .minimumScaleFactor(0.7)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(RoundedRectangle(cornerRadius: AcTheme.tileRadius, style: .continuous).fill(AcTheme.cardFill))
        .overlay(RoundedRectangle(cornerRadius: AcTheme.tileRadius, style: .continuous).stroke(AcTheme.outline, lineWidth: 1))
    }

    private func editionRow(_ edition: AcLegacyEdition) -> some View {
        HStack(spacing: 12) {
            Text(String(edition.year))
                .font(AsianCupFonts.app(size: 13, weight: .bold))
                .foregroundStyle(edition.saudiTitle ? .white : AcTheme.emeraldInk)
                .monospacedDigit()
                .frame(width: 52, height: 30)
                .background(
                    RoundedRectangle(cornerRadius: AcTheme.chipRadius, style: .continuous)
                        .fill(edition.saudiTitle ? AnyShapeStyle(AcTheme.emerald) : AnyShapeStyle(AcTheme.emerald.opacity(0.10)))
                )

            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 5) {
                    Text(LName(edition.championAr, edition.championEn))
                        .font(AsianCupFonts.app(size: 14, weight: .bold))
                        .foregroundStyle(AcTheme.onDarkStrong)
                        .lineLimit(1)
                    if edition.saudiTitle {
                        Image(systemName: "star.fill")
                            .font(.system(size: 10, weight: .bold))
                            .foregroundStyle(AcTheme.amberDeep)
                    }
                }
                Text(L("legacy.row.final", ["r": LName(edition.runnerAr, edition.runnerEn), "s": LName(edition.scoreAr, edition.scoreEn)]))
                    .font(AsianCupFonts.app(size: 11, weight: .semibold))
                    .foregroundStyle(AcTheme.onDarkDim)
                    .lineLimit(1)
                    .minimumScaleFactor(0.75)
                Text(L("legacy.row.host", ["h": LName(edition.hostAr, edition.hostEn)]))
                    .font(AsianCupFonts.app(size: 11))
                    .foregroundStyle(AcTheme.onDarkFaint)
                    .lineLimit(1)
            }

            Spacer(minLength: 0)

            Image(systemName: "trophy.fill")
                .font(.system(size: 13, weight: .bold))
                .foregroundStyle(edition.saudiTitle ? AcTheme.amberDeep : AcTheme.onDarkFaint.opacity(0.5))
        }
        .padding(12)
        .background(
            RoundedRectangle(cornerRadius: AcTheme.cardRadius, style: .continuous)
                .fill(edition.saudiTitle ? AcTheme.emerald.opacity(0.07) : AcTheme.cardFill)
        )
        .overlay(
            RoundedRectangle(cornerRadius: AcTheme.cardRadius, style: .continuous)
                .stroke(edition.saudiTitle ? AcTheme.emerald.opacity(0.30) : AcTheme.outline, lineWidth: 1)
        )
    }
}

// MARK: - بوابة اللغة عند أول تشغيل — أول ما يراه المشجع غير العربي
private struct AcLanguageOnboarding: View {
    let onDone: () -> Void
    @ObservedObject private var loc = AcLocalization.shared

    var body: some View {
        VStack(spacing: 12) {
            AcEmblem(height: 62)
                .padding(.top, 20)

            Text(L("lang.onboarding.title"))
                .font(AsianCupFonts.app(size: 20, weight: .bold))
                .foregroundStyle(AcTheme.onDarkStrong)

            Text(L("lang.onboarding.subtitle"))
                .font(AsianCupFonts.app(size: 12))
                .foregroundStyle(AcTheme.onDarkDim)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)

            ScrollView(showsIndicators: false) {
                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 2), spacing: 8) {
                    ForEach(AcLanguage.all) { lang in
                        languageChip(lang)
                    }
                }
                .padding(.vertical, 4)
            }

            Button(action: onDone) {
                Text(L("lang.onboarding.continue"))
                    .font(AsianCupFonts.app(size: 15, weight: .bold))
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 13)
                    .background(RoundedRectangle(cornerRadius: AcTheme.buttonRadius, style: .continuous).fill(AcTheme.emerald))
            }
            .buttonStyle(AcPressableStyle())
        }
        .padding(.horizontal, 20)
        .padding(.bottom, 16)
        .background(AcAmbientBackground())
        .interactiveDismissDisabled()
    }

    private func languageChip(_ lang: AcLanguage) -> some View {
        let selected = lang.code == loc.language.code
        return Button {
            loc.setLanguage(lang)
            UISelectionFeedbackGenerator().selectionChanged()
        } label: {
            HStack(spacing: 8) {
                Text(lang.flag)
                    .font(.system(size: 19))
                Text(lang.nativeName)
                    .font(AsianCupFonts.app(size: 13, weight: .bold))
                    .foregroundStyle(AcTheme.onDark)
                    .lineLimit(1)
                    .minimumScaleFactor(0.65)
                Spacer(minLength: 0)
                if selected {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.system(size: 15))
                        .foregroundStyle(AcTheme.emerald)
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 11)
            .background(
                RoundedRectangle(cornerRadius: AcTheme.tileRadius, style: .continuous)
                    .fill(selected ? AcTheme.emerald.opacity(0.10) : AcTheme.cardFillStrong)
            )
            .overlay(
                RoundedRectangle(cornerRadius: AcTheme.tileRadius, style: .continuous)
                    .stroke(selected ? AcTheme.emerald.opacity(0.5) : AcTheme.outline, lineWidth: 1)
            )
        }
        .buttonStyle(AcPressableStyle())
    }
}

private struct AcMatchesHero: View {
    let fixtures: [AcFixture]

    private var finishedCount: Int { fixtures.filter { $0.status.finished }.count }
    private var liveCount: Int { fixtures.filter { $0.status.live }.count }

    var body: some View {
        HStack(spacing: 10) {
            AcIconStat(icon: "flag.fill", value: "\(fixtures.count)", label: L("matchesHero.matches"))
            AcIconStat(icon: "checkmark.seal.fill", value: "\(finishedCount)", label: L("matchesHero.finished"), tint: AcTheme.emeraldSoft)
            AcIconStat(icon: "dot.radiowaves.left.and.right", value: "\(liveCount)", label: L("state.live"), tint: AcTheme.crimson)
        }
    }
}

private struct AcRefreshBanner: View {
    let message: String
    let refresh: () async -> Void

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: "wifi.exclamationmark")
                .font(.system(size: 17, weight: .bold))
                .foregroundStyle(AcTheme.amber)
                .frame(width: 38, height: 38)
                .background(RoundedRectangle(cornerRadius: AcTheme.cardRadius, style: .continuous).fill(AcTheme.amber.opacity(0.12)))
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
                    .foregroundStyle(.white)
                    .frame(width: 32, height: 32)
                    .background(Circle().fill(AcTheme.emerald))
            }
            .buttonStyle(AcPressableStyle())
        }
        .padding(12)
        .background(RoundedRectangle(cornerRadius: AcTheme.cardRadius, style: .continuous).fill(AcTheme.cardFill))
        .overlay(RoundedRectangle(cornerRadius: AcTheme.cardRadius, style: .continuous).stroke(AcTheme.outline, lineWidth: 1))
    }
}

private struct AcLoadingPanel: View {
    let title: String

    var body: some View {
        HStack(spacing: 10) {
            ProgressView().tint(AcTheme.emerald)
            Text(title)
                .font(AsianCupFonts.app(size: 13, weight: .semibold))
                .foregroundStyle(AcTheme.onDarkDim)
            Spacer(minLength: 0)
        }
        .padding(16)
        .background(RoundedRectangle(cornerRadius: AcTheme.cardRadius, style: .continuous).fill(AcTheme.cardFill))
        .overlay(RoundedRectangle(cornerRadius: AcTheme.cardRadius, style: .continuous).stroke(AcTheme.outline, lineWidth: 1))
    }
}

// صفّ تنقّل موحّد ومضغوط — يُستعمل داخل حاويات مجمّعة (قوائم نظيفة بلا إطارات متفرّقة).
struct AcNavRow: View {
    let icon: String
    var tint: Color = AcTheme.emerald
    let title: String
    let subtitle: String
    var showChevron: Bool = true

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 16, weight: .bold))
                .foregroundStyle(tint)
                .frame(width: 38, height: 38)
                .background(RoundedRectangle(cornerRadius: AcTheme.cardRadius, style: .continuous).fill(tint.opacity(0.12)))
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(AsianCupFonts.app(size: 14, weight: .bold))
                    .foregroundStyle(AcTheme.onDark)
                    .lineLimit(1)
                Text(subtitle)
                    .font(AsianCupFonts.app(size: 11))
                    .foregroundStyle(AcTheme.onDarkDim)
                    .lineLimit(1)
            }
            Spacer(minLength: 8)
            if showChevron {
                Image(systemName: "chevron.forward")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundStyle(AcTheme.onDarkFaint)
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .contentShape(Rectangle())
    }
}

// حاوية قائمة مجمّعة — بطاقة واحدة بحدّ خفيف وفواصل رفيعة بدل بطاقات متفرّقة.
struct AcGroupedCard<Content: View>: View {
    @ViewBuilder var content: Content
    var body: some View {
        VStack(spacing: 0) { content }
            .background(RoundedRectangle(cornerRadius: AcTheme.cardRadius, style: .continuous).fill(AcTheme.cardFillStrong))
            .overlay(RoundedRectangle(cornerRadius: AcTheme.cardRadius, style: .continuous).stroke(AcTheme.outline, lineWidth: 1))
            .clipShape(RoundedRectangle(cornerRadius: AcTheme.cardRadius, style: .continuous))
    }
}

struct AcRowDivider: View {
    var body: some View {
        Rectangle()
            .fill(AcTheme.outline)
            .frame(height: 1)
            .padding(.leading, 64)
    }
}

// العدّ التنازلي — أخضر مضغوط للهوية، بلا ضخامة.
struct AcCountdownCard: View {
    let iso: String

    private static let labelTint = Color.white.opacity(0.78)

    var body: some View {
        VStack(spacing: 8) {
            HStack(spacing: 5) {
                Image(systemName: "timer").font(.system(size: 10, weight: .semibold))
                Text(L("countdown.title"))
                    .font(AsianCupFonts.app(size: 11, weight: .semibold))
                Spacer(minLength: 0)
            }
            .foregroundStyle(Self.labelTint)

            TimelineView(.periodic(from: .now, by: 1)) { _ in
                let c = AcCountdownMath.to(iso: iso)
                HStack(spacing: 6) {
                    cell(c.days, L("countdown.days"))
                    cell(c.hours, L("countdown.hours"))
                    cell(c.minutes, L("countdown.minutes"))
                    cell(c.seconds, L("countdown.seconds"))
                }
                .environment(\.layoutDirection, .leftToRight)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.horizontal, 10)
        .padding(.vertical, 10)
        .background(
            RoundedRectangle(cornerRadius: AcTheme.tileRadius, style: .continuous)
                .fill(
                    LinearGradient(
                        colors: [AcTheme.emeraldDeep, AcTheme.emerald],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
        )
    }

    private func cell(_ n: Int, _ label: String) -> some View {
        VStack(spacing: 2) {
            Text(String(format: "%02d", n))
                .font(AsianCupFonts.app(size: 18, weight: .bold))
                .monospacedDigit()
                .foregroundStyle(.white)
                .contentTransition(.numericText(countsDown: true))
            Text(label)
                .font(AsianCupFonts.app(size: 11, weight: .semibold))
                .foregroundStyle(Self.labelTint)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 6)
        .background(
            RoundedRectangle(cornerRadius: AcTheme.chipRadius, style: .continuous)
                .fill(Color.white.opacity(0.14))
        )
    }
}

// MARK: - القلب الحيّ للرئيسية

// قسم «مباشر الآن» — يتصدّر الرئيسية وقت المباريات: المباراة الأهم بطاقة ضوء كبيرة،
// والمباريات المتزامنة الأخرى صفوف مصغّرة فاتحة تحتها.
private struct AcLiveNowSection: View {
    let fixtures: [AcFixture]
    let onOpenMatches: () -> Void

    @AppStorage("ac.favoriteTeam") private var favoriteTeamId = 0

    private var featured: AcFixture {
        func involves(_ teamId: Int, _ f: AcFixture) -> Bool {
            f.home.id == teamId || f.away.id == teamId
        }
        if favoriteTeamId != 0, let fav = fixtures.first(where: { involves(favoriteTeamId, $0) }) {
            return fav
        }
        if let saudi = fixtures.first(where: { involves(AcTheme.saudiId, $0) }) {
            return saudi
        }
        return fixtures[0]
    }

    private var companions: [AcFixture] {
        fixtures.filter { $0.id != featured.id }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                TimelineView(.periodic(from: .now, by: 0.8)) { ctx in
                    Circle()
                        .fill(AcTheme.crimson)
                        .frame(width: 9, height: 9)
                        .opacity(Int(ctx.date.timeIntervalSinceReferenceDate / 0.8) % 2 == 0 ? 1 : 0.25)
                }
                Text(L("hero.liveNow"))
                    .font(AsianCupFonts.app(size: 16, weight: .bold))
                    .foregroundStyle(AcTheme.onDarkStrong)
                Spacer(minLength: 0)
                if fixtures.count > 1 {
                    Text("\(fixtures.count)")
                        .font(AsianCupFonts.app(size: 12, weight: .bold))
                        .foregroundStyle(AcTheme.crimson)
                        .padding(.horizontal, 9)
                        .padding(.vertical, 3)
                        .background(Capsule().fill(AcTheme.crimson.opacity(0.12)))
                }
            }

            AcMatchSpotlight(fixture: featured)

            if !companions.isEmpty {
                VStack(spacing: 8) {
                    ForEach(companions) { fixture in
                        AcMiniMatchRow(fixture: fixture)
                    }
                }
            }

            Button(action: onOpenMatches) {
                AcViewAllLabel(title: L("home.next.viewAll"))
            }
            .buttonStyle(AcPressableStyle())
        }
    }
}

// قسم «تحت الضوء» — قبل البث: أقرب مباراة لمنتخب المستخدم (أو المضيف) بطاقةً كبيرة،
// والمباراتان التاليتان صفّان مصغّران تحتها.
private struct AcSpotlightSection: View {
    let featured: AcFixture
    let companions: [AcFixture]
    let onOpenMatches: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            AcSectionHeader(icon: "calendar.badge.clock", title: L("home.spotlight.title"), tint: AcTheme.amberDeep)

            AcMatchSpotlight(fixture: featured)

            if !companions.isEmpty {
                VStack(spacing: 8) {
                    ForEach(companions) { fixture in
                        AcMiniMatchRow(fixture: fixture)
                    }
                }
            }

            Button(action: onOpenMatches) {
                AcViewAllLabel(title: L("home.next.viewAll"))
            }
            .buttonStyle(AcPressableStyle())
        }
    }
}

// زر «عرض الكل» الموحّد — صف كامل العرض بخلفية خفيفة وسهم، بدل رابط نصّي عائم.
struct AcViewAllLabel: View {
    let title: String

    var body: some View {
        HStack(spacing: 6) {
            Text(title)
                .font(AsianCupFonts.app(size: 13, weight: .bold))
            Image(systemName: "chevron.forward")
                .font(.system(size: 11, weight: .bold))
        }
        .foregroundStyle(AcTheme.emeraldInk)
        .frame(maxWidth: .infinity)
        .padding(.vertical, 10)
        .background(RoundedRectangle(cornerRadius: AcTheme.buttonRadius, style: .continuous).fill(AcTheme.emerald.opacity(0.10)))
        .overlay(
            RoundedRectangle(cornerRadius: AcTheme.buttonRadius, style: .continuous)
                .stroke(AcTheme.emerald.opacity(0.22), lineWidth: 1)
        )
    }
}

// صفّ مباراة مصغّر — مرافق فاتح ومضغوط تحت بطاقة الضوء، بنفس حالات المباراة الثلاث.
struct AcMiniMatchRow: View {
    let fixture: AcFixture
    @State private var showDetail = false

    var body: some View {
        Button { showDetail = true } label: {
            HStack(spacing: 6) {
                side(fixture.home, home: true)
                center
                side(fixture.away, home: false)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 9)
            .background(RoundedRectangle(cornerRadius: AcTheme.tileRadius, style: .continuous).fill(AcTheme.cardFillStrong))
            .overlay(
                RoundedRectangle(cornerRadius: AcTheme.tileRadius, style: .continuous)
                    .stroke(fixture.status.live ? AcTheme.crimson.opacity(0.35) : AcTheme.outline, lineWidth: 1)
            )
        }
        .buttonStyle(AcPressableStyle())
        .sheet(isPresented: $showDetail) {
            NavigationStack { AcMatchDetailSheet(fixture: fixture) }
                .presentationDetents([.large])
                .asianCupRTL()
        }
    }

    private func side(_ team: AcTeam, home: Bool) -> some View {
        HStack(spacing: 6) {
            if home {
                Spacer(minLength: 4)
                name(team, align: .trailing)
                AcTeamLogo(logo: team.logo, size: 28)
            } else {
                AcTeamLogo(logo: team.logo, size: 28)
                name(team, align: .leading)
                Spacer(minLength: 4)
            }
        }
        .frame(maxWidth: .infinity)
    }

    private func name(_ team: AcTeam, align: TextAlignment) -> some View {
        Text(LTeam(String(team.id), fallback: team.name))
            .font(AsianCupFonts.app(size: 12, weight: .semibold))
            .foregroundStyle(AcTheme.onDark)
            .lineLimit(1)
            .minimumScaleFactor(0.7)
            .multilineTextAlignment(align)
    }

    @ViewBuilder private var center: some View {
        Group {
            if fixture.status.live {
                VStack(spacing: 1) {
                    HStack(spacing: 3) {
                        Circle().fill(AcTheme.crimson).frame(width: 4, height: 4)
                        Text("\(fixture.status.elapsed ?? 0)'")
                            .font(AsianCupFonts.app(size: 11, weight: .bold))
                            .foregroundStyle(AcTheme.crimson)
                            .monospacedDigit()
                    }
                    Text("\(fixture.goals.home ?? 0) - \(fixture.goals.away ?? 0)")
                        .font(AsianCupFonts.app(size: 14, weight: .bold))
                        .foregroundStyle(AcTheme.onDarkStrong)
                        .monospacedDigit()
                        .environment(\.layoutDirection, .leftToRight)
                }
            } else if fixture.status.finished {
                Text("\(fixture.goals.home ?? 0) - \(fixture.goals.away ?? 0)")
                    .font(AsianCupFonts.app(size: 14, weight: .bold))
                    .foregroundStyle(AcTheme.onDarkDim)
                    .monospacedDigit()
                    .environment(\.layoutDirection, .leftToRight)
            } else {
                Text(AcFormat.kickoffTime(fixture.date))
                    .font(AsianCupFonts.app(size: 13, weight: .bold))
                    .foregroundStyle(AcTheme.amberDeep)
                    .monospacedDigit()
                    .environment(\.layoutDirection, .leftToRight)
            }
        }
        .frame(width: 62)
    }
}

// بطاقة الضوء — واجهة المباراة الواحدة بهوية زمردية كاملة، بثلاث حالات:
//   قادمة: الشعارات + موعد الانطلاق. مباشرة: النتيجة تنبض مع دقيقة اللعب.
//   منتهية: النتيجة النهائية. في نسخ التطوير: ضغطة مطوّلة تعاين شكل المباشر.
struct AcMatchSpotlight: View {
    let fixture: AcFixture
    @State private var showDetail = false
    // معاينة شكل «المباشر» في نسخ التطوير: ضغطة مطوّلة على البطاقة،
    // أو التشغيل بوسيط -AcSpotlightPreview (لِلقطات الشاشة والمراجعات).
    #if DEBUG
    @State private var previewLive = ProcessInfo.processInfo.arguments.contains("-AcSpotlightPreview")
    #else
    @State private var previewLive = false
    #endif

    private var isLive: Bool { fixture.status.live || previewLive }
    private var isFinished: Bool { !previewLive && fixture.status.finished }
    private var showScore: Bool { isLive || isFinished }

    private var homeGoals: Int { fixture.goals.home ?? (previewLive ? 1 : 0) }
    private var awayGoals: Int { fixture.goals.away ?? 0 }
    private var elapsed: Int { fixture.status.elapsed ?? (previewLive ? 63 : 0) }

    var body: some View {
        Button { showDetail = true } label: {
            card
        }
        .buttonStyle(AcPressableStyle())
        .sheet(isPresented: $showDetail) {
            NavigationStack { AcMatchDetailSheet(fixture: fixture) }
                .presentationDetents([.large])
                .asianCupRTL()
        }
        #if DEBUG
        .simultaneousGesture(
            LongPressGesture(minimumDuration: 0.6).onEnded { _ in
                withAnimation(.easeInOut(duration: 0.3)) { previewLive.toggle() }
            }
        )
        #endif
    }

    private var card: some View {
        VStack(spacing: 14) {
            HStack(spacing: 8) {
                Text(LRound(fixture.roundEn, fallback: fixture.round))
                    .font(AsianCupFonts.app(size: 11, weight: .bold))
                    .foregroundStyle(.white.opacity(0.85))
                    .padding(.horizontal, 10)
                    .padding(.vertical, 4)
                    .background(Capsule().fill(.white.opacity(0.14)))
                    .lineLimit(1)
                if previewLive {
                    Text(L("spotlight.preview"))
                        .font(AsianCupFonts.app(size: 11, weight: .bold))
                        .foregroundStyle(AcTheme.amber)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 3)
                        .background(Capsule().fill(.white.opacity(0.9)))
                }
                Spacer(minLength: 4)
                statePill
            }

            HStack(alignment: .center, spacing: 10) {
                teamColumn(fixture.home)
                centerColumn
                teamColumn(fixture.away)
            }

            HStack(spacing: 5) {
                Image(systemName: "mappin.and.ellipse")
                    .font(.system(size: 10, weight: .semibold))
                Text(venueText)
                    .font(AsianCupFonts.app(size: 11, weight: .semibold))
                    .lineLimit(1)
                Spacer(minLength: 0)
                Image(systemName: "chevron.forward")
                    .font(.system(size: 11, weight: .bold))
            }
            .foregroundStyle(.white.opacity(0.65))
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: AcTheme.cardRadius, style: .continuous)
                .fill(
                    LinearGradient(
                        colors: [AcTheme.emeraldDeep, AcTheme.emerald],
                        startPoint: .topTrailing,
                        endPoint: .bottomLeading
                    )
                )
        )
        .overlay(
            AcLatticePattern(spacing: 30, color: .white)
                .opacity(0.06)
                .clipShape(RoundedRectangle(cornerRadius: AcTheme.cardRadius, style: .continuous))
                .allowsHitTesting(false)
        )
        .overlay(
            RoundedRectangle(cornerRadius: AcTheme.cardRadius, style: .continuous)
                .stroke(isLive ? AcTheme.crimson.opacity(0.6) : .white.opacity(0.15), lineWidth: isLive ? 1.5 : 1)
        )
    }

    // شارة الحالة أعلى البطاقة: نبض قرمزي بالدقيقة، أو اليوم، أو «انتهت».
    @ViewBuilder private var statePill: some View {
        if isLive {
            TimelineView(.periodic(from: .now, by: 0.8)) { ctx in
                HStack(spacing: 5) {
                    Circle()
                        .fill(.white)
                        .frame(width: 6, height: 6)
                        .opacity(Int(ctx.date.timeIntervalSinceReferenceDate / 0.8) % 2 == 0 ? 1 : 0.35)
                    Text("\(elapsed)'")
                        .font(AsianCupFonts.app(size: 11, weight: .bold))
                        .monospacedDigit()
                    Text(L("state.live"))
                        .font(AsianCupFonts.app(size: 11, weight: .bold))
                }
                .foregroundStyle(.white)
                .padding(.horizontal, 10)
                .padding(.vertical, 4)
                .background(Capsule().fill(AcTheme.crimson))
            }
        } else if isFinished {
            Text(LStatus(fixture.status))
                .font(AsianCupFonts.app(size: 11, weight: .bold))
                .foregroundStyle(.white.opacity(0.85))
                .padding(.horizontal, 10)
                .padding(.vertical, 4)
                .background(Capsule().fill(.white.opacity(0.14)))
        } else {
            Text(AcFormat.kickoffDay(fixture.date))
                .font(AsianCupFonts.app(size: 11, weight: .bold))
                .foregroundStyle(.white.opacity(0.85))
                .padding(.horizontal, 10)
                .padding(.vertical, 4)
                .background(Capsule().fill(.white.opacity(0.14)))
                .lineLimit(1)
        }
    }

    private var centerColumn: some View {
        VStack(spacing: 4) {
            if showScore {
                Text("\(homeGoals) - \(awayGoals)")
                    .font(AsianCupFonts.app(size: 38, weight: .bold))
                    .foregroundStyle(.white)
                    .monospacedDigit()
                    .contentTransition(.numericText())
                    .environment(\.layoutDirection, .leftToRight)
            } else {
                Text(L("spotlight.kickoff"))
                    .font(AsianCupFonts.app(size: 11, weight: .semibold))
                    .foregroundStyle(.white.opacity(0.65))
                Text(AcFormat.kickoffTime(fixture.date))
                    .font(AsianCupFonts.app(size: 30, weight: .bold))
                    .foregroundStyle(.white)
                    .monospacedDigit()
                    .environment(\.layoutDirection, .leftToRight)
                Text(L("match.riyadhTime"))
                    .font(AsianCupFonts.app(size: 11))
                    .foregroundStyle(.white.opacity(0.55))
            }
        }
        .frame(minWidth: 104)
    }

    private func teamColumn(_ team: AcTeam) -> some View {
        VStack(spacing: 8) {
            AcTeamLogo(logo: team.logo, size: 52)
            Text(LTeam(String(team.id), fallback: team.name))
                .font(AsianCupFonts.app(size: 13, weight: .bold))
                .foregroundStyle(.white)
                .lineLimit(2)
                .multilineTextAlignment(.center)
                .minimumScaleFactor(0.7)
                .frame(height: 34)
        }
        .frame(maxWidth: .infinity)
    }

    private var venueText: String {
        if fixture.venue.name.isEmpty { return fixture.venue.city }
        if fixture.venue.city.isEmpty { return fixture.venue.name }
        return "\(fixture.venue.name) — \(fixture.venue.city)"
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
                tint: AcTheme.emerald
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
            swatch(AcTheme.amber, L("standings.legend.third"))
            Spacer(minLength: 0)
        }
    }

    private func swatch(_ color: Color, _ label: String) -> some View {
        HStack(spacing: 5) {
            RoundedRectangle(cornerRadius: 3, style: .continuous)
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
                        .foregroundStyle(AcTheme.emerald)
                    Text(groupTitle)
                        .font(AsianCupFonts.app(size: 15, weight: .bold))
                        .foregroundStyle(AcTheme.emeraldInk)
                }
                .padding(.horizontal, 11)
                .padding(.vertical, 5)
                .background(Capsule().fill(AcTheme.emerald.opacity(0.12)))

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
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: AcTheme.cardRadius, style: .continuous)
                .fill(AcTheme.cardFillStrong)
        )
        .overlay(
            RoundedRectangle(cornerRadius: AcTheme.cardRadius, style: .continuous)
                .stroke(AcTheme.outline, lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: AcTheme.cardRadius, style: .continuous))
    }

    private var groupTitle: String {
        let serverName = group.name.isEmpty ? L("standings.group.fallback") : group.name
        return order > 0 ? LGroup(order, fallback: serverName) : serverName
    }

    private func colHead(_ text: String, width: CGFloat) -> some View {
        Text(text)
            .font(AsianCupFonts.app(size: 11, weight: .semibold))
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
                .font(AsianCupFonts.app(size: 11, weight: .bold))
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
                .foregroundStyle(AcTheme.amber)
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
        .background(RoundedRectangle(cornerRadius: AcTheme.cardRadius, style: .continuous).fill(AcTheme.cardFillStrong))
        .overlay(RoundedRectangle(cornerRadius: AcTheme.cardRadius, style: .continuous).stroke(AcTheme.outline, lineWidth: 1))
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
        if thirdPlace { return AcTheme.amber.opacity(0.10) }
        return AcTheme.onDark.opacity(0.04)
    }
    private var accent: Color {
        if qualifying { return AcTheme.emeraldSoft }
        if thirdPlace { return AcTheme.amber }
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
            .background(RoundedRectangle(cornerRadius: AcTheme.cardRadius, style: .continuous).fill(rowFill))
        }
        .buttonStyle(AcPressableStyle())
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
                .foregroundStyle(AcTheme.amberDeep)
                .monospacedDigit()
                .frame(width: 20, height: 20)
                .background(Circle().fill(AcTheme.amber.opacity(0.16)))
                .overlay(Circle().stroke(AcTheme.amber.opacity(0.5), lineWidth: 1))
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
            AcSectionHeader(icon: "calendar", title: L("schedule.title"), count: fixtures.isEmpty ? nil : fixtures.count, tint: AcTheme.amberDeep)

            if rounds.count > 1 {
                roundFilter
            }

            if fixtures.isEmpty {
                AcEmptyState(icon: "sportscourt", title: L("schedule.empty.title"), subtitle: L("schedule.empty.subtitle"))
            } else {
                VStack(spacing: 22) {
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
                .foregroundStyle(active ? AcTheme.emeraldInk : AcTheme.onDarkDim)
                .padding(.horizontal, 14).padding(.vertical, 7)
                .background(
                    Capsule().fill(active ? AcTheme.emerald.opacity(0.14) : AcTheme.cardFillStrong)
                )
                .overlay(
                    Capsule().stroke(active ? AcTheme.emerald.opacity(0.35) : AcTheme.outline, lineWidth: AcTheme.borderWidth)
                )
        }
        .buttonStyle(AcPressableStyle())
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


// يوم واحد — عنوان ثم بطاقات مباريات منفصلة (تطفو على الخلفية الملونة).
struct AcDayColumn: View {
    let day: AcDayGroup

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Text(day.label)
                    .font(AsianCupFonts.app(size: 13, weight: .bold))
                    .foregroundStyle(AcTheme.onDarkStrong)
                Text("\(day.items.count)")
                    .font(AsianCupFonts.app(size: 11, weight: .bold))
                    .foregroundStyle(AcTheme.emeraldInk)
                    .padding(.horizontal, 7)
                    .padding(.vertical, 2)
                    .background(Capsule().fill(AcTheme.emerald.opacity(0.12)))
                Spacer(minLength: 0)
            }

            VStack(spacing: 12) {
                ForEach(day.items) { fixture in
                    AcMatchCard(fixture: fixture)
                }
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
                RoundedRectangle(cornerRadius: AcTheme.cardRadius, style: .continuous)
                    .fill(AcTheme.cardFill)
                    .overlay(
                        RoundedRectangle(cornerRadius: AcTheme.cardRadius, style: .continuous)
                            .stroke(AcTheme.outline, lineWidth: 1)
                    )
            )
        }
        .buttonStyle(AcPressableStyle())
    }
}

// MARK: - ملاعب الاستضافة
struct AcHostShowcase: View {
    let overview: AcOverview

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            AcSectionHeader(icon: "building.2.fill", title: L("venues.section.title"), count: overview.venues.isEmpty ? nil : overview.venues.count)

            if overview.venues.isEmpty {
                AcEmptyState(icon: "building.2", title: L("venues.empty.title"), subtitle: L("venues.empty.subtitle"))
            } else {
                AcGroupedCard {
                    ForEach(Array(overview.venues.enumerated()), id: \.element.name) { idx, v in
                        if idx > 0 { AcRowDivider() }
                        HStack(spacing: 12) {
                            Image(systemName: "mappin.and.ellipse")
                                .font(.system(size: 16, weight: .bold))
                                .foregroundStyle(AcTheme.emerald)
                                .frame(width: 38, height: 38)
                                .background(RoundedRectangle(cornerRadius: AcTheme.chipRadius, style: .continuous).fill(AcTheme.emerald.opacity(0.12)))
                            VStack(alignment: .leading, spacing: 2) {
                                Text(v.name).font(AsianCupFonts.app(size: 14, weight: .bold)).foregroundStyle(AcTheme.onDark).lineLimit(1)
                                if !v.city.isEmpty {
                                    Text(v.city).font(AsianCupFonts.app(size: 11)).foregroundStyle(AcTheme.onDarkDim).lineLimit(1)
                                }
                            }
                            Spacer(minLength: 8)
                        }
                        .padding(.horizontal, 14)
                        .padding(.vertical, 12)
                    }
                }
            }
        }
        .padding(.horizontal, 16)
    }
}

// MARK: - شاشة السباقات (هدافون / صنّاع / بطاقات)
struct AcScorersScreen: View {
    enum RaceTab: String, CaseIterable {
        case scorers, assists, cards
        var title: String {
            switch self {
            case .scorers: return L("races.tab.scorers")
            case .assists: return L("races.tab.assists")
            case .cards: return L("races.tab.cards")
            }
        }
    }

    @State private var tab: RaceTab = .scorers
    @State private var scorers: [AcScorer] = []
    @State private var assists: [AcLeader] = []
    @State private var cards: [AcLeader] = []
    @State private var loading = true
    @State private var errorMessage: String?
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        AcScreenScaffold(onBack: { dismiss() }) {
            VStack(spacing: 16) {
                AcTopBar(title: L("races.title"), subtitle: L("races.subtitle"), state: "—")

                HStack(spacing: 8) {
                    ForEach(RaceTab.allCases, id: \.self) { t in
                        Button {
                            withAnimation(.easeOut(duration: 0.2)) { tab = t }
                            Task { await loadTabIfNeeded(t) }
                        } label: {
                            Text(t.title)
                                .font(AsianCupFonts.app(size: 13, weight: .bold))
                                .foregroundStyle(tab == t ? .white : AcTheme.onDarkDim)
                                .padding(.horizontal, 12).padding(.vertical, 8)
                                .background(Capsule().fill(tab == t ? AcTheme.emerald : AcTheme.chipFill))
                        }
                        .buttonStyle(.plain)
                    }
                }

                if let errorMessage {
                    AcEmptyState(icon: "wifi.exclamationmark", title: L("scorers.empty.title"), subtitle: errorMessage)
                } else if loading {
                    AcLoadingPanel(title: L("loading.scorers"))
                } else {
                    switch tab {
                    case .scorers:
                        scorersList
                    case .assists:
                        leadersList(assists, value: { "\($0.assists)" }, label: L("scorers.assists"))
                    case .cards:
                        leadersList(cards, value: { $0.red > 0 ? "\($0.red)" : "\($0.yellow)" },
                                    label: { $0.red > 0 ? L("races.card.red") : L("races.card.yellow") })
                    }
                }
            }
        }
        .navigationBarHidden(true)
        .task { await load(force: false) }
        .refreshable { await load(force: true) }
        .navigationDestination(for: AcTeam.self) { team in
            AcTeamProfileScreen(teamId: team.id, fallback: team)
        }
    }

    @ViewBuilder private var scorersList: some View {
        if scorers.isEmpty {
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
                    .buttonStyle(AcPressableStyle())
                }
            }
        }
    }

    private func leadersList(
        _ leaders: [AcLeader],
        value: @escaping (AcLeader) -> String,
        label: @escaping (AcLeader) -> String
    ) -> some View {
        Group {
            if leaders.isEmpty {
                AcEmptyState(icon: "list.number", title: L("races.empty.title"), subtitle: L("races.empty.subtitle"))
            } else {
                VStack(spacing: 10) {
                    ForEach(leaders) { l in
                        NavigationLink {
                            AcPlayerProfileScreen(
                                playerId: l.id,
                                fallbackName: LName(l.name, l.nameEn),
                                fallbackPhoto: l.photo,
                                fallbackSubtitle: LTeam(String(l.team.id), fallback: l.team.name),
                                fallbackTeam: l.team
                            )
                        } label: {
                            HStack(spacing: 12) {
                                Text("\(l.rank)")
                                    .font(AsianCupFonts.app(size: 14, weight: .bold))
                                    .foregroundStyle(AcTheme.onDarkDim)
                                    .frame(width: 30)
                                ZStack {
                                    Circle().fill(AcTheme.chipFill)
                                    AcRemoteImage(url: l.photo).clipShape(Circle())
                                }
                                .frame(width: 42, height: 42)
                                VStack(alignment: .leading, spacing: 3) {
                                    Text(LName(l.name, l.nameEn))
                                        .font(AsianCupFonts.app(size: 14, weight: .bold))
                                        .foregroundStyle(AcTheme.onDark)
                                        .lineLimit(1)
                                    Text(LTeam(String(l.team.id), fallback: l.team.name))
                                        .font(AsianCupFonts.app(size: 11))
                                        .foregroundStyle(AcTheme.onDarkDim)
                                }
                                Spacer()
                                VStack(spacing: 0) {
                                    Text(value(l))
                                        .font(AsianCupFonts.app(size: 17, weight: .bold))
                                        .foregroundStyle(AcTheme.emerald)
                                    Text(label(l))
                                        .font(AsianCupFonts.app(size: 9))
                                        .foregroundStyle(AcTheme.onDarkDim)
                                }
                            }
                            .padding(12)
                            .background(RoundedRectangle(cornerRadius: AcTheme.cardRadius).fill(AcTheme.cardFill))
                        }
                        .buttonStyle(AcPressableStyle())
                    }
                }
            }
        }
    }

    private func leadersList(_ leaders: [AcLeader], value: @escaping (AcLeader) -> String, label: String) -> some View {
        leadersList(leaders, value: value, label: { _ in label })
    }

    private func loadTabIfNeeded(_ t: RaceTab) async {
        switch t {
        case .scorers: if scorers.isEmpty { await load(force: false) }
        case .assists: if assists.isEmpty { assists = (try? await APIClient.shared.fetchAcAssists()) ?? [] }
        case .cards: if cards.isEmpty { cards = (try? await APIClient.shared.fetchAcCards()) ?? [] }
        }
    }

    private func load(force: Bool = false) async {
        loading = true
        do {
            async let s = APIClient.shared.fetchAcScorers(ignoreCache: force)
            async let a = APIClient.shared.fetchAcAssists(ignoreCache: force)
            async let c = APIClient.shared.fetchAcCards(ignoreCache: force)
            scorers = try await s
            assists = try await a
            cards = try await c
            errorMessage = nil
        } catch {
            errorMessage = LError(error)
        }
        loading = false
    }
}

private struct AcScorerRow: View {
    let scorer: AcScorer

    var body: some View {
        HStack(spacing: 12) {
            Text("\(scorer.rank)")
                .font(AsianCupFonts.app(size: 14, weight: .bold))
                .foregroundStyle(scorer.rank <= 3 ? AcTheme.amberDeep : AcTheme.onDarkDim)
                .monospacedDigit()
                .frame(width: 30, height: 30)
                .background(Circle().fill(scorer.rank <= 3 ? AcTheme.amber.opacity(0.16) : AcTheme.chipFill))

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
                statPill(value: "\(scorer.assists)", label: L("scorers.assists"), tint: AcTheme.emerald)
            }
            VStack(spacing: 1) {
                Text("\(scorer.goals)")
                    .font(AsianCupFonts.app(size: 20, weight: .bold))
                    .foregroundStyle(AcTheme.amberDeep)
                    .monospacedDigit()
                Text(L("scorers.goals"))
                    .font(AsianCupFonts.app(size: 11))
                    .foregroundStyle(AcTheme.onDarkFaint)
            }
            .frame(minWidth: 38)
        }
        .padding(12)
        .background(RoundedRectangle(cornerRadius: AcTheme.cardRadius, style: .continuous).fill(AcTheme.cardFill))
        .overlay(RoundedRectangle(cornerRadius: AcTheme.cardRadius, style: .continuous).stroke(AcTheme.outline, lineWidth: 1))
    }

    private func statPill(value: String, label: String, tint: Color) -> some View {
        VStack(spacing: 1) {
            Text(value)
                .font(AsianCupFonts.app(size: 14, weight: .bold))
                .foregroundStyle(tint)
                .monospacedDigit()
            Text(label)
                .font(AsianCupFonts.app(size: 11))
                .foregroundStyle(AcTheme.onDarkFaint)
        }
        .frame(minWidth: 34)
    }
}

// MARK: - شاشة شجرة الأدوار الإقصائية
// MARK: - شجرة الأدوار المدمجة
// تعيش أسفل جدول المباريات وتُبنى من المباريات نفسها: كل دور إقصائي أعمدة متجاورة
// قابلة للتمرير أفقيًا، والمقاعد غير المحسومة خانات منقّطة «يُحدَّد لاحقًا» —
// فور تأهّل منتخب (وظهور مباراته من الخادم) يظهر بشعاره في موضعه تلقائيًا.
struct AcBracketSection: View {
    let fixtures: [AcFixture]

    // (roundEn القانوني من API-Football، مفتاح الترجمة، عدد مقاعد الدور)
    private static let rounds: [(en: String, key: String, slots: Int)] = [
        ("Round of 16", "round.r16", 8),
        ("Quarter-finals", "round.qf", 4),
        ("Semi-finals", "round.sf", 2),
        ("Final", "round.final", 1),
    ]

    private func matches(for roundEn: String) -> [AcFixture] {
        fixtures
            .filter { $0.roundEn == roundEn }
            .sorted { $0.timestamp < $1.timestamp }
    }

    private var thirdPlace: AcFixture? {
        fixtures.first { $0.roundEn == "3rd Place Final" }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            AcSectionHeader(icon: "trophy.fill", title: L("bracket.title"), subtitle: L("bracket.inline.subtitle"))
                .padding(.horizontal, 16)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(alignment: .center, spacing: 14) {
                    ForEach(Self.rounds, id: \.en) { round in
                        roundColumn(round)
                    }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 4)
            }
        }
    }

    private func roundColumn(_ round: (en: String, key: String, slots: Int)) -> some View {
        let real = matches(for: round.en)
        return VStack(spacing: 12) {
            Text(L(round.key))
                .font(AsianCupFonts.app(size: 11, weight: .bold))
                .foregroundStyle(AcTheme.emeraldInk)
                .padding(.horizontal, 12)
                .padding(.vertical, 4)
                .background(Capsule().fill(AcTheme.emerald.opacity(0.12)))

            ForEach(0..<round.slots, id: \.self) { idx in
                AcBracketCell(fixture: idx < real.count ? real[idx] : nil)
            }

            if round.en == "Final" {
                Image(systemName: "trophy.fill")
                    .font(.system(size: 18, weight: .bold))
                    .foregroundStyle(AcTheme.amberDeep)
                    .padding(.top, 2)
                if let thirdPlace {
                    AcBracketCell(fixture: thirdPlace, caption: L("round.third"))
                        .padding(.top, 10)
                }
            }
        }
    }
}

// خلية مباراة واحدة في الشجرة: صفّان لمنتخبين + حالة، أو خانة منقّطة لمقعد لم يُحسم.
private struct AcBracketCell: View {
    let fixture: AcFixture?
    var caption: String? = nil
    @State private var showDetail = false

    var body: some View {
        VStack(spacing: 5) {
            if let caption {
                Text(caption)
                    .font(AsianCupFonts.app(size: 11, weight: .semibold))
                    .foregroundStyle(AcTheme.onDarkFaint)
            }
            if let fixture {
                Button { showDetail = true } label: {
                    card(fixture)
                }
                .buttonStyle(AcPressableStyle())
                .sheet(isPresented: $showDetail) {
                    NavigationStack { AcMatchDetailSheet(fixture: fixture) }
                        .presentationDetents([.large])
                        .asianCupRTL()
                }
            } else {
                placeholder
            }
        }
    }

    private func card(_ f: AcFixture) -> some View {
        let finished = f.status.finished
        let started = finished || f.status.live
        let homeWin = finished && (f.goals.home ?? 0) > (f.goals.away ?? 0)
        let awayWin = finished && (f.goals.away ?? 0) > (f.goals.home ?? 0)
        return VStack(spacing: 6) {
            teamRow(f.home, score: f.goals.home, started: started, winner: homeWin, dimmed: awayWin)
            Rectangle().fill(AcTheme.outline).frame(height: 1)
            teamRow(f.away, score: f.goals.away, started: started, winner: awayWin, dimmed: homeWin)
            statusLine(f, finished: finished)
        }
        .padding(10)
        .frame(width: 158)
        .background(RoundedRectangle(cornerRadius: AcTheme.tileRadius, style: .continuous).fill(AcTheme.cardFillStrong))
        .overlay(
            RoundedRectangle(cornerRadius: AcTheme.tileRadius, style: .continuous)
                .stroke(f.status.live ? AcTheme.crimson.opacity(0.45) : AcTheme.outline, lineWidth: 1)
        )
    }

    private func teamRow(_ team: AcTeam, score: Int?, started: Bool, winner: Bool, dimmed: Bool) -> some View {
        HStack(spacing: 6) {
            AcTeamLogo(logo: team.logo, size: 20)
            Text(LTeam(String(team.id), fallback: team.name))
                .font(AsianCupFonts.app(size: 11, weight: winner ? .bold : .semibold))
                .foregroundStyle(winner ? AcTheme.emeraldInk : (dimmed ? AcTheme.onDarkDim : AcTheme.onDark))
                .lineLimit(1)
                .minimumScaleFactor(0.7)
            Spacer(minLength: 2)
            if winner {
                Image(systemName: "checkmark.circle.fill")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundStyle(AcTheme.emeraldSoft)
            }
            if started {
                Text("\(score ?? 0)")
                    .font(AsianCupFonts.app(size: 12, weight: .bold))
                    .foregroundStyle(winner ? AcTheme.emeraldInk : AcTheme.onDarkDim)
                    .monospacedDigit()
            }
        }
    }

    private func statusLine(_ f: AcFixture, finished: Bool) -> some View {
        HStack(spacing: 4) {
            if f.status.live {
                Circle().fill(AcTheme.crimson).frame(width: 5, height: 5)
                Text(LStatus(f.status))
                    .foregroundStyle(AcTheme.crimson)
            } else if finished {
                Text(LStatus(f.status))
                    .foregroundStyle(AcTheme.onDarkFaint)
            } else {
                Text("\(AcFormat.kickoffDay(f.date)) · \(AcFormat.kickoffTime(f.date))")
                    .foregroundStyle(AcTheme.amberDeep)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
            }
        }
        .font(AsianCupFonts.app(size: 11, weight: .semibold))
    }

    private var placeholder: some View {
        VStack(spacing: 6) {
            placeholderRow
            Rectangle().fill(AcTheme.outline).frame(height: 1)
            placeholderRow
            Text(L("bracket.tbd"))
                .font(AsianCupFonts.app(size: 11))
                .foregroundStyle(AcTheme.onDarkFaint)
        }
        .padding(10)
        .frame(width: 158)
        .background(RoundedRectangle(cornerRadius: AcTheme.tileRadius, style: .continuous).fill(AcTheme.cardFill))
        .overlay(
            RoundedRectangle(cornerRadius: AcTheme.tileRadius, style: .continuous)
                .stroke(AcTheme.outline, style: StrokeStyle(lineWidth: 1, dash: [5, 4]))
        )
    }

    private var placeholderRow: some View {
        HStack(spacing: 6) {
            Circle()
                .strokeBorder(AcTheme.outlineStrong, style: StrokeStyle(lineWidth: 1, dash: [3, 3]))
                .frame(width: 20, height: 20)
            RoundedRectangle(cornerRadius: 3, style: .continuous)
                .fill(AcTheme.chipFill)
                .frame(width: 66, height: 8)
            Spacer(minLength: 0)
        }
    }
}

// MARK: - صفحة المنتخب
struct AcTeamProfileScreen: View {
    let teamId: Int
    let fallback: AcTeam
    @State private var profile: AcTeamProfile?
    @State private var loading = true
    @State private var errorMessage: String?
    @Environment(\.dismiss) private var dismiss

    private var team: AcTeam { profile?.team ?? fallback }

    var body: some View {
        AcScreenScaffold(onBack: { dismiss() }) {
            VStack(spacing: 18) {
                AcTeamHero(
                    team: team,
                    teamId: teamId,
                    coach: profile?.coach,
                    rankBadge: rankBadge,
                    fifaRank: profile?.fifaRank
                )

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
                .buttonStyle(AcPressableStyle())

                if let profile {
                    AcTeamSummaryCard(profile: profile)

                    if let seasonStats = profile.seasonStats, seasonStats.available {
                        AcSeasonStatsCard(stats: seasonStats)
                    }

                    if let next = profile.nextMatch ?? profile.fixtures.first(where: { !$0.status.finished }) {
                        AcTeamNextMatchFeature(fixture: next, teamId: teamId)
                    }

                    if !profile.fixtures.isEmpty {
                        AcTeamJourneySection(fixtures: profile.fixtures, teamId: teamId)
                    }

                    if let group = profile.group {
                        VStack(alignment: .leading, spacing: 12) {
                            AcEditorialHeader(title: L("team.group"))
                            AcStandingsLegend()
                            AcGroupCard(group: group)
                        }
                    }

                    if !profile.squad.isEmpty {
                        AcSquadSection(squad: profile.squad, team: profile.team)
                    }
                }

            }
        }
        .navigationBarHidden(true)
        .task { await load() }
        .refreshable { await load(force: true) }
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

// MARK: - الهوية البصرية الجديدة (تحريري جريء) لصفحة المنتخب

/// رأس قسم تحريري: شريط ذهبي رأسي + عنوان عريض + عدّاد اختياري.
private struct AcEditorialHeader: View {
    let title: String
    var subtitle: String? = nil
    var count: Int? = nil

    var body: some View {
        HStack(spacing: 11) {
            RoundedRectangle(cornerRadius: AcTheme.cardRadius, style: .continuous)
                .fill(AcTheme.titleGradient)
                .frame(width: 4, height: subtitle == nil ? 24 : 34)
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(AsianCupFonts.app(size: 21, weight: .bold))
                    .foregroundStyle(AcTheme.onDarkStrong)
                if let subtitle {
                    Text(subtitle)
                        .font(AsianCupFonts.app(size: 12, weight: .semibold))
                        .foregroundStyle(AcTheme.onDarkDim)
                }
            }
            Spacer(minLength: 0)
            if let count {
                Text("\(count)")
                    .font(AsianCupFonts.app(size: 13, weight: .bold))
                    .foregroundStyle(AcTheme.emeraldInk)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 4)
                    .background(Capsule().fill(AcTheme.emerald.opacity(0.12)))
            }
        }
    }
}

/// شارات الفورمة (آخر 5 نتائج) — دوائر ملوّنة دلاليًّا (فوز/تعادل/خسارة).
private struct AcFormDots: View {
    let form: [String]

    var body: some View {
        HStack(spacing: 5) {
            ForEach(Array(form.prefix(5).enumerated()), id: \.offset) { _, r in
                Text(letter(r))
                    .font(AsianCupFonts.app(size: 11, weight: .bold))
                    .foregroundStyle(.white)
                    .frame(width: 23, height: 23)
                    .background(Circle().fill(color(r)))
            }
        }
        .environment(\.layoutDirection, .leftToRight)
    }

    private func letter(_ r: String) -> String {
        switch r {
        case "W": return L("team.form.win")
        case "D": return L("team.form.draw")
        case "L": return L("team.form.loss")
        default: return r
        }
    }

    private func color(_ r: String) -> Color {
        switch r {
        case "W": return AcTheme.emeraldSoft
        case "L": return AcTheme.crimson
        default: return AcTheme.amber.opacity(0.85)
        }
    }
}

/// بطاقة هوية المنتخب — نظيفة ومتوافقة مع هوية التطبيق (فاتح بارد محايد، لمسة ذهبية خفيفة).
private struct AcTeamHero: View {
    let team: AcTeam
    let teamId: Int
    let coach: String?
    let rankBadge: (groupName: String, rank: Int)?
    var fifaRank: AcFifaRank? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 15) {
            HStack(alignment: .center, spacing: 15) {
                AcTeamLogo(logo: team.logo, size: 78)

                VStack(alignment: .leading, spacing: 6) {
                    Text(L("team.profile.eyebrow"))
                        .font(AsianCupFonts.app(size: 11, weight: .bold))
                        .foregroundStyle(AcTheme.emeraldInk)
                        .tracking(1)

                    Text(LTeam(String(team.id), fallback: team.name))
                        .font(AsianCupFonts.app(size: 28, weight: .bold))
                        .foregroundStyle(AcTheme.onDarkStrong)
                        .lineLimit(2)
                        .minimumScaleFactor(0.7)

                    if let rankBadge {
                        HStack(spacing: 7) {
                            Text("#\(rankBadge.rank)")
                                .font(AsianCupFonts.app(size: 12, weight: .bold))
                                .foregroundStyle(AcTheme.amberDeep)
                                .monospacedDigit()
                                .padding(.horizontal, 9)
                                .padding(.vertical, 3)
                                .background(Capsule().fill(AcTheme.amber.opacity(0.15)))
                            Text(rankBadge.groupName)
                                .font(AsianCupFonts.app(size: 12, weight: .semibold))
                                .foregroundStyle(AcTheme.onDarkDim)
                                .lineLimit(1)
                        }
                    } else {
                        Text(L("teams.subtitle"))
                            .font(AsianCupFonts.app(size: 12, weight: .semibold))
                            .foregroundStyle(AcTheme.onDarkDim)
                            .lineLimit(1)
                    }
                }

                Spacer(minLength: 0)
            }

            // زر المتابعة (إشعارات المنتخب عبر الخادم) — يفتح Apple Sign-In لغير المسجّل.
            AcFollowButton(
                kind: "team",
                refId: String(teamId),
                refName: LTeam(String(team.id), fallback: team.name),
                refLogo: team.logo
            )

            if (coach?.isEmpty == false) || fifaRank != nil {
                HStack(spacing: 8) {
                    if let fifaRank {
                        AcHeaderChip(icon: "globe.asia.australia.fill", text: fifaText(fifaRank), tint: AcTheme.emeraldInk)
                    }
                    if let coach, !coach.isEmpty {
                        AcHeaderChip(icon: "person.fill.viewfinder", text: coach, tint: AcTheme.onDarkDim)
                    }
                    Spacer(minLength: 0)
                }
            }
        }
        .padding(18)
        .background(RoundedRectangle(cornerRadius: AcTheme.cardRadius, style: .continuous).fill(AcTheme.heroGradient))
        .overlay(RoundedRectangle(cornerRadius: AcTheme.cardRadius, style: .continuous).stroke(AcTheme.outline, lineWidth: 1))
    }

    private func fifaText(_ rank: AcFifaRank) -> String {
        var text = "\(L("team.fifa")) #\(rank.rank)"
        if let change = rank.change, change != 0 {
            text += change > 0 ? " ▲\(change)" : " ▼\(-change)"
        }
        return text
    }
}

/// إحصاءات المنتخب الفعّالة (server-stats أو احتساب من المجموعة/المباريات).
func acTeamEffectiveStats(_ profile: AcTeamProfile) -> AcTeamStats {
    if let stats = profile.stats { return stats }

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
            form: acTeamForm(profile.fixtures, teamId: profile.team.id)
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
        if own > against { win += 1; points += 3 }
        else if own == against { draw += 1; points += 1 }
        else { lose += 1 }
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
        form: acTeamForm(profile.fixtures, teamId: profile.team.id)
    )
}

func acTeamForm(_ fixtures: [AcFixture], teamId: Int) -> [String] {
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

private struct AcQualificationEntryCard: View {
    let team: AcTeam

    var body: some View {
        HStack(spacing: 13) {
            Image(systemName: "point.topleft.down.curvedto.point.bottomright.up.fill")
                .font(.system(size: 18, weight: .bold))
                .foregroundStyle(AcTheme.emeraldInk)
                .frame(width: 44, height: 44)
                .background(RoundedRectangle(cornerRadius: AcTheme.chipRadius, style: .continuous).fill(AcTheme.chipFill))

            VStack(alignment: .leading, spacing: 3) {
                Text(L("team.qualification"))
                    .font(AsianCupFonts.app(size: 16, weight: .bold))
                    .foregroundStyle(AcTheme.onDarkStrong)
                Text(L("team.qualification.subtitle"))
                    .font(AsianCupFonts.app(size: 11, weight: .semibold))
                    .foregroundStyle(AcTheme.onDarkDim)
                    .lineLimit(1)
            }

            Spacer(minLength: 0)

            HStack(spacing: 9) {
                AcTeamLogo(logo: team.logo, size: 30)
                Image(systemName: "chevron.forward")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundStyle(AcTheme.onDarkFaint)
            }
        }
        .padding(16)
        .background(RoundedRectangle(cornerRadius: AcTheme.cardRadius, style: .continuous).fill(AcTheme.cardFillStrong))
        .overlay(RoundedRectangle(cornerRadius: AcTheme.cardRadius, style: .continuous).stroke(AcTheme.outline, lineWidth: 1))
    }
}

private struct AcQualificationTimelineScreen: View {
    let team: AcTeam
    @State private var journey: AcQualificationJourney?
    @State private var loading = true
    @State private var errorMessage: String?
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        AcScreenScaffold(onBack: { dismiss() }) {
            VStack(spacing: 18) {
                header

                if let errorMessage {
                    AcRefreshBanner(message: errorMessage, refresh: { await load(force: true) })
                } else if loading && journey == nil {
                    AcLoadingPanel(title: L("loading.team"))
                }

                if let journey {
                    AcQualificationStatsCard(journey: journey)
                    AcQualificationTimelineList(items: journey.timeline)
                }

            }
        }
        .navigationBarHidden(true)
        .task { await load() }
        .refreshable { await load(force: true) }
    }

    private var header: some View {
        HStack(alignment: .center, spacing: 14) {
            AcTeamLogo(logo: team.logo, size: 66)
            VStack(alignment: .leading, spacing: 5) {
                Text(L("team.qualification"))
                    .font(AsianCupFonts.app(size: 28, weight: .bold))
                    .foregroundStyle(AcTheme.onDarkStrong)
                    .lineLimit(1)
                    .minimumScaleFactor(0.75)
                Text(journey?.subtitle ?? LTeam(String(team.id), fallback: team.name))
                    .font(AsianCupFonts.app(size: 12, weight: .semibold))
                    .foregroundStyle(AcTheme.onDarkDim)
                    .lineLimit(2)
            }
            Spacer(minLength: 0)
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

private struct AcQualificationStatsCard: View {
    let journey: AcQualificationJourney

    var body: some View {
        VStack(alignment: .leading, spacing: 13) {
            AcSectionHeader(icon: "checkmark.seal.fill", title: L("team.qualification.stats"), subtitle: journey.source)

            HStack(spacing: 8) {
                AcStatTile(value: "\(journey.stats.played)", label: L("standings.col.played"))
                AcStatTile(value: "\(journey.stats.win)", label: L("team.win"), tint: AcTheme.emeraldSoft)
                AcStatTile(value: "\(journey.stats.draw)", label: L("team.draw"))
                AcStatTile(value: "\(journey.stats.lose)", label: L("team.loss"), tint: AcTheme.crimson)
            }
        }
        .padding(16)
        .background(RoundedRectangle(cornerRadius: AcTheme.cardRadius, style: .continuous).fill(AcTheme.cardFillStrong))
        .overlay(RoundedRectangle(cornerRadius: AcTheme.cardRadius, style: .continuous).stroke(AcTheme.outline, lineWidth: 1))
    }
}

private struct AcQualificationTimelineList: View {
    let items: [AcQualificationTimelineItem]

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            AcSectionHeader(icon: "timeline.selection", title: L("team.qualification.timeline"), count: items.count)
            VStack(spacing: 0) {
                ForEach(Array(items.enumerated()), id: \.element.id) { index, item in
                    AcQualificationTimelineRow(item: item, isLast: index == items.count - 1)
                }
            }
            .padding(.vertical, 2)
        }
    }
}

private struct AcQualificationTimelineRow: View {
    let item: AcQualificationTimelineItem
    let isLast: Bool

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            VStack(spacing: 0) {
                Circle()
                    .fill(dotFill)
                    .frame(width: 12, height: 12)
                    .overlay(Circle().stroke(AcTheme.cardFillStrong, lineWidth: 3))
                if !isLast {
                    Rectangle()
                        .fill(AcTheme.outline)
                        .frame(width: 2)
                        .frame(height: 64)
                }
            }
            .frame(width: 18)
            .padding(.top, 18)

            VStack(alignment: .leading, spacing: 8) {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text(item.title)
                        .font(AsianCupFonts.app(size: 14, weight: .bold))
                        .foregroundStyle(AcTheme.onDarkStrong)
                        .lineLimit(2)
                    Spacer(minLength: 0)
                    Text(dateText)
                        .font(AsianCupFonts.app(size: 11, weight: .semibold))
                        .foregroundStyle(AcTheme.onDarkFaint)
                        .lineLimit(1)
                }

                if let subtitle = item.subtitle, !subtitle.isEmpty {
                    Text(subtitle)
                        .font(AsianCupFonts.app(size: 11, weight: .semibold))
                        .foregroundStyle(AcTheme.onDarkDim)
                        .lineLimit(2)
                }

                HStack(spacing: 8) {
                    if let opponent = item.opponent {
                        AcTeamLogo(logo: opponent.logo, size: 24)
                    }
                    if let scoreText {
                        Text(scoreText)
                            .font(AsianCupFonts.app(size: 12, weight: .bold))
                            .foregroundStyle(AcTheme.onDarkStrong)
                            .monospacedDigit()
                    }
                    if let round = item.round, !round.isEmpty {
                        Text(round)
                            .font(AsianCupFonts.app(size: 11, weight: .semibold))
                            .foregroundStyle(AcTheme.onDarkFaint)
                            .lineLimit(1)
                    }
                    Spacer(minLength: 0)
                }
            }
            .padding(12)
            .background(RoundedRectangle(cornerRadius: AcTheme.cardRadius, style: .continuous).fill(AcTheme.cardFill))
            .overlay(RoundedRectangle(cornerRadius: AcTheme.cardRadius, style: .continuous).stroke(AcTheme.outline, lineWidth: 1))
        }
    }

    private var dotFill: Color {
        if item.kind == "host" || item.kind == "qualified" { return AcTheme.emerald }
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

private struct AcTeamSummaryCard: View {
    let profile: AcTeamProfile

    private var stats: AcTeamStats { acTeamEffectiveStats(profile) }

    var body: some View {
        VStack(alignment: .leading, spacing: 13) {
            AcEditorialHeader(title: L("team.snapshot"), subtitle: stats.groupName)

            HStack(spacing: 9) {
                AcStatTile(value: "\(stats.points)", label: L("team.points"), tint: AcTheme.emeraldInk, size: .large)
                AcStatTile(value: stats.rank.map { "#\($0)" } ?? "—", label: L("team.rank.short"), size: .large)
                AcStatTile(value: signed(stats.goalsDiff), label: L("team.goalDiff"), size: .large)
            }

            HStack(spacing: 9) {
                AcStatTile(value: "\(stats.win)", label: L("team.win"), tint: AcTheme.emeraldSoft, size: .large)
                AcStatTile(value: "\(stats.draw)", label: L("team.draw"), size: .large)
                AcStatTile(value: "\(stats.lose)", label: L("team.loss"), tint: AcTheme.crimson, size: .large)
            }

            HStack(spacing: 8) {
                AcStatPill(value: "\(stats.played)", label: L("team.played"))
                AcStatPill(value: "\(stats.goalsFor)", label: L("team.goalsFor"))
                AcStatPill(value: "\(stats.goalsAgainst)", label: L("team.goalsAgainst"))
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
                    AcFormDots(form: stats.form)
                }
                Spacer(minLength: 0)
            }
            .padding(.top, 2)
        }
        .padding(16)
        .background(RoundedRectangle(cornerRadius: AcTheme.cardRadius, style: .continuous).fill(AcTheme.cardFillStrong))
        .overlay(RoundedRectangle(cornerRadius: AcTheme.cardRadius, style: .continuous).stroke(AcTheme.outline, lineWidth: 1))
    }

    private func signed(_ value: Int) -> String {
        value > 0 ? "+\(value)" : "\(value)"
    }
}

// أرقام المنتخب في البطولة (TheSports عبر الخادم) — أهداف/استحواذ/تسديد/بطاقات.
private struct AcSeasonStatsCard: View {
    let stats: AcTeamSeasonStats

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            AcSectionHeader(
                icon: "chart.bar.xaxis",
                title: L("team.tournamentStats"),
                count: stats.matches > 0 ? stats.matches : nil
            )
            AcGroupedCard {
                ForEach(Array(stats.items.enumerated()), id: \.element.label) { index, item in
                    if index > 0 { AcRowDivider() }
                    HStack {
                        Text(item.label)
                            .font(AsianCupFonts.app(size: 13))
                            .foregroundStyle(AcTheme.onDarkDim)
                        Spacer()
                        Text(valueText(item))
                            .font(AsianCupFonts.app(size: 14, weight: .bold))
                            .foregroundStyle(AcTheme.onDarkStrong)
                            .monospacedDigit()
                    }
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                }
            }
        }
    }

    private func valueText(_ item: AcSeasonStatItem) -> String {
        let whole = item.value.truncatingRemainder(dividingBy: 1) == 0
        let number = whole ? String(Int(item.value)) : String(format: "%.1f", item.value)
        return (item.percent ?? false) ? "\(number)%" : number
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
                        .foregroundStyle(AcTheme.emeraldInk)
                        .frame(width: 36, height: 36)
                        .background(RoundedRectangle(cornerRadius: AcTheme.chipRadius, style: .continuous).fill(AcTheme.chipFill))

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
                            .foregroundStyle(AcTheme.amberDeep)
                            .monospacedDigit()
                            .environment(\.layoutDirection, .leftToRight)

                        Text(AcFormat.kickoffDay(fixture.date))
                            .font(AsianCupFonts.app(size: 11, weight: .bold))
                            .foregroundStyle(AcTheme.onDarkDim)
                            .lineLimit(1)
                            .minimumScaleFactor(0.75)

                        Text("VS")
                            .font(AsianCupFonts.app(size: 11, weight: .bold))
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
                RoundedRectangle(cornerRadius: AcTheme.cardRadius, style: .continuous)
                    .fill(AcTheme.cardFillStrong)
            )
            .overlay(RoundedRectangle(cornerRadius: AcTheme.cardRadius, style: .continuous).stroke(AcTheme.outline, lineWidth: 1))
        }
        .buttonStyle(AcPressableStyle())
        .sheet(isPresented: $showDetail) {
            NavigationStack { AcMatchDetailSheet(fixture: fixture) }
                .presentationDetents([.large])
                .asianCupRTL()
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
                .foregroundStyle(AcTheme.onDarkDim)
            Text(venueText)
                .font(AsianCupFonts.app(size: 11, weight: .semibold))
                .foregroundStyle(AcTheme.onDarkDim)
                .lineLimit(1)
            Spacer(minLength: 0)
            Image(systemName: "chevron.forward")
                .font(.system(size: 11, weight: .bold))
                .foregroundStyle(AcTheme.onDarkFaint)
        }
        .padding(.horizontal, 11)
        .padding(.vertical, 8)
        .background(RoundedRectangle(cornerRadius: AcTheme.cardRadius, style: .continuous).fill(AcTheme.chipFill))
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
            AcEditorialHeader(title: L("team.path"), count: fixtures.count)
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
            return fixture.status.live ? AcTheme.crimson : AcTheme.onDarkDim
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
                        .font(AsianCupFonts.app(size: 11))
                        .foregroundStyle(AcTheme.onDarkFaint)
                        .lineLimit(1)
                }
                .frame(width: 74)

                Circle()
                    .fill(fixture.status.live ? AcTheme.crimson : AcTheme.outlineStrong)
                    .frame(width: 10, height: 10)
                    .overlay(Circle().stroke(AcTheme.surfaceRaised, lineWidth: 2))

                AcTeamLogo(logo: opponent.logo, size: 34)
                VStack(alignment: .leading, spacing: 3) {
                    Text(LTeam(String(opponent.id), fallback: opponent.name))
                        .font(AsianCupFonts.app(size: 13, weight: .bold))
                        .foregroundStyle(AcTheme.onDark)
                        .lineLimit(1)
                    Text(LRound(fixture.roundEn, fallback: fixture.round))
                        .font(AsianCupFonts.app(size: 11))
                        .foregroundStyle(AcTheme.onDarkFaint)
                        .lineLimit(1)
                }
                Spacer(minLength: 0)
                Text(result ?? LStatus(fixture.status))
                    .font(AsianCupFonts.app(size: 11, weight: .bold))
                    .foregroundStyle(resultTint)
                    .padding(.horizontal, 9)
                    .padding(.vertical, 5)
                    .background(Capsule().fill(AcTheme.chipFill))
            }
            .padding(12)
            .background(RoundedRectangle(cornerRadius: AcTheme.cardRadius, style: .continuous).fill(AcTheme.cardFill))
            .overlay(RoundedRectangle(cornerRadius: AcTheme.cardRadius, style: .continuous).stroke(AcTheme.outline, lineWidth: 1))
        }
        .buttonStyle(AcPressableStyle())
        .sheet(isPresented: $showDetail) {
            NavigationStack { AcMatchDetailSheet(fixture: fixture) }
                .presentationDetents([.large])
                .asianCupRTL()
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
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        AcScreenScaffold(onBack: { dismiss() }) {
            VStack(spacing: 18) {
                header

                if loading && player == nil {
                    AcLoadingPanel(title: L("player.profile"))
                }

                if let player {
                    AcPlayerBioCard(player: player)
                    if let stats = player.stats {
                        AcPlayerStatsCard(stats: stats, isGoalkeeper: player.positionEn == "Goalkeeper")
                    }
                    AcPlayerMarketCard(market: player.market)
                    if !player.career.isEmpty {
                        AcPlayerCareerCard(career: player.career)
                    }
                    if !player.trophies.isEmpty {
                        AcPlayerTrophiesCard(trophies: player.trophies)
                    }
                    if !player.transfers.isEmpty {
                        AcPlayerTransfersCard(transfers: player.transfers)
                    }
                    if let injury = player.injury {
                        AcPlayerInfoBand(icon: "cross.case.fill", title: L("player.injury"), value: injury.reason)
                    }
                } else {
                    AcPlayerFallbackCard(
                        position: fallbackPosition,
                        number: fallbackNumber,
                        age: fallbackAge,
                        team: fallbackTeam
                    )
                    if let errorMessage {
                        AcRefreshBanner(message: errorMessage, refresh: { await load(force: true) })
                    }
                }

            }
        }
        .navigationBarHidden(true)
        .task { await load() }
        .refreshable { await load(force: true) }
    }

    private var header: some View {
        HStack(alignment: .center, spacing: 15) {
            ZStack {
                Circle().fill(AcTheme.chipFill)
                Image(systemName: "person.fill")
                    .font(.system(size: 30, weight: .semibold))
                    .foregroundStyle(AcTheme.onDarkFaint)
                AcRemoteImage(url: player?.photo ?? fallbackPhoto, contentMode: .fill)
                    .clipShape(Circle())
            }
            .frame(width: 86, height: 86)
            .overlay(Circle().stroke(AcTheme.outline, lineWidth: 1.5))

            VStack(alignment: .leading, spacing: 6) {
                Text(player?.name ?? fallbackName)
                    .font(AsianCupFonts.app(size: 27, weight: .bold))
                    .foregroundStyle(AcTheme.onDarkStrong)
                    .lineLimit(2)
                    .minimumScaleFactor(0.72)
                Text(player?.fullName ?? player?.position ?? (fallbackSubtitle.isEmpty ? L("player.profile") : fallbackSubtitle))
                    .font(AsianCupFonts.app(size: 12, weight: .semibold))
                    .foregroundStyle(AcTheme.onDarkDim)
                    .lineLimit(1)
                if let team = player?.currentTeam ?? fallbackTeam {
                    HStack(spacing: 7) {
                        AcTeamLogo(logo: team.logo, size: 22)
                        Text(LTeam(String(team.id), fallback: team.name))
                            .font(AsianCupFonts.app(size: 11, weight: .bold))
                            .foregroundStyle(AcTheme.onDark)
                            .lineLimit(1)
                    }
                }
            }

            Spacer(minLength: 0)
        }
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

private struct AcPlayerBioCard: View {
    let player: AcPlayerCard

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            AcSectionHeader(icon: "person.text.rectangle.fill", title: L("player.bio"))
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 2), spacing: 8) {
                AcPlayerBioTile(label: L("player.nationality"), value: player.nationality)
                AcPlayerBioTile(label: L("player.birth"), value: formatDateOnly(player.birthDate))
                AcPlayerBioTile(label: L("player.birthPlace"), value: player.birthPlace)
                AcPlayerBioTile(label: L("player.height"), value: player.height.map { L("unit.cm", ["v": "\($0)"]) })
                AcPlayerBioTile(label: L("player.weight"), value: player.weight.map { L("unit.kg", ["v": "\($0)"]) })
                AcPlayerBioTile(label: L("player.currentTeam"), value: player.currentTeam?.name)
            }
        }
        .padding(16)
        .background(RoundedRectangle(cornerRadius: AcTheme.cardRadius, style: .continuous).fill(AcTheme.cardFillStrong))
        .overlay(RoundedRectangle(cornerRadius: AcTheme.cardRadius, style: .continuous).stroke(AcTheme.outline, lineWidth: 1))
    }
}

private struct AcPlayerBioTile: View {
    let label: String
    let value: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(label)
                .font(AsianCupFonts.app(size: 11, weight: .semibold))
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
        .background(RoundedRectangle(cornerRadius: AcTheme.cardRadius, style: .continuous).fill(AcTheme.cardFill))
        .overlay(RoundedRectangle(cornerRadius: AcTheme.cardRadius, style: .continuous).stroke(AcTheme.outline, lineWidth: 1))
    }
}

private struct AcPlayerFallbackCard: View {
    let position: String?
    let number: Int?
    let age: Int?
    let team: AcTeam?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            AcSectionHeader(icon: "person.text.rectangle.fill", title: L("player.bio"), subtitle: L("player.source"))
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
        .padding(16)
        .background(RoundedRectangle(cornerRadius: AcTheme.cardRadius, style: .continuous).fill(AcTheme.cardFillStrong))
        .overlay(RoundedRectangle(cornerRadius: AcTheme.cardRadius, style: .continuous).stroke(AcTheme.outline, lineWidth: 1))
    }
}

private struct AcPlayerStatsCard: View {
    let stats: AcPlayerTournamentStats
    let isGoalkeeper: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 13) {
            AcSectionHeader(icon: "chart.bar.doc.horizontal.fill", title: L("player.stats"))
            HStack(spacing: 8) {
                AcStatTile(value: "\(stats.matches)", label: L("player.matches"))
                AcStatTile(value: "\(stats.minutes)", label: L("player.minutes"))
                AcStatTile(value: stats.rating.map { String(format: "%.2f", $0) } ?? "—", label: L("player.rating"))
            }
            HStack(spacing: 8) {
                if isGoalkeeper {
                    AcStatPill(value: "\(stats.saves)", label: L("player.saves"))
                    AcStatPill(value: "\(stats.conceded)", label: L("player.conceded"))
                } else {
                    AcStatPill(value: "\(stats.goals)", label: L("player.goals"))
                    AcStatPill(value: "\(stats.assists)", label: L("player.assists"))
                }
                AcStatPill(value: "\(stats.lineups)", label: L("player.lineups"))
                AcStatPill(value: "\(stats.yellow + stats.red)", label: L("player.cards"))
            }
        }
        .padding(16)
        .background(RoundedRectangle(cornerRadius: AcTheme.cardRadius, style: .continuous).fill(AcTheme.cardFillStrong))
        .overlay(RoundedRectangle(cornerRadius: AcTheme.cardRadius, style: .continuous).stroke(AcTheme.outline, lineWidth: 1))
    }
}

private struct AcPlayerMarketCard: View {
    let market: AcPlayerMarket

    var body: some View {
        AcPlayerInfoBand(
            icon: "chart.line.uptrend.xyaxis",
            title: L("player.market"),
            value: market.available && market.value != nil
                ? "\(compact(market.value!)) \(market.currency)"
                : L("player.market.unavailable")
        )
    }

    // 5,500,000 → «5.5M» — أرقام السوق تُقرأ بالملايين لا بالخانات.
    private func compact(_ value: Int) -> String {
        if value >= 1_000_000 { return String(format: "%.1fM", Double(value) / 1_000_000) }
        if value >= 1_000 { return String(format: "%.0fK", Double(value) / 1_000) }
        return "\(value)"
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
            AcSectionHeader(icon: icon, title: title)
            VStack(spacing: 7) { content }
        }
        .padding(16)
        .background(RoundedRectangle(cornerRadius: AcTheme.cardRadius, style: .continuous).fill(AcTheme.cardFillStrong))
        .overlay(RoundedRectangle(cornerRadius: AcTheme.cardRadius, style: .continuous).stroke(AcTheme.outline, lineWidth: 1))
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
                    .font(AsianCupFonts.app(size: 11, weight: .semibold))
                    .foregroundStyle(AcTheme.onDarkFaint)
                    .lineLimit(1)
            }
            Spacer(minLength: 0)
        }
        .padding(10)
        .background(RoundedRectangle(cornerRadius: AcTheme.cardRadius, style: .continuous).fill(AcTheme.cardFill))
        .overlay(RoundedRectangle(cornerRadius: AcTheme.cardRadius, style: .continuous).stroke(AcTheme.outline, lineWidth: 1))
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
                .foregroundStyle(AcTheme.emerald)
                .frame(width: 40, height: 40)
                .background(RoundedRectangle(cornerRadius: AcTheme.chipRadius, style: .continuous).fill(AcTheme.chipFill))
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
        .padding(16)
        .background(RoundedRectangle(cornerRadius: AcTheme.cardRadius, style: .continuous).fill(AcTheme.cardFillStrong))
        .overlay(RoundedRectangle(cornerRadius: AcTheme.cardRadius, style: .continuous).stroke(AcTheme.outline, lineWidth: 1))
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
            AcEditorialHeader(title: L("team.squad"), count: squad.count)
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
                                .buttonStyle(AcPressableStyle())
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
                    .font(AsianCupFonts.app(size: 11, weight: .semibold))
                    .foregroundStyle(AcTheme.onDarkFaint)
                    .lineLimit(1)
            }

            Spacer(minLength: 0)

            if let age = player.age {
                Text(L("team.age", ["age": "\(age)"]))
                    .font(AsianCupFonts.app(size: 11))
                    .foregroundStyle(AcTheme.onDarkFaint)
            }
        }
        .padding(.horizontal, 12).padding(.vertical, 9)
        .background(RoundedRectangle(cornerRadius: AcTheme.cardRadius, style: .continuous).fill(AcTheme.cardFill))
        .overlay(RoundedRectangle(cornerRadius: AcTheme.cardRadius, style: .continuous).stroke(AcTheme.outline, lineWidth: 1))
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
                .font(AsianCupFonts.app(size: 11, weight: .bold))
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
