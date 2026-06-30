import SwiftUI

// MARK: - تبويب «المباريات» — جدول كأس العالم بالتواريخ + تنقّل هجين
//
// طلب المالك (نمط تطبيق دوري + إبداع في التواريخ): مباريات مرتّبة بالتاريخ
// مجمّعة بالدور، مع:
//  • شريط مراحل (المجموعات/الـ32/الـ16/ربع/نصف/نهائي) ينقلك لأول يوم في المرحلة.
//  • شريط تواريخ **متزامن** مع التمرير (نقر شريحة→ينزل للقسم؛ تمرير→تبرز الشريحة).
//  • زرّ «مباريات اليوم» عائم يظهر عند الابتعاد عن اليوم فيرجّعك فورًا.
//  • شريط «مباشر الآن» مثبّت + تحديث لحظي للنتائج (poll يتسارع عند وجود مباشر).
// التزامن ثنائي الاتجاه عبر `.scrollPosition(id:)` (iOS 17): تعيين القيمة يُمرّر
// القائمة، وقراءتها تكشف يوم القمّة الحالي — فالشريط والقائمة وزرّ اليوم تتبع
// متغيّرًا واحدًا. البيانات من /api/world-cup/fixtures العام. الهوية أبيض/أخضر مسطّحة.

// MARK: نموذج مباريات المونديال (يطابق WcFixture في الخادم)

nonisolated struct SpWcFixturesResponse: Decodable { let fixtures: [SpWcFixture] }

nonisolated struct SpWcFixture: Decodable, Identifiable {
    let id: Int
    let date: String
    let timestamp: Double
    let status: SpWcStatus
    let round: String
    let roundEn: String
    let venue: SpWcVenue?
    let home: SpWcTeam
    let away: SpWcTeam
    let goals: SpWcScore
    let penalties: SpWcScore?
    let matchNo: Int?
    let homeCode: String?
    let awayCode: String?
}

nonisolated struct SpWcVenue: Decodable { let name: String; let city: String }

nonisolated struct SpWcStatus: Decodable {
    let code: String
    let label: String
    let elapsed: Int?
    let extra: Int?
    let live: Bool
    let finished: Bool
}

nonisolated struct SpWcTeam: Decodable {
    let id: Int
    let name: String
    let logo: String
    let winner: Bool?
}

nonisolated struct SpWcScore: Decodable { let home: Int?; let away: Int? }

extension SpFixture {
    nonisolated init(worldCup f: SpWcFixture) {
        self.init(
            id: f.id,
            date: f.date,
            timestamp: Int(f.timestamp),
            status: SpStatus(
                code: f.status.code,
                label: f.status.label,
                elapsed: f.status.elapsed,
                extra: f.status.extra,
                live: f.status.live,
                finished: f.status.finished
            ),
            round: f.round,
            venue: SpVenue(name: f.venue?.name ?? "", city: f.venue?.city ?? ""),
            home: SpTeam(id: f.home.id, name: f.home.name, logo: f.home.logo, winner: f.home.winner),
            away: SpTeam(id: f.away.id, name: f.away.name, logo: f.away.logo, winner: f.away.winner),
            goals: SpScore(home: f.goals.home, away: f.goals.away),
            competition: "كأس العالم",
            competitionSlug: "world-cup"
        )
    }
}

nonisolated struct SpWcStandingsResponse: Decodable { let groups: [SpWcGroup] }
nonisolated struct SpWcGroup: Decodable, Identifiable {
    let group: String
    let groupEn: String
    let rows: [SpWcStandingRow]
    var id: String { groupEn }
}

nonisolated struct SpWcStandingRow: Decodable, Identifiable {
    let rank: Int
    let team: SpWcTeam
    let played: Int
    let win: Int
    let draw: Int
    let lose: Int
    let goalsFor: Int
    let goalsAgainst: Int
    let goalsDiff: Int
    let points: Int
    let form: String?
    let live: Bool?
    var id: Int { team.id }
}

nonisolated struct SpWcBracket: Decodable {
    let source: String?
    let rounds: [SpWcBracketRound]
    let tree: SpWcBracketTree?
}

nonisolated struct SpWcBracketTree: Decodable {
    let columns: [SpWcBracketColumn]
    let thirdPlace: SpWcFixture?
    let hasAny: Bool?
}

nonisolated struct SpWcBracketColumn: Decodable, Identifiable {
    let key: String
    let label: String
    let roundIndex: Int
    let slots: [SpWcBracketSlot]
    var id: String { key }
}

nonisolated struct SpWcBracketSlot: Decodable, Identifiable {
    let matchNo: Int
    let fixture: SpWcFixture?
    let sources: [Int]?
    let topTeam: SpWcTeam?
    let bottomTeam: SpWcTeam?
    let topLabel: String?
    let bottomLabel: String?
    var id: Int { matchNo }

    func resolvedHome(from fx: SpWcFixture?) -> (team: SpWcTeam?, label: String) {
        let side = fx?.home
        if let t = side, t.id > 0, !t.logo.isEmpty { return (t, t.name) }
        if let t = topTeam, t.id > 0, !t.logo.isEmpty { return (t, t.name) }
        if let code = fx?.homeCode { return (nil, code) }
        return (nil, topLabel ?? "TBD")
    }

    func resolvedAway(from fx: SpWcFixture?) -> (team: SpWcTeam?, label: String) {
        let side = fx?.away
        if let t = side, t.id > 0, !t.logo.isEmpty { return (t, t.name) }
        if let t = bottomTeam, t.id > 0, !t.logo.isEmpty { return (t, t.name) }
        if let code = fx?.awayCode { return (nil, code) }
        return (nil, bottomLabel ?? "TBD")
    }
}

nonisolated struct SpWcBracketRound: Decodable, Identifiable {
    let round: String
    let roundEn: String
    let matches: [SpWcFixture]
    var id: String { roundEn }
}

nonisolated struct SpWcScorersResponse: Decodable { let scorers: [SpWcScorer] }
nonisolated struct SpWcLeadersResponse: Decodable { let leaders: [SpWcLeader] }

nonisolated struct SpWcScorer: Decodable, Identifiable {
    let rank: Int
    let id: Int
    let name: String
    let photo: String
    let team: SpWcTeam
    let goals: Int
    let assists: Int
    let penalties: Int
    let minutes: Int
    let matches: Int
}

nonisolated struct SpWcLeader: Decodable, Identifiable {
    let rank: Int
    let id: Int
    let name: String
    let photo: String
    let team: SpWcTeam
    let goals: Int
    let assists: Int
    let yellow: Int
    let red: Int
    let minutes: Int
    let matches: Int
}

// تفاصيل مباراة المونديال (/world-cup/match/:id) — الأسماء عربية ومُوحّدة بالمعرّف.
nonisolated struct SpWcMatchDetail: Decodable {
    let fixture: SpWcFixture
    let events: [SpWcEvent]
    let lineups: [SpWcLineup]
    let statistics: [SpWcStat]
    let ratings: [SpWcRating]
    let manOfTheMatch: SpWcRating?
    let prediction: SpWcPrediction?
    let headToHead: [SpWcFixture]?
}

nonisolated struct SpWcPrediction: Decodable { let home: Int?; let draw: Int?; let away: Int? }

nonisolated struct SpWcEvent: Decodable, Identifiable {
    let minute: Int
    let extraMinute: Int?
    let teamId: Int
    let type: String      // goal / yellow-card / red-card / substitution / var / missed-penalty
    let label: String
    let detail: String
    let player: String
    let assist: String?
    var id: String { "\(minute)-\(extraMinute ?? 0)-\(teamId)-\(type)-\(player)" }
}

nonisolated struct SpWcLineupPlayer: Decodable, Identifiable {
    let id: Int
    let name: String
    let number: Int?
    let position: String?
    let grid: String?
}

nonisolated struct SpWcLineup: Decodable, Identifiable {
    let teamId: Int
    let teamName: String
    let formation: String?
    let coach: String
    let startXI: [SpWcLineupPlayer]
    let substitutes: [SpWcLineupPlayer]
    var id: Int { teamId }
}

nonisolated struct SpWcStat: Decodable, Identifiable {
    let key: String
    let label: String
    let home: String
    let away: String
    var id: String { key }
}

nonisolated struct SpWcRating: Decodable, Identifiable {
    let id: Int
    let name: String
    let photo: String
    let teamId: Int
    let number: Int?
    let position: String?
    let rating: Double
    let goals: Int?
    let assists: Int?
    let captain: Bool?
}

extension APIClient {
    /// كل مباريات كأس العالم (الجدول الكامل) — نقطة عامة على البوابة.
    func fetchWorldCupFixtures(ignoreCache: Bool = false) async throws -> SpWcFixturesResponse {
        try await get(SpWcFixturesResponse.self, path: "/world-cup/fixtures",
                      ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI)
    }

    func fetchWorldCupStandings(ignoreCache: Bool = false) async throws -> SpWcStandingsResponse {
        try await get(SpWcStandingsResponse.self, path: "/world-cup/standings",
                      ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI)
    }

    func fetchWorldCupBracket(ignoreCache: Bool = false) async throws -> SpWcBracket {
        try await get(SpWcBracket.self, path: "/world-cup/bracket",
                      ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI)
    }

    func fetchWorldCupScorers(ignoreCache: Bool = false) async throws -> SpWcScorersResponse {
        try await get(SpWcScorersResponse.self, path: "/world-cup/scorers",
                      ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI)
    }

    func fetchWorldCupAssists(ignoreCache: Bool = false) async throws -> SpWcLeadersResponse {
        try await get(SpWcLeadersResponse.self, path: "/world-cup/assists",
                      ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI)
    }

    func fetchWorldCupCards(ignoreCache: Bool = false) async throws -> SpWcLeadersResponse {
        try await get(SpWcLeadersResponse.self, path: "/world-cup/cards",
                      ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI)
    }

    /// تفاصيل مباراة مونديال واحدة (أحداث/إحصائيات/تشكيلات/تقييمات).
    func fetchWorldCupMatch(id: Int, ignoreCache: Bool = false) async throws -> SpWcMatchDetail {
        try await get(SpWcMatchDetail.self, path: "/world-cup/match/\(id)",
                      ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI)
    }

    /// إثراء مركز مباراة كأس العالم — نفس بنية مركز روشن، لكن من مسارات المونديال.
    func fetchWorldCupXg(id: Int, ignoreCache: Bool = false) async throws -> SpXg {
        try await get(SpXg.self, path: "/world-cup/xg/\(id)",
                      ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI)
    }
    func fetchWorldCupMomentum(id: Int, ignoreCache: Bool = false) async throws -> SpMomentum {
        try await get(SpMomentum.self, path: "/world-cup/momentum/\(id)",
                      ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI)
    }
    func fetchWorldCupPressure(id: Int, ignoreCache: Bool = false) async throws -> SpPressure {
        try await get(SpPressure.self, path: "/world-cup/pressure/\(id)",
                      ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI)
    }
    func fetchWorldCupMatchFacts(id: Int, ignoreCache: Bool = false) async throws -> SpMatchFacts {
        try await get(SpMatchFacts.self, path: "/world-cup/match-facts/\(id)",
                      ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI)
    }
    func fetchWorldCupCommentary(id: Int, ignoreCache: Bool = false) async throws -> SpCommentary {
        try await get(SpCommentary.self, path: "/world-cup/commentary/\(id)",
                      ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI)
    }
}

// MARK: أدوار البطولة — للترتيب وشريط المراحل

enum SpWcStage: Int, CaseIterable, Identifiable {
    case group = 0, r32, r16, qf, sf, third, final
    var id: Int { rawValue }

