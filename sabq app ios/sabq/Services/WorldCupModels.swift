import Foundation
import SwiftUI

// MARK: - World Cup 2026 — DTOs
//
// مرآة لما ترسله نقاط /api/world-cup/* (مُعرَّبة من الخادم). الـ JSON يصل
// بصيغة camelCase نظيفة، والـ decoder المشترك في APIClient عادي بلا
// keyDecodingStrategy، فالأسماء هنا تطابق المفاتيح حرفيًا. الحقول التي قد
// تكون null في الخادم optional هنا. التواريخ تبقى نصًا وتُحلَّل بـ
// SabqFormatters.parseISO8601 عند العرض.

nonisolated struct WCTeam: Decodable, Identifiable, Hashable {
    let id: Int
    let name: String
    let logo: String
    let winner: Bool?
}

nonisolated struct WCStatus: Decodable, Hashable {
    let code: String
    let label: String
    let elapsed: Int?
    let extra: Int?
    let live: Bool
    let finished: Bool
}

nonisolated struct WCScore: Decodable, Hashable {
    let home: Int?
    let away: Int?
}

nonisolated struct WCVenue: Decodable, Hashable {
    let name: String
    let city: String
}

nonisolated struct WCFixture: Decodable, Identifiable, Hashable {
    let id: Int
    let date: String
    let timestamp: Int
    let status: WCStatus
    let round: String
    let roundEn: String
    let venue: WCVenue
    let home: WCTeam
    let away: WCTeam
    let goals: WCScore
    let penalties: WCScore?

    var started: Bool { status.live || status.finished }
    var kickoff: Date? { SabqFormatters.parseISO8601(date) }
}

nonisolated struct WCPrediction: Decodable, Hashable {
    let home: Int
    let draw: Int
    let away: Int
    let advice: String?
}

nonisolated struct WCMatchOfDay: Decodable, Hashable {
    let fixture: WCFixture
    let prediction: WCPrediction?
}

nonisolated struct WCStandingRow: Decodable, Identifiable, Hashable {
    let rank: Int
    let team: WCTeam
    let played: Int
    let win: Int
    let draw: Int
    let lose: Int
    let goalsFor: Int
    let goalsAgainst: Int
    let goalsDiff: Int
    let points: Int
    let form: String?

    var id: Int { team.id }
}

nonisolated struct WCGroup: Decodable, Identifiable, Hashable {
    let group: String
    let groupEn: String
    let rows: [WCStandingRow]

    var id: String { groupEn }
}

nonisolated struct WCSaudi: Decodable, Hashable {
    let next: WCFixture?
    let fixtures: [WCFixture]
    let group: WCGroup?
}

nonisolated struct WCOverview: Decodable, Hashable {
    let live: [WCFixture]
    let today: [WCFixture]
    let matchOfTheDay: WCMatchOfDay?
    let saudi: WCSaudi
    let updatedAt: String
}

nonisolated struct WCScorer: Decodable, Identifiable, Hashable {
    let rank: Int
    /// معرّف اللاعب عند المزود (مفتاح JSON: id) — يفتح بطاقة اللاعب؛ 0/null = غير معروف.
    /// معرّف Identifiable يبقى النصي المركّب لثبات ForEach مع صفوف بلا معرّف.
    let playerId: Int?
    let name: String
    let photo: String
    let team: WCTeam
    let goals: Int
    let assists: Int
    let penalties: Int
    let minutes: Int
    let matches: Int

    var id: String { "\(rank)-\(name)" }

    private enum CodingKeys: String, CodingKey {
        case playerId = "id"
        case rank, name, photo, team, goals, assists, penalties, minutes, matches
    }
}

nonisolated struct WCLeader: Decodable, Identifiable, Hashable {
    let rank: Int
    /// معرّف اللاعب عند المزود (مفتاح JSON: id) — يفتح بطاقة اللاعب؛ 0/null = غير معروف.
    let playerId: Int?
    let name: String
    let photo: String
    let team: WCTeam
    let goals: Int
    let assists: Int
    let yellow: Int
    let red: Int
    let minutes: Int
    let matches: Int

    var id: String { "\(rank)-\(name)" }

    private enum CodingKeys: String, CodingKey {
        case playerId = "id"
        case rank, name, photo, team, goals, assists, yellow, red, minutes, matches
    }
}

