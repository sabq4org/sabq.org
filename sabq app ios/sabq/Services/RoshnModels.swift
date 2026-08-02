import Foundation
import SwiftUI

// MARK: - دوري روشن السعودي — DTOs
//
// مرآة لما ترسله /api/rsl/hero (تركيبة البانر بحالات الموسم) ونقاط
// /api/sports/pro-league/* العامة (مباريات/ترتيب/هدّافون) ونقاط
// /api/sports/match/:id (مركز المباراة) — كلها من saudiLeagueService نفسه
// الذي يخدم كأس الملك، فالأشكال شقيقة لأشكال Kc* مع إضافات الدوري
// (جدول ترتيب كامل بالنقاط والفورمة).

nonisolated struct RsTeam: Decodable, Identifiable, Hashable {
    let id: Int
    let name: String
    let logo: String
    let winner: Bool?
}

nonisolated struct RsStatus: Decodable, Hashable {
    let code: String
    let label: String
    let elapsed: Int?
    let extra: Int?
    let live: Bool
    let finished: Bool
}

nonisolated struct RsScore: Decodable, Hashable {
    let home: Int?
    let away: Int?
}

nonisolated struct RsVenue: Decodable, Hashable {
    let name: String
    let city: String
}

nonisolated struct RsFixture: Decodable, Identifiable, Hashable {
    let id: Int
    let date: String
    let timestamp: Int
    let status: RsStatus
    let round: String
    let venue: RsVenue
    let home: RsTeam
    let away: RsTeam
    let goals: RsScore
    let penalties: RsScore?

    var started: Bool { status.live || status.finished }
    var kickoff: Date? { SabqFormatters.parseISO8601(date) }
}

// MARK: حالة الموسم (hero → outlook)

nonisolated struct RsChampion: Decodable, Hashable {
    let id: Int
    let name: String
    let logo: String
}

nonisolated struct RsOutlook: Decodable, Hashable {
    /// in-season · pre-season · off-season · unknown
    let phase: String
    let season: Int
    let status: String
    let start: String?
    let end: String?
    let champion: RsChampion?
    let nextSeason: Int?
    let nextSeasonStart: String?
    /// بالمللي ثانية (خلاف بقية الأختام) — انظر firstKickoffTs.
    let firstKickoff: Int?
    let daysUntilKickoff: Int?
    let openers: [RsFixture]

    /// ختم أول انطلاقة بالثواني — للعدّادات.
    var firstKickoffTs: Int? { firstKickoff.map { $0 / 1000 } }
}

nonisolated struct RsMatchday: Decodable, Hashable {
    let count: Int
    let round: String?
    let date: String
    let nextKickoffTs: Int?
    let sameKickoff: Bool
    let liveCount: Int
    let finishedCount: Int
}

nonisolated struct RsTopScorerLegacy: Decodable, Hashable {
    let id: Int
    let name: String
    let photo: String
    let team: RsTeam
    let goals: Int
}

nonisolated struct RsLastSeason: Decodable, Hashable {
    let previousSeason: Int?
    let champion: RsChampion?
    let topScorer: RsTopScorerLegacy?
}

/// استجابة /api/rsl/hero — تركيبة البانر والمركز بحالات الموسم الأربع.
nonisolated struct RsHero: Decodable, Hashable {
    let outlook: RsOutlook
    let live: [RsFixture]
    let today: [RsFixture]
    let nextMatch: RsFixture?
    let matchday: RsMatchday?
    let lastSeason: RsLastSeason?
    /// يخفي بلوك الواجهة فقط — يُضبط من لوحة التحكم (نفس مفتاح الويب).
    let blockHidden: Bool
    let predictionsEnabled: Bool
    let updatedAt: String

    var inSeason: Bool { outlook.phase == "in-season" }
    var preSeason: Bool { outlook.phase == "pre-season" }
}

// MARK: الترتيب والسباقات (/api/sports/pro-league/*)

nonisolated struct RsStandingRow: Decodable, Identifiable, Hashable {
    let rank: Int
    let team: RsTeam
    let played: Int
    let win: Int
    let draw: Int
    let lose: Int
    let goalsFor: Int
    let goalsAgainst: Int
    let goalsDiff: Int
    let points: Int
    /// سلسلة WDL بالإنجليزية من المزوّد (الأحدث أولًا).
    let form: String?
    let trend: String?
    let live: Bool?

    var id: Int { team.id }
}

