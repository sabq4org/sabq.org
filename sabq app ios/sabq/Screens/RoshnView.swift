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
    var matchesError: String?
    var standingsError: String?
    var racesError: String?

    func loadMatches(force: Bool = false) async {
        if loadingMatches { return }
        loadingMatches = true
        defer { loadingMatches = false }
        do {
            buckets = try await APIClient.shared.fetchRoshnMatches(ignoreCache: force)
            matchesError = nil
        } catch {
            matchesError = message(for: error)
        }
    }

    func loadStandings(force: Bool = false) async {
        if loadingStandings { return }
        loadingStandings = true
        defer { loadingStandings = false }
        do {
            standings = try await APIClient.shared.fetchRoshnStandings(ignoreCache: force)
            standingsError = nil
        } catch {
            standingsError = message(for: error)
        }
    }

    /// السباقات بحارس الأرشيف: الموسم الحالي أولًا، وإن كان فارغًا قبل الموسم
    /// نعرض لوحات الموسم الماضي موسومة (نفس منطق الويب حرفيًا).
    func loadRaces(hero: RsHero?, force: Bool = false) async {
        if loadingRaces { return }
        loadingRaces = true
        defer { loadingRaces = false }

        let archiveSeason: Int? = {
            guard let hero, !hero.inSeason else { return nil }
            return hero.lastSeason?.previousSeason ?? hero.outlook.nextSeason.map { $0 - 1 }
        }()
        racesFromArchive = archiveSeason != nil

        // الطلبات الثلاثة مستقلة: فشل الهدافين المؤقت لا ينبغي أن يخفي
        // الصناعة والبطاقات كما كان يحدث سابقًا.
        async let scorersResult: [RsScorer]? = try? await APIClient.shared.fetchRoshnScorers(
            season: archiveSeason, ignoreCache: force
        )
        async let assistsResult: [RsLeader]? = try? await APIClient.shared.fetchRoshnAssists(
            season: archiveSeason, ignoreCache: force
        )
        async let cardsResult: RsCards? = try? await APIClient.shared.fetchRoshnCards(
            season: archiveSeason, ignoreCache: force
        )
        let (newScorers, newAssists, newCards) = await (scorersResult, assistsResult, cardsResult)

        if let newScorers { scorers = newScorers }
        if let newAssists { assists = newAssists }
        if let newCards { cards = newCards }

        let failures = [newScorers == nil, newAssists == nil, newCards == nil].filter { $0 }.count
        racesError = failures == 0 ? nil
            : failures == 3 ? "تعذّر تحميل لوحات الموسم. أعد المحاولة بعد لحظات."
            : "اكتملت بعض اللوحات فقط؛ سنعيد تحميل البقية عند المحاولة."
    }

    private func message(for error: Error) -> String {
        if let api = error as? APIError, let text = api.errorDescription { return text }
        return "تعذّر الاتصال بمصدر البيانات حاليًا"
    }
}

struct RoshnView: View {
    private let homeStore = RoshnHomeStore.shared
    @State private var store = RoshnHubStore()
    @State private var tab: Tab = .matches
    @State private var selectedFixture: RsFixture?
    @State private var selectedTeam: RsTeam?

    enum Tab: String, CaseIterable {
        case matches = "المباريات"
        case standings = "الترتيب"
        case races = "الهدّافون"
        case teams = "الأندية"

