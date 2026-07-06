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
    /// الجدول الموحّد متعدد البطولات — comps بفواصل (حد الخادم 8 لكل طلب؛
    /// الأكثر يُجزّأ في fetchUnifiedFixturesChunked) + نطاق تواريخ صريح.
    func fetchUnifiedFixtures(comps: [String], from: String, to: String, ignoreCache: Bool = false) async throws -> SpUnifiedFixturesResponse {
        try await get(SpUnifiedFixturesResponse.self, path: "/sports/fixtures",
                      query: ["comps": comps.joined(separator: ","), "from": from, "to": to],
                      ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI)
    }

    /// يجزّئ أي عدد بطولات إلى طلبات من 8 (حد الخادم) بالتوازي ثم يدمج ويرتّب.
    func fetchUnifiedFixturesChunked(comps: [String], from: String, to: String) async throws -> [SpFixture] {
        guard !comps.isEmpty else { return [] }
        var chunks: [[String]] = []
        var i = 0
        while i < comps.count {
            chunks.append(Array(comps[i..<min(i + 8, comps.count)]))
            i += 8
        }
        var all: [SpFixture] = []
        try await withThrowingTaskGroup(of: [SpFixture].self) { group in
            for chunk in chunks {
                group.addTask {
                    try await APIClient.shared.fetchUnifiedFixtures(comps: chunk, from: from, to: to, ignoreCache: true).fixtures
                }
            }
            for try await part in group { all.append(contentsOf: part) }
        }
        return all.sorted { a, b in
            if a.timestamp != b.timestamp { return a.timestamp < b.timestamp }
            return a.id < b.id
        }
    }
}

// MARK: - فلتر البطولات (المصدر الموحّد: «بطولاتي المفضّلة»)