    /// يشتق الدور من نصّ المزود الإنجليزي (الترتيب مهمّ: «3rd Place Final» قبل «Final»).
    static func from(roundEn: String) -> SpWcStage {
        let s = roundEn.lowercased()
        if s.contains("group") { return .group }
        if s.contains("32") { return .r32 }
        if s.contains("16") { return .r16 }
        if s.contains("quarter") { return .qf }
        if s.contains("semi") { return .sf }
        if s.contains("3rd") || s.contains("third") { return .third }
        if s.contains("final") { return .final }
        return .group
    }

    var label: String {
        switch self {
        case .group: return "دور المجموعات"
        case .r32:   return "دور الـ32"
        case .r16:   return "دور الـ16"
        case .qf:    return "ربع النهائي"
        case .sf:    return "نصف النهائي"
        case .third: return "المركز الثالث"
        case .final: return "النهائي"
        }
    }

    var short: String {
        switch self {
        case .group: return "المجموعات"
        case .r32:   return "الـ32"
        case .r16:   return "الـ16"
        case .qf:    return "ربع"
        case .sf:    return "نصف"
        case .third: return "الثالث"
        case .final: return "النهائي"
        }
    }

    /// مفتاح عمود الشجرة في `/world-cup/bracket` → `tree.columns[].key`
    var bracketColumnKey: String? {
        switch self {
        case .r32: return "round of 32"
        case .r16: return "round of 16"
        case .qf: return "quarter-finals"
        case .sf: return "semi-finals"
        case .final: return "final"
        case .group, .third: return nil
        }
    }
}

// يوم واحد من الجدول (مفتاحه YYYY-MM-DD بتوقيت الرياض)
private struct SpWcDay: Identifiable {
    let id: String
    let date: Date
    let stage: SpWcStage
    let fixtures: [SpWcFixture]
}

private struct SpDayTopPreferenceKey: PreferenceKey {
    static var defaultValue: [String: CGFloat] = [:]

    static func reduce(value: inout [String: CGFloat], nextValue: () -> [String: CGFloat]) {
        value.merge(nextValue(), uniquingKeysWith: { $1 })
    }
}

private struct SpDayScrollRequest: Equatable {
    let id: String
    let nonce: Int
    var animated: Bool = true
}

// طيّ الترويسة العلوية (التولبار + شريط الأدوار) حسب اتجاه التمرير — نفس منطق
// `autoHideTabBar`: التمرير لأسفل يخفي، لأعلى/قرب القمة يُظهر. `armed` تتجاهل قفزة
// التمرير البرمجية الأولى (الانتقال لليوم) كي لا تُطوى الترويسة فور الإقلاع. iOS 18+.
private struct SpAutoCollapseHeader: ViewModifier {
    @Binding var hidden: Bool
    @Binding var armed: Bool
    @State private var lastY: CGFloat = 0

    func body(content: Content) -> some View {
        if #available(iOS 18.0, *) {
            content.onScrollGeometryChange(for: CGFloat.self) { $0.contentOffset.y } action: { _, newY in
                defer { lastY = newY }
                guard armed else { return }
                let delta = newY - lastY
                if newY < 24 { set(false) }
                else if delta > 8 { set(true) }
                else if delta < -8 { set(false) }
            }
        } else {
            content
        }
    }

    private func set(_ h: Bool) {
        guard hidden != h else { return }
        withAnimation(.easeInOut(duration: 0.25)) { hidden = h }
    }
}

extension VaraTeamStrength {
    /// قوّة منتخب من صفّ ترتيب المجموعة (كأس العالم).
    nonisolated init(wcRow r: SpWcStandingRow) {
        self.init(played: r.played, points: r.points,
                  goalsFor: r.goalsFor, goalsAgainst: r.goalsAgainst,
                  form: r.form, rank: r.rank)
    }
}

// MARK: - الشاشة

struct MatchesView: View {
    @State private var fixtures: [SpWcFixture] = []
    @State private var visibleDays: [SpWcDay] = []
    @State private var loading = true
    @State private var loadError: String?
    @State private var liveOnly = false
    // اليوم المختار في شريط التواريخ. لا نربطه بموضع التمرير لحظيًا؛ ربطه السابق
    // عبر scrollPosition كان يحدّث الشجرة مع كل إطار تمرير ويسبّب stuttering واضحًا.
    @State private var scrolledDayId: String?
    @State private var scrollTargetRequest: SpDayScrollRequest?
    @State private var scrollRequestNonce = 0
    // الشريحة المتوسّطة في شريط التواريخ — تتبع scrolledDayId تلقائيًّا.
    @State private var railCenterId: String?
    @State private var didInitialScroll = false
    @State private var showDatePicker = false
    @State private var pickedDate = Date()
    @State private var suppressActiveDayUpdatesUntil = Date.distantPast
    @State private var listStartsAtToday = true
    // طيّ الترويسة (العنوان + شريط الأدوار) باتجاه التمرير. `headerArmed` تتجاهل قفزة
    // التمرير البرمجية كي لا تُطوى الترويسة فور الإقلاع أو عند القفز ليوم/مرحلة.
    @State private var headerHidden = false
    @State private var headerArmed = false

