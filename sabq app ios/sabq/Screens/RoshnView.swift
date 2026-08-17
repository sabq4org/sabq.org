import SwiftUI

// MARK: - مركز دوري روشن السعودي
//
// الشاشة الكاملة خلف شريط الرئيسية: المباريات بدلاء الخادم، جدول الترتيب
// الملوّن، سباقات الموسم (هدّافون/صنّاع/بطاقات)، و«الجدول» — متصفّح الجولات
// الـ٣٤ بكل مباريات الموسم (منذ 2026-07-28 بدل تبويب الأندية؛ صفحات الأندية
// تبقى متاحة من الترتيب ومركز المباراة). هوية «أخضر الملعب» (2026-08-01):
// هيرو زمردي صلب، قماشة فستقية، بطاقات بلا حدود، عبر RoshnTheme.
// البيانات من /api/rsl/hero و/api/sports/pro-league/*.

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

    // متصفّح الجولات (تبويب «الجدول») — يُحمَّل كسلًا عند أول فتح للتبويب.
    var rounds: [RsRound] = []
    var currentRoundKey: String?
    var selectedRoundKey: String?
    /// true بعد اختيار يدوي — قبلها يتبع `current` من الخادم بعد انتهاء الجولة.
    var userPickedRound = false
    var roundFixtures: [RsFixture] = []
    var loadingSchedule = false
    var loadingRound = false
    var scheduleError: String?
    private(set) var didLoadSchedule = false

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

    /// قائمة الجولات + الجولة الحالية، ثم مباريات الجولة المختارة — تحميل كسل
    /// (لا كلفة على من لا يفتح التبويب) مع إبقاء آخر اختيار عند العودة.
    func loadSchedule(force: Bool = false) async {
        if loadingSchedule { return }
        if didLoadSchedule, !force { return }
        loadingSchedule = true
        defer { loadingSchedule = false }
        do {
            let res = try await APIClient.shared.fetchRoshnRounds(ignoreCache: force)
            rounds = res.rounds
            currentRoundKey = res.current
            let invalid = selectedRoundKey.map { key in !res.rounds.contains(where: { $0.key == key }) } ?? true
            if !userPickedRound || selectedRoundKey == nil || invalid {
                selectedRoundKey = res.current ?? res.rounds.first?.key
            }
            didLoadSchedule = true
            scheduleError = nil
            if let key = selectedRoundKey {
                await loadRoundFixtures(key, force: force)
            }
        } catch {
            scheduleError = message(for: error)
        }
    }

    func selectRound(_ key: String) async {
        guard key != selectedRoundKey, !loadingRound else { return }
        userPickedRound = true
        selectedRoundKey = key
        await loadRoundFixtures(key)
    }

    func loadRoundFixtures(_ key: String, force: Bool = false) async {
        if loadingRound { return }
        loadingRound = true
        defer { loadingRound = false }
        do {
            roundFixtures = try await APIClient.shared.fetchRoshnRoundFixtures(key: key, ignoreCache: force)
            scheduleError = nil
        } catch {
            scheduleError = message(for: error)
        }
    }

    private func message(for error: Error) -> String {
        if let api = error as? APIError, let text = api.errorDescription { return text }
        return "تعذّر الاتصال بمصدر البيانات حاليًا"
    }
}

struct RoshnView: View {
    private let homeStore = RoshnHomeStore.shared
    @State private var store = RoshnHubStore()
    /// «التوقعات» صفحة مستقلة تُدفع فوق المركز (طلب المالك) — لا تبويبًا داخليًا.
    @State private var showPredictions = false
    @State private var tab: Tab = .matches
    /// معرّف غير اختياري + Binding حي في الورقة — iOS 26 يلتقط قيمة
    /// @State الاختيارية القديمة داخل closure الورقة عند أول فتح فتظهر
    /// ورقة بيضاء (العلاج الموثق في sports-tournaments/SYSTEM.md).
    @State private var selectedFixtureId = 0
    @State private var showMatchCenter = false
    @State private var selectedTeam: RsTeam?

    enum Tab: String, CaseIterable {
        case matches = "المباريات"
        case standings = "الترتيب"
        case races = "الهدّافون"
        case schedule = "الجدول"

