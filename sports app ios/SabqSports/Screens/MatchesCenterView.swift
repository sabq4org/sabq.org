import SwiftUI

// مركز المباريات الموحّد — تبويب «المباريات» لموسم 2026/27.
//
// خلَف جدول المونديال (MatchesView): نفس محرّك التصفح المجرَّب حرفيًّا —
// تجميع بالأيام، شريط تواريخ متزامن ثنائي الاتجاه (ScrollViewReader +
// PreferenceKey لا scrollPosition — انظر تعليقات MatchesView عن stuttering
// وفساد إزاحة RTL)، زر «مباريات اليوم» العائم، شريط «مباشر الآن»، وطيّ
// الترويسة مع التمرير — لكنه معمَّم على SpFixture الموحّد عبر كل البطولات:
//   • فلتر بطولات أعلى الشاشة («القوية» افتراضيًا: روشن + الخمسة الكبرى
//     + المونديال ما دام جاريًا) محفوظ في UserDefaults.
//   • يتغذى من GET /sports/fixtures?comps=… (جدول موحّد مرتّب بالتاريخ).
//   • كل صف فيه نجمة متابعة (SpMatchFollows القائم) وشارة بطولة عند الخلط.
//   • بلوك «مبارياتي» (SpMyMatchesCard القائمة) مثبّت تحت الفلتر.
//   • شريط أدوار عام يظهر عند فلترة بطولة إقصائية واحدة (يغطي المونديال).
//
// ملاحظة تقنية: مفاتيح التفضيل ومُعدِّل الطيّ منسوخان من MatchesView بأسماء
// مستقلة عمدًا — MatchesView لا يُمسّ وهو يخدم المونديال الجاري، ويُسحب عند
// انتهاء البطولة فيبقى هذا الملف المصدر الوحيد للمحرّك.

// MARK: - الشبكة

nonisolated struct SpUnifiedFixturesResponse: Decodable {
    let configured: Bool
    let fixtures: [SpFixture]
}

extension APIClient {
    /// الجدول الموحّد متعدد البطولات — comps بفواصل (حد الخادم 8).
    func fetchUnifiedFixtures(comps: [String], ignoreCache: Bool = false) async throws -> SpUnifiedFixturesResponse {
        try await get(SpUnifiedFixturesResponse.self, path: "/sports/fixtures",
                      query: ["comps": comps.joined(separator: ",")],
                      ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI)
    }
}

// MARK: - فلتر البطولات (اختيار محفوظ)

/// اختيار فلتر البطولات: «الكل» = السلة القوية، أو بطولة واحدة بعينها.
/// يُخزَّن كسلسلة slug (أو "all") في UserDefaults فيبقى بين الجلسات.
nonisolated enum SpCenterFilter {
    static let storageKey = "sabqsports.matchescenter.comp"

    /// السلة القوية الافتراضية — روشن + الدوريات الأوروبية الخمسة الكبرى.
    /// المونديال/الخليجي يُضافان ديناميكيًّا من سجل البطولات ما داما غير منتهيين.
    static let strongSlugs = ["pro-league", "premier-league", "la-liga", "serie-a", "bundesliga", "ligue-1"]

    /// شرائح الفلتر المعروضة (بترتيب العرض RTL): الكل ثم روشن ثم البطولات الموسمية.
    static let chipSlugs = ["pro-league", "world-cup", "premier-league", "la-liga", "serie-a", "bundesliga", "ligue-1", "gulf-cup"]

    static func load() -> String {
        UserDefaults.standard.string(forKey: storageKey) ?? "all"
    }

    static func save(_ selection: String) {
        UserDefaults.standard.set(selection, forKey: storageKey)
    }

    /// الـ slugs الفعلية للطلب حسب الاختيار وحالة البطولات (المونديال يدخل
    /// «الكل» ما دام جاريًا فقط — وبعد انتهائه يختفي من السلة والشرائح معًا).
    static func requestSlugs(selection: String, competitions: [SpCompetition]) -> [String] {
        if selection != "all" { return [selection] }
        var slugs = strongSlugs
        if let wc = competitions.first(where: { $0.slug == "world-cup" }), wc.status == "ongoing" {
            slugs.insert("world-cup", at: 1)
        }
        if let gc = competitions.first(where: { $0.slug == "gulf-cup" }), gc.status == "ongoing" {
            slugs.append("gulf-cup")
        }
        return slugs
    }
}

// MARK: - نماذج المحرّك (مناظرة لنظيراتها في MatchesView لكن على SpFixture)

private struct SpCenterDay: Identifiable {
    let id: String
    let date: Date
    /// اسم الدور المعرَّب (للكؤوس) — يظهر في رأس اليوم عند فلترة بطولة واحدة.
    let round: String
    let fixtures: [SpFixture]
}

