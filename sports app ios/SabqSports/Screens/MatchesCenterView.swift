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
//   • كثافة العرض: اليوم وغدًا = كل المباريات؛ من بعد غد = حتى 3 لكل بطولة
//     + «بقية المباريات» يفتح جدول البطولة (تبويب المباريات).
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
    /// `ignoreCache` يُمرَّر فقط عند التحديث الإجباري (سحب/استطلاع حيّ) — لا يُفرض دائمًا.
    func fetchUnifiedFixturesChunked(
        comps: [String],
        from: String,
        to: String,
        ignoreCache: Bool = false
    ) async throws -> [SpFixture] {
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
                    try await APIClient.shared.fetchUnifiedFixtures(
                        comps: chunk, from: from, to: to, ignoreCache: ignoreCache
                    ).fixtures
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
        "afc-champions-league", "champions-league", "uefa-super-cup", "europa-league",
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

/// مجموعة مباريات بطولة واحدة داخل يوم بعيد — ملخص + زر «بقية المباريات».
private struct SpCenterCompSlice: Identifiable {
    let id: String
    let slug: String?
    let name: String?
    let featured: [SpFixture]
    let hiddenCount: Int
}

/// أقصى عدد مباريات ظاهرة لكل بطولة في الأيام البعيدة (بعد غد فما بعد).
private let spCenterFeaturedPerComp = 3

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
    /// لا نطلب الجدول قبل وصول سجل البطولات ومزامنة المفضّلة؛ سابقًا كان يبدأ
    /// طلب أول فارغ ثم يُلغى ويُعاد بعد 120ms، فتطول الشاشة البيضاء عند الفتح.
    @State private var registryReady = false
    @State private var loadError: String?
    @State private var liveOnly = false
    /// نبضة موجز/دورة استطلاع وصلت والتبويب مخفي — تُصرف بتحميل واحد عند العودة.
    @State private var pendingLiveReload = false
    @State private var selection = SpCenterFilter.load()
    // نطاق «العدسة» — يُفلتر شرائح البطولات الظاهرة ويُميّز الحبّة المتصدّرة.
    // مستقلّ عن selection: عند التعمّق في بطولة واحدة يبقى النطاق كما هو فتظلّ
    // الشرائح مفلترة عليه والحبّة تعرضه.
    @State private var lensScope: String = {
        let s = SpCenterFilter.load()
        return (s == "all" || s.hasPrefix("lens:")) ? s : "all"
    }()
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
        isMixed ? SpTheme.green : SpTheme.compAccent(selection)
    }

    /// الجدول مختلط (أكثر من بطولة)؟ — يقرّر إظهار شارة البطولة على الصفوف.
    private var isMixed: Bool { selection == "all" || selection.hasPrefix("lens:") }

    var body: some View {
        NavigationStack {
            bodyContent
                .background(SpAmbientBackground())
                .navigationTitle("")
                .toolbar(.hidden, for: .navigationBar)
        }
        .task {
            await loadCompetitions()
            registryReady = true
        }
        // إعادة التحميل تلقائيًّا مع كل تغيير فلتر أو تعديل للمفضّلة (المهمة السابقة تُلغى).
        .task(id: reloadKey) {
            guard registryReady else { return }
            await load()
        }
        .sheet(isPresented: $showCompsManager) { compsManagerSheet }
        .task {
            await Task.yield()
            try? await Task.sleep(nanoseconds: 600_000_000)
            await pollLive()
        }
        .onChange(of: liveOnly) { _, _ in rebuildDays(keepSelection: true) }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active, router.selectedTab == .matches, registryReady, !fixtures.isEmpty {
                Task { await load(force: true) }
            }
        }
        // البث الحيّ (SSE): الجدول يضم بطولات عامة + المونديال — مراقب واحد لمجموع
        // النسختين (مراقبان منفصلان كانا يطلقان تحميلين كاملين متزامنين للنبضة
        // المختلطة). والتبويب المخفي لا يعيد التحميل مع كل نبضة (TabView يُبقي
        // التبويبات المزارة حيّة) — يؤجَّل التحديث لعودة الظهور.
        .onChange(of: liveStream.sportsVersion &+ liveStream.wcVersion) { _, _ in
            guard registryReady, !fixtures.isEmpty else { pendingLiveReload = true; return }
            guard router.selectedTab == .matches else { pendingLiveReload = true; return }
            Task { await load(force: true) }
        }
        .onChange(of: router.selectedTab) { _, tab in
            guard tab == .matches, pendingLiveReload else { return }
            pendingLiveReload = false
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
                Text(L("المباريات"))
                    .font(SportsFonts.headline(size: 22))
                    .foregroundStyle(SpTheme.onDark)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
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
                    Text(L("دخول")).font(SportsFonts.app(size: 12.5, weight: .heavy))
                }
                .foregroundStyle(Color(red: 0.11, green: 0.08, blue: 0.02))
                .padding(.horizontal, 11).frame(height: 34)
                .background(Capsule().fill(SpTheme.gold))
            }
        }
        .buttonStyle(.plain)
        .accessibilityLabel(auth.isLoggedIn ? L("حسابي") : L("تسجيل الدخول بعضوية سبق"))
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
        .accessibilityLabel(L("اختيار البطولات"))
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
        .accessibilityLabel(L("اختيار التاريخ"))
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
                Text(L("مباشر"))
                    .font(SportsFonts.app(size: 13, weight: .bold))
                    .foregroundStyle(liveOnly ? SpTheme.crimson : SpTheme.onDarkDim)
            }
            .padding(.horizontal, 6)
            .frame(height: 34)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    /// شرائح البطولات = «بطولاتي المفضّلة» ضمن نطاق العدسة المختار، مرتّبة بالفئة
    /// (السعودية أولًا). الكؤوس المنتهية تسقط تلقائيًّا (المونديال بعد النهائي).
    private var chipComps: [SpCompetition] {
        let base = favorites.items.filter { !($0.type == "cup" && $0.status == "finished") }
        let scoped: [SpCompetition]
        switch lensScope {
        case "lens:important":
            let important = Set(SpCenterFilter.defaultSlugs)
            scoped = base.filter { important.contains($0.slug) }
        case let s where s.hasPrefix("lens:category:"):
            let category = String(s.dropFirst("lens:category:".count))
            scoped = base.filter { $0.category == category }
        default: // "all"
            scoped = base
        }
        return scoped.sorted { a, b in
            let ra = SportsConstants.categoryRank(a.category)
            let rb = SportsConstants.categoryRank(b.category)
            if ra != rb { return ra < rb }
            return a.name < b.name
        }
    }

    /// مفتاح إعادة التحميل: الاختيار + بصمة المفضّلة (تبديل بطولة = تحديث فوري).
    private var reloadKey: String {
        "\(registryReady)|" + selection + "|" + favorites.items.map(\.slug).sorted().joined(separator: ",")
    }

    // صفّ فلترة واحد: حبّة «العدسة» (قائمة النطاق) تتصدّره، يليها فاصل رفيع ثم
    // شرائح البطولات ضمن النطاق. دمج صفّ العدسة القديم فيه وفّر صفًّا كاملًا وألغى
    // تكرار «الكل»: العدسة = النطاق، الشرائح = التنقّل داخله.
    private var compsStrip: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 7) {
                lensPill
                Rectangle()
                    .fill(SpTheme.outline)
                    .frame(width: 1, height: 20)
                    .padding(.horizontal, 1)
                ForEach(chipComps) { comp in
                    filterChip(slug: comp.slug, name: comp.name, logo: comp.logo)
                }
            }
            .padding(.horizontal, 1)
        }
    }

    /// عدسات النطاق — الكل/الأهم + فئات جغرافية. القيَم مطابقة لما يفهمه
    /// effectiveCompetitionSlugs، فتغيير العدسة يحمّل جدول النطاق مباشرة.
    private let lensList: [(key: String, title: String, icon: String)] = [
        ("all", "الكل", "circle.grid.2x2.fill"),
        ("lens:important", "الأهم", "sparkles"),
        ("lens:category:saudi", "السعودية", "flag.fill"),
        ("lens:category:european", "أوروبا", "globe.europe.africa.fill"),
        ("lens:category:world", "العالمية", "globe"),
    ]

    /// العدسة الفعّالة (للعنوان والأيقونة على الحبّة).
    private var activeLens: (key: String, title: String, icon: String) {
        lensList.first(where: { $0.key == lensScope }) ?? lensList[0]
    }

    /// الحبّة مملوءة عندما يكون العرض على نطاق العدسة نفسه (لا تعمّق في بطولة)؛
    /// وتصير محيطة عند اختيار شريحة بطولة محدّدة (فالتمييز يذهب لتلك الشريحة).
    private var isLensActive: Bool { selection == lensScope }

    private var lensBinding: Binding<String> {
        Binding(
            get: { lensScope },
            set: { newScope in
                withAnimation(.easeOut(duration: 0.2)) {
                    lensScope = newScope
                    selection = newScope
                }
                SpCenterFilter.save(newScope)
            }
        )
    }

    private var lensPill: some View {
        Menu {
            Picker(L("عدسة"), selection: lensBinding) {
                ForEach(lensList, id: \.key) { item in
                    Label(L(item.title), systemImage: item.icon).tag(item.key)
                }
            }
        } label: {
            HStack(spacing: 6) {
                Image(systemName: activeLens.icon).font(.system(size: 11, weight: .bold))
                Text(L(activeLens.title))
                    .font(SportsFonts.app(size: 12.5, weight: .bold))
                    .lineLimit(1)
                Image(systemName: "chevron.down").font(.system(size: 9, weight: .heavy))
            }
            .foregroundStyle(isLensActive ? .white : SpTheme.green)
            .padding(.horizontal, 12).padding(.vertical, 7)
            .background(Capsule().fill(isLensActive ? SpTheme.green : SpTheme.green.opacity(0.10)))
            .overlay(Capsule().stroke(isLensActive ? Color.clear : SpTheme.green.opacity(0.35), lineWidth: 1))
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(L("عدسة العرض")): \(L(activeLens.title))")
    }

    private func filterChip(slug: String, name: String, logo: String?) -> some View {
        let active = selection == slug
        let tint = slug == "all" ? SpTheme.green : SpTheme.compAccent(slug)
        return Button {
            // إعادة الضغط على البطولة النشطة تزيل الفلتر وترجع لنطاق العدسة الحالي.
            let newSelection = (selection == slug) ? lensScope : slug
            withAnimation(.easeOut(duration: 0.2)) { selection = newSelection }
            SpCenterFilter.save(newSelection)
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
        guard selection != "all", !selection.hasPrefix("lens:") else { return [] }
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
            // افتح هيكل الشاشة وأدواتها فورًا، ثم حمّل الجدول داخلها. إخفاء الترويسة
            // كاملة كان يجعل التطبيق يبدو عالقًا رغم أن التنقّل نفسه اكتمل.
            VStack(spacing: 0) {
                pinnedTopBar
                SpLoading().frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        } else if let loadError, fixtures.isEmpty {
            SpEmptyState(icon: "wifi.exclamationmark", title: L("تعذّر التحميل"), subtitle: loadError)
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
            let railDays = SpLanguage.shared.isEnglish ? visibleDays : Array(visibleDays.reversed())
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(railDays) { day in dateChip(day).id(day.id) }
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
                    Text(isToday ? L("اليوم") : SpFormat.weekdayName(day.date))
                        .font(SportsFonts.app(size: 10.5, weight: .semibold))
                        .foregroundStyle(active ? accent : SpTheme.onDarkDim)
                        .lineLimit(1)
                }
                Text(SpFormat.dayMonthLabel(day.date))
                    .font(SportsFonts.app(size: 12, weight: .semibold))
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
                    .stroke(active ? accent.opacity(0.55) : SpTheme.outline, lineWidth: 1)
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
                        SpMyMatchesCard(latestFixtures: fixtures)
                            .padding(.top, 2)
                    }

                    if shouldShowWorldCupBracket {
                        worldCupBracketBlock
                    }

                    if visibleDays.isEmpty {
                        emptyList
                    } else {
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
                title: L("اختر بطولاتك"),
                subtitle: L("فعّل البطولات التي تهمّك من أيقونة الضبط أعلى الشاشة ليظهر جدولها الموحّد هنا")
            )
            .padding(.top, 40)
        } else {
            SpEmptyState(
                icon: liveOnly ? "dot.radiowaves.left.and.right" : "calendar",
                title: liveOnly ? L("لا مباريات مباشرة الآن") : L("لا مباريات في هذه الفترة"),
                subtitle: liveOnly ? L("أوقف فلتر «مباشر» لعرض الجدول كاملًا") : L("جرّب بطولة أخرى أو عد لاحقًا")
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
                    Text(L("الأدوار الإقصائية"))
                        .font(SportsFonts.headline(size: 18))
                        .foregroundStyle(SpTheme.onDark)
                    Spacer(minLength: 0)
                }
                SpWcBracketTreeView(tree: tree)
            }
            .padding(.bottom, 2)
        }
    }

    private func daySection(_ day: SpCenterDay) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            dayHeader(day)
                .id(day.id)
            if shouldCollapseDay(day) {
                collapsedDayBody(day)
            } else {
                matchGroup(day.fixtures, showCompetition: isMixed)
            }
        }
    }

    /// اليوم وغدًا كاملان؛ من بعد غد يُلخَّص كل دوري إلى 3 مباريات + بقية المباريات.
    private func shouldCollapseDay(_ day: SpCenterDay) -> Bool {
        if liveOnly { return false }
        let cal = Self.riyadhCal
        if cal.isDateInToday(day.date) || cal.isDateInTomorrow(day.date) { return false }
        let start = cal.startOfDay(for: Date())
        guard let dayAfterTomorrow = cal.date(byAdding: .day, value: 2, to: start) else { return false }
        return day.date >= dayAfterTomorrow
    }

    @ViewBuilder
    private func collapsedDayBody(_ day: SpCenterDay) -> some View {
        let slices = competitionSlices(for: day.fixtures)
        VStack(alignment: .leading, spacing: 12) {
            ForEach(slices) { slice in
                VStack(alignment: .leading, spacing: 6) {
                    if isMixed, let name = slice.name, !name.isEmpty {
                        Text(name)
                            .font(SportsFonts.app(size: 12, weight: .bold))
                            .foregroundStyle(SpTheme.compAccent(slice.slug ?? ""))
                            .padding(.horizontal, 4)
                    }
                    matchGroup(slice.featured, showCompetition: false)
                    if slice.hiddenCount > 0 {
                        restMatchesButton(slice: slice)
                    }
                }
            }
        }
    }

    private func restMatchesButton(slice: SpCenterCompSlice) -> some View {
        Group {
            if let slug = slice.slug, let comp = competition(forSlug: slug) {
                NavigationLink {
                    CompetitionDetailView(comp: comp, openOnMatches: true)
                } label: {
                    restMatchesLabel(count: slice.hiddenCount)
                }
                .buttonStyle(.plain)
            } else {
                // لا سجل بطولة — لا رابط؛ نُبقي التلميح فقط (نادر).
                restMatchesLabel(count: slice.hiddenCount)
                    .opacity(0.7)
            }
        }
    }

    private func restMatchesLabel(count: Int) -> some View {
        HStack(spacing: 6) {
            Text(Lf("بقية المباريات (%d)", count))
                .font(SportsFonts.app(size: 12, weight: .bold))
            Image(systemName: "chevron.left")
                .font(.system(size: 10, weight: .bold))
            Spacer(minLength: 0)
        }
        .foregroundStyle(accent)
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(accent.opacity(0.1))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .stroke(accent.opacity(0.25), lineWidth: 1)
        )
    }

    private func competition(forSlug slug: String) -> SpCompetition? {
        competitions.first { $0.slug == slug }
            ?? favorites.items.first { $0.slug == slug }
    }

    /// تجميع يوم بعيد حسب البطولة: 3 مباريات مميّزة + عدد المخفي.
    private func competitionSlices(for fixtures: [SpFixture]) -> [SpCenterCompSlice] {
        var order: [String] = []
        var buckets: [String: [SpFixture]] = [:]
        var names: [String: String] = [:]
        for f in fixtures {
            let key = f.competitionSlug ?? "_unknown"
            if buckets[key] == nil { order.append(key) }
            buckets[key, default: []].append(f)
            if names[key] == nil, let n = f.competition, !n.isEmpty { names[key] = n }
        }
        order.sort { a, b in
            let ra = competitionSliceRank(a)
            let rb = competitionSliceRank(b)
            if ra != rb { return ra < rb }
            let ta = buckets[a]?.map(\.timestamp).min() ?? 0
            let tb = buckets[b]?.map(\.timestamp).min() ?? 0
            return ta < tb
        }
        return order.compactMap { key in
            guard let list = buckets[key] else { return nil }
            let ranked = list.sorted { featuredSort($0, before: $1) }
            let featured = Array(ranked.prefix(spCenterFeaturedPerComp))
            let hidden = max(0, ranked.count - featured.count)
            return SpCenterCompSlice(
                id: key,
                slug: key == "_unknown" ? nil : key,
                name: names[key],
                featured: featured,
                hiddenCount: hidden
            )
        }
    }

    private func competitionSliceRank(_ slug: String) -> Int {
        if let i = SpCenterFilter.defaultSlugs.firstIndex(of: slug) { return i }
        if SportsConstants.isSaudi(slug) { return 100 }
        if slug == "_unknown" { return 9_999 }
        return 500
    }

    private func featuredSort(_ a: SpFixture, before b: SpFixture) -> Bool {
        let pa = featuredPriority(a)
        let pb = featuredPriority(b)
        if pa != pb { return pa < pb }
        if a.timestamp != b.timestamp { return a.timestamp < b.timestamp }
        return a.id < b.id
    }

    /// أولوية الظهور في الملخص: مباشر → متابعة → فريق متابَع → سعودي → قادمة قبل المنتهية.
    private func featuredPriority(_ f: SpFixture) -> (Int, Int, Int, Int, Int) {
        let live = f.status.live ? 0 : 1
        let followed = follows.isFollowing(f.id) ? 0 : 1
        let team = involvesFollowedTeam(f) ? 0 : 1
        let saudi = SportsConstants.isSaudiFixture(f) ? 0 : 1
        let finished = f.status.finished ? 1 : 0
        return (live, followed, team, saudi, finished)
    }

    private func involvesFollowedTeam(_ f: SpFixture) -> Bool {
        let ids = Set(
            auth.follows
                .filter { $0.kind == "team" }
                .compactMap { Int($0.refId) }
        )
        guard !ids.isEmpty else { return false }
        return ids.contains(f.home.id) || ids.contains(f.away.id)
    }

    private func matchGroup(_ fixtures: [SpFixture], showCompetition: Bool) -> some View {
        VStack(spacing: 0) {
            ForEach(Array(fixtures.enumerated()), id: \.element.id) { idx, f in
                SpCenterMatchRow(fixture: f, showCompetition: showCompetition)
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
                    Text(todayHasMatches ? L("مباريات اليوم") : L("الأقرب"))
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
                let ra = daySortRank(a)
                let rb = daySortRank(b)
                if ra != rb { return ra < rb }
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

    private func daySortRank(_ f: SpFixture) -> Int {
        if f.status.live { return 0 }
        if f.status.finished { return 2 }
        return 1
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
        if cal.isDateInToday(d) { return "\(L("اليوم")) · \(weekday) \(dm)" }
        if cal.isDateInTomorrow(d) { return "\(L("غدًا")) · \(weekday) \(dm)" }
        if cal.isDateInYesterday(d) { return "\(L("أمس")) · \(weekday) \(dm)" }
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
        case "ongoing": return L("جارية الآن")
        case "upcoming": return L("تنطلق قريبًا")
        case "finished": return L("انتهت")
        default: return nil
        }
    }

    private var compsManagerSheet: some View {
        NavigationStack {
            List {
                Section {
                    Text(L("ما تفعّله هنا يظهر جدوله في «الكل» وفي بلوك «بطولاتي» بتبويب البطولات — مصدر واحد للمفضّلة."))
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
            .navigationTitle(L("بطولات الجدول"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button(L("تم")) { showCompsManager = false }
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
                .environment(\.locale, SpLanguage.shared.lang.locale)
                .padding()
                Spacer(minLength: 0)
            }
            .navigationTitle(L("اذهب إلى تاريخ"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button(L("اذهب")) {
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
                    Button(L("إلغاء")) { showDatePicker = false }
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
            // إن بقي اختيار فلتر على بطولة حُذفت من المفضّلة/السجل، ارجع لـ«الكل».
            if selection != "all", !selection.hasPrefix("lens:"), !favorites.isFavorite(selection) {
                selection = "all"
                SpCenterFilter.save("all")
            }
        }
    }

    /// بذر «البطولات المهمة» في المفضّلة عند أول تشغيل للمركز (مرة واحدة):
    /// السلة الافتراضية + المونديال/الخليجي ما داما غير منتهيين. ما أضافه
    /// المستخدم سابقًا في «بطولاتي» يبقى كما هو — نضيف فوقه ولا نحذف.
    private func seedFavoritesIfNeeded(_ registry: [SpCompetition]) {
        guard !UserDefaults.standard.bool(forKey: SpCenterFilter.seededKey) else {
            // أجهزة سبق بذرها: ألحق فقط السوبر الأوروبي إن غاب (هجرة خفيفة).
            if let superCup = registry.first(where: { $0.slug == "uefa-super-cup" }),
               superCup.status != "finished",
               !favorites.isFavorite("uefa-super-cup") {
                favorites.add(superCup)
            }
            return
        }
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
        let span: TimeInterval = isMixed ? 60 : 120
        let to = SpFormat.dateKey(Date().addingTimeInterval(span * day))
        return (from, to)
    }

    private var effectiveCompetitionSlugs: [String] {
        let available = favorites.items
        if selection == "all" { return available.map(\.slug) }
        if selection == "lens:important" {
            let important = Set(SpCenterFilter.defaultSlugs)
            return available.filter { important.contains($0.slug) }.map(\.slug)
        }
        if selection.hasPrefix("lens:category:") {
            let category = String(selection.dropFirst("lens:category:".count))
            return available.filter { $0.category == category }.map(\.slug)
        }
        return [selection]
    }

    private func load(force: Bool = false) async {
        if !force, fixtures.isEmpty { loading = true }
        // اختيار يتيم (بطولة أُزيلت من المفضّلة وشريحتها اختفت) → عودة لـ«الكل».
        if selection != "all", !selection.hasPrefix("lens:"), !favorites.items.isEmpty, !favorites.isFavorite(selection) {
            selection = "all"
            SpCenterFilter.save("all")
            return // task(id: reloadKey) سيعيد التحميل بالاختيار الجديد
        }
        let comps = effectiveCompetitionSlugs
        let window = requestWindow()
        do {
            async let mergedTask = APIClient.shared.fetchUnifiedFixturesChunked(
                comps: comps, from: window.from, to: window.to, ignoreCache: force)
            async let bracketTask: SpWcBracket? = comps.contains("world-cup")
                ? (try? await APIClient.shared.fetchWorldCupBracket(ignoreCache: force))
                : nil

            let unified = try await mergedTask
            let bracket = await bracketTask
            let merged = mergeWorldCupBracketFixtures(from: bracket, into: unified)
            if Task.isCancelled { return }
            follows.updateFromFixtures(merged)
            if visualSignature(merged) != visualSignature(fixtures) {
                fixtures = merged
                rebuildDays(keepSelection: true)
            } else if visibleDays.isEmpty {
                rebuildDays(keepSelection: true)
            }
            wcBracket = bracket
            loadError = nil
        } catch {
            if fixtures.isEmpty { loadError = (error as? LocalizedError)?.errorDescription ?? L("تعذّر الاتصال بخادم البيانات") }
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
            "\(f.id):\(f.timestamp):\(f.status.code):\(f.status.elapsed ?? -1):\(f.status.extra ?? -1):\(f.status.live):\(f.status.finished):\(f.goals.home ?? -1)-\(f.goals.away ?? -1):p\(f.penaltyScore?.home ?? -1)-\(f.penaltyScore?.away ?? -1):\(f.home.id)-\(f.away.id):\(f.competitionSlug ?? "")"
        }
        .joined(separator: "|")
    }

    // السياسة الموحّدة: حيّ = 10ث، قرب الانطلاق = 30ث، وإلا 45ث. النافذة كانت
    // ±120ث فقط (بقية الشاشات 30 دقيقة) فتتأخّر ملاحظة صافرة البداية حتى 45ث؛
    // وتمتدّ الآن 3 ساعات بعد الموعد لالتقاط انطلاقة تأخّر المزوّد في إعلانها.
    private func pollLive() async {
        while !Task.isCancelled {
            let now = Date().timeIntervalSince1970
            let hasLive = fixtures.contains { $0.status.live }
            let nearKickoff = fixtures.contains {
                !$0.status.finished && !$0.status.live
                    && Double($0.timestamp) - now <= 1800 && now - Double($0.timestamp) <= 3 * 3600
            }
            let delay: UInt64 = hasLive ? 10_000_000_000 : nearKickoff ? 30_000_000_000 : 45_000_000_000
            try? await Task.sleep(nanoseconds: delay)
            if Task.isCancelled { break }
            // التبويب مخفي: لا شبكة — نبضة الموجز/عودة الظهور تتكفّلان بالتحديث.
            guard router.selectedTab == .matches else {
                pendingLiveReload = true
                continue
            }
            // في الوضع الخامل نسمح بـ HTTP/URL cache (s-maxage≈30–60ث) بدل تجاهله دائمًا.
            await load(force: hasLive || nearKickoff)
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
        HStack(spacing: 6) {
            Color.clear.frame(width: 24, height: 24) // فراغ محجوز لنجمة المتابعة
            SpScoreRow(
                fixture: fixture,
                caption: (showCompetition ? fixture.competition : nil)
            )
        }
        .padding(.vertical, 10)
        .padding(.horizontal, 8)
        .background(rowBackground)
        .contentShape(Rectangle())
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
        .accessibilityLabel(following ? L("إلغاء متابعة المباراة") : L("متابعة المباراة"))
    }
}
