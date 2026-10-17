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
            VStack(alignment: .leading, spacing: SabqLayout.space16) {
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
            .padding(.horizontal, SabqLayout.pageMargin)
            .padding(.top, SabqLayout.space8)
            .padding(.bottom, SabqLayout.space32)
        }
        .background(SabqTheme.background)
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
                .duoContentInsets()
        }
        .navigationDestination(isPresented: $showPredictions) {
            RoshnPredictionsView()
                .duoContentInsets()
        }
    }

    // MARK: الترويسة — شريط هوية زمردي مسطّح (نموذج سبق: لا تدرّج ولا ظل)

    private var header: some View {
        VStack(alignment: .leading, spacing: SabqLayout.space16) {
            HStack(spacing: SabqLayout.space12) {
                Image("RoshnLeagueLogo")
                    .resizable()
                    .scaledToFit()
                    .padding(SabqLayout.space8)
                    .frame(width: 56, height: 56)
                    .background(RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous).fill(.white))
                    .accessibilityHidden(true)

                VStack(alignment: .leading, spacing: SabqLayout.space4) {
                    Text("دوري روشن السعودي")
                        .sabqText(SabqType.leadTitle)
                        .foregroundStyle(RoshnTheme.heroOn)
                    Text(seasonSubtitle)
                        .sabqText(SabqType.meta)
                        .foregroundStyle(RoshnTheme.heroOn)
                        .lineLimit(1).minimumScaleFactor(0.85)
                }

                Spacer(minLength: SabqLayout.space4)

                if let h = homeStore.hero, !h.live.isEmpty {
                    HStack(spacing: SabqLayout.space4) {
                        Circle().fill(.white).frame(width: 6, height: 6)
                        Text(h.live.count == 1 ? "مباشر" : "\(RsFormat.latin(h.live.count)) مباشر")
                            .sabqText(SabqType.tag)
                    }
                    .foregroundStyle(.white)
                    .padding(.horizontal, SabqLayout.space8).padding(.vertical, SabqLayout.space4)
                    .background(Capsule().fill(RoshnTheme.liveFill))
                }
            }

            HStack(spacing: SabqLayout.space8) {
                heroMetric(value: RsFormat.latin(store.standings.count), label: "نادٍ", icon: "shield.fill")
                heroMetric(value: RsFormat.latin(store.buckets?.upcoming.count ?? 0), label: "قادمة", icon: "calendar")
                heroMetric(value: RsFormat.latin(store.scorers.count), label: "في السباق", icon: "figure.soccer")
            }

            if let h = homeStore.hero, h.preSeason, !h.inSeason, let ts = h.outlook.firstKickoffTs {
                TimelineView(.periodic(from: .now, by: 1)) { _ in
                    HStack(spacing: SabqLayout.space8) {
                        Image(systemName: "timer")
                        Text("الموسم الجديد ينطلق بعد \(WCFormat.countdown(to: ts))")
                            .lineLimit(1).minimumScaleFactor(0.85)
                            .monospacedDigit()
                    }
                    .sabqText(SabqType.metaEmphasis)
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.top, SabqLayout.space12)
                    .overlay(alignment: .top) {
                        Rectangle().fill(.white.opacity(0.3)).frame(height: 1)
                    }
                }
            }
        }
        .padding(SabqLayout.space16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoshnTheme.accentFill, in: RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous))
    }

    private func heroMetric(value: String, label: String, icon: String) -> some View {
        HStack(spacing: SabqLayout.space4) {
            Image(systemName: icon).font(SabqType.tag.font).accessibilityHidden(true)
            Text(value).sabqText(SabqType.rowTitle).monospacedDigit()
            Text(label).sabqText(SabqType.meta)
        }
        .foregroundStyle(RoshnTheme.heroOn)
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }

    private var seasonSubtitle: String {
        guard let h = homeStore.hero else { return "تغطية حية بتوقيت الرياض" }
        let season = h.outlook.nextSeason ?? h.outlook.season
        return "موسم \(RsFormat.isolatedLatin(RsFormat.seasonLabel(season))) · تغطية حية بتوقيت الرياض"
    }

    // MARK: شريط التبويبات

    private var tabBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: SabqLayout.space8) {
                ForEach(Tab.allCases, id: \.self) { item in
                    Button {
                        withAnimation(.easeInOut(duration: 0.2)) { tab = item }
                    } label: {
                        RoshnChip(title: item.rawValue, icon: item.icon, selected: tab == item)
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(tab == item ? .isSelected : [])
                }

                // «التوقعات» بوابة لصفحة مستقلة — تمييزها بأيقونة الهوية لا بحالة تفعيل.
                if homeStore.hero?.predictionsEnabled ?? false {
                    Button {
                        showPredictions = true
                    } label: {
                        RoshnChip(title: "التوقعات", icon: "target", selected: false, iconTint: RoshnTheme.accentInk)
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
        VStack(alignment: .leading, spacing: SabqLayout.space12) {
            sectionHeading("مباريات الدوري", subtitle: "المواعيد والنتائج لحظة بلحظة")

            if let error = store.matchesError {
                retryBanner(error) { Task { await store.loadMatches(force: true) } }
            }

            HStack(spacing: SabqLayout.space8) {
                ForEach([MatchBucket.live, .today, .upcoming, .results], id: \.self) { bucket in
                    Button {
                        matchBucket = bucket
                    } label: {
                        RoshnChip(
                            title: bucket.rawValue,
                            selected: activeBucket == bucket,
                            liveDot: bucket == .live && (store.buckets?.live.count ?? 0) > 0
                        )
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(activeBucket == bucket ? .isSelected : [])
                }
                Spacer(minLength: 0)
            }

            if store.loadingMatches, store.buckets == nil {
                loadingRows(count: 5, height: 64)
            } else {
                let fixtures = fixtures(for: activeBucket)
                if fixtures.isEmpty {
                    emptyState(icon: "calendar", text: emptyMessage(for: activeBucket))
                } else {
                    LazyVStack(alignment: .leading, spacing: 0) {
                        ForEach(groupedByDay(fixtures), id: \.0) { day, items in
                            HStack(spacing: SabqLayout.space4) {
                                Text(day)
                                    .sabqText(SabqType.metaEmphasis)
                                    .foregroundStyle(RoshnTheme.accentInk)
                                if let round = items.first?.round, !round.isEmpty {
                                    Text("· \(round)")
                                        .sabqText(SabqType.meta)
                                        .foregroundStyle(SabqTheme.textSecondary)
                                }
                                Spacer()
                            }
                            .padding(.top, SabqLayout.space16)
                            .padding(.bottom, SabqLayout.space4)

                            ForEach(Array(items.enumerated()), id: \.element.id) { index, fixture in
                                if index > 0 { RoshnRowSeparator() }
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

    // MARK: تبويب الترتيب — جدول بلا صناديق ومؤشّر منطقة

    private var standingsTab: some View {
        VStack(alignment: .leading, spacing: SabqLayout.space12) {
            sectionHeading("جدول الترتيب", subtitle: "المراكز والنقاط وفارق الأهداف")
            if let error = store.standingsError {
                retryBanner(error) { Task { await store.loadStandings(force: true) } }
            }
            if store.loadingStandings, store.standings.isEmpty {
                loadingRows(count: 9, height: 44)
            } else if store.standings.isEmpty {
                emptyState(icon: "chart.bar", text: "الترتيب يتشكّل مع أول جولة في الموسم")
            } else {
                legendRow
                VStack(spacing: 0) {
                    standingsHeader
                    RoshnRowSeparator()
                    LazyVStack(spacing: 0) {
                        ForEach(Array(store.standings.enumerated()), id: \.element.id) { index, row in
                            if index > 0 { RoshnRowSeparator() }
                            Button { selectedTeam = row.team } label: {
                                RoshnStandingRowView(row: row, total: store.standings.count)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            }
        }
    }

    private var legendRow: some View {
        HStack(spacing: SabqLayout.space12) {
            legend(color: RoshnTheme.gold, label: "اللقب")
            legend(color: RoshnTheme.accentFill, label: "نخبة آسيا")
            legend(color: SabqTheme.danger, label: "هبوط")
            Spacer()
        }
    }

    private func legend(color: Color, label: String) -> some View {
        HStack(spacing: SabqLayout.space4) {
            Capsule().fill(color).frame(width: 4, height: 14)
            Text(label).sabqText(SabqType.meta).foregroundStyle(SabqTheme.textSecondary)
        }
    }

    private var standingsHeader: some View {
        HStack(spacing: SabqLayout.space8) {
            Text("#").frame(width: 28)
            Text("النادي").frame(maxWidth: .infinity, alignment: .leading)
            Text("ل").frame(width: 28)
            Text("+/-").frame(width: 36)
            Text("ن").frame(width: 32)
        }
        .sabqText(SabqType.tag)
        .foregroundStyle(SabqTheme.textSecondary)
        .padding(.vertical, SabqLayout.space8)
    }

    // MARK: تبويب الجدول — متصفّح الجولات الـ٣٤ (كل مباريات الموسم)

    private var scheduleTab: some View {
        VStack(alignment: .leading, spacing: SabqLayout.space12) {
            sectionHeading("جدول الموسم", subtitle: "كل مباريات الدوري جولةً بجولة")

            if let error = store.scheduleError, store.rounds.isEmpty {
                retryBanner(error) { Task { await store.loadSchedule(force: true) } }
            }

            if store.loadingSchedule, store.rounds.isEmpty {
                loadingRows(count: 6, height: 64)
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
                HStack(spacing: SabqLayout.space8) {
                    ForEach(store.rounds) { round in
                        let selected = round.key == store.selectedRoundKey
                        Button {
                            Task { await store.selectRound(round.key) }
                            withAnimation(.easeInOut(duration: 0.2)) {
                                proxy.scrollTo(round.key, anchor: .center)
                            }
                        } label: {
                            RoshnChip(title: round.label, selected: selected)
                        }
                        .buttonStyle(.plain)
                        .accessibilityAddTraits(selected ? .isSelected : [])
                        .id(round.key)
                    }
                }
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
            loadingRows(count: 5, height: 64)
        } else if store.roundFixtures.isEmpty {
            emptyState(icon: "calendar", text: "مباريات هذه الجولة تُعلن قريبًا")
        } else {
            LazyVStack(spacing: 0) {
                ForEach(Array(store.roundFixtures.enumerated()), id: \.element.id) { index, fixture in
                    if index > 0 { RoshnRowSeparator() }
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
        RoshnLoadingRows(count: count, height: height)
    }

    private func emptyState(icon: String, text: String) -> some View {
        RoshnEmptyState(icon: icon, text: text)
    }

    private func sectionHeading(_ title: String, subtitle: String) -> some View {
        RoshnSectionHeading(title: title, subtitle: subtitle)
    }

    private func retryBanner(_ message: String, action: @escaping () -> Void) -> some View {
        RoshnNoticeBlock(icon: "wifi.exclamationmark", message: message, actionTitle: "إعادة", action: action)
    }
}

// MARK: - عناصر روشن المشتركة على نموذج سبق
//
// اللون الزمردي يبقى هوية (ترويسة، تبويب نشط، شارات)، والبنية من نظام سبق:
// صفحة بيضاء، قوائم بلا صناديق تفصلها خطوط رفيعة، كتل هادئة surfaceMuted،
// وزوايا 8/12/كبسولة فقط.

extension RoshnTheme {
    /// تعبئة الهوية تحت نص أبيض — أعمق من `sky` كي يبلغ التباين 4.5 في النمطين.
    static let accentFill = SabqTheme.adaptive(0x177A4D, 0x14633F)
    /// الزمردي للنصوص والأيقونات على الصفحة — آمن التباين على الأبيض وعلى الداكن.
    static let accentInk = SabqTheme.adaptive(0x177A4D, 0x5FD39A)
    /// تعبئة «مباشر» تحت نص أبيض في النمطين.
    static let liveFill = SabqTheme.adaptive(0xBF3038, 0xB3262E)
}

/// خط رفيع بين صفوف القائمة.
struct RoshnRowSeparator: View {
    var body: some View {
        Rectangle()
            .fill(SabqTheme.separator)
            .frame(height: 1)
            .accessibilityHidden(true)
    }
}

/// شريحة تبويب/تصفية: المختارة بلون الهوية، والبقية هادئة.
struct RoshnChip: View {
    let title: String
    var icon: String? = nil
    let selected: Bool
    var liveDot: Bool = false
    var iconTint: Color? = nil

    var body: some View {
        HStack(spacing: SabqLayout.space4) {
            if liveDot {
                Circle()
                    .fill(selected ? Color.white : SabqTheme.danger)
                    .frame(width: 6, height: 6)
                    .accessibilityHidden(true)
            }
            if let icon {
                Image(systemName: icon)
                    .font(SabqType.tag.font)
                    .foregroundStyle(selected ? Color.white : (iconTint ?? SabqTheme.textSecondary))
                    .accessibilityHidden(true)
            }
            Text(title)
                .sabqText(selected ? SabqType.metaEmphasis : SabqType.meta)
                .lineLimit(1)
        }
        .foregroundStyle(selected ? Color.white : SabqTheme.textPrimary)
        .padding(.horizontal, SabqLayout.space12)
        .padding(.vertical, SabqLayout.space8)
        .background(Capsule().fill(selected ? RoshnTheme.accentFill : SabqTheme.surfaceMuted))
        .frame(minHeight: SabqLayout.touchTarget)
        .contentShape(Rectangle())
    }
}

/// عنوان قسم بنمط سبق: 20 عريض وسطر وصف ثانوي.
struct RoshnSectionHeading: View {
    let title: String
    var subtitle: String? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: SabqLayout.space4) {
            Text(title)
                .sabqText(SabqType.sectionHeading)
                .foregroundStyle(SabqTheme.textPrimary)
                .accessibilityAddTraits(.isHeader)
            if let subtitle {
                Text(subtitle)
                    .sabqText(SabqType.meta)
                    .foregroundStyle(SabqTheme.textSecondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.top, SabqLayout.space8)
    }
}

/// كتلة تنبيه هادئة (خطأ/ملاحظة) مع زر اختياري.
struct RoshnNoticeBlock: View {
    let icon: String
    let message: String
    var actionTitle: String? = nil
    var action: (() -> Void)? = nil

    var body: some View {
        HStack(spacing: SabqLayout.space8) {
            Image(systemName: icon)
                .font(SabqType.meta.font)
                .foregroundStyle(SabqTheme.textSecondary)
                .accessibilityHidden(true)
            Text(message)
                .sabqText(SabqType.meta)
                .foregroundStyle(SabqTheme.textPrimary)
                .frame(maxWidth: .infinity, alignment: .leading)
            if let actionTitle, let action {
                Button(actionTitle, action: action)
                    .sabqText(SabqType.metaEmphasis)
                    .foregroundStyle(RoshnTheme.accentInk)
                    .frame(minWidth: SabqLayout.touchTarget, minHeight: SabqLayout.touchTarget)
            }
        }
        .padding(.horizontal, SabqLayout.space12)
        .padding(.vertical, SabqLayout.space4)
        .frame(minHeight: SabqLayout.controlHeight)
        .background(SabqTheme.surfaceMuted, in: RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous))
    }
}

struct RoshnEmptyState: View {
    let icon: String
    let text: String

    var body: some View {
        VStack(spacing: SabqLayout.space12) {
            Image(systemName: icon)
                .font(.system(size: 28, weight: .regular))
                .foregroundStyle(SabqTheme.textTertiary)
                .accessibilityHidden(true)
            Text(text)
                .sabqText(SabqType.excerpt)
                .foregroundStyle(SabqTheme.textSecondary)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, SabqLayout.space40)
    }
}

struct RoshnLoadingRows: View {
    let count: Int
    let height: CGFloat

    var body: some View {
        VStack(spacing: SabqLayout.space8) {
            ForEach(0..<count, id: \.self) { _ in
                RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous)
                    .fill(SabqTheme.surfaceMuted)
                    .frame(height: height)
            }
        }
        .accessibilityHidden(true)
    }
}

/// زر أساسي بلون الهوية: 48 ارتفاعًا وزاوية 12.
struct RoshnPrimaryButton: View {
    let title: String
    var systemImage: String? = nil
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: SabqLayout.space8) {
                if let systemImage { Image(systemName: systemImage) }
                Text(title)
            }
            .sabqText(SabqType.button)
            .foregroundStyle(Color.white)
            .frame(maxWidth: .infinity)
            .frame(minHeight: SabqLayout.controlHeight)
            .background(RoshnTheme.accentFill, in: RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous))
        }
        .buttonStyle(.plain)
    }
}

// MARK: - صفّ مباراة

struct RoshnMatchRow: View {
    let fixture: RsFixture
    let onOpen: () -> Void

    var body: some View {
        Button(action: onOpen) {
            HStack(spacing: SabqLayout.space8) {
                teamSide(fixture.home, alignment: .trailing)
                center
                teamSide(fixture.away, alignment: .leading)
            }
            .padding(.vertical, SabqLayout.space12)
            .frame(minHeight: 64)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private func teamSide(_ team: RsTeam, alignment: Alignment) -> some View {
        HStack(spacing: SabqLayout.space8) {
            if alignment == .leading {
                RoshnTeamLogo(url: team.logo, size: 32)
            }
            Text(team.name)
                .sabqText(SabqType.rowTitle)
                .foregroundStyle(SabqTheme.textPrimary)
                .lineLimit(1).minimumScaleFactor(0.7)
                .frame(maxWidth: .infinity, alignment: alignment)
            if alignment == .trailing {
                RoshnTeamLogo(url: team.logo, size: 32)
            }
        }
        .frame(maxWidth: .infinity)
    }

    private var center: some View {
        VStack(spacing: SabqLayout.space4) {
            if fixture.started {
                // النتيجة داخل شارة مسطّحة: زمردي للمنتهية وأحمر للحية.
                Text("\(fixture.goals.away ?? 0) - \(fixture.goals.home ?? 0)")
                    .sabqText(SabqType.button)
                    .foregroundStyle(.white)
                    .monospacedDigit()
                    .environment(\.layoutDirection, .leftToRight)
                    .padding(.horizontal, SabqLayout.space8).padding(.vertical, 2)
                    .background(
                        RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous)
                            .fill(fixture.status.live ? RoshnTheme.liveFill : RoshnTheme.accentFill)
                    )
                if fixture.status.live {
                    HStack(spacing: SabqLayout.space4) {
                        Circle().fill(SabqTheme.danger).frame(width: 5, height: 5)
                        Text(liveMinute ?? fixture.status.label)
                            .sabqText(SabqType.tag)
                            .foregroundStyle(SabqTheme.danger)
                            .monospacedDigit()
                    }
                } else {
                    Text(fixture.status.label)
                        .sabqText(SabqType.tag)
                        .foregroundStyle(SabqTheme.textSecondary)
                        .lineLimit(1).minimumScaleFactor(0.85)
                }
            } else {
                Text(RsFormat.time(fixture))
                    .sabqText(SabqType.button)
                    .foregroundStyle(RoshnTheme.accentInk)
                    .monospacedDigit()
                Text(fixture.venue.name.isEmpty ? "يُعلن لاحقًا" : fixture.venue.name)
                    .sabqText(SabqType.tag)
                    .foregroundStyle(SabqTheme.textSecondary)
                    .lineLimit(1).minimumScaleFactor(0.75)
            }
        }
        .frame(width: 96)
    }

    private var liveMinute: String? {
        guard let elapsed = fixture.status.elapsed, elapsed > 0 else { return nil }
        let extra = (fixture.status.extra ?? 0) > 0 ? "+\(fixture.status.extra!)" : ""
        return "\(elapsed)\(extra)'"
    }
}

/// شعار نادٍ شفاف داخل دائرة بيضاء (الشعارات تحتاج خلفية فاتحة في النمطين).
struct RoshnTeamLogo: View {
    let url: String
    var size: CGFloat = 32

    var body: some View {
        WCRemoteImage(url: url)
            .padding(size * 0.1)
            .frame(width: size, height: size)
            .background(Circle().fill(.white))
            .overlay(Circle().stroke(SabqTheme.separator, lineWidth: 1))
            .accessibilityHidden(true)
    }
}

/// صورة لاعب/عضو دائرية على العنصر النائب الموحّد.
struct RoshnAvatar: View {
    let url: String
    var size: CGFloat = 36

    var body: some View {
        CachedAsyncImage(url: URL(string: url), contentMode: .fill, maxPixelSize: 300) {
            SabqImagePlaceholder()
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
        .accessibilityHidden(true)
    }
}

// MARK: - صفّ ترتيب

struct RoshnStandingRowView: View {
    let row: RsStandingRow
    let total: Int

    /// لون منطقة المركز: لقب/نخبة آسيا/هبوط — كما جدول الويب.
    private var zoneColor: Color? {
        if row.rank == 1 { return RoshnTheme.gold }
        if row.rank <= 3 { return RoshnTheme.accentFill }
        if row.rank > total - 3 { return SabqTheme.danger }
        return nil
    }

    var body: some View {
        HStack(spacing: SabqLayout.space8) {
            HStack(spacing: SabqLayout.space4) {
                Capsule()
                    .fill(zoneColor ?? Color.clear)
                    .frame(width: 4, height: 20)
                    .accessibilityHidden(true)
                Text("\(row.rank)")
                    .sabqText(SabqType.metaEmphasis)
                    .foregroundStyle(SabqTheme.textPrimary)
                    .monospacedDigit()
            }
            .frame(width: 28, alignment: .leading)

            RoshnTeamLogo(url: row.team.logo, size: 28)

            Text(row.team.name)
                .sabqText(SabqType.metaEmphasis)
                .foregroundStyle(SabqTheme.textPrimary)
                .lineLimit(1).minimumScaleFactor(0.7)
                .frame(maxWidth: .infinity, alignment: .leading)

            if row.live == true {
                Circle().fill(SabqTheme.danger).frame(width: 6, height: 6)
                    .accessibilityLabel("مباشر")
            }

            Text("\(row.played)")
                .sabqText(SabqType.meta).foregroundStyle(SabqTheme.textSecondary)
                .monospacedDigit().frame(width: 28)

            Text(row.goalsDiff > 0 ? "+\(row.goalsDiff)" : "\(row.goalsDiff)")
                .sabqText(SabqType.meta)
                .foregroundStyle(row.goalsDiff > 0 ? RoshnTheme.accentInk : row.goalsDiff < 0 ? SabqTheme.danger : SabqTheme.textSecondary)
                .monospacedDigit().frame(width: 36)
                .environment(\.layoutDirection, .leftToRight)

            Text("\(row.points)")
                .sabqText(SabqType.metaEmphasis)
                .foregroundStyle(SabqTheme.textPrimary)
                .monospacedDigit().frame(width: 32)
        }
        .padding(.vertical, SabqLayout.space8)
        .frame(minHeight: SabqLayout.touchTarget)
        .contentShape(Rectangle())
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
        VStack(alignment: .leading, spacing: SabqLayout.space12) {
            RoshnSectionHeading(title: "سباقات الموسم", subtitle: "الهدافون وصنّاع الأهداف والبطاقات")

            if let message = store.racesError {
                RoshnNoticeBlock(icon: "arrow.clockwise.circle", message: message, actionTitle: "إعادة", action: onRetry)
            }

            if store.racesFromArchive {
                RoshnNoticeBlock(icon: "clock.arrow.circlepath", message: "لوحات الموسم الماضي — تتصفّر مع أول جولة للموسم الجديد")
            }

            HStack(spacing: SabqLayout.space8) {
                ForEach(Race.allCases, id: \.self) { item in
                    Button {
                        race = item
                    } label: {
                        RoshnChip(title: item.rawValue, selected: race == item)
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(race == item ? .isSelected : [])
                }
                Spacer(minLength: 0)
            }

            switch race {
            case .goals:
                if store.scorers.isEmpty {
                    if store.loadingRaces {
                        RoshnLoadingRows(count: 5, height: 56)
                    } else {
                        racesEmpty("سباق هدّاف الدوري ينطلق مع أول صافرة")
                    }
                } else {
                    if store.scorers.count >= 3 { podium }
                    let rest = store.scorers.count >= 3 ? Array(store.scorers.dropFirst(3)) : store.scorers
                    LazyVStack(spacing: 0) {
                        ForEach(Array(rest.enumerated()), id: \.element.id) { index, s in
                            if index > 0 { RoshnRowSeparator() }
                            leaderRow(rank: s.rank, name: s.name, photo: s.photo, team: s.team,
                                      primary: "\(s.goals)", secondary: "\(s.assists) صناعة")
                        }
                    }
                }
            case .assists:
                if store.assists.isEmpty {
                    racesEmpty("سباق صنّاع الأهداف ينطلق مع أول صافرة")
                } else {
                    LazyVStack(spacing: 0) {
                        ForEach(Array(store.assists.enumerated()), id: \.element.id) { index, l in
                            if index > 0 { RoshnRowSeparator() }
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
                    LazyVStack(spacing: 0) {
                        ForEach(Array(yellow.enumerated()), id: \.element.id) { index, l in
                            if index > 0 { RoshnRowSeparator() }
                            leaderRow(rank: l.rank, name: l.name, photo: l.photo, team: l.team,
                                      primary: "🟨 \(l.yellow ?? 0)", secondary: "🟥 \(l.red ?? 0)")
                        }
                    }
                }
            }
        }
    }

    private func racesEmpty(_ text: String) -> some View {
        RoshnEmptyState(icon: "trophy", text: text)
    }

    /// منصة الثلاثة الأوائل — كتلة هادئة واحدة، والذهبي حلقة البطل فقط.
    private var podium: some View {
        let leaders = [store.scorers[1], store.scorers[0], store.scorers[2]]
        return HStack(alignment: .bottom, spacing: SabqLayout.space8) {
            ForEach(Array(leaders.enumerated()), id: \.element.id) { index, scorer in
                let champion = index == 1
                VStack(spacing: SabqLayout.space8) {
                    ZStack(alignment: .bottomTrailing) {
                        RoshnAvatar(url: scorer.photo, size: champion ? 72 : 56)
                            .overlay(Circle().stroke(champion ? RoshnTheme.gold : Color.clear, lineWidth: 3))
                        Text(RsFormat.latin(scorer.rank))
                            .sabqText(SabqType.tag)
                            .foregroundStyle(champion ? RoshnTheme.navy : SabqTheme.textPrimary)
                            .frame(width: 24, height: 24)
                            .background(Circle().fill(champion ? RoshnTheme.gold : SabqTheme.background))
                            .overlay(Circle().stroke(SabqTheme.separator, lineWidth: champion ? 0 : 1))
                    }
                    Text(scorer.name)
                        .sabqText(SabqType.metaEmphasis)
                        .foregroundStyle(SabqTheme.textPrimary)
                        .lineLimit(1).minimumScaleFactor(0.7)
                    Text("\(RsFormat.latin(scorer.goals)) هدف")
                        .sabqText(champion ? SabqType.rowTitle : SabqType.meta)
                        .foregroundStyle(champion ? SabqTheme.textPrimary : SabqTheme.textSecondary)
                }
                .frame(maxWidth: .infinity)
                .accessibilityElement(children: .combine)
            }
        }
        .padding(.vertical, SabqLayout.space16)
        .padding(.horizontal, SabqLayout.space8)
        .background(SabqTheme.surfaceMuted, in: RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous))
    }

    private func leaderRow(rank: Int, name: String, photo: String, team: RsTeam,
                           primary: String, secondary: String) -> some View {
        HStack(spacing: SabqLayout.space12) {
            Text("\(rank)")
                .sabqText(SabqType.metaEmphasis)
                .foregroundStyle(rank <= 3 ? SabqTheme.textPrimary : SabqTheme.textSecondary)
                .monospacedDigit()
                .frame(width: 24)

            RoshnAvatar(url: photo, size: 36)

            VStack(alignment: .leading, spacing: 2) {
                Text(name)
                    .sabqText(SabqType.rowTitle)
                    .foregroundStyle(SabqTheme.textPrimary)
                    .lineLimit(1).minimumScaleFactor(0.75)
                HStack(spacing: SabqLayout.space4) {
                    WCRemoteImage(url: team.logo).frame(width: 14, height: 14)
                        .accessibilityHidden(true)
                    Text(team.name)
                        .sabqText(SabqType.meta)
                        .foregroundStyle(SabqTheme.textSecondary)
                        .lineLimit(1)
                }
            }

            Spacer()

            VStack(alignment: .trailing, spacing: 2) {
                Text(primary)
                    .sabqText(SabqType.rowTitle)
                    .foregroundStyle(SabqTheme.textPrimary)
                    .monospacedDigit()
                Text(secondary)
                    .sabqText(SabqType.tag)
                    .foregroundStyle(SabqTheme.textSecondary)
            }
        }
        .padding(.vertical, SabqLayout.space12)
        .accessibilityElement(children: .combine)
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
            VStack(alignment: .leading, spacing: SabqLayout.space16) {
                header
                tabBar
                switch tab {
                case .matches: matchesTab
                case .ledger: ledgerTab
                case .leaders: leadersTab
                case .how: howTab
                }
            }
            .padding(.horizontal, SabqLayout.pageMargin)
            .padding(.top, SabqLayout.space8)
            .padding(.bottom, SabqLayout.space32)
        }
        .background(SabqTheme.background)
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

    // MARK: الترويسة — شريط هوية زمردي مسطّح، مع نقاط العضو ومركزه

    private var header: some View {
        VStack(alignment: .leading, spacing: SabqLayout.space16) {
            HStack(spacing: SabqLayout.space12) {
                Image(systemName: "target")
                    .font(.system(size: 28, weight: .regular))
                    .foregroundStyle(.white)
                    .accessibilityHidden(true)

                VStack(alignment: .leading, spacing: SabqLayout.space4) {
                    Text("توقّع وتنافس")
                        .sabqText(SabqType.leadTitle)
                        .foregroundStyle(.white)
                    Text("توقّع نتائج الجولة ونافس على نقاط الموسم")
                        .sabqText(SabqType.meta)
                        .foregroundStyle(.white)
                        .lineLimit(1).minimumScaleFactor(0.85)
                }
                Spacer(minLength: 0)
            }

            if APIClient.shared.hasSession {
                // المسجّل يرى بطاقاته الثلاث دائمًا — أصفار/شرطات قبل أول تسوية
                // (myRank لا يوجد إلا بعد تسويات، فلا يُشترط لعرض البطاقات).
                let my = store.leaderboard?.myRank
                HStack(spacing: SabqLayout.space8) {
                    heroStat(value: RsFormat.latin(my?.points ?? 0), label: "نقطة حصدتها")
                    heroStat(value: my.map { RsFormat.latin($0.rank) } ?? "—", label: "مركزي")
                    heroStat(value: accuracyPercent.map { "\(RsFormat.latin($0))٪" } ?? "—", label: "دقّتي")
                }
                if let my, let (fraction, label) = raceProgress(my: my) {
                    VStack(alignment: .leading, spacing: SabqLayout.space8) {
                        GeometryReader { geo in
                            ZStack(alignment: .leading) {
                                Capsule().fill(.white.opacity(0.25))
                                Capsule().fill(RoshnTheme.gold)
                                    .frame(width: max(geo.size.width * fraction, 8))
                            }
                        }
                        .frame(height: 6)
                        .accessibilityHidden(true)
                        Text(label)
                            .sabqText(SabqType.meta)
                            .foregroundStyle(.white)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                } else {
                    Text("نقاطك تبدأ مع أول تسوية — توقّع الجولة كاملة وعُد بعد الصافرة")
                        .sabqText(SabqType.meta)
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            } else {
                // بلا جلسة فقط: دعوة تسجيل الدخول بدل الأرقام.
                Text("سجّل دخولك وتوقّع نتائج الجولة ونافس على نقاط الموسم")
                    .sabqText(SabqType.metaEmphasis)
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.top, SabqLayout.space12)
                    .overlay(alignment: .top) {
                        Rectangle().fill(.white.opacity(0.3)).frame(height: 1)
                    }
            }
        }
        .padding(SabqLayout.space16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoshnTheme.accentFill, in: RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous))
    }

    private func heroStat(value: String, label: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(value).sabqText(SabqType.sectionHeading).monospacedDigit()
            Text(label).sabqText(SabqType.meta)
        }
        .foregroundStyle(.white)
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }

    private var tabBar: some View {
        HStack(spacing: SabqLayout.space8) {
            ForEach(Tab.allCases, id: \.self) { item in
                let selected = tab == item
                Button {
                    withAnimation(.easeInOut(duration: 0.2)) { tab = item }
                } label: {
                    HStack(spacing: SabqLayout.space4) {
                        Image(systemName: item.icon)
                            .font(SabqType.tag.font)
                            .accessibilityHidden(true)
                        Text(item.rawValue)
                            .sabqText(selected ? SabqType.metaEmphasis : SabqType.meta)
                            .lineLimit(1).minimumScaleFactor(0.85)
                    }
                    .foregroundStyle(selected ? Color.white : SabqTheme.textPrimary)
                    .frame(maxWidth: .infinity)
                    .frame(minHeight: SabqLayout.touchTarget)
                    .background(
                        RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous)
                            .fill(selected ? RoshnTheme.accentFill : SabqTheme.surfaceMuted)
                    )
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(selected ? .isSelected : [])
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
        VStack(alignment: .leading, spacing: SabqLayout.space12) {
            if let error = store.error {
                errorBanner(error)
            }

            // تقدّم الجولة: كم مباراة مفتوحة توقّعتها — يدفع لإكمالها.
            let openAll = openContests
            let openMine = openAll.filter { $0.myEntry?.payload != nil }.count
            if openAll.count > 1, APIClient.shared.hasSession {
                HStack(spacing: SabqLayout.space8) {
                    Image(systemName: "checklist")
                        .font(SabqType.meta.font)
                        .foregroundStyle(RoshnTheme.accentInk)
                        .accessibilityHidden(true)
                    Text("توقعاتك هذه الجولة: \(RsFormat.latin(openMine)) من \(RsFormat.latin(openAll.count))")
                        .sabqText(SabqType.metaEmphasis)
                        .foregroundStyle(SabqTheme.textPrimary)
                    Spacer()
                    if openMine < openAll.count {
                        Text("أكملها 👇")
                            .sabqText(SabqType.meta)
                            .foregroundStyle(SabqTheme.textSecondary)
                    } else {
                        Text("اكتملت ✓")
                            .sabqText(SabqType.metaEmphasis)
                            .foregroundStyle(RoshnTheme.accentInk)
                    }
                }
                .padding(.horizontal, SabqLayout.space12)
                .frame(minHeight: SabqLayout.controlHeight)
                .background(SabqTheme.surfaceMuted, in: RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous))
            }

            if store.loading, store.contests.isEmpty {
                RoshnLoadingRows(count: 4, height: 110)
            } else if openContests.isEmpty, settledContests.isEmpty, store.error == nil {
                emptyState("مباريات التوقع تُفتح قبل كل جولة — عُد قريبًا")
            }

            if !openContests.isEmpty {
                VStack(spacing: 0) {
                    ForEach(Array(openContests.enumerated()), id: \.element.id) { index, contest in
                        if index > 0 { RoshnRowSeparator() }
                        openContestCard(contest)
                    }
                }
            }

            if !settledContests.isEmpty {
                sectionLabel("آخر المباريات")
                VStack(spacing: 0) {
                    ForEach(Array(settledContests.prefix(8).enumerated()), id: \.element.id) { index, contest in
                        if index > 0 { RoshnRowSeparator() }
                        settledContestRow(contest)
                    }
                }
            }
        }
    }

    // MARK: تبويب نقاطي — حصاد الموسم + سجلّ التسويات

    private func harvestTile(value: String, label: String, tint: Color) -> some View {
        VStack(spacing: SabqLayout.space4) {
            Text(value)
                .sabqText(SabqType.sectionHeading)
                .foregroundStyle(tint)
                .monospacedDigit()
            Text(label)
                .sabqText(SabqType.tag)
                .foregroundStyle(SabqTheme.textSecondary)
                .lineLimit(1).minimumScaleFactor(0.8)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, SabqLayout.space12)
        .background(SabqTheme.surfaceMuted, in: RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous))
        .accessibilityElement(children: .combine)
    }

    @ViewBuilder
    private var harvestGrid: some View {
        let exact = store.ledger.filter { $0.reasonCode == "exact" }.count
        let margin = store.ledger.filter { $0.reasonCode == "margin" }.count
        let outcome = store.ledger.filter { $0.reasonCode == "outcome" }.count
        let best = store.ledger.map(\.points).max() ?? 0
        VStack(spacing: SabqLayout.space8) {
            HStack(spacing: SabqLayout.space8) {
                harvestTile(value: RsFormat.latin(settledMineCount), label: "توقعًا مُسوّى", tint: SabqTheme.textPrimary)
                harvestTile(value: RsFormat.latin(exact), label: "نتيجة دقيقة 🎯", tint: SabqTheme.textPrimary)
                harvestTile(value: RsFormat.latin(margin), label: "فارق صحيح", tint: SabqTheme.textPrimary)
            }
            HStack(spacing: SabqLayout.space8) {
                harvestTile(value: RsFormat.latin(outcome), label: "اتجاه صحيح", tint: SabqTheme.textPrimary)
                harvestTile(value: accuracyPercent.map { "\(RsFormat.latin($0))٪" } ?? "—", label: "نسبة الإصابة", tint: RoshnTheme.accentInk)
                harvestTile(value: RsFormat.latin(best), label: "أفضل تسوية", tint: SabqTheme.textPrimary)
            }
        }
    }

    @ViewBuilder
    private var ledgerTab: some View {
        VStack(alignment: .leading, spacing: SabqLayout.space12) {
            if let error = store.ledgerError {
                RoshnNoticeBlock(icon: "person.crop.circle.badge.exclamationmark", message: error, actionTitle: "إعادة") {
                    Task { await store.loadLedger(force: true) }
                }
            }

            if store.ledgerLoading, store.ledger.isEmpty {
                RoshnLoadingRows(count: 6, height: 52)
            } else if store.ledger.isEmpty, store.ledgerError == nil {
                emptyState("حصادك يبدأ مع أول تسوية — توقّع مباريات الجولة وعُد بعد صافرة النهاية")
            } else {
                if let my = store.leaderboard?.myRank {
                    HStack(spacing: SabqLayout.space8) {
                        Image(systemName: "sum")
                            .foregroundStyle(SabqTheme.textSecondary)
                            .accessibilityHidden(true)
                        Text("مجموع ما حصدته هذا الموسم")
                            .sabqText(SabqType.meta).foregroundStyle(SabqTheme.textPrimary)
                        Spacer()
                        Text("\(RsFormat.latin(my.points)) نقطة")
                            .sabqText(SabqType.rowTitle).foregroundStyle(RoshnTheme.accentInk)
                            .monospacedDigit()
                    }
                    .padding(.horizontal, SabqLayout.space12)
                    .frame(minHeight: SabqLayout.controlHeight)
                    .background(SabqTheme.surfaceMuted, in: RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous))
                }

                sectionLabel("حصاد الموسم")
                harvestGrid

                sectionLabel("سجلّ التسويات")
                VStack(spacing: 0) {
                    ForEach(Array(store.ledger.enumerated()), id: \.element.id) { index, item in
                        if index > 0 { RoshnRowSeparator() }
                        ledgerRow(item)
                    }
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
        case "exact": ("target", RoshnTheme.accentInk)
        case "margin": ("ruler", RoshnTheme.accentInk)
        case "outcome": ("checkmark.seal.fill", RoshnTheme.accentInk)
        default: ("star.fill", SabqTheme.textSecondary)
        }

        return HStack(spacing: SabqLayout.space12) {
            Image(systemName: icon)
                .font(SabqType.meta.font)
                .foregroundStyle(iconTint)
                .frame(width: 32, height: 32)
                .background(SabqTheme.surfaceMuted, in: RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous))
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: SabqLayout.space4) {
                if let contest, let final {
                    // سطر المباراة: [مضيف][نتيجته]-[نتيجة الضيف][ضيف] — RTL طبيعي.
                    HStack(spacing: SabqLayout.space4) {
                        Text(contest.metadata?.home?.name ?? "—")
                            .sabqText(SabqType.metaEmphasis)
                            .foregroundStyle(SabqTheme.textPrimary)
                            .lineLimit(1).minimumScaleFactor(0.7)
                        splitScore(home: final.home, away: final.away, emphasized: false)
                        Text(contest.metadata?.away?.name ?? "—")
                            .sabqText(SabqType.metaEmphasis)
                            .foregroundStyle(SabqTheme.textPrimary)
                            .lineLimit(1).minimumScaleFactor(0.7)
                    }
                }
                HStack(spacing: SabqLayout.space4) {
                    Text(item.reasonLabelAr.isEmpty ? "تسوية توقع" : item.reasonLabelAr)
                        .sabqText(contest != nil ? SabqType.meta : SabqType.rowTitle)
                        .foregroundStyle(contest != nil ? SabqTheme.textSecondary : SabqTheme.textPrimary)
                        .lineLimit(2)
                    if let predicted {
                        Text("· توقعت")
                            .sabqText(SabqType.tag).foregroundStyle(SabqTheme.textSecondary)
                        splitScore(home: predicted.home, away: predicted.away, emphasized: false)
                    }
                }
                if let date = item.createdAtDate {
                    Text(RsFormat.day(iso: item.createdAt) + " · " + WCFormat.timeRiyadh.string(from: date))
                        .sabqText(SabqType.tag)
                        .foregroundStyle(SabqTheme.textTertiary)
                }
            }

            Spacer(minLength: SabqLayout.space8)

            // نقاط التسوية — رقم واحد فلا التباس؛ علامة + قبله بعزل سليم.
            HStack(spacing: 1) {
                Text("+")
                Text(RsFormat.latin(item.points))
                    .monospacedDigit()
            }
            .sabqText(SabqType.metaEmphasis)
            .foregroundStyle(.white)
            .padding(.horizontal, SabqLayout.space8).padding(.vertical, SabqLayout.space4)
            .background(RoshnTheme.accentFill, in: RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous))
        }
        .padding(.vertical, SabqLayout.space12)
    }

    // MARK: تبويب المتصدرين

    @ViewBuilder
    private var leadersTab: some View {
        VStack(alignment: .leading, spacing: SabqLayout.space12) {
            if let error = store.error {
                errorBanner(error)
            }
            let entries = store.leaderboard?.entries ?? []
            if store.loading, entries.isEmpty {
                RoshnLoadingRows(count: 8, height: 48)
            } else if entries.isEmpty {
                emptyState("الصدارة تتشكّل مع أول جولة توقعات — كن أول المتنافسين")
            } else {
                VStack(spacing: 0) {
                    ForEach(Array(entries.prefix(20).enumerated()), id: \.element.id) { index, entry in
                        if index > 0 { RoshnRowSeparator() }
                        leaderRow(entry)
                    }
                }
            }
        }
    }

    // MARK: تبويب طريقة التوقعات

    @ViewBuilder
    private var howTab: some View {
        VStack(alignment: .leading, spacing: SabqLayout.space16) {
            // ملف الاحتساب الفعّال من الخادم — لا نص ثابت يتقادم.
            VStack(alignment: .leading, spacing: SabqLayout.space8) {
                HStack(spacing: SabqLayout.space8) {
                    Image(systemName: "star.circle.fill")
                        .font(SabqType.rowTitle.font)
                        .foregroundStyle(RoshnTheme.accentInk)
                        .accessibilityHidden(true)
                    Text("نظام النقاط")
                        .sabqText(SabqType.rowTitle)
                        .foregroundStyle(SabqTheme.textPrimary)
                }
                Text(store.rule?.summaryAr ?? "تُحتسب النقاط بعد صافرة نهاية كل مباراة وتُضاف لرصيدك تلقائيًا")
                    .sabqText(SabqType.excerpt)
                    .foregroundStyle(SabqTheme.textPrimary)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(SabqLayout.space16)
            .background(SabqTheme.surfaceMuted, in: RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous))

            VStack(alignment: .leading, spacing: 0) {
                howStep(number: 1, icon: "square.and.pencil",
                        title: "اختر نتيجة المباراة",
                        text: "حدد أهداف كل فريق قبل انطلاق المباراة — التوقع يُقفل عند صافرة البداية")
                RoshnRowSeparator()
                howStep(number: 2, icon: "arrow.triangle.2.circlepath",
                        title: "عدّل توقعك متى شئت",
                        text: "يمكنك تعديل توقعك بلا حدود حتى لحظة الإقفال، ويُعتمد آخر توقع محفوظ")
                RoshnRowSeparator()
                howStep(number: 3, icon: "checkmark.seal.fill",
                        title: "النقاط تُحتسب تلقائيًا",
                        text: "بعد صافرة النهاية تُوزَّع نقاط المباراة على المصيبين وتُضاف لرصيد موسمك")
                RoshnRowSeparator()
                howStep(number: 4, icon: "trophy.fill",
                        title: "نافس على صدارة الموسم",
                        text: "رصيدك التراكمي يحدد مركزك بين المتنافسين في تبويب المتصدرين")
            }

            RoshnNoticeBlock(icon: "person.crop.circle.badge.checkmark",
                             message: "المشاركة تتطلب تسجيل الدخول بحسابك في سبق — التصفح متاح للجميع")
        }
    }

    private func howStep(number: Int, icon: String, title: String, text: String) -> some View {
        HStack(alignment: .top, spacing: SabqLayout.space12) {
            Image(systemName: icon)
                .font(SabqType.meta.font)
                .foregroundStyle(RoshnTheme.accentInk)
                .frame(width: 32, height: 32)
                .background(SabqTheme.surfaceMuted, in: RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous))
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: SabqLayout.space4) {
                Text("\(RsFormat.latin(number)). \(title)")
                    .sabqText(SabqType.rowTitle)
                    .foregroundStyle(SabqTheme.textPrimary)
                Text(text)
                    .sabqText(SabqType.excerpt)
                    .foregroundStyle(SabqTheme.textSecondary)
            }
        }
        .padding(.vertical, SabqLayout.space12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }

    // MARK: عناصر مشتركة

    private func sectionLabel(_ title: String) -> some View {
        RoshnSectionHeading(title: title)
            .padding(.top, SabqLayout.space8)
    }

    private func errorBanner(_ message: String) -> some View {
        RoshnNoticeBlock(icon: "info.circle", message: message, actionTitle: "إعادة") {
            Task { await store.load(force: true) }
        }
    }

    private func emptyState(_ text: String) -> some View {
        RoshnEmptyState(icon: "target", text: text)
    }

    private func openContestCard(_ contest: PredContest) -> some View {
        let draft = drafts[contest.id]
            ?? [contest.myEntry?.payload?.predHome ?? 0, contest.myEntry?.payload?.predAway ?? 0]
        return VStack(spacing: SabqLayout.space12) {
            HStack(spacing: SabqLayout.space8) {
                teamSide(contest.metadata?.home)
                VStack(spacing: SabqLayout.space4) {
                    // المضيف يمينًا — درجتا التوقع بالضيف أولًا داخل عزل LTR.
                    HStack(spacing: SabqLayout.space4) {
                        stepper(value: draft[0]) { drafts[contest.id] = [$0, draft[1]] }
                        Text("-").sabqText(SabqType.meta).foregroundStyle(SabqTheme.textSecondary)
                        stepper(value: draft[1]) { drafts[contest.id] = [draft[0], $0] }
                    }
                    if let date = contest.locksAtDate {
                        TimelineView(.periodic(from: .now, by: 60)) { _ in
                            Text(lockLabel(date))
                                .sabqText(SabqType.tag).foregroundStyle(SabqTheme.textSecondary)
                        }
                    }
                    // عدّاد المتوقّعين — إثبات اجتماعي، رقم بلا أسماء (عقد #1326).
                    if let count = contest.entriesCount, count > 0 {
                        HStack(spacing: SabqLayout.space4) {
                            Image(systemName: "person.2.fill")
                                .accessibilityHidden(true)
                            Text(predictorsLabel(count))
                        }
                        .sabqText(SabqType.tag)
                        .foregroundStyle(RoshnTheme.accentInk)
                    }
                }
                teamSide(contest.metadata?.away)
            }

            RoshnPrimaryButton(title: buttonTitle(contest)) {
                Task { await store.submit(contest: contest, home: draft[0], away: draft[1]) }
            }
            .disabled(store.savingId != nil)
        }
        .padding(.vertical, SabqLayout.space16)
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
        VStack(spacing: SabqLayout.space8) {
            RoshnTeamLogo(url: team?.logo ?? "", size: 40)
            Text(team?.name ?? "—")
                .sabqText(SabqType.metaEmphasis)
                .foregroundStyle(SabqTheme.textPrimary)
                .lineLimit(1).minimumScaleFactor(0.7)
        }
        .frame(maxWidth: .infinity)
    }

    private func stepper(value: Int, onChange: @escaping (Int) -> Void) -> some View {
        HStack(spacing: 0) {
            Button { onChange(min(value + 1, 20)) } label: {
                Image(systemName: "plus")
                    .font(SabqType.tag.font).foregroundStyle(RoshnTheme.accentInk)
                    .frame(width: 28, height: 28)
                    .background(Circle().fill(SabqTheme.surfaceMuted))
                    .frame(width: SabqLayout.touchTarget, height: SabqLayout.touchTarget)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            Text(RsFormat.latin(value))
                .sabqText(SabqType.leadTitle).foregroundStyle(SabqTheme.textPrimary)
                .monospacedDigit().frame(minWidth: 24)
            Button { onChange(max(value - 1, 0)) } label: {
                Image(systemName: "minus")
                    .font(SabqType.tag.font).foregroundStyle(SabqTheme.textSecondary)
                    .frame(width: 28, height: 28)
                    .background(Circle().fill(SabqTheme.surfaceMuted))
                    .frame(width: SabqLayout.touchTarget, height: SabqLayout.touchTarget)
                    .contentShape(Rectangle())
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
            .sabqText(emphasized ? SabqType.metaEmphasis : SabqType.tag)
            .foregroundStyle(emphasized ? .white : SabqTheme.textSecondary)
            .monospacedDigit()
            .padding(.horizontal, emphasized ? SabqLayout.space8 : 0).padding(.vertical, emphasized ? 2 : 0)
            .background(
                RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous)
                    .fill(emphasized ? RoshnTheme.accentFill : Color.clear)
            )
    }

    /// [مضيف][-][ضيف] في صف RTL: أول عنصر يظهر يمينًا — رقم المضيف تحت اسمه دائمًا.
    private func splitScore(home: Int, away: Int, emphasized: Bool = true) -> some View {
        HStack(spacing: SabqLayout.space4) {
            scoreNumber(home, emphasized: emphasized)
            Text("-")
                .sabqText(emphasized ? SabqType.meta : SabqType.tag)
                .foregroundStyle(SabqTheme.textSecondary)
            scoreNumber(away, emphasized: emphasized)
        }
    }

    private func settledContestRow(_ contest: PredContest) -> some View {
        HStack(spacing: SabqLayout.space8) {
            Text(contest.metadata?.home?.name ?? "—")
                .sabqText(SabqType.metaEmphasis).foregroundStyle(SabqTheme.textPrimary)
                .lineLimit(1).frame(maxWidth: .infinity, alignment: .leading)
            VStack(spacing: SabqLayout.space4) {
                if let r = contest.result, let fh = r.finalHome, let fa = r.finalAway {
                    splitScore(home: fh, away: fa)
                } else {
                    Text("بانتظار النتيجة")
                        .sabqText(SabqType.tag).foregroundStyle(SabqTheme.textSecondary)
                }
                if let p = contest.myEntry?.payload, let ph = p.predHome, let pa = p.predAway {
                    HStack(spacing: SabqLayout.space4) {
                        Text("توقعت")
                            .sabqText(SabqType.tag).foregroundStyle(SabqTheme.textSecondary)
                        splitScore(home: ph, away: pa, emphasized: false)
                    }
                }
            }
            .frame(width: 112)
            Text(contest.metadata?.away?.name ?? "—")
                .sabqText(SabqType.metaEmphasis).foregroundStyle(SabqTheme.textPrimary)
                .lineLimit(1).frame(maxWidth: .infinity, alignment: .trailing)
        }
        .padding(.vertical, SabqLayout.space12)
    }

    private func leaderRow(_ entry: PredLeaderEntry) -> some View {
        HStack(spacing: SabqLayout.space12) {
            Text(RsFormat.latin(entry.rank))
                .sabqText(SabqType.metaEmphasis)
                .foregroundStyle(entry.rank <= 3 ? SabqTheme.textPrimary : SabqTheme.textSecondary)
                .monospacedDigit()
                .frame(width: 24)
            RoshnAvatar(url: entry.profileImageUrl ?? "", size: 32)
            Text(entry.name)
                .sabqText(SabqType.rowTitle).foregroundStyle(SabqTheme.textPrimary)
                .lineLimit(1).frame(maxWidth: .infinity, alignment: .leading)
            Text("\(RsFormat.latin(entry.points)) نقطة")
                .sabqText(SabqType.metaEmphasis).foregroundStyle(RoshnTheme.accentInk)
                .monospacedDigit()
        }
        .padding(.vertical, SabqLayout.space12)
        .accessibilityElement(children: .combine)
    }
}