nonisolated struct RsScorer: Decodable, Identifiable, Hashable {
    let rank: Int
    let playerId: Int?
    let name: String
    let photo: String
    let team: RsTeam
    let goals: Int
    let assists: Int
    let penalties: Int
    let matches: Int

    var id: String { "\(rank)-\(name)" }

    private enum CodingKeys: String, CodingKey {
        case playerId = "id"
        case rank, name, photo, team, goals, assists, penalties, matches
    }
}

nonisolated struct RsLeader: Decodable, Identifiable, Hashable {
    let rank: Int
    let playerId: Int?
    let name: String
    let photo: String
    let team: RsTeam
    let goals: Int?
    let assists: Int?
    let yellow: Int?
    let red: Int?

    var id: String { "\(rank)-\(name)" }

    private enum CodingKeys: String, CodingKey {
        case playerId = "id"
        case rank, name, photo, team, teamLogo, goals, assists, yellow, red
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        rank = try c.decode(Int.self, forKey: .rank)
        playerId = try c.decodeIfPresent(Int.self, forKey: .playerId)
        name = try c.decode(String.self, forKey: .name)
        photo = try c.decodeIfPresent(String.self, forKey: .photo) ?? ""
        goals = try c.decodeIfPresent(Int.self, forKey: .goals)
        assists = try c.decodeIfPresent(Int.self, forKey: .assists)
        yellow = try c.decodeIfPresent(Int.self, forKey: .yellow)
        red = try c.decodeIfPresent(Int.self, forKey: .red)

        if let object = try? c.decode(RsTeam.self, forKey: .team) {
            team = object
        } else {
            // عقد البطاقات التاريخي يعيد team كنص وteamLogo منفصلًا، بينما
            // الهدافون والصناعة يعيدانه ككائن. نطبّع الشكلين لواجهة واحدة.
            let teamName = try c.decodeIfPresent(String.self, forKey: .team) ?? ""
            let logo = try c.decodeIfPresent(String.self, forKey: .teamLogo) ?? ""
            team = RsTeam(id: 0, name: teamName, logo: logo, winner: nil)
        }
    }
}

nonisolated struct RsCards: Decodable, Hashable {
    let yellow: [RsLeader]
    let red: [RsLeader]
}

/// دلاء /api/sports/pro-league/matches الجاهزة — نفس تقسيم الويب.
nonisolated struct RsMatchBuckets: Decodable, Hashable {
    let live: [RsFixture]
    let today: [RsFixture]
    let upcoming: [RsFixture]
    let results: [RsFixture]
}

// MARK: متصفّح الجولات (/api/sports/pro-league/rounds + /round?name=<key>)
//
// المفتاح التقني للجولة إنجليزي ("Regular Season - 1") بينما label عربي
// للعرض ("الجولة 1")؛ مباريات الجولة تُطلب بالمفتاح لا بالتسمية.

nonisolated struct RsRound: Decodable, Identifiable, Hashable {
    let key: String
    let label: String
    var id: String { key }
}

nonisolated struct RsRoundsResponse: Decodable {
    let configured: Bool?
    let rounds: [RsRound]
    /// مفتاح الجولة الحالية (أو أقرب قادمة قبل الموسم) — قد يغيب خارج الدوريات.
    let current: String?
}

nonisolated struct RsRoundFixturesResponse: Decodable {
    let configured: Bool?
    let fixtures: [RsFixture]
}

// MARK: مركز المباراة (/api/sports/match/:id — نفس شكل كأس الملك)

nonisolated struct RsMatchEvent: Decodable, Identifiable, Hashable {
    let minute: Int?
    let extra: Int?
    let teamId: Int
    let team: String
    let player: String
    let assist: String?
    let type: String
    let label: String

    var id: String { "\(minute ?? 0)-\(extra ?? 0)-\(type)-\(player)" }
    var minuteLabel: String {
        let base = RsFormat.latin(minute ?? 0)
        let added = extra.map { "+\(RsFormat.latin($0))" } ?? ""
        return "\(base)\(added)'"
    }
}

