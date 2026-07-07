import SwiftUI

// تفاصيل بطولة — «كل شيء عن البطولة» من كل اشتراكاتنا، مرتّبًا حسب طبيعتها:
// الدوري يبرز الترتيب والسباقات، الكأس يبرز الأدوار والمواعيد، والبطولات الخاصة
// مثل كأس العالم تحتفظ بمساراتها. تُخفى التبويبات الفارغة تلقائيًا.
struct CompetitionDetailView: View {
    /// لون صفحة البطولة يتبع لون التطبيق المحوري.
    private var acc: Color { SpTheme.compAccent(comp.slug) }

    let comp: SpCompetition

    private enum Segment: String, CaseIterable {
        case overview, groups, standings, matches, bracket, scorers, assists, cards, transfers
        var label: String {
            switch self {
            case .overview: return "نظرة"
            case .groups: return "المجموعات"
            case .standings: return "الترتيب"
            case .bracket: return "الأدوار"
            case .scorers: return "الهدّافون"
            case .assists: return "الصنّاع"
            case .cards: return "البطاقات"
            case .matches: return "المباريات"
            case .transfers: return "الانتقالات"
            }
        }
    }

    @State private var segment: Segment = .overview
    @State private var matches: SpMatchesResponse?
    @State private var standings: [SpStandingRow] = []
    @State private var scorers: [SpScorer] = []
    @State private var assists: [SpScorer] = []
    @State private var outlook: SpOutlook?
    @State private var insights: SpLeagueInsightsResponse?
    @State private var leagueTransfers: [SpLeagueTransfer] = []
    @State private var wcFixtures: [SpWcFixture] = []
    @State private var wcGroups: [SpWcGroup] = []
    @State private var wcBracket: SpWcBracket?
    @State private var wcScorers: [SpWcScorer] = []
    @State private var wcAssists: [SpWcLeader] = []
    @State private var wcCards: [SpWcLeader] = []
    @State private var loading = true
    @State private var loadError: String?
    @State private var selectedTeam: IDBox?
    @State private var selectedPlayer: IDBox?

    private var isWorldCup: Bool { comp.slug == "world-cup" }
    private var supportsTransfers: Bool { comp.slug == SportsConstants.defaultComp }
    private var competitionKindLabel: String {
        comp.type == "cup" ? "كأس" : "دوري"
    }
    private var competitionSummarySubtitle: String {
        comp.type == "cup"
            ? "الأدوار والمواعيد من جدول البطولة"
            : "الترتيب والمباريات من الاشتراكات المتاحة"
    }

    private var hasWcBracket: Bool {
        if let cols = wcBracket?.tree?.columns, !cols.isEmpty { return true }
        return !(wcBracket?.rounds ?? []).isEmpty
    }

    private var segments: [Segment] {
        if isWorldCup {
            var s: [Segment] = [.overview]
            if !wcGroups.isEmpty { s.append(.groups) }
            s.append(.matches)
            if hasWcBracket { s.append(.bracket) }
            if !wcScorers.isEmpty { s.append(.scorers) }
            if !wcAssists.isEmpty { s.append(.assists) }
            if !wcCards.isEmpty { s.append(.cards) }
            return s
        }
        var s: [Segment] = [.overview]
        if comp.hasStandings && !standings.isEmpty { s.append(.standings) }
        if !scorers.isEmpty { s.append(.scorers) }
        if !assists.isEmpty { s.append(.assists) }
        s.append(.matches)
        if supportsTransfers && !leagueTransfers.isEmpty { s.append(.transfers) }
        return s
    }
    private var effectiveSegment: Segment { segments.contains(segment) ? segment : .overview }
    private var seasonValue: Int? { outlook?.season ?? comp.season }
    private var regularFixtures: [SpFixture] {
        guard let matches else { return [] }
        return matches.live + matches.today + matches.upcoming + matches.results
    }
    private var futureFixtures: [SpFixture] {
        regularFixtures
            .filter { !$0.status.live && !$0.status.finished }
            .sorted { $0.timestamp < $1.timestamp }
    }
    private var resultFixtures: [SpFixture] {
        regularFixtures
            .filter { $0.status.finished }
            .sorted { $0.timestamp > $1.timestamp }
    }
    private var participatingTeamsCount: Int {
        Set(regularFixtures.flatMap { [$0.home.id, $0.away.id] }).count
    }

