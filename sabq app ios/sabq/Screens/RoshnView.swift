import SwiftUI

// MARK: - مركز دوري روشن السعودي
//
// الشاشة الكاملة خلف شريط الرئيسية: المباريات جولةً بجولة، جدول الترتيب
// الملوّن، سباقات الموسم (هدّافون/صنّاع/بطاقات)، والأندية. تصميم فاتح منسّق
// بهوية روشن (قرار المالك: لا داكن) — أبيض صباحي، سماوي أساسي، زمردي
// للملعب، ذهبي للتتويج. البيانات من /api/rsl/hero و/api/sports/pro-league/*.

@Observable
@MainActor
final class RoshnHubStore {
    var buckets: RsMatchBuckets?
    var standings: [RsStandingRow] = []
    var scorers: [RsScorer] = []
    var assists: [RsLeader] = []
    var cards: RsCards?
    /// لوحات معروضة من أرشيف الموسم الماضي (قبل انطلاق الجديد).
    var racesFromArchive = false
    var loadingMatches = false
    var loadingStandings = false
    var loadingRaces = false

    func loadMatches() async {
        if loadingMatches { return }
        loadingMatches = true
        defer { loadingMatches = false }
        buckets = try? await APIClient.shared.fetchRoshnMatches()
    }

    func loadStandings() async {
        if loadingStandings { return }
        loadingStandings = true
        defer { loadingStandings = false }
        standings = (try? await APIClient.shared.fetchRoshnStandings()) ?? standings
    }

    /// السباقات بحارس الأرشيف: الموسم الحالي أولًا، وإن كان فارغًا قبل الموسم
    /// نعرض لوحات الموسم الماضي موسومة (نفس منطق الويب حرفيًا).
    func loadRaces(hero: RsHero?) async {
        if loadingRaces { return }
        loadingRaces = true
        defer { loadingRaces = false }

        let current = (try? await APIClient.shared.fetchRoshnScorers()) ?? []
        if !current.isEmpty {
            racesFromArchive = false
            scorers = current
            async let a = APIClient.shared.fetchRoshnAssists()
            async let c = APIClient.shared.fetchRoshnCards()
            assists = (try? await a) ?? []
            cards = try? await c
            return
        }
        guard let hero, !hero.inSeason,
              let prev = hero.lastSeason?.previousSeason ?? hero.outlook.nextSeason.map({ $0 - 1 })
        else {
            racesFromArchive = false
            scorers = []
            return
        }
        racesFromArchive = true
        scorers = (try? await APIClient.shared.fetchRoshnScorers(season: prev)) ?? []
        assists = (try? await APIClient.shared.fetchRoshnAssists(season: prev)) ?? []
        cards = try? await APIClient.shared.fetchRoshnCards(season: prev)
    }
}

struct RoshnView: View {
    private let homeStore = RoshnHomeStore.shared
    @State private var store = RoshnHubStore()
    @State private var tab: Tab = .matches
    @State private var selectedFixture: RsFixture?

