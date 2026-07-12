import Foundation
import SwiftUI

// MARK: - كأس آسيا 2027 — DTOs
//
// مرآة لما ترسله نقاط /api/asian-cup/* (مُعرَّبة من الخادم). الـ JSON يصل
// بصيغة camelCase نظيفة، والـ decoder المشترك في APIClient عادي بلا
// keyDecodingStrategy، فالأسماء هنا تطابق المفاتيح حرفيًا. الحقول التي قد
// تكون null في الخادم optional هنا. التواريخ تبقى نصًا وتُحلَّل بـ
// SabqFormatters.parseISO8601 عند العرض. تُبدأ الأنواع بـ Ac لتفادي الاصطدام
// مع نظيرات المونديال WC*. البطولة في يناير 2027 (وضع عدّ تنازلي/معاينة الآن).

nonisolated struct AcTeam: Decodable, Identifiable, Hashable {
    let id: Int
    let name: String
    /// الاسم اللاتيني — يصل من بعض النقاط، وقد يغيب في الشعارات المختصرة.
    let nameEn: String?
    let logo: String
    /// تصنيف فيفا — يصل فقط من /asian-cup/teams المُرتّبة.
    let fifaRank: Int?
}

nonisolated struct AcStatus: Decodable, Hashable {
    let code: String
    let label: String
    let elapsed: Int?
    let live: Bool
    let finished: Bool
}

nonisolated struct AcScore: Decodable, Hashable {
    let home: Int?
    let away: Int?
}

nonisolated struct AcVenue: Decodable, Hashable {
    let name: String
    let city: String
}

nonisolated struct AcFixture: Decodable, Identifiable, Hashable {
    let id: Int
    let date: String
    let timestamp: Int
    let status: AcStatus
    let round: String
    let roundEn: String
    let venue: AcVenue
    let home: AcTeam
    let away: AcTeam
    let goals: AcScore

    var started: Bool { status.live || status.finished }
    var kickoff: Date? { SabqFormatters.parseISO8601(date) }
}

nonisolated struct AcStandingRow: Decodable, Identifiable, Hashable {
    let rank: Int
    let team: AcTeam
    let played: Int
    let win: Int
    let draw: Int
    let lose: Int
    let goalsFor: Int
    let goalsAgainst: Int
    let goalsDiff: Int
    let points: Int
    /// صفّ يتأثّر بمباراة جارية (ترتيب مبدئي لحظي).
    let live: Bool?
    /// حراك المركز اللحظي: موجب = صعد، سالب = هبط.
    let liveDelta: Int?

    var id: Int { team.id }
}

nonisolated struct AcGroup: Decodable, Identifiable, Hashable {
    let name: String
    let rows: [AcStandingRow]

    var id: String { name }
}

/// بطل البطولة بعد حسم النهائي (أو المعيَّن يدويًا). النتائج بترتيب «الفائز
/// أولًا» من الخادم فلا تنقلب بصريًّا في RTL. team/runnerUp بلا nameEn/fifaRank
/// (بُنى مختصرة) لكن AcTeam يقبلها لأن الحقلين اختياريان.
nonisolated struct AcChampion: Decodable, Hashable {
    let team: AcTeam
    let runnerUp: AcTeam?
    let score: String?
    let penalties: String?
    let decidedAt: String?
    let source: String
}

nonisolated struct AcSaudi: Decodable, Hashable {
    let team: AcTeam?
    let group: String?
    let fixtures: [AcFixture]
}

nonisolated struct AcOverview: Decodable, Hashable {
    /// يبدأ من أوّل مباراة (ISO، توقيت الرياض) — الواجهة تبني العدّ التنازلي منه.
    let startsAt: String?
    let endsAt: String?
    let teamsCount: Int
    let groupsCount: Int
    let host: String
    let venues: [AcVenue]
    let started: Bool
    let saudi: AcSaudi
    let nextMatch: AcFixture?
    /// true عندما يُطفأ البلوك من لوحة التحكم — الشريط كله يختفي (مثل الويب).
    let blockHidden: Bool?
    /// بطل البطولة بعد حسم النهائي — nil قبل ذلك.
    let champion: AcChampion?
}