    private static let riyadhCal: Calendar = {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "Asia/Riyadh") ?? .current
        return c
    }()

    // شريط الأيام صار مثبّتًا خارج منطقة التمرير (أعلى القائمة دائمًا)، لذا قمّة
    // منطقة التمرير تقع مباشرة تحته — نُحاذي عنوان اليوم المختار إلى أعلى القائمة.
    private static let dayScrollAnchor = UnitPoint(x: 0.5, y: 0.0)
    private static let topScrollId = "matches-screen-top"

    var body: some View {
        NavigationStack {
            bodyContent
                .background(SpAmbientBackground())
                .navigationTitle("")
                .toolbar(.hidden, for: .navigationBar)
        }
        .task { await load() }
        .task { await pollLive() }
        .onChange(of: liveOnly) { _, _ in rebuildDays(keepSelection: true) }
        .refreshable { await load(force: true) }
        .sheet(isPresented: $showDatePicker) { datePickerSheet }
    }

    // MARK: الترويسة + أدوات التحكّم

    private var header: some View {
        VStack(spacing: 18) {
            toolbar
            if !visibleDays.isEmpty { stageStrip }
        }
        .padding(.horizontal, 16)
        .padding(.top, 8)
        .padding(.bottom, visibleDays.isEmpty ? 8 : 10)
    }

    // توولبار خفيف على طراز «دوري»: العلامة يمينًا (RTL) والأدوات يسارًا — بلا
    // صندوق أيقونة كبير ولا سطر فرعي (كانا أصل ثقل الترويسة السابقة وزحمتها).
    private var toolbar: some View {
        HStack(spacing: 10) {
            HStack(spacing: 8) {
                Image(systemName: "soccerball")
                    .font(.system(size: 17, weight: .bold))
                    .foregroundStyle(SpTheme.green)
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

    // مبدّل «مباشر» كبسولة (نقطة + كلمة) على طراز دوري — أوضح من أيقونة مبهمة.
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

    // MARK: المحتوى

    @ViewBuilder private var bodyContent: some View {
        if loading && fixtures.isEmpty {
            SpLoading().frame(maxWidth: .infinity, maxHeight: .infinity)
        } else if let loadError, fixtures.isEmpty {
            SpEmptyState(icon: "wifi.exclamationmark", title: "تعذّر التحميل", subtitle: loadError)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else {
            ZStack(alignment: .bottom) {
                VStack(spacing: 0) {
                    pinnedTopBar
                    matchesList
                }
                floatingToday
            }
            .overlay(alignment: .top) { topSafeAreaCover }
        }
    }

    // الترويسة المثبّتة أعلى الشاشة: العنوان + شريط الأدوار يطويان مع التمرير،
    // بينما شريط الأيام يبقى ظاهرًا دائمًا (يثبت عند طيّ الترويسة).
    private var pinnedTopBar: some View {
        VStack(spacing: 0) {
            if !headerHidden {
                header
                    .transition(.move(edge: .top).combined(with: .opacity))
            }
            if !visibleDays.isEmpty {
                dateRail
            }
        }
        .background(SpTheme.screenGradient)
        .zIndex(5)
    }

    private var topSafeAreaInset: CGFloat {
        UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .first?.keyWindow?.safeAreaInsets.top ?? 0
    }

    private var topSafeAreaCover: some View {
        SpTheme.screenGradient
            .frame(height: topSafeAreaInset)
            .frame(maxWidth: .infinity)
            .ignoresSafeArea(.container, edges: .top)
            .allowsHitTesting(false)
    }

    // شريط أدوار البطولة — يفعّل الدور إن وُجدت مباريات **أو** خانات في شجرة
    // `/world-cup/bracket` (حتى قبل أن يجدول المزوّد مواعيد الدور التالي).
    private var stageStrip: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 7) {
                ForEach(SpWcStage.allCases) { st in
                    let hasData = stageHasData(st)
                    let active = hasData && activeStage == st
                    Button {
                        guard hasData else { return }
                        if let day = firstDay(for: st) {
                            goToDay(day.id)
                        }
                    } label: {
                        Text(st.short)
                            .font(SportsFonts.app(size: 12.5, weight: active ? .bold : .semibold))
                            .foregroundStyle(active ? SpTheme.green : (hasData ? SpTheme.onDarkDim : SpTheme.onDarkFaint))
                            .padding(.horizontal, 12).padding(.vertical, 6)
                            .background(Capsule().fill(active ? SpTheme.green.opacity(0.10) : Color.clear))
                            .overlay(Capsule().stroke(active ? SpTheme.green.opacity(0.55) : SpTheme.outline, lineWidth: 1))
                    }
                    .buttonStyle(.plain)
                    .disabled(!hasData)
                }
            }
            .padding(.horizontal, 1)
        }
    }

    // شريط التواريخ المتزامن — نقر شريحة ينزل للقسم؛ والتمرير اليدوي يحدّث اليوم
    // النشط فقط عند عبور قسم جديد، لا مع كل إطار تمرير. خلفيته شفّافة ليتدفّق مع
    // الترويسة (توولبار + أدوار + تواريخ = منطقة واحدة)، ويفصله عن القائمة فاصل واحد.
    private var dateRail: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(visibleDays) { day in dateChip(day) }
            }
            .padding(.horizontal, 16).padding(.top, 4).padding(.bottom, 8)
            .scrollTargetLayout()
        }
        .scrollPosition(id: $railCenterId, anchor: .center)
        .overlay(alignment: .bottom) { Divider().overlay(SpTheme.outline) }
    }

    // شريحة يوم على طراز دوري: حبّة بيضاء بحدّ رمادي فاتح, المحدّد = حدّ أخضر فاتح
    // + نصّ أخضر (لا تعبئة خضراء ثقيلة). يوم اليوم/غدًا/أمس باسم خاص، ونقطة حمراء
    // للأيام التي فيها مباراة مباشرة الآن.
    private func dateChip(_ day: SpWcDay) -> some View {
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
                        .foregroundStyle(active ? SpTheme.green : SpTheme.onDarkDim)
                        .lineLimit(1)
                }
                Text(SpFormat.dayMonthLabel(day.date))
                    .font(SportsFonts.app(size: 12, weight: .heavy))
                    .foregroundStyle(active ? SpTheme.green : SpTheme.onDark)
                    .lineLimit(1)
                    .minimumScaleFactor(0.85)
            }
            .frame(width: 78, height: 50)
            .background(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill(active ? SpTheme.green.opacity(0.07) : SpTheme.railChipFill)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .stroke(active ? SpTheme.green : SpTheme.outline, lineWidth: active ? 1.5 : 1)
            )
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    // القائمة العمودية — تقع تحت الترويسة المثبّتة (العنوان+الأدوار+الأيام). الترويسة
    // تطوى/تظهر باتجاه التمرير عبر `SpAutoCollapseHeader`، وشريط الأيام يبقى ظاهرًا.
    // التنقل للأيام برمجي عبر ScrollViewReader.
    private var matchesList: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 16) {
                    // مرساة قمّة القائمة (لقفزة الافتتاح/زرّ اليوم نحو الأعلى).
                    Color.clear.frame(height: 0.5).id(Self.topScrollId)

                    if visibleDays.isEmpty {
                        emptyList
                    } else {
                        if !liveOnly && !liveFixtures.isEmpty { livePinned }
                        ForEach(daysForList) { day in
                            daySection(day)
                                .background(
                                    GeometryReader { geo in
                                        Color.clear.preference(
                                            key: SpDayTopPreferenceKey.self,
                                            value: [day.id: geo.frame(in: .named("matches-scroll")).minY]
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
            .coordinateSpace(name: "matches-scroll")
            .modifier(SpAutoCollapseHeader(hidden: $headerHidden, armed: $headerArmed))
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
            .onPreferenceChange(SpDayTopPreferenceKey.self) { tops in
                updateActiveDay(from: tops)
            }
        }
    }

    // تحديد اليوم النشِط أوّل مرّة ثم القفز له بلا حركة: القائمة تحتفظ بكل أيام
    // البطولة حتى تبقى «المجموعات» وبقية الأدوار فعّالة، لكن الافتتاح يكون على اليوم.
    private func runInitialScroll() {
        guard !didInitialScroll, !visibleDays.isEmpty else { return }
        didInitialScroll = true
        let target = todayDayId
        guard !target.isEmpty else { return }
        listStartsAtToday = true
        scrolledDayId = target
        railCenterId = target
        headerHidden = false
        headerArmed = false
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: 80_000_000)
            requestScroll(to: Self.topScrollId, animated: false)
            // نُفعّل الطيّ بعد استقرار قفزة الافتتاح كي لا تُطوى الترويسة فورًا.
            try? await Task.sleep(nanoseconds: 350_000_000)
            headerArmed = true
        }
    }

    private func goToDay(_ id: String) {
        guard !id.isEmpty else { return }
        scrolledDayId = id
        railCenterId = id
        // القفز ليوم/مرحلة يُظهر الترويسة، ونُعطّل الطيّ مؤقّتًا حتى لا تطويها قفزة
        // التمرير البرمجية نفسها — يعاد تفعيله بعد استقرار الحركة.
        if headerHidden { withAnimation(.easeInOut(duration: 0.25)) { headerHidden = false } }
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
        scrollTargetRequest = SpDayScrollRequest(id: id, nonce: scrollRequestNonce, animated: animated)
    }

    private func updateActiveDay(from sectionTops: [String: CGFloat]) {
        guard Date() >= suppressActiveDayUpdatesUntil else { return }
        guard !sectionTops.isEmpty else { return }
        // شريط الأيام صار خارج منطقة التمرير، فقمّة القائمة (minY≈0) هي تحته مباشرة.
        // عتبة صغيرة كي يكون اليوم النشِط هو الظاهر في أعلى القائمة.
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
            title: liveOnly ? "لا مباريات مباشرة الآن" : "لا مباريات",
            subtitle: liveOnly ? "أوقف فلتر «مباشر» لعرض الجدول كاملًا" : "حاول لاحقًا"
        )
        .padding(.top, 40)
    }

    // شريط «مباشر الآن» المثبّت أعلى القائمة (يتحدّث لحظيًّا).
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

    private func daySection(_ day: SpWcDay) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            dayHeader(day)
                .id(day.id)
            matchGroup(fixturesForDisplay(in: day))
        }
    }

    private func fixturesForDisplay(in day: SpWcDay) -> [SpWcFixture] {
        return day.fixtures.sorted { a, b in
            if a.timestamp != b.timestamp { return a.timestamp < b.timestamp }
            return a.id < b.id
        }
    }

    // مجموعة مباريات بلا إطارات: صفوف مدمجة مفصولة بخطّ رفيع ممتدّ
    // (نمط قائمة منظّمة على طراز «دوري» — الأعلام تصطفّ في عمودين نظيفين).
    private func matchGroup(_ fixtures: [SpWcFixture]) -> some View {
        VStack(spacing: 0) {
            ForEach(Array(fixtures.enumerated()), id: \.element.id) { idx, f in
                SpWcMatchRow(fixture: f)
                if idx < fixtures.count - 1 {
                    Divider()
                        .overlay(SpTheme.outline.opacity(0.75))
                        .padding(.horizontal, 10)
                }
            }
        }
    }

    // رأس اليوم — نصّ نظيف بلا خلفية ولا إطار (يتسق مع الوضعين): التاريخ بالمنتصف
    // (اليوم/غدًا/أمس + اسم اليوم) وتحته اسم الدور بالأخضر. فاصل رفيع خافت أسفله
    // يحدّ القسم دون صندوق مزعج.
    private func dayHeader(_ day: SpWcDay) -> some View {
        VStack(spacing: 6) {
            VStack(spacing: 2) {
                Text(dateLabel(day.date))
                    .font(SportsFonts.headline(size: 15))
                    .foregroundStyle(SpTheme.onDark)
                Text(day.stage.label)
                    .font(SportsFonts.app(size: 11, weight: .bold))
                    .foregroundStyle(SpTheme.green)
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

    // هل ابتعدنا عن يوم اليوم؟ (يتغيّر مرّة عند تجاوز اليوم — رخيص للأنميشن)
    private var isAwayFromToday: Bool {
        !visibleDays.isEmpty && !todayDayId.isEmpty && (scrolledDayId ?? "") != todayDayId
    }

    // زرّ «مباريات اليوم» العائم — يظهر عند الابتعاد عن يوم اليوم.
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
                .background(Capsule().fill(SpTheme.green))
                .overlay(Capsule().stroke(.white.opacity(0.15), lineWidth: 1))
                .shadow(color: SpTheme.green.opacity(0.35), radius: 10, x: 0, y: 4)
            }
            .buttonStyle(.plain)
            // الزرّ يحترم المنطقة الآمنة السفلية (أعلى شريط التبويب)، فهامش صغير
            // يضعه مباشرة فوق القائمة السفلية بدل وسط الشاشة.
            .padding(.bottom, 12)
            .zIndex(10)
        }
    }

    // MARK: المشتقّات

    private var liveFixtures: [SpWcFixture] { fixtures.filter { $0.status.live } }

    private func makeDays(from fixtures: [SpWcFixture], liveOnly: Bool) -> [SpWcDay] {
        let cal = Self.riyadhCal
        let source = liveOnly ? fixtures.filter { $0.status.live } : fixtures
        let dated = source.compactMap { f -> (Date, SpWcFixture)? in
            guard let d = SpDateMath.date(from: f.date) else { return nil }
            return (cal.startOfDay(for: d), f)
        }
        let grouped = Dictionary(grouping: dated, by: { SpFormat.dateKey($0.0) })
        let days = grouped.compactMap { key, pairs -> SpWcDay? in
            guard let date = pairs.first?.0 else { return nil }
            let fxs = pairs.map { $0.1 }.sorted { $0.timestamp < $1.timestamp }
            let stage = SpWcStage.from(roundEn: fxs.first?.roundEn ?? "")
            return SpWcDay(id: key, date: date, stage: stage, fixtures: fxs)
        }
        .sorted { $0.date < $1.date }
        return days
    }

    private var visibleDaySignature: String {
        visibleDays.map(\.id).joined(separator: "|")
    }

    private var daysForList: [SpWcDay] {
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

    private var activeStage: SpWcStage? { visibleDays.first(where: { $0.id == (scrolledDayId ?? "") })?.stage }

    private var todayHasMatches: Bool { visibleDays.contains { Self.riyadhCal.isDateInToday($0.date) } }

    // يوم اليوم إن وُجد، وإلا أقرب يوم قادم بمباريات، وإلا آخر يوم.
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
                .tint(SpTheme.green)
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

    private func load(force: Bool = false) async {
        if !force { loading = true }
        do {
            let resp = try await APIClient.shared.fetchWorldCupFixtures(ignoreCache: true)
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

    private func stageHasData(_ st: SpWcStage) -> Bool {
        visibleDays.contains(where: { $0.stage == st })
    }

    /// أول يوم في المرحلة — يُفضَّل اليوم/القادم (مباراة الليلة) لا أقدم يوم تاريخيًا.
    private func firstDay(for stage: SpWcStage) -> SpWcDay? {
        let cal = Self.riyadhCal
        let start = cal.startOfDay(for: Date())
        let days = visibleDays.filter { $0.stage == stage }
        return days.first(where: { day in
            day.date >= start || day.fixtures.contains { $0.status.live || !$0.status.finished }
        }) ?? days.first
    }

    private func visualSignature(_ rows: [SpWcFixture]) -> String {
        rows.map { f in
            "\(f.id):\(Int(f.timestamp)):\(f.status.code):\(f.status.elapsed ?? -1):\(f.status.extra ?? -1):\(f.status.live):\(f.status.finished):\(f.goals.home ?? -1)-\(f.goals.away ?? -1):\(f.home.id)-\(f.away.id):\(f.homeCode ?? "")-\(f.awayCode ?? ""):\(f.home.winner?.description ?? "n"):\(f.away.winner?.description ?? "n")"
        }
        .joined(separator: "|")
    }

    // تحديث صامت أثناء العرض — يتسارع (15ث) عند وجود مباراة جارية، ويتباطأ (45ث) عداها.
    private func pollLive() async {
        while !Task.isCancelled {
            let hasLive = fixtures.contains { $0.status.live }
            let delay: UInt64 = hasLive ? 15_000_000_000 : 45_000_000_000
            try? await Task.sleep(nanoseconds: delay)
            if Task.isCancelled { break }
            await load(force: true)
        }
    }
}

// MARK: - صفّ مباراة المونديال (يطابق طراز SpMatchCard: أبيض/أخضر مسطّح)

private struct SpWcMatchRow: View {
    let fixture: SpWcFixture

    private var isSynthetic: Bool { fixture.id >= 90_000_000 }

    // أحجام موحّدة لكل الصفوف (منتهية/جارية/قادمة) — هذا ما يمنح القائمة مظهر
    // «دوري» المنظّم: الأعلام تصطفّ في عمودين نظيفين والنتائج في عمود واحد بالمنتصف.
    private let logoSize: CGFloat = 34
    private let centerWidth: CGFloat = 50

    private var started: Bool { fixture.status.live || fixture.status.finished }
    // الفائز بركلات الترجيح (إن وُجدت ولم تتعادل): هل هو المضيف؟ نستعمله لتظليل
    // الفائز حتى حين يترك المزوّد علم team.winner فارغًا في المباريات المحسومة بالترجيح.
    private var penWinnerHome: Bool? {
        guard let p = fixture.penalties, let h = p.home, let a = p.away, h != a else { return nil }
        return h > a
    }
    private var decided: Bool {
        fixture.status.finished && (fixture.home.winner == true || fixture.away.winner == true || penWinnerHome != nil)
    }
    private func isWinner(home: Bool) -> Bool {
        guard decided else { return false }
        if let ph = penWinnerHome { return ph == home }
        return (home ? fixture.home.winner : fixture.away.winner) == true
    }

    // صفّ مدمج بلا إطار وبلا أي إضافات (الدور/الملعب/التوقّع تُعرض في تفاصيل المباراة).
    // الترتيب على طراز «دوري»: العَلَم ملاصق للنتيجة، والاسم للطرف الخارجي. (RTL: المضيف يمينًا.)
    var body: some View {
        Group {
            if isSynthetic {
                rowContent
            } else {
                NavigationLink {
                    SpMatchCenter(fixtureId: fixture.id, preview: SpFixture(worldCup: fixture))
                } label: {
                    rowContent
                }
                .buttonStyle(SpPressStyle())
            }
        }
    }

    private var rowContent: some View {
        VStack(spacing: 7) {
            HStack(spacing: 6) {
                teamSide(home: true)
                centerColumn
                teamSide(home: false)
            }
        }
        .padding(.vertical, 10)
        .padding(.horizontal, 8)
        .background(fixture.status.live ? SpTheme.crimson.opacity(0.035) : Color.clear)
        .contentShape(Rectangle())
    }

    private var homeResolved: (team: SpWcTeam?, label: String) {
        if fixture.home.id > 0, !fixture.home.logo.isEmpty { return (fixture.home, fixture.home.name) }
        let code = fixture.homeCode ?? fixture.home.name
        return (nil, code)
    }

    private var awayResolved: (team: SpWcTeam?, label: String) {
        if fixture.away.id > 0, !fixture.away.logo.isEmpty { return (fixture.away, fixture.away.name) }
        let code = fixture.awayCode ?? fixture.away.name
        return (nil, code)
    }

    private func teamSide(home: Bool) -> some View {
        let resolved = home ? homeResolved : awayResolved
        let logoView = teamLogo(resolved.0, label: resolved.1)
        let name = teamName(resolved.1, home: home, placeholder: resolved.0 == nil)
        return HStack(spacing: 6) {
            if home {
                Spacer(minLength: 4)
                name
                logoView
            } else {
                logoView
                name
                Spacer(minLength: 4)
            }
        }
        .frame(maxWidth: .infinity)
    }

    @ViewBuilder private func teamLogo(_ team: SpWcTeam?, label: String) -> some View {
        if let team, team.id > 0, !team.logo.isEmpty {
            SpTeamLogo(logo: team.logo, size: logoSize)
        } else {
            Circle()
                .stroke(SpTheme.outline, style: StrokeStyle(lineWidth: 1, dash: [3, 2]))
                .frame(width: logoSize, height: logoSize)
                .overlay {
                    Text("?")
                        .font(SportsFonts.app(size: 11, weight: .bold))
                        .foregroundStyle(SpTheme.onDarkFaint)
                }
        }
    }

    private func teamName(_ text: String, home: Bool, placeholder: Bool) -> some View {
        let winner = isWinner(home: home)
        return Text(text)
            .font(SportsFonts.app(size: placeholder ? 12 : 12.5, weight: winner ? .heavy : .semibold))
            .foregroundStyle(placeholder ? SpTheme.onDarkDim : SpTheme.onDarkStrong)
            .lineLimit(1)
            .minimumScaleFactor(0.76)
            .allowsTightening(true)
            .multilineTextAlignment(home ? .trailing : .leading)
    }

    // عمود النتيجة الثابت بالمنتصف — نتيجة مدمجة + سطر حالة موجز تحتها.
    // ارتفاع ثابت كي تتساوى الصفوف بصريًّا مهما اختلفت حالتها.
    private var centerColumn: some View {
        VStack(spacing: 0) {
            if started {
                Text(scoreText)
                    .font(SportsFonts.app(size: 15, weight: .heavy))
                    .foregroundStyle(SpTheme.onDarkStrong)
                    .monospacedDigit()
                    .environment(\.layoutDirection, .leftToRight)
            } else {
                Text(SpFormat.kickoffTime(fixture.date))
                    .font(SportsFonts.app(size: 13, weight: .heavy))
                    .foregroundStyle(SpTheme.onDarkStrong)
                    .monospacedDigit()
                    .environment(\.layoutDirection, .leftToRight)
            }
            statusSub
        }
        .frame(width: centerWidth)
    }

    @ViewBuilder private var statusSub: some View {
        if fixture.status.live {
            HStack(spacing: 4) {
                Circle().fill(SpTheme.crimson).frame(width: 5, height: 5)
                Text(liveMinute)
            }
            .font(SportsFonts.app(size: 10.5, weight: .bold))
            .foregroundStyle(SpTheme.crimson)
            .lineLimit(1)
            .minimumScaleFactor(0.8)
        } else if fixture.status.finished {
            Text(penaltyText ?? "انتهت")
                .font(SportsFonts.app(size: 10.5, weight: penaltyText == nil ? .semibold : .bold))
                .foregroundStyle(penaltyText == nil ? SpTheme.onDarkDim : SpTheme.green)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
        } else {
            Text("موعد")
                .font(SportsFonts.app(size: 10.5, weight: .semibold))
                .foregroundStyle(SpTheme.onDarkFaint)
        }
    }

    private var scoreText: String {
        "\(fixture.goals.away ?? 0)-\(fixture.goals.home ?? 0)"
    }

    // السطر الفرعي المضغوط (عرض ~50pt): نتيجة الترجيح بالفائز أولًا حتى لا تنقلب،
    // واسم الفائز يظهر مظلَّلًا (heavy) في عموده. تتعادل ركلات الترجيح نادرًا جدًّا؛
    // عندها نتراجع لإظهار النتيجة كما وردت.
    private var penaltyText: String? {
        guard
            let penalties = fixture.penalties,
            let home = penalties.home,
            let away = penalties.away
        else { return nil }
        return "ترجيح \(max(home, away))-\(min(home, away))"
    }

    private var liveMinute: String {
        switch fixture.status.code {
        case "HT": return "استراحة"
        case "BT": return "استراحة إضافي"
        case "P", "PEN": return "ركلات"
        case "SUSP": return "موقوفة"
        case "INT": return "متوقّفة"
        default: break
        }
        guard let e = fixture.status.elapsed else { return fixture.status.label }
        if let extra = fixture.status.extra, extra > 0 { return "\(e)+\(extra)'" }
        return "\(e)'"
    }

}

// MARK: - مركز مباراة المونديال (نفس تصميم مركز مباراة روشن SpMatchCenter)
//
// يطابق تصميم SpMatchCenter حرفيًّا: رأس + تبويبات حبوب أفقية + خطّ زمني ثنائي
// المحور للأحداث + أشرطة الإحصائيات + ملعب التشكيلة (إحداثيات grid) + التقييمات
// بالصور والشارات + المواجهات + توقّع النموذج لِما قبل المباراة. البيانات الكاملة
// من /world-cup/match/:id (أحداث/إحصائيات/تشكيلات/تقييمات/توقّع/مواجهات).
struct WcMatchCenter: View {
    let fixtureId: Int
    let preview: SpWcFixture

    @State private var detail: SpWcMatchDetail?
    @State private var loading = true
    @State private var segment: WcSeg = .events
    @State private var xg: SpXg?
    @State private var momentum: SpMomentum?
    @State private var pressure: SpPressure?
    @State private var facts: SpMatchFacts?
    @State private var commentary: SpCommentary?
    @State private var selectedTeam: IDBox?
    @State private var selectedPlayer: IDBox?

    private var fx: SpWcFixture { detail?.fixture ?? preview }
    private var started: Bool { fx.status.live || fx.status.finished }
    private var hasAnalysis: Bool {
        (xg?.available ?? false) || (momentum?.available ?? false)
            || (pressure?.available ?? false) || (facts?.available ?? false)
    }
    private var hasCommentary: Bool { !(commentary?.items.isEmpty ?? true) }

    // ألوان أيقونات الأحداث (مطابقة لمركز المباراة في الويب): تبديل سماوي، فار بنفسجي.
    private let subSky = Color(red: 0.055, green: 0.647, blue: 0.914)
    private let varPurple = Color(red: 0.659, green: 0.333, blue: 0.969)
    private let pitchTop = Color(red: 0.14, green: 0.52, blue: 0.38)
    private let pitchBottom = Color(red: 0.07, green: 0.34, blue: 0.25)

    var body: some View {
        ScrollView {
            VStack(spacing: 18) {
                header
                if !started {
                    preMatchCard
                }
                if !started {
                    predictionCard
                }
                if loading && detail == nil {
                    SpLoading().padding(.top, 24)
                } else if let d = detail {
                    let segs = segments(d)
                    if segs.count > 1 { tabBar(segs) }
                    content(d, segs: segs)
                }
            }
            .padding(.vertical, 12)
            .padding(.bottom, 24)
        }
        .background(SpAmbientBackground())
        .navigationTitle("")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .task { await pollIfLive() }
        .refreshable { await load(force: true) }
        .navigationDestination(item: $selectedTeam) { box in SpTeamPage(teamId: box.id) }
        .navigationDestination(item: $selectedPlayer) { box in SpPlayerPage(playerId: box.id) }
    }

    // MARK: الرأس

    private var header: some View {
        VStack(spacing: 10) {
            HStack(alignment: .top, spacing: 8) {
                teamColumn(fx.home)
                centerColumn
                teamColumn(fx.away)
            }
            if !headerMeta.isEmpty {
                Text(headerMeta)
                    .font(SportsFonts.app(size: 11))
                    .foregroundStyle(SpTheme.onDarkDim)
                    .multilineTextAlignment(.center)
                    .lineLimit(2)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.horizontal, 16).padding(.top, 4)
    }

    private var headerMeta: String {
        var parts: [String] = []
        if !fx.round.isEmpty { parts.append(fx.round) }
        if let v = fx.venue {
            let venue = v.city.isEmpty ? v.name : (v.name.isEmpty ? v.city : "\(v.name) — \(v.city)")
            if !venue.isEmpty { parts.append(venue) }
        }
        let day = SpFormat.kickoffDay(fx.date)
        if !day.isEmpty { parts.append(day) }
        return parts.joined(separator: " · ")
    }

    private func teamColumn(_ t: SpWcTeam) -> some View {
        Button { selectedTeam = IDBox(id: t.id) } label: {
            VStack(spacing: 8) {
                SpTeamLogo(logo: t.logo, size: 58)
                Text(t.name)
                    .font(SportsFonts.app(size: 14, weight: .heavy))
                    .foregroundStyle(SpTheme.onDark)
                    .multilineTextAlignment(.center)
                    .lineLimit(2).minimumScaleFactor(0.8)
            }
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(SpPressStyle())
    }

    private var centerColumn: some View {
        VStack(spacing: 6) {
            if started {
                Text("\(fx.goals.away ?? 0) - \(fx.goals.home ?? 0)")
                    .font(SportsFonts.app(size: 38, weight: .heavy))
                    .foregroundStyle(SpTheme.onDarkStrong)
                    .monospacedDigit()
                    .environment(\.layoutDirection, .leftToRight)
            } else {
                Text(SpFormat.kickoffTime(fx.date))
                    .font(SportsFonts.app(size: 28, weight: .heavy))
                    .foregroundStyle(SpTheme.green)
                    .environment(\.layoutDirection, .leftToRight)
            }
            statusPill
        }
        .frame(minWidth: 96)
    }

    @ViewBuilder private var statusPill: some View {
        if fx.status.live {
            HStack(spacing: 4) {
                Circle().fill(.white).frame(width: 5, height: 5)
                Text(liveMinute)
            }
            .font(SportsFonts.app(size: 11, weight: .bold)).foregroundStyle(.white)
            .padding(.horizontal, 8).padding(.vertical, 3)
            .background(Capsule().fill(SpTheme.crimson))
        } else if fx.status.finished {
            Text("انتهت")
                .font(SportsFonts.app(size: 11, weight: .bold)).foregroundStyle(SpTheme.crimson)
                .padding(.horizontal, 8).padding(.vertical, 3)
                .background(Capsule().fill(SpTheme.crimson.opacity(0.12)))
        } else {
            Text("لم تبدأ")
                .font(SportsFonts.app(size: 11, weight: .bold)).foregroundStyle(SpTheme.green)
                .padding(.horizontal, 8).padding(.vertical, 3)
                .background(Capsule().fill(SpTheme.green.opacity(0.12)))
        }
    }

    private var liveMinute: String {
        switch fx.status.code {
        case "HT": return "استراحة"
        case "P", "PEN": return "ركلات"
        default: break
        }
        guard let e = fx.status.elapsed else { return fx.status.label }
        if let x = fx.status.extra, x > 0 { return "\(e)+\(x)'" }
        return "\(e)'"
    }

    // MARK: ما قبل المباراة

    @ViewBuilder private var preMatchCard: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 8) {
                Image(systemName: "hourglass").font(.system(size: 14, weight: .bold)).foregroundStyle(SpTheme.green)
                Text("الوقت المتبقّي على المباراة").font(SportsFonts.app(size: 15, weight: .bold)).foregroundStyle(SpTheme.onDark)
                Spacer(minLength: 0)
            }
            SpCountdownChips(timestampMs: Int(fx.timestamp) * 1000).frame(maxWidth: .infinity, alignment: .center)
        }
        .padding(16)
        .background(RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous).fill(SpTheme.card)
            .overlay(RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous).stroke(SpTheme.cardStroke, lineWidth: 1)))
        .padding(.horizontal, 16)
    }

    // توقّع VARA الديناميكي — من المواجهات السابقة + أفضلية الأرض (ملاعب محايدة).
    private var wcVaraPick: VaraPick {
        var hw = 0, dr = 0, aw = 0
        for m in (detail?.headToHead ?? []) {
            guard let gh = m.goals.home, let ga = m.goals.away else { continue }
            let homeIsCurrentHome = m.home.id == fx.home.id
            let curHome = homeIsCurrentHome ? gh : ga
            let curAway = homeIsCurrentHome ? ga : gh
            if curHome > curAway { hw += 1 } else if curHome == curAway { dr += 1 } else { aw += 1 }
        }
        let tuple = (hw + dr + aw) > 0 ? (home: hw, draw: dr, away: aw) : nil
        return VaraPredict.compute(home: nil, away: nil, homeName: fx.home.name, awayName: fx.away.name,
                                   neutralVenue: true, h2h: tuple)
    }

    @ViewBuilder private var predictionCard: some View {
        let pick = wcVaraPick
        VStack(spacing: 12) {
            HStack(spacing: 8) {
                Image(systemName: "sparkles").font(.system(size: 14, weight: .bold)).foregroundStyle(SpTheme.green)
                Text("توقّع VARA").font(SportsFonts.app(size: 15, weight: .bold)).foregroundStyle(SpTheme.onDark)
                Spacer(minLength: 0)
                Text("الأرجح \(pick.scoreHome)-\(pick.scoreAway)")
                    .font(SportsFonts.app(size: 11, weight: .heavy)).foregroundStyle(SpTheme.green)
                    .monospacedDigit().environment(\.layoutDirection, .leftToRight)
                    .padding(.horizontal, 8).padding(.vertical, 3)
                    .background(Capsule().fill(SpTheme.green.opacity(0.10)))
            }
            HStack(alignment: .top) {
                predStat("\(pick.home)%", fx.home.name, SpTheme.green)
                predStat("\(pick.draw)%", "تعادل", SpTheme.onDarkDim)
                predStat("\(pick.away)%", fx.away.name, SpTheme.onDark)
            }
            GeometryReader { geo in
                HStack(spacing: 2) {
                    Capsule().fill(SpTheme.green).frame(width: geo.size.width * CGFloat(pick.home) / 100)
                    Capsule().fill(SpTheme.onDarkFaint.opacity(0.45)).frame(width: geo.size.width * CGFloat(pick.draw) / 100)
                    Capsule().fill(SpTheme.teal).frame(width: geo.size.width * CGFloat(pick.away) / 100)
                }
                .environment(\.layoutDirection, .rightToLeft)
            }.frame(height: 8)
            HStack(spacing: 6) {
                Image(systemName: "info.circle").font(.system(size: 10)).foregroundStyle(SpTheme.onDarkFaint)
                Text(pick.rationale).font(SportsFonts.app(size: 10.5, weight: .semibold)).foregroundStyle(SpTheme.onDarkDim).lineLimit(2)
                Spacer(minLength: 0)
            }
        }
        .padding(16)
        .background(RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous).fill(SpTheme.card)
            .overlay(RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous).stroke(SpTheme.outline, lineWidth: 1)))
        .padding(.horizontal, 16)
    }

    private func predStat(_ value: String, _ label: String, _ color: Color) -> some View {
        VStack(spacing: 3) {
            Text(value).font(SportsFonts.app(size: 20, weight: .heavy)).foregroundStyle(color).monospacedDigit()
                .environment(\.layoutDirection, .leftToRight)
            Text(label).font(SportsFonts.app(size: 11, weight: .semibold)).foregroundStyle(SpTheme.onDarkDim)
                .lineLimit(1).minimumScaleFactor(0.7).multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
    }

    // MARK: التبويبات

    private func segments(_ d: SpWcMatchDetail) -> [WcSeg] {
        var s: [WcSeg] = []
        if !d.events.isEmpty { s.append(.events) }
        if hasCommentary { s.append(.commentary) }
        if hasAnalysis { s.append(.analysis) }
        if d.ratings.contains(where: { $0.rating > 0 }) { s.append(.ratings) }
        if !d.lineups.isEmpty { s.append(.lineups) }
        if !d.statistics.isEmpty { s.append(.stats) }
        // «توقّع VARA» يظهر مدمجًا قبل المباراة (لا كتبويب) — لتفادي التكرار.
        if !(d.headToHead ?? []).isEmpty { s.append(.h2h) }
        return s
    }

    private func effective(_ segs: [WcSeg]) -> WcSeg { segs.contains(segment) ? segment : (segs.first ?? .events) }

    private func tabBar(_ segs: [WcSeg]) -> some View {
        ScrollViewReader { proxy in
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(segs) { s in
                        let active = effective(segs) == s
                        Button { withAnimation(.easeOut(duration: 0.2)) { segment = s } } label: {
                            Text(s.label)
                                .font(SportsFonts.app(size: 13, weight: .semibold))
                                .foregroundStyle(active ? .white : SpTheme.onDarkDim)
                                .padding(.horizontal, 14).padding(.vertical, 8)
                                .background(Capsule().fill(active ? SpTheme.green : SpTheme.chipFill))
                        }
                        .buttonStyle(.plain).id(s)
                    }
                }
                .padding(.horizontal, 16)
            }
            .onChange(of: effective(segs)) { _, s in withAnimation(.easeOut(duration: 0.2)) { proxy.scrollTo(s, anchor: .center) } }
        }
    }

    @ViewBuilder private func content(_ d: SpWcMatchDetail, segs: [WcSeg]) -> some View {
        if segs.isEmpty {
            SpEmptyState(icon: "hourglass", title: "لا تفاصيل بعد",
                         subtitle: "ستظهر الأحداث والإحصاءات والتشكيلة فور توفّرها").padding(.horizontal, 16)
        } else {
            switch effective(segs) {
            case .events:     eventsView(d)
            case .commentary: commentaryView
            case .analysis:   analysisView
            case .ratings:    ratingsView(d)
            case .lineups:    lineupsView(d.lineups)
            case .stats:      statsView(d.statistics)
            case .prediction: predictionCard
            case .h2h:        h2hView(d.headToHead ?? [])
            }
        }
    }

    // MARK: الأحداث — خطّ زمني ثنائي المحور

    private func eventsView(_ d: SpWcMatchDetail) -> some View {
        let homeId = fx.home.id
        let items = timelineItems(d.events, homeId: homeId)
        return VStack(spacing: 14) {
            eventsTeamsHeader
            ZStack {
                HStack(spacing: 0) {
                    Spacer(minLength: 0)
                    Capsule().fill(SpTheme.green.opacity(0.28)).frame(width: 2)
                    Spacer(minLength: 0)
                }
                .padding(.vertical, 10)
                VStack(spacing: 12) {
                    ForEach(items) { item in
                        switch item {
                        case .event(let e): timelineRow(e, homeId: homeId)
                        case .halftime(let h, let a): halftimeMarker(home: h, away: a)
                        }
                    }
                }
            }
        }
        .padding(.horizontal, 16)
    }

    private var eventsTeamsHeader: some View {
        HStack(spacing: 10) {
            teamMini(fx.away, logoLeading: true)
            Spacer(minLength: 0)
            teamMini(fx.home, logoLeading: false)
        }
        .environment(\.layoutDirection, .leftToRight)
        .padding(.bottom, 2)
    }

    private func teamMini(_ t: SpWcTeam, logoLeading: Bool) -> some View {
        HStack(spacing: 7) {
            if logoLeading { SpTeamLogo(logo: t.logo, size: 24) }
            Text(t.name).font(SportsFonts.app(size: 13, weight: .heavy)).foregroundStyle(SpTheme.onDark)
                .lineLimit(1).minimumScaleFactor(0.8)
            if !logoLeading { SpTeamLogo(logo: t.logo, size: 24) }
        }
    }

    private func timelineRow(_ e: SpWcEvent, homeId: Int) -> some View {
        let isHome = e.teamId == homeId
        return HStack(spacing: 8) {
            HStack(spacing: 0) { Spacer(minLength: 0); if !isHome { eventCard(e, isHome: false) } }.frame(maxWidth: .infinity)
            minutePill(e)
            HStack(spacing: 0) { if isHome { eventCard(e, isHome: true) }; Spacer(minLength: 0) }.frame(maxWidth: .infinity)
        }
        .environment(\.layoutDirection, .leftToRight)
    }

    private func eventCard(_ e: SpWcEvent, isHome: Bool) -> some View {
        let isGoal = e.type == "goal"
        let title = e.player.isEmpty ? e.label : e.player
        let typeLine = goalTypeLine(e)
        let detailLine = detailSubtitle(e)
        let text = VStack(alignment: .trailing, spacing: 1) {
            Text(title).font(SportsFonts.app(size: 12.5, weight: .bold)).foregroundStyle(SpTheme.onDark)
                .lineLimit(1).minimumScaleFactor(0.75)
            if let typeLine { Text(typeLine).font(SportsFonts.app(size: 10)).foregroundStyle(SpTheme.green).lineLimit(1).minimumScaleFactor(0.8) }
            if let detailLine { Text(detailLine).font(SportsFonts.app(size: 10)).foregroundStyle(SpTheme.onDarkDim).lineLimit(1).minimumScaleFactor(0.8) }
        }
        .frame(maxWidth: 150, alignment: .trailing).multilineTextAlignment(.trailing)
        return HStack(alignment: .top, spacing: 7) {
            if isHome { eventBadge(e); text } else { text; eventBadge(e) }
        }
        .padding(.horizontal, 10).padding(.vertical, 7)
        .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(isGoal ? SpTheme.green.opacity(0.10) : SpTheme.chipFill))
        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(isGoal ? SpTheme.green.opacity(0.25) : Color.clear, lineWidth: 1))
    }

    private func minutePill(_ e: SpWcEvent) -> some View {
        Text(pillMinute(e))
            .font(SportsFonts.app(size: 11, weight: .bold)).foregroundStyle(.white).monospacedDigit()
            .padding(.horizontal, 8).padding(.vertical, 3).frame(minWidth: 40)
            .background(Capsule().fill(SpTheme.green))
            .environment(\.layoutDirection, .leftToRight).fixedSize()
    }

    private func halftimeMarker(home: Int, away: Int) -> some View {
        HStack(spacing: 7) {
            Text("نتيجة الشوط الأول").font(SportsFonts.app(size: 11, weight: .bold)).foregroundStyle(SpTheme.onDarkDim)
            Text("\(away) - \(home)").font(SportsFonts.app(size: 12, weight: .heavy)).foregroundStyle(SpTheme.onDark)
                .monospacedDigit().environment(\.layoutDirection, .leftToRight)
        }
        .padding(.horizontal, 12).padding(.vertical, 6)
        .background(Capsule().fill(SpTheme.chipFill)).overlay(Capsule().stroke(SpTheme.cardStroke, lineWidth: 1))
        .frame(maxWidth: .infinity)
    }

    @ViewBuilder private func eventBadge(_ e: SpWcEvent) -> some View {
        Group {
            switch e.type {
            case "goal": Image(systemName: "soccerball").foregroundStyle(SpTheme.green)
            case "missed-penalty": Image(systemName: "exclamationmark.shield.fill").foregroundStyle(SpTheme.crimson)
            case "var": Image(systemName: "play.tv.fill").foregroundStyle(varPurple)
            case "yellow-card": cardChip(Color(red: 0.95, green: 0.76, blue: 0.22))
            case "red-card": cardChip(SpTheme.crimson)
            case "substitution": Image(systemName: "arrow.left.arrow.right").foregroundStyle(subSky)
            default: Image(systemName: "dot.radiowaves.left.and.right").foregroundStyle(SpTheme.onDarkFaint)
            }
        }
        .font(.system(size: 15, weight: .bold)).frame(width: 18, height: 18).padding(.top, 1)
    }

    private func cardChip(_ color: Color) -> some View {
        RoundedRectangle(cornerRadius: 2.5, style: .continuous).fill(color).frame(width: 11, height: 15).frame(width: 18, height: 18)
    }

    private func pillMinute(_ e: SpWcEvent) -> String {
        if let x = e.extraMinute, x > 0 { return "\(e.minute)'+\(x)" }
        return "\(e.minute)'"
    }

    private func goalTypeLine(_ e: SpWcEvent) -> String? {
        guard e.type == "goal", !e.label.isEmpty, e.label != "هدف", e.label != e.player else { return nil }
        return e.label
    }

    private func detailSubtitle(_ e: SpWcEvent) -> String? {
        switch e.type {
        case "substitution": if let a = e.assist, !a.isEmpty { return "بديلًا عن: \(a)" }; return nil
        case "goal": if let a = e.assist, !a.isEmpty { return "صناعة: \(a)" }; return nil
        default: if !e.label.isEmpty, e.label != e.player { return e.label }; return nil
        }
    }

    private func eff(_ e: SpWcEvent) -> Double { Double(e.minute) + Double(e.extraMinute ?? 0) / 100.0 }
    private func isFirstHalf(_ e: SpWcEvent) -> Bool { e.minute <= 45 }

    private func halftimeScore(_ events: [SpWcEvent], homeId: Int) -> (Int, Int) {
        var home = 0, away = 0
        for e in events where e.type == "goal" && isFirstHalf(e) {
            let ownGoal = e.label.contains("عكسي")
            let scoredByHome = (e.teamId == homeId)
            let creditHome = ownGoal ? !scoredByHome : scoredByHome
            if creditHome { home += 1 } else { away += 1 }
        }
        return (home, away)
    }

    private func timelineItems(_ events: [SpWcEvent], homeId: Int) -> [WcTimelineItem] {
        let sorted = events.sorted { eff($0) > eff($1) }
        let secondHalfReached = sorted.contains { !isFirstHalf($0) } || fx.status.finished || ((fx.status.elapsed ?? 0) > 45)
        let ht = halftimeScore(events, homeId: homeId)
        var items: [WcTimelineItem] = []
        var inserted = false
        for e in sorted {
            if secondHalfReached, !inserted, isFirstHalf(e) { items.append(.halftime(home: ht.0, away: ht.1)); inserted = true }
            items.append(.event(e))
        }
        if secondHalfReached, !inserted { items.append(.halftime(home: ht.0, away: ht.1)) }
        return items
    }

    // MARK: الإحصائيات

    private func statsView(_ stats: [SpWcStat]) -> some View {
        VStack(spacing: 16) { ForEach(stats) { row in statRow(row) } }.padding(.horizontal, 16)
    }

    private func statRow(_ s: SpWcStat) -> some View {
        let h = max(0.0, statNum(s.home)); let a = max(0.0, statNum(s.away)); let total = max(h + a, 1)
        return VStack(spacing: 6) {
            HStack {
                Text(s.away).font(SportsFonts.app(size: 13, weight: .bold)).foregroundStyle(SpTheme.onDark).environment(\.layoutDirection, .leftToRight)
                Spacer()
                Text(s.label).font(SportsFonts.app(size: 11)).foregroundStyle(SpTheme.onDarkDim)
                Spacer()
                Text(s.home).font(SportsFonts.app(size: 13, weight: .bold)).foregroundStyle(SpTheme.onDark).environment(\.layoutDirection, .leftToRight)
            }
            GeometryReader { geo in
                HStack(spacing: 3) {
                    Capsule().fill(SpTheme.greenSoft).frame(width: geo.size.width * CGFloat(h / total))
                    Capsule().fill(SpTheme.green.opacity(0.7)).frame(width: geo.size.width * CGFloat(a / total))
                }
            }
            .frame(height: 6)
        }
    }

    private func statNum(_ s: String) -> Double { Double(s.filter { $0.isNumber || $0 == "." }) ?? 0 }

    // MARK: التعليق والتحليل — مطابق لهوية مركز مباراة روشن

    @ViewBuilder private var commentaryView: some View {
        if let c = commentary, !c.items.isEmpty {
            VStack(alignment: .leading, spacing: 10) {
                ForEach(c.items.sorted { $0.order > $1.order }) { item in
                    commentaryRow(item)
                }
            }
            .padding(.horizontal, 16)
        }
    }

    private func commentaryRow(_ item: SpCommentaryItem) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Text(commentaryMinute(item))
                .font(SportsFonts.app(size: 12, weight: .bold))
                .foregroundStyle(item.goal ? SpTheme.green : SpTheme.onDarkDim)
                .frame(minWidth: 40, alignment: .leading)
                .environment(\.layoutDirection, .leftToRight)
            if item.goal {
                Image(systemName: "soccerball").font(.system(size: 13, weight: .bold)).foregroundStyle(SpTheme.green)
            } else if item.important {
                Image(systemName: "star.fill").font(.system(size: 11, weight: .bold)).foregroundStyle(SpTheme.gold)
            } else {
                Image(systemName: "dot.radiowaves.left.and.right").font(.system(size: 12, weight: .bold)).foregroundStyle(SpTheme.onDarkFaint)
            }
            Text(item.textAr)
                .font(SportsFonts.app(size: 14, weight: item.goal || item.important ? .bold : .regular))
                .foregroundStyle(SpTheme.onDark)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.horizontal, 12).padding(.vertical, 10)
        .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(item.goal ? SpTheme.green.opacity(0.10) : SpTheme.chipFill))
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(item.goal ? SpTheme.green.opacity(0.35) : .clear, lineWidth: 1))
    }

    private func commentaryMinute(_ item: SpCommentaryItem) -> String {
        if item.minute <= 0 { return "—" }
        if let extra = item.extraMinute, extra > 0 { return "\(item.minute)'+\(extra)" }
        return "\(item.minute)'"
    }

    @ViewBuilder private var analysisView: some View {
        VStack(spacing: 16) {
            if let x = xg, x.available { xgCard(x) }
            if let m = momentum, m.available { momentumCard(m) }
            if let p = pressure, p.available, !p.points.isEmpty { pressureCard(p) }
            if let f = facts, f.available { factsCard(f) }
        }
        .padding(.horizontal, 16)
    }

    private func xgCard(_ x: SpXg) -> some View {
        VStack(spacing: 12) {
            sectionTitle("الأهداف المتوقّعة (xG)", icon: "scope")
            compareRow("xG", home: x.home.xg, away: x.away.xg, fmt: "%.2f")
            compareRow("على المرمى (xGOT)", home: x.home.xgot, away: x.away.xgot, fmt: "%.2f")
            if !x.topPlayers.isEmpty {
                divider
                ForEach(Array(x.topPlayers.prefix(4).enumerated()), id: \.offset) { _, p in
                    HStack(spacing: 8) {
                        Circle().fill(p.location == "home" ? SpTheme.green : SpTheme.onDarkDim).frame(width: 7, height: 7)
                        Text(p.name).font(SportsFonts.app(size: 13, weight: .semibold)).foregroundStyle(SpTheme.onDark).lineLimit(1)
                        Spacer(minLength: 0)
                        Text(String(format: "%.2f", p.xg)).font(SportsFonts.app(size: 13, weight: .bold))
                            .foregroundStyle(SpTheme.emeraldDeep).environment(\.layoutDirection, .leftToRight)
                    }
                }
            }
        }
        .padding(16).background(analysisCardBg)
    }

    private func momentumCard(_ m: SpMomentum) -> some View {
        VStack(spacing: 12) {
            sectionTitle("الزخم والاستحواذ", icon: "waveform.path.ecg")
            if let pos = m.possession {
                compareRow("الاستحواذ", home: Double(pos.home), away: Double(pos.away), fmt: "%.0f", suffix: "%")
            }
            if !m.points.isEmpty {
                SpFlowChart(points: m.points)
                chartLegend
            }
        }
        .padding(16).background(analysisCardBg)
    }

    private func pressureCard(_ p: SpPressure) -> some View {
        VStack(spacing: 12) {
            sectionTitle("مؤشّر الضغط", icon: "gauge.with.dots.needle.50percent")
            SpFlowChart(points: downsample(p.points, maxCount: 24))
            chartLegend
        }
        .padding(16).background(analysisCardBg)
    }

    private func factsCard(_ f: SpMatchFacts) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            sectionTitle("وقائع المباراة", icon: "sparkles")
            if let ht = f.halftime, let h = ht.home, let a = ht.away {
                factRow("نتيجة الشوط الأول", "\(h) - \(a)", ltr: true)
            }
            if let w = f.weather {
                let txt = [w.temp.map { "\($0)°" }, w.description, w.humidity.map { "رطوبة \($0)" }]
                    .compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · ")
                if !txt.isEmpty { factRow("الطقس", txt) }
            }
            if !f.absentees.isEmpty {
                divider
                Text("الغيابات").font(SportsFonts.app(size: 12, weight: .bold)).foregroundStyle(SpTheme.emeraldDeep)
                ForEach(Array(f.absentees.prefix(6).enumerated()), id: \.offset) { _, ab in
                    HStack(spacing: 8) {
                        Circle().fill(ab.location == "home" ? SpTheme.green : SpTheme.onDarkDim).frame(width: 7, height: 7)
                        Text(ab.name).font(SportsFonts.app(size: 13, weight: .semibold)).foregroundStyle(SpTheme.onDark).lineLimit(1)
                        Spacer(minLength: 0)
                        Text(ab.reason).font(SportsFonts.app(size: 11)).foregroundStyle(SpTheme.onDarkFaint).lineLimit(1)
                    }
                }
            }
        }
        .padding(16).background(analysisCardBg)
    }

    private func sectionTitle(_ title: String, icon: String) -> some View {
        HStack(spacing: 8) {
            Image(systemName: icon).font(.system(size: 14, weight: .bold)).foregroundStyle(SpTheme.greenSoft)
            Text(title).font(SportsFonts.app(size: 15, weight: .bold)).foregroundStyle(SpTheme.onDark)
            Spacer(minLength: 0)
        }
    }

    private func compareRow(_ title: String, home: Double, away: Double, fmt: String, suffix: String = "") -> some View {
        let total = max(home + away, 0.0001)
        return VStack(spacing: 5) {
            HStack {
                Text(String(format: fmt, home) + suffix).font(SportsFonts.app(size: 13, weight: .bold))
                    .foregroundStyle(SpTheme.onDark).environment(\.layoutDirection, .leftToRight)
                Spacer()
                Text(title).font(SportsFonts.app(size: 11)).foregroundStyle(SpTheme.onDarkDim)
                Spacer()
                Text(String(format: fmt, away) + suffix).font(SportsFonts.app(size: 13, weight: .bold))
                    .foregroundStyle(SpTheme.onDark).environment(\.layoutDirection, .leftToRight)
            }
            GeometryReader { geo in
                HStack(spacing: 3) {
                    Capsule().fill(SpTheme.green).frame(width: geo.size.width * CGFloat(home / total))
                    Capsule().fill(SpTheme.onDarkDim).frame(width: geo.size.width * CGFloat(away / total))
                }
            }
            .frame(height: 6)
        }
    }

    private func factRow(_ label: String, _ value: String, ltr: Bool = false) -> some View {
        HStack {
            Text(label).font(SportsFonts.app(size: 13)).foregroundStyle(SpTheme.onDarkDim)
            Spacer()
            Text(value).font(SportsFonts.app(size: 14, weight: .bold)).foregroundStyle(SpTheme.onDark)
                .environment(\.layoutDirection, ltr ? .leftToRight : .rightToLeft)
        }
    }

    private var chartLegend: some View {
        HStack(spacing: 16) {
            legendDot(SpTheme.green, fx.home.name)
            legendDot(SpTheme.onDarkDim, fx.away.name)
            Spacer(minLength: 0)
        }
    }

    private func legendDot(_ color: Color, _ text: String) -> some View {
        HStack(spacing: 5) {
            Circle().fill(color).frame(width: 8, height: 8)
            Text(text).font(SportsFonts.app(size: 11)).foregroundStyle(SpTheme.onDarkDim).lineLimit(1)
        }
    }

    private var divider: some View { Rectangle().fill(SpTheme.outline.opacity(0.6)).frame(height: 1) }
    private var analysisCardBg: some View {
        RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous).fill(SpTheme.card)
            .overlay(RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous).stroke(SpTheme.outline, lineWidth: 1))
            .shadow(color: SpTheme.cardShadow, radius: 10, x: 0, y: 6)
    }

    private func downsample(_ pts: [SpFlowPoint], maxCount: Int) -> [SpFlowPoint] {
        guard pts.count > maxCount else { return pts }
        let step = Int((Double(pts.count) / Double(maxCount)).rounded(.up))
        return pts.enumerated().filter { $0.offset % step == 0 }.map { $0.element }
    }

    // MARK: التشكيلة — ملعب ثنائي الأبعاد + دكة البدلاء

    private func lineupsView(_ lineups: [SpWcLineup]) -> some View {
        VStack(spacing: 16) { ForEach(Array(lineups.enumerated()), id: \.offset) { _, lu in lineupCard(lu) } }.padding(.horizontal, 16)
    }

    private func lineupCard(_ lu: SpWcLineup) -> some View {
        let rows = pitchRows(lu)
        return VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 10) {
                Button { selectedTeam = IDBox(id: lu.teamId) } label: {
                    Text(lu.teamName).font(SportsFonts.app(size: 15, weight: .bold)).foregroundStyle(SpTheme.onDark).lineLimit(1)
                }
                .buttonStyle(SpPressStyle())
                Spacer(minLength: 0)
                if let f = lu.formation, !f.isEmpty {
                    Text(f).font(SportsFonts.app(size: 12, weight: .bold)).foregroundStyle(SpTheme.emeraldDeep)
                        .padding(.horizontal, 10).padding(.vertical, 3).background(Capsule().fill(SpTheme.chipFill))
                        .environment(\.layoutDirection, .leftToRight)
                }
            }
            if rows.isEmpty {
                if lu.startXI.isEmpty {
                    Text("لم تُعلَن التشكيلة بعد").font(SportsFonts.app(size: 12)).foregroundStyle(SpTheme.onDarkDim)
                } else {
                    VStack(spacing: 2) { ForEach(Array(lu.startXI.enumerated()), id: \.offset) { _, p in playerRow(p, starter: true) } }
                }
            } else {
                pitchView(rows)
            }
            if !lu.coach.isEmpty {
                Label("المدرب: \(lu.coach)", systemImage: "person.fill").font(SportsFonts.app(size: 11)).foregroundStyle(SpTheme.onDarkDim)
            }
            if !lu.substitutes.isEmpty { benchGrid(lu.substitutes) }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func pitchRows(_ lu: SpWcLineup) -> [[SpWcLineupPlayer]] {
        var byRow: [Int: [(col: Int, p: SpWcLineupPlayer)]] = [:]
        for p in lu.startXI {
            let parts = (p.grid ?? "0:0").split(separator: ":").map { Int($0) ?? 0 }
            let r = parts.first ?? 0
            let c = parts.count > 1 ? parts[1] : 0
            byRow[r, default: []].append((c, p))
        }
        return byRow.keys.filter { $0 > 0 }.sorted().map { r in byRow[r]!.sorted { $0.col < $1.col }.map { $0.p } }
    }

    private func pitchView(_ rows: [[SpWcLineupPlayer]]) -> some View {
        GeometryReader { geo in
            ZStack {
                LinearGradient(colors: [pitchTop, pitchBottom], startPoint: .top, endPoint: .bottom)
                RoundedRectangle(cornerRadius: 12).stroke(.white.opacity(0.25), lineWidth: 1).padding(8)
                Rectangle().fill(.white.opacity(0.2)).frame(height: 1)
                Circle().stroke(.white.opacity(0.25), lineWidth: 1).frame(width: 64, height: 64)
                ForEach(Array(rows.enumerated()), id: \.offset) { ri, players in
                    let y = geo.size.height * (1 - (CGFloat(ri) + 0.6) / (CGFloat(rows.count) + 0.4))
                    HStack(spacing: 0) {
                        ForEach(Array(players.enumerated()), id: \.offset) { _, p in pitchDot(p).frame(maxWidth: .infinity) }
                    }
                    .environment(\.layoutDirection, .leftToRight)
                    .position(x: geo.size.width / 2, y: y).frame(width: geo.size.width)
                }
            }
        }
        .aspectRatio(3.0 / 4.0, contentMode: .fit)
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
    }

    private func pitchDot(_ p: SpWcLineupPlayer) -> some View {
        Button { selectedPlayer = IDBox(id: p.id) } label: {
            VStack(spacing: 2) {
                Text(p.number.map { "\($0)" } ?? "•")
                    .font(SportsFonts.app(size: 11, weight: .heavy)).foregroundStyle(pitchBottom).monospacedDigit()
                    .frame(width: 28, height: 28).background(Circle().fill(.white)).environment(\.layoutDirection, .leftToRight)
                Text(p.name).font(SportsFonts.app(size: 9, weight: .semibold)).foregroundStyle(.white)
                    .lineLimit(1).minimumScaleFactor(0.7).frame(maxWidth: 60)
            }
        }
        .buttonStyle(.plain)
    }

    private func benchGrid(_ subs: [SpWcLineupPlayer]) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                Image(systemName: "figure.seated.side").font(.system(size: 11, weight: .bold)).foregroundStyle(SpTheme.green)
                Text("دكة البدلاء").font(SportsFonts.app(size: 12, weight: .bold)).foregroundStyle(SpTheme.green)
                Text("(\(subs.count))").font(SportsFonts.app(size: 11)).foregroundStyle(SpTheme.onDarkDim)
            }
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 120), spacing: 8)], alignment: .leading, spacing: 8) {
                ForEach(Array(subs.enumerated()), id: \.offset) { _, p in benchRow(p) }
            }
        }
        .padding(.top, 4)
    }

    private func benchRow(_ p: SpWcLineupPlayer) -> some View {
        Button { selectedPlayer = IDBox(id: p.id) } label: {
            HStack(spacing: 8) {
                Text(p.number.map { "\($0)" } ?? "•")
                    .font(SportsFonts.app(size: 11, weight: .heavy)).foregroundStyle(SpTheme.emeraldDeep).monospacedDigit()
                    .frame(width: 22, height: 22).background(Circle().fill(SpTheme.green.opacity(0.15))).environment(\.layoutDirection, .leftToRight)
                Text(p.name).font(SportsFonts.app(size: 12, weight: .semibold)).foregroundStyle(SpTheme.onDark).lineLimit(1).minimumScaleFactor(0.8)
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 8).padding(.vertical, 6)
            .background(RoundedRectangle(cornerRadius: 10, style: .continuous).fill(SpTheme.chipFill))
        }
        .buttonStyle(SpPressStyle())
    }

    private func playerRow(_ p: SpWcLineupPlayer, starter: Bool) -> some View {
        Button { selectedPlayer = IDBox(id: p.id) } label: {
            HStack(spacing: 10) {
                Text(p.number.map { "\($0)" } ?? "—")
                    .font(SportsFonts.app(size: 13, weight: .bold)).foregroundStyle(starter ? SpTheme.green : SpTheme.onDarkFaint)
                    .frame(width: 26).monospacedDigit().environment(\.layoutDirection, .leftToRight)
                Text(p.name).font(SportsFonts.app(size: 13, weight: starter ? .semibold : .regular)).foregroundStyle(starter ? SpTheme.onDark : SpTheme.onDarkDim).lineLimit(1)
                Spacer(minLength: 0)
                if let pos = p.position, !pos.isEmpty { Text(pos).font(SportsFonts.app(size: 10)).foregroundStyle(SpTheme.onDarkFaint) }
            }
            .padding(.vertical, 5)
        }
        .buttonStyle(SpPressStyle())
    }

    // MARK: التقييمات

    private func teamName(_ id: Int) -> String { id == fx.home.id ? fx.home.name : fx.away.name }

    private func ratingsView(_ d: SpWcMatchDetail) -> some View {
        let rated = d.ratings.filter { $0.rating > 0 }.sorted { $0.rating > $1.rating }
        return VStack(spacing: 14) {
            if let m = d.manOfTheMatch { motmCard(m) }
            VStack(spacing: 0) {
                ForEach(Array(rated.enumerated()), id: \.element.id) { idx, p in
                    if idx > 0 { Rectangle().fill(SpTheme.outline.opacity(0.5)).frame(height: 1).padding(.leading, 14) }
                    ratingRow(p)
                }
            }
            .background(RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous).fill(SpTheme.card))
            .overlay(RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous).stroke(SpTheme.cardStroke, lineWidth: 1))
        }
        .padding(.horizontal, 16)
    }

    private func motmCard(_ m: SpWcRating) -> some View {
        Button { selectedPlayer = IDBox(id: m.id) } label: {
            HStack(spacing: 13) {
                playerPhoto(m.photo, size: 52)
                VStack(alignment: .leading, spacing: 3) {
                    HStack(spacing: 5) {
                        Image(systemName: "star.fill").font(.system(size: 10, weight: .bold)).foregroundStyle(SpTheme.green)
                        Text("أفضل لاعب في المباراة").font(SportsFonts.app(size: 11, weight: .bold)).foregroundStyle(SpTheme.green)
                    }
                    Text(m.name).font(SportsFonts.app(size: 16, weight: .heavy)).foregroundStyle(SpTheme.onDark).lineLimit(1)
                    Text(teamName(m.teamId)).font(SportsFonts.app(size: 11.5, weight: .semibold)).foregroundStyle(SpTheme.onDarkDim).lineLimit(1)
                }
                Spacer(minLength: 0)
                ratingBadge(m.rating)
            }
            .padding(13).frame(maxWidth: .infinity)
            .background(RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous).fill(SpTheme.green.opacity(0.06)))
            .overlay(RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous).stroke(SpTheme.outline, lineWidth: 1))
        }
        .buttonStyle(SpPressStyle())
    }

    private func ratingRow(_ p: SpWcRating) -> some View {
        Button { selectedPlayer = IDBox(id: p.id) } label: {
            HStack(spacing: 11) {
                playerPhoto(p.photo, size: 36)
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 5) {
                        if let n = p.number { Text("\(n)").font(SportsFonts.app(size: 10, weight: .bold)).foregroundStyle(SpTheme.onDarkFaint).monospacedDigit() }
                        Text(p.name).font(SportsFonts.app(size: 14, weight: .bold)).foregroundStyle(SpTheme.onDark).lineLimit(1)
                        if p.captain == true { Image(systemName: "c.square.fill").font(.system(size: 11)).foregroundStyle(SpTheme.green) }
                    }
                    HStack(spacing: 5) {
                        Text(teamName(p.teamId)).font(SportsFonts.app(size: 10.5, weight: .semibold)).foregroundStyle(SpTheme.onDarkDim).lineLimit(1)
                        if let pos = p.position, !pos.isEmpty { Text("· \(pos)").font(SportsFonts.app(size: 10)).foregroundStyle(SpTheme.onDarkFaint) }
                    }
                }
                Spacer(minLength: 0)
                if (p.goals ?? 0) > 0 {
                    Label("\(p.goals!)", systemImage: "soccerball.inverse").labelStyle(.titleAndIcon)
                        .font(SportsFonts.app(size: 11, weight: .bold)).foregroundStyle(SpTheme.green)
                }
                ratingBadge(p.rating)
            }
            .padding(.horizontal, 14).padding(.vertical, 10)
            .contentShape(Rectangle())
        }
        .buttonStyle(SpPressStyle())
    }

    private func ratingBadge(_ r: Double) -> some View {
        Text(String(format: "%.1f", r))
            .font(SportsFonts.app(size: 13, weight: .heavy)).foregroundStyle(.white)
            .padding(.horizontal, 8).padding(.vertical, 4)
            .background(Capsule().fill(r >= 7 ? SpTheme.green : (r >= 6 ? SpTheme.onDarkDim : SpTheme.crimson)))
            .environment(\.layoutDirection, .leftToRight)
    }

    private func playerPhoto(_ url: String, size: CGFloat) -> some View {
        SpAvatarImage(url: url, size: size, ring: SpTheme.cardStroke, placeholderFg: SpTheme.onDarkFaint, placeholderBg: SpTheme.chipFill)
    }

    // MARK: المواجهات

    private func h2hView(_ meetings: [SpWcFixture]) -> some View {
        let s = h2hSummary(meetings)
        return VStack(spacing: 14) {
            h2hSummaryCard(s, total: meetings.count)
            VStack(spacing: 0) {
                ForEach(Array(meetings.enumerated()), id: \.element.id) { idx, m in
                    if idx > 0 { Rectangle().fill(SpTheme.outline.opacity(0.5)).frame(height: 1) }
                    h2hMeetingRow(m)
                }
            }
            .background(RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous).fill(SpTheme.card))
            .overlay(RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous).stroke(SpTheme.cardStroke, lineWidth: 1))
        }
        .padding(.horizontal, 16)
    }

    private func h2hSummary(_ meetings: [SpWcFixture]) -> (h: Int, d: Int, a: Int) {
        var h = 0, d = 0, a = 0
        let homeId = fx.home.id
        for m in meetings {
            let gh = m.goals.home ?? 0, ga = m.goals.away ?? 0
            let curHomeIsMeetingHome = m.home.id == homeId
            let cur = curHomeIsMeetingHome ? gh : ga
            let opp = curHomeIsMeetingHome ? ga : gh
            if cur > opp { h += 1 } else if cur < opp { a += 1 } else { d += 1 }
        }
        return (h, d, a)
    }

    private func h2hSummaryCard(_ s: (h: Int, d: Int, a: Int), total: Int) -> some View {
        let t = max(1, total)
        return VStack(spacing: 12) {
            HStack(alignment: .top) {
                predStat("\(s.h)", fx.home.name, SpTheme.green)
                predStat("\(s.d)", "تعادل", SpTheme.onDarkDim)
                predStat("\(s.a)", fx.away.name, SpTheme.onDark)
            }
            GeometryReader { geo in
                HStack(spacing: 2) {
                    Capsule().fill(SpTheme.green).frame(width: geo.size.width * CGFloat(s.h) / CGFloat(t))
                    Capsule().fill(SpTheme.onDarkFaint.opacity(0.45)).frame(width: geo.size.width * CGFloat(s.d) / CGFloat(t))
                    Capsule().fill(SpTheme.onDarkDim).frame(width: geo.size.width * CGFloat(s.a) / CGFloat(t))
                }
            }.frame(height: 8)
            Text("آخر \(total) لقاءات بين الفريقين").font(SportsFonts.app(size: 11, weight: .semibold)).foregroundStyle(SpTheme.onDarkFaint)
        }
        .padding(15).frame(maxWidth: .infinity)
        .background(RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous).fill(SpTheme.card))
        .overlay(RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous).stroke(SpTheme.cardStroke, lineWidth: 1))
    }

    private func h2hMeetingRow(_ m: SpWcFixture) -> some View {
        NavigationLink {
            WcMatchCenter(fixtureId: m.id, preview: m)
        } label: {
            HStack(spacing: 8) {
                Text(m.home.name).font(SportsFonts.app(size: 12.5, weight: .semibold)).foregroundStyle(SpTheme.onDark)
                    .lineLimit(1).minimumScaleFactor(0.8).frame(maxWidth: .infinity, alignment: .trailing)
                Text("\(m.goals.home ?? 0) - \(m.goals.away ?? 0)")
                    .font(SportsFonts.app(size: 13, weight: .heavy)).foregroundStyle(SpTheme.onDark).monospacedDigit()
                    .environment(\.layoutDirection, .leftToRight).frame(minWidth: 44)
                Text(m.away.name).font(SportsFonts.app(size: 12.5, weight: .semibold)).foregroundStyle(SpTheme.onDark)
                    .lineLimit(1).minimumScaleFactor(0.8).frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(.horizontal, 14).padding(.vertical, 11).contentShape(Rectangle())
        }
        .buttonStyle(SpPressStyle())
    }

    // MARK: التحميل

    private func load(force: Bool = false) async {
        async let detailOpt = (try? APIClient.shared.fetchWorldCupMatch(id: fixtureId, ignoreCache: force))
        async let xgOpt = (try? APIClient.shared.fetchWorldCupXg(id: fixtureId, ignoreCache: force))
        async let momentumOpt = (try? APIClient.shared.fetchWorldCupMomentum(id: fixtureId, ignoreCache: force))
        async let pressureOpt = (try? APIClient.shared.fetchWorldCupPressure(id: fixtureId, ignoreCache: force))
        async let factsOpt = (try? APIClient.shared.fetchWorldCupMatchFacts(id: fixtureId, ignoreCache: force))
        async let commentaryOpt = (try? APIClient.shared.fetchWorldCupCommentary(id: fixtureId, ignoreCache: force))
        if let d = await detailOpt { detail = d }
        xg = await xgOpt
        momentum = await momentumOpt
        pressure = await pressureOpt
        facts = await factsOpt
        commentary = await commentaryOpt
        loading = false
    }

    private func pollIfLive() async {
        while !Task.isCancelled {
            try? await Task.sleep(nanoseconds: 20_000_000_000)
            if Task.isCancelled { break }
            guard fx.status.live else { continue }
            await load(force: true)
        }
    }
}