    enum Tab: String, CaseIterable {
        case matches = "المباريات"
        case standings = "الترتيب"
        case races = "الهدّافون"
        case teams = "الأندية"
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 14) {
                header
                tabBar
                switch tab {
                case .matches: matchesTab
                case .standings: standingsTab
                case .races: RoshnRacesSection(store: store)
                case .teams: teamsTab
                }
            }
            .padding(.horizontal, 14)
            .padding(.bottom, 28)
        }
        .background(Color.white)
        .environment(\.layoutDirection, .rightToLeft)
        .navigationTitle("دوري روشن")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            await homeStore.loadIfNeeded()
            await store.loadMatches()
            await store.loadStandings()
            await store.loadRaces(hero: homeStore.hero)
        }
        .refreshable {
            await homeStore.refreshLive()
            await store.loadMatches()
            await store.loadStandings()
            await store.loadRaces(hero: homeStore.hero)
        }
        .sheet(item: $selectedFixture) { fixture in
            RoshnMatchCenter(fixtureId: fixture.id)
        }
    }

    // MARK: الترويسة — بطاقة فاتحة بهوية روشن

    private var header: some View {
        VStack(spacing: 10) {
            HStack(spacing: 12) {
                ZStack {
                    RoundedRectangle(cornerRadius: 14, style: .continuous)
                        .fill(LinearGradient(colors: [RoshnTheme.sky, RoshnTheme.pitch],
                                             startPoint: .topTrailing, endPoint: .bottomLeading))
                        .frame(width: 52, height: 52)
                    Image(systemName: "soccerball")
                        .font(SabqFonts.app(size: 26, weight: .medium))
                        .foregroundStyle(.white)
                }
                .shadow(color: RoshnTheme.sky.opacity(0.25), radius: 6, y: 3)

                VStack(alignment: .leading, spacing: 3) {
                    Text("دوري روشن السعودي")
                        .font(SabqFonts.app(size: 20, weight: .bold))
                        .foregroundStyle(RoshnTheme.ink)
                    Text(seasonSubtitle)
                        .font(SabqFonts.app(size: 11))
                        .foregroundStyle(RoshnTheme.inkSoft)
                }

                Spacer()

                if let h = homeStore.hero, !h.live.isEmpty {
                    HStack(spacing: 5) {
                        Circle().fill(RoshnTheme.liveRed).frame(width: 7, height: 7)
                        Text(h.live.count == 1 ? "مباشر" : "\(h.live.count) مباشر")
                            .font(SabqFonts.app(size: 11, weight: .semibold))
                            .foregroundStyle(RoshnTheme.liveRed)
                    }
                    .padding(.horizontal, 10).padding(.vertical, 6)
                    .background(Capsule().fill(RoshnTheme.liveRed.opacity(0.10)))
                }
            }

            // عدّاد الانطلاقة قبل الموسم — لمسة الترقّب الأولى في الصفحة.
            if let h = homeStore.hero, h.preSeason, !h.inSeason, let ts = h.outlook.firstKickoffTs {
                TimelineView(.periodic(from: .now, by: 1)) { _ in
                    HStack(spacing: 6) {
                        Image(systemName: "timer")
                            .font(SabqFonts.app(size: 12, weight: .medium))
                        Text("الموسم الجديد ينطلق بعد \(WCFormat.countdown(to: ts))")
                            .font(SabqFonts.app(size: 12.5, weight: .semibold))
                            .lineLimit(1).minimumScaleFactor(0.8)
                    }
                    .foregroundStyle(RoshnTheme.sky)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 9)
                    .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(RoshnTheme.skySoft))
                }
            }
        }
        .padding(14)
        .background(RoshnTheme.stripGradient)
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(RoshnTheme.line, lineWidth: 1))
    }

    private var seasonSubtitle: String {
        guard let h = homeStore.hero else { return "تغطية حية بتوقيت الرياض" }
        let season = h.outlook.nextSeason ?? h.outlook.season
        return "موسم \(RsFormat.seasonLabel(season)) · تغطية حية بتوقيت الرياض"
    }

    // MARK: شريط التبويبات

    private var tabBar: some View {
        HStack(spacing: 6) {
            ForEach(Tab.allCases, id: \.self) { item in
                Button {
                    tab = item
                } label: {
                    Text(item.rawValue)
                        .font(SabqFonts.app(size: 13, weight: tab == item ? .semibold : .regular))
                        .foregroundStyle(tab == item ? .white : RoshnTheme.inkSoft)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 9)
                        .background(
                            RoundedRectangle(cornerRadius: 12, style: .continuous)
                                .fill(tab == item ? RoshnTheme.sky : RoshnTheme.skySoft.opacity(0.6))
                        )
                }
                .buttonStyle(.plain)
            }
        }
    }

    // MARK: تبويب المباريات — دلاء جاهزة من الخادم

    @State private var matchBucket: MatchBucket = .auto

    enum MatchBucket: String, CaseIterable {
        case auto, live = "مباشر", today = "اليوم", upcoming = "القادمة", results = "النتائج"
    }

    private var activeBucket: MatchBucket {
        if matchBucket != .auto { return matchBucket }
        guard let b = store.buckets else { return .upcoming }
        if !b.live.isEmpty { return .live }
        if !b.today.isEmpty { return .today }
        return .upcoming
    }

    private var matchesTab: some View {
        VStack(spacing: 10) {
            HStack(spacing: 6) {
                ForEach([MatchBucket.live, .today, .upcoming, .results], id: \.self) { bucket in
                    Button {
                        matchBucket = bucket
                    } label: {
                        HStack(spacing: 4) {
                            if bucket == .live, let n = store.buckets?.live.count, n > 0 {
                                Circle().fill(RoshnTheme.liveRed).frame(width: 6, height: 6)
                            }
                            Text(bucket.rawValue)
                                .font(SabqFonts.app(size: 12, weight: activeBucket == bucket ? .semibold : .regular))
                        }
                        .foregroundStyle(activeBucket == bucket ? RoshnTheme.sky : RoshnTheme.inkSoft)
                        .padding(.horizontal, 12).padding(.vertical, 7)
                        .background(Capsule().fill(activeBucket == bucket ? RoshnTheme.skySoft : .clear))
                    }
                    .buttonStyle(.plain)
                }
                Spacer()
            }

            if store.loadingMatches, store.buckets == nil {
                loadingRows(count: 5, height: 74)
            } else {
                let fixtures = fixtures(for: activeBucket)
                if fixtures.isEmpty {
                    emptyState(icon: "calendar", text: emptyMessage(for: activeBucket))
                } else {
                    LazyVStack(spacing: 8) {
                        ForEach(groupedByDay(fixtures), id: \.0) { day, items in
                            HStack(spacing: 6) {
                                Circle().fill(RoshnTheme.pitch).frame(width: 6, height: 6)
                                Text(day)
                                    .font(SabqFonts.app(size: 12, weight: .semibold))
                                    .foregroundStyle(RoshnTheme.ink)
                                if let round = items.first?.round, !round.isEmpty {
                                    Text("· \(round)")
                                        .font(SabqFonts.app(size: 11))
                                        .foregroundStyle(RoshnTheme.inkSoft)
                                }
                                Spacer()
                            }
                            .padding(.top, 4)

                            ForEach(items) { fixture in
                                RoshnMatchRow(fixture: fixture) { selectedFixture = fixture }
                            }
                        }
                    }
                }
            }
        }
    }

    private func fixtures(for bucket: MatchBucket) -> [RsFixture] {
        guard let b = store.buckets else { return [] }
        switch bucket {
        case .live: return b.live
        case .today: return b.today
        case .results: return b.results.sorted { $0.timestamp > $1.timestamp }
        default: return b.upcoming
        }
    }

    private func emptyMessage(for bucket: MatchBucket) -> String {
        switch bucket {
        case .live: return "لا مباريات مباشرة الآن — عُد عند صافرة البداية"
        case .today: return "لا مباريات اليوم"
        case .results: return "النتائج تظهر هنا فور انتهاء أول مباراة"
        default: return "جدول الموسم يُعلن قريبًا — ستجده هنا فور اعتماده"
        }
    }

    private func groupedByDay(_ fixtures: [RsFixture]) -> [(String, [RsFixture])] {
        var order: [String] = []
        var groups: [String: [RsFixture]] = [:]
        for f in fixtures {
            let day = RsFormat.day(f)
            if groups[day] == nil { order.append(day) }
            groups[day, default: []].append(f)
        }
        return order.map { ($0, groups[$0] ?? []) }
    }

    // MARK: تبويب الترتيب — جدول ملوّن بالمناطق

    private var standingsTab: some View {
        VStack(spacing: 8) {
            if store.loadingStandings, store.standings.isEmpty {
                loadingRows(count: 9, height: 44)
            } else if store.standings.isEmpty {
                emptyState(icon: "chart.bar", text: "الترتيب يتشكّل مع أول جولة في الموسم")
            } else {
                legendRow
                standingsHeader
                LazyVStack(spacing: 4) {
                    ForEach(store.standings) { row in
                        RoshnStandingRowView(row: row, total: store.standings.count)
                    }
                }
            }
        }
    }

    private var legendRow: some View {
        HStack(spacing: 12) {
            legend(color: RoshnTheme.gold, label: "اللقب")
            legend(color: RoshnTheme.sky, label: "نخبة آسيا")
            legend(color: RoshnTheme.danger, label: "هبوط")
            Spacer()
        }
        .padding(.horizontal, 4)
    }

    private func legend(color: Color, label: String) -> some View {
        HStack(spacing: 4) {
            Circle().fill(color).frame(width: 7, height: 7)
            Text(label).font(SabqFonts.app(size: 10)).foregroundStyle(RoshnTheme.inkSoft)
        }
    }

    private var standingsHeader: some View {
        HStack(spacing: 8) {
            Text("#").frame(width: 22)
            Text("النادي").frame(maxWidth: .infinity, alignment: .leading)
            Text("ل").frame(width: 26)
            Text("+/-").frame(width: 32)
            Text("ن").frame(width: 30)
        }
        .font(SabqFonts.app(size: 10, weight: .medium))
        .foregroundStyle(RoshnTheme.inkSoft)
        .padding(.horizontal, 10)
    }

    // MARK: تبويب الأندية

    private var teamsTab: some View {
        Group {
            if store.standings.isEmpty {
                emptyState(icon: "shield", text: "قائمة أندية الموسم تظهر مع اعتماد الجدول")
            } else {
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 104), spacing: 10)], spacing: 10) {
                    ForEach(store.standings.sorted { $0.team.name < $1.team.name }) { row in
                        VStack(spacing: 8) {
                            WCRemoteImage(url: row.team.logo)
                                .padding(6).frame(width: 56, height: 56)
                                .background(Circle().fill(.white))
                                .overlay(Circle().stroke(RoshnTheme.line, lineWidth: 1))
                            Text(row.team.name)
                                .font(SabqFonts.app(size: 12, weight: .semibold))
                                .foregroundStyle(RoshnTheme.ink)
                                .lineLimit(1).minimumScaleFactor(0.7)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                        .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(RoshnTheme.skySoft.opacity(0.5)))
                        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(RoshnTheme.line, lineWidth: 1))
                    }
                }
            }
        }
    }

    // MARK: مساعدات عامة

    private func loadingRows(count: Int, height: CGFloat) -> some View {
        VStack(spacing: 8) {
            ForEach(0..<count, id: \.self) { _ in
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .fill(RoshnTheme.skySoft.opacity(0.5))
                    .frame(height: height)
            }
        }
    }

    private func emptyState(icon: String, text: String) -> some View {
        VStack(spacing: 10) {
            Image(systemName: icon)
                .font(SabqFonts.app(size: 28, weight: .light))
                .foregroundStyle(RoshnTheme.sky.opacity(0.6))
            Text(text)
                .font(SabqFonts.app(size: 13))
                .foregroundStyle(RoshnTheme.inkSoft)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 44)
    }
}