private struct SpCenterDayTopKey: PreferenceKey {
    static var defaultValue: [String: CGFloat] = [:]
    static func reduce(value: inout [String: CGFloat], nextValue: () -> [String: CGFloat]) {
        value.merge(nextValue(), uniquingKeysWith: { $1 })
    }
}

private struct SpCenterScrollRequest: Equatable {
    let id: String
    let nonce: Int
    var animated: Bool = true
}

private struct SpCenterHeaderHeightKey: PreferenceKey {
    static var defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
        value = max(value, nextValue())
    }
}

// طيّ الترويسة العلوية وشريط التبويب معًا باتجاه التمرير — نسخة مطابقة لمنطق
// MatchesView (بوابة عمق 90pt + نافذة كتم بعد كل تبديل). iOS 18+.
private struct SpCenterAutoCollapse: ViewModifier {
    @Binding var hidden: Bool
    @Binding var armed: Bool
    @Environment(SpTabBarVisibility.self) private var tabBarVis
    @State private var lastY: CGFloat = 0
    @State private var suppressUntil: Date = .distantPast

    func body(content: Content) -> some View {
        if #available(iOS 18.0, *) {
            content.onScrollGeometryChange(for: CGFloat.self) { $0.contentOffset.y } action: { _, newY in
                defer { lastY = newY }
                guard armed, Date() >= suppressUntil else { return }
                let delta = newY - lastY
                if newY < 24 { set(false) }
                else if delta > 8, newY > 90 { set(true) }
                else if delta < -8 { set(false) }
            }
        } else {
            content
        }
    }

    private func set(_ h: Bool) {
        guard hidden != h || tabBarVis.hidden != h else { return }
        suppressUntil = Date().addingTimeInterval(0.4)
        if hidden != h {
            withAnimation(.easeInOut(duration: 0.25)) { hidden = h }
        }
        if tabBarVis.hidden != h {
            withAnimation(.easeInOut(duration: 0.25)) { tabBarVis.hidden = h }
        }
    }
}

// MARK: - الشاشة

struct MatchesCenterView: View {
    @Environment(\.scenePhase) private var scenePhase
    @Environment(SpLiveStream.self) private var liveStream
    @Environment(SpMatchFollows.self) private var follows

    @State private var competitions: [SpCompetition] = []
    @State private var fixtures: [SpFixture] = []
    @State private var visibleDays: [SpCenterDay] = []
    @State private var loading = true
    @State private var loadError: String?
    @State private var liveOnly = false
    @State private var selection = SpCenterFilter.load()

    // محرّك التمرير المتزامن — نفس حالة MatchesView حرفيًّا.
    @State private var scrolledDayId: String?
    @State private var scrollTargetRequest: SpCenterScrollRequest?
    @State private var scrollRequestNonce = 0
    @State private var railCenterId: String?
    @State private var didInitialScroll = false
    @State private var showDatePicker = false
    @State private var pickedDate = Date()
    @State private var suppressActiveDayUpdatesUntil = Date.distantPast
    @State private var listStartsAtToday = true
    @State private var headerHidden = false
    @State private var headerArmed = false
    @State private var headerHeight: CGFloat = 0