nonisolated struct WCMatchEvent: Decodable, Identifiable, Hashable {
    let minute: Int
    let extraMinute: Int?
    let teamId: Int
    let type: String
    let label: String
    let player: String
    let playerId: Int?
    let assist: String?
    let assistId: Int?

    var id: String { "\(minute)-\(extraMinute ?? 0)-\(type)-\(player)" }
}

nonisolated struct WCLineupPlayer: Decodable, Identifiable, Hashable {
    let id: Int
    let name: String
    let number: Int?
    let position: String?
    let grid: String?
}

nonisolated struct WCLineup: Decodable, Identifiable, Hashable {
    let teamId: Int
    let teamName: String
    let formation: String?
    let coach: String
    let startXI: [WCLineupPlayer]
    let substitutes: [WCLineupPlayer]

    var id: Int { teamId }
}

nonisolated struct WCStatistic: Decodable, Identifiable, Hashable {
    let key: String
    let label: String
    let home: String
    let away: String

    var id: String { key }
}

nonisolated struct WCPlayerRating: Decodable, Identifiable, Hashable {
    let id: Int
    let name: String
    let photo: String
    let teamId: Int
    let number: Int?
    let position: String
    let rating: Double
    let minutes: Int
    let goals: Int
    let assists: Int
    let captain: Bool
}

nonisolated struct WCMatchDetail: Decodable, Hashable {
    let fixture: WCFixture
    let events: [WCMatchEvent]
    let lineups: [WCLineup]
    let statistics: [WCStatistic]
    let prediction: WCPrediction?
    let ratings: [WCPlayerRating]
    let manOfTheMatch: WCPlayerRating?
    let headToHead: [WCFixture]
}

// MARK: - معطيات SportMonks المتقدّمة (ضغط/توقعات/إحصائيات+طقس+غيابات/xG)
//
// نقاط مكمّلة لـ /world-cup/match: pressure / forecast / match-facts / xg.
// كلها «أفضل جهد» — لو رجع الخادم 503/404 (غير مفعّل أو غير منشور بعد) يفشل
// فكّ الترميز فتبقى القيمة nil وتُخفى الأقسام دون أي عطل.

nonisolated struct WCPressurePoint: Decodable, Identifiable, Hashable {
    let label: String
    let minute: Int
    let home: Double
    let away: Double   // سالبة (تُرسم أسفل الصفر)
    let net: Double

    var id: Int { minute }
}

nonisolated struct WCPressureLatest: Decodable, Hashable {
    let side: String   // "home" | "away" | "even"
    let value: Double
}

nonisolated struct WCPressure: Decodable, Hashable {
    let available: Bool
    let live: Bool
    let latest: WCPressureLatest?
    let points: [WCPressurePoint]
}

nonisolated struct WCFulltimeOdds: Decodable, Hashable { let home: Int; let draw: Int; let away: Int }
nonisolated struct WCBtts: Decodable, Hashable { let yes: Int; let no: Int }
nonisolated struct WCDoubleChance: Decodable, Hashable {
    let homeOrDraw: Int; let awayOrDraw: Int; let homeOrAway: Int
}
nonisolated struct WCOverUnderLine: Decodable, Identifiable, Hashable {
    let line: Double; let over: Int; let under: Int
    var id: Double { line }
}
nonisolated struct WCCorrectScore: Decodable, Identifiable, Hashable {
    let score: String; let prob: Double   // "2-0" (المضيف-الضيف)
    var id: String { score }
}
nonisolated struct WCForecast: Decodable, Hashable {
    let available: Bool
    let fulltime: WCFulltimeOdds?
    let btts: WCBtts?
    let doubleChance: WCDoubleChance?
    let goals: [WCOverUnderLine]
    let correctScores: [WCCorrectScore]
}

