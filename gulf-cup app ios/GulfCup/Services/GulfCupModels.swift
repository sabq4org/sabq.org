import Foundation

// نماذج بيانات «خليجي 27» — مطابقة لـ DTOs الخادم في gulfCupService.ts و gcPredictionsService.ts.

nonisolated struct GcTeam: Decodable, Identifiable, Hashable {
    let id: Int
    let name: String
    let logo: String
}

nonisolated struct GcStatus: Decodable, Hashable {
    let code: String
    let label: String
    let elapsed: Int?
    let live: Bool
    let finished: Bool
}

nonisolated struct GcScore: Decodable, Hashable { let home: Int?; let away: Int? }
nonisolated struct GcVenue: Decodable, Hashable { let name: String; let city: String }

nonisolated struct GcFixture: Decodable, Identifiable, Hashable {
    let id: Int
    let matchNo: Int?
    let date: String
    let timestamp: Int
    let status: GcStatus
    let round: String
    let roundEn: String
    let venue: GcVenue
    let home: GcTeam
    let away: GcTeam
    let goals: GcScore

    var involvesSaudi: Bool {
        home.id == GulfCupConstants.saudiTeamId || away.id == GulfCupConstants.saudiTeamId
    }

    var isKnockout: Bool {
        let r = roundEn.lowercased()
        return r.contains("semi") || r.contains("final") || round.contains("نصف") || round.contains("نهائي")
    }
}

nonisolated struct GcStandingRow: Decodable, Identifiable, Hashable {
    let rank: Int
    let team: GcTeam
    let played: Int
    let win: Int
    let draw: Int
    let lose: Int
    let goalsFor: Int
    let goalsAgainst: Int
    let goalsDiff: Int
    let points: Int
    var id: Int { team.id }
}

nonisolated struct GcGroup: Decodable, Identifiable, Hashable {
    let name: String
    let rows: [GcStandingRow]
    var id: String { name }
}

nonisolated struct GcOverview: Decodable, Hashable {
    let startsAt: String?
    let endsAt: String?
    let teamsCount: Int
    let groupsCount: Int
    let host: String
    let venues: [GcVenue]
    let started: Bool
    let saudi: GcSaudi
    let nextMatch: GcFixture?
}

nonisolated struct GcSaudi: Decodable, Hashable {
    let team: GcTeam?
    let group: String?
    let fixtures: [GcFixture]
}

private nonisolated struct GcTeamsResponse: Decodable { let teams: [GcTeam] }
private nonisolated struct GcFixturesResponse: Decodable { let fixtures: [GcFixture] }
private nonisolated struct GcStandingsResponse: Decodable { let groups: [GcGroup] }

// MARK: - التوقعات (gcPredictionsService)

nonisolated struct GcModelProbs: Decodable, Hashable {
    let home: Double
    let draw: Double
    let away: Double
}

nonisolated struct GcPredictionCrowd: Decodable, Hashable {
    let home: Int
    let draw: Int
    let away: Int
    let total: Int
}

nonisolated struct GcMyPrediction: Decodable, Hashable {
    let predHome: Int
    let predAway: Int
    let status: String
    let tier: String?
    let outcomeHit: Bool?
    let marginHit: Bool?
    let exactHit: Bool?
    let pointsAwarded: Int?
}

nonisolated struct GcMatchSettlement: Decodable, Hashable {
    let status: String
    let finalHome: Int?
    let finalAway: Int?
    let predictionsCount: Int
    let exactWinners: Int
    let marginWinners: Int
    let outcomeWinners: Int
    let poolBase: Int?
    let poolCarryIn: Int?
    let carryOut: Int?
}

nonisolated struct GcPredictableMatch: Decodable, Identifiable, Hashable {
    let fixture: GcFixture
    let locked: Bool
    let probs: GcModelProbs
    let crowd: GcPredictionCrowd
    let predictionsCount: Int
    let poolAvailable: Int
    let myPrediction: GcMyPrediction?
    let settlement: GcMatchSettlement?
    var id: Int { fixture.id }
}

nonisolated struct GcPredictionMeStats: Decodable, Hashable {
    let points: Int
    let correct: Int
    let exact: Int
    let played: Int
    let currentStreak: Int
    let badges: [String]?
}

nonisolated struct GcPredictionLeader: Decodable, Identifiable, Hashable {
    let rank: Int
    let userId: String
    let name: String
    let avatar: String?
    let totalPoints: Int
    let correctCount: Int
    let exactCount: Int
    let playedCount: Int
    let accuracy: Double
    var id: String { userId }
}

nonisolated struct GcPredictionsTodayResponse: Decodable, Hashable {
    let matches: [GcPredictableMatch]
    let me: GcPredictionMeStats?
    let jackpot: Int
}

private nonisolated struct GcPredictionsLeaderboardResponse: Decodable {
    let leaders: [GcPredictionLeader]
}

// توقعات طويلة المدى (البطل / الهدّاف)
nonisolated struct GcTeamLite: Decodable, Identifiable, Hashable {
    let id: Int
    let name: String
    let logo: String
}

nonisolated struct GcLongPools: Decodable, Hashable {
    let champion: Int
    let top_scorer: Int
}

nonisolated struct GcLongVote: Decodable, Hashable {
    let kind: String
    let teamId: Int?
    let n: Int
}

