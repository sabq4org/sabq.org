import SwiftUI

// MARK: - هب كأس آسيا داخل تطبيق سبق (نظير WorldCupView / KingsCupView)

private struct AcMatchSelection: Identifiable { let id: Int }
private struct AcTeamSelection: Identifiable { let id: Int; let name: String }

struct AsianCupView: View {
    @State private var overview: AcOverview?
    @State private var fixtures: [AcFixture] = []
    @State private var groups: [AcGroup] = []
    @State private var bracket: AcBracket?
    @State private var scorers: [AcScorer] = []
    @State private var assists: [AcLeader] = []
    @State private var cards: [AcLeader] = []
    @State private var teams: [AcTeam] = []
    @State private var facts: AcFacts?

    @State private var overviewLoading = true
    @State private var fixturesLoading = true
    @State private var racesLoading = true

    @State private var selectedMatch: AcMatchSelection?
    @State private var selectedTeam: AcTeamSelection?

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(spacing: 22) {
                hero
                if let facts, facts.hasContent { factsBlock(facts) }
                matchesSection
                if !groups.isEmpty { groupsSection }
                if let bracket, !bracket.rounds.isEmpty { bracketSection(bracket) }
                AcRacesSection(
                    scorers: scorers, assists: assists, cards: cards,
                    isLoading: racesLoading,
                    started: fixtures.contains { $0.status.live || $0.status.finished }
                )
                teamsSection
            }
            .padding(.bottom, 36)
        }
        .sabqAutoHideTabBar()
        .background(AcTheme.sectionBackground.ignoresSafeArea())
        .navigationTitle("كأس آسيا")
        .navigationBarTitleDisplayMode(.inline)
        .task { await loadAll() }
        .task {
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 8_000_000_000)
                if Task.isCancelled { return }
                if fixtures.contains(where: { $0.status.live }) {
                    await loadAll(force: true)
                }
            }
        }
        .refreshable { await loadAll(force: true) }
        .sheet(item: $selectedMatch) { sel in
            AsianCupMatchCenter(fixtureId: sel.id, seed: fixtures.first { $0.id == sel.id })
        }
        .sheet(item: $selectedTeam) { sel in
            AcTeamSheet(teamId: sel.id, teamName: sel.name)
        }
        .sabqRTL()
    }

    // MARK: Hero

    private var hero: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text("كأس آسيا 2027")
                        .font(SabqFonts.app(size: 22, weight: .bold))
                        .foregroundStyle(.white)
                    Text(overview?.host ?? "المملكة العربية السعودية")
                        .font(SabqFonts.app(size: 13))
                        .foregroundStyle(.white.opacity(0.75))
                }
                Spacer()
                Image(systemName: "trophy.fill")
                    .font(.system(size: 28))
                    .foregroundStyle(AcTheme.gold)
            }

            if let champ = overview?.champion {
                Button { selectedTeam = AcTeamSelection(id: champ.team.id, name: champ.team.name) } label: {
                    HStack(spacing: 10) {
                        AcTeamLogo(team: champ.team, size: 40)
                        VStack(alignment: .leading, spacing: 2) {
                            Text("البطل").font(SabqFonts.app(size: 11)).foregroundStyle(.white.opacity(0.7))
                            Text(champ.team.name).font(SabqFonts.app(size: 16, weight: .bold)).foregroundStyle(.white)
                        }
                        Spacer()
                    }
                }
                .buttonStyle(.plain)
            } else if let fx = featuredFixture {
                Button { selectedMatch = AcMatchSelection(id: fx.id) } label: {
                    featuredMatch(fx)
                }
                .buttonStyle(.plain)
            } else if let starts = overview?.startsAt,
                      let date = SabqFormatters.parseISO8601(starts) {
                HStack {
                    Text("العدّ التنازلي")
                        .font(SabqFonts.app(size: 12))
                        .foregroundStyle(.white.opacity(0.75))
                    Spacer()
                    Text(AcFormat.countdown(to: Int(date.timeIntervalSince1970)))
                        .font(SabqFonts.app(size: 20, weight: .bold).monospacedDigit())
                        .foregroundStyle(AcTheme.gold)
                        .environment(\.layoutDirection, .leftToRight)
                }
            }

            if let saudi = overview?.saudi.team {
                Button { selectedTeam = AcTeamSelection(id: saudi.id, name: saudi.name) } label: {
                    HStack(spacing: 8) {
                        AcTeamLogo(team: saudi, size: 28)
                        Text("الأخضر")
                            .font(SabqFonts.app(size: 13, weight: .semibold))
                            .foregroundStyle(.white)
                        if let g = overview?.saudi.group {
                            Text("· \(g)")
                                .font(SabqFonts.app(size: 12))
                                .foregroundStyle(.white.opacity(0.7))
                        }
                        Spacer()
                        Image(systemName: "chevron.left")
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundStyle(.white.opacity(0.6))
                    }
                    .padding(10)
                    .background(RoundedRectangle(cornerRadius: 12).fill(.white.opacity(0.12)))
                }
                .buttonStyle(.plain)
            }
        }
        .padding(18)
        .background(
            LinearGradient(colors: [AcTheme.heroTop, AcTheme.heroBottom], startPoint: .topLeading, endPoint: .bottomTrailing)
        )
        .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
        .padding(.horizontal, 16)
        .padding(.top, 8)
    }

    private var featuredFixture: AcFixture? {
        if let live = fixtures.first(where: { $0.status.live }) { return live }
        return overview?.nextMatch
    }

    private func featuredMatch(_ fx: AcFixture) -> some View {
        HStack(spacing: 12) {
            teamCol(fx.home)
            VStack(spacing: 4) {
                if fx.started {
                    Text("\(fx.goals.home ?? 0) – \(fx.goals.away ?? 0)")
                        .font(SabqFonts.app(size: 24, weight: .bold).monospacedDigit())
                        .foregroundStyle(.white)
                        .environment(\.layoutDirection, .leftToRight)
                } else {
                    Text(AcFormat.time(fx))
                        .font(SabqFonts.app(size: 18, weight: .bold))
                        .foregroundStyle(AcTheme.gold)
                }
                AcStatusPill(fixture: fx, onDark: true)
                Text(fx.round)
                    .font(SabqFonts.app(size: 10))
                    .foregroundStyle(.white.opacity(0.65))
            }
            .frame(maxWidth: .infinity)
            teamCol(fx.away)
        }
        .padding(12)
        .background(RoundedRectangle(cornerRadius: 14).fill(.white.opacity(0.1)))
    }

    private func teamCol(_ team: AcTeam) -> some View {
        VStack(spacing: 6) {
            AcTeamLogo(team: team, size: 44)
            Text(team.name)
                .font(SabqFonts.app(size: 11, weight: .medium))
                .foregroundStyle(.white)
                .lineLimit(1)
                .frame(width: 72)
        }
    }

    // MARK: Sections

    private func factsBlock(_ facts: AcFacts) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            AcSectionHeader(icon: "sparkles", title: "حقائق البطولة", subtitle: "")
                .padding(.horizontal, 16)
            HStack(spacing: 8) {
                if let h = facts.titleHolder {
                    AcFactTile(value: h.name, label: "حامل اللقب")
                }
                if let m = facts.mostTitles, let name = m.names.first {
                    AcFactTile(value: name, label: "الأكثر تتويجًا")
                }
                if let host = facts.host, !host.isEmpty {
                    AcFactTile(value: host, label: "المضيف")
                }
            }
            .padding(.horizontal, 16)
        }
    }

    private var matchesSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            AcSectionHeader(icon: "calendar", title: "المباريات", subtitle: "")
                .padding(.horizontal, 16)
            if fixturesLoading {
                AcLoading()
            } else if fixtures.isEmpty {
                acEmptyText("جدول المباريات يظهر عند اعتماده")
            } else {
                VStack(spacing: 8) {
                    ForEach(Array(fixtures.prefix(12))) { fx in
                        Button { selectedMatch = AcMatchSelection(id: fx.id) } label: {
                            matchRow(fx)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, 16)
            }
        }
    }

    private func matchRow(_ fx: AcFixture) -> some View {
        HStack(spacing: 10) {
            AcTeamLogo(team: fx.home, size: 28)
            Text(fx.home.name)
                .font(SabqFonts.app(size: 12, weight: .medium))
                .foregroundStyle(AcTheme.onDark)
                .lineLimit(1)
                .frame(maxWidth: .infinity, alignment: .leading)
            VStack(spacing: 2) {
                if fx.started {
                    Text("\(fx.goals.home ?? 0)–\(fx.goals.away ?? 0)")
                        .font(SabqFonts.app(size: 15, weight: .bold).monospacedDigit())
                        .foregroundStyle(AcTheme.onDark)
                        .environment(\.layoutDirection, .leftToRight)
                } else {
                    Text(AcFormat.time(fx))
                        .font(SabqFonts.app(size: 13, weight: .semibold))
                        .foregroundStyle(AcTheme.emeraldDeep)
                }
                AcStatusPill(fixture: fx)
            }
            Text(fx.away.name)
                .font(SabqFonts.app(size: 12, weight: .medium))
                .foregroundStyle(AcTheme.onDark)
                .lineLimit(1)
                .frame(maxWidth: .infinity, alignment: .trailing)
            AcTeamLogo(team: fx.away, size: 28)
        }
        .padding(12)
        .acElevatedCard()
    }

    private var groupsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            AcSectionHeader(icon: "list.number", title: "المجموعات", subtitle: "")
                .padding(.horizontal, 16)
            ForEach(groups) { g in
                VStack(alignment: .leading, spacing: 8) {
                    Text(g.name)
                        .font(SabqFonts.app(size: 13, weight: .semibold))
                        .foregroundStyle(AcTheme.emeraldDeep)
                        .padding(.horizontal, 16)
                    ForEach(g.rows) { row in
                        Button {
                            selectedTeam = AcTeamSelection(id: row.team.id, name: row.team.name)
                        } label: {
                            HStack(spacing: 8) {
                                Text("\(row.rank)")
                                    .font(SabqFonts.app(size: 11, weight: .medium).monospacedDigit())
                                    .foregroundStyle(AcTheme.onDarkDim)
                                    .frame(width: 18)
                                AcTeamLogo(team: row.team, size: 24)
                                Text(row.team.name)
                                    .font(SabqFonts.app(size: 13, weight: .medium))
                                    .foregroundStyle(AcTheme.onDark)
                                    .lineLimit(1)
                                Spacer()
                                Text("\(row.points)")
                                    .font(SabqFonts.app(size: 14, weight: .bold).monospacedDigit())
                                    .foregroundStyle(AcTheme.emeraldDeep)
                            }
                            .padding(.horizontal, 12).padding(.vertical, 8)
                            .acElevatedCard(cornerRadius: 12)
                        }
                        .buttonStyle(.plain)
                        .padding(.horizontal, 16)
                    }
                }
            }
        }
    }

    private func bracketSection(_ bracket: AcBracket) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            AcSectionHeader(icon: "flowchart", title: "شجرة الأدوار", subtitle: "")
                .padding(.horizontal, 16)
            ForEach(bracket.rounds) { round in
                VStack(alignment: .leading, spacing: 8) {
                    Text(round.round)
                        .font(SabqFonts.app(size: 12, weight: .semibold))
                        .foregroundStyle(AcTheme.onDarkDim)
                        .padding(.horizontal, 16)
                    ForEach(round.matches) { fx in
                        Button { selectedMatch = AcMatchSelection(id: fx.id) } label: {
                            matchRow(fx)
                        }
                        .buttonStyle(.plain)
                        .padding(.horizontal, 16)
                    }
                }
            }
        }
    }

    private var teamsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            AcSectionHeader(icon: "flag.2.crossed", title: "المنتخبات", subtitle: "")
                .padding(.horizontal, 16)
            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
                ForEach(teams) { team in
                    Button { selectedTeam = AcTeamSelection(id: team.id, name: team.name) } label: {
                        VStack(spacing: 6) {
                            AcTeamLogo(team: team, size: 44)
                            Text(team.name)
                                .font(SabqFonts.app(size: 11, weight: .medium))
                                .foregroundStyle(AcTheme.onDark)
                                .lineLimit(1)
                            if let r = team.fifaRank {
                                Text("فيفا \(r)")
                                    .font(SabqFonts.app(size: 9))
                                    .foregroundStyle(AcTheme.onDarkDim)
                            }
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                        .acElevatedCard()
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 16)
        }
    }

    // MARK: Load

    private func loadAll(force: Bool = false) async {
        async let a: Void = loadOverview(force: force)
        async let b: Void = loadFixtures(force: force)
        async let c: Void = loadStandings(force: force)
        async let d: Void = loadBracket(force: force)
        async let e: Void = loadRaces(force: force)
        async let f: Void = loadTeams()
        async let g: Void = loadFacts()
        _ = await (a, b, c, d, e, f, g)
    }

    private func loadOverview(force: Bool) async {
        let r = try? await APIClient.shared.fetchAsianCupOverview(ignoreCache: force)
        await MainActor.run { overview = r; overviewLoading = false }
    }

    private func loadFixtures(force: Bool) async {
        let r = (try? await APIClient.shared.fetchAsianCupFixtures(ignoreCache: force)) ?? []
        await MainActor.run { fixtures = r; fixturesLoading = false }
    }

    private func loadStandings(force: Bool) async {
        let r = (try? await APIClient.shared.fetchAsianCupStandings(ignoreCache: force)) ?? []
        await MainActor.run { groups = r }
    }

    private func loadBracket(force: Bool) async {
        let r = try? await APIClient.shared.fetchAsianCupBracket(ignoreCache: force)
        await MainActor.run { bracket = r }
    }

    private func loadRaces(force: Bool) async {
        async let s = try? APIClient.shared.fetchAsianCupScorers(ignoreCache: force)
        async let a = try? APIClient.shared.fetchAsianCupAssists()
        async let c = try? APIClient.shared.fetchAsianCupCards()
        let scorersR = await s ?? []
        let assistsR = await a ?? []
        let cardsR = await c ?? []
        await MainActor.run {
            scorers = scorersR
            assists = assistsR
            cards = cardsR
            racesLoading = false
        }
    }

    private func loadTeams() async {
        let r = (try? await APIClient.shared.fetchAsianCupTeams()) ?? []
        await MainActor.run { teams = r }
    }

    private func loadFacts() async {
        let r = try? await APIClient.shared.fetchAsianCupFacts()
        await MainActor.run { facts = r }
    }
}