/// صفّ إحصائي — home/away قد تصل نصًّا أو رقمًا أو null، فنطبّعها لنصّ عرض.
nonisolated struct RsStatRow: Decodable, Identifiable, Hashable {
    let type: String
    let label: String
    let homeText: String
    let awayText: String

    var id: String { type }

    private enum CodingKeys: String, CodingKey { case type, label, home, away }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        type = try c.decode(String.self, forKey: .type)
        label = try c.decode(String.self, forKey: .label)
        homeText = Self.text(c, .home)
        awayText = Self.text(c, .away)
    }

    private static func text(_ c: KeyedDecodingContainer<CodingKeys>, _ key: CodingKeys) -> String {
        if let s = try? c.decode(String.self, forKey: key) { return s }
        if let i = try? c.decode(Int.self, forKey: key) { return String(i) }
        if let d = try? c.decode(Double.self, forKey: key) {
            return d == d.rounded() ? String(Int(d)) : String(format: "%.1f", d)
        }
        return "-"
    }
}

nonisolated struct RsStatSide: Decodable, Hashable {
    let id: Int
    let name: String
}

nonisolated struct RsStatistics: Decodable, Hashable {
    let home: RsStatSide
    let away: RsStatSide
    let rows: [RsStatRow]
}

nonisolated struct RsLineupPlayer: Decodable, Identifiable, Hashable {
    let id: Int
    let number: Int?
    let name: String
    let pos: String
    let grid: String?
}

nonisolated struct RsLineupTeam: Decodable, Hashable {
    let id: Int
    let name: String
    let logo: String
}

nonisolated struct RsLineup: Decodable, Identifiable, Hashable {
    let team: RsLineupTeam
    let formation: String?
    let coach: String?
    let startXI: [RsLineupPlayer]
    let substitutes: [RsLineupPlayer]

    var id: Int { team.id }
}

nonisolated struct RsMatchDetail: Decodable, Hashable {
    let fixture: RsFixture
    let events: [RsMatchEvent]
    let statistics: RsStatistics?
    let lineups: [RsLineup]
    let leagueId: Int?
}

// MARK: تقييمات اللاعبين (/api/sports/match/:id/players)

nonisolated struct RsRatedPlayer: Decodable, Identifiable, Hashable {
    let id: Int
    let name: String
    let photo: String
    let teamId: Int
    let team: String
    let number: Int?
    let pos: String
    let rating: Double?
    let minutes: Int
    let goals: Int
    let assists: Int
    let yellow: Int
    let red: Int
    let captain: Bool
}

nonisolated struct RsMotm: Decodable, Hashable {
    let id: Int
    let name: String
    let team: String
    let rating: Double
}

nonisolated struct RsMatchRatings: Decodable, Hashable {
    let motm: RsMotm?
    let players: [RsRatedPlayer]
}

// MARK: صفحة النادي المتكاملة (/api/sports/team/:id?with=stats)

nonisolated struct RsTeamVenue: Decodable, Hashable {
    let name: String
    let city: String
    let capacity: Int?
    let image: String?
}

nonisolated struct RsTeamInfo: Decodable, Hashable {
    let id: Int
    let name: String
    let logo: String
    let country: String?
    let founded: Int?
    let venue: RsTeamVenue?
}

nonisolated struct RsSquadPlayer: Decodable, Identifiable, Hashable {
    let id: Int
    let name: String
    let number: Int?
    let position: String
    let positionEn: String
    let age: Int?
    let photo: String
}

nonisolated struct RsStatTriple: Decodable, Hashable {
    let total: Int
    let home: Int
    let away: Int
}

nonisolated struct RsTeamStatFixtures: Decodable, Hashable {
    let played: RsStatTriple
    let wins: RsStatTriple
    let draws: RsStatTriple
    let loses: RsStatTriple
}

nonisolated struct RsGoalSide: Decodable, Hashable {
    let total: Int
    let average: String?
}

nonisolated struct RsTeamStatGoals: Decodable, Hashable {
    let `for`: RsGoalSide
    let against: RsGoalSide
}

nonisolated struct RsTeamCards: Decodable, Hashable {
    let yellowTotal: Int
    let redTotal: Int
}

nonisolated struct RsTeamStatSummary: Decodable, Hashable {
    let cleanSheets: RsStatTriple
    let failedToScore: RsStatTriple
    let cards: RsTeamCards
    let mostUsedFormation: String?
}

nonisolated struct RsTeamStatBiggest: Decodable, Hashable {
    let winsHome: String?
    let winsAway: String?
    let losesHome: String?
    let losesAway: String?
    let streakWin: Int?
    let streakLose: Int?
    let streakDraw: Int?
}