enum WcSeg: String, CaseIterable, Identifiable {
    case events, commentary, analysis, ratings, lineups, stats, prediction, h2h
    var id: String { rawValue }
    var label: String {
        switch self {
        case .events: return "الأحداث"
        case .commentary: return "التعليق"
        case .analysis: return "التحليل"
        case .ratings: return "التقييمات"
        case .lineups: return "التشكيلة"
        case .stats: return "الإحصائيات"
        case .prediction: return "التوقع"
        case .h2h: return "المواجهات"
        }
    }
}

enum WcTimelineItem: Identifiable {
    case event(SpWcEvent)
    case halftime(home: Int, away: Int)
    var id: String {
        switch self {
        case .event(let e): return "e-\(e.id)"
        case .halftime: return "ht"
        }
    }
}

// MARK: - شجرة خروج المغلوب (FIFA 73–104)

struct SpWcBracketTreeView: View {
    let tree: SpWcBracketTree

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("من دور الـ32 حتى النهائي")
                .font(SportsFonts.app(size: 13, weight: .bold))
                .foregroundStyle(SpTheme.green)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(alignment: .top, spacing: 12) {
                    ForEach(tree.columns) { col in
                        VStack(alignment: .leading, spacing: 10) {
                            Text(col.label)
                                .font(SportsFonts.app(size: 12, weight: .heavy))
                                .foregroundStyle(SpTheme.onDark)
                                .frame(maxWidth: .infinity, alignment: .center)
                            ForEach(col.slots) { slot in
                                SpWcBracketSlotCard(slot: slot, isFinal: col.key == "final")
                            }
                        }
                        .frame(width: 168)
                    }
                }
                .padding(.vertical, 4)
            }

            if let third = tree.thirdPlace {
                VStack(alignment: .leading, spacing: 8) {
                    Text("المركز الثالث")
                        .font(SportsFonts.app(size: 12, weight: .heavy))
                        .foregroundStyle(SpTheme.gold)
                    SpWcBracketSlotCard(
                        slot: SpWcBracketSlot(
                            matchNo: 103,
                            fixture: third,
                            sources: nil,
                            topTeam: nil,
                            bottomTeam: nil,
                            topLabel: nil,
                            bottomLabel: nil
                        ),
                        isFinal: false
                    )
                }
            }
        }
    }
}

