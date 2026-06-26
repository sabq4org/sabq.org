import SwiftUI

// تفاصيل بطولة — «كل شيء عن البطولة» من كل اشتراكاتنا، مرتّبًا بالاستايل الأخير:
// ترويسة بطلة + حبوب تبويب أفقية + نظرة شاملة (بطل الموسم المنتهي، بلاطات حقائق،
// مقتطف الترتيب، هدّاف/صانع البطولة، آخر النتائج) ثم تبويبات الترتيب/الهدّافون/
// الصنّاع/المباريات/الانتقالات. تُخفى التبويبات الفارغة تلقائيًا.
struct CompetitionDetailView: View {
    let comp: SpCompetition

    private enum Segment: String, CaseIterable {
        case overview, standings, scorers, assists, matches, transfers
        var label: String {
            switch self {
            case .overview: return "نظرة"
            case .standings: return "الترتيب"
            case .scorers: return "الهدّافون"
            case .assists: return "الصنّاع"
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
    @State private var leagueTransfers: [SpLeagueTransfer] = []
    @State private var loading = true
    @State private var loadError: String?
    @State private var selectedTeam: IDBox?
    @State private var selectedPlayer: IDBox?

    private var segments: [Segment] {
        var s: [Segment] = [.overview]
        if comp.hasStandings && !standings.isEmpty { s.append(.standings) }
        if !scorers.isEmpty { s.append(.scorers) }
        if !assists.isEmpty { s.append(.assists) }
        s.append(.matches)
        if !leagueTransfers.isEmpty { s.append(.transfers) }
        return s
    }
    private var effectiveSegment: Segment { segments.contains(segment) ? segment : .overview }
    private var seasonValue: Int? { outlook?.season ?? comp.season }

    // أي بيانات وصلت من أيّ نداء — لا نحجب الصفحة كلها لأنّ نداءً واحدًا فشل.
    private var hasAnyData: Bool {
        matches != nil || !standings.isEmpty || !scorers.isEmpty
            || !assists.isEmpty || outlook != nil || !leagueTransfers.isEmpty
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
                        case .standings: standingsContent
                        case .scorers: scorersContent
                        case .assists: assistsContent
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

    private var hero: some View {
        HStack(spacing: 14) {
            compLogo
            VStack(alignment: .leading, spacing: 6) {
                Text(comp.name).font(SportsFonts.app(size: 22, weight: .heavy)).foregroundStyle(.white).lineLimit(2)
                HStack(spacing: 8) {
                    if let s = seasonValue {
                        Label(seasonLabel(s), systemImage: "calendar")
                            .font(SportsFonts.app(size: 12, weight: .semibold)).foregroundStyle(.white.opacity(0.9))
                            .labelStyle(.titleAndIcon)
                            .environment(\.layoutDirection, .leftToRight)
                    }
                    statusBadge
                }
                if !standings.isEmpty {
                    Label("\(standings.count) ناديًا", systemImage: "person.3.fill")
                        .font(SportsFonts.app(size: 12)).foregroundStyle(.white.opacity(0.75))
                        .labelStyle(.titleAndIcon)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            SpTheme.heroGradient
                .overlay(alignment: .topLeading) {
                    Circle().fill(SpTheme.gold.opacity(0.18))
                        .frame(width: 150, height: 150).blur(radius: 55).offset(x: -30, y: -50)
                }
        )
        .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
        .padding(.horizontal, 16)
    }

    private var compLogo: some View {
        Group {
            if let l = comp.logo, !l.isEmpty {
                AsyncImage(url: URL(string: l)) { phase in
                    if case .success(let img) = phase {
                        img.resizable().scaledToFit().padding(8)
                    } else {
                        Image(systemName: "trophy.fill").font(.system(size: 24)).foregroundStyle(.white.opacity(0.9))
                    }
                }
            } else {
                Image(systemName: "trophy.fill").font(.system(size: 24)).foregroundStyle(.white.opacity(0.9))
            }
        }
        .frame(width: 64, height: 64)
        .background(Circle().fill(.white.opacity(0.15)))
    }

    @ViewBuilder private var statusBadge: some View {
        let (text, color): (String, Color) = {
            switch comp.status {
            case "finished": return ("منتهٍ", SpTheme.gold)
            case "ongoing": return ("جارٍ", SpTheme.leaf)
            case "upcoming": return ("قادم", SpTheme.greenSoft)
            default: return ("", .clear)
            }
        }()
        if !text.isEmpty {
            Text(text)
                .font(SportsFonts.app(size: 10, weight: .bold)).foregroundStyle(.white)
                .padding(.horizontal, 8).padding(.vertical, 2)
                .background(Capsule().fill(color))
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
                            .background(Capsule().fill(active ? SpTheme.green : SpTheme.chipFill))
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 16)
        }
    }

    // MARK: - نظرة شاملة

    @ViewBuilder private var overviewContent: some View {
        VStack(alignment: .leading, spacing: 18) {
            if let champ = outlook?.champion { championBanner(champ) }
            quickFacts
            if !standings.isEmpty { standingsPreview }
            topPerformers
            recentResults
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
            .background(
                RoundedRectangle(cornerRadius: 20, style: .continuous)
                    .fill(LinearGradient(colors: [SpTheme.gold.opacity(0.16), SpTheme.goldSoft.opacity(0.10)],
                                         startPoint: .topTrailing, endPoint: .bottomLeading))
            )
            .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).stroke(SpTheme.gold.opacity(0.4), lineWidth: 1))
        }
        .buttonStyle(SpPressStyle())
    }

    @ViewBuilder private var quickFacts: some View {
        let topScorer = scorers.first
        let topAssister = assists.first
        let facts: [(value: String, label: String, accent: Color?)] = [
            seasonValue.map { (seasonLabel($0), "الموسم", SpTheme.green as Color?) },
            standings.isEmpty ? nil : ("\(standings.count)", "الأندية", nil),
            topScorer.map { ("\($0.goals)", "أهداف المتصدّر", nil) },
            topAssister.map { ("\($0.assists)", "صناعة المتصدّر", nil) },
        ].compactMap { $0 }
        if !facts.isEmpty {
            HStack(spacing: 8) {
                ForEach(facts, id: \.label) { f in SpFactTile(value: f.value, label: f.label, accent: f.accent) }
            }
        }
    }

    // مقتطف الترتيب (أعلى ٥) + زرّ للترتيب الكامل
    private var standingsPreview: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                HStack(spacing: 6) {
                    Image(systemName: "list.number").font(.system(size: 13)).foregroundStyle(SpTheme.green)
                    Text("الترتيب").font(SportsFonts.app(size: 15, weight: .bold)).foregroundStyle(SpTheme.green)
                }
                Spacer()
                Button { withAnimation { segment = .standings } } label: {
                    HStack(spacing: 3) {
                        Text("الترتيب الكامل").font(SportsFonts.app(size: 12, weight: .bold))
                        Image(systemName: "chevron.left").font(.system(size: 9, weight: .bold))
                    }
                    .foregroundStyle(SpTheme.green)
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
                Text(title).font(SportsFonts.app(size: 11, weight: .bold)).foregroundStyle(SpTheme.green)
                HStack(spacing: 10) {
                    photoCircle(p.photo, size: 44, fallback: "person.fill")
                    VStack(alignment: .leading, spacing: 2) {
                        Text(p.name).font(SportsFonts.app(size: 14, weight: .heavy)).foregroundStyle(SpTheme.onDark).lineLimit(1)
                        Text(p.team.name).font(SportsFonts.app(size: 10)).foregroundStyle(SpTheme.onDarkDim).lineLimit(1)
                    }
                    Spacer(minLength: 0)
                }
                HStack(alignment: .firstTextBaseline, spacing: 4) {
                    Text(value).font(SportsFonts.app(size: 24, weight: .heavy)).foregroundStyle(SpTheme.green).monospacedDigit()
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
                        Image(systemName: "checkmark.seal.fill").font(.system(size: 13)).foregroundStyle(SpTheme.green)
                        Text("آخر النتائج").font(SportsFonts.app(size: 15, weight: .bold)).foregroundStyle(SpTheme.green)
                    }
                    Spacer()
                    Button { withAnimation { segment = .matches } } label: {
                        HStack(spacing: 3) {
                            Text("كل المباريات").font(SportsFonts.app(size: 12, weight: .bold))
                            Image(systemName: "chevron.left").font(.system(size: 9, weight: .bold))
                        }
                        .foregroundStyle(SpTheme.green)
                    }
                    .buttonStyle(.plain)
                }
                ForEach(Array(results.suffix(5).reversed())) { f in SpMatchCard(fixture: f) }
            }
        }
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
                    .foregroundStyle(row.rank <= 3 ? SpTheme.green : SpTheme.onDarkFaint)
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
        if scorers.isEmpty {
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
        if assists.isEmpty {
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

    private func rankedRow(_ s: SpScorer, value: Int, unit: String, sub: String) -> some View {
        HStack(spacing: 12) {
            Text("\(s.rank)")
                .font(SportsFonts.app(size: 13, weight: .bold))
                .foregroundStyle(s.rank <= 3 ? SpTheme.green : SpTheme.onDarkFaint).frame(width: 22)
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
                Text("\(value)").font(SportsFonts.app(size: 18, weight: .heavy)).foregroundStyle(SpTheme.green).monospacedDigit()
                Text(unit).font(SportsFonts.app(size: 9)).foregroundStyle(SpTheme.onDarkFaint)
            }
        }
        .padding(12).background(tileBg)
    }

    // MARK: - المباريات

    @ViewBuilder private var matchesContent: some View {
        if let m = matches {
            let hasAny = !(m.live.isEmpty && m.today.isEmpty && m.upcoming.isEmpty && m.results.isEmpty)
            if hasAny {
                VStack(alignment: .leading, spacing: 18) {
                    matchBucket("مباشر", m.live, tint: SpTheme.crimson, icon: "dot.radiowaves.left.and.right")
                    matchBucket("اليوم", m.today, tint: SpTheme.green, icon: "calendar")
                    matchBucket("قادمة", m.upcoming, tint: SpTheme.greenSoft, icon: "clock")
                    matchBucket("النتائج", Array(m.results.reversed()), tint: SpTheme.onDarkDim, icon: "checkmark.seal")
                }
            } else {
                SpEmptyState(icon: "sportscourt", title: "لا مباريات", subtitle: "لا توجد مباريات متاحة حاليًا لهذه البطولة")
            }
        } else {
            SpEmptyState(icon: "sportscourt", title: "تعذّر جلب المباريات", subtitle: "حاول التحديث بالسحب للأسفل")
        }
    }

    @ViewBuilder private func matchBucket(_ title: String, _ items: [SpFixture], tint: Color, icon: String) -> some View {
        if !items.isEmpty {
            VStack(alignment: .leading, spacing: 10) {
                SpSectionHeader(icon: icon, title: title, count: items.count, tint: tint)
                ForEach(items) { f in SpMatchCard(fixture: f) }
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
                    Image(systemName: "arrow.left").font(.system(size: 9, weight: .bold)).foregroundStyle(SpTheme.green)
                    SpTeamLogo(logo: tr.to.logo, size: 16)
                    Text(tr.to.name).font(SportsFonts.app(size: 11)).foregroundStyle(SpTheme.onDarkDim).lineLimit(1)
                }
            }
            Spacer(minLength: 0)
            if !tr.type.isEmpty {
                Text(tr.type)
                    .font(SportsFonts.app(size: 11, weight: .bold)).foregroundStyle(SpTheme.green)
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
        if !force { loading = true }

        async let standingsT: [SpStandingRow]? = comp.hasStandings
            ? (try? await APIClient.shared.fetchStandings(comp: comp.slug, ignoreCache: force))?.standings : nil
        async let scorersT: [SpScorer]? = comp.hasScorers
            ? (try? await APIClient.shared.fetchScorers(comp: comp.slug, ignoreCache: force))?.scorers : nil
        async let assistsT: [SpScorer]? = comp.hasScorers
            ? (try? await APIClient.shared.fetchAssists(comp: comp.slug, ignoreCache: force))?.assists : nil
        async let outlookT: SpOutlook?? = (try? await APIClient.shared.fetchOutlook(comp: comp.slug, ignoreCache: force))?.outlook
        async let transfersT: SpLeagueTransfersResponse? = comp.category == "saudi"
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
        let tr = await transfersT
        self.leagueTransfers = (tr?.topDeals ?? tr?.transfers) ?? []
        self.loading = false
    }
}