// MARK: - السباقات (هدافون / صنّاع / بطاقات)

nonisolated struct AcScorer: Decodable, Identifiable, Hashable {
    let rank: Int
    /// معرّف اللاعب عند المزوّد (مفتاح JSON: id) — 0 = غير معروف.
    let playerId: Int
    let name: String
    let nameEn: String
    let photo: String
    let team: AcTeam
    let goals: Int
    let assists: Int
    let penalties: Int
    let minutes: Int
    let matches: Int

    var id: String { "\(rank)-\(name)" }

    private enum CodingKeys: String, CodingKey {
        case playerId = "id"
        case rank, name, nameEn, photo, team, goals, assists, penalties, minutes, matches
    }
}

nonisolated struct AcLeader: Decodable, Identifiable, Hashable {
    let rank: Int
    let playerId: Int
    let name: String
    let nameEn: String
    let photo: String
    let team: AcTeam
    let goals: Int
    let assists: Int
    let yellow: Int
    let red: Int
    let minutes: Int
    let matches: Int

    var id: String { "\(rank)-\(name)" }

    private enum CodingKeys: String, CodingKey {
        case playerId = "id"
        case rank, name, nameEn, photo, team, goals, assists, yellow, red, minutes, matches
    }
}

// MARK: - شجرة الأدوار الإقصائية

nonisolated struct AcBracketRound: Decodable, Identifiable, Hashable {
    let round: String
    let roundEn: String
    let matches: [AcFixture]

    var id: String { roundEn }
}

nonisolated struct AcBracket: Decodable, Hashable {
    let source: String
    let rounds: [AcBracketRound]
}

// MARK: - صفحة المنتخب + القائمة

nonisolated struct AcSquadPlayer: Decodable, Identifiable, Hashable {
    let id: Int
    let name: String
    let nameEn: String
    let number: Int?
    let position: String
    let positionEn: String
    let age: Int?
    let photo: String
}

nonisolated struct AcFifaRank: Decodable, Hashable {
    let rank: Int
    let points: Double?
    let change: Int?
}

nonisolated struct AcSeasonStatItem: Decodable, Identifiable, Hashable {
    let label: String
    let value: Double
    let percent: Bool?

    var id: String { label }
    var display: String {
        if percent == true { return "\(Int(value))%" }
        return value == value.rounded() ? "\(Int(value))" : String(format: "%.1f", value)
    }
}

nonisolated struct AcTeamSeasonStats: Decodable, Hashable {
    let available: Bool
    let matches: Int
    let items: [AcSeasonStatItem]
}

nonisolated struct AcTeamStats: Decodable, Hashable {
    let groupName: String?
    let rank: Int?
    let played: Int
    let win: Int
    let draw: Int
    let lose: Int
    let goalsFor: Int
    let goalsAgainst: Int
    let goalsDiff: Int
    let points: Int
    let form: [String]
}

nonisolated struct AcTeamProfile: Decodable, Hashable {
    let team: AcTeam
    let isSaudi: Bool
    let coach: String?
    let group: AcGroup?
    let stats: AcTeamStats?
    let nextMatch: AcFixture?
    let fixtures: [AcFixture]
    let squad: [AcSquadPlayer]
    let fifaRank: AcFifaRank?
    let seasonStats: AcTeamSeasonStats?
}

// MARK: - بطاقة اللاعب الشاملة

nonisolated struct AcPlayerCareerStop: Decodable, Identifiable, Hashable {
    let teamId: Int
    let team: String
    let logo: String
    let seasons: [Int]

    var id: String { "\(teamId)-\(seasons.first ?? 0)-\(seasons.last ?? 0)" }

    var seasonsLabel: String {
        guard let first = seasons.first, let last = seasons.last else { return "" }
        return first == last ? "\(first)" : "\(first)–\(last)"
    }
}