nonisolated struct WCWeather: Decodable, Hashable {
    let type: String   // "actual" | "forecast"
    let temp: Int?
    let description: String
    let icon: String
    let humidity: String?
}
nonisolated struct WCAbsentee: Decodable, Identifiable, Hashable {
    let name: String; let location: String; let reason: String
    var id: String { "\(location)-\(name)" }
}
nonisolated struct WCEventDetail: Decodable, Identifiable, Hashable {
    let minute: Int; let location: String; let klass: String; let detail: String; let player: String
    var id: String { "\(klass)-\(location)-\(minute)" }
}
nonisolated struct WCHalftime: Decodable, Hashable { let home: Int; let away: Int }
nonisolated struct WCMatchFacts: Decodable, Hashable {
    let available: Bool
    let statistics: [WCStatistic]
    let weather: WCWeather?
    let absentees: [WCAbsentee]
    let eventDetails: [WCEventDetail]
    let halftime: WCHalftime?
}

nonisolated struct WCXgSide: Decodable, Hashable { let xg: Double; let xgot: Double }
nonisolated struct WCXgPlayer: Decodable, Identifiable, Hashable {
    let name: String; let location: String; let xg: Double
    var id: String { "\(location)-\(name)" }
}
nonisolated struct WCXg: Decodable, Hashable {
    let available: Bool
    let home: WCXgSide
    let away: WCXgSide
    let topPlayers: [WCXgPlayer]
}

// MARK: - نبض المباراة (/world-cup/pulse/:id)
//
// حزمة خفيفة بنداء واحد للودجت الحيّ: نتيجة/دقيقة لحظية + زخم + آخر VAR.
// home/away هنا اسم+شعار فقط (بلا id/winner)، وstatus بلا code — فلا تُعاد
// استخدام WCTeam/WCStatus بل بُنى مخصّصة تطابق حِمل الخادم حرفيًا.

nonisolated struct WCPulseSide: Decodable, Hashable { let name: String; let logo: String }
nonisolated struct WCPulseScore: Decodable, Hashable { let home: Int; let away: Int }
nonisolated struct WCPulseStatus: Decodable, Hashable {
    let live: Bool
    let finished: Bool
    let elapsed: Int?
    let extra: Int?
    let label: String
}
nonisolated struct WCPulseMomentum: Decodable, Hashable {
    let home: Int
    let away: Int
    let leader: String?   // "home" | "away" | null
    let value: Int
}
nonisolated struct WCPulseVar: Decodable, Hashable {
    let minute: Int
    let team: String      // "home" | "away"
}
nonisolated struct WCPulse: Decodable, Hashable {
    let id: Int
    let home: WCPulseSide
    let away: WCPulseSide
    let score: WCPulseScore
    let status: WCPulseStatus
    let kickoff: String
    let timestamp: Int
    let round: String
    let momentum: WCPulseMomentum
    let lastVar: WCPulseVar?

    var kickoffDate: Date? { SabqFormatters.parseISO8601(kickoff) }
}

// MARK: - فورمة اللاعب الأخيرة + xG (/world-cup/player/:id/form)
//
// آخر ٥ مباريات (الجسر بالاسم الإنجليزي+الميلاد على الخادم — iOS يستهلك فقط).
// الخصم نصّ + شعار نصّ (لا WCTeam)؛ xg/rating قد تكون null.

nonisolated struct WCFormMatch: Decodable, Identifiable, Hashable {
    let date: String
    let opponent: String
    let opponentLogo: String
    let homeAway: String   // "home" | "away"
    let result: String     // "W" | "D" | "L"
    let scoreFor: Int
    let scoreAgainst: Int
    let xg: Double?
    let goals: Int
    let rating: Double?
    let league: String

    var id: String { "\(date)-\(opponent)" }
}

nonisolated struct WCPlayerForm: Decodable, Hashable {
    let available: Bool
    let matches: [WCFormMatch]
}

nonisolated struct WCSquadPlayer: Decodable, Identifiable, Hashable {
    let id: Int
    let name: String
    let number: Int?
    let position: String
    let positionEn: String
    let age: Int?
    let photo: String
}

nonisolated struct WCSquad: Decodable, Hashable {
    let team: WCTeam
    let players: [WCSquadPlayer]
}