        var icon: String {
            switch self {
            case .matches: "calendar"
            case .standings: "list.number"
            case .races: "trophy.fill"
            case .schedule: "list.bullet.rectangle"
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
                case .schedule: scheduleTab
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
        // متصفّح الجولات كسل: لا يُطلب إلا عند فتح تبويب «الجدول» أول مرة.
        .task(id: tab) {
            if tab == .schedule { await store.loadSchedule() }
        }
        .refreshable {
            await homeStore.refreshLive()
            async let matches: Void = store.loadMatches(force: true)
            async let standings: Void = store.loadStandings(force: true)
            async let races: Void = store.loadRaces(hero: homeStore.hero, force: true)
            _ = await (matches, standings, races)
            if store.didLoadSchedule { await store.loadSchedule(force: true) }
        }
        .sheet(isPresented: $showMatchCenter) {
            RoshnMatchCenterSheet(fixtureId: $selectedFixtureId)
                .presentationDetents([.large])
                .presentationDragIndicator(.visible)
        }
        .navigationDestination(item: $selectedTeam) { team in
            RoshnTeamView(teamId: team.id, previewName: team.name, previewLogo: team.logo)
        }
        .navigationDestination(isPresented: $showPredictions) {
            RoshnPredictionsView()
        }
    }

    // MARK: الترويسة — ضباب صباحي ناعم (هوية «صباح الملعب»)

    private var header: some View {
        ZStack {
            RoshnTheme.hero

            // خطوط ملعب بيضاء خافتة على الزمردي الصلب.
            Circle()
                .stroke(.white.opacity(0.14), lineWidth: 1)
                .frame(width: 190, height: 190)
                .offset(x: 135, y: 40)
            Rectangle()
                .stroke(.white.opacity(0.10), lineWidth: 1)
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
                        .shadow(color: RoshnTheme.navyDeep.opacity(0.18), radius: 8, y: 4)

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
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 10)
                        .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(RoshnTheme.heroChip))
                    }
                }
            }
            .padding(17)
        }
        .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
        .shadow(color: RoshnTheme.cardShadow, radius: 14, y: 7)
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
        .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(RoshnTheme.heroChip))
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
                            Capsule().fill(tab == item ? RoshnTheme.ink : RoshnTheme.card)
                        )
                        .shadow(color: RoshnTheme.cardShadow, radius: 3, y: 1)
                    }
                    .buttonStyle(.plain)
                }

                // «التوقعات» بوابة لصفحة مستقلة — تمييزها بالذهبي لا بحالة تفعيل.
                if homeStore.hero?.predictionsEnabled ?? false {
                    Button {
                        showPredictions = true
                    } label: {
                        HStack(spacing: 6) {
                            Image(systemName: "target")
                                .font(SabqFonts.app(size: 11, weight: .medium))
                            Text("التوقعات")
                                .font(SabqFonts.app(size: 13, weight: .semibold))
                        }
                        .foregroundStyle(.white)
                        .padding(.horizontal, 15).padding(.vertical, 10)
                        .background(Capsule().fill(RoshnTheme.gold))
                        .shadow(color: RoshnTheme.cardShadow, radius: 3, y: 1)
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
                                Circle().fill(RoshnTheme.gold).frame(width: 6, height: 6)
                                Text(day)
                                    .font(SabqFonts.app(size: 12, weight: .semibold))
                                    .foregroundStyle(RoshnTheme.sky)
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
                                    selectedFixtureId = fixture.id
                                    showMatchCenter = true
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

    // MARK: تبويب الجدول — متصفّح الجولات الـ٣٤ (كل مباريات الموسم)

    private var scheduleTab: some View {
        VStack(spacing: 10) {
            sectionHeading("جدول الموسم", subtitle: "كل مباريات الدوري جولةً بجولة", icon: "list.bullet.rectangle")

            if let error = store.scheduleError, store.rounds.isEmpty {
                retryBanner(error) { Task { await store.loadSchedule(force: true) } }
            }

            if store.loadingSchedule, store.rounds.isEmpty {
                loadingRows(count: 6, height: 74)
            } else if store.rounds.isEmpty {
                emptyState(icon: "calendar", text: "جدول الموسم يُعلن قريبًا — ستجده هنا فور اعتماده")
            } else {
                roundPicker
                roundFixturesList
            }
        }
    }

    /// شريط الجولات الأفقي — يفتتح على الجولة الحالية ويتمرّك حول المختارة.
    private var roundPicker: some View {
        ScrollViewReader { proxy in
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    ForEach(store.rounds) { round in
                        let selected = round.key == store.selectedRoundKey
                        Button {
                            Task { await store.selectRound(round.key) }
                            withAnimation(.easeInOut(duration: 0.2)) {
                                proxy.scrollTo(round.key, anchor: .center)
                            }
                        } label: {
                            Text(round.label)
                                .font(SabqFonts.app(size: 12, weight: selected ? .semibold : .regular))
                                .foregroundStyle(selected ? .white : RoshnTheme.inkSoft)
                                .padding(.horizontal, 12).padding(.vertical, 8)
                                .background(Capsule().fill(selected ? RoshnTheme.sky : RoshnTheme.card))
                                .shadow(color: RoshnTheme.cardShadow, radius: 3, y: 1)
                        }
                        .buttonStyle(.plain)
                        .id(round.key)
                    }
                }
                .padding(.vertical, 2)
            }
            .onAppear { proxy.scrollTo(store.selectedRoundKey ?? "", anchor: .center) }
            .onChange(of: store.rounds.count) { _, _ in
                // وصول القائمة بعد ظهور الشريط: انتقل فورًا إلى الجولة الحالية.
                proxy.scrollTo(store.selectedRoundKey ?? "", anchor: .center)
            }
        }
    }

    @ViewBuilder
    private var roundFixturesList: some View {
        if let error = store.scheduleError, store.roundFixtures.isEmpty {
            retryBanner(error) {
                Task {
                    if let key = store.selectedRoundKey { await store.loadRoundFixtures(key, force: true) }
                }
            }
        }
        if store.loadingRound {
            loadingRows(count: 5, height: 74)
        } else if store.roundFixtures.isEmpty {
            emptyState(icon: "calendar", text: "مباريات هذه الجولة تُعلن قريبًا")
        } else {
            LazyVStack(spacing: 8) {
                ForEach(store.roundFixtures) { fixture in
                    RoshnMatchRow(fixture: fixture) {
                        selectedFixtureId = fixture.id
                        showMatchCenter = true
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
        .background(RoundedRectangle(cornerRadius: 13, style: .continuous).fill(RoshnTheme.goldSoft.opacity(0.75)))
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
            .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(RoshnTheme.card))
            .shadow(color: RoshnTheme.cardShadow, radius: 6, y: 3)
        }
        .buttonStyle(.plain)
    }

    private func teamSide(_ team: RsTeam, alignment: Alignment) -> some View {
        HStack(spacing: 7) {
            if alignment == .leading {
                WCRemoteImage(url: team.logo)
                    .padding(2).frame(width: 30, height: 30)
                    .background(Circle().fill(.white))
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
            }
        }
        .frame(maxWidth: .infinity)
    }

    private var center: some View {
        VStack(spacing: 3) {
            if fixture.started {
                // النتيجة داخل قرص ملوّن مسطّح: زمردي للمنتهية وأحمر للحية.
                Text("\(fixture.goals.away ?? 0) - \(fixture.goals.home ?? 0)")
                    .font(SabqFonts.app(size: 15, weight: .bold))
                    .foregroundStyle(.white)
                    .monospacedDigit()
                    .environment(\.layoutDirection, .leftToRight)
                    .padding(.horizontal, 9).padding(.vertical, 3)
                    .background(
                        RoundedRectangle(cornerRadius: 9, style: .continuous)
                            .fill(fixture.status.live ? RoshnTheme.liveRed : RoshnTheme.sky)
                    )
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
        .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(RoshnTheme.card))
        .shadow(color: RoshnTheme.cardShadow, radius: 4, y: 2)
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
                    .shadow(color: RoshnTheme.cardShadow, radius: 4, y: 2)
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
                            .overlay(Circle().stroke(champion ? RoshnTheme.gold : Color.clear, lineWidth: champion ? 3 : 0))
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
                .shadow(color: RoshnTheme.cardShadow, radius: 5, y: 2)
            }
        }
        .padding(.vertical, 4)
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
        .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(RoshnTheme.card))
        .shadow(color: RoshnTheme.cardShadow, radius: 4, y: 2)
    }
}


// MARK: - توقعات روشن — صفحة مستقلة على المنصة المركزية (rsl على predictions-core)