nonisolated struct AcPlayerTrophy: Decodable, Identifiable, Hashable {
    let competition: String
    let country: String
    let season: String
    let place: String
    let winner: Bool

    var id: String { "\(competition)-\(season)-\(place)" }
}

nonisolated struct AcPlayerTournamentStats: Decodable, Hashable {
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
    let tackles: Int
    let yellow: Int
    let red: Int
    let saves: Int
    let conceded: Int
    let penaltiesScored: Int
    let penaltiesMissed: Int
}

/// القيمة السوقية المضمّنة في بطاقة اللاعب — value بالعملة (عدد صحيح).
nonisolated struct AcPlayerMarket: Decodable, Hashable {
    let available: Bool
    let value: Int?
    let currency: String
    let source: String?
    let history: [AcMarketPoint]
}

nonisolated struct AcPlayerSourceFlags: Decodable, Hashable {
    let apiFootball: Bool
    let theSports: Bool
}

nonisolated struct AcPlayerInjury: Decodable, Hashable {
    let reason: String
}

nonisolated struct AcPlayerCard: Decodable, Hashable {
    let id: Int
    let name: String
    let fullName: String?
    let photo: String
    let nationality: String?
    let position: String
    let positionEn: String
    let number: Int?
    let age: Int?
    let birthDate: String?
    let birthPlace: String?
    let height: Int?
    let weight: Int?
    let currentTeam: AcTeam?
    let career: [AcPlayerCareerStop]
    let trophies: [AcPlayerTrophy]
    let stats: AcPlayerTournamentStats?
    let injury: AcPlayerInjury?
    let market: AcPlayerMarket?
    let sources: AcPlayerSourceFlags?
}

// MARK: - القيمة السوقية العامة (/asian-cup/player/:id/market)

nonisolated struct AcMarketPoint: Decodable, Identifiable, Hashable {
    let time: Int
    let value: Double

    var id: Int { time }
    var date: Date { Date(timeIntervalSince1970: TimeInterval(time)) }
}

nonisolated struct AcPlayerMarketPublic: Decodable, Hashable {
    let available: Bool
    let marketValue: Double?
    let currency: String
    let history: [AcMarketPoint]
}

// MARK: - فورمة اللاعب الأخيرة (/asian-cup/player/:id/form)

nonisolated struct AcFormMatch: Decodable, Identifiable, Hashable {
    let opponent: String
    let date: String?
    let goals: Int
    let assists: Int
    let minutes: Int
    let rating: Double?
    let xg: Double?

    var id: String { "\(date ?? "")-\(opponent)" }
}

nonisolated struct AcPlayerForm: Decodable, Hashable {
    let available: Bool
    let matches: [AcFormMatch]
}

// MARK: - تفاصيل المباراة

nonisolated struct AcMatchEvent: Decodable, Identifiable, Hashable {
    let minute: Int
    let extraMinute: Int?
    let teamId: Int
    let type: String
    let label: String
    let detail: String?
    let player: String
    let playerId: Int?
    let assist: String?
    let assistId: Int?

    var id: String { "\(minute)-\(extraMinute ?? 0)-\(type)-\(player)" }
}

nonisolated struct AcLineupPlayer: Decodable, Identifiable, Hashable {
    let id: Int
    let name: String
    let number: Int?
    let position: String?
    let grid: String?
}

nonisolated struct AcLineup: Decodable, Identifiable, Hashable {
    let teamId: Int
    let teamName: String
    let formation: String?
    let coach: String
    let startXI: [AcLineupPlayer]
    let substitutes: [AcLineupPlayer]

    var id: Int { teamId }
}

nonisolated struct AcStatistic: Decodable, Identifiable, Hashable {
    let key: String
    let label: String
    let home: String
    let away: String

    var id: String { key }
}