nonisolated struct RsTeamStats: Decodable, Hashable {
    let leagueId: Int?
    let season: Int?
    let fixtures: RsTeamStatFixtures
    let goals: RsTeamStatGoals
    let summary: RsTeamStatSummary
    let biggest: RsTeamStatBiggest?
}

nonisolated struct RsCoachCareer: Decodable, Hashable {
    let team: String
    let start: String?
    let end: String?
}

nonisolated struct RsCoach: Decodable, Hashable {
    let id: Int
    let name: String
    let photo: String
    let nationality: String
    let age: Int?
    let startDate: String?
    let career: [RsCoachCareer]
}

nonisolated struct RsTeamScorer: Decodable, Identifiable, Hashable {
    let rank: Int
    let id: Int
    let name: String
    let photo: String
    let goals: Int
    let assists: Int
    let penalties: Int
    let matches: Int
}

nonisolated struct RsTeamProfile: Decodable {
    let team: RsTeamInfo
    let standing: RsStandingRow?
    let competitionSlug: String?
    let competitionName: String?
    let fixtures: [RsFixture]
    let squad: [RsSquadPlayer]
    let stats: RsTeamStats?
    let coach: RsCoach?
    let topScorers: [RsTeamScorer]
}

// MARK: أغلفة الاستجابات

nonisolated struct RsStandingsResponse: Decodable { let standings: [RsStandingRow] }
nonisolated struct RsScorersResponse: Decodable { let scorers: [RsScorer] }
nonisolated struct RsAssistsResponse: Decodable { let assists: [RsLeader] }

// MARK: - APIClient — Roshn reads
//
// كل النقاط عامة (لا مصادقة) عبر apiRoot=publicAPI — كاش الخادم (SWR) يخدم
// آلاف الزوار من طلب واحد، فلا كاش محليًا غير افتراضي URLSession.

extension APIClient {
    func fetchRoshnHero(ignoreCache: Bool = false) async throws -> RsHero {
        try await get(RsHero.self, path: "/rsl/hero",
                      ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI)
    }

    func fetchRoshnMatches(ignoreCache: Bool = false) async throws -> RsMatchBuckets {
        try await roshnGet(RsMatchBuckets.self, path: "/sports/pro-league/matches",
                           ignoreCache: ignoreCache)
    }

    func fetchRoshnRounds(ignoreCache: Bool = false) async throws -> RsRoundsResponse {
        try await roshnGet(RsRoundsResponse.self, path: "/sports/pro-league/rounds",
                           ignoreCache: ignoreCache)
    }

    /// مباريات جولة واحدة — `key` هو المفتاح التقني القادم من /rounds لا التسمية العربية.
    func fetchRoshnRoundFixtures(key: String, ignoreCache: Bool = false) async throws -> [RsFixture] {
        try await roshnGet(RsRoundFixturesResponse.self, path: "/sports/pro-league/round",
                           query: ["name": key], ignoreCache: ignoreCache).fixtures
    }

    func fetchRoshnStandings(ignoreCache: Bool = false) async throws -> [RsStandingRow] {
        try await roshnGet(RsStandingsResponse.self, path: "/sports/pro-league/standings",
                           ignoreCache: ignoreCache).standings
    }

    func fetchRoshnScorers(season: Int? = nil, ignoreCache: Bool = false) async throws -> [RsScorer] {
        let query = season.map { ["season": String($0)] } ?? [:]
        return try await roshnGet(RsScorersResponse.self, path: "/sports/pro-league/scorers",
                                  query: query, ignoreCache: ignoreCache).scorers
    }

    func fetchRoshnAssists(season: Int? = nil, ignoreCache: Bool = false) async throws -> [RsLeader] {
        let query = season.map { ["season": String($0)] } ?? [:]
        return try await roshnGet(RsAssistsResponse.self, path: "/sports/pro-league/assists",
                                  query: query, ignoreCache: ignoreCache).assists
    }

    func fetchRoshnCards(season: Int? = nil, ignoreCache: Bool = false) async throws -> RsCards {
        let query = season.map { ["season": String($0)] } ?? [:]
        return try await roshnGet(RsCards.self, path: "/sports/pro-league/cards",
                                  query: query, ignoreCache: ignoreCache)
    }