// MARK: - صفّ مباراة

struct RoshnMatchRow: View {
    let fixture: RsFixture
    let onOpen: () -> Void

    var body: some View {
        Button(action: onOpen) {
            HStack(spacing: 10) {
                teamSide(fixture.home, alignment: .trailing)
                center
                teamSide(fixture.away, alignment: .leading)
            }
            .padding(.horizontal, 12).padding(.vertical, 12)
            .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(.white))
            .overlay(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .stroke(fixture.status.live ? RoshnTheme.liveRed.opacity(0.45) : RoshnTheme.line, lineWidth: 1)
            )
            .shadow(color: RoshnTheme.ink.opacity(0.04), radius: 6, y: 3)
        }
        .buttonStyle(.plain)
    }

    private func teamSide(_ team: RsTeam, alignment: Alignment) -> some View {
        HStack(spacing: 7) {
            if alignment == .leading {
                WCRemoteImage(url: team.logo)
                    .padding(2).frame(width: 30, height: 30)
                    .background(Circle().fill(.white))
                    .overlay(Circle().stroke(RoshnTheme.line, lineWidth: 1))
            }
            Text(team.name)
                .font(SabqFonts.app(size: 13, weight: .semibold))
                .foregroundStyle(RoshnTheme.ink)
                .lineLimit(1).minimumScaleFactor(0.7)
                .frame(maxWidth: .infinity, alignment: alignment)
            if alignment == .trailing {
                WCRemoteImage(url: team.logo)
                    .padding(2).frame(width: 30, height: 30)
                    .background(Circle().fill(.white))
                    .overlay(Circle().stroke(RoshnTheme.line, lineWidth: 1))
            }
        }
        .frame(maxWidth: .infinity)
    }

    private var center: some View {
        VStack(spacing: 3) {
            if fixture.started {
                Text("\(fixture.goals.away ?? 0) - \(fixture.goals.home ?? 0)")
                    .font(SabqFonts.app(size: 17, weight: .bold))
                    .foregroundStyle(RoshnTheme.ink)
                    .environment(\.layoutDirection, .leftToRight)
                if fixture.status.live {
                    HStack(spacing: 4) {
                        Circle().fill(RoshnTheme.liveRed).frame(width: 5, height: 5)
                        Text(liveMinute ?? fixture.status.label)
                            .font(SabqFonts.app(size: 10, weight: .medium))
                            .foregroundStyle(RoshnTheme.liveRed)
                            .monospacedDigit()
                    }
                } else {
                    Text(fixture.status.label)
                        .font(SabqFonts.app(size: 9.5))
                        .foregroundStyle(RoshnTheme.inkSoft)
                }
            } else {
                Text(RsFormat.time(fixture))
                    .font(SabqFonts.app(size: 14, weight: .semibold))
                    .foregroundStyle(RoshnTheme.sky)
                Text(fixture.venue.name.isEmpty ? "يُعلن لاحقًا" : fixture.venue.name)
                    .font(SabqFonts.app(size: 8.5))
                    .foregroundStyle(RoshnTheme.inkSoft)
                    .lineLimit(1).minimumScaleFactor(0.7)
            }
        }
        .frame(width: 92)
    }

    private var liveMinute: String? {
        guard let elapsed = fixture.status.elapsed, elapsed > 0 else { return nil }
        let extra = (fixture.status.extra ?? 0) > 0 ? "+\(fixture.status.extra!)" : ""
        return "\(elapsed)\(extra)'"
    }
}