struct SpWcBracketSlotCard: View {
    let slot: SpWcBracketSlot
    let isFinal: Bool

    private var fx: SpWcFixture? { slot.fixture }
    private var homeResolved: (team: SpWcTeam?, label: String) { slot.resolvedHome(from: fx) }
    private var awayResolved: (team: SpWcTeam?, label: String) { slot.resolvedAway(from: fx) }

    var body: some View {
        Group {
            if let fx {
                NavigationLink {
                    SpMatchCenter(fixtureId: fx.id, preview: SpFixture(worldCup: fx))
                } label: {
                    cardContent
                }
                .buttonStyle(SpPressStyle())
            } else {
                cardContent
            }
        }
    }

    private var cardContent: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(statusText)
                    .font(SportsFonts.app(size: 10, weight: .semibold))
                    .foregroundStyle(SpTheme.onDarkDim)
                Spacer(minLength: 0)
                Text(isFinal ? "النهائي" : "مباراة \(slot.matchNo)")
                    .font(SportsFonts.app(size: 10, weight: .bold))
                    .foregroundStyle(SpTheme.green)
                    .monospacedDigit()
            }
            bracketTeamLine(homeResolved, goals: fx?.goals.home, finished: fx?.status.finished == true)
            bracketTeamLine(awayResolved, goals: fx?.goals.away, finished: fx?.status.finished == true)
        }
        .padding(10)
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(SpTheme.card)
                .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(SpTheme.cardStroke, lineWidth: 1))
        )
    }

    private var statusText: String {
        guard let fx else { return "بانتظار التأهل" }
        if fx.status.live { return "مباشرة" }
        if fx.status.finished { return "انتهت" }
        if fx.status.code != "TBD", fx.timestamp > 0 { return SpFormat.kickoffTime(fx.date) }
        return "قريبًا"
    }

    private func bracketTeamLine(_ resolved: (team: SpWcTeam?, label: String), goals: Int?, finished: Bool) -> some View {
        HStack(spacing: 8) {
            if let team = resolved.team, team.id > 0, !team.logo.isEmpty {
                SpTeamLogo(logo: team.logo, size: 20)
            } else {
                Circle()
                    .stroke(SpTheme.outline, style: StrokeStyle(lineWidth: 1, dash: [3, 2]))
                    .frame(width: 20, height: 20)
                    .overlay {
                        Text("?")
                            .font(SportsFonts.app(size: 9, weight: .bold))
                            .foregroundStyle(SpTheme.onDarkFaint)
                    }
            }
            Text(resolved.label)
                .font(SportsFonts.app(size: 11, weight: resolved.team == nil ? .semibold : .bold))
                .foregroundStyle(resolved.team == nil ? SpTheme.onDarkDim : SpTheme.onDark)
                .lineLimit(2)
                .minimumScaleFactor(0.8)
            Spacer(minLength: 0)
            if finished, let goals {
                Text("\(goals)")
                    .font(SportsFonts.app(size: 12, weight: .heavy))
                    .foregroundStyle(SpTheme.onDark)
                    .monospacedDigit()
            }
        }
    }
}