@Observable
@MainActor
final class RoshnPredictionsStore {
    var contests: [PredContest] = []
    var leaderboard: PredLeaderboardResponse?
    var rule: PredRule?
    var slug: String?
    var loading = false
    var error: String?
    var savingId: String?
    var savedId: String?
    private(set) var didLoad = false

    // «سجلّي» — دفتر النقاط، كسول ويتطلب جلسة عضو.
    var ledger: [PredLedgerItem] = []
    var ledgerLoading = false
    var ledgerError: String?
    private(set) var didLoadLedger = false

    func load(force: Bool = false) async {
        if loading { return }
        if didLoad, !force { return }
        loading = true
        defer { loading = false }
        do {
            // اكتشاف المعرّف من الخادم لا ثابت مزروع — نفس ما يفعله مركز أندرويد.
            if slug == nil {
                let comps = try await APIClient.shared.fetchPredCompetitions()
                slug = comps.first(where: { $0.slug.hasPrefix("rsl") })?.slug
                    ?? comps.first(where: { ($0.nameAr ?? "").contains("روشن") })?.slug
            }
            guard let slug else {
                didLoad = true
                error = "مسابقة توقعات الدوري لم تُفعَّل بعد"
                return
            }
            async let contestsTask = APIClient.shared.fetchPredContests(slug: slug, ignoreCache: force)
            async let boardTask: PredLeaderboardResponse? = try? await APIClient.shared.fetchPredLeaderboard(slug: slug, ignoreCache: force)
            contests = try await contestsTask
            leaderboard = await boardTask
            error = nil
            didLoad = true
            // ملف الاحتساب لصفحة «طريقة التوقعات» — من أول مباراة، ومرة واحدة.
            if rule == nil, let first = contests.first {
                rule = try? await APIClient.shared.fetchPredContestRule(contestId: first.id)
            }
        } catch {
            self.error = "تعذّر تحميل التوقعات حاليًا — أعد المحاولة بعد لحظات"
        }
    }

    func submit(contest: PredContest, home: Int, away: Int) async {
        guard savingId == nil else { return }
        savingId = contest.id
        defer { savingId = nil }
        do {
            _ = try await APIClient.shared.submitPredEntry(contestId: contest.id, home: home, away: away)
            // ثبّت التوقع محليًا بلا إعادة تحميل كاملة (لا وميض للقائمة).
            contests = contests.map { c in
                guard c.id == contest.id else { return c }
                return PredContest(
                    id: c.id, contestType: c.contestType, status: c.status, locksAt: c.locksAt,
                    metadata: c.metadata, result: c.result, entriesCount: c.entriesCount,
                    myEntry: PredMyEntry(id: c.myEntry?.id ?? "mine", payload: PredScorePayload(predHome: home, predAway: away))
                )
            }
            savedId = contest.id
            error = nil
        } catch APIError.unauthorized {
            self.error = "سجّل دخولك من تبويب الحساب للمشاركة في التوقعات"
        } catch {
            self.error = "تعذّر حفظ التوقع — أعد المحاولة"
        }
    }

    func loadLedger(force: Bool = false) async {
        if ledgerLoading { return }
        if didLoadLedger, !force { return }
        ledgerLoading = true
        defer { ledgerLoading = false }
        do {
            // المعرّف قد لا يكون مكتشفًا بعد إن فُتح التبويب قبل اكتمال load().
            if slug == nil { await load() }
            guard let slug else { return }
            ledger = try await APIClient.shared.fetchPredLedger(slug: slug, ignoreCache: force)
            ledgerError = nil
            didLoadLedger = true
        } catch APIError.unauthorized {
            ledgerError = "سجّل دخولك من تبويب الحساب لعرض سجل توقعاتك ونقاطك"
        } catch {
            ledgerError = "تعذّر تحميل سجلك حاليًا — أعد المحاولة بعد لحظات"
        }
    }
}

/// صفحة التوقعات المستقلة — تُدفع من مركز روشن، بثلاثة تبويبات:
/// المباريات (توقّع + الأخيرة) / المتصدرون / طريقة التوقعات.
struct RoshnPredictionsView: View {
    @State private var store = RoshnPredictionsStore()
    @State private var tab: Tab = .matches
    @State private var drafts: [String: [Int]] = [:]

    enum Tab: String, CaseIterable {
        case matches = "المباريات"
        case ledger = "نقاطي"
        case leaders = "المتصدرون"
        case how = "الطريقة"