nonisolated struct AcPlayerRating: Decodable, Identifiable, Hashable {
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

nonisolated struct AcMatchPrediction: Decodable, Hashable {
    let home: Int
    let draw: Int
    let away: Int
}

nonisolated struct AcTvChannel: Decodable, Identifiable, Hashable {
    let name: String
    let country: String?
    let url: String?
    let logo: String?

    var id: String { "\(name)-\(country ?? "")" }
}

nonisolated struct AcMatchDetail: Decodable, Hashable {
    let fixture: AcFixture
    let events: [AcMatchEvent]
    let lineups: [AcLineup]
    let statistics: [AcStatistic]
    let ratings: [AcPlayerRating]
    let manOfTheMatch: AcPlayerRating?
    let prediction: AcMatchPrediction?
    let headToHead: [AcFixture]
    let tv: [AcTvChannel]?
}

// MARK: - معطيات متقدّمة (زخم/ضغط/تعليق/معطيات/xG) — أفضل جهد، تُخفى عند الغياب

nonisolated struct AcMomentumPoint: Decodable, Identifiable, Hashable {
    let label: String
    let minute: Int
    let home: Double
    let away: Double
    let net: Double

    var id: Int { minute }
}

nonisolated struct AcPossession: Decodable, Hashable {
    let home: Int
    let away: Int
}

nonisolated struct AcMomentum: Decodable, Hashable {
    let available: Bool
    let live: Bool
    let possession: AcPossession?
    let points: [AcMomentumPoint]
}

nonisolated struct AcPressureLatest: Decodable, Hashable {
    let side: String
    let value: Double
}

nonisolated struct AcPressure: Decodable, Hashable {
    let available: Bool
    let live: Bool
    let latest: AcPressureLatest?
    let points: [AcMomentumPoint]
}

nonisolated struct AcCommentaryItem: Decodable, Identifiable, Hashable {
    let minute: Int
    let extraMinute: Int?
    let goal: Bool
    let important: Bool
    let textAr: String
    let textEn: String
    let order: Int

    var id: String { "\(order)-\(minute)-\(extraMinute ?? 0)" }
    var minuteLabel: String { "\(minute)'\(extraMinute.map { "+\($0)" } ?? "")" }
}

nonisolated struct AcCommentary: Decodable, Hashable {
    let available: Bool
    let live: Bool
    let items: [AcCommentaryItem]
}

nonisolated struct AcWeather: Decodable, Hashable {
    let type: String
    let temp: Int?
    let description: String
    let icon: String
    let humidity: String?
}

nonisolated struct AcAbsentee: Decodable, Identifiable, Hashable {
    let name: String
    let location: String
    let reason: String

    var id: String { "\(location)-\(name)" }
}

nonisolated struct AcEventDetail: Decodable, Hashable {
    let klass: String
    let location: String
    let minute: Int
    let detail: String?
}

nonisolated struct AcHalftime: Decodable, Hashable {
    let home: Int
    let away: Int
}

nonisolated struct AcMatchFacts: Decodable, Hashable {
    let available: Bool
    let statistics: [AcStatistic]
    let weather: AcWeather?
    let absentees: [AcAbsentee]
    let eventDetails: [AcEventDetail]?
    let halftime: AcHalftime?
}

nonisolated struct AcXgSide: Decodable, Hashable {
    let xg: Double
    let xgot: Double
}

nonisolated struct AcXgPlayer: Decodable, Identifiable, Hashable {
    let name: String
    let location: String
    let xg: Double

    var id: String { "\(location)-\(name)" }
}

nonisolated struct AcXg: Decodable, Hashable {
    let available: Bool
    let home: AcXgSide?
    let away: AcXgSide?
    let topPlayers: [AcXgPlayer]?
}

nonisolated struct AcForecast: Decodable, Hashable {
    let available: Bool
    let home: Int
    let draw: Int
    let away: Int
}

nonisolated struct AcTvListing: Decodable, Hashable {
    let available: Bool
    let channels: [AcTvChannel]
}

// MARK: - حقائق البطولة

nonisolated struct AcFacts: Decodable, Hashable {
    nonisolated struct TitleHolder: Decodable, Hashable {
        let name: String
        let titles: Int?
    }
    nonisolated struct MostTitles: Decodable, Hashable {
        let names: [String]
        let titles: Int?
    }

    let available: Bool
    let titleHolder: TitleHolder?
    let mostTitles: MostTitles?
    let host: String?

    /// هل توجد أي حقيقة لعرضها أصلًا؟
    var hasContent: Bool {
        titleHolder != nil || mostTitles != nil || (host?.isEmpty == false)
    }
}

// MARK: - Response envelopes

private nonisolated struct AcTeamsResponse: Decodable { let teams: [AcTeam] }
private nonisolated struct AcFixturesResponse: Decodable { let fixtures: [AcFixture] }
private nonisolated struct AcStandingsResponse: Decodable { let groups: [AcGroup] }
private nonisolated struct AcScorersResponse: Decodable { let scorers: [AcScorer] }
private nonisolated struct AcLeadersResponse: Decodable { let leaders: [AcLeader] }

// MARK: - APIClient — Asian Cup reads
//
// كل النقاط عامة (لا مصادقة) فتُمرَّر عبر apiRoot=publicAPI. الكاش على الخادم
// يخدم الزوار من طلب واحد. المتابعة/التنبيهات تعاد استخدام دوال الرياضة الموحّدة
// (fetchSportsFollows/addSportsFollow/...) الموجودة أصلًا في APIClient.

extension APIClient {
    func fetchAsianCupOverview(ignoreCache: Bool = false) async throws -> AcOverview {
        try await get(AcOverview.self, path: "/asian-cup/overview",
                      ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI)
    }

    func fetchAsianCupFixtures(ignoreCache: Bool = false) async throws -> [AcFixture] {
        try await get(AcFixturesResponse.self, path: "/asian-cup/fixtures",
                      ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI).fixtures
    }

    func fetchAsianCupStandings(ignoreCache: Bool = false) async throws -> [AcGroup] {
        try await get(AcStandingsResponse.self, path: "/asian-cup/standings",
                      ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI).groups
    }

    func fetchAsianCupScorers(ignoreCache: Bool = false) async throws -> [AcScorer] {
        try await get(AcScorersResponse.self, path: "/asian-cup/scorers",
                      ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI).scorers
    }

    func fetchAsianCupAssists() async throws -> [AcLeader] {
        try await get(AcLeadersResponse.self, path: "/asian-cup/assists",
                      apiRoot: URLConstants.publicAPI).leaders
    }

    func fetchAsianCupCards() async throws -> [AcLeader] {
        try await get(AcLeadersResponse.self, path: "/asian-cup/cards",
                      apiRoot: URLConstants.publicAPI).leaders
    }

    func fetchAsianCupTeams() async throws -> [AcTeam] {
        try await get(AcTeamsResponse.self, path: "/asian-cup/teams",
                      apiRoot: URLConstants.publicAPI).teams
    }

    func fetchAsianCupBracket(ignoreCache: Bool = false) async throws -> AcBracket {
        try await get(AcBracket.self, path: "/asian-cup/bracket",
                      ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI)
    }

    func fetchAsianCupFacts(ignoreCache: Bool = false) async throws -> AcFacts {
        try await get(AcFacts.self, path: "/asian-cup/facts",
                      ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI)
    }

    func fetchAsianCupTeamProfile(teamId: Int, ignoreCache: Bool = false) async throws -> AcTeamProfile {
        try await get(AcTeamProfile.self, path: "/asian-cup/team/\(teamId)",
                      ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI)
    }

    func fetchAsianCupMatch(fixtureId: Int, ignoreCache: Bool = false) async throws -> AcMatchDetail {
        try await get(AcMatchDetail.self, path: "/asian-cup/match/\(fixtureId)",
                      ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI)
    }

    func fetchAsianCupPlayer(playerId: Int) async throws -> AcPlayerCard {
        try await get(AcPlayerCard.self, path: "/asian-cup/player/\(playerId)",
                      apiRoot: URLConstants.publicAPI)
    }

    func fetchAsianCupPlayerForm(playerId: Int) async throws -> AcPlayerForm {
        try await get(AcPlayerForm.self, path: "/asian-cup/player/\(playerId)/form",
                      apiRoot: URLConstants.publicAPI)
    }

    func fetchAsianCupPlayerMarket(playerId: Int) async throws -> AcPlayerMarketPublic {
        try await get(AcPlayerMarketPublic.self, path: "/asian-cup/player/\(playerId)/market",
                      apiRoot: URLConstants.publicAPI)
    }

    func fetchAsianCupMomentum(fixtureId: Int, ignoreCache: Bool = false) async throws -> AcMomentum {
        try await get(AcMomentum.self, path: "/asian-cup/momentum/\(fixtureId)",
                      ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI)
    }

    func fetchAsianCupPressure(fixtureId: Int, ignoreCache: Bool = false) async throws -> AcPressure {
        try await get(AcPressure.self, path: "/asian-cup/pressure/\(fixtureId)",
                      ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI)
    }

    func fetchAsianCupCommentary(fixtureId: Int, ignoreCache: Bool = false) async throws -> AcCommentary {
        try await get(AcCommentary.self, path: "/asian-cup/commentary/\(fixtureId)",
                      ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI)
    }

    func fetchAsianCupMatchFacts(fixtureId: Int, ignoreCache: Bool = false) async throws -> AcMatchFacts {
        try await get(AcMatchFacts.self, path: "/asian-cup/match-facts/\(fixtureId)",
                      ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI)
    }

    func fetchAsianCupXg(fixtureId: Int, ignoreCache: Bool = false) async throws -> AcXg {
        try await get(AcXg.self, path: "/asian-cup/xg/\(fixtureId)",
                      ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI)
    }

    func fetchAsianCupForecast(fixtureId: Int, ignoreCache: Bool = false) async throws -> AcForecast {
        try await get(AcForecast.self, path: "/asian-cup/forecast/\(fixtureId)",
                      ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI)
    }

    func fetchAsianCupTv(fixtureId: Int) async throws -> AcTvListing {
        try await get(AcTvListing.self, path: "/asian-cup/match/\(fixtureId)/tv",
                      apiRoot: URLConstants.publicAPI)
    }
}

// MARK: - ثيم كأس آسيا (تركوازي/ذهبي) — يطابق بنية WCTheme لتوحيد لغة التصميم
//
// جسم الصفحة والبطاقات القياسية «تكيّفية» تتبع نمط النظام؛ والبطاقات المميّزة
// (الهيرو، الملعب) تبقى تركوازية داكنة ثابتة في الوضعين (نصوصها بيضاء).

nonisolated enum AcTheme {
    static let saudiId = 23

    private static func dyn(
        _ light: (CGFloat, CGFloat, CGFloat, CGFloat),
        _ dark: (CGFloat, CGFloat, CGFloat, CGFloat)
    ) -> Color {
        Color(uiColor: UIColor { tc in
            let c = tc.userInterfaceStyle == .dark ? dark : light
            return UIColor(red: c.0, green: c.1, blue: c.2, alpha: c.3)
        })
    }

    // ── علامة كأس آسيا: تركوازي + ذهبي ──
    static let royal = Color(red: 0.03, green: 0.42, blue: 0.52)
    static let azure = Color(red: 0.12, green: 0.66, blue: 0.74)
    static let liveRed = Color(red: 0.93, green: 0.26, blue: 0.30)
    static let sky = Color(red: 0.20, green: 0.55, blue: 0.85)   // أزرق (الضيف/سلسلة ثانية)
    static let gold = Color(red: 0.96, green: 0.72, blue: 0.20)
    static let leaf = Color(red: 0.30, green: 0.76, blue: 0.70)

    static let emerald = azure
    static let emeraldDeep = dyn((0.03, 0.40, 0.48, 1), (0.24, 0.74, 0.82, 1))

    // ── الهيرو + شريط التنقّل ──
    static let heroTop = Color(red: 0.02, green: 0.28, blue: 0.36)
    static let heroBottom = Color(red: 0.05, green: 0.48, blue: 0.57)

    // ── البطاقات المميّزة/الملعب ──
    static let stadiumTop = Color(red: 0.02, green: 0.15, blue: 0.21)
    static let stadiumBottom = Color(red: 0.03, green: 0.24, blue: 0.32)
    static let pitchTop = Color(red: 0.04, green: 0.30, blue: 0.38)
    static let pitchBottom = Color(red: 0.03, green: 0.19, blue: 0.26)

    // ── أسطح/نصوص تكيّفية ──
    static let onDark = dyn((0.05, 0.12, 0.15, 1), (1, 1, 1, 1))
    static let onDarkDim = dyn((0.34, 0.44, 0.48, 1), (1, 1, 1, 0.62))
    static let card = dyn((1, 1, 1, 1), (1, 1, 1, 0.06))
    static let cardStroke = dyn((0.03, 0.40, 0.48, 0.12), (1, 1, 1, 0.10))
    static let cardShadow = dyn((0.03, 0.18, 0.22, 0.10), (0, 0, 0, 0))
    static let chipFill = dyn((0.08, 0.50, 0.58, 0.08), (1, 1, 1, 0.10))

    static var sectionBackground: LinearGradient {
        LinearGradient(
            colors: [
                dyn((0.90, 0.97, 0.98, 1), (0.02, 0.11, 0.15, 1)),
                dyn((0.93, 0.98, 0.99, 1), (0.03, 0.15, 0.20, 1)),
                dyn((0.90, 0.97, 0.98, 1), (0.02, 0.11, 0.15, 1)),
            ],
            startPoint: .top, endPoint: .bottom
        )
    }
}

extension View {
    /// سطح بطاقة مرتفع (نظير wcElevatedCard).
    func acElevatedCard(cornerRadius: CGFloat = 14) -> some View {
        self
            .background(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous).fill(AcTheme.card))
            .overlay(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous).stroke(AcTheme.cardStroke, lineWidth: 1))
            .shadow(color: AcTheme.cardShadow, radius: 6, y: 2)
    }
}