    func fetchRoshnMatch(fixtureId: Int, ignoreCache: Bool = false) async throws -> RsMatchDetail {
        try await roshnGet(RsMatchDetail.self, path: "/sports/match/\(fixtureId)",
                           ignoreCache: ignoreCache)
    }

    func fetchRoshnMatchRatings(fixtureId: Int, ignoreCache: Bool = false) async throws -> RsMatchRatings {
        try await roshnGet(RsMatchRatings.self, path: "/sports/match/\(fixtureId)/players",
                           ignoreCache: ignoreCache)
    }

    func fetchRoshnTeamProfile(teamId: Int, ignoreCache: Bool = false) async throws -> RsTeamProfile {
        try await roshnGet(RsTeamProfile.self, path: "/sports/team/\(teamId)",
                           query: ["with": "stats"], ignoreCache: ignoreCache)
    }

    /// نقاط الرياضة قد تعيد 503 لثوانٍ بينما يكمل الخادم تسخين SWR في
    /// الخلفية. الويب يعيد الطلب تلقائيًا عبر TanStack Query؛ هذا الجسر يمنح
    /// iOS السلوك نفسه بمحاولة واحدة مؤجلة بدل تحويل الاستجابة المؤقتة إلى
    /// قائمة فارغة دائمة.
    private func roshnGet<T: Decodable>(
        _ type: T.Type,
        path: String,
        query: [String: String] = [:],
        ignoreCache: Bool = false
    ) async throws -> T {
        var lastError: Error?
        for attempt in 0..<2 {
            do {
                return try await get(
                    type,
                    path: path,
                    query: query,
                    ignoreCache: ignoreCache || attempt > 0,
                    apiRoot: URLConstants.publicAPI
                )
            } catch {
                lastError = error
                guard attempt == 0, Self.isRoshnRetryable(error) else { throw error }
                try? await Task.sleep(nanoseconds: 2_000_000_000)
                if Task.isCancelled { throw CancellationError() }
            }
        }
        throw lastError ?? APIError.noResponse
    }

    nonisolated private static func isRoshnRetryable(_ error: Error) -> Bool {
        if let url = error as? URLError {
            return [.timedOut, .networkConnectionLost, .cannotConnectToHost, .notConnectedToInternet]
                .contains(url.code)
        }
        guard let api = error as? APIError else { return false }
        switch api {
        case .serverError(let code): return code == 502 || code == 503 || code == 504
        case .rateLimited, .noResponse, .apiMessage: return true
        default: return false
        }
    }
}

// MARK: - هوية روشن البصرية — «أخضر الملعب» (2026-08-01)
//
// قرار المالك بعد رفض «صباح الملعب» (أبيض في أبيض بحدود رمادية): ألوان
// مسطّحة نقية بتشبّع متوسط — صفر تدرّجات، صفر حدود، ولا خلفيات قاتمة.
// اللون من أرض الملعب: زمردي مشبع للهيرو والنتائج والتفاعل، قماشة
// فستقية-رملية تُبرز البطاقات البيضاء بالظل الخفيف بدل الحدود، ذهب
// للتتويج والمراكز، وحبر داكن مخضرّ. الليلي يشتق نفس الروح على أسطح
// داكنة مخضرّة (userInterfaceStyle — نمط SabqTheme المعتمد).