// MARK: - صفحة المنتخب المتكاملة (/world-cup/team/:id)
//
// تجمّع الخادم لكل ما يخص منتخبًا واحدًا: هويته + مجموعته وترتيبها +
// كل مبارياته (منتهية/مباشرة/قادمة) + قائمته الكاملة + المدرّب.

nonisolated struct WCTeamProfile: Decodable, Hashable {
    let team: WCTeam
    let isSaudi: Bool
    /// المدرّب الحالي — null إن لم يوفّره المزود
    let coach: String?
    /// مجموعة المنتخب كاملة (لتظليل صفّه) — null قبل اعتماد القرعة/الجداول
    let group: WCGroup?
    let fixtures: [WCFixture]
    let squad: [WCSquadPlayer]
}

// MARK: - بطاقة اللاعب الشاملة (/world-cup/player/:id)

nonisolated struct WCPlayerCareerStop: Decodable, Identifiable, Hashable {
    let teamId: Int
    let team: String
    let logo: String
    let seasons: [Int]

    var id: String { "\(teamId)-\(team)" }

    /// [2019..2025] → "2019–2025"، وموسم واحد يُعرض مفردًا
    var seasonsLabel: String {
        guard let first = seasons.first, let last = seasons.last else { return "" }
        return first == last ? "\(first)" : "\(first)–\(last)"
    }
}

nonisolated struct WCPlayerTrophy: Decodable, Identifiable, Hashable {
    let competition: String
    let country: String
    let season: String
    let place: String
    let winner: Bool

    var id: String { "\(competition)-\(country)-\(season)-\(place)" }
}

nonisolated struct WCPlayerTournamentStats: Decodable, Hashable {
    let matches: Int
    let lineups: Int
    let minutes: Int
    let rating: Double?
    let goals: Int
    let assists: Int
    let shots: Int
    let shotsOn: Int
    let passes: Int
    let keyPasses: Int
    let dribblesAttempts: Int
    let dribblesSuccess: Int
    let tackles: Int
    let yellow: Int
    let red: Int
    let saves: Int
    let conceded: Int
    let penaltiesScored: Int
    let penaltiesMissed: Int
}

nonisolated struct WCPlayerInjury: Decodable, Hashable {
    let reason: String
}

nonisolated struct WCPlayerCard: Decodable, Hashable {
    let id: Int
    let name: String
    /// الاسم الرسمي الكامل — null عندما لا يضيف شيئًا على الاسم المعروض
    let fullName: String?
    let photo: String
    let position: String
    let positionEn: String
    let number: Int?
    let age: Int?
    let birthDate: String?
    /// "الرياض، السعودية" — جاهز للعرض من الخادم
    let birthPlace: String?
    let height: Int?
    let weight: Int?
    let career: [WCPlayerCareerStop]
    let trophies: [WCPlayerTrophy]
    /// أرقام اللاعب التراكمية في مونديال 2026 — null قبل اعتماد المزود لها
    let stats: WCPlayerTournamentStats?
    let injury: WCPlayerInjury?
}

// MARK: - Response envelopes

private nonisolated struct WCFixturesResponse: Decodable { let fixtures: [WCFixture] }
private nonisolated struct WCStandingsResponse: Decodable { let groups: [WCGroup] }
private nonisolated struct WCScorersResponse: Decodable { let scorers: [WCScorer] }
private nonisolated struct WCLeadersResponse: Decodable { let leaders: [WCLeader] }
private nonisolated struct WCTeamsResponse: Decodable { let teams: [WCTeam] }

// MARK: - APIClient — World Cup reads
//
// كل النقاط عامة (لا مصادقة) فتُمرَّر عبر apiRoot=publicAPI بدل
// الافتراضي mobileAPI(/api/v1). الكاش على الخادم يخدم آلاف الزوار من طلب
// واحد، لذا لا نضيف كاشًا محليًا غير افتراضي URLSession.

extension APIClient {
    func fetchWorldCupOverview(ignoreCache: Bool = false) async throws -> WCOverview {
        try await get(WCOverview.self, path: "/world-cup/overview",
                      ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI)
    }

    func fetchWorldCupFixtures(ignoreCache: Bool = false) async throws -> [WCFixture] {
        try await get(WCFixturesResponse.self, path: "/world-cup/fixtures",
                      ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI).fixtures
    }