        var icon: String {
            switch self {
            case .matches: "target"
            case .ledger: "star.circle"
            case .leaders: "medal.fill"
            case .how: "questionmark.circle"
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
                case .ledger: ledgerTab
                case .leaders: leadersTab
                case .how: howTab
                }
            }
            .padding(.horizontal, 14)
            .padding(.bottom, 28)
        }
        .background(RoshnTheme.canvas)
        .environment(\.layoutDirection, .rightToLeft)
        .environment(\.locale, RsFormat.latinLocale)
        .navigationTitle("توقعات دوري روشن")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            await store.load()
            // جلبة واحدة انتهازية للدفتر — تغذي «دقّتي» في الهيرو وشبكة الحصاد
            // (401 بلا جلسة يمر بصمت وتظهر دعوة الدخول عند فتح «نقاطي»).
            await store.loadLedger()
        }
        .refreshable {
            await store.load(force: true)
            if store.didLoadLedger { await store.loadLedger(force: true) }
        }
    }

    // MARK: الترويسة — زمردية بخط ذهبي، مع نقاط العضو ومركزه

    private var header: some View {
        VStack(spacing: 12) {
            HStack(spacing: 13) {
                Image(systemName: "target")
                    .font(SabqFonts.app(size: 26, weight: .medium))
                    .foregroundStyle(.white)
                    .frame(width: 56, height: 56)
                    .background(RoundedRectangle(cornerRadius: 15, style: .continuous).fill(.white.opacity(0.16)))

                VStack(alignment: .leading, spacing: 4) {
                    Text("توقّع وتنافس")
                        .font(SabqFonts.app(size: 21, weight: .bold))
                        .foregroundStyle(.white)
                    Text("توقّع نتائج الجولة ونافس على نقاط الموسم")
                        .font(SabqFonts.app(size: 11))
                        .foregroundStyle(.white.opacity(0.85))
                        .lineLimit(1).minimumScaleFactor(0.8)
                }
                Spacer(minLength: 0)
            }

            if APIClient.shared.hasSession {
                // المسجّل يرى بطاقاته الثلاث دائمًا — أصفار/شرطات قبل أول تسوية
                // (myRank لا يوجد إلا بعد تسويات، فلا يُشترط لعرض البطاقات).
                let my = store.leaderboard?.myRank
                HStack(spacing: 8) {
                    heroStat(value: RsFormat.latin(my?.points ?? 0), label: "نقطة حصدتها")
                    heroStat(value: my.map { RsFormat.latin($0.rank) } ?? "—", label: "مركزي")
                    heroStat(value: accuracyPercent.map { "\(RsFormat.latin($0))٪" } ?? "—", label: "دقّتي")
                }
                if let my, let (fraction, label) = raceProgress(my: my) {
                    VStack(spacing: 4) {
                        GeometryReader { geo in
                            ZStack(alignment: .leading) {
                                Capsule().fill(.white.opacity(0.14))
                                Capsule().fill(RoshnTheme.gold)
                                    .frame(width: max(geo.size.width * fraction, 8))
                            }
                        }
                        .frame(height: 6)
                        Text(label)
                            .font(SabqFonts.app(size: 9.5))
                            .foregroundStyle(.white.opacity(0.9))
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                } else {
                    Text("نقاطك تبدأ مع أول تسوية — توقّع الجولة كاملة وعُد بعد الصافرة")
                        .font(SabqFonts.app(size: 9.5))
                        .foregroundStyle(.white.opacity(0.9))
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            } else {
                // بلا جلسة فقط: دعوة تسجيل الدخول بدل الأرقام.
                Text("سجّل دخولك وتوقّع نتائج الجولة ونافس على نقاط الموسم")
                    .font(SabqFonts.app(size: 11, weight: .semibold))
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 9)
                    .background(RoundedRectangle(cornerRadius: 11, style: .continuous).fill(.white.opacity(0.16)))
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity)
        .background(RoshnTheme.hero)
        .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
        .overlay(alignment: .top) {
            RoundedRectangle(cornerRadius: 2)
                .fill(RoshnTheme.gold)
                .frame(height: 3)
                .padding(.horizontal, 40)
        }
        .shadow(color: RoshnTheme.cardShadow, radius: 12, y: 6)
    }

    private func heroStat(value: String, label: String) -> some View {
        HStack(spacing: 6) {
            Text(value).font(SabqFonts.app(size: 15, weight: .bold)).monospacedDigit()
            Text(label).font(SabqFonts.app(size: 10.5))
        }
        .foregroundStyle(.white)
        .frame(maxWidth: .infinity)
        .padding(.vertical, 8)
        .background(RoundedRectangle(cornerRadius: 11, style: .continuous).fill(.white.opacity(0.16)))
    }

    private var tabBar: some View {
        HStack(spacing: 6) {
            ForEach(Tab.allCases, id: \.self) { item in
                Button {
                    withAnimation(.easeInOut(duration: 0.2)) { tab = item }
                } label: {
                    HStack(spacing: 5) {
                        Image(systemName: item.icon)
                            .font(SabqFonts.app(size: 10, weight: .medium))
                        Text(item.rawValue)
                            .font(SabqFonts.app(size: 12, weight: tab == item ? .semibold : .regular))
                            .lineLimit(1).minimumScaleFactor(0.8)
                    }
                    .foregroundStyle(tab == item ? .white : RoshnTheme.inkSoft)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 9)
                    .background(RoundedRectangle(cornerRadius: 11, style: .continuous).fill(tab == item ? RoshnTheme.ink : RoshnTheme.card))
                    .shadow(color: RoshnTheme.cardShadow, radius: 3, y: 1)
                }
                .buttonStyle(.plain)
            }
        }
    }

    // MARK: مشتقات الحصاد — من الدفتر ومباريات المسابقة (صفر تغيير خادم)

    private var hitLedger: [PredLedgerItem] {
        store.ledger.filter { ["exact", "margin", "outcome"].contains($0.reasonCode) }
    }

    /// توقعاتي المُسوّاة = مباريات المسابقة التي لي فيها توقع وحُسمت.
    private var settledMineCount: Int {
        store.contests.filter { $0.myEntry != nil && $0.status == "settled" }.count
    }

    private var accuracyPercent: Int? {
        let settled = settledMineCount
        guard settled > 0 else { return nil }
        return Int((Double(hitLedger.count) / Double(settled) * 100).rounded())
    }

    /// شريط السباق: خارج العشرة → المسافة للعاشر؛ داخلها → المسافة للصدارة.
    private func raceProgress(my: PredMyRank) -> (Double, String)? {
        let entries = store.leaderboard?.entries ?? []
        guard !entries.isEmpty, my.points >= 0 else { return nil }
        if my.rank == 1 {
            return (1.0, "أنت في الصدارة 👑 — حافظ عليها بتوقّع كل جولة")
        }
        let target: Int
        let targetLabel: String
        if my.rank <= 10 {
            target = entries.first?.points ?? my.points
            targetLabel = "الصدارة"
        } else {
            target = (entries.count >= 10 ? entries[9].points : entries.last?.points ?? my.points)
            targetLabel = "العاشر"
        }
        guard target > 0 else { return nil }
        let gap = max(target - my.points, 0)
        let fraction = min(max(Double(my.points) / Double(target), 0), 1)
        return gap == 0
            ? (1.0, "لامست \(targetLabel) — تسوية واحدة تحسمها")
            : (fraction, "يفصلك \(RsFormat.latin(gap)) نقطة عن \(targetLabel) — توقّع الجولة كاملة")
    }

    // MARK: تبويب المباريات

    private var openContests: [PredContest] {
        store.contests.filter { $0.isMatchScore && $0.isOpen }
            .sorted { ($0.locksAtDate ?? .distantFuture) < ($1.locksAtDate ?? .distantFuture) }
    }

    private var settledContests: [PredContest] {
        store.contests.filter { $0.isMatchScore && ($0.status == "settled" || $0.status == "locked" || $0.status == "ready") }
            .sorted { ($0.locksAtDate ?? .distantPast) > ($1.locksAtDate ?? .distantPast) }
    }

    @ViewBuilder
    private var matchesTab: some View {
        VStack(spacing: 10) {
            if let error = store.error {
                errorBanner(error)
            }

            // تقدّم الجولة: كم مباراة مفتوحة توقّعتها — يدفع لإكمالها.
            let openAll = openContests
            let openMine = openAll.filter { $0.myEntry?.payload != nil }.count
            if openAll.count > 1, APIClient.shared.hasSession {
                HStack(spacing: 8) {
                    Image(systemName: "checklist")
                        .font(SabqFonts.app(size: 12, weight: .medium))
                        .foregroundStyle(RoshnTheme.sky)
                    Text("توقعاتك هذه الجولة: \(RsFormat.latin(openMine)) من \(RsFormat.latin(openAll.count))")
                        .font(SabqFonts.app(size: 12, weight: .semibold))
                        .foregroundStyle(RoshnTheme.ink)
                    Spacer()
                    if openMine < openAll.count {
                        Text("أكملها 👇")
                            .font(SabqFonts.app(size: 10.5))
                            .foregroundStyle(RoshnTheme.inkSoft)
                    } else {
                        Text("اكتملت ✓")
                            .font(SabqFonts.app(size: 10.5, weight: .semibold))
                            .foregroundStyle(RoshnTheme.pitch)
                    }
                }
                .padding(11)
                .background(RoundedRectangle(cornerRadius: 13, style: .continuous).fill(RoshnTheme.skySoft.opacity(0.6)))
            }

            if store.loading, store.contests.isEmpty {
                VStack(spacing: 8) {
                    ForEach(0..<4, id: \.self) { _ in
                        RoundedRectangle(cornerRadius: 14, style: .continuous)
                            .fill(RoshnTheme.skySoft.opacity(0.5))
                            .frame(height: 110)
                    }
                }
            } else if openContests.isEmpty, settledContests.isEmpty, store.error == nil {
                emptyState("مباريات التوقع تُفتح قبل كل جولة — عُد قريبًا")
            }

            ForEach(openContests) { contest in
                openContestCard(contest)
            }

            if !settledContests.isEmpty {
                sectionLabel("آخر المباريات")
                ForEach(settledContests.prefix(8)) { contest in
                    settledContestRow(contest)
                }
            }
        }
    }

    // MARK: تبويب نقاطي — حصاد الموسم + سجلّ التسويات

    private func harvestTile(value: String, label: String, tint: Color) -> some View {
        VStack(spacing: 4) {
            Text(value)
                .font(SabqFonts.app(size: 16, weight: .bold))
                .foregroundStyle(tint)
                .monospacedDigit()
            Text(label)
                .font(SabqFonts.app(size: 9))
                .foregroundStyle(RoshnTheme.inkSoft)
                .lineLimit(1).minimumScaleFactor(0.8)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 9)
        .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(RoshnTheme.card))
        .shadow(color: RoshnTheme.cardShadow, radius: 4, y: 2)
    }

    @ViewBuilder
    private var harvestGrid: some View {
        let exact = store.ledger.filter { $0.reasonCode == "exact" }.count
        let margin = store.ledger.filter { $0.reasonCode == "margin" }.count
        let outcome = store.ledger.filter { $0.reasonCode == "outcome" }.count
        let best = store.ledger.map(\.points).max() ?? 0
        VStack(spacing: 7) {
            HStack(spacing: 7) {
                harvestTile(value: RsFormat.latin(settledMineCount), label: "توقعًا مُسوّى", tint: RoshnTheme.ink)
                harvestTile(value: RsFormat.latin(exact), label: "نتيجة دقيقة 🎯", tint: RoshnTheme.gold)
                harvestTile(value: RsFormat.latin(margin), label: "فارق صحيح", tint: RoshnTheme.ink)
            }
            HStack(spacing: 7) {
                harvestTile(value: RsFormat.latin(outcome), label: "اتجاه صحيح", tint: RoshnTheme.ink)
                harvestTile(value: accuracyPercent.map { "\(RsFormat.latin($0))٪" } ?? "—", label: "نسبة الإصابة", tint: RoshnTheme.pitch)
                harvestTile(value: RsFormat.latin(best), label: "أفضل تسوية", tint: RoshnTheme.gold)
            }
        }
    }

    @ViewBuilder
    private var ledgerTab: some View {
        VStack(spacing: 10) {
            if let error = store.ledgerError {
                HStack(spacing: 9) {
                    Image(systemName: "person.crop.circle.badge.exclamationmark")
                        .foregroundStyle(RoshnTheme.gold)
                    Text(error)
                        .font(SabqFonts.app(size: 11)).foregroundStyle(RoshnTheme.inkSoft)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    Button("إعادة") { Task { await store.loadLedger(force: true) } }
                        .font(SabqFonts.app(size: 11, weight: .semibold))
                        .foregroundStyle(RoshnTheme.sky)
                }
                .padding(11)
                .background(RoundedRectangle(cornerRadius: 13, style: .continuous).fill(RoshnTheme.goldSoft.opacity(0.75)))
            }

            if store.ledgerLoading, store.ledger.isEmpty {
                VStack(spacing: 8) {
                    ForEach(0..<6, id: \.self) { _ in
                        RoundedRectangle(cornerRadius: 13, style: .continuous)
                            .fill(RoshnTheme.skySoft.opacity(0.5))
                            .frame(height: 52)
                    }
                }
            } else if store.ledger.isEmpty, store.ledgerError == nil {
                emptyState("حصادك يبدأ مع أول تسوية — توقّع مباريات الجولة وعُد بعد صافرة النهاية")
            } else {
                if let my = store.leaderboard?.myRank {
                    HStack(spacing: 8) {
                        Image(systemName: "sum").foregroundStyle(RoshnTheme.gold)
                        Text("مجموع ما حصدته هذا الموسم")
                            .font(SabqFonts.app(size: 12)).foregroundStyle(RoshnTheme.ink)
                        Spacer()
                        Text("\(RsFormat.latin(my.points)) نقطة")
                            .font(SabqFonts.app(size: 14, weight: .bold)).foregroundStyle(RoshnTheme.sky)
                            .monospacedDigit()
                    }
                    .padding(12)
                    .background(RoundedRectangle(cornerRadius: 13, style: .continuous).fill(RoshnTheme.goldSoft))
                }

                sectionLabel("حصاد الموسم")
                harvestGrid

                sectionLabel("سجلّ التسويات")
                ForEach(store.ledger) { item in
                    ledgerRow(item)
                }
            }
        }
    }

    private func ledgerRow(_ item: PredLedgerItem) -> some View {
        // اسم الفريقين من مباريات المسابقة المحمّلة (ربط contestId)،
        // والنتيجة/التوقع من تفكيك التسوية — أرقام مفصولة لا نص خام.
        let contest = store.contests.first(where: { $0.id == item.contestId })
        let final = item.breakdown?.finalPair
        let predicted = item.breakdown?.predictionPair

        let (icon, iconTint): (String, Color) = switch item.reasonCode {
        case "exact": ("target", RoshnTheme.gold)
        case "margin": ("ruler", RoshnTheme.sky)
        case "outcome": ("checkmark.seal.fill", RoshnTheme.pitch)
        default: ("star.fill", RoshnTheme.inkSoft)
        }

        return HStack(spacing: 10) {
            Image(systemName: icon)
                .font(SabqFonts.app(size: 14, weight: .medium))
                .foregroundStyle(iconTint)
                .frame(width: 30, height: 30)
                .background(Circle().fill(RoshnTheme.pitchSoft))

            VStack(alignment: .leading, spacing: 3) {
                if let contest, let final {
                    // سطر المباراة: [مضيف][نتيجته]-[نتيجة الضيف][ضيف] — RTL طبيعي.
                    HStack(spacing: 5) {
                        Text(contest.metadata?.home?.name ?? "—")
                            .font(SabqFonts.app(size: 12, weight: .semibold))
                            .foregroundStyle(RoshnTheme.ink)
                            .lineLimit(1).minimumScaleFactor(0.7)
                        splitScore(home: final.home, away: final.away, emphasized: false)
                        Text(contest.metadata?.away?.name ?? "—")
                            .font(SabqFonts.app(size: 12, weight: .semibold))
                            .foregroundStyle(RoshnTheme.ink)
                            .lineLimit(1).minimumScaleFactor(0.7)
                    }
                }
                HStack(spacing: 4) {
                    Text(item.reasonLabelAr.isEmpty ? "تسوية توقع" : item.reasonLabelAr)
                        .font(SabqFonts.app(size: contest != nil ? 10 : 12.5,
                                            weight: contest != nil ? .regular : .semibold))
                        .foregroundStyle(contest != nil ? RoshnTheme.inkSoft : RoshnTheme.ink)
                        .lineLimit(2)
                    if let predicted {
                        Text("· توقعت")
                            .font(SabqFonts.app(size: 9)).foregroundStyle(RoshnTheme.inkSoft)
                        splitScore(home: predicted.home, away: predicted.away, emphasized: false)
                    }
                }
                if let date = item.createdAtDate {
                    Text(RsFormat.day(iso: item.createdAt) + " · " + WCFormat.timeRiyadh.string(from: date))
                        .font(SabqFonts.app(size: 9.5))
                        .foregroundStyle(RoshnTheme.inkSoft)
                }
            }

            Spacer(minLength: 6)

            // نقاط التسوية — رقم واحد فلا التباس؛ علامة + قبله بعزل سليم.
            HStack(spacing: 1) {
                Text("+").font(SabqFonts.app(size: 12, weight: .bold))
                Text(RsFormat.latin(item.points))
                    .font(SabqFonts.app(size: 14, weight: .bold))
                    .monospacedDigit()
            }
            .foregroundStyle(.white)
            .padding(.horizontal, 9).padding(.vertical, 4)
            .background(RoundedRectangle(cornerRadius: 9, style: .continuous).fill(RoshnTheme.sky))
        }
        .padding(.horizontal, 12).padding(.vertical, 9)
        .background(RoundedRectangle(cornerRadius: 13, style: .continuous).fill(RoshnTheme.card))
        .shadow(color: RoshnTheme.cardShadow, radius: 4, y: 2)
    }

    // MARK: تبويب المتصدرين

    @ViewBuilder
    private var leadersTab: some View {
        VStack(spacing: 10) {
            if let error = store.error {
                errorBanner(error)
            }
            let entries = store.leaderboard?.entries ?? []
            if store.loading, entries.isEmpty {
                VStack(spacing: 8) {
                    ForEach(0..<8, id: \.self) { _ in
                        RoundedRectangle(cornerRadius: 13, style: .continuous)
                            .fill(RoshnTheme.skySoft.opacity(0.5))
                            .frame(height: 48)
                    }
                }
            } else if entries.isEmpty {
                emptyState("الصدارة تتشكّل مع أول جولة توقعات — كن أول المتنافسين")
            } else {
                ForEach(entries.prefix(20)) { entry in
                    leaderRow(entry)
                }
            }
        }
    }

    // MARK: تبويب طريقة التوقعات

    @ViewBuilder
    private var howTab: some View {
        VStack(spacing: 10) {
            // ملف الاحتساب الفعّال من الخادم — لا نص ثابت يتقادم.
            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 7) {
                    Image(systemName: "star.circle.fill")
                        .font(SabqFonts.app(size: 15, weight: .medium))
                        .foregroundStyle(RoshnTheme.gold)
                    Text("نظام النقاط")
                        .font(SabqFonts.app(size: 15, weight: .bold))
                        .foregroundStyle(RoshnTheme.ink)
                }
                Text(store.rule?.summaryAr ?? "تُحتسب النقاط بعد صافرة نهاية كل مباراة وتُضاف لرصيدك تلقائيًا")
                    .font(SabqFonts.app(size: 13))
                    .foregroundStyle(RoshnTheme.ink)
                    .lineSpacing(5)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(14)
            .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(RoshnTheme.goldSoft))

            VStack(alignment: .leading, spacing: 14) {
                howStep(number: 1, icon: "square.and.pencil",
                        title: "اختر نتيجة المباراة",
                        text: "حدد أهداف كل فريق قبل انطلاق المباراة — التوقع يُقفل عند صافرة البداية")
                howStep(number: 2, icon: "arrow.triangle.2.circlepath",
                        title: "عدّل توقعك متى شئت",
                        text: "يمكنك تعديل توقعك بلا حدود حتى لحظة الإقفال، ويُعتمد آخر توقع محفوظ")
                howStep(number: 3, icon: "checkmark.seal.fill",
                        title: "النقاط تُحتسب تلقائيًا",
                        text: "بعد صافرة النهاية تُوزَّع نقاط المباراة على المصيبين وتُضاف لرصيد موسمك")
                howStep(number: 4, icon: "trophy.fill",
                        title: "نافس على صدارة الموسم",
                        text: "رصيدك التراكمي يحدد مركزك بين المتنافسين في تبويب المتصدرين")
            }
            .padding(14)
            .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(RoshnTheme.card))
            .shadow(color: RoshnTheme.cardShadow, radius: 5, y: 2)

            HStack(spacing: 9) {
                Image(systemName: "person.crop.circle.badge.checkmark")
                    .foregroundStyle(RoshnTheme.sky)
                Text("المشاركة تتطلب تسجيل الدخول بحسابك في سبق — التصفح متاح للجميع")
                    .font(SabqFonts.app(size: 11))
                    .foregroundStyle(RoshnTheme.inkSoft)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(11)
            .background(RoundedRectangle(cornerRadius: 13, style: .continuous).fill(RoshnTheme.skySoft.opacity(0.6)))
        }
    }

    private func howStep(number: Int, icon: String, title: String, text: String) -> some View {
        HStack(alignment: .top, spacing: 11) {
            ZStack {
                Circle().fill(RoshnTheme.skySoft)
                Image(systemName: icon)
                    .font(SabqFonts.app(size: 13, weight: .medium))
                    .foregroundStyle(RoshnTheme.sky)
            }
            .frame(width: 34, height: 34)

            VStack(alignment: .leading, spacing: 3) {
                Text("\(RsFormat.latin(number)). \(title)")
                    .font(SabqFonts.app(size: 13.5, weight: .bold))
                    .foregroundStyle(RoshnTheme.ink)
                Text(text)
                    .font(SabqFonts.app(size: 11.5))
                    .foregroundStyle(RoshnTheme.inkSoft)
                    .lineSpacing(3)
            }
        }
    }

    // MARK: عناصر مشتركة

    private func sectionLabel(_ title: String) -> some View {
        HStack(spacing: 6) {
            Circle().fill(RoshnTheme.gold).frame(width: 6, height: 6)
            Text(title)
                .font(SabqFonts.app(size: 12, weight: .semibold))
                .foregroundStyle(RoshnTheme.sky)
            Spacer()
        }
        .padding(.top, 4)
    }

    private func errorBanner(_ message: String) -> some View {
        HStack(spacing: 9) {
            Image(systemName: "info.circle").foregroundStyle(RoshnTheme.gold)
            Text(message)
                .font(SabqFonts.app(size: 11)).foregroundStyle(RoshnTheme.inkSoft)
                .frame(maxWidth: .infinity, alignment: .leading)
            Button("إعادة") { Task { await store.load(force: true) } }
                .font(SabqFonts.app(size: 11, weight: .semibold))
                .foregroundStyle(RoshnTheme.sky)
        }
        .padding(11)
        .background(RoundedRectangle(cornerRadius: 13, style: .continuous).fill(RoshnTheme.goldSoft.opacity(0.75)))
    }

    private func emptyState(_ text: String) -> some View {
        VStack(spacing: 10) {
            Image(systemName: "target")
                .font(SabqFonts.app(size: 28, weight: .light))
                .foregroundStyle(RoshnTheme.sky.opacity(0.6))
            Text(text)
                .font(SabqFonts.app(size: 13)).foregroundStyle(RoshnTheme.inkSoft)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 44)
    }

    private func openContestCard(_ contest: PredContest) -> some View {
        let draft = drafts[contest.id]
            ?? [contest.myEntry?.payload?.predHome ?? 0, contest.myEntry?.payload?.predAway ?? 0]
        return VStack(spacing: 10) {
            HStack(spacing: 10) {
                teamSide(contest.metadata?.home)
                VStack(spacing: 3) {
                    // المضيف يمينًا — درجتا التوقع بالضيف أولًا داخل عزل LTR.
                    HStack(spacing: 8) {
                        stepper(value: draft[0]) { drafts[contest.id] = [$0, draft[1]] }
                        Text("-").foregroundStyle(RoshnTheme.inkSoft)
                        stepper(value: draft[1]) { drafts[contest.id] = [draft[0], $0] }
                    }
                    if let date = contest.locksAtDate {
                        TimelineView(.periodic(from: .now, by: 60)) { _ in
                            Text(lockLabel(date))
                                .font(SabqFonts.app(size: 9.5)).foregroundStyle(RoshnTheme.inkSoft)
                        }
                    }
                    // عدّاد المتوقّعين — إثبات اجتماعي، رقم بلا أسماء (عقد #1326).
                    if let count = contest.entriesCount, count > 0 {
                        HStack(spacing: 4) {
                            Image(systemName: "person.2.fill")
                                .font(SabqFonts.app(size: 8, weight: .medium))
                            Text(predictorsLabel(count))
                                .font(SabqFonts.app(size: 9.5, weight: .medium))
                        }
                        .foregroundStyle(RoshnTheme.sky)
                    }
                }
                teamSide(contest.metadata?.away)
            }

            Button {
                Task { await store.submit(contest: contest, home: draft[0], away: draft[1]) }
            } label: {
                Text(buttonTitle(contest))
                    .font(SabqFonts.app(size: 12.5, weight: .semibold))
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 9)
                    .background(RoundedRectangle(cornerRadius: 11, style: .continuous).fill(RoshnTheme.sky))
            }
            .buttonStyle(.plain)
            .disabled(store.savingId != nil)
        }
        .padding(12)
        .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(RoshnTheme.card))
        .shadow(color: RoshnTheme.cardShadow, radius: 5, y: 2)
    }

    private func buttonTitle(_ contest: PredContest) -> String {
        if store.savingId == contest.id { return "جارٍ الحفظ…" }
        if store.savedId == contest.id { return "تم حفظ توقعك ✓" }
        return contest.myEntry?.payload == nil ? "احفظ توقعك" : "عدّل توقعك"
    }

    private func predictorsLabel(_ count: Int) -> String {
        switch count {
        case 1: return "متوقّع واحد"
        case 2: return "متوقّعان"
        case 3...10: return "\(RsFormat.latin(count)) متوقّعين"
        default: return "\(RsFormat.latin(count)) متوقّعًا"
        }
    }

    private func lockLabel(_ date: Date) -> String {
        let seconds = Int(date.timeIntervalSinceNow)
        if seconds <= 0 { return "أُغلق التوقع" }
        let days = seconds / 86_400
        let hours = (seconds % 86_400) / 3_600
        let minutes = (seconds % 3_600) / 60
        if days > 0 { return "يُقفل بعد \(days)ي \(hours)س" }
        if hours > 0 { return "يُقفل بعد \(hours)س \(minutes)د" }
        return "يُقفل بعد \(max(minutes, 1))د"
    }

    private func teamSide(_ team: PredTeamMeta?) -> some View {
        VStack(spacing: 5) {
            WCRemoteImage(url: team?.logo ?? "")
                .padding(3).frame(width: 40, height: 40)
                .background(Circle().fill(.white))
                .shadow(color: RoshnTheme.cardShadow, radius: 2, y: 1)
            Text(team?.name ?? "—")
                .font(SabqFonts.app(size: 11.5, weight: .semibold))
                .foregroundStyle(RoshnTheme.ink)
                .lineLimit(1).minimumScaleFactor(0.7)
        }
        .frame(maxWidth: .infinity)
    }

    private func stepper(value: Int, onChange: @escaping (Int) -> Void) -> some View {
        HStack(spacing: 6) {
            Button { onChange(min(value + 1, 20)) } label: {
                Image(systemName: "plus")
                    .font(SabqFonts.app(size: 10, weight: .bold)).foregroundStyle(RoshnTheme.sky)
                    .frame(width: 24, height: 24)
                    .background(Circle().fill(RoshnTheme.skySoft))
            }
            .buttonStyle(.plain)
            Text(RsFormat.latin(value))
                .font(SabqFonts.app(size: 20, weight: .bold)).foregroundStyle(RoshnTheme.ink)
                .monospacedDigit().frame(minWidth: 26)
            Button { onChange(max(value - 1, 0)) } label: {
                Image(systemName: "minus")
                    .font(SabqFonts.app(size: 10, weight: .bold)).foregroundStyle(RoshnTheme.inkSoft)
                    .frame(width: 24, height: 24)
                    .background(Circle().fill(RoshnTheme.skySoft.opacity(0.6)))
            }
            .buttonStyle(.plain)
        }
    }

    // MARK: نتيجة بأرقام مفصولة — درع الانقلاب
    //
    // كل رقم عنصر مستقل ملاصق لفريقه في صف RTL طبيعي (المضيف يمينًا دائمًا)
    // — لا زوج نصي داخل عزل LTR إطلاقًا، فلا يوجد ما ينقلب (قرار المالك
    // 2026-08-02 بعد تكرار أخطاء النتيجة المقلوبة).

    private func scoreNumber(_ value: Int, emphasized: Bool) -> some View {
        Text(RsFormat.latin(value))
            .font(SabqFonts.app(size: emphasized ? 13 : 10, weight: .bold))
            .foregroundStyle(emphasized ? .white : RoshnTheme.inkSoft)
            .monospacedDigit()
            .padding(.horizontal, emphasized ? 7 : 0).padding(.vertical, emphasized ? 2 : 0)
            .background(
                RoundedRectangle(cornerRadius: 7, style: .continuous)
                    .fill(emphasized ? RoshnTheme.sky : Color.clear)
            )
    }

    /// [مضيف][-][ضيف] في صف RTL: أول عنصر يظهر يمينًا — رقم المضيف تحت اسمه دائمًا.
    private func splitScore(home: Int, away: Int, emphasized: Bool = true) -> some View {
        HStack(spacing: 5) {
            scoreNumber(home, emphasized: emphasized)
            Text("-")
                .font(SabqFonts.app(size: emphasized ? 11 : 9))
                .foregroundStyle(RoshnTheme.inkSoft)
            scoreNumber(away, emphasized: emphasized)
        }
    }

    private func settledContestRow(_ contest: PredContest) -> some View {
        HStack(spacing: 10) {
            Text(contest.metadata?.home?.name ?? "—")
                .font(SabqFonts.app(size: 12, weight: .semibold)).foregroundStyle(RoshnTheme.ink)
                .lineLimit(1).frame(maxWidth: .infinity, alignment: .leading)
            VStack(spacing: 3) {
                if let r = contest.result, let fh = r.finalHome, let fa = r.finalAway {
                    splitScore(home: fh, away: fa)
                } else {
                    Text("بانتظار النتيجة")
                        .font(SabqFonts.app(size: 10)).foregroundStyle(RoshnTheme.inkSoft)
                }
                if let p = contest.myEntry?.payload, let ph = p.predHome, let pa = p.predAway {
                    HStack(spacing: 4) {
                        Text("توقعت")
                            .font(SabqFonts.app(size: 9)).foregroundStyle(RoshnTheme.inkSoft)
                        splitScore(home: ph, away: pa, emphasized: false)
                    }
                }
            }
            .frame(width: 104)
            Text(contest.metadata?.away?.name ?? "—")
                .font(SabqFonts.app(size: 12, weight: .semibold)).foregroundStyle(RoshnTheme.ink)
                .lineLimit(1).frame(maxWidth: .infinity, alignment: .trailing)
        }
        .padding(.horizontal, 12).padding(.vertical, 10)
        .background(RoundedRectangle(cornerRadius: 13, style: .continuous).fill(RoshnTheme.card))
        .shadow(color: RoshnTheme.cardShadow, radius: 4, y: 2)
    }

    private func leaderRow(_ entry: PredLeaderEntry) -> some View {
        HStack(spacing: 10) {
            ZStack {
                Circle().fill(entry.rank <= 3 ? RoshnTheme.goldSoft : RoshnTheme.skySoft.opacity(0.6))
                Text(RsFormat.latin(entry.rank))
                    .font(SabqFonts.app(size: 11, weight: .semibold))
                    .foregroundStyle(entry.rank <= 3 ? RoshnTheme.gold : RoshnTheme.inkSoft)
                    .monospacedDigit()
            }
            .frame(width: 24, height: 24)
            WCRemoteImage(url: entry.profileImageUrl ?? "")
                .frame(width: 30, height: 30)
                .background(Circle().fill(RoshnTheme.skySoft))
                .clipShape(Circle())
            Text(entry.name)
                .font(SabqFonts.app(size: 12.5, weight: .semibold)).foregroundStyle(RoshnTheme.ink)
                .lineLimit(1).frame(maxWidth: .infinity, alignment: .leading)
            Text("\(RsFormat.latin(entry.points)) نقطة")
                .font(SabqFonts.app(size: 12, weight: .bold)).foregroundStyle(RoshnTheme.sky)
                .monospacedDigit()
        }
        .padding(.horizontal, 12).padding(.vertical, 8)
        .background(RoundedRectangle(cornerRadius: 13, style: .continuous).fill(RoshnTheme.card))
        .shadow(color: RoshnTheme.cardShadow, radius: 4, y: 2)
    }
}