nonisolated enum RoshnTheme {
    /// لون متكيف مع نمط الواجهة.
    private static func adaptive(
        light: (CGFloat, CGFloat, CGFloat),
        dark: (CGFloat, CGFloat, CGFloat)
    ) -> Color {
        Color(UIColor { t in
            let c = t.userInterfaceStyle == .dark ? dark : light
            return UIColor(red: c.0, green: c.1, blue: c.2, alpha: 1)
        })
    }

    /// الزمردي الأساسي — هوية روشن (هيرو/تفاعل/نتائج). كان سماويًا في
    /// «صباح الملعب»؛ الاسم بقي لتقليل تغيّر مواضع الاستدعاء.
    static let sky = adaptive(light: (0.12, 0.62, 0.39), dark: (0.18, 0.71, 0.47))
    /// أرضية زمردية ناعمة (خلفيات شارات/أقراص أرقام).
    static let skySoft = adaptive(light: (0.89, 0.95, 0.91), dark: (0.09, 0.15, 0.11))
    /// زمردي أعمق للمؤشرات الإيجابية (فارق أهداف/أهداف الفريق).
    static let pitch = adaptive(light: (0.09, 0.48, 0.30), dark: (0.25, 0.64, 0.43))
    static let pitchSoft = adaptive(light: (0.89, 0.95, 0.91), dark: (0.09, 0.15, 0.11))
    /// ذهبي التتويج والمراكز الأولى.
    static let gold = adaptive(light: (0.85, 0.66, 0.25), dark: (0.88, 0.71, 0.33))
    static let goldSoft = adaptive(light: (0.97, 0.93, 0.85), dark: (0.17, 0.14, 0.07))
    /// حبر داكن مخضرّ للنصوص الأساسية، ورمادي مخضرّ للثانوية.
    static let ink = adaptive(light: (0.08, 0.16, 0.13), dark: (0.91, 0.94, 0.91))
    static let inkSoft = adaptive(light: (0.36, 0.44, 0.40), dark: (0.58, 0.64, 0.60))
    /// فواصل نادرة الاستخدام — الهوية بلا حدود؛ يبقى للحالات الاضطرارية.
    static let line = adaptive(light: (0.89, 0.90, 0.85), dark: (0.15, 0.19, 0.16))
    static let liveRed = Color(red: 0.82, green: 0.31, blue: 0.31)
    /// هبوط (المراكز الثلاثة الأخيرة في الترتيب).
    static let danger = Color(red: 0.82, green: 0.31, blue: 0.31)
    /// حبر داكن للإبراز (قرص النتيجة/شارات) — نفس عائلة ink الفاتح.
    static let navy = Color(red: 0.08, green: 0.16, blue: 0.13)
    static let navyDeep = Color(red: 0.05, green: 0.11, blue: 0.09)
    /// القماشة الفستقية-الرملية — ليست بيضاء عمدًا كي تتمايز البطاقات بلا حدود.
    static let canvas = adaptive(light: (0.94, 0.94, 0.90), dark: (0.07, 0.09, 0.07))
    static let card = adaptive(light: (1.00, 1.00, 1.00), dark: (0.11, 0.14, 0.11))

    /// الهيرو صار زمرديًا صلبًا — النص عليه أبيض دائمًا في النمطين.
    static let heroOn = Color.white
    static let heroOnSoft = Color.white.opacity(0.85)

    /// شارة فوق الهيرو الزمردي (عدّاد/مقاييس/حالات) — بيضاء شفافة.
    static let heroChip = Color.white.opacity(0.16)

    /// سطح الهيرو (المركز/النادي/المباراة) — زمردي مسطّح، لا تدرّج.
    static let hero = sky

    /// ظل البطاقات الموحّد — بديل الحدود على القماشة الفستقية.
    static let cardShadow = Color(red: 0.08, green: 0.24, blue: 0.16).opacity(0.10)
}

// MARK: - تنسيق التوقيت (يعيد استخدام منسّقات كأس العالم — الرياض/ميلادي/لاتيني)

nonisolated enum RsFormat {
    static let latinLocale = Locale(identifier: "ar_SA-u-ca-gregory-nu-latn")

    static func time(_ fixture: RsFixture) -> String {
        guard let d = fixture.kickoff else { return "" }
        return WCFormat.timeRiyadh.string(from: d)
    }

    static func day(_ fixture: RsFixture) -> String {
        guard let d = fixture.kickoff else { return "" }
        return WCFormat.dayRiyadh.string(from: d)
    }

    static func day(iso: String) -> String {
        guard let d = SabqFormatters.parseISO8601(iso) else { return "" }
        return WCFormat.dayRiyadh.string(from: d)
    }

    static func time(timestamp: Int) -> String {
        WCFormat.timeRiyadh.string(from: Date(timeIntervalSince1970: TimeInterval(timestamp)))
    }

    /// «2026-27» — الدوري يُوسم بموسم مزدوج.
    static func seasonLabel(_ season: Int) -> String {
        "\(latin(season))-\(String(latin(season + 1)).suffix(2))"
    }

    static func latin(_ value: Int) -> String {
        String(value)
    }

    /// يعزل رقمًا لاتينيًا داخل جملة RTL حتى لا ينقلب موسم `2026-27`
    /// بصريًا إلى `27-2026`.
    static func isolatedLatin(_ value: String) -> String {
        "\u{2066}\(value)\u{2069}"
    }

    static func latinDecimal(_ value: Double, digits: Int = 1) -> String {
        let formatter = NumberFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.numberStyle = .decimal
        formatter.minimumFractionDigits = digits
        formatter.maximumFractionDigits = digits
        return formatter.string(from: NSNumber(value: value)) ?? String(format: "%.*f", digits, value)
    }
}