    func fetchWorldCupStandings(ignoreCache: Bool = false) async throws -> [WCGroup] {
        try await get(WCStandingsResponse.self, path: "/world-cup/standings",
                      ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI).groups
    }

    func fetchWorldCupScorers(ignoreCache: Bool = false) async throws -> [WCScorer] {
        try await get(WCScorersResponse.self, path: "/world-cup/scorers",
                      ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI).scorers
    }

    func fetchWorldCupAssists() async throws -> [WCLeader] {
        try await get(WCLeadersResponse.self, path: "/world-cup/assists",
                      apiRoot: URLConstants.publicAPI).leaders
    }

    func fetchWorldCupCards() async throws -> [WCLeader] {
        try await get(WCLeadersResponse.self, path: "/world-cup/cards",
                      apiRoot: URLConstants.publicAPI).leaders
    }

    func fetchWorldCupTeams() async throws -> [WCTeam] {
        try await get(WCTeamsResponse.self, path: "/world-cup/teams",
                      apiRoot: URLConstants.publicAPI).teams
    }

    func fetchWorldCupSquad(teamId: Int) async throws -> WCSquad {
        try await get(WCSquad.self, path: "/world-cup/squad/\(teamId)",
                      apiRoot: URLConstants.publicAPI)
    }

    func fetchWorldCupTeamProfile(teamId: Int, ignoreCache: Bool = false) async throws -> WCTeamProfile {
        try await get(WCTeamProfile.self, path: "/world-cup/team/\(teamId)",
                      ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI)
    }

    func fetchWorldCupMatch(fixtureId: Int, ignoreCache: Bool = false) async throws -> WCMatchDetail {
        try await get(WCMatchDetail.self, path: "/world-cup/match/\(fixtureId)",
                      ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI)
    }

    func fetchWorldCupPlayer(playerId: Int) async throws -> WCPlayerCard {
        try await get(WCPlayerCard.self, path: "/world-cup/player/\(playerId)",
                      apiRoot: URLConstants.publicAPI)
    }

    // معطيات SportMonks المتقدّمة — كلها عامة وأفضل جهد

    func fetchWorldCupPressure(fixtureId: Int, ignoreCache: Bool = false) async throws -> WCPressure {
        try await get(WCPressure.self, path: "/world-cup/pressure/\(fixtureId)",
                      ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI)
    }

    func fetchWorldCupForecast(fixtureId: Int, ignoreCache: Bool = false) async throws -> WCForecast {
        try await get(WCForecast.self, path: "/world-cup/forecast/\(fixtureId)",
                      ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI)
    }

    func fetchWorldCupMatchFacts(fixtureId: Int, ignoreCache: Bool = false) async throws -> WCMatchFacts {
        try await get(WCMatchFacts.self, path: "/world-cup/match-facts/\(fixtureId)",
                      ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI)
    }

    func fetchWorldCupXg(fixtureId: Int, ignoreCache: Bool = false) async throws -> WCXg {
        try await get(WCXg.self, path: "/world-cup/xg/\(fixtureId)",
                      ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI)
    }

    func fetchWorldCupPulse(fixtureId: Int, ignoreCache: Bool = false) async throws -> WCPulse {
        try await get(WCPulse.self, path: "/world-cup/pulse/\(fixtureId)",
                      ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI)
    }

    func fetchWorldCupPlayerForm(playerId: Int) async throws -> WCPlayerForm {
        try await get(WCPlayerForm.self, path: "/world-cup/player/\(playerId)/form",
                      apiRoot: URLConstants.publicAPI)
    }
}

// MARK: - World Cup shared helpers (theme, formatting, navigation)

