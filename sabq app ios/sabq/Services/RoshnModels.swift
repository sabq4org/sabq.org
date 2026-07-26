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
        case rank, name, photo, team, goals, assists, yellow, red
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
    var minuteLabel: String { "\(minute ?? 0)'\(extra.map { "+\($0)" } ?? "")" }
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
        try await get(RsMatchBuckets.self, path: "/sports/pro-league/matches",
                      ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI)
    }

    func fetchRoshnStandings(ignoreCache: Bool = false) async throws -> [RsStandingRow] {
        try await get(RsStandingsResponse.self, path: "/sports/pro-league/standings",
                      ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI).standings
    }

    func fetchRoshnScorers(season: Int? = nil) async throws -> [RsScorer] {
        let suffix = season.map { "?season=\($0)" } ?? ""
        return try await get(RsScorersResponse.self, path: "/sports/pro-league/scorers\(suffix)",
                             apiRoot: URLConstants.publicAPI).scorers
    }

    func fetchRoshnAssists(season: Int? = nil) async throws -> [RsLeader] {
        let suffix = season.map { "?season=\($0)" } ?? ""
        return try await get(RsAssistsResponse.self, path: "/sports/pro-league/assists\(suffix)",
                             apiRoot: URLConstants.publicAPI).assists
    }

    func fetchRoshnCards(season: Int? = nil) async throws -> RsCards {
        let suffix = season.map { "?season=\($0)" } ?? ""
        return try await get(RsCards.self, path: "/sports/pro-league/cards\(suffix)",
                             apiRoot: URLConstants.publicAPI)
    }

    func fetchRoshnMatch(fixtureId: Int, ignoreCache: Bool = false) async throws -> RsMatchDetail {
        try await get(RsMatchDetail.self, path: "/sports/match/\(fixtureId)",
                      ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI)
    }

    func fetchRoshnMatchRatings(fixtureId: Int) async throws -> RsMatchRatings {
        try await get(RsMatchRatings.self, path: "/sports/match/\(fixtureId)/players",
                      apiRoot: URLConstants.publicAPI)
    }
}

// MARK: - هوية روشن البصرية — لوحة فاتحة منسّقة
//
// قرار المالك: تصميم فاتح غير داكن بألوان منسّقة. الأدوار الأربعة (نهج نظام
// كأس آسيا المعتمد): سماوي روشن أساسًا، زمردي الملعب ثانويًا، ذهبي للتتويج
// والسباقات، وحبر كحلي للنصوص — كلها على أرضيات بيضاء/سماوية ناعمة.

nonisolated enum RoshnTheme {
    /// السماوي الأساسي — هوية روشن (أزرار/روابط/إبراز).
    static let sky = Color(red: 0.02, green: 0.45, blue: 0.73)
    /// أرضية سماوية ناعمة (خلفيات بطاقات/شارات).
    static let skySoft = Color(red: 0.88, green: 0.95, blue: 0.99)
    /// زمردي الملعب — ثانوي (فوز/مؤشرات إيجابية).
    static let pitch = Color(red: 0.02, green: 0.55, blue: 0.38)
    static let pitchSoft = Color(red: 0.90, green: 0.97, blue: 0.93)
    /// ذهبي التتويج — الهدّافون واللقب والمراكز الأولى.
    static let gold = Color(red: 0.83, green: 0.55, blue: 0.05)
    static let goldSoft = Color(red: 0.99, green: 0.95, blue: 0.85)
    /// حبر كحلي للنصوص الأساسية، ورمادي مائل للزرقة للثانوية.
    static let ink = Color(red: 0.09, green: 0.16, blue: 0.25)
    static let inkSoft = Color(red: 0.42, green: 0.49, blue: 0.58)
    /// حدود وفواصل هادئة.
    static let line = Color(red: 0.89, green: 0.92, blue: 0.95)
    static let liveRed = Color(red: 0.90, green: 0.24, blue: 0.28)
    /// هبوط (المراكز الثلاثة الأخيرة في الترتيب).
    static let danger = Color(red: 0.86, green: 0.28, blue: 0.28)

    /// تدرّج بطاقة الشريط — فاتح صباحي: سماوي ناعم → أبيض → نسمة زمردية.
    static let stripGradient = LinearGradient(
        colors: [skySoft, .white, pitchSoft],
        startPoint: .topTrailing, endPoint: .bottomLeading
    )
}

// MARK: - تنسيق التوقيت (يعيد استخدام منسّقات كأس العالم — الرياض/ميلادي/لاتيني)

nonisolated enum RsFormat {
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
        "\(season)-\(String(season + 1).suffix(2))"
    }
}

/// مسار التنقل لمركز دوري روشن.
nonisolated struct RoshnRoute: Hashable {}