// MARK: - تنسيق التواريخ (توقيت الرياض، ميلادي، أرقام لاتينية) — نظير WCFormat

nonisolated enum AcFormat {
    static let timeRiyadh: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "ar_SA-u-ca-gregory-nu-latn")
        f.timeZone = TimeZone(identifier: "Asia/Riyadh")
        f.dateFormat = "h:mm a"
        return f
    }()

    static let dayRiyadh: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "ar_SA-u-ca-gregory-nu-latn")
        f.timeZone = TimeZone(identifier: "Asia/Riyadh")
        f.dateFormat = "EEEE، d MMMM"
        return f
    }()

    static func time(_ fixture: AcFixture) -> String {
        guard let d = fixture.kickoff else { return "" }
        return timeRiyadh.string(from: d)
    }

    static func day(_ fixture: AcFixture) -> String {
        guard let d = fixture.kickoff else { return "" }
        return dayRiyadh.string(from: d)
    }

    static func dayKey(_ iso: String) -> String { String(iso.prefix(10)) }

    static func todayKey() -> String {
        let riyadh = Date().addingTimeInterval(3 * 3600)
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone(identifier: "UTC")
        f.dateFormat = "yyyy-MM-dd"
        return f.string(from: riyadh)
    }

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

/// مسار التنقل لقسم كأس آسيا.
nonisolated struct AsianCupRoute: Hashable {}
