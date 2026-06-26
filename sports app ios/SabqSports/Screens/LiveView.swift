import SwiftUI

// المباشر — تبويبان:
//  1) «المباريات»: مباريات بطولاتنا اليوم عبر الفئات (كأس العالم/عالمية أولًا ثم
//     الخليجية ثم العربية ثم السعودية ثم الأوروبية)؛ الجارية الآن تتصدّر في قسم
//     «مباشر الآن»، وكل بطاقة تُظهر العدّاد/الشوط/الاستراحة/انتهت عبر SpStatusPill.
//  2) «مباشر العالم»: كل مباريات العالم الجارية الآن (/sports/world-live) مجمّعة
//     حسب البطولة/الدولة — بطولاتنا أولًا ثم العالمية.
struct LiveView: View {
    @State private var today: [SpFixture] = []
    @State private var world: [SpWorldLiveItem] = []
    @State private var catBySlug: [String: String] = [:]
    @State private var tab: Tab = .matches
    @State private var selectedDate = Date()
    @State private var matchesLoading = false
    @State private var loading = true
    @State private var loadError: String?

    private static let riyadhCal: Calendar = {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "Asia/Riyadh") ?? .current
        return c
    }()

    enum Tab: String, CaseIterable, Identifiable {
        case matches = "المباريات"
        case world = "مباشر العالم"
        var id: String { rawValue }
    }

    // ترتيب الفئات في تبويب «المباريات» (العالمية/كأس العالم أولًا حسب طلب المالك).
    private let categoryOrder = ["world", "gulf", "arab", "saudi", "european"]

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    header
                    tabBar

                    if loading {
                        SpLoading()
                    } else if let loadError {
                        SpEmptyState(icon: "wifi.exclamationmark", title: "تعذّر التحميل", subtitle: loadError)
                    } else {
                        switch tab {
                        case .matches: matchesTab
                        case .world: worldTab
                        }
                    }
                }
                .padding(16)
            }
            .autoHideTabBar()
            .background(SpAmbientBackground())
            .navigationTitle("")
            .toolbar(.hidden, for: .navigationBar)
        }
        .task { await load() }
        .task { await pollLive() }
        .refreshable { await load(force: true) }
    }

    // تحديث دوري صامت أثناء عرض التبويب — كي تتقدّم النتائج/الدقائق وتنتقل
    // «لم تبدأ» → «مباشر» دون تحديث الصفحة يدويًا. لا يلمس مؤشّر التحميل.
    // يتسارع (15ث) عند وجود مباراة جارية، ويتباطأ (40ث) عدا ذلك.
    private func pollLive() async {
        while !Task.isCancelled {
            let hasLive = today.contains { $0.status.live } || !world.isEmpty
            let delay: UInt64 = hasLive ? 15_000_000_000 : 40_000_000_000
            try? await Task.sleep(nanoseconds: delay)
            if Task.isCancelled { break }
            await load(force: true)
        }
    }

    // MARK: - الترويسة + التبويبات

    private var header: some View {
        HStack(spacing: 12) {
            Image(systemName: "dot.radiowaves.left.and.right")
                .font(.system(size: 19, weight: .bold))
                .foregroundStyle(SpTheme.green)
            Text("المباشر")
                .font(SportsFonts.headline(size: 24))
                .foregroundStyle(SpTheme.onDark)
            Spacer(minLength: 0)
            if liveNowCount > 0 {
                HStack(spacing: 6) {
                    Circle().fill(SpTheme.crimson).frame(width: 7, height: 7)
                    Text("\(liveNowCount) مباشرة")
                        .font(SportsFonts.app(size: 13, weight: .bold))
                        .foregroundStyle(SpTheme.crimson)
                }
                .padding(.horizontal, 12).padding(.vertical, 6)
                .background(Capsule().fill(SpTheme.crimson.opacity(0.12)))
            }
        }
        .frame(maxWidth: .infinity)
    }

    private var liveNowCount: Int {
        tab == .matches ? today.filter { $0.status.live }.count : world.filter { $0.fixture.status.live }.count
    }

    private var tabBar: some View {
        HStack(spacing: 6) {
            ForEach(Tab.allCases) { t in
                let active = tab == t
                Button { withAnimation(.easeOut(duration: 0.2)) { tab = t } } label: {
                    Text(t.rawValue)
                        .font(SportsFonts.app(size: 14, weight: active ? .heavy : .semibold))
                        .foregroundStyle(active ? .white : SpTheme.onDarkDim)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 10)
                        .background(
                            RoundedRectangle(cornerRadius: 11, style: .continuous)
                                .fill(active ? SpTheme.green : SpTheme.cardFill)
                                .overlay(RoundedRectangle(cornerRadius: 11, style: .continuous)
                                    .stroke(active ? .clear : SpTheme.outline, lineWidth: 1))
                        )
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
    }

    // MARK: - تبويب «المباريات» (بطولاتنا اليوم حسب الفئة)

    @ViewBuilder private var matchesTab: some View {
        VStack(alignment: .leading, spacing: 18) {
            dayStrip
            if matchesLoading {
                SpLoading()
            } else if today.isEmpty {
                SpEmptyState(icon: "calendar", title: "لا مباريات في هذا اليوم",
                             subtitle: "اختر يومًا آخر من الشريط أعلاه")
            } else {
                let live = today.filter { $0.status.live }.sorted(by: orderedByCategory)
                if !live.isEmpty {
                    liveNowSection(live)
                }
                ForEach(categoryGroups, id: \.category) { group in
                    categorySection(group.category, group.fixtures)
                }
            }
        }
    }

    // شريط اختيار اليوم — من قبل ٣ أيام حتى أسبوعين، الضغط يجلب مباريات اليوم المختار.
    private var dayOptions: [Date] {
        let start = Self.riyadhCal.startOfDay(for: Date())
        return (-3...14).compactMap { Self.riyadhCal.date(byAdding: .day, value: $0, to: start) }
    }

    private func isSameDay(_ a: Date, _ b: Date) -> Bool {
        Self.riyadhCal.isDate(a, inSameDayAs: b)
    }

    private var dayStrip: some View {
        ScrollViewReader { proxy in
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(dayOptions, id: \.self) { day in dayChip(day) }
                }
                .padding(.horizontal, 2).padding(.vertical, 2)
            }
            .onAppear { proxy.scrollTo(Self.riyadhCal.startOfDay(for: selectedDate), anchor: .center) }
        }
    }

    private func dayChip(_ day: Date) -> some View {
        let selected = isSameDay(day, selectedDate)
        let isToday = isSameDay(day, Date())
        return Button {
            guard !isSameDay(day, selectedDate) else { return }
            selectedDate = day
            Task { await loadDay() }
        } label: {
            VStack(spacing: 2) {
                Text(isToday ? "اليوم" : SpFormat.weekdayName(day))
                    .font(SportsFonts.app(size: 11, weight: .bold))
                    .foregroundStyle(selected ? .white : SpTheme.onDarkDim)
                Text(SpFormat.dayMonthLabel(day))
                    .font(SportsFonts.app(size: 12.5, weight: .heavy))
                    .foregroundStyle(selected ? .white : SpTheme.onDark)
                    .lineLimit(1)
            }
            .frame(minWidth: 58)
            .padding(.horizontal, 12).padding(.vertical, 9)
            .background(
                RoundedRectangle(cornerRadius: 13, style: .continuous)
                    .fill(selected ? SpTheme.green : SpTheme.cardFill)
                    .overlay(RoundedRectangle(cornerRadius: 13, style: .continuous)
                        .stroke(selected ? .clear : SpTheme.outline, lineWidth: 1))
            )
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .id(Self.riyadhCal.startOfDay(for: day))
    }

    @ViewBuilder private func liveNowSection(_ fixtures: [SpFixture]) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 9) {
                Circle().fill(SpTheme.crimson).frame(width: 8, height: 8)
                Text("مباشر الآن")
                    .font(SportsFonts.headline(size: 18))
                    .foregroundStyle(SpTheme.onDark)
                Spacer(minLength: 0)
                Text("\(fixtures.count)")
                    .font(SportsFonts.app(size: 13, weight: .bold))
                    .foregroundStyle(SpTheme.crimson)
                    .padding(.horizontal, 9).padding(.vertical, 3)
                    .background(Capsule().fill(SpTheme.crimson.opacity(0.12)))
            }
            ForEach(fixtures) { f in SpMatchCard(fixture: f, showsCompetition: true) }
        }
    }

    private struct CatGroup { let category: String; let fixtures: [SpFixture] }

    // الفئات (بلا الجارية الآن — تُعرض أعلى)، مرتّبة حسب الأولوية ثم الوقت.
    private var categoryGroups: [CatGroup] {
        let rest = today.filter { !$0.status.live }
        let byCat = Dictionary(grouping: rest) { catBySlug[$0.competitionSlug ?? ""] ?? "world" }
        return categoryOrder.compactMap { cat in
            guard let items = byCat[cat], !items.isEmpty else { return nil }
            // القادمة (غير المنتهية) أولًا بالوقت، ثم المنتهية.
            let sorted = items.sorted { a, b in
                if a.status.finished != b.status.finished { return !a.status.finished }
                return a.timestamp < b.timestamp
            }
            return CatGroup(category: cat, fixtures: sorted)
        }
    }

    private func categorySection(_ category: String, _ fixtures: [SpFixture]) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 9) {
                Image(systemName: categoryIcon(category))
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(category == "saudi" ? SpTheme.green : SpTheme.onDarkDim)
                Text(liveCategoryLabel(category))
                    .font(SportsFonts.headline(size: 18))
                    .foregroundStyle(SpTheme.onDark)
                Spacer(minLength: 0)
                Text("\(fixtures.count)")
                    .font(SportsFonts.app(size: 13, weight: .bold))
                    .foregroundStyle(SpTheme.onDarkFaint)
                    .monospacedDigit()
            }
            ForEach(fixtures) { f in SpMatchCard(fixture: f, showsCompetition: true) }
        }
    }

    // الفئة العالمية تُعرض كـ«كأس العالم» حسب طلب المالك (موسم كأس العالم 2026).
    private func liveCategoryLabel(_ category: String) -> String {
        category == "world" ? "كأس العالم" : SportsConstants.categoryLabel(category)
    }

    private func categoryIcon(_ category: String) -> String {
        switch category {
        case "saudi": return "star.fill"
        case "world": return "globe"
        default: return "trophy.fill"
        }
    }

    // ترتيب الجارية الآن: حسب أولوية الفئة ثم الوقت.
    private func orderedByCategory(_ a: SpFixture, _ b: SpFixture) -> Bool {
        let ra = categoryOrder.firstIndex(of: catBySlug[a.competitionSlug ?? ""] ?? "world") ?? categoryOrder.count
        let rb = categoryOrder.firstIndex(of: catBySlug[b.competitionSlug ?? ""] ?? "world") ?? categoryOrder.count
        if ra != rb { return ra < rb }
        return a.timestamp < b.timestamp
    }

    // MARK: - تبويب «مباشر العالم» (كل مباريات العالم الجارية الآن)

    @ViewBuilder private var worldTab: some View {
        if world.isEmpty {
            SpEmptyState(icon: "dot.radiowaves.left.and.right",
                         title: "لا مباريات مباشرة عالميًا",
                         subtitle: "ستظهر هنا أي مباراة جارية الآن حول العالم")
        } else {
            ForEach(worldGroups) { g in
                VStack(alignment: .leading, spacing: 12) {
                    worldGroupHeader(g)
                    ForEach(g.matches) { item in SpMatchCard(fixture: item.fixture) }
                }
            }
        }
    }

    private struct LiveGroup: Identifiable {
        let leagueId: Int
        let name: String
        let country: String
        let flag: String?
        let logo: String?
        let rank: Int        // 0=سعودي، 1=بطولاتنا، 2=عالمي
        let matches: [SpWorldLiveItem]
        var id: Int { leagueId }
    }

    private var worldGroups: [LiveGroup] {
        let byLeague = Dictionary(grouping: world) { $0.leagueId }
        let mapped = byLeague.map { (leagueId, group) -> LiveGroup in
            let first = group.first
            let slug = first?.competitionSlug
            let rank = SportsConstants.isSaudi(slug) ? 0 : (slug != nil ? 1 : 2)
            return LiveGroup(
                leagueId: leagueId,
                name: first?.competition ?? first?.country ?? "—",
                country: first?.countryAr ?? "",
                flag: first?.flag,
                logo: first?.leagueLogo,
                rank: rank,
                matches: group.sorted { $0.fixture.timestamp < $1.fixture.timestamp }
            )
        }
        return mapped.sorted { a, b in
            if a.rank != b.rank { return a.rank < b.rank }
            if a.country != b.country { return a.country < b.country }
            return a.name < b.name
        }
    }

    private func worldGroupHeader(_ g: LiveGroup) -> some View {
        let isSaudi = g.rank == 0
        let tint: Color = isSaudi ? SpTheme.green : SpTheme.greenSoft
        return HStack(spacing: 12) {
            Group {
                if let url = g.logo ?? g.flag, !url.isEmpty {
                    SpRemoteImage(url: url)
                        .padding(5)
                        .frame(width: 36, height: 36)
                        .background(Circle().fill(.white))
                        .overlay(Circle().stroke(SpTheme.outline, lineWidth: 1))
                } else {
                    Image(systemName: isSaudi ? "star.fill" : "globe")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(tint)
                        .frame(width: 36, height: 36)
                        .background(Circle().fill(tint.opacity(0.14)))
                }
            }
            VStack(alignment: .leading, spacing: 1) {
                Text(g.name)
                    .font(SportsFonts.headline(size: 16))
                    .foregroundStyle(SpTheme.onDark)
                    .lineLimit(1).minimumScaleFactor(0.8)
                if !g.country.isEmpty {
                    Text(g.country)
                        .font(SportsFonts.app(size: 11))
                        .foregroundStyle(SpTheme.onDarkDim)
                        .lineLimit(1)
                }
            }
            Spacer(minLength: 0)
            HStack(spacing: 4) {
                Circle().fill(SpTheme.crimson).frame(width: 6, height: 6)
                Text("\(g.matches.count)")
                    .font(SportsFonts.app(size: 13, weight: .bold))
                    .foregroundStyle(SpTheme.crimson)
            }
            .padding(.horizontal, 10).padding(.vertical, 4)
            .background(Capsule().fill(SpTheme.crimson.opacity(0.12)))
        }
    }

    // MARK: - التحميل

    private func load(force: Bool = false) async {
        if !force { loading = true }
        let dateKey = SpFormat.dateKey(selectedDate)
        async let todayOpt = try? APIClient.shared.fetchToday(date: dateKey, ignoreCache: force)
        async let worldOpt = try? APIClient.shared.fetchWorldLive(ignoreCache: force)
        async let compsOpt = try? APIClient.shared.fetchCompetitions(ignoreCache: force)

        let todayResp = await todayOpt
        let worldResp = await worldOpt
        if let comps = (await compsOpt)?.competitions {
            self.catBySlug = Dictionary(comps.map { ($0.slug, $0.category) }, uniquingKeysWith: { a, _ in a })
        }
        self.today = todayResp?.today ?? []
        self.world = worldResp?.matches ?? []

        if todayResp == nil && worldResp == nil {
            self.loadError = "تعذّر الاتصال بخادم البيانات"
        } else {
            self.loadError = nil
        }
        self.loading = false
    }

    // إعادة تحميل قائمة «المباريات» لليوم المختار فقط (الشريط) — مستقلّ عن «مباشر العالم».
    private func loadDay() async {
        matchesLoading = true
        let resp = try? await APIClient.shared.fetchToday(date: SpFormat.dateKey(selectedDate))
        self.today = resp?.today ?? []
        matchesLoading = false
    }
}