    private static let riyadhCal: Calendar = {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "Asia/Riyadh") ?? .current
        return c
    }()

    private static let dayScrollAnchor = UnitPoint(x: 0.5, y: 0.0)
    private static let topScrollId = "center-screen-top"

    /// لمسة اللون: أخضر الهوية للوضع المختلط، ولون البطولة عند فلترة واحدة.
    private var accent: Color {
        selection == "all" ? SpTheme.green : SpTheme.compAccent(selection)
    }

    /// الجدول مختلط (أكثر من بطولة)؟ — يقرّر إظهار شارة البطولة على الصفوف.
    private var isMixed: Bool { selection == "all" }

    var body: some View {
        NavigationStack {
            bodyContent
                .background(SpAmbientBackground())
                .navigationTitle("")
                .toolbar(.hidden, for: .navigationBar)
        }
        .task { await loadCompetitions() }
        // إعادة التحميل تلقائيًّا مع كل تغيير فلتر (المهمة السابقة تُلغى).
        .task(id: selection) { await load() }
        .task { await pollLive() }
        .onChange(of: liveOnly) { _, _ in rebuildDays(keepSelection: true) }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { Task { await load(force: true) } }
        }
        // البث الحيّ (SSE): الجدول يضم بطولات عامة + المونديال — نصغي للنسختين.
        .onChange(of: liveStream.sportsVersion) { _, _ in
            Task { await load(force: true) }
        }
        .onChange(of: liveStream.wcVersion) { _, _ in
            Task { await load(force: true) }
        }
        .refreshable { await load(force: true) }
        .sheet(isPresented: $showDatePicker) { datePickerSheet }
        // تعافي شريط الأيام بعد طيّ/بسط الترويسة — نفس علاج MatchesView الموثّق.
        .onChange(of: headerHidden) { _, _ in
            let target = railCenterId ?? scrolledDayId
            Task { @MainActor in
                for delay: UInt64 in [350_000_000, 800_000_000] {
                    try? await Task.sleep(nanoseconds: delay)
                    railCenterId = nil
                    try? await Task.sleep(nanoseconds: 30_000_000)
                    railCenterId = target
                }
            }
        }
    }

    // MARK: الترويسة + الفلتر

    private var header: some View {
        VStack(spacing: 14) {
            toolbar
            compsStrip
            if singleCupRounds.count > 1 { roundStrip }
        }
        .padding(.horizontal, 16)
        .padding(.top, 8)
        .padding(.bottom, 10)
    }

    private var toolbar: some View {
        HStack(spacing: 10) {
            HStack(spacing: 8) {
                Image(systemName: "soccerball")
                    .font(.system(size: 17, weight: .bold))
                    .foregroundStyle(accent)
                Text("المباريات")
                    .font(SportsFonts.headline(size: 22))
                    .foregroundStyle(SpTheme.onDark)
            }
            Spacer(minLength: 0)
            calendarButton
            liveToggle
        }
    }

    private var calendarButton: some View {
        Button {
            pickedDate = dateForCurrentSelection() ?? Self.riyadhCal.startOfDay(for: Date())
            showDatePicker = true
        } label: {
            Image(systemName: "calendar")
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(SpTheme.onDarkDim)
                .frame(width: 38, height: 34)
                .background(RoundedRectangle(cornerRadius: 10, style: .continuous).fill(SpTheme.chipFill))
                .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).stroke(SpTheme.outline, lineWidth: 1))
        }
        .buttonStyle(.plain)
    }

    private var liveToggle: some View {
        Button {
            withAnimation(.easeOut(duration: 0.2)) { liveOnly.toggle() }
        } label: {
            HStack(spacing: 6) {
                Circle()
                    .fill(liveOnly ? SpTheme.crimson : SpTheme.onDarkFaint)
                    .frame(width: 7, height: 7)
                Text("مباشر")
                    .font(SportsFonts.app(size: 13, weight: .bold))
                    .foregroundStyle(liveOnly ? SpTheme.crimson : SpTheme.onDarkDim)
            }
            .padding(.horizontal, 12)
            .frame(height: 34)
            .background(Capsule().fill(liveOnly ? SpTheme.crimson.opacity(0.10) : SpTheme.chipFill))
            .overlay(Capsule().stroke(liveOnly ? SpTheme.crimson.opacity(0.45) : SpTheme.outline, lineWidth: 1))
        }
        .buttonStyle(.plain)
    }

    /// شرائح البطولات المعروضة: «الكل» + المتاح من السلة (البطولة المنتهية تسقط).
    private var chipComps: [SpCompetition] {
        SpCenterFilter.chipSlugs.compactMap { slug in
            guard let comp = competitions.first(where: { $0.slug == slug }) else { return nil }
            // الكؤوس المنتهية/غير المجدولة تختفي من الشرائح (المونديال بعد النهائي).
            if comp.type == "cup", comp.status == "finished" { return nil }
            return comp
        }
    }

    private var compsStrip: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 7) {
                filterChip(slug: "all", name: "الكل", logo: nil)
                ForEach(chipComps) { comp in
                    filterChip(slug: comp.slug, name: comp.name, logo: comp.logo)
                }
            }
            .padding(.horizontal, 1)
        }
    }

    private func filterChip(slug: String, name: String, logo: String?) -> some View {
        let active = selection == slug
        let tint = slug == "all" ? SpTheme.green : SpTheme.compAccent(slug)
        return Button {
            guard selection != slug else { return }
            withAnimation(.easeOut(duration: 0.2)) { selection = slug }
            SpCenterFilter.save(slug)
        } label: {
            HStack(spacing: 6) {
                if let logo, !logo.isEmpty {
                    SpTeamLogo(logo: logo, size: 16)
                }
                Text(shortName(name))
                    .font(SportsFonts.app(size: 12.5, weight: active ? .bold : .semibold))
                    .foregroundStyle(active ? tint : SpTheme.onDarkDim)
                    .lineLimit(1)
            }
            .padding(.horizontal, 12).padding(.vertical, 7)
            .background(Capsule().fill(active ? tint.opacity(0.10) : SpTheme.chipFill))
            .overlay(Capsule().stroke(active ? tint.opacity(0.55) : SpTheme.outline, lineWidth: 1))
        }
        .buttonStyle(.plain)
    }

    /// أسماء مختصرة للشرائح — الأسماء الرسمية الطويلة تزحم الشريط.
    private func shortName(_ name: String) -> String {
        let short: [String: String] = [
            "دوري روشن السعودي": "روشن",
            "الدوري الإنجليزي": "الإنجليزي",
            "الدوري الإسباني": "الإسباني",
            "الدوري الإيطالي": "الإيطالي",
            "الدوري الألماني": "الألماني",
            "الدوري الفرنسي": "الفرنسي",
            "كأس العالم": "المونديال",
            "كأس الخليج": "الخليجي",
        ]
        return short[name] ?? name
    }

    // شريط الأدوار — يظهر عند فلترة بطولة إقصائية واحدة بتعدد أدوار (المونديال
    // وأشباهه): شرائح بأسماء الأدوار المعرَّبة تقفز لأول يوم في الدور.
    private var singleCupRounds: [String] {
        guard selection != "all" else { return [] }
        var seen = Set<String>()
        var rounds: [String] = []
        for day in visibleDays where !day.round.isEmpty {
            if seen.insert(day.round).inserted { rounds.append(day.round) }
        }
        // دوريات الجولات («الجولة 12») ليست أدوارًا إقصائية — لا شريط لها.
        if rounds.allSatisfy({ $0.hasPrefix("الجولة") }) { return [] }
        return rounds
    }

    private var activeRound: String? {
        visibleDays.first(where: { $0.id == (scrolledDayId ?? "") })?.round
    }

    private var roundStrip: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 7) {
                ForEach(singleCupRounds, id: \.self) { round in
                    let active = activeRound == round
                    Button {
                        if let day = firstDay(forRound: round) { goToDay(day.id) }
                    } label: {
                        Text(round)
                            .font(SportsFonts.app(size: 12.5, weight: active ? .bold : .semibold))
                            .foregroundStyle(active ? accent : SpTheme.onDarkDim)
                            .padding(.horizontal, 12).padding(.vertical, 6)
                            .background(Capsule().fill(active ? accent.opacity(0.10) : Color.clear))
                            .overlay(Capsule().stroke(active ? accent.opacity(0.55) : SpTheme.outline, lineWidth: 1))
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 1)
        }
    }

    /// أول يوم في الدور — يُفضَّل اليوم/القادم لا أقدم يوم تاريخيًّا.
    private func firstDay(forRound round: String) -> SpCenterDay? {
        let cal = Self.riyadhCal
        let start = cal.startOfDay(for: Date())
        let days = visibleDays.filter { $0.round == round }
        return days.first(where: { day in
            day.date >= start || day.fixtures.contains { $0.status.live || !$0.status.finished }
        }) ?? days.first
    }

    // MARK: المحتوى

    @ViewBuilder private var bodyContent: some View {
        if loading && fixtures.isEmpty {
            SpLoading().frame(maxWidth: .infinity, maxHeight: .infinity)
        } else if let loadError, fixtures.isEmpty {
            SpEmptyState(icon: "wifi.exclamationmark", title: "تعذّر التحميل", subtitle: loadError)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else {
            ZStack(alignment: .bottom) {
                // نفس بنية MatchesView: الطيّ إزاحة تحويلية للكتلة كلها — لا تغيير
                // تخطيط للترويسة (انظر تعليقها عن فساد رسم الشريط الأفقي).
                VStack(spacing: 0) {
                    pinnedTopBar
                    matchesList
                }
                .padding(.bottom, headerHidden ? -headerHeight : 0)
                .offset(y: headerHidden ? -headerHeight : 0)
                floatingToday
            }
        }
    }

    private var pinnedTopBar: some View {
        VStack(spacing: 0) {
            header
                .opacity(headerHidden ? 0 : 1)
                .allowsHitTesting(!headerHidden)
                .background(
                    GeometryReader { geo in
                        Color.clear.preference(key: SpCenterHeaderHeightKey.self, value: geo.size.height)
                    }
                )
            if !visibleDays.isEmpty {
                dateRail
            }
        }
        .onPreferenceChange(SpCenterHeaderHeightKey.self) { headerHeight = $0 }
        .background(SpTheme.screenGradient.ignoresSafeArea(.container, edges: .top))
        .zIndex(5)
    }

    // شريط التواريخ المتزامن — الحاوية LTR داخليًّا والمصفوفة معكوسة يدويًّا
    // (علاج فساد إزاحة RTL الموثّق في MatchesView — لا تغيّره).
    private var dateRail: some View {
        ScrollViewReader { proxy in
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(Array(visibleDays.reversed())) { day in dateChip(day).id(day.id) }
                }
                .padding(.horizontal, 16).padding(.top, 4).padding(.bottom, 8)
            }
            .environment(\.layoutDirection, .leftToRight)
            .onChange(of: railCenterId) { _, id in
                guard let id else { return }
                withAnimation(.easeInOut(duration: 0.22)) {
                    proxy.scrollTo(id, anchor: .center)
                }
            }
            .onAppear {
                guard let id = railCenterId else { return }
                Task { @MainActor in
                    try? await Task.sleep(nanoseconds: 300_000_000)
                    proxy.scrollTo(id, anchor: .center)
                }
            }
        }
        .overlay(alignment: .bottom) { Divider().overlay(SpTheme.outline) }
    }

    private func dateChip(_ day: SpCenterDay) -> some View {
        let active = scrolledDayId == day.id
        let isToday = Self.riyadhCal.isDateInToday(day.date)
        let hasLive = day.fixtures.contains { $0.status.live }
        return Button {
            goToDay(day.id)
        } label: {
            VStack(spacing: 3) {
                HStack(spacing: 5) {
                    if hasLive {
                        Circle().fill(SpTheme.crimson).frame(width: 5, height: 5)
                    }
                    Text(isToday ? "اليوم" : SpFormat.weekdayName(day.date))
                        .font(SportsFonts.app(size: 10.5, weight: .semibold))
                        .foregroundStyle(active ? accent : SpTheme.onDarkDim)
                        .lineLimit(1)
                }
                Text(SpFormat.dayMonthLabel(day.date))
                    .font(SportsFonts.app(size: 12, weight: .heavy))
                    .foregroundStyle(active ? accent : SpTheme.onDark)
                    .lineLimit(1)
                    .minimumScaleFactor(0.85)
            }
            .frame(width: 78, height: 50)
            .background(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill(active ? accent.opacity(0.07) : SpTheme.railChipFill)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .stroke(active ? accent : SpTheme.outline, lineWidth: active ? 1.5 : 1)
            )
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private var matchesList: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 16) {
                    Color.clear.frame(height: 0.5).id(Self.topScrollId)

                    // بلوك «مبارياتي» — المتابَعات عبر كل البطولات؛ يختفي كليًّا بلا متابعات.
                    if !follows.visibleItems.isEmpty {
                        SpMyMatchesCard()
                            .padding(.top, 2)
                    }

                    if visibleDays.isEmpty {
                        emptyList
                    } else {
                        if !liveOnly && !liveFixtures.isEmpty { livePinned }
                        ForEach(daysForList) { day in
                            daySection(day)
                                .background(
                                    GeometryReader { geo in
                                        Color.clear.preference(
                                            key: SpCenterDayTopKey.self,
                                            value: [day.id: geo.frame(in: .named("center-scroll")).minY]
                                        )
                                    }
                                )
                        }
                    }
                    Color.clear.frame(height: 168)
                }
                .padding(.horizontal, 16).padding(.top, 12)
            }
            .background(SpAmbientBackground())
            .coordinateSpace(name: "center-scroll")
            .modifier(SpCenterAutoCollapse(hidden: $headerHidden, armed: $headerArmed))
            .onAppear { runInitialScroll() }
            .onChange(of: visibleDaySignature) { _, _ in
                didInitialScroll = false
                runInitialScroll()
            }
            .onChange(of: scrollTargetRequest) { _, request in
                guard let request, !request.id.isEmpty else { return }
                if request.animated {
                    withAnimation(.easeInOut(duration: 0.32)) {
                        proxy.scrollTo(request.id, anchor: Self.dayScrollAnchor)
                    }
                } else {
                    proxy.scrollTo(request.id, anchor: Self.dayScrollAnchor)
                }
            }
            .onPreferenceChange(SpCenterDayTopKey.self) { tops in
                updateActiveDay(from: tops)
            }
        }
    }

    private func runInitialScroll() {
        guard !didInitialScroll, !visibleDays.isEmpty else { return }
        didInitialScroll = true
        let target = todayDayId
        guard !target.isEmpty else { return }
        listStartsAtToday = true
        scrolledDayId = target
        railCenterId = target
        headerHidden = false
        SpTabBarVisibility.shared.hidden = false
        headerArmed = false
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: 80_000_000)
            requestScroll(to: Self.topScrollId, animated: false)
            try? await Task.sleep(nanoseconds: 350_000_000)
            headerArmed = true
        }
    }

    private func goToDay(_ id: String) {
        guard !id.isEmpty else { return }
        scrolledDayId = id
        railCenterId = id
        if headerHidden { withAnimation(.easeInOut(duration: 0.25)) { headerHidden = false } }
        if SpTabBarVisibility.shared.hidden {
            withAnimation(.easeInOut(duration: 0.25)) { SpTabBarVisibility.shared.hidden = false }
        }
        headerArmed = false
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: 500_000_000)
            headerArmed = true
        }
        if listStartsAtToday {
            if id == todayDayId {
                requestScroll(to: id)
                return
            }
            listStartsAtToday = false
            Task { @MainActor in
                try? await Task.sleep(nanoseconds: 60_000_000)
                requestScroll(to: id)
            }
            return
        }
        requestScroll(to: id)
    }

    private func requestScroll(to id: String, animated: Bool = true) {
        suppressActiveDayUpdatesUntil = Date().addingTimeInterval(animated ? 0.45 : 0.25)
        scrollRequestNonce += 1
        scrollTargetRequest = SpCenterScrollRequest(id: id, nonce: scrollRequestNonce, animated: animated)
    }

    private func updateActiveDay(from sectionTops: [String: CGFloat]) {
        guard Date() >= suppressActiveDayUpdatesUntil else { return }
        guard !sectionTops.isEmpty else { return }
        let anchorY: CGFloat = 14
        let passed = sectionTops.filter { $0.value <= anchorY }
        let candidate = passed.max(by: { $0.value < $1.value })?.key
            ?? sectionTops.min(by: { abs($0.value - anchorY) < abs($1.value - anchorY) })?.key
        guard let candidate, candidate != scrolledDayId else { return }
        scrolledDayId = candidate
        railCenterId = candidate
    }

    private var emptyList: some View {
        SpEmptyState(
            icon: liveOnly ? "dot.radiowaves.left.and.right" : "calendar",
            title: liveOnly ? "لا مباريات مباشرة الآن" : "لا مباريات في هذه الفترة",
            subtitle: liveOnly ? "أوقف فلتر «مباشر» لعرض الجدول كاملًا" : "جرّب بطولة أخرى أو عد لاحقًا"
        )
        .padding(.top, 40)
    }

    private var livePinned: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 9) {
                Circle().fill(SpTheme.crimson).frame(width: 8, height: 8)
                Text("مباشر الآن")
                    .font(SportsFonts.headline(size: 18))
                    .foregroundStyle(SpTheme.onDark)
                Spacer(minLength: 0)
                Text("\(liveFixtures.count)")
                    .font(SportsFonts.app(size: 13, weight: .bold))
                    .foregroundStyle(SpTheme.crimson)
                    .padding(.horizontal, 9).padding(.vertical, 3)
                    .background(Capsule().fill(SpTheme.crimson.opacity(0.12)))
            }
            matchGroup(liveFixtures.sorted { $0.timestamp < $1.timestamp })
        }
        .padding(.bottom, 2)
    }

    private func daySection(_ day: SpCenterDay) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            dayHeader(day)
                .id(day.id)
            matchGroup(day.fixtures)
        }
    }

    private func matchGroup(_ fixtures: [SpFixture]) -> some View {
        VStack(spacing: 0) {
            ForEach(Array(fixtures.enumerated()), id: \.element.id) { idx, f in
                SpCenterMatchRow(fixture: f, showCompetition: isMixed)
                if idx < fixtures.count - 1 {
                    Divider()
                        .overlay(SpTheme.outline.opacity(0.75))
                        .padding(.horizontal, 10)
                }
            }
        }
    }

    private func dayHeader(_ day: SpCenterDay) -> some View {
        VStack(spacing: 6) {
            VStack(spacing: 2) {
                Text(dateLabel(day.date))
                    .font(SportsFonts.headline(size: 15))
                    .foregroundStyle(SpTheme.onDark)
                // اسم الدور يظهر عند فلترة بطولة واحدة فقط — في الوضع المختلط
                // الأدوار تختلف بين بطولات اليوم الواحد فلا معنى لعرض أحدها.
                if !isMixed, !day.round.isEmpty {
                    Text(day.round)
                        .font(SportsFonts.app(size: 11, weight: .bold))
                        .foregroundStyle(accent)
                }
            }
            Rectangle()
                .fill(SpTheme.outline.opacity(0.5))
                .frame(height: 0.5)
                .frame(maxWidth: .infinity)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 12)
        .padding(.bottom, 2)
    }

    private var isAwayFromToday: Bool {
        !visibleDays.isEmpty && !todayDayId.isEmpty && (scrolledDayId ?? "") != todayDayId
    }

    @ViewBuilder private var floatingToday: some View {
        if isAwayFromToday {
            Button {
                goToDay(todayDayId)
            } label: {
                HStack(spacing: 0) {
                    Text(todayHasMatches ? "مباريات اليوم" : "الأقرب")
                        .font(SportsFonts.app(size: 13, weight: .bold))
                }
                .foregroundStyle(.white)
                .padding(.horizontal, 16).padding(.vertical, 11)
                .background(Capsule().fill(accent))
                .overlay(Capsule().stroke(.white.opacity(0.15), lineWidth: 1))
                .shadow(color: accent.opacity(0.35), radius: 10, x: 0, y: 4)
            }
            .buttonStyle(.plain)
            .padding(.bottom, 12)
            .zIndex(10)
        }
    }

    // MARK: المشتقّات

    private var liveFixtures: [SpFixture] { fixtures.filter { $0.status.live } }

    private func makeDays(from fixtures: [SpFixture], liveOnly: Bool) -> [SpCenterDay] {
        let cal = Self.riyadhCal
        let source: [SpFixture] = liveOnly ? fixtures.filter { $0.status.live } : fixtures
        // حلقات صريحة الأنواع — الصيغة الوظيفية المتسلسلة كانت تُغرق محلّل الأنواع.
        var dates: [String: Date] = [:]
        var buckets: [String: [SpFixture]] = [:]
        for f in source {
            let day = cal.startOfDay(for: f.kickoff)
            let key = SpFormat.dateKey(day)
            dates[key] = day
            buckets[key, default: []].append(f)
        }
        var days: [SpCenterDay] = []
        for (key, list) in buckets {
            guard let date = dates[key] else { continue }
            let fxs = list.sorted { a, b in
                if a.timestamp != b.timestamp { return a.timestamp < b.timestamp }
                return a.id < b.id
            }
            days.append(SpCenterDay(id: key, date: date, round: fxs.first?.round ?? "", fixtures: fxs))
        }
        return days.sorted { $0.date < $1.date }
    }

    private var visibleDaySignature: String {
        visibleDays.map(\.id).joined(separator: "|")
    }

    private var daysForList: [SpCenterDay] {
        guard listStartsAtToday,
              !todayDayId.isEmpty,
              let todayIndex = visibleDays.firstIndex(where: { $0.id == todayDayId })
        else { return visibleDays }
        return Array(visibleDays[todayIndex...])
    }

    private func rebuildDays(keepSelection: Bool) {
        visibleDays = makeDays(from: fixtures, liveOnly: liveOnly)
        guard !visibleDays.isEmpty else {
            scrolledDayId = nil
            scrollTargetRequest = nil
            railCenterId = nil
            return
        }
        if keepSelection, let current = scrolledDayId, visibleDays.contains(where: { $0.id == current }) {
            return
        }
        didInitialScroll = false
    }

    private var todayHasMatches: Bool { visibleDays.contains { Self.riyadhCal.isDateInToday($0.date) } }

    private var todayDayId: String {
        let cal = Self.riyadhCal
        if let today = visibleDays.first(where: { cal.isDateInToday($0.date) }) { return today.id }
        let start = cal.startOfDay(for: Date())
        if let upcoming = visibleDays.filter({ $0.date >= start }).min(by: { $0.date < $1.date }) { return upcoming.id }
        return visibleDays.last?.id ?? ""
    }

    private func nearestDayId(to date: Date) -> String {
        let target = Self.riyadhCal.startOfDay(for: date)
        return visibleDays.min(by: {
            abs($0.date.timeIntervalSince(target)) < abs($1.date.timeIntervalSince(target))
        })?.id ?? ""
    }

    private var dateRange: ClosedRange<Date>? {
        guard let lo = visibleDays.first?.date, let hi = visibleDays.last?.date, lo <= hi else { return nil }
        return lo...hi
    }

    private func dateForCurrentSelection() -> Date? {
        if let id = scrolledDayId, let day = visibleDays.first(where: { $0.id == id }) { return day.date }
        let id = todayDayId
        if !id.isEmpty, let day = visibleDays.first(where: { $0.id == id }) { return day.date }
        return nil
    }

    private func dateLabel(_ d: Date) -> String {
        let cal = Self.riyadhCal
        let weekday = SpFormat.weekdayName(d)
        let dm = SpFormat.dayMonthLabel(d)
        if cal.isDateInToday(d) { return "اليوم · \(weekday) \(dm)" }
        if cal.isDateInTomorrow(d) { return "غدًا · \(weekday) \(dm)" }
        if cal.isDateInYesterday(d) { return "أمس · \(weekday) \(dm)" }
        return "\(weekday) · \(dm)"
    }

    // MARK: ورقة اختيار التاريخ

    private var datePickerSheet: some View {
        NavigationStack {
            VStack(spacing: 0) {
                Group {
                    if let range = dateRange {
                        DatePicker("", selection: $pickedDate, in: range, displayedComponents: .date)
                    } else {
                        DatePicker("", selection: $pickedDate, displayedComponents: .date)
                    }
                }
                .datePickerStyle(.graphical)
                .tint(accent)
                .environment(\.calendar, Calendar(identifier: .gregorian))
                .environment(\.locale, Locale(identifier: "ar"))
                .padding()
                Spacer(minLength: 0)
            }
            .navigationTitle("اذهب إلى تاريخ")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("اذهب") {
                        let id = nearestDayId(to: pickedDate)
                        showDatePicker = false
                        guard !id.isEmpty else { return }
                        Task { @MainActor in
                            try? await Task.sleep(nanoseconds: 350_000_000)
                            goToDay(id)
                        }
                    }
                }
                ToolbarItem(placement: .cancellationAction) {
                    Button("إلغاء") { showDatePicker = false }
                }
            }
        }
        .presentationDetents([.medium, .large])
    }

    // MARK: التحميل + التحديث اللحظي

    private func loadCompetitions() async {
        if let resp = try? await APIClient.shared.fetchCompetitions() {
            competitions = resp.competitions
        }
    }

    private func load(force: Bool = false) async {
        if !force, fixtures.isEmpty { loading = true }
        let comps = SpCenterFilter.requestSlugs(selection: selection, competitions: competitions)
        do {
            let resp = try await APIClient.shared.fetchUnifiedFixtures(comps: comps, ignoreCache: true)
            if Task.isCancelled { return }
            if visualSignature(resp.fixtures) != visualSignature(fixtures) {
                fixtures = resp.fixtures
                rebuildDays(keepSelection: true)
            } else if visibleDays.isEmpty {
                rebuildDays(keepSelection: true)
            }
            loadError = nil
        } catch {
            if fixtures.isEmpty { loadError = (error as? LocalizedError)?.errorDescription ?? "تعذّر الاتصال بخادم البيانات" }
        }
        loading = false
    }

    private func visualSignature(_ rows: [SpFixture]) -> String {
        rows.map { f in
            "\(f.id):\(f.timestamp):\(f.status.code):\(f.status.elapsed ?? -1):\(f.status.extra ?? -1):\(f.status.live):\(f.status.finished):\(f.goals.home ?? -1)-\(f.goals.away ?? -1):\(f.home.id)-\(f.away.id):\(f.competitionSlug ?? "")"
        }
        .joined(separator: "|")
    }

    // السياسة الموحّدة: حيّ/انطلاقة وشيكة = 10ث، وإلا 45ث (نفس المونديال).
    private func pollLive() async {
        while !Task.isCancelled {
            let now = Date().timeIntervalSince1970
            let hasLive = fixtures.contains { $0.status.live }
            let nearKickoff = fixtures.contains {
                !$0.status.finished && !$0.status.live && abs(Double($0.timestamp) - now) <= 120
            }
            let delay: UInt64 = (hasLive || nearKickoff) ? 10_000_000_000 : 45_000_000_000
            try? await Task.sleep(nanoseconds: delay)
            if Task.isCancelled { break }
            await load(force: true)
        }
    }
}

