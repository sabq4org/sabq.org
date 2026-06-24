import Foundation

// نماذج بيانات البوابة الرياضية — مطابقة لـ DTOs الخادم في saudiLeagueService.ts
// (SplFixture / SplStandingRow / SplScorer / SplCompetitionMeta). الخادم يعيد
// الأسماء معرّبة. nonisolated لأن SWIFT_DEFAULT_ACTOR_ISOLATION=MainActor.

// MARK: - الكيانات الأساسية

nonisolated struct SpTeam: Decodable, Identifiable, Hashable {
    let id: Int
    let name: String
    let logo: String
    let winner: Bool?
}

nonisolated struct SpStatus: Decodable, Hashable {
    let code: String
    let label: String
    let elapsed: Int?
    let extra: Int?
    let live: Bool
    let finished: Bool
}

nonisolated struct SpScore: Decodable, Hashable {
    let home: Int?
    let away: Int?
}

nonisolated struct SpVenue: Decodable, Hashable {
    let name: String
    let city: String
}

// مباراة — تخدم مباريات البطولة (بلا competition) ولوحة اليوم/المباشر
// (SplLiveBoardItem = SplFixture + competition + competitionSlug) عبر جعل
// حقلَي البطولة اختياريين.
nonisolated struct SpFixture: Decodable, Identifiable, Hashable {
    let id: Int
    let date: String
    let timestamp: Int
    let status: SpStatus
    let round: String
    let venue: SpVenue
    let home: SpTeam
    let away: SpTeam
    let goals: SpScore
    let competition: String?
    let competitionSlug: String?

    var started: Bool { status.live || status.finished }
}

nonisolated struct SpStandingRow: Decodable, Identifiable, Hashable {
    let rank: Int
    let team: SpTeam
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

nonisolated struct SpScorer: Decodable, Identifiable, Hashable {
    let rank: Int
    let id: Int
    let name: String
    let photo: String
    let team: SpTeam
    let goals: Int
    let assists: Int
    let penalties: Int
    let matches: Int
}

// بطولة — listCompetitions الأساسية، تُثرى بـ logo/season/status عند توفّر المفتاح.
nonisolated struct SpCompetition: Decodable, Identifiable, Hashable {
    let slug: String
    let name: String
    let type: String        // "league" | "cup"
    let category: String    // "saudi" | "gulf" | "arab" | "european" | "world"
    let hasStandings: Bool
    let hasScorers: Bool
    let hasStats: Bool
    let logo: String?
    let season: Int?
    let status: String?     // "ongoing" | "upcoming" | "finished" | "unknown"
    var id: String { slug }
}

// MARK: - مغلفات الاستجابة

nonisolated struct SpCompetitionsResponse: Decodable {
    let configured: Bool
    let competitions: [SpCompetition]
}

nonisolated struct SpTodayResponse: Decodable {
    let configured: Bool
    let today: [SpFixture]
}

nonisolated struct SpLiveResponse: Decodable {
    let configured: Bool
    let live: [SpFixture]
}

nonisolated struct SpMatchesResponse: Decodable {
    let configured: Bool
    let live: [SpFixture]
    let today: [SpFixture]
    let upcoming: [SpFixture]
    let results: [SpFixture]
}

nonisolated struct SpStandingsResponse: Decodable {
    let configured: Bool
    let standings: [SpStandingRow]
}

nonisolated struct SpScorersResponse: Decodable {
    let configured: Bool
    let scorers: [SpScorer]
}

// MARK: - ثوابت

nonisolated enum SportsConstants {
    /// دوري روشن — البطولة الافتراضية والأبرز.
    static let defaultComp = "pro-league"

    /// ترتيب عرض فئات البطولات (السعودية أولًا).
    static let categoryOrder = ["saudi", "gulf", "arab", "european", "world"]

    static func categoryLabel(_ category: String) -> String {
        switch category {
        case "saudi": return "البطولات السعودية"
        case "gulf": return "البطولات الخليجية"
        case "arab": return "البطولات العربية"
        case "european": return "البطولات الأوروبية"
        case "world": return "بطولات عالمية"
        default: return "بطولات"
        }
    }
}

// MARK: - تنسيق التواريخ بالعربية (بتوقيت الرياض)

enum SpDateMath {
    private static let iso: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()
    private static let isoNoFrac: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f
    }()

    static func date(from s: String) -> Date? {
        iso.date(from: s) ?? isoNoFrac.date(from: s)
    }
}

enum SpFormat {
    private static let riyadh = TimeZone(identifier: "Asia/Riyadh")!

    private static func fmt(_ pattern: String) -> DateFormatter {
        let f = DateFormatter()
        f.timeZone = riyadh
        f.locale = Locale(identifier: "ar-SA")
        f.dateFormat = pattern
        return f
    }

    static func kickoffDay(_ iso: String?) -> String {
        guard let iso, let d = SpDateMath.date(from: iso) else { return "" }
        return fmt("EEEE d MMMM").string(from: d)
    }

    static func kickoffTime(_ iso: String?) -> String {
        guard let iso, let d = SpDateMath.date(from: iso) else { return "" }
        return fmt("HH:mm").string(from: d)
    }
}

// MARK: - نقاط الشبكة (كلها عامة عبر publicAPI — بلا مصادقة في v1)

extension APIClient {
    func fetchCompetitions(status: String? = nil, ignoreCache: Bool = false) async throws -> SpCompetitionsResponse {
        var query: [String: String] = [:]
        if let status { query["status"] = status }
        return try await get(SpCompetitionsResponse.self, path: "/sports/competitions",
                             query: query, ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI)
    }

    func fetchToday(date: String? = nil, ignoreCache: Bool = false) async throws -> SpTodayResponse {
        var query: [String: String] = [:]
        if let date { query["date"] = date }
        return try await get(SpTodayResponse.self, path: "/sports/today",
                             query: query, ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI)
    }

    func fetchLive(ignoreCache: Bool = false) async throws -> SpLiveResponse {
        try await get(SpLiveResponse.self, path: "/sports/live",
                      ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI)
    }

    func fetchMatches(comp: String, ignoreCache: Bool = false) async throws -> SpMatchesResponse {
        try await get(SpMatchesResponse.self, path: "/sports/\(comp)/matches",
                      ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI)
    }

    func fetchStandings(comp: String, ignoreCache: Bool = false) async throws -> SpStandingsResponse {
        try await get(SpStandingsResponse.self, path: "/sports/\(comp)/standings",
                      ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI)
    }

    func fetchScorers(comp: String, ignoreCache: Bool = false) async throws -> SpScorersResponse {
        try await get(SpScorersResponse.self, path: "/sports/\(comp)/scorers",
                      ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI)
    }
}