    // أي بيانات وصلت من أيّ نداء — لا نحجب الصفحة كلها لأنّ نداءً واحدًا فشل.
    private var hasAnyData: Bool {
        matches != nil || !standings.isEmpty || !scorers.isEmpty
            || !assists.isEmpty || outlook != nil || insights != nil || !leagueTransfers.isEmpty
            || !wcFixtures.isEmpty || !wcGroups.isEmpty || wcBracket != nil
            || !wcScorers.isEmpty || !wcAssists.isEmpty || !wcCards.isEmpty
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                hero
                if loading && !hasAnyData {
                    SpLoading().padding(.top, 20)
                } else if let loadError, !hasAnyData {
                    SpEmptyState(icon: "wifi.exclamationmark", title: "تعذّر التحميل", subtitle: loadError)
                } else {
                    tabBar
                    Group {
                        switch effectiveSegment {
                        case .overview: overviewContent
                        case .groups: wcGroupsContent
                        case .standings: standingsContent
                        case .bracket: wcBracketContent
                        case .scorers: scorersContent
                        case .assists: assistsContent
                        case .cards: wcCardsContent
                        case .matches: matchesContent
                        case .transfers: transfersContent
                        }
                    }
                    .padding(.horizontal, 16)
                }
            }
            .padding(.vertical, 8).padding(.bottom, 24)
        }
        .background(SpAmbientBackground())
        .navigationTitle(comp.name)
        .navigationBarTitleDisplayMode(.inline)
        .task { await loadAll() }
        .refreshable { await loadAll(force: true) }
        .navigationDestination(item: $selectedTeam) { box in SpTeamPage(teamId: box.id) }
        .navigationDestination(item: $selectedPlayer) { box in SpPlayerPage(playerId: box.id) }
    }

    // MARK: - الترويسة البطلة

    // ترويسة بطاقة بيضاء نظيفة (بدل كتلة التدرّج + التوهّج الذهبي) — لمسة محورية
    // في الحالة فقط، نصوص حبر داكن على أبيض.
    private var hero: some View {
        HStack(spacing: 14) {
            compLogo
            VStack(alignment: .leading, spacing: 6) {
                Text(comp.name).font(SportsFonts.app(size: 22, weight: .heavy)).foregroundStyle(SpTheme.onDark).lineLimit(2)
                HStack(spacing: 8) {
                    if let s = seasonValue {
                        Label(seasonLabel(s), systemImage: "calendar")
                            .font(SportsFonts.app(size: 12, weight: .semibold)).foregroundStyle(SpTheme.onDarkDim)
                            .labelStyle(.titleAndIcon)
                            .environment(\.layoutDirection, .leftToRight)
                    }
                    statusBadge
                }
                if !standings.isEmpty {
                    Label("\(standings.count) ناديًا", systemImage: "person.3.fill")
                        .font(SportsFonts.app(size: 12)).foregroundStyle(SpTheme.onDarkFaint)
                        .labelStyle(.titleAndIcon)
                } else if isWorldCup && !wcGroups.isEmpty {
                    Label("\(wcGroups.reduce(0) { $0 + $1.rows.count }) منتخبًا", systemImage: "flag.fill")
                        .font(SportsFonts.app(size: 12)).foregroundStyle(SpTheme.onDarkFaint)
                        .labelStyle(.titleAndIcon)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 22, style: .continuous).fill(SpTheme.card)
                .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).stroke(SpTheme.cardStroke, lineWidth: 1))
        )
        .padding(.horizontal, 16)
    }

    private var compLogo: some View {
        Group {
            if comp.slug == SportsConstants.defaultComp {
                // دوري روشن — الشعار الرسمي (أصل محلّي).
                Image("RSLLogo").resizable().scaledToFit().padding(6)
            } else if comp.slug == SportsConstants.worldCupComp {
                Image("WorldCupLogo").resizable().scaledToFit()
            } else if let l = comp.logo, !l.isEmpty {
                // SpRemoteImage (كاش @State) بدل AsyncImage — يمنع وميض الشعار عند إعادة الرسم.
                SpRemoteImage(url: l)
                    .padding(8)
            } else {
                Image(systemName: "trophy.fill").font(.system(size: 24)).foregroundStyle(acc)
            }
        }
        .frame(width: comp.slug == SportsConstants.worldCupComp ? 48 : 64, height: 64)
        .background(Circle().fill(comp.slug == SportsConstants.defaultComp ? .white : (comp.slug == SportsConstants.worldCupComp ? Color.clear : SpTheme.chipFill)))
    }

    @ViewBuilder private var statusBadge: some View {
        // الحالة نص ملوّن هادئ بلا كبسولة — «منتهٍ» محايد لا ذهبي (ليس تميّزًا).
        let (text, color): (String, Color) = {
            switch comp.status {
            case "finished": return ("منتهٍ", SpTheme.onDarkFaint)
            case "ongoing": return ("جارٍ", SpTheme.green)
            case "upcoming": return ("قادم", acc)
            default: return ("", .clear)
            }
        }()
        if !text.isEmpty {
            Text(text)
                .font(SportsFonts.app(size: 10.5, weight: .bold)).foregroundStyle(color)
        }
    }

    private func seasonLabel(_ s: Int) -> String { "\(s)/\(s + 1)" }

    // MARK: - حبوب التبويب

    private var tabBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(segments, id: \.self) { s in
                    let active = s == effectiveSegment
                    Button { withAnimation(.easeInOut(duration: 0.2)) { segment = s } } label: {
                        Text(s.label)
                            .font(SportsFonts.app(size: 13, weight: .bold))
                            .foregroundStyle(active ? .white : SpTheme.onDarkDim)
                            .padding(.horizontal, 16).padding(.vertical, 8)
                            .background(Capsule().fill(active ? acc : SpTheme.chipFill))
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 16)
        }
    }

    // MARK: - نظرة شاملة

    @ViewBuilder private var overviewContent: some View {
        if isWorldCup {
            wcOverviewContent
        } else {
            VStack(alignment: .leading, spacing: 18) {
                if let champ = outlook?.champion { championBanner(champ) }
                quickFacts
                competitionDataSummary
                insightsHighlights
                if !standings.isEmpty { standingsPreview }
                topPerformers
                recentResults
            }
        }
    }

    private var wcOverviewContent: some View {
        VStack(alignment: .leading, spacing: 18) {
            wcFacts
            if !wcGroups.isEmpty { wcGroupsPreview }
            wcRacePreview
            wcRecentResults
        }
    }

    @ViewBuilder private var wcFacts: some View {
        let live = wcFixtures.filter { $0.status.live }.count
        let finished = wcFixtures.filter { $0.status.finished }.count
        let upcoming = wcFixtures.filter { !$0.status.live && !$0.status.finished }.count
        HStack(spacing: 8) {
            SpFactTile(value: "\(wcGroups.count)", label: "المجموعات", accent: acc)
            SpFactTile(value: "\(live)", label: "مباشر الآن", accent: live > 0 ? SpTheme.crimson : nil)
            SpFactTile(value: "\(finished)", label: "النتائج", accent: nil)
            SpFactTile(value: "\(upcoming)", label: "قادمة", accent: nil)
        }
    }

    private var wcGroupsPreview: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                HStack(spacing: 6) {
                    Image(systemName: "square.grid.2x2.fill").font(.system(size: 13)).foregroundStyle(acc)
                    Text("المجموعات").font(SportsFonts.app(size: 15, weight: .bold)).foregroundStyle(acc)
                }
                Spacer()
                Button { withAnimation { segment = .groups } } label: {
                    HStack(spacing: 3) {
                        Text("كل المجموعات").font(SportsFonts.app(size: 12, weight: .bold))
                        Image(systemName: "chevron.left").font(.system(size: 9, weight: .bold))
                    }
                    .foregroundStyle(acc)
                }
                .buttonStyle(.plain)
            }
            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
                ForEach(wcGroups.prefix(4)) { group in wcGroupCard(group, compact: true) }
            }
        }
    }

    @ViewBuilder private var wcRacePreview: some View {
        let scorer = wcScorers.first
        let assister = wcAssists.first
        if scorer != nil || assister != nil || !wcCards.isEmpty {
            VStack(alignment: .leading, spacing: 10) {
                SpSectionHeader(icon: "chart.bar.fill", title: "أرقام اللاعبين", count: nil, tint: acc)
                HStack(spacing: 10) {
                    if let s = scorer { wcScorerCard("الهداف", s, value: "\(s.goals)", unit: "هدف") }
                    if let a = assister { wcLeaderCard("صانع اللعب", a, value: "\(a.assists)", unit: "صناعة") }
                }
                if let c = wcCards.first {
                    wcLeaderLine(c, value: "\(c.yellow + c.red)", unit: "بطاقة", icon: "rectangle.fill.on.rectangle.fill")
                }
            }
        }
    }

    @ViewBuilder private var wcRecentResults: some View {
        let results = wcFixtures.filter { $0.status.finished }.sorted { $0.timestamp > $1.timestamp }
        if !results.isEmpty {
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    SpSectionHeader(icon: "checkmark.seal.fill", title: "آخر النتائج", count: min(results.count, 5), tint: acc)
                    Spacer()
                    Button { withAnimation { segment = .matches } } label: {
                        Text("كل المباريات").font(SportsFonts.app(size: 12, weight: .bold)).foregroundStyle(acc)
                    }
                    .buttonStyle(.plain)
                }
                Rectangle().fill(SpTheme.outline).frame(height: 1).padding(.top, 2)
                SpFlatMatchList(fixtures: results.prefix(5).map { SpFixture(worldCup: $0) })
            }
        }
    }

    private func championBanner(_ champ: SpOutlookChampion) -> some View {
        Button { selectedTeam = IDBox(id: champ.id) } label: {
            HStack(spacing: 14) {
                Image(systemName: "crown.fill").font(.system(size: 26)).foregroundStyle(SpTheme.gold)
                VStack(alignment: .leading, spacing: 3) {
                    Text(seasonValue.map { "بطل موسم \(seasonLabel($0))" } ?? "بطل الموسم")
                        .font(SportsFonts.app(size: 12, weight: .bold)).foregroundStyle(SpTheme.goldDeep)
                    Text(champ.name).font(SportsFonts.app(size: 20, weight: .heavy)).foregroundStyle(SpTheme.onDark).lineLimit(1)
                }
                Spacer(minLength: 0)
                SpTeamLogo(logo: champ.logo, size: 56)
            }
            .padding(16)
            // بطاقة بيضاء + تاج ونص ذهبيان + حدّ ذهبي شعري — الذهبي لمسة تتويج
            // (بطل = التميّز الشرعي) لا خلفية تدرّج كبيرة.
            .background(RoundedRectangle(cornerRadius: 20, style: .continuous).fill(SpTheme.card))
            .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).stroke(SpTheme.gold.opacity(0.45), lineWidth: 1))
        }
        .buttonStyle(SpPressStyle())
    }

    @ViewBuilder private var quickFacts: some View {
        // أهداف/صناعة المتصدّر حُذفا — يعرضهما قسم «أبرز اللاعبين» أدناه أغنى.
        let facts: [(value: String, label: String, accent: Color?)] = [
            seasonValue.map { (seasonLabel($0), "الموسم", acc as Color?) },
            (competitionKindLabel, "النوع", nil),
            standings.isEmpty ? nil : ("\(standings.count)", "الأندية", nil),
        ].compactMap { $0 }
        if !facts.isEmpty {
            HStack(spacing: 8) {
                ForEach(facts, id: \.label) { f in SpFactTile(value: f.value, label: f.label, accent: f.accent) }
            }
        }
    }

    @ViewBuilder private var competitionDataSummary: some View {
        if (matches != nil && !regularFixtures.isEmpty) || insights?.featured != nil {
            VStack(alignment: .leading, spacing: 12) {
                SpSectionHeader(
                    icon: comp.type == "cup" ? "trophy.fill" : "chart.bar.doc.horizontal",
                    title: "ملخص البطولة",
                    subtitle: competitionSummarySubtitle,
                    tint: acc
                )

                if !regularFixtures.isEmpty {
                    HStack(spacing: 8) {
                        if participatingTeamsCount > 0 {
                            SpFactTile(value: "\(participatingTeamsCount)", label: comp.type == "cup" ? "فريق مشارك" : "فريق", accent: nil)
                        }
                        SpFactTile(value: "\(futureFixtures.count)", label: "قادمة", accent: acc)
                        SpFactTile(value: "\(resultFixtures.count)", label: "نتائج", accent: nil)
                        if let next = futureFixtures.first {
                            SpFactTile(value: SpFormat.dayMonth(next.date), label: "أقرب موعد", accent: acc)
                        }
                    }

                } else if let providers = insights?.providers, !providers.isEmpty {
                    HStack(spacing: 8) {
                        ForEach(providers.prefix(3)) { provider in
                            SpFactTile(
                                value: provider.available ? "متاح" : "غير متاح",
                                label: provider.label,
                                accent: provider.available ? acc : nil
                            )
                        }
                    }
                }

                if let next = futureFixtures.first ?? insights?.featured?.fixture {
                    nextMatchCard(next)
                }

                if comp.type == "cup" {
                    cupRoundsPreview
                }
            }
        }
    }

    @ViewBuilder private var insightsHighlights: some View {
        if let insights, !insights.signals.isEmpty {
            VStack(alignment: .leading, spacing: 10) {
                SpSectionHeader(
                    icon: "sparkles",
                    title: "إشارات البطولة",
                    subtitle: insights.summary?.subtitle,
                    count: min(insights.signals.count, 6),
                    tint: acc
                )
                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
                    ForEach(insights.signals.prefix(6)) { signal in
                        insightSignalCard(signal)
                    }
                }
            }
        } else if regularFixtures.isEmpty && standings.isEmpty && scorers.isEmpty && assists.isEmpty {
            VStack(alignment: .leading, spacing: 10) {
                SpSectionHeader(
                    icon: "externaldrive.badge.icloud",
                    title: "بيانات البطولة",
                    subtitle: "ستظهر المباريات والأرقام من الاشتراكات فور توفرها",
                    tint: acc
                )
                if let providers = insights?.providers, !providers.isEmpty {
                    VStack(spacing: 0) {
                        ForEach(Array(providers.enumerated()), id: \.element.id) { idx, provider in
                            if idx > 0 { Rectangle().fill(SpTheme.outline.opacity(0.55)).frame(height: 1) }
                            providerRow(provider)
                        }
                    }
                    .padding(.horizontal, 12)
                    .background(tileBg)
                }
            }
        }
    }

    private func insightSignalCard(_ signal: SpLeagueSignal) -> some View {
        Button {
            if let playerId = signal.playerId {
                selectedPlayer = IDBox(id: playerId)
            } else if let teamId = signal.teamId {
                selectedTeam = IDBox(id: teamId)
            }
        } label: {
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 7) {
                    if let logo = signal.logo, !logo.isEmpty {
                        SpTeamLogo(logo: logo, size: 24)
                    } else {
                        Image(systemName: "chart.line.uptrend.xyaxis")
                            .font(.system(size: 14, weight: .bold))
                            .foregroundStyle(acc)
                            .frame(width: 24, height: 24)
                            .background(Circle().fill(acc.opacity(0.10)))
                    }
                    Text(signal.label)
                        .font(SportsFonts.app(size: 10.5, weight: .bold))
                        .foregroundStyle(acc)
                        .lineLimit(1)
                }
                Text(signal.title)
                    .font(SportsFonts.app(size: 13.5, weight: .heavy))
                    .foregroundStyle(SpTheme.onDark)
                    .lineLimit(1)
                    .minimumScaleFactor(0.75)
                Text(signal.value)
                    .font(SportsFonts.app(size: 15, weight: .heavy))
                    .foregroundStyle(SpTheme.onDarkStrong)
                    .lineLimit(1)
                if let subtitle = signal.subtitle, !subtitle.isEmpty {
                    Text(subtitle)
                        .font(SportsFonts.app(size: 10.5, weight: .semibold))
                        .foregroundStyle(SpTheme.onDarkDim)
                        .lineLimit(1)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(12)
            .background(tileBg)
        }
        .buttonStyle(SpPressStyle())
    }

    private func providerRow(_ provider: SpLeagueProvider) -> some View {
        HStack(spacing: 10) {
            Image(systemName: provider.available ? "checkmark.circle.fill" : "minus.circle")
                .font(.system(size: 15, weight: .bold))
                .foregroundStyle(provider.available ? acc : SpTheme.onDarkFaint)
            VStack(alignment: .leading, spacing: 2) {
                Text(provider.label)
                    .font(SportsFonts.app(size: 12.5, weight: .bold))
                    .foregroundStyle(SpTheme.onDark)
                if let summary = provider.summary, !summary.isEmpty {
                    Text(summary)
                        .font(SportsFonts.app(size: 10.5, weight: .semibold))
                        .foregroundStyle(SpTheme.onDarkDim)
                        .lineLimit(1)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(.vertical, 9)
    }

    private func nextMatchCard(_ fixture: SpFixture) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 7) {
                Image(systemName: "clock.fill")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundStyle(acc)
                Text("أقرب مباراة")
                    .font(SportsFonts.app(size: 13, weight: .heavy))
                    .foregroundStyle(SpTheme.onDark)
                Spacer(minLength: 0)
                Text(SpFormat.kickoffDay(fixture.date))
                    .font(SportsFonts.app(size: 11, weight: .bold))
                    .foregroundStyle(SpTheme.onDarkDim)
                    .lineLimit(1)
            }
            SpFlatMatchRow(fixture: fixture)
        }
        .padding(12)
        .background(cardBg)
    }

    @ViewBuilder private var cupRoundsPreview: some View {
        let groups = roundGroups(from: futureFixtures)
        if !groups.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 7) {
                    Image(systemName: "list.bullet.rectangle")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundStyle(acc)
                    Text("الأدوار القادمة")
                        .font(SportsFonts.app(size: 13, weight: .heavy))
                        .foregroundStyle(SpTheme.onDark)
                    Spacer(minLength: 0)
                }
                VStack(spacing: 0) {
                    ForEach(Array(groups.prefix(4).enumerated()), id: \.element.round) { idx, group in
                        if idx > 0 {
                            Rectangle().fill(SpTheme.outline.opacity(0.55)).frame(height: 1)
                        }
                        HStack(spacing: 10) {
                            Text(group.round)
                                .font(SportsFonts.app(size: 12.5, weight: .bold))
                                .foregroundStyle(SpTheme.onDark)
                                .lineLimit(1)
                            Spacer(minLength: 0)
                            Text("\(group.fixtures.count) مباراة")
                                .font(SportsFonts.app(size: 11, weight: .semibold))
                                .foregroundStyle(SpTheme.onDarkDim)
                            if let first = group.fixtures.first {
                                Text(SpFormat.dayMonth(first.date))
                                    .font(SportsFonts.app(size: 11, weight: .bold))
                                    .foregroundStyle(acc)
                                    .lineLimit(1)
                            }
                        }
                        .padding(.vertical, 9)
                    }
                }
                .padding(.horizontal, 12)
                .background(tileBg)
            }
        }
    }

    private func roundGroups(from fixtures: [SpFixture]) -> [(round: String, fixtures: [SpFixture])] {
        let groups = Dictionary(grouping: fixtures) { fixture in
            fixture.round.isEmpty ? "الدور القادم" : fixture.round
        }
        return groups
            .map { (round: $0.key, fixtures: $0.value.sorted { $0.timestamp < $1.timestamp }) }
            .sorted {
                let left = $0.fixtures.first?.timestamp ?? Int.max
                let right = $1.fixtures.first?.timestamp ?? Int.max
                if left != right { return left < right }
                return $0.round < $1.round
            }
    }

    // مقتطف الترتيب (أعلى ٥) + زرّ للترتيب الكامل
    private var standingsPreview: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                HStack(spacing: 6) {
                    Image(systemName: "list.number").font(.system(size: 13)).foregroundStyle(acc)
                    Text("الترتيب").font(SportsFonts.app(size: 15, weight: .bold)).foregroundStyle(acc)
                }
                Spacer()
                Button { withAnimation { segment = .standings } } label: {
                    HStack(spacing: 3) {
                        Text("الترتيب الكامل").font(SportsFonts.app(size: 12, weight: .bold))
                        Image(systemName: "chevron.left").font(.system(size: 9, weight: .bold))
                    }
                    .foregroundStyle(acc)
                }
                .buttonStyle(.plain)
            }
            VStack(spacing: 0) {
                ForEach(Array(standings.prefix(5).enumerated()), id: \.element.id) { idx, row in
                    if idx > 0 { Rectangle().fill(SpTheme.outline.opacity(0.5)).frame(height: 1).padding(.leading, 16) }
                    Button { selectedTeam = IDBox(id: row.team.id) } label: { standingRow(row) }.buttonStyle(.plain)
                }
            }
            .padding(.vertical, 6).background(cardBg)
        }
    }

    // هدّاف البطولة + صانعها
    @ViewBuilder private var topPerformers: some View {
        let scorer = scorers.first
        let assister = assists.first
        if scorer != nil || assister != nil {
            HStack(spacing: 10) {
                if let s = scorer { performerCard("هدّاف البطولة", s, value: "\(s.goals)", unit: "هدف") }
                if let a = assister { performerCard("صانع البطولة", a, value: "\(a.assists)", unit: "صناعة") }
            }
        }
    }

    private func performerCard(_ title: String, _ p: SpScorer, value: String, unit: String) -> some View {
        Button { selectedPlayer = IDBox(id: p.id) } label: {
            VStack(alignment: .leading, spacing: 8) {
                Text(title).font(SportsFonts.app(size: 11, weight: .bold)).foregroundStyle(acc)
                HStack(spacing: 10) {
                    photoCircle(p.photo, size: 44, fallback: "person.fill")
                    VStack(alignment: .leading, spacing: 2) {
                        Text(p.name).font(SportsFonts.app(size: 14, weight: .heavy)).foregroundStyle(SpTheme.onDark).lineLimit(1)
                        Text(p.team.name).font(SportsFonts.app(size: 10)).foregroundStyle(SpTheme.onDarkDim).lineLimit(1)
                    }
                    Spacer(minLength: 0)
                }
                HStack(alignment: .firstTextBaseline, spacing: 4) {
                    Text(value).font(SportsFonts.app(size: 24, weight: .heavy)).foregroundStyle(acc).monospacedDigit()
                        .environment(\.layoutDirection, .leftToRight)
                    Text(unit).font(SportsFonts.app(size: 11)).foregroundStyle(SpTheme.onDarkFaint)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(14).background(cardBg)
        }
        .buttonStyle(SpPressStyle())
    }

    // آخر النتائج (مقتطف)
    @ViewBuilder private var recentResults: some View {
        let results = matches?.results ?? []
        if !results.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    HStack(spacing: 6) {
                        Image(systemName: "checkmark.seal.fill").font(.system(size: 13)).foregroundStyle(acc)
                        Text("آخر النتائج").font(SportsFonts.app(size: 15, weight: .bold)).foregroundStyle(acc)
                    }
                    Spacer()
                    Button { withAnimation { segment = .matches } } label: {
                        HStack(spacing: 3) {
                            Text("كل المباريات").font(SportsFonts.app(size: 12, weight: .bold))
                            Image(systemName: "chevron.left").font(.system(size: 9, weight: .bold))
                        }
                        .foregroundStyle(acc)
                    }
                    .buttonStyle(.plain)
                }
                Rectangle().fill(SpTheme.outline).frame(height: 1).padding(.top, 2)
                SpFlatMatchList(fixtures: Array(results.suffix(5).reversed()))
            }
        }
    }

    // MARK: - كأس العالم: المجموعات / الأدوار / السباقات

    @ViewBuilder private var wcGroupsContent: some View {
        if wcGroups.isEmpty {
            SpEmptyState(icon: "square.grid.2x2", title: "لا تتوفر المجموعات", subtitle: "ستظهر فور تحديث بيانات البطولة")
        } else {
            LazyVGrid(columns: [GridItem(.flexible())], spacing: 12) {
                ForEach(wcGroups) { group in wcGroupCard(group, compact: false) }
            }
        }
    }

    private func wcGroupCard(_ group: SpWcGroup, compact: Bool) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(group.group)
                    .font(SportsFonts.app(size: compact ? 13 : 16, weight: .heavy))
                    .foregroundStyle(acc)
                Spacer(minLength: 0)
                if group.rows.contains(where: { $0.live == true }) {
                    Text("مباشر")
                        .font(SportsFonts.app(size: 10, weight: .bold))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 7).padding(.vertical, 2)
                        .background(Capsule().fill(SpTheme.crimson))
                }
            }
            VStack(spacing: 0) {
                ForEach(Array(group.rows.enumerated()), id: \.element.id) { idx, row in
                    if idx > 0 { Divider().overlay(SpTheme.outline.opacity(0.5)) }
                    wcGroupRow(row, compact: compact)
                }
            }
        }
        .padding(compact ? 10 : 14)
        .background(cardBg)
    }

    private func wcGroupRow(_ row: SpWcStandingRow, compact: Bool) -> some View {
        Button { selectedTeam = IDBox(id: row.team.id) } label: {
            HStack(spacing: compact ? 6 : 9) {
                Text("\(row.rank)")
                    .font(SportsFonts.app(size: 11, weight: .bold))
                    .foregroundStyle(row.rank <= 2 ? acc : SpTheme.onDarkFaint)
                    .frame(width: 18)
                SpTeamLogo(logo: row.team.logo, size: compact ? 18 : 24)
                Text(row.team.name)
                    .font(SportsFonts.app(size: compact ? 11.5 : 13, weight: row.rank <= 2 ? .bold : .semibold))
                    .foregroundStyle(SpTheme.onDark)
                    .lineLimit(1).minimumScaleFactor(0.78)
                Spacer(minLength: 0)
                Text("\(row.played)")
                    .font(SportsFonts.app(size: 11))
                    .foregroundStyle(SpTheme.onDarkFaint)
                    .monospacedDigit()
                    .frame(width: 22)
                Text("\(row.points)")
                    .font(SportsFonts.app(size: compact ? 12 : 14, weight: .heavy))
                    .foregroundStyle(SpTheme.onDark)
                    .monospacedDigit()
                    .frame(width: 28)
            }
            .padding(.vertical, compact ? 5 : 8)
        }
        .buttonStyle(.plain)
    }

    @ViewBuilder private var wcBracketContent: some View {
        if let tree = wcBracket?.tree, tree.hasAny != false, !tree.columns.isEmpty {
            SpWcBracketTreeView(tree: tree)
        } else {
            let rounds = wcBracket?.rounds ?? []
            if rounds.isEmpty {
                SpEmptyState(icon: "trophy", title: "الأدوار لم تكتمل", subtitle: "تظهر شجرة خروج المغلوب عند توفر مبارياتها")
            } else {
                VStack(alignment: .leading, spacing: 16) {
                    ForEach(rounds) { round in
                        VStack(alignment: .leading, spacing: 0) {
                            SpSectionHeader(icon: "trophy.fill", title: round.round, count: round.matches.count, tint: SpTheme.gold)
                            Rectangle().fill(SpTheme.outline).frame(height: 1).padding(.top, 8)
                            SpFlatMatchList(fixtures: round.matches.map { SpFixture(worldCup: $0) })
                        }
                    }
                }
            }
        }
    }

    @ViewBuilder private var wcCardsContent: some View {
        if wcCards.isEmpty {
            SpEmptyState(icon: "rectangle.fill.on.rectangle.fill", title: "لا تتوفر البطاقات", subtitle: "ستظهر بعد بداية مباريات البطولة")
        } else {
            VStack(spacing: 10) {
                ForEach(wcCards) { leader in
                    wcLeaderLine(leader, value: "\(leader.yellow + leader.red)", unit: "بطاقة", icon: "rectangle.fill.on.rectangle.fill")
                }
            }
        }
    }

    private func wcScorerCard(_ title: String, _ p: SpWcScorer, value: String, unit: String) -> some View {
        Button { selectedPlayer = IDBox(id: p.id) } label: {
            VStack(alignment: .leading, spacing: 8) {
                Text(title).font(SportsFonts.app(size: 11, weight: .bold)).foregroundStyle(acc)
                HStack(spacing: 10) {
                    photoCircle(p.photo, size: 42, fallback: "person.fill")
                    VStack(alignment: .leading, spacing: 2) {
                        Text(p.name).font(SportsFonts.app(size: 13.5, weight: .heavy)).foregroundStyle(SpTheme.onDark).lineLimit(1)
                        Text(p.team.name).font(SportsFonts.app(size: 10)).foregroundStyle(SpTheme.onDarkDim).lineLimit(1)
                    }
                    Spacer(minLength: 0)
                }
                HStack(alignment: .firstTextBaseline, spacing: 4) {
                    Text(value).font(SportsFonts.app(size: 22, weight: .heavy)).foregroundStyle(acc).monospacedDigit()
                    Text(unit).font(SportsFonts.app(size: 10.5)).foregroundStyle(SpTheme.onDarkFaint)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(14)
            .background(cardBg)
        }
        .buttonStyle(SpPressStyle())
    }

    private func wcLeaderCard(_ title: String, _ p: SpWcLeader, value: String, unit: String) -> some View {
        Button { selectedPlayer = IDBox(id: p.id) } label: {
            VStack(alignment: .leading, spacing: 8) {
                Text(title).font(SportsFonts.app(size: 11, weight: .bold)).foregroundStyle(acc)
                HStack(spacing: 10) {
                    photoCircle(p.photo, size: 42, fallback: "person.fill")
                    VStack(alignment: .leading, spacing: 2) {
                        Text(p.name).font(SportsFonts.app(size: 13.5, weight: .heavy)).foregroundStyle(SpTheme.onDark).lineLimit(1)
                        Text(p.team.name).font(SportsFonts.app(size: 10)).foregroundStyle(SpTheme.onDarkDim).lineLimit(1)
                    }
                    Spacer(minLength: 0)
                }
                HStack(alignment: .firstTextBaseline, spacing: 4) {
                    Text(value).font(SportsFonts.app(size: 22, weight: .heavy)).foregroundStyle(acc).monospacedDigit()
                    Text(unit).font(SportsFonts.app(size: 10.5)).foregroundStyle(SpTheme.onDarkFaint)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(14)
            .background(cardBg)
        }
        .buttonStyle(SpPressStyle())
    }

    private func wcLeaderLine(_ p: SpWcLeader, value: String, unit: String, icon: String) -> some View {
        Button { selectedPlayer = IDBox(id: p.id) } label: {
            HStack(spacing: 12) {
                Text("\(p.rank)")
                    .font(SportsFonts.app(size: 13, weight: .bold))
                    .foregroundStyle(p.rank <= 3 ? acc : SpTheme.onDarkFaint)
                    .frame(width: 22)
                photoCircle(p.photo, size: 38, fallback: "person.fill")
                VStack(alignment: .leading, spacing: 2) {
                    Text(p.name).font(SportsFonts.app(size: 14, weight: .bold)).foregroundStyle(SpTheme.onDark).lineLimit(1)
                    HStack(spacing: 6) {
                        SpTeamLogo(logo: p.team.logo, size: 14)
                        Text("\(p.yellow) صفراء · \(p.red) حمراء")
                            .font(SportsFonts.app(size: 11))
                            .foregroundStyle(SpTheme.onDarkDim)
                            .lineLimit(1)
                    }
                }
                Spacer(minLength: 0)
                VStack(spacing: 1) {
                    Image(systemName: icon).font(.system(size: 12, weight: .bold)).foregroundStyle(acc)
                    Text(value).font(SportsFonts.app(size: 17, weight: .heavy)).foregroundStyle(acc).monospacedDigit()
                    Text(unit).font(SportsFonts.app(size: 9)).foregroundStyle(SpTheme.onDarkFaint)
                }
            }
            .padding(12).background(tileBg)
        }
        .buttonStyle(SpPressStyle())
    }

    // MARK: - الترتيب (كامل)

    @ViewBuilder private var standingsContent: some View {
        if standings.isEmpty {
            SpEmptyState(icon: "list.number", title: "لا يتوفّر ترتيب", subtitle: "قد يكون الموسم لم يبدأ بعد")
        } else {
            VStack(spacing: 0) {
                standingsHeader
                ForEach(Array(standings.enumerated()), id: \.element.id) { idx, row in
                    if idx > 0 { Rectangle().fill(SpTheme.outline.opacity(0.5)).frame(height: 1).padding(.leading, 16) }
                    Button { selectedTeam = IDBox(id: row.team.id) } label: { standingRow(row, full: true) }.buttonStyle(.plain)
                }
            }
            .padding(.vertical, 8).background(cardBg)
        }
    }

    private var standingsHeader: some View {
        HStack(spacing: 0) {
            Text("#").font(SportsFonts.app(size: 10)).foregroundStyle(SpTheme.onDarkFaint).frame(width: 30)
            Text("النادي").font(SportsFonts.app(size: 10)).foregroundStyle(SpTheme.onDarkFaint)
                .frame(maxWidth: .infinity, alignment: .leading)
            Text("لعب").font(SportsFonts.app(size: 10)).foregroundStyle(SpTheme.onDarkFaint).frame(width: 36)
            Text("+/-").font(SportsFonts.app(size: 10)).foregroundStyle(SpTheme.onDarkFaint).frame(width: 40)
            Text("نقاط").font(SportsFonts.app(size: 10)).foregroundStyle(SpTheme.onDarkFaint).frame(width: 40)
        }
        .padding(.horizontal, 16).padding(.bottom, 6)
    }

    private func standingRow(_ row: SpStandingRow, full: Bool = false) -> some View {
        let isChampion = row.rank == 1
        return HStack(spacing: 0) {
            HStack(spacing: 3) {
                if isChampion {
                    Image(systemName: "crown.fill").font(.system(size: 9)).foregroundStyle(SpTheme.gold)
                }
                Text("\(row.rank)")
                    .font(SportsFonts.app(size: 12, weight: .bold))
                    .foregroundStyle(row.rank <= 3 ? acc : SpTheme.onDarkFaint)
                    .monospacedDigit()
            }
            .frame(width: 30)
            HStack(spacing: 10) {
                SpTeamLogo(logo: row.team.logo, size: 26)
                Text(row.team.name)
                    .font(SportsFonts.app(size: 13, weight: isChampion ? .heavy : .semibold))
                    .foregroundStyle(SpTheme.onDark).lineLimit(1).minimumScaleFactor(0.8)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            Text("\(row.played)").font(SportsFonts.app(size: 13)).foregroundStyle(SpTheme.onDarkDim).monospacedDigit().frame(width: 36)
            Text(diff(row)).font(SportsFonts.app(size: 13)).foregroundStyle(SpTheme.onDarkDim).monospacedDigit().frame(width: 40)
                .environment(\.layoutDirection, .leftToRight)
            Text("\(row.points)").font(SportsFonts.app(size: 15, weight: .bold)).foregroundStyle(SpTheme.onDark).monospacedDigit().frame(width: 40)
        }
        .padding(.horizontal, 16).padding(.vertical, 10)
        .background(isChampion ? SpTheme.gold.opacity(0.06) : .clear)
    }

    private func diff(_ row: SpStandingRow) -> String {
        row.goalsDiff > 0 ? "+\(row.goalsDiff)" : "\(row.goalsDiff)"
    }

    // MARK: - الهدّافون / الصنّاع

    @ViewBuilder private var scorersContent: some View {
        if isWorldCup {
            if wcScorers.isEmpty {
                SpEmptyState(icon: "soccerball", title: "لا يتوفّر هدّافون", subtitle: "ستظهر القائمة بعد بداية البطولة")
            } else {
                VStack(spacing: 10) {
                    ForEach(wcScorers) { s in
                        Button { selectedPlayer = IDBox(id: s.id) } label: {
                            wcScorerRow(s, value: s.goals, unit: "هدف", sub: "\(s.matches) مباراة · \(s.assists) صناعة")
                        }
                        .buttonStyle(SpPressStyle())
                    }
                }
            }
        } else if scorers.isEmpty {
            SpEmptyState(icon: "soccerball", title: "لا يتوفّر هدّافون", subtitle: "قد يكون الموسم لم يبدأ بعد")
        } else {
            VStack(spacing: 10) {
                ForEach(scorers) { s in
                    Button { selectedPlayer = IDBox(id: s.id) } label: { rankedRow(s, value: s.goals, unit: "هدف", sub: "\(s.matches) مباراة · \(s.assists) صناعة") }
                        .buttonStyle(SpPressStyle())
                }
            }
        }
    }

    @ViewBuilder private var assistsContent: some View {
        if isWorldCup {
            if wcAssists.isEmpty {
                SpEmptyState(icon: "hand.point.up.braille", title: "لا يتوفّر صنّاع", subtitle: "ستظهر القائمة بعد تسجيل أول صناعة")
            } else {
                VStack(spacing: 10) {
                    ForEach(wcAssists) { s in
                        wcLeaderLine(s, value: "\(s.assists)", unit: "صناعة", icon: "arrow.up.forward.circle.fill")
                    }
                }
            }
        } else if assists.isEmpty {
            SpEmptyState(icon: "hand.point.up.braille", title: "لا يتوفّر صنّاع", subtitle: "قد يكون الموسم لم يبدأ بعد")
        } else {
            VStack(spacing: 10) {
                ForEach(assists) { s in
                    Button { selectedPlayer = IDBox(id: s.id) } label: { rankedRow(s, value: s.assists, unit: "صناعة", sub: "\(s.matches) مباراة · \(s.goals) هدف") }
                        .buttonStyle(SpPressStyle())
                }
            }
        }
    }

    private func wcScorerRow(_ s: SpWcScorer, value: Int, unit: String, sub: String) -> some View {
        HStack(spacing: 12) {
            Text("\(s.rank)")
                .font(SportsFonts.app(size: 13, weight: .bold))
                .foregroundStyle(s.rank <= 3 ? acc : SpTheme.onDarkFaint).frame(width: 22)
            photoCircle(s.photo, size: 38, fallback: "person.fill")
            VStack(alignment: .leading, spacing: 2) {
                Text(s.name).font(SportsFonts.app(size: 14, weight: .bold)).foregroundStyle(SpTheme.onDark).lineLimit(1)
                HStack(spacing: 6) {
                    SpTeamLogo(logo: s.team.logo, size: 14)
                    Text(sub).font(SportsFonts.app(size: 11)).foregroundStyle(SpTheme.onDarkDim).lineLimit(1)
                }
            }
            Spacer(minLength: 0)
            VStack(spacing: 1) {
                Text("\(value)").font(SportsFonts.app(size: 18, weight: .heavy)).foregroundStyle(acc).monospacedDigit()
                Text(unit).font(SportsFonts.app(size: 9)).foregroundStyle(SpTheme.onDarkFaint)
            }
        }
        .padding(12).background(tileBg)
    }

    private func rankedRow(_ s: SpScorer, value: Int, unit: String, sub: String) -> some View {
        HStack(spacing: 12) {
            Text("\(s.rank)")
                .font(SportsFonts.app(size: 13, weight: .bold))
                .foregroundStyle(s.rank <= 3 ? acc : SpTheme.onDarkFaint).frame(width: 22)
            photoCircle(s.photo, size: 38, fallback: "person.fill")
            VStack(alignment: .leading, spacing: 2) {
                Text(s.name).font(SportsFonts.app(size: 14, weight: .bold)).foregroundStyle(SpTheme.onDark).lineLimit(1)
                HStack(spacing: 6) {
                    SpTeamLogo(logo: s.team.logo, size: 14)
                    Text(sub).font(SportsFonts.app(size: 11)).foregroundStyle(SpTheme.onDarkDim).lineLimit(1)
                }
            }
            Spacer(minLength: 0)
            VStack(spacing: 1) {
                Text("\(value)").font(SportsFonts.app(size: 18, weight: .heavy)).foregroundStyle(acc).monospacedDigit()
                Text(unit).font(SportsFonts.app(size: 9)).foregroundStyle(SpTheme.onDarkFaint)
            }
        }
        .padding(12).background(tileBg)
    }

    // MARK: - المباريات

    @ViewBuilder private var matchesContent: some View {
        if isWorldCup {
            wcMatchesContent
        } else if let m = matches {
            let hasAny = !(m.live.isEmpty && m.today.isEmpty && m.upcoming.isEmpty && m.results.isEmpty)
            if hasAny {
                VStack(alignment: .leading, spacing: 18) {
                    matchBucket("مباشر", m.live, tint: SpTheme.crimson, icon: "dot.radiowaves.left.and.right")
                    matchBucket("اليوم", m.today, tint: acc, icon: "calendar")
                    upcomingMatchBucket(m.upcoming, tint: acc, icon: "clock")
                    matchBucket("النتائج", Array(m.results.reversed()), tint: SpTheme.onDarkDim, icon: "checkmark.seal")
                }
            } else {
                SpEmptyState(icon: "sportscourt", title: "لا مباريات", subtitle: "لا توجد مباريات متاحة حاليًا لهذه البطولة")
            }
        } else {
            SpEmptyState(icon: "sportscourt", title: "تعذّر جلب المباريات", subtitle: "حاول التحديث بالسحب للأسفل")
        }
    }

    private var wcMatchesContent: some View {
        let now = Date()
        let live = wcFixtures.filter { $0.status.live }.sorted { $0.timestamp < $1.timestamp }
        let today = wcFixtures.filter {
            !$0.status.live && !$0.status.finished && Calendar(identifier: .gregorian).isDate(Date(timeIntervalSince1970: $0.timestamp), inSameDayAs: now)
        }.sorted { $0.timestamp < $1.timestamp }
        let upcoming = wcFixtures.filter { !$0.status.live && !$0.status.finished && Date(timeIntervalSince1970: $0.timestamp) > now }
            .sorted { $0.timestamp < $1.timestamp }
        let results = wcFixtures.filter { $0.status.finished }.sorted { $0.timestamp > $1.timestamp }

        return VStack(alignment: .leading, spacing: 18) {
            wcMatchBucket("مباشر", live, tint: SpTheme.crimson, icon: "dot.radiowaves.left.and.right")
            wcMatchBucket("اليوم", today, tint: acc, icon: "calendar")
            upcomingMatchBucket(upcoming.map { SpFixture(worldCup: $0) }, tint: acc, icon: "clock")
            wcMatchBucket("النتائج", results, tint: SpTheme.onDarkDim, icon: "checkmark.seal")
            if wcFixtures.isEmpty {
                SpEmptyState(icon: "sportscourt", title: "لا مباريات", subtitle: "لم تصل بيانات جدول كأس العالم بعد")
            }
        }
    }

    private struct MatchDayGroup: Identifiable {
        let date: Date
        let fixtures: [SpFixture]
        var id: TimeInterval { date.timeIntervalSince1970 }
    }

    private var matchCalendar: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "Asia/Riyadh") ?? .current
        calendar.locale = Locale(identifier: "ar-u-nu-latn")
        return calendar
    }

    private func dayGroups(_ fixtures: [SpFixture]) -> [MatchDayGroup] {
        let calendar = matchCalendar
        let grouped = Dictionary(grouping: fixtures) { fixture in
            calendar.startOfDay(for: fixture.kickoff)
        }
        return grouped
            .map { MatchDayGroup(date: $0.key, fixtures: $0.value.sorted { $0.timestamp < $1.timestamp }) }
            .sorted { $0.date < $1.date }
    }

    @ViewBuilder private func upcomingMatchBucket(_ items: [SpFixture], tint: Color, icon: String) -> some View {
        if !items.isEmpty {
            VStack(alignment: .leading, spacing: 0) {
                SpSectionHeader(icon: icon, title: "قادمة", count: items.count, tint: tint)
                Rectangle().fill(SpTheme.outline).frame(height: 1).padding(.top, 8)
                VStack(spacing: 14) {
                    ForEach(dayGroups(items)) { group in
                        VStack(spacing: 0) {
                            matchDayHeader(group.date, count: group.fixtures.count, tint: tint)
                            SpFlatMatchList(fixtures: group.fixtures)
                        }
                    }
                }
                .padding(.top, 10)
            }
        }
    }

    private func matchDayHeader(_ date: Date, count: Int, tint: Color) -> some View {
        HStack(spacing: 7) {
            Image(systemName: "calendar")
                .font(.system(size: 10.5, weight: .bold))
                .foregroundStyle(tint)
            Text(matchDayTitle(date))
                .font(SportsFonts.app(size: 12, weight: .heavy))
                .foregroundStyle(SpTheme.onDark)
            Text(count == 1 ? "مباراة" : "\(count) مباريات")
                .font(SportsFonts.app(size: 9.5, weight: .bold))
                .foregroundStyle(tint)
                .padding(.horizontal, 7)
                .padding(.vertical, 2)
                .background(Capsule().fill(tint.opacity(0.10)))
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 7)
        .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(tint.opacity(0.06)))
    }

    private func matchDayTitle(_ date: Date) -> String {
        let calendar = matchCalendar
        let today = calendar.startOfDay(for: Date())
        let day = calendar.startOfDay(for: date)
        let diff = calendar.dateComponents([.day], from: today, to: day).day ?? 0
        let dateText = SpFormat.dayMonthLabel(day)
        switch diff {
        case 0: return "اليوم \(dateText)"
        case 1: return "غدًا \(dateText)"
        case 2: return "بعد غد \(dateText)"
        default: return "\(SpFormat.weekdayName(day)) \(dateText)"
        }
    }

    @ViewBuilder private func wcMatchBucket(_ title: String, _ items: [SpWcFixture], tint: Color, icon: String) -> some View {
        if !items.isEmpty {
            VStack(alignment: .leading, spacing: 0) {
                SpSectionHeader(icon: icon, title: title, count: items.count, tint: tint)
                Rectangle().fill(SpTheme.outline).frame(height: 1).padding(.top, 8)
                SpFlatMatchList(fixtures: items.map { SpFixture(worldCup: $0) })
            }
        }
    }

    @ViewBuilder private func matchBucket(_ title: String, _ items: [SpFixture], tint: Color, icon: String) -> some View {
        if !items.isEmpty {
            VStack(alignment: .leading, spacing: 0) {
                SpSectionHeader(icon: icon, title: title, count: items.count, tint: tint)
                Rectangle().fill(SpTheme.outline).frame(height: 1).padding(.top, 8)
                SpFlatMatchList(fixtures: items)
            }
        }
    }

    // MARK: - الانتقالات (مستوى الدوري)

    @ViewBuilder private var transfersContent: some View {
        if leagueTransfers.isEmpty {
            SpEmptyState(icon: "arrow.left.arrow.right", title: "لا انتقالات", subtitle: "لا توجد صفقات معلنة حاليًا")
        } else {
            VStack(spacing: 10) {
                ForEach(leagueTransfers) { tr in transferRow(tr) }
            }
        }
    }

    private func transferRow(_ tr: SpLeagueTransfer) -> some View {
        HStack(spacing: 12) {
            photoCircle("", size: 38, fallback: "person.fill")
                .overlay(alignment: .bottomTrailing) {
                    SpTeamLogo(logo: tr.to.logo, size: 18).background(Circle().fill(.white)).offset(x: 2, y: 2)
                }
            VStack(alignment: .leading, spacing: 3) {
                Text(tr.player.name).font(SportsFonts.app(size: 14, weight: .bold)).foregroundStyle(SpTheme.onDark).lineLimit(1)
                HStack(spacing: 6) {
                    SpTeamLogo(logo: tr.from.logo, size: 16)
                    Text(tr.from.name).font(SportsFonts.app(size: 11)).foregroundStyle(SpTheme.onDarkDim).lineLimit(1)
                    Image(systemName: "arrow.left").font(.system(size: 9, weight: .bold)).foregroundStyle(acc)
                    SpTeamLogo(logo: tr.to.logo, size: 16)
                    Text(tr.to.name).font(SportsFonts.app(size: 11)).foregroundStyle(SpTheme.onDarkDim).lineLimit(1)
                }
            }
            Spacer(minLength: 0)
            if !tr.type.isEmpty {
                Text(tr.type)
                    .font(SportsFonts.app(size: 11, weight: .bold)).foregroundStyle(acc)
                    .lineLimit(1).environment(\.layoutDirection, .leftToRight)
            }
        }
        .padding(12).background(tileBg)
    }

    // MARK: - أسطح

    private var cardBg: some View {
        RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous).fill(SpTheme.card)
            .overlay(RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous).stroke(SpTheme.cardStroke.opacity(0.6), lineWidth: 1))
    }
    private var tileBg: some View {
        RoundedRectangle(cornerRadius: SpTheme.tileRadius, style: .continuous).fill(SpTheme.cardFill)
            .overlay(RoundedRectangle(cornerRadius: SpTheme.tileRadius, style: .continuous).stroke(SpTheme.cardStroke.opacity(0.6), lineWidth: 1))
    }

    // MARK: - التحميل (كل الاشتراكات)

    private func loadAll(force: Bool = false) async {
        if isWorldCup {
            await loadWorldCup(force: force)
            return
        }
        if !force { loading = true }

        async let standingsT: [SpStandingRow]? = comp.hasStandings
            ? (try? await APIClient.shared.fetchStandings(comp: comp.slug, ignoreCache: force))?.standings : nil
        async let scorersT: [SpScorer]? = comp.hasScorers
            ? (try? await APIClient.shared.fetchScorers(comp: comp.slug, ignoreCache: force))?.scorers : nil
        async let assistsT: [SpScorer]? = comp.hasScorers
            ? (try? await APIClient.shared.fetchAssists(comp: comp.slug, ignoreCache: force))?.assists : nil
        async let outlookT: SpOutlook?? = (try? await APIClient.shared.fetchOutlook(comp: comp.slug, ignoreCache: force))?.outlook
        async let insightsT: SpLeagueInsightsResponse? = try? await APIClient.shared.fetchLeagueInsights(comp: comp.slug, ignoreCache: force)
        async let transfersT: SpLeagueTransfersResponse? = supportsTransfers
            ? (try? await APIClient.shared.fetchLeagueTransfers(ignoreCache: force)) : nil

        do {
            self.matches = try await APIClient.shared.fetchMatches(comp: comp.slug, ignoreCache: force)
            self.loadError = nil
        } catch {
            self.loadError = error.localizedDescription
        }

        self.standings = (await standingsT) ?? []
        self.scorers = (await scorersT) ?? []
        self.assists = (await assistsT) ?? []
        self.outlook = (await outlookT) ?? nil
        self.insights = await insightsT
        let tr = await transfersT
        self.leagueTransfers = (tr?.topDeals ?? tr?.transfers) ?? []
        self.loading = false
    }

    private func loadWorldCup(force: Bool = false) async {
        if !force { loading = true }

        async let fixturesOpt = try? APIClient.shared.fetchWorldCupFixtures(ignoreCache: force)
        async let groupsOpt = try? APIClient.shared.fetchWorldCupStandings(ignoreCache: force)
        async let bracketOpt = try? APIClient.shared.fetchWorldCupBracket(ignoreCache: true)
        async let scorersOpt = try? APIClient.shared.fetchWorldCupScorers(ignoreCache: force)
        async let assistsOpt = try? APIClient.shared.fetchWorldCupAssists(ignoreCache: force)
        async let cardsOpt = try? APIClient.shared.fetchWorldCupCards(ignoreCache: force)

        let fixturesRes = await fixturesOpt
        let groupsRes = await groupsOpt
        let bracketRes = await bracketOpt
        let scorersRes = await scorersOpt
        let assistsRes = await assistsOpt
        let cardsRes = await cardsOpt

        self.wcFixtures = fixturesRes?.fixtures ?? []
        self.wcGroups = groupsRes?.groups ?? []
        self.wcBracket = bracketRes
        self.wcScorers = scorersRes?.scorers ?? []
        self.wcAssists = assistsRes?.leaders ?? []
        self.wcCards = cardsRes?.leaders ?? []
        self.loadError = hasAnyData ? nil : "تعذّر الاتصال بخادم بيانات كأس العالم"
        self.loading = false
    }
}