        var icon: String {
            switch self {
            case .matches: "calendar"
            case .standings: "list.number"
            case .races: "trophy.fill"
            case .teams: "shield.fill"
            }
        }
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 14) {
                header
                tabBar
                switch tab {
                case .matches: matchesTab
                case .standings: standingsTab
                case .races:
                    RoshnRacesSection(store: store) {
                        Task { await store.loadRaces(hero: homeStore.hero, force: true) }
                    }
                case .teams: teamsTab
                }
            }
            .padding(.horizontal, 14)
            .padding(.bottom, 28)
        }
        .background(RoshnTheme.canvas)
        .environment(\.layoutDirection, .rightToLeft)
        .environment(\.locale, RsFormat.latinLocale)
        .navigationTitle("دوري روشن")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            await homeStore.loadIfNeeded()
            async let matches: Void = store.loadMatches()
            async let standings: Void = store.loadStandings()
            async let races: Void = store.loadRaces(hero: homeStore.hero)
            _ = await (matches, standings, races)
        }
        .refreshable {
            await homeStore.refreshLive()
            async let matches: Void = store.loadMatches(force: true)
            async let standings: Void = store.loadStandings(force: true)
            async let races: Void = store.loadRaces(hero: homeStore.hero, force: true)
            _ = await (matches, standings, races)
        }
        // sheet(item:) لا sheet(isPresented:) — النمط القديم كان يقيّم المحتوى
        // قبل وصول selectedFixture في أول ضغطة فتُفتح ورقة بيضاء فارغة.
        .sheet(item: $selectedFixture) { fixture in
            RoshnMatchCenter(fixtureId: fixture.id)
                .presentationDetents([.large])
                .presentationDragIndicator(.visible)
        }
        .navigationDestination(item: $selectedTeam) { team in
            RoshnTeamView(teamId: team.id, previewName: team.name, previewLogo: team.logo)
        }
    }

    // MARK: الترويسة — ضباب صباحي ناعم (هوية «صباح الملعب»)

    private var header: some View {
        ZStack {
            RoshnTheme.card

            // خطوط ملعب خافتة على الخلفية الفاتحة.
            Circle()
                .stroke(RoshnTheme.skySoft, lineWidth: 1.5)
                .frame(width: 190, height: 190)
                .offset(x: 135, y: 40)
            Rectangle()
                .stroke(RoshnTheme.pitchSoft, lineWidth: 1.5)
                .frame(width: 175, height: 88)
                .offset(x: -145, y: 78)

            VStack(spacing: 15) {
                HStack(spacing: 13) {
                    Image("RoshnLeagueLogo")
                        .resizable()
                        .scaledToFit()
                        .padding(7)
                        .frame(width: 64, height: 64)
                        .background(RoundedRectangle(cornerRadius: 17, style: .continuous).fill(.white))
                        .overlay(RoundedRectangle(cornerRadius: 17, style: .continuous).stroke(RoshnTheme.heroStroke, lineWidth: 1))
                        .shadow(color: RoshnTheme.cardShadow, radius: 6, y: 3)

                    VStack(alignment: .leading, spacing: 4) {
                        Text("دوري روشن السعودي")
                            .font(SabqFonts.app(size: 23, weight: .bold))
                            .foregroundStyle(RoshnTheme.heroOn)
                        Text(seasonSubtitle)
                            .font(SabqFonts.app(size: 11.5))
                            .foregroundStyle(RoshnTheme.heroOnSoft)
                            .lineLimit(1)
                    }

                    Spacer(minLength: 4)

                    if let h = homeStore.hero, !h.live.isEmpty {
                        HStack(spacing: 5) {
                            Circle().fill(.white).frame(width: 6, height: 6)
                            Text(h.live.count == 1 ? "مباشر" : "\(RsFormat.latin(h.live.count)) مباشر")
                                .font(SabqFonts.app(size: 10.5, weight: .semibold))
                        }
                        .foregroundStyle(.white)
                        .padding(.horizontal, 9).padding(.vertical, 6)
                        .background(Capsule().fill(RoshnTheme.liveRed))
                    }
                }

                HStack(spacing: 8) {
                    heroMetric(value: RsFormat.latin(store.standings.count), label: "نادٍ", icon: "shield.fill")
                    heroMetric(value: RsFormat.latin(store.buckets?.upcoming.count ?? 0), label: "قادمة", icon: "calendar")
                    heroMetric(value: RsFormat.latin(store.scorers.count), label: "في السباق", icon: "figure.soccer")
                }

                if let h = homeStore.hero, h.preSeason, !h.inSeason, let ts = h.outlook.firstKickoffTs {
                    TimelineView(.periodic(from: .now, by: 1)) { _ in
                        HStack(spacing: 7) {
                            Image(systemName: "timer")
                            Text("الموسم الجديد ينطلق بعد \(WCFormat.countdown(to: ts))")
                                .lineLimit(1).minimumScaleFactor(0.75)
                        }
                        .font(SabqFonts.app(size: 12.5, weight: .semibold))
                        .foregroundStyle(RoshnTheme.sky)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 10)
                        .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(RoshnTheme.skySoft))
                    }
                }
            }
            .padding(17)
        }
        .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 24, style: .continuous).stroke(RoshnTheme.heroStroke, lineWidth: 1))
        .shadow(color: RoshnTheme.cardShadow, radius: 10, y: 4)
    }

    private func heroMetric(value: String, label: String, icon: String) -> some View {
        HStack(spacing: 6) {
            Image(systemName: icon).font(SabqFonts.app(size: 11, weight: .medium))
            Text(value).font(SabqFonts.app(size: 14, weight: .bold)).monospacedDigit()
            Text(label).font(SabqFonts.app(size: 10.5))
        }
        .foregroundStyle(RoshnTheme.heroOn)
        .frame(maxWidth: .infinity)
        .padding(.vertical, 9)
        .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(RoshnTheme.skySoft))
        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(RoshnTheme.line, lineWidth: 1))
    }

    private var seasonSubtitle: String {
        guard let h = homeStore.hero else { return "تغطية حية بتوقيت الرياض" }
        let season = h.outlook.nextSeason ?? h.outlook.season
        return "موسم \(RsFormat.isolatedLatin(RsFormat.seasonLabel(season))) · تغطية حية بتوقيت الرياض"
    }

    // MARK: شريط التبويبات

    private var tabBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(Tab.allCases, id: \.self) { item in
                    Button {
                        withAnimation(.easeInOut(duration: 0.2)) { tab = item }
                    } label: {
                        HStack(spacing: 6) {
                            Image(systemName: item.icon)
                                .font(SabqFonts.app(size: 11, weight: .medium))
                            Text(item.rawValue)
                                .font(SabqFonts.app(size: 13, weight: tab == item ? .semibold : .regular))
                        }
                        .foregroundStyle(tab == item ? .white : RoshnTheme.inkSoft)
                        .padding(.horizontal, 15).padding(.vertical, 10)
                        .background(
                            Capsule().fill(tab == item ? RoshnTheme.sky : RoshnTheme.card)
                        )
                        .overlay(Capsule().stroke(tab == item ? Color.clear : RoshnTheme.line, lineWidth: 1))
                    }
                    .buttonStyle(.plain)
                }
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
            sectionHeading("مباريات الدوري", subtitle: "المواعيد والنتائج لحظة بلحظة", icon: "sportscourt.fill")

            if let error = store.matchesError {
                retryBanner(error) { Task { await store.loadMatches(force: true) } }
            }

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
                                RoshnMatchRow(fixture: fixture) {
                                    selectedFixture = fixture
                                }
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
            sectionHeading("جدول الترتيب", subtitle: "المراكز والنقاط وفارق الأهداف", icon: "chart.bar.fill")
            if let error = store.standingsError {
                retryBanner(error) { Task { await store.loadStandings(force: true) } }
            }
            if store.loadingStandings, store.standings.isEmpty {
                loadingRows(count: 9, height: 44)
            } else if store.standings.isEmpty {
                emptyState(icon: "chart.bar", text: "الترتيب يتشكّل مع أول جولة في الموسم")
            } else {
                legendRow
                standingsHeader
                LazyVStack(spacing: 4) {
                    ForEach(store.standings) { row in
                        Button { selectedTeam = row.team } label: {
                            RoshnStandingRowView(row: row, total: store.standings.count)
                        }
                        .buttonStyle(.plain)
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
        VStack(spacing: 12) {
            sectionHeading("أندية دوري روشن", subtitle: "صفحات متكاملة: أرقام، مباريات، هدّافون وقائمة", icon: "shield.fill")
            if let error = store.standingsError {
                retryBanner(error) { Task { await store.loadStandings(force: true) } }
            }
            if store.standings.isEmpty {
                emptyState(icon: "shield", text: "قائمة أندية الموسم تظهر مع اعتماد الجدول")
            } else {
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 108), spacing: 10)], spacing: 10) {
                    ForEach(store.standings.sorted { $0.team.name < $1.team.name }) { row in
                        Button { selectedTeam = row.team } label: {
                            VStack(spacing: 8) {
                                ZStack(alignment: .bottomTrailing) {
                                    WCRemoteImage(url: row.team.logo)
                                        .padding(7).frame(width: 60, height: 60)
                                        .background(Circle().fill(.white))
                                        .overlay(Circle().stroke(RoshnTheme.line, lineWidth: 1))
                                    Text(RsFormat.latin(row.rank))
                                        .font(SabqFonts.app(size: 9, weight: .bold))
                                        .foregroundStyle(.white)
                                        .frame(width: 20, height: 20)
                                        .background(Circle().fill(RoshnTheme.navy))
                                }
                                Text(row.team.name)
                                    .font(SabqFonts.app(size: 12.5, weight: .semibold))
                                    .foregroundStyle(RoshnTheme.ink)
                                    .lineLimit(1).minimumScaleFactor(0.7)
                                Text("\(RsFormat.latin(row.points)) نقطة")
                                    .font(SabqFonts.app(size: 9.5))
                                    .foregroundStyle(RoshnTheme.inkSoft)
                            }
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 14)
                            .background(RoundedRectangle(cornerRadius: 18, style: .continuous).fill(RoshnTheme.card))
                            .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(RoshnTheme.line, lineWidth: 1))
                        }
                        .buttonStyle(.plain)
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
                    .fill(RoshnTheme.skySoft)
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

    private func sectionHeading(_ title: String, subtitle: String, icon: String) -> some View {
        HStack(spacing: 10) {
            Image(systemName: icon)
                .font(SabqFonts.app(size: 15, weight: .medium))
                .foregroundStyle(RoshnTheme.sky)
                .frame(width: 36, height: 36)
                .background(RoundedRectangle(cornerRadius: 11, style: .continuous).fill(RoshnTheme.skySoft))
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(SabqFonts.app(size: 17, weight: .bold)).foregroundStyle(RoshnTheme.ink)
                Text(subtitle).font(SabqFonts.app(size: 10.5)).foregroundStyle(RoshnTheme.inkSoft)
            }
            Spacer()
        }
        .padding(.top, 2)
    }

    private func retryBanner(_ message: String, action: @escaping () -> Void) -> some View {
        HStack(spacing: 9) {
            Image(systemName: "wifi.exclamationmark")
                .foregroundStyle(RoshnTheme.gold)
            Text(message)
                .font(SabqFonts.app(size: 11))
                .foregroundStyle(RoshnTheme.inkSoft)
                .frame(maxWidth: .infinity, alignment: .leading)
            Button("إعادة") { action() }
                .font(SabqFonts.app(size: 11, weight: .semibold))
                .foregroundStyle(RoshnTheme.sky)
        }
        .padding(11)
        .background(RoundedRectangle(cornerRadius: 13, style: .continuous).fill(RoshnTheme.goldSoft))
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
                    .stroke(fixture.status.live ? RoshnTheme.liveRed : RoshnTheme.line, lineWidth: 1)
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

    /// أرضيته المسطّحة الناعمة — بديل الشفافية (قرار المالك: ألوان مسطّحة فقط).
    private var zoneSoft: Color {
        if row.rank == 1 { return RoshnTheme.goldSoft }
        if row.rank <= 3 { return RoshnTheme.skySoft }
        if row.rank > total - 3 { return RoshnTheme.dangerSoft }
        return RoshnTheme.skySoft
    }

    var body: some View {
        HStack(spacing: 8) {
            ZStack {
                Circle()
                    .fill(zoneSoft)
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
                .stroke(row.live == true ? RoshnTheme.liveRed : RoshnTheme.line, lineWidth: 1)
        )
    }
}

// MARK: - سباقات الموسم (هدّافون / صنّاع / بطاقات)

struct RoshnRacesSection: View {
    let store: RoshnHubStore
    let onRetry: () -> Void
    @State private var race: Race = .goals

    enum Race: String, CaseIterable {
        case goals = "الهدّافون"
        case assists = "صنّاع الأهداف"
        case cards = "البطاقات"
    }

    var body: some View {
        VStack(spacing: 10) {
            HStack(spacing: 10) {
                Image(systemName: "trophy.fill")
                    .font(SabqFonts.app(size: 15, weight: .medium))
                    .foregroundStyle(RoshnTheme.gold)
                    .frame(width: 36, height: 36)
                    .background(RoundedRectangle(cornerRadius: 11, style: .continuous).fill(RoshnTheme.goldSoft))
                VStack(alignment: .leading, spacing: 2) {
                    Text("سباقات الموسم")
                        .font(SabqFonts.app(size: 17, weight: .bold))
                        .foregroundStyle(RoshnTheme.ink)
                    Text("الهدافون وصنّاع الأهداف والبطاقات")
                        .font(SabqFonts.app(size: 10.5))
                        .foregroundStyle(RoshnTheme.inkSoft)
                }
                Spacer()
            }

            if let message = store.racesError {
                HStack(spacing: 8) {
                    Image(systemName: "arrow.clockwise.circle")
                    Text(message).frame(maxWidth: .infinity, alignment: .leading)
                    Button("إعادة", action: onRetry)
                        .font(SabqFonts.app(size: 11, weight: .semibold))
                }
                .font(SabqFonts.app(size: 10.5))
                .foregroundStyle(RoshnTheme.gold)
                .padding(10)
                .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(RoshnTheme.goldSoft))
            }

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
                    if store.loadingRaces {
                        racesLoading
                    } else {
                        racesEmpty("سباق هدّاف الدوري ينطلق مع أول صافرة")
                    }
                } else {
                    if store.scorers.count >= 3 { podium }
                    LazyVStack(spacing: 6) {
                        ForEach(store.scorers.count >= 3 ? Array(store.scorers.dropFirst(3)) : store.scorers) { s in
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

    private var racesLoading: some View {
        VStack(spacing: 8) {
            ForEach(0..<5, id: \.self) { _ in
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .fill(RoshnTheme.card)
                    .frame(height: 58)
                    .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(RoshnTheme.line, lineWidth: 1))
            }
        }
    }

    private var podium: some View {
        let leaders = [store.scorers[1], store.scorers[0], store.scorers[2]]
        return HStack(alignment: .bottom, spacing: 8) {
            ForEach(Array(leaders.enumerated()), id: \.element.id) { index, scorer in
                let champion = index == 1
                VStack(spacing: 6) {
                    ZStack(alignment: .bottomTrailing) {
                        WCRemoteImage(url: scorer.photo)
                            .frame(width: champion ? 72 : 58, height: champion ? 72 : 58)
                            .background(Circle().fill(RoshnTheme.skySoft))
                            .clipShape(Circle())
                            .overlay(Circle().stroke(champion ? RoshnTheme.gold : RoshnTheme.line, lineWidth: champion ? 3 : 2))
                        Text(RsFormat.latin(scorer.rank))
                            .font(SabqFonts.app(size: 9, weight: .bold))
                            .foregroundStyle(.white)
                            .frame(width: 20, height: 20)
                            .background(Circle().fill(champion ? RoshnTheme.gold : RoshnTheme.navy))
                    }
                    Text(scorer.name)
                        .font(SabqFonts.app(size: champion ? 12.5 : 11, weight: .semibold))
                        .foregroundStyle(RoshnTheme.ink)
                        .lineLimit(1).minimumScaleFactor(0.7)
                    Text("\(RsFormat.latin(scorer.goals)) هدف")
                        .font(SabqFonts.app(size: champion ? 14 : 12, weight: .bold))
                        .foregroundStyle(champion ? RoshnTheme.gold : RoshnTheme.inkSoft)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, champion ? 14 : 11)
                .background(RoundedRectangle(cornerRadius: 17, style: .continuous).fill(champion ? RoshnTheme.goldSoft : RoshnTheme.card))
                .overlay(RoundedRectangle(cornerRadius: 17, style: .continuous).stroke(champion ? RoshnTheme.gold : RoshnTheme.line, lineWidth: 1))
            }
        }
        .padding(.vertical, 4)
    }

    private func leaderRow(rank: Int, name: String, photo: String, team: RsTeam,
                           primary: String, secondary: String) -> some View {
        HStack(spacing: 10) {
            ZStack {
                Circle().fill(rank <= 3 ? RoshnTheme.goldSoft : RoshnTheme.skySoft)
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