/// «الكل» في المركز = بطولات SpCompetitionFavorites نفسها (بلوك «بطولاتي» في
/// تبويب البطولات) — مصدر حقيقة واحد: ما تفضّله هناك يظهر جدوله هنا والعكس.
/// عند أول تشغيل تُبذَر المفضّلة بالبطولات المهمة (روشن/كأس الملك/السوبر/
/// أبطال آسيا وأوروبا/الخمسة الكبرى + المونديال والخليجي ما داما جاريين).
nonisolated enum SpCenterFilter {
    static let storageKey = "sabqsports.matchescenter.comp"
    static let seededKey = "sabqsports.matchescenter.seeded.v1"

    /// البطولات المهمة المفعّلة افتراضيًّا (تُبذر مرة واحدة في المفضّلة).
    static let defaultSlugs = [
        "pro-league", "kings-cup", "super-cup",
        "afc-champions-league", "champions-league",
        "premier-league", "la-liga", "serie-a", "bundesliga", "ligue-1",
    ]

    static func load() -> String {
        UserDefaults.standard.string(forKey: storageKey) ?? "all"
    }

    static func save(_ selection: String) {
        UserDefaults.standard.set(selection, forKey: storageKey)
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
    @Environment(SpAuthStore.self) private var auth
    @Environment(SpAppRouter.self) private var router

    @State private var competitions: [SpCompetition] = []
    @State private var fixtures: [SpFixture] = []
    @State private var wcBracket: SpWcBracket?
    @State private var visibleDays: [SpCenterDay] = []
    @State private var loading = true
    @State private var loadError: String?
    @State private var liveOnly = false
    @State private var selection = SpCenterFilter.load()
    @State private var showCompsManager = false

    /// «بطولاتي المفضّلة» — المصدر الموحّد مع تبويب البطولات.
    private var favorites: SpCompetitionFavorites { SpCompetitionFavorites.shared }

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
    @State private var deepLinkedMatch: IDBox?

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
        // إعادة التحميل تلقائيًّا مع كل تغيير فلتر أو تعديل للمفضّلة (المهمة السابقة تُلغى).
        .task(id: reloadKey) { await load() }
        .sheet(isPresented: $showCompsManager) { compsManagerSheet }
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
        .navigationDestination(item: $deepLinkedMatch) { box in
            SpMatchCenter(fixtureId: box.id, preview: nil)
        }
        .onChange(of: router.pendingMatchId) { _, id in
            guard let id else { return }
            deepLinkedMatch = IDBox(id: id)
            router.pendingMatchId = nil
        }
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
            manageButton
            calendarButton
            liveToggle
            accountChip
        }
    }

    // مؤشّر الحساب في شريط «المباريات» (التبويب الافتراضي): ضيف = «دخول» ذهبية
    // تفتح ورقة الدخول العامّة؛ عضو = أفتار + نقطة خضراء يفتح تبويب «حسابي».
    @ViewBuilder private var accountChip: some View {
        Button {
            if auth.isLoggedIn { router.openAccount() } else { router.requestLogin() }
        } label: {
            if auth.isLoggedIn {
                ZStack(alignment: .bottomTrailing) {
                    Group {
                        if let a = auth.member?.avatar, !a.isEmpty {
                            SpAvatarImage(url: a, size: 28, ring: SpTheme.green.opacity(0.5),
                                          placeholderFg: SpTheme.onDarkFaint, placeholderBg: SpTheme.chipFill)
                        } else {
                            Circle().fill(SpTheme.green)
                                .frame(width: 28, height: 28)
                                .overlay(Text(memberInitial)
                                    .font(SportsFonts.app(size: 13, weight: .heavy))
                                    .foregroundStyle(.white))
                        }
                    }
                    Circle().fill(Color(red: 0.15, green: 0.78, blue: 0.50))
                        .frame(width: 9, height: 9)
                        .overlay(Circle().stroke(SpTheme.surface, lineWidth: 2))
                }
                .frame(width: 34, height: 34)
            } else {
                HStack(spacing: 5) {
                    Image(systemName: "person.crop.circle").font(.system(size: 14, weight: .bold))
                    Text("دخول").font(SportsFonts.app(size: 12.5, weight: .heavy))
                }
                .foregroundStyle(Color(red: 0.11, green: 0.08, blue: 0.02))
                .padding(.horizontal, 11).frame(height: 34)
                .background(Capsule().fill(SpTheme.gold))
            }
        }
        .buttonStyle(.plain)
        .accessibilityLabel(auth.isLoggedIn ? "حسابي" : "تسجيل الدخول بعضوية سبق")
    }

    private var memberInitial: String {
        let n = (auth.member?.name ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        return n.isEmpty ? "؟" : String(n.prefix(1))
    }

    /// أيقونة ضبط البطولات — تفتح صفحة اختيار ما يظهر في الجدول الموحّد.
    // أزرار الترويسة أيقونات عارية بلا صناديق (chrome أخف).
    private var manageButton: some View {
        Button {
            showCompsManager = true
        } label: {
            Image(systemName: "slider.horizontal.3")
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(SpTheme.onDarkDim)
                .frame(width: 34, height: 34)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("اختيار البطولات")
    }

    private var calendarButton: some View {
        Button {
            pickedDate = dateForCurrentSelection() ?? Self.riyadhCal.startOfDay(for: Date())
            showDatePicker = true
        } label: {
            Image(systemName: "calendar")
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(SpTheme.onDarkDim)
                .frame(width: 34, height: 34)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("اختيار التاريخ")
    }

    // زرّ «مباشر» — نقطة + نص بلا كبسولة؛ القرمزي لمسة الحالة النشطة فقط.
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
            .padding(.horizontal, 6)
            .frame(height: 34)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    /// شرائح البطولات = «بطولاتي المفضّلة» مرتّبة بالفئة (السعودية أولًا) —
    /// الكؤوس المنتهية تسقط من الشرائح تلقائيًّا (المونديال بعد النهائي).
    private var chipComps: [SpCompetition] {
        favorites.items
            .filter { !($0.type == "cup" && $0.status == "finished") }
            .sorted { a, b in
                let ra = SportsConstants.categoryRank(a.category)
                let rb = SportsConstants.categoryRank(b.category)
                if ra != rb { return ra < rb }
                return a.name < b.name
            }
    }

    /// مفتاح إعادة التحميل: الاختيار + بصمة المفضّلة (تبديل بطولة = تحديث فوري).
    private var reloadKey: String {
        selection + "|" + favorites.items.map(\.slug).sorted().joined(separator: ",")
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

                    if shouldShowWorldCupBracket {
                        worldCupBracketBlock
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

    @ViewBuilder private var emptyList: some View {
        if selection == "all", favorites.items.isEmpty {
            SpEmptyState(
                icon: "slider.horizontal.3",
                title: "اختر بطولاتك",
                subtitle: "فعّل البطولات التي تهمّك من أيقونة الضبط أعلى الشاشة ليظهر جدولها الموحّد هنا"
            )
            .padding(.top, 40)
        } else {
            SpEmptyState(
                icon: liveOnly ? "dot.radiowaves.left.and.right" : "calendar",
                title: liveOnly ? "لا مباريات مباشرة الآن" : "لا مباريات في هذه الفترة",
                subtitle: liveOnly ? "أوقف فلتر «مباشر» لعرض الجدول كاملًا" : "جرّب بطولة أخرى أو عد لاحقًا"
            )
            .padding(.top, 40)
        }
    }

    private var shouldShowWorldCupBracket: Bool {
        selection == "world-cup" && !liveOnly
    }

    @ViewBuilder private var worldCupBracketBlock: some View {
        if let tree = wcBracket?.tree, !tree.columns.isEmpty {
            VStack(alignment: .leading, spacing: 12) {
                HStack(spacing: 9) {
                    Image(systemName: "trophy.fill")
                        .font(.system(size: 14, weight: .bold))
                        .foregroundStyle(SpTheme.gold)
                    Text("الأدوار الإقصائية")
                        .font(SportsFonts.headline(size: 18))
                        .foregroundStyle(SpTheme.onDark)
                    Spacer(minLength: 0)
                }
                SpWcBracketTreeView(tree: tree)
            }
            .padding(.bottom, 2)
        }
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
                    .font(SportsFonts.app(size: 13, weight: .heavy))
                    .foregroundStyle(SpTheme.crimson)
                    .monospacedDigit()
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

    // MARK: صفحة اختيار البطولات

    /// فئات السجل مرتّبة (السعودية أولًا) — لعرض مجموعات صفحة الاختيار.
    private var registryByCategory: [(category: String, comps: [SpCompetition])] {
        let grouped = Dictionary(grouping: competitions, by: { $0.category })
        return grouped
            .map { (category: $0.key, comps: $0.value.sorted { $0.name < $1.name }) }
            .sorted { SportsConstants.categoryRank($0.category) < SportsConstants.categoryRank($1.category) }
    }

    /// وصف حالة البطولة في صف الاختيار — يطمئن المستخدم أن الجدول سيمتلئ لاحقًا.
    private func compStatusHint(_ comp: SpCompetition) -> String? {
        switch comp.status {
        case "ongoing": return "جارية الآن"
        case "upcoming": return "تنطلق قريبًا"
        case "finished": return "انتهت"
        default: return nil
        }
    }

    private var compsManagerSheet: some View {
        NavigationStack {
            List {
                Section {
                    Text("ما تفعّله هنا يظهر جدوله في «الكل» وفي بلوك «بطولاتي» بتبويب البطولات — مصدر واحد للمفضّلة.")
                        .font(SportsFonts.app(size: 12, weight: .semibold))
                        .foregroundStyle(SpTheme.onDarkDim)
                        .listRowBackground(Color.clear)
                }
                ForEach(registryByCategory, id: \.category) { group in
                    Section(SportsConstants.categoryLabel(group.category)) {
                        ForEach(group.comps) { comp in
                            compManagerRow(comp)
                        }
                    }
                }
            }
            .navigationTitle("بطولات الجدول")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("تم") { showCompsManager = false }
                }
            }
        }
        .presentationDetents([.large, .medium])
    }

    private func compManagerRow(_ comp: SpCompetition) -> some View {
        HStack(spacing: 10) {
            SpTeamLogo(logo: comp.logo ?? "", size: 24)
            VStack(alignment: .leading, spacing: 2) {
                Text(comp.name)
                    .font(SportsFonts.app(size: 13.5, weight: .bold))
                    .foregroundStyle(SpTheme.onDark)
                    .lineLimit(1)
                if let hint = compStatusHint(comp) {
                    Text(hint)
                        .font(SportsFonts.app(size: 10.5, weight: .semibold))
                        .foregroundStyle(comp.status == "ongoing" ? SpTheme.green : SpTheme.onDarkDim)
                }
            }
            Spacer(minLength: 0)
            Toggle("", isOn: Binding(
                get: { favorites.isFavorite(comp.slug) },
                set: { _ in favorites.toggle(comp) }
            ))
            .labelsHidden()
            .tint(SpTheme.green)
        }
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
            // مزامنة لقطات المفضّلة (شعار/حالة/موسم) ثم بذر البطولات المهمة
            // مرة واحدة — فيصير بلوك «بطولاتي» في تبويب البطولات هو نفسه سلة الجدول.
            favorites.sync(with: resp.competitions)
            seedFavoritesIfNeeded(resp.competitions)
        }
    }

    /// بذر «البطولات المهمة» في المفضّلة عند أول تشغيل للمركز (مرة واحدة):
    /// السلة الافتراضية + المونديال/الخليجي ما داما غير منتهيين. ما أضافه
    /// المستخدم سابقًا في «بطولاتي» يبقى كما هو — نضيف فوقه ولا نحذف.
    private func seedFavoritesIfNeeded(_ registry: [SpCompetition]) {
        guard !UserDefaults.standard.bool(forKey: SpCenterFilter.seededKey) else { return }
        var slugs = SpCenterFilter.defaultSlugs
        for special in ["world-cup", "gulf-cup"] {
            if let comp = registry.first(where: { $0.slug == special }), comp.status != "finished" {
                slugs.append(special)
            }
        }
        for slug in slugs {
            if let comp = registry.first(where: { $0.slug == slug }) {
                favorites.add(comp)
            }
        }
        UserDefaults.standard.set(true, forKey: SpCenterFilter.seededKey)
    }

    /// نطاق الجلب: «الكل» أسبوع للخلف ← 60 يومًا (يغطي انطلاقات أغسطس كلها)،
    /// وبطولة واحدة ← 120 يومًا (نظرة أعمق — مرحلة دوري الأبطال في سبتمبر مثلًا).
    private func requestWindow() -> (from: String, to: String) {
        let day: TimeInterval = 86_400
        let from = SpFormat.dateKey(Date().addingTimeInterval(-7 * day))
        let span: TimeInterval = selection == "all" ? 60 : 120
        let to = SpFormat.dateKey(Date().addingTimeInterval(span * day))
        return (from, to)
    }

    private func load(force: Bool = false) async {
        if !force, fixtures.isEmpty { loading = true }
        // اختيار يتيم (بطولة أُزيلت من المفضّلة وشريحتها اختفت) → عودة لـ«الكل».
        if selection != "all", !favorites.items.isEmpty, !favorites.isFavorite(selection) {
            selection = "all"
            SpCenterFilter.save("all")
            return // task(id: reloadKey) سيعيد التحميل بالاختيار الجديد
        }
        let comps = selection == "all" ? favorites.items.map(\.slug) : [selection]
        let window = requestWindow()
        do {
            async let mergedTask = APIClient.shared.fetchUnifiedFixturesChunked(
                comps: comps, from: window.from, to: window.to)
            async let bracketTask: SpWcBracket? = comps.contains("world-cup")
                ? (try? await APIClient.shared.fetchWorldCupBracket(ignoreCache: true))
                : nil

            let unified = try await mergedTask
            let bracket = await bracketTask
            let merged = mergeWorldCupBracketFixtures(from: bracket, into: unified)
            if Task.isCancelled { return }
            if visualSignature(merged) != visualSignature(fixtures) {
                fixtures = merged
                rebuildDays(keepSelection: true)
            } else if visibleDays.isEmpty {
                rebuildDays(keepSelection: true)
            }
            wcBracket = bracket
            loadError = nil
        } catch {
            if fixtures.isEmpty { loadError = (error as? LocalizedError)?.errorDescription ?? "تعذّر الاتصال بخادم البيانات" }
            if selection != "world-cup" { wcBracket = nil }
        }
        loading = false
    }

    /// `/sports/fixtures` لا يعيد خانات المونديال الصناعية التي يبنيها مسار
    /// `/world-cup/bracket` للمواجهات المستقبلية قبل نشرها من المزوّد. ندمجها
    /// هنا حتى تظهر مباريات مثل ربع النهائي بمجرد حسم طرفيها.
    private func mergeWorldCupBracketFixtures(from bracket: SpWcBracket?, into unified: [SpFixture]) -> [SpFixture] {
        guard let bracket else { return unified }

        var byId: [Int: SpFixture] = [:]
        for column in bracket.tree?.columns ?? [] {
            for slot in column.slots {
                if let fx = slot.fixture {
                    byId[fx.id] = SpFixture(worldCup: fx)
                }
            }
        }
        if let thirdPlace = bracket.tree?.thirdPlace {
            byId[thirdPlace.id] = SpFixture(worldCup: thirdPlace)
        }

        for fixture in unified {
            byId[fixture.id] = fixture
        }
        return byId.values.sorted { a, b in
            if a.timestamp != b.timestamp { return a.timestamp < b.timestamp }
            return a.id < b.id
        }
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

    // اسم البطولة على نفس هندسة صفّ النتيجة (فراغ النجمة 24pt + توسيط) —
    // فيتمركز تحت عمود الوقت/الموعد تمامًا لا تحت منتصف الصف الكامل.
    @ViewBuilder private var compBadge: some View {
        if showCompetition, let comp = fixture.competition, !comp.isEmpty {
            HStack(spacing: 6) {
                Color.clear.frame(width: 24, height: 0)
                // اسم البطولة رمادي هادئ — يتكرّر أسفل كل صف، فاللون المحوري هنا ضوضاء.
                Text(comp)
                    .font(SportsFonts.app(size: 9.5, weight: .bold))
                    .foregroundStyle(SpTheme.onDarkDim)
                    .lineLimit(1)
                    .frame(maxWidth: .infinity)
            }
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
