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
            VStack(alignment: .leading, spacing: SabqLayout.space24) {
                hero
                if let facts, facts.hasContent { factsBlock(facts) }
                SabqSectionBand()
                matchesSection
                if !groups.isEmpty {
                    SabqSectionBand()
                    groupsSection
                }
                if let bracket, !bracket.rounds.isEmpty {
                    SabqSectionBand()
                    bracketSection(bracket)
                }
                SabqSectionBand()
                AcRacesSection(
                    scorers: scorers, assists: assists, cards: cards,
                    isLoading: racesLoading,
                    started: fixtures.contains { $0.status.live || $0.status.finished }
                )
                SabqSectionBand()
                teamsSection
            }
            .padding(.horizontal, SabqLayout.pageMargin)
            .padding(.top, SabqLayout.space8)
            .padding(.bottom, SabqLayout.space40)
        }
        .sabqAutoHideTabBar()
        .background(SabqTheme.background.ignoresSafeArea())
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

    // MARK: Hero — شريط هوية مسطّح بلون البطولة

    private var hero: some View {
        VStack(alignment: .leading, spacing: SabqLayout.space16) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: SabqLayout.space4) {
                    Text("كأس آسيا 2027")
                        .sabqText(SabqType.leadTitle)
                        .foregroundStyle(.white)
                        .accessibilityAddTraits(.isHeader)
                    Text(overview?.host ?? "المملكة العربية السعودية")
                        .font(SabqType.meta.font)
                        .foregroundStyle(.white.opacity(0.9))
                }
                Spacer()
                Image(systemName: "trophy.fill")
                    .font(SabqType.leadTitle.font)
                    .foregroundStyle(AcTheme.gold)
                    .accessibilityHidden(true)
            }

            if let champ = overview?.champion {
                Button { selectedTeam = AcTeamSelection(id: champ.team.id, name: champ.team.name) } label: {
                    HStack(spacing: SabqLayout.space12) {
                        AcTeamLogo(team: champ.team, size: 40, ring: .clear)
                        VStack(alignment: .leading, spacing: 2) {
                            Text("البطل").font(SabqFonts.app(size: 12)).foregroundStyle(.white.opacity(0.9))
                            Text(champ.team.name).sabqText(SabqType.rowTitle).foregroundStyle(.white)
                        }
                        Spacer()
                    }
                    .contentShape(Rectangle())
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
                        .font(SabqType.meta.font)
                        .foregroundStyle(.white.opacity(0.9))
                    Spacer()
                    Text(AcFormat.countdown(to: Int(date.timeIntervalSince1970)))
                        .font(SabqType.sectionHeading.font.monospacedDigit())
                        .foregroundStyle(AcTheme.gold)
                        .environment(\.layoutDirection, .leftToRight)
                }
            }

            if let saudi = overview?.saudi.team {
                Button { selectedTeam = AcTeamSelection(id: saudi.id, name: saudi.name) } label: {
                    HStack(spacing: SabqLayout.space8) {
                        AcTeamLogo(team: saudi, size: 28, ring: .clear)
                        Text("الأخضر")
                            .font(SabqType.metaEmphasis.font)
                            .foregroundStyle(.white)
                        if let g = overview?.saudi.group {
                            Text("· \(g)")
                                .font(SabqType.meta.font)
                                .foregroundStyle(.white.opacity(0.9))
                        }
                        Spacer()
                        Image(systemName: "chevron.left")
                            .font(SabqType.tag.font)
                            .foregroundStyle(.white.opacity(0.9))
                            .accessibilityHidden(true)
                    }
                    .padding(.horizontal, SabqLayout.space12)
                    .frame(minHeight: SabqLayout.touchTarget)
                    .background(RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous).fill(.white.opacity(0.12)))
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
        .padding(SabqLayout.space16)
        .background(AcStyle.accentFill, in: RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous))
    }

    private var featuredFixture: AcFixture? {
        if let live = fixtures.first(where: { $0.status.live }) { return live }
        return overview?.nextMatch
    }

    private func featuredMatch(_ fx: AcFixture) -> some View {
        HStack(spacing: SabqLayout.space12) {
            teamCol(fx.home)
            VStack(spacing: SabqLayout.space4) {
                if fx.started {
                    // الضيف أولًا داخل LTR ليقع هدف المضيف يمينًا تحت شعاره.
                    Text("\(fx.goals.away ?? 0) – \(fx.goals.home ?? 0)")
                        .font(SabqType.articleTitle.font.monospacedDigit())
                        .foregroundStyle(.white)
                        .environment(\.layoutDirection, .leftToRight)
                } else {
                    Text(AcFormat.time(fx))
                        .font(SabqType.sectionHeading.font)
                        .foregroundStyle(AcTheme.gold)
                }
                AcStatusPill(fixture: fx, onDark: true)
                Text(fx.round)
                    .font(SabqFonts.app(size: 12))
                    .foregroundStyle(.white.opacity(0.9))
                    .multilineTextAlignment(.center)
            }
            .frame(maxWidth: .infinity)
            teamCol(fx.away)
        }
        .padding(.vertical, SabqLayout.space12)
        .padding(.horizontal, SabqLayout.space8)
        .background(RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous).fill(.white.opacity(0.1)))
    }

    private func teamCol(_ team: AcTeam) -> some View {
        VStack(spacing: SabqLayout.space8) {
            AcTeamLogo(team: team, size: 44, ring: .clear)
            Text(team.name)
                .font(SabqType.metaEmphasis.font)
                .foregroundStyle(.white)
                .lineLimit(1)
                .frame(width: 80)
        }
    }

    // MARK: Sections

    private func factsBlock(_ facts: AcFacts) -> some View {
        VStack(alignment: .leading, spacing: SabqLayout.space12) {
            AcSectionHeader(icon: "sparkles", title: "حقائق البطولة", subtitle: "")
            HStack(spacing: SabqLayout.space8) {
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
        }
    }

    private var matchesSection: some View {
        VStack(alignment: .leading, spacing: SabqLayout.space8) {
            AcSectionHeader(icon: "calendar", title: "المباريات", subtitle: "")
            if fixturesLoading {
                AcLoading()
            } else if fixtures.isEmpty {
                acEmptyText("جدول المباريات يظهر عند اعتماده")
            } else {
                matchList(Array(fixtures.prefix(12)))
            }
        }
    }

    /// قائمة مباريات بلا صناديق: صفوف تفصلها خطوط رفيعة.
    private func matchList(_ list: [AcFixture]) -> some View {
        VStack(spacing: 0) {
            ForEach(Array(list.enumerated()), id: \.element.id) { index, fx in
                if index > 0 { AcRowDivider() }
                Button { selectedMatch = AcMatchSelection(id: fx.id) } label: {
                    matchRow(fx)
                }
                .buttonStyle(.plain)
            }
        }
    }

    private func matchRow(_ fx: AcFixture) -> some View {
        HStack(spacing: SabqLayout.space8) {
            AcTeamLogo(team: fx.home, size: 28)
            Text(fx.home.name)
                .font(SabqType.excerpt.font)
                .foregroundStyle(SabqTheme.textPrimary)
                .lineLimit(1)
                .frame(maxWidth: .infinity, alignment: .leading)
            VStack(spacing: SabqLayout.space4) {
                if fx.started {
                    // الضيف أولًا داخل LTR ليقع هدف المضيف يمينًا.
                    Text("\(fx.goals.away ?? 0)–\(fx.goals.home ?? 0)")
                        .font(SabqType.rowTitle.font.monospacedDigit())
                        .foregroundStyle(SabqTheme.textPrimary)
                        .environment(\.layoutDirection, .leftToRight)
                }
                AcStatusPill(fixture: fx)
            }
            .frame(minWidth: 72)
            Text(fx.away.name)
                .font(SabqType.excerpt.font)
                .foregroundStyle(SabqTheme.textPrimary)
                .lineLimit(1)
                .frame(maxWidth: .infinity, alignment: .trailing)
            AcTeamLogo(team: fx.away, size: 28)
        }
        .padding(.vertical, SabqLayout.space12)
        .frame(minHeight: SabqLayout.touchTarget)
        .contentShape(Rectangle())
    }

    private var groupsSection: some View {
        VStack(alignment: .leading, spacing: SabqLayout.space16) {
            AcSectionHeader(icon: "list.number", title: "المجموعات", subtitle: "")
            ForEach(groups) { g in
                VStack(alignment: .leading, spacing: 0) {
                    Text(g.name)
                        .font(SabqType.metaEmphasis.font)
                        .foregroundStyle(AcStyle.accent)
                        .padding(.bottom, SabqLayout.space4)
                    ForEach(Array(g.rows.enumerated()), id: \.element.id) { index, row in
                        if index > 0 { AcRowDivider() }
                        Button {
                            selectedTeam = AcTeamSelection(id: row.team.id, name: row.team.name)
                        } label: {
                            HStack(spacing: SabqLayout.space8) {
                                Text("\(row.rank)")
                                    .font(SabqType.meta.font.monospacedDigit())
                                    .foregroundStyle(SabqTheme.textSecondary)
                                    .frame(width: 20)
                                AcTeamLogo(team: row.team, size: 24)
                                Text(row.team.name)
                                    .font(SabqType.excerpt.font)
                                    .foregroundStyle(SabqTheme.textPrimary)
                                    .lineLimit(1)
                                Spacer()
                                Text("\(row.points)")
                                    .font(SabqType.rowTitle.font.monospacedDigit())
                                    .foregroundStyle(AcStyle.accent)
                            }
                            .padding(.vertical, SabqLayout.space8)
                            .frame(minHeight: SabqLayout.touchTarget)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
    }

    private func bracketSection(_ bracket: AcBracket) -> some View {
        VStack(alignment: .leading, spacing: SabqLayout.space16) {
            AcSectionHeader(icon: "flowchart", title: "شجرة الأدوار", subtitle: "")
            ForEach(bracket.rounds) { round in
                VStack(alignment: .leading, spacing: SabqLayout.space4) {
                    Text(round.round)
                        .font(SabqType.metaEmphasis.font)
                        .foregroundStyle(SabqTheme.textSecondary)
                    matchList(round.matches)
                }
            }
        }
    }

    private var teamsSection: some View {
        VStack(alignment: .leading, spacing: SabqLayout.space16) {
            AcSectionHeader(icon: "flag.2.crossed", title: "المنتخبات", subtitle: "")
            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible()), GridItem(.flexible())], spacing: SabqLayout.space16) {
                ForEach(teams) { team in
                    Button { selectedTeam = AcTeamSelection(id: team.id, name: team.name) } label: {
                        VStack(spacing: SabqLayout.space8) {
                            AcTeamLogo(team: team, size: 48)
                            Text(team.name)
                                .font(SabqType.metaEmphasis.font)
                                .foregroundStyle(SabqTheme.textPrimary)
                                .lineLimit(1)
                            if let r = team.fifaRank {
                                Text("فيفا \(r)")
                                    .font(SabqFonts.app(size: 12))
                                    .foregroundStyle(SabqTheme.textSecondary)
                            }
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, SabqLayout.space8)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
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