// MARK: - توقعات روشن — المنصة المركزية (/api/v1/predictions/*)
//
// نفس عقود predictions-core التي يستهلكها أندرويد (PredictionModels.kt)
// وVARA — لا محرك خاص بالبطولة (predictions-core/SYSTEM.md). المصادقة
// Bearer تلقائيًا عبر APIClient؛ القراءة متاحة بلا جلسة وmyEntry يغيب.

nonisolated struct PredTeamMeta: Decodable, Hashable {
    let name: String?
    let logo: String?
}

nonisolated struct PredContestMeta: Decodable, Hashable {
    let home: PredTeamMeta?
    let away: PredTeamMeta?
    let round: String?
    let venue: String?
}

nonisolated struct PredScorePayload: Codable, Hashable {
    let predHome: Int?
    let predAway: Int?
}

nonisolated struct PredMyEntry: Decodable, Hashable {
    let id: String
    let payload: PredScorePayload?
}

nonisolated struct PredScoreResult: Decodable, Hashable {
    let finalHome: Int?
    let finalAway: Int?
}

nonisolated struct PredContest: Decodable, Identifiable, Hashable {
    let id: String
    let contestType: String
    /// open | locked | ready | settled | void
    let status: String
    let locksAt: String
    let metadata: PredContestMeta?
    let result: PredScoreResult?
    /// عدد المشاركين النشطين — رقم فقط بلا أسماء (عقد #1326).
    let entriesCount: Int?
    let myEntry: PredMyEntry?

    var isMatchScore: Bool { contestType == "match_score" }
    var isOpen: Bool { status == "open" }
    var locksAtDate: Date? { SabqFormatters.parseISO8601(locksAt) }
}

nonisolated struct PredCompetitionSummary: Decodable, Hashable {
    let slug: String
    let nameAr: String?
    let openContests: Int?
    let myPoints: Int?
}

nonisolated struct PredCompetitionsResponse: Decodable {
    let competitions: [PredCompetitionSummary]
}

nonisolated struct PredCompetitionDetailResponse: Decodable {
    let contests: [PredContest]
}

nonisolated struct PredLeaderEntry: Decodable, Identifiable, Hashable {
    let rank: Int
    let userId: String
    let name: String
    let profileImageUrl: String?
    let points: Int
    let exactCount: Int?

    var id: String { userId }
}

nonisolated struct PredMyRank: Decodable, Hashable {
    let rank: Int
    let points: Int
}

nonisolated struct PredLeaderboardResponse: Decodable {
    let entries: [PredLeaderEntry]
    let myRank: PredMyRank?
}

/// تفكيك التسوية داخل سطر الدفتر — الخادم يرسل النتيجة والتوقع نصًا
/// بصيغة "home-away" (المضيف أولًا)؛ نفكّهما لرقمين ولا نعرض النص الخام
/// أبدًا (سلاسل LTR داخل جملة عربية تنقلب بصريًا).
nonisolated struct PredLedgerBreakdown: Decodable, Hashable {
    let prediction: String?
    let finalScore: String?

    static func parse(_ raw: String?) -> (home: Int, away: Int)? {
        guard let raw else { return nil }
        let parts = raw.split(separator: "-").compactMap { Int($0.trimmingCharacters(in: .whitespaces)) }
        guard parts.count == 2 else { return nil }
        return (parts[0], parts[1])
    }

    var finalPair: (home: Int, away: Int)? { Self.parse(finalScore) }
    var predictionPair: (home: Int, away: Int)? { Self.parse(prediction) }
}

/// سطر دفتر النقاط — «سجلّي»: نقاط كل تسوية بسببها العربي وتاريخها،
/// مع معرّف المباراة وتفكيكها لعرض النتيجة والتوقع.
nonisolated struct PredLedgerItem: Decodable, Identifiable, Hashable {
    let id: String
    let contestId: String?
    let points: Int
    let reasonCode: String
    let reasonLabelAr: String
    let createdAt: String
    let breakdown: PredLedgerBreakdown?

    var createdAtDate: Date? { SabqFormatters.parseISO8601(createdAt) }
}

nonisolated struct PredLedgerResponse: Decodable {
    let items: [PredLedgerItem]
    let nextCursor: String?
}