nonisolated enum WCTheme {
    static let saudiId = 23

    // ثيم الملعب الليلي — أخضر زمردي ثابت عبر الوضعين (الهيرو دائمًا داكن)
    static let stadiumTop = Color(red: 0.02, green: 0.15, blue: 0.11)
    static let stadiumBottom = Color(red: 0.02, green: 0.22, blue: 0.16)
    static let emerald = Color(red: 0.20, green: 0.83, blue: 0.60)
    static let emeraldDeep = Color(red: 0.06, green: 0.50, blue: 0.36)
    static let pitchTop = Color(red: 0.13, green: 0.55, blue: 0.35)
    static let pitchBottom = Color(red: 0.09, green: 0.42, blue: 0.27)
    static let liveRed = Color(red: 0.90, green: 0.22, blue: 0.22)
    static let sky = Color(red: 0.35, green: 0.66, blue: 0.96)
    static let gold = Color(red: 0.92, green: 0.68, blue: 0.20)
    static let leaf = Color(red: 0.40, green: 0.73, blue: 0.22)

    // لوحة الوضع الداكن الموحّدة للقسم كله (ثيم الملعب الليلي بلا أبيض مزعج)
    static let card = Color.white.opacity(0.06)
    static let cardStroke = Color.white.opacity(0.10)
    static let onDark = Color.white
    static let onDarkDim = Color.white.opacity(0.62)
    static let chipFill = Color.white.opacity(0.10)

    /// خلفية القسم — تدرّج ملعب ليلي عمودي ثابت عبر الوضعين.
    static var sectionBackground: LinearGradient {
        LinearGradient(
            colors: [stadiumTop, Color(red: 0.03, green: 0.18, blue: 0.13), stadiumBottom],
            startPoint: .top, endPoint: .bottom
        )
    }
}

nonisolated enum WCFormat {
    /// "1:00 ص" بتوقيت الرياض (12-ساعة عربي بأرقام لاتينية).
    /// ca-gregory ضروري: ar_SA يفترض التقويم الهجري افتراضيًا.
    static let timeRiyadh: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "ar_SA-u-ca-gregory-nu-latn")
        f.timeZone = TimeZone(identifier: "Asia/Riyadh")
        f.dateFormat = "h:mm a"
        return f
    }()

    /// "الأحد، 14 يونيو" (ميلادي — ca-gregory يمنع التحول للهجري)
    static let dayRiyadh: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "ar_SA-u-ca-gregory-nu-latn")
        f.timeZone = TimeZone(identifier: "Asia/Riyadh")
        f.dateFormat = "EEEE، d MMMM"
        return f
    }()

    static func time(_ fixture: WCFixture) -> String {
        guard let d = fixture.kickoff else { return "" }
        return timeRiyadh.string(from: d)
    }

    static func day(_ fixture: WCFixture) -> String {
        guard let d = fixture.kickoff else { return "" }
        return dayRiyadh.string(from: d)
    }

    /// مفتاح اليوم بتوقيت الرياض من سلسلة ISO (تصل بإزاحة +03:00 فالقص مباشر)
    static func dayKey(_ iso: String) -> String { String(iso.prefix(10)) }

    static func todayKey() -> String {
        let riyadh = Date().addingTimeInterval(3 * 3600)
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone(identifier: "UTC")
        f.dateFormat = "yyyy-MM-dd"
        return f.string(from: riyadh)
    }

    /// عدّ تنازلي عربي سليم: يوم/يومين/3 أيام، ساعة/ساعتين، أو HH:MM:SS في آخر يوم
    static func countdown(to timestamp: Int) -> String {
        let total = max(0, Double(timestamp) - Date().timeIntervalSince1970)
        let days = Int(total) / 86_400
        let hours = (Int(total) % 86_400) / 3_600
        let minutes = (Int(total) % 3_600) / 60
        let seconds = Int(total) % 60
        if days == 0 {
            return String(format: "%02d:%02d:%02d", hours, minutes, seconds)
        }
        let d = arabicDays(days)
        return hours > 0 ? "\(d) و\(arabicHours(hours))" : d
    }

    static func arabicDays(_ n: Int) -> String {
        switch n {
        case 1: return "يوم"
        case 2: return "يومين"
        case 3...10: return "\(n) أيام"
        default: return "\(n) يومًا"
        }
    }

    static func arabicHours(_ n: Int) -> String {
        switch n {
        case 1: return "ساعة"
        case 2: return "ساعتين"
        case 3...10: return "\(n) ساعات"
        default: return "\(n) ساعة"
        }
    }
}

/// مسار التنقل لقسم كأس العالم
nonisolated struct WorldCupRoute: Hashable {}