// MARK: - صفّ مباراة المركز الموحّد

// SpScoreRow القياسية + نجمة متابعة (نظام SpMatchFollows: تذكير محلي قبل
// الانطلاق + إشعارات الأهداف/النتيجة من الخادم للمسجّلين — opt-in بلمسة) +
// شارة بطولة صغيرة في الوضع المختلط. النقر يفتح مركز المباراة القائم.
private struct SpCenterMatchRow: View {
    let fixture: SpFixture
    let showCompetition: Bool
    @Environment(SpMatchFollows.self) private var follows

    var body: some View {
        ZStack(alignment: .topLeading) {
            NavigationLink {
                SpMatchCenter(fixtureId: fixture.id, preview: fixture)
            } label: {
                rowLabel
            }
            .buttonStyle(SpPressStyle())

            followButton.padding(.top, 10).padding(.leading, 8)
        }
    }

    private var rowBackground: Color {
        fixture.status.live ? SpTheme.crimson.opacity(0.035) : Color.clear
    }

    private var rowLabel: some View {
        VStack(spacing: 4) {
            HStack(spacing: 6) {
                Color.clear.frame(width: 24, height: 24) // فراغ محجوز لنجمة المتابعة
                SpScoreRow(fixture: fixture)
            }
            compBadge
        }
        .padding(.vertical, 10)
        .padding(.horizontal, 8)
        .background(rowBackground)
        .contentShape(Rectangle())
    }

    @ViewBuilder private var compBadge: some View {
        if showCompetition, let comp = fixture.competition, !comp.isEmpty {
            Text(comp)
                .font(SportsFonts.app(size: 9.5, weight: .bold))
                .foregroundStyle(SpTheme.compAccent(fixture.competitionSlug ?? ""))
                .lineLimit(1)
        }
    }

    private var followButton: some View {
        let following = follows.isFollowing(fixture.id)
        return Button {
            follows.toggle(fixture)
        } label: {
            Image(systemName: following ? "star.fill" : "star")
                .font(.system(size: 13, weight: .bold))
                .foregroundStyle(following ? SpTheme.gold : SpTheme.onDarkFaint)
                .frame(width: 24, height: 24)
                .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .sensoryFeedback(.impact(weight: .light), trigger: following)
        .accessibilityLabel(following ? "إلغاء متابعة المباراة" : "متابعة المباراة")
    }
}