// MARK: - صفّ ترتيب

struct RoshnStandingRowView: View {
    let row: RsStandingRow
    let total: Int

    /// لون منطقة المركز: لقب/نخبة آسيا/هبوط — كما جدول الويب.
    private var zoneColor: Color? {
        if row.rank == 1 { return RoshnTheme.gold }
        if row.rank <= 3 { return RoshnTheme.sky }
        if row.rank > total - 3 { return RoshnTheme.danger }
        return nil
    }

    var body: some View {
        HStack(spacing: 8) {
            ZStack {
                Circle()
                    .fill(zoneColor?.opacity(0.14) ?? RoshnTheme.skySoft.opacity(0.6))
                Text("\(row.rank)")
                    .font(SabqFonts.app(size: 11, weight: .semibold))
                    .foregroundStyle(zoneColor ?? RoshnTheme.inkSoft)
                    .monospacedDigit()
            }
            .frame(width: 22, height: 22)

            WCRemoteImage(url: row.team.logo)
                .padding(2).frame(width: 26, height: 26)
                .background(Circle().fill(.white))
                .overlay(Circle().stroke(RoshnTheme.line, lineWidth: 0.8))

            Text(row.team.name)
                .font(SabqFonts.app(size: 13, weight: .semibold))
                .foregroundStyle(RoshnTheme.ink)
                .lineLimit(1).minimumScaleFactor(0.7)
                .frame(maxWidth: .infinity, alignment: .leading)

            if row.live == true {
                Circle().fill(RoshnTheme.liveRed).frame(width: 6, height: 6)
            }

            Text("\(row.played)")
                .font(SabqFonts.app(size: 12)).foregroundStyle(RoshnTheme.inkSoft)
                .monospacedDigit().frame(width: 26)

            Text(row.goalsDiff > 0 ? "+\(row.goalsDiff)" : "\(row.goalsDiff)")
                .font(SabqFonts.app(size: 12))
                .foregroundStyle(row.goalsDiff > 0 ? RoshnTheme.pitch : row.goalsDiff < 0 ? RoshnTheme.danger : RoshnTheme.inkSoft)
                .monospacedDigit().frame(width: 32)
                .environment(\.layoutDirection, .leftToRight)

            Text("\(row.points)")
                .font(SabqFonts.app(size: 13, weight: .bold))
                .foregroundStyle(RoshnTheme.ink)
                .monospacedDigit().frame(width: 30)
        }
        .padding(.horizontal, 10).padding(.vertical, 8)
        .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(.white))
        .overlay(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .stroke(row.live == true ? RoshnTheme.liveRed.opacity(0.35) : RoshnTheme.line, lineWidth: 1)
        )
    }
}