nonisolated struct PredRuleTiers: Decodable, Hashable {
    let exact: Double?
    let signedMargin: Double?
    let outcome: Double?
}

nonisolated struct PredRuleParams: Decodable, Hashable {
    let basePool: Int?
    let tiers: PredRuleTiers?
    let winCriterion: String?
}

/// ملف الاحتساب الفعّال للمسابقة — نص «طريقة التوقعات» يُولَّد منه لا من
/// نص ثابت يتقادم. الصياغة بكلمة «جائزة» (قاعدة المالك: ممنوع «بركة»).
nonisolated struct PredRule: Decodable, Hashable {
    let strategyKey: String
    let version: Int?
    let params: PredRuleParams?

    var summaryAr: String {
        guard let p = params else { return "تُحتسب النقاط بعد صافرة النهاية" }
        switch strategyKey {
        case "tiered_pool":
            let exact = Int((p.tiers?.exact ?? 0) * 100)
            let margin = Int((p.tiers?.signedMargin ?? 0) * 100)
            let outcome = Int((p.tiers?.outcome ?? 0) * 100)
            return "جائزة المباراة \(p.basePool ?? 0) نقطة: \(exact)٪ للنتيجة الدقيقة، و\(margin)٪ للفارق الصحيح، و\(outcome)٪ للاتجاه — وما لا يُوزَّع يتراكم للمباراة التالية"
        case "shared_pool":
            return p.winCriterion == "exact"
                ? "جائزة \(p.basePool ?? 0) نقطة تُقسم بالتساوي على أصحاب النتيجة الدقيقة"
                : "جائزة \(p.basePool ?? 0) نقطة تُقسم بالتساوي على من أصابوا اتجاه المباراة"
        case "skill_weighted":
            return "نقاط مهارية: دقة توقّعك × جرأته × سلسلة إصاباتك"
        case "fixed_points":
            return "نقاط ثابتة حسب دقة التوقّع"
        default:
            return "تُحتسب النقاط بعد صافرة النهاية"
        }
    }
}

nonisolated struct PredContestDetailResponse: Decodable {
    let rule: PredRule?
}

nonisolated struct PredEntryBody: Encodable {
    let prediction: PredScorePayload
}

nonisolated struct PredEntrySaveResponse: Decodable {
    nonisolated struct Entry: Decodable { let id: String }
    let entry: Entry
}

extension APIClient {
    func fetchPredCompetitions() async throws -> [PredCompetitionSummary] {
        try await get(PredCompetitionsResponse.self, path: "/predictions/competitions").competitions
    }

    func fetchPredContests(slug: String, ignoreCache: Bool = false) async throws -> [PredContest] {
        try await get(
            PredCompetitionDetailResponse.self,
            path: "/predictions/competitions/\(slug)",
            ignoreCache: ignoreCache
        ).contests
    }

    func fetchPredLeaderboard(slug: String, ignoreCache: Bool = false) async throws -> PredLeaderboardResponse {
        try await get(
            PredLeaderboardResponse.self,
            path: "/predictions/leaderboards",
            query: ["competition": slug],
            ignoreCache: ignoreCache
        )
    }

    /// دفتر نقاطي — يتطلب جلسة عضو (401 بلا Bearer).
    func fetchPredLedger(slug: String, ignoreCache: Bool = false) async throws -> [PredLedgerItem] {
        try await get(
            PredLedgerResponse.self,
            path: "/predictions/me/ledger",
            query: ["competition": slug],
            ignoreCache: ignoreCache
        ).items
    }

    func fetchPredContestRule(contestId: String) async throws -> PredRule? {
        try await get(PredContestDetailResponse.self, path: "/predictions/contests/\(contestId)").rule
    }

    func submitPredEntry(contestId: String, home: Int, away: Int) async throws -> PredEntrySaveResponse {
        try await put(
            PredEntrySaveResponse.self,
            path: "/predictions/contests/\(contestId)/entry",
            body: PredEntryBody(prediction: PredScorePayload(predHome: home, predAway: away))
        )
    }
}

/// مسار التنقل لمركز دوري روشن.
nonisolated struct RoshnRoute: Hashable {}

/// رابط مباشر لصفحة نادٍ من رابط الويب العام `/sports/team/:id`.
nonisolated struct RoshnTeamRoute: Hashable {
    let teamId: Int
}