nonisolated struct GcLongMine: Decodable, Hashable {
    let kind: String
    let teamId: Int?
    let teamName: String?
    let playerName: String?
    let status: String
    let pointsAwarded: Int
}

nonisolated struct GcLongData: Decodable, Hashable {
    let teams: [GcTeamLite]
    let pools: GcLongPools
    let championVotes: [GcLongVote]
    let mine: [GcLongMine]
}

struct GcDayGroup: Identifiable {
    let key: String
    let label: String
    let items: [GcFixture]
    var id: String { key }
}

nonisolated enum GulfCupConstants {
    static let saudiTeamId = 23
    static let tournamentName = "خليجي 27"
    static let tournamentNameEn = "Arab Gulf Cup 27"
}

struct GcCountdown: Equatable {
    let days: Int
    let hours: Int
    let minutes: Int
    let seconds: Int
    let total: Double
    var isFinished: Bool { total <= 0 }
}

enum GcCountdownMath {
    static func to(iso: String?) -> GcCountdown {
        let target = iso.map { GcDateMath.date(from: $0)?.timeIntervalSinceNow ?? 0 } ?? 0
        let total = max(0, target)
        return GcCountdown(
            days: Int(total / 86_400),
            hours: Int((total.truncatingRemainder(dividingBy: 86_400)) / 3_600),
            minutes: Int((total.truncatingRemainder(dividingBy: 3_600)) / 60),
            seconds: Int(total.truncatingRemainder(dividingBy: 60)),
            total: total
        )
    }
}

enum GcDateMath {
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

enum GcFormat {
    private static let riyadh = TimeZone(identifier: "Asia/Riyadh")!
    private static let locale = Locale(identifier: "ar-SA@calendar=gregorian;numbers=latn")

    private static func formatter(_ pattern: String) -> DateFormatter {
        let f = DateFormatter()
        f.timeZone = riyadh
        f.locale = locale
        f.calendar = Calendar(identifier: .gregorian)
        f.dateFormat = pattern
        return f
    }

    static func kickoffDay(_ iso: String?) -> String {
        guard let iso, let d = GcDateMath.date(from: iso) else { return "" }
        return formatter("EEEE d MMMM").string(from: d)
    }

    static func kickoffTime(_ iso: String?) -> String {
        guard let iso, let d = GcDateMath.date(from: iso) else { return "" }
        return formatter("HH:mm").string(from: d)
    }

    static func dateRange(startIso: String?, endIso: String?) -> String {
        guard let startIso, let s = GcDateMath.date(from: startIso) else { return "" }
        let f = formatter("d MMMM yyyy")
        let start = f.string(from: s)
        guard let endIso, let e = GcDateMath.date(from: endIso) else { return start }
        let end = f.string(from: e)
        return start == end ? start : "\(start) — \(end)"
    }
}

enum GcFixtureMath {
    static func groupByDay(_ fixtures: [GcFixture]) -> [GcDayGroup] {
        var map: [String: [GcFixture]] = [:]
        for f in fixtures {
            let key = String(f.date.prefix(10))
            map[key, default: []].append(f)
        }
        return map.keys.sorted().map { key in
            let items = (map[key] ?? []).sorted { a, b in
                let sa = a.involvesSaudi ? 0 : 1
                let sb = b.involvesSaudi ? 0 : 1
                return sa != sb ? sa < sb : a.timestamp < b.timestamp
            }
            return GcDayGroup(key: key, label: GcFormat.kickoffDay(items.first?.date), items: items)
        }
    }

    static func knockout(from fixtures: [GcFixture]) -> [GcFixture] {
        fixtures.filter(\.isKnockout).sorted { $0.timestamp < $1.timestamp }
    }
}

extension APIClient {
    func fetchGcOverview(ignoreCache: Bool = false) async throws -> GcOverview {
        try await get(GcOverview.self, path: "/gulf-cup/overview", ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI)
    }

    func fetchGcTeams(ignoreCache: Bool = false) async throws -> [GcTeam] {
        let r = try await get(GcTeamsResponse.self, path: "/gulf-cup/teams", ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI)
        return r.teams
    }

    func fetchGcFixtures(ignoreCache: Bool = false) async throws -> [GcFixture] {
        let r = try await get(GcFixturesResponse.self, path: "/gulf-cup/fixtures", ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI)
        return r.fixtures
    }

    func fetchGcStandings(ignoreCache: Bool = false) async throws -> [GcGroup] {
        let r = try await get(GcStandingsResponse.self, path: "/gulf-cup/standings", ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI)
        return r.groups
    }

    func fetchGcPredictionsToday(ignoreCache: Bool = false) async throws -> GcPredictionsTodayResponse {
        try await get(GcPredictionsTodayResponse.self, path: "/gulf-cup/predictions/today", ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI)
    }

    func fetchGcPredictionsLeaderboard(ignoreCache: Bool = false) async throws -> [GcPredictionLeader] {
        let r = try await get(GcPredictionsLeaderboardResponse.self, path: "/gulf-cup/predictions/leaderboard", ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI)
        return r.leaders
    }

    func fetchGcLongPredictions(ignoreCache: Bool = false) async throws -> GcLongData {
        try await get(GcLongData.self, path: "/gulf-cup/predictions/long", ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI)
    }
}