// MARK: - سباقات الموسم (هدّافون / صنّاع / بطاقات)

struct RoshnRacesSection: View {
    let store: RoshnHubStore
    @State private var race: Race = .goals

    enum Race: String, CaseIterable {
        case goals = "الهدّافون"
        case assists = "صنّاع الأهداف"
        case cards = "البطاقات"
    }

    var body: some View {
        VStack(spacing: 10) {
            if store.racesFromArchive {
                Text("لوحات الموسم الماضي — تتصفّر مع أول جولة للموسم الجديد")
                    .font(SabqFonts.app(size: 11))
                    .foregroundStyle(RoshnTheme.gold)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 8)
                    .background(RoundedRectangle(cornerRadius: 10, style: .continuous).fill(RoshnTheme.goldSoft))
            }

            HStack(spacing: 6) {
                ForEach(Race.allCases, id: \.self) { item in
                    Button {
                        race = item
                    } label: {
                        Text(item.rawValue)
                            .font(SabqFonts.app(size: 12, weight: race == item ? .semibold : .regular))
                            .foregroundStyle(race == item ? RoshnTheme.gold : RoshnTheme.inkSoft)
                            .padding(.horizontal, 12).padding(.vertical, 7)
                            .background(Capsule().fill(race == item ? RoshnTheme.goldSoft : .clear))
                    }
                    .buttonStyle(.plain)
                }
                Spacer()
            }

            switch race {
            case .goals:
                if store.scorers.isEmpty {
                    racesEmpty("سباق هدّاف الدوري ينطلق مع أول صافرة")
                } else {
                    LazyVStack(spacing: 6) {
                        ForEach(store.scorers) { s in
                            leaderRow(rank: s.rank, name: s.name, photo: s.photo, team: s.team,
                                      primary: "\(s.goals)", secondary: "\(s.assists) صناعة")
                        }
                    }
                }
            case .assists:
                if store.assists.isEmpty {
                    racesEmpty("سباق صنّاع الأهداف ينطلق مع أول صافرة")
                } else {
                    LazyVStack(spacing: 6) {
                        ForEach(store.assists) { l in
                            leaderRow(rank: l.rank, name: l.name, photo: l.photo, team: l.team,
                                      primary: "\(l.assists ?? 0)", secondary: "\(l.goals ?? 0) أهداف")
                        }
                    }
                }
            case .cards:
                let yellow = store.cards?.yellow ?? []
                if yellow.isEmpty {
                    racesEmpty("لا بطاقات بعد — وعسى ألا تكثر")
                } else {
                    LazyVStack(spacing: 6) {
                        ForEach(yellow) { l in
                            leaderRow(rank: l.rank, name: l.name, photo: l.photo, team: l.team,
                                      primary: "🟨 \(l.yellow ?? 0)", secondary: "🟥 \(l.red ?? 0)")
                        }
                    }
                }
            }
        }
    }

    private func racesEmpty(_ text: String) -> some View {
        VStack(spacing: 8) {
            Image(systemName: "trophy")
                .font(SabqFonts.app(size: 26, weight: .light))
                .foregroundStyle(RoshnTheme.gold.opacity(0.6))
            Text(text)
                .font(SabqFonts.app(size: 13))
                .foregroundStyle(RoshnTheme.inkSoft)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 40)
    }

    private func leaderRow(rank: Int, name: String, photo: String, team: RsTeam,
                           primary: String, secondary: String) -> some View {
        HStack(spacing: 10) {
            ZStack {
                Circle().fill(rank <= 3 ? RoshnTheme.goldSoft : RoshnTheme.skySoft.opacity(0.6))
                Text("\(rank)")
                    .font(SabqFonts.app(size: 11, weight: .semibold))
                    .foregroundStyle(rank <= 3 ? RoshnTheme.gold : RoshnTheme.inkSoft)
                    .monospacedDigit()
            }
            .frame(width: 24, height: 24)

            WCRemoteImage(url: photo)
                .frame(width: 34, height: 34)
                .background(Circle().fill(RoshnTheme.skySoft))
                .clipShape(Circle())

            VStack(alignment: .leading, spacing: 2) {
                Text(name)
                    .font(SabqFonts.app(size: 13, weight: .semibold))
                    .foregroundStyle(RoshnTheme.ink)
                    .lineLimit(1).minimumScaleFactor(0.75)
                HStack(spacing: 4) {
                    WCRemoteImage(url: team.logo).frame(width: 12, height: 12)
                    Text(team.name)
                        .font(SabqFonts.app(size: 10))
                        .foregroundStyle(RoshnTheme.inkSoft)
                        .lineLimit(1)
                }
            }

            Spacer()

            VStack(alignment: .trailing, spacing: 2) {
                Text(primary)
                    .font(SabqFonts.app(size: 15, weight: .bold))
                    .foregroundStyle(RoshnTheme.ink)
                    .monospacedDigit()
                Text(secondary)
                    .font(SabqFonts.app(size: 9.5))
                    .foregroundStyle(RoshnTheme.inkSoft)
            }
        }
        .padding(.horizontal, 12).padding(.vertical, 9)
        .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(.white))
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(RoshnTheme.line, lineWidth: 1))
    }
}
